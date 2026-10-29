import cacheableResponse from '../index.js'
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

type Provider = CacheProvider<{}, Data>
type StoredValue = Awaited<ReturnType<Provider['get']>>
const entry: StoredValue = { compressed: Buffer.from(''), ttl: 60_000, staleTtl: false } satisfies CompressedEntry

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
