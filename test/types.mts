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
const keyvOptionHooks: CacheProvider = {
  namespace: 'ssr',
  store: new Map(),
  ttl: 60_000,
  serialize: data => JSON.stringify(data),
  deserialize: text => JSON.parse(text)
}
cacheableResponse({ ...params, cache: keyvCache })
cacheableResponse({ ...params, cache: keyvOptions })
cacheableResponse({ ...params, cache: keyvOptionHooks })
// Object.assign copies these keys onto the instance. They are not Keyv methods.
const copiedHooks = {
  __defineGetter__: () => undefined,
  __defineSetter__: () => undefined,
  __lookupGetter__: () => undefined,
  __lookupSetter__: () => undefined,
  ['__proto__']: () => undefined
}
cacheableResponse({ ...params, cache: { namespace: 'ssr', store: new Map(), ...copiedHooks } })
const copiedIterator = { [Symbol.iterator]: () => undefined }
cacheableResponse({ ...params, cache: { namespace: 'ssr', store: new Map(), ...copiedIterator } })
cacheableResponse<GetOpts, {}, Data>({ ...params, cache: keyvCache })

const plainCache = {
  get: async (key: string) => undefined,
  set: async (key: string, value: unknown, ttl: number) => true
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
cacheableResponse({
  cache: sharedKeyv,
  get: async () => ({ data: { html: '<p/>' }, statusCode: 201 }),
  send: ({ data, statusCode, res }) => {
    res.statusCode = statusCode
    res.end(data.html)
  }
})

const adapterKeyv = new Keyv<undefined>({ namespace: 'ssr' })
cacheableResponse({ ...params, cache: adapterKeyv })

// @ts-expect-error `get` and `set` would replace Keyv methods, the object is still never read from
cacheableResponse<GetOpts, {}, Data>({ ...params, cache: { ttl: 60_000, ...plainCache } })

// Spread a real Keyv option in with one method. A fresh literal would still
// fail excess-property checks after that method was dropped from the type.
const onlyGet = { get: async (key: string) => undefined }
const onlySet = { set: async (key: string, value: unknown, ttl: number) => true }
const onlyHas = { has: async (key: string) => false }
const onlyDelete = { delete: async (key: string) => false }
const onlyClear = { clear: async () => undefined }
// @ts-expect-error own get replaces Keyv#get
cacheableResponse<GetOpts, {}, Data>({ ...params, cache: { namespace: 'ssr', ...onlyGet } })
// @ts-expect-error own set replaces Keyv#set
cacheableResponse<GetOpts, {}, Data>({ ...params, cache: { namespace: 'ssr', ...onlySet } })
// @ts-expect-error own has replaces Keyv#has
cacheableResponse<GetOpts, {}, Data>({ ...params, cache: { namespace: 'ssr', ...onlyHas } })
// @ts-expect-error own delete replaces Keyv#delete
cacheableResponse<GetOpts, {}, Data>({ ...params, cache: { namespace: 'ssr', ...onlyDelete } })
// @ts-expect-error own clear replaces Keyv#clear
cacheableResponse<GetOpts, {}, Data>({ ...params, cache: { namespace: 'ssr', ...onlyClear } })
const onlyPrefix = { _getKeyPrefix: (key: string) => key }
const onlyUnprefix = { _getKeyUnprefix: (key: string) => key }
// @ts-expect-error own _getKeyPrefix replaces the method a read uses to find the entry
cacheableResponse<GetOpts, {}, Data>({ ...params, cache: { namespace: 'ssr', ...onlyPrefix } })
// @ts-expect-error own _getKeyUnprefix replaces Keyv's prefix helper
cacheableResponse<GetOpts, {}, Data>({ ...params, cache: { namespace: 'ssr', ...onlyUnprefix } })
const onlyIterator = { iterator: () => undefined }
// @ts-expect-error own iterator stays on the instance when the store does not install one
cacheableResponse<GetOpts, {}, Data>({ ...params, cache: { namespace: 'ssr', ...onlyIterator } })
