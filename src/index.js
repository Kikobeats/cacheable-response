'use strict'

const debug = require('debug-logfmt')('cacheable-response')
const createCompress = require('compress-brotli')
const memoize = require('@keyvhq/memoize')
const Keyv = require('@keyvhq/core')
const assert = require('assert')
const getEtag = require('etag')

const { hasQueryParameter, createSetHeaders } = require('./util')

const cacheableResponse = ({
  bypassQueryParameter = 'force',
  cache = new Keyv({ namespace: 'ssr' }),
  compress: enableCompression = false,
  get,
  getKey = require('./util').getKey,
  send,
  staleTtl: rawStaleTtl = 3600000,
  ttl: defaultTtl = 86400000,
  ...compressOpts
} = {}) => {
  assert(get, '.get required')
  assert(send, '.send required')

  const staleTtl = typeof rawStaleTtl === 'number' ? rawStaleTtl : undefined

  const { serialize, compress, decompress } = createCompress({
    enable: enableCompression,
    ...compressOpts
  })

  const memoGet = memoize(get, cache, {
    ttl: ({ ttl = defaultTtl } = {}) => ttl,
    staleTtl,
    objectMode: true,
    key: opts => getKey(opts, { bypassQueryParameter }),
    value: compress
  })

  const setHeaders = createSetHeaders({ staleTtl })

  return async opts => {
    const { req, res } = opts
    const hasForce = hasQueryParameter(req, bypassQueryParameter)

    const [raw, { hasValue, key, isExpired, isStale }] = await memoGet(opts)

    const result = (await decompress(raw)) || {}
    const isHit = !hasForce && !isExpired && hasValue

    const {
      etag: cachedEtag,
      ttl = defaultTtl,
      createdAt = Date.now(),
      data = null,
      ...props
    } = result

    const etag = cachedEtag || getEtag(serialize(data))
    const ifNoneMatch = req.headers['if-none-match']
    const isModified = etag !== ifNoneMatch

    debug({
      key,
      isHit,
      isExpired,
      isStale,
      result: Object.keys(result).length === 0,
      etag,
      ifNoneMatch,
      isModified
    })

    setHeaders({
      etag,
      res,
      createdAt,
      isHit,
      isStale,
      ttl,
      hasForce
    })

    if (!hasForce && !isModified) {
      res.statusCode = 304
      res.end()
      return
    }

    return send({ data, res, req, ...props })
  }
}

module.exports = cacheableResponse
