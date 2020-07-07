'use strict'

const debug = require('debug-logfmt')('cacheable-response')
const createCompress = require('compress-brotli')
const normalizeUrl = require('normalize-url')
const { parse } = require('querystring')
const prettyMs = require('pretty-ms')
const assert = require('assert')
const getEtag = require('etag')
const { URL } = require('url')
const Keyv = require('keyv')

const isEmpty = value =>
  value === undefined ||
  value === null ||
  (typeof value === 'object' && Object.keys(value).length === 0) ||
  (typeof value === 'string' && value.trim().length === 0)

const getKeyDefault = ({ req }) => {
  const url = new URL(req.url, 'http://localhost').toString()
  const { origin } = new URL(url)
  const baseKey = normalizeUrl(url, {
    removeQueryParameters: ['force', /^utm_\w+/i]
  })
  return baseKey.replace(origin, '').replace('/?', '')
}

const toSeconds = ms => Math.floor(ms / 1000)

const createSetHeaders = ({ revalidate }) => {
  return ({ res, createdAt, isHit, ttl, hasForce, etag }) => {
    // Specifies the maximum amount of time a resource
    // will be considered fresh in seconds
    const diff = Math.max(hasForce ? 0 : createdAt + ttl - Date.now(), 0)
    const maxAge = toSeconds(diff)
    const revalidation = toSeconds(revalidate(ttl))

    res.setHeader(
      'Cache-Control',
      `public, must-revalidate, max-age=${maxAge}, s-maxage=${maxAge}, stale-while-revalidate=${revalidation}, stale-if-error=${revalidation}`
    )

    res.setHeader('X-Cache-Status', isHit ? 'HIT' : 'MISS')
    res.setHeader('X-Cache-Expired-At', prettyMs(diff))
    res.setHeader('ETag', etag)
  }
}

const setCache = async (compress, cache, key, payload) =>
  await cache.set(
    key,
    await compress(payload),
    payload.ttl + payload.serveStale
  )

module.exports = ({
  cache = new Keyv({ namespace: 'ssr' }),
  compress: enableCompression = false,
  getKey = getKeyDefault,
  get,
  send,
  revalidate = ttl => Math.round(ttl * 0.2),
  ttl: defaultTtl = 7200000,
  ...compressOpts
} = {}) => {
  assert(get, '.get required')
  assert(send, '.send required')

  const setHeaders = createSetHeaders({
    revalidate: typeof revalidate === 'function' ? revalidate : () => revalidate
  })

  const { serialize, compress, decompress } = createCompress({
    enable: enableCompression,
    ...compressOpts
  })

  return async opts => {
    const { req, res } = opts
    const hasForce = Boolean(
      req.query ? req.query.force : parse(req.url.split('?')[1]).force
    )
    const key = getKey(opts)
    const cachedResult = await decompress(await cache.get(key))
    const isHit = !hasForce && cachedResult !== undefined
    const result = isHit ? cachedResult : await get(opts)

    if (isEmpty(result)) return

    const {
      etag: cachedEtag,
      ttl = defaultTtl,
      serveStale = 0,
      createdAt = Date.now(),
      data,
      ...props
    } = result

    const etag = cachedEtag || getEtag(serialize(data))
    const ifNoneMatch = req.headers['if-none-match']
    const isModified = etag !== ifNoneMatch

    debug({
      key,
      isHit,
      cachedResult: !isEmpty(cachedResult),
      result: !isEmpty(result),
      etag,
      ifNoneMatch
    })

    setHeaders({
      etag,
      res,
      createdAt,
      isHit,
      ttl,
      hasForce
    })

    if (!isHit) {
      await setCache(compress, cache, key, {
        etag,
        createdAt,
        ttl,
        serveStale,
        data,
        ...props
      })
    }

    if (!isModified) {
      res.statusCode = 304
      res.end()
      return
    }

    const sendResult = send({ data, res, req, ...props })
    const elapsedMillis = Date.now() - createdAt
    if (elapsedMillis > ttl && elapsedMillis <= serveStale) {
      const {
        ttl = defaultTtl,
        serveStale = ttl,
        createdAt = Date.now(),
        data,
        ...props
      } = await get(opts)
      const etag = getEtag(serialize(data))
      await setCache(compress, cache, key, {
        etag,
        createdAt,
        ttl,
        serveStale,
        data,
        ...props
      })
    }
    return sendResult
  }
}

module.exports.getKey = getKeyDefault
