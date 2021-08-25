'use strict'

const debug = require('debug-logfmt')('cacheable-response')
const createCompress = require('compress-brotli')
const memoize = require('@keyvhq/memoize')
const Keyv = require('@keyvhq/core')
const assert = require('assert')
const getEtag = require('etag')

const { createKey, isFunction, setHeaders, size } = require('./util')

const cacheableResponse = ({
  bypassQueryParameter = 'force',
  cache = new Keyv({ namespace: 'ssr' }),
  compress: enableCompression = false,
  get,
  key: getKey = createKey(bypassQueryParameter),
  send,
  staleTtl: rawStaleTtl = 3600000,
  ttl: rawTtl = 86400000,
  ...compressOpts
} = {}) => {
  assert(get, '.get required')
  assert(send, '.send required')

  const staleTtl = isFunction(rawStaleTtl)
    ? rawStaleTtl
    : ({ staleTtl = rawStaleTtl } = {}) => staleTtl

  const ttl = isFunction(rawTtl) ? rawTtl : ({ ttl = rawTtl } = {}) => ttl

  const { serialize, compress, decompress } = createCompress({
    enable: enableCompression,
    ...compressOpts
  })

  const memoGet = memoize(get, cache, {
    key: getKey,
    objectMode: true,
    staleTtl,
    ttl,
    value: compress
  })

  return async opts => {
    const { req, res } = opts
    const [
      raw,
      { forceExpiration, hasValue, key, isExpired, isStale }
    ] = await memoGet(opts)

    if (res.finished) return

    const result = (await decompress(raw)) || {}
    const isHit = !forceExpiration && !isExpired && hasValue

    const {
      createdAt = Date.now(),
      data = null,
      etag: cachedEtag,
      staleTtl = memoGet.staleTtl(result),
      ttl = memoGet.ttl(result),
      ...props
    } = result

    const etag = cachedEtag || getEtag(serialize(result))
    const ifNoneMatch = req.headers['if-none-match']
    const isModified = etag !== ifNoneMatch

    debug({
      key,
      isHit,
      isExpired,
      isStale,
      result: size(result) === 0,
      etag,
      ifNoneMatch,
      isModified
    })

    setHeaders({
      createdAt,
      etag,
      forceExpiration,
      hasValue,
      isHit,
      isStale,
      res,
      staleTtl,
      ttl
    })

    if (!forceExpiration && !isModified) {
      res.statusCode = 304
      res.end()
      return
    }

    return send({ data, res, req, ...props })
  }
}

module.exports = cacheableResponse
