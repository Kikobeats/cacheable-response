'use strict'

const { resolve: urlResolve } = require('url')
const normalizeUrl = require('normalize-url')
const { parse } = require('querystring')
const prettyMs = require('pretty-ms')
const assert = require('assert')
const Keyv = require('keyv')

const getKey = url => {
  const { origin } = new URL(url)
  const baseKey = normalizeUrl(url, {
    removeQueryParameters: [/^utm_\w+/i, 'force', 'filter', 'ref']
  })
  return baseKey.replace(origin, '').replace('/?', '')
}

const setCacheControl = ({ res, createdAt, isHit, ttl, force }) => {
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
}

module.exports = ({ cache = new Keyv(), get, send } = {}) => {
  assert(get, 'get required')
  assert(send, 'send required')

  return async (req, res) => {
    const hasForce = Boolean(req.query ? req.query.force : parse(req.url).force)
    const url = urlResolve('http://localhost', req.url)
    const key = getKey(url)
    const cachedResult = await cache.get(key)
    const isHit = cachedResult && !hasForce

    const { ttl, createdAt = Date.now(), data, ...props } = isHit
      ? cachedResult
      : await get({ req, res })

    setCacheControl({ res, createdAt, isHit, ttl, hasForce })

    if (!isHit) {
      await cache.set(key, { createdAt, ttl, data }, ttl)
    }

    send({ data, res, req, ...props })
  }
}
