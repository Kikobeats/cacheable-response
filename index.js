'use strict'

const { resolve: urlResolve } = require('url')
const normalizeUrl = require('normalize-url')
const { parse } = require('querystring')
const prettyMs = require('pretty-ms')
const computeEtag = require('etag')
const assert = require('assert')
const Keyv = require('keyv')

const getEtag = data => computeEtag(typeof data === 'string' ? data : JSON.stringify(data))

const getKey = url => {
  const { origin } = new URL(url)
  const baseKey = normalizeUrl(url, {
    removeQueryParameters: [/^utm_\w+/i, 'force', 'filter', 'ref']
  })
  return baseKey.replace(origin, '').replace('/?', '')
}

const setCacheHeaders = ({ res, createdAt, isHit, ttl, force, etag }) => {
  // Specifies the maximum amount of time a resource
  // will be considered fresh in seconds
  const diff = force ? 0 : createdAt + ttl - Date.now()
  const maxAge = Math.floor(diff / 1000)
  res.setHeader(
    'Cache-Control',
    `public, max-age=${maxAge}, s-maxage=${maxAge}, stale-while-revalidate=30`
  )
  res.setHeader('X-Cache-Status', isHit ? 'HIT' : 'MISS')
  res.setHeader('X-Cache-Expired-At', prettyMs(diff))
  res.setHeader('ETag', etag)
}

module.exports = ({ cache = new Keyv(), get, send } = {}) => {
  assert(get, 'get required')
  assert(send, 'send required')

  return async ({ req, res, ...opts }) => {
    const hasForce = Boolean(req.query ? req.query.force : parse(req.url).force)
    const url = urlResolve('http://localhost', req.url)
    const key = getKey(url)
    const cachedResult = await cache.get(key)
    const isHit = cachedResult && !hasForce

    const { etag: cachedEtag, ttl, createdAt = Date.now(), data, ...props } = isHit
      ? cachedResult
      : await get({ req, res, ...opts })

    const etag = cachedEtag || getEtag(data)

    setCacheHeaders({
      etag,
      res,
      createdAt,
      isHit,
      ttl,
      hasForce
    })

    if (!isHit) {
      await cache.set(key, { etag, createdAt, ttl, data }, ttl)
    }

    send({ data, res, req, ...props })
  }
}
