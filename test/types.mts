import cacheableResponse from '../index.js'
import Keyv from '@keyvhq/core'
import type {
  CacheProvider,
  CompressedEntry,
  GetOpts,
  Handler,
  HttpContext,
  InputParams,
  SetHeadersOptions
} from '../index.js'
import { createServer } from 'node:http'

type Data = { html: string }

const entry: CompressedEntry = { compressed: Buffer.from(''), ttl: 60_000, staleTtl: false }

const params: InputParams<GetOpts, {}, Data> = {
  compress: true,
  ttl: 60_000,
  get: async ({ req }) => ({ data: { html: `<p>${req.url}</p>` } }),
  send: ({ data, res }) => res.end(data.html)
}

const ssrCache: Handler = cacheableResponse(params)
const etag: string = ssrCache.getEtag({ html: '<p/>' })

createServer((req, res) => {
  const context: HttpContext = { req, res }
  return ssrCache(context)
})

const headers: SetHeadersOptions = {
  createdAt: Date.now(),
  etag,
  hasValue: true,
  isHit: true,
  isStale: false,
  res: {} as HttpContext['res'],
  staleTtl: false,
  ttl: 60_000
}
cacheableResponse.setHeaders(headers)

// @ts-expect-error the ETag serializer throws on undefined
ssrCache.getEtag(undefined)
console.log(entry)


// @ts-expect-error module.exports is the function itself, it has no `default` property
console.log(cacheableResponse.default)

const keyvCache = new Keyv({ namespace: 'ssr' })
const keyvOptions: CacheProvider = { namespace: 'ssr', store: new Map() }
cacheableResponse({ ...params, cache: keyvCache })
cacheableResponse({ ...params, cache: keyvOptions })
cacheableResponse<GetOpts, {}, Data>({ ...params, cache: keyvCache })

const plainCache = {
  get: async (key: string) => undefined,
  set: async (key: string, value: unknown, ttl: number) => true as const
}
// @ts-expect-error a plain `{ get, set }` object is passed to `new Keyv()` as options and never read from
cacheableResponse<GetOpts, {}, Data>({ ...params, cache: plainCache })

const sharedKeyv = new Keyv({ namespace: 'ssr' })
cacheableResponse({
  cache: sharedKeyv,
  get: async () => ({ data: { html: '<p/>' } }),
  // @ts-expect-error `data` is still inferred from `get` when `cache` is a `Keyv<any>`
  send: ({ data, res }) => res.end(data.htmll)
})

const adapterKeyv = new Keyv<undefined>({ namespace: 'ssr' })
cacheableResponse({ ...params, cache: adapterKeyv })

// @ts-expect-error `get` and `set` would replace Keyv methods, the object is still never read from
cacheableResponse<GetOpts, {}, Data>({ ...params, cache: { ttl: 60_000, ...plainCache } })
