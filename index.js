'use strict'

const { resolve: urlResolve } = require('url')
const normalizeUrl = require('normalize-url')
const { parse } = require('querystring')
const prettyMs = require('pretty-ms')
const computeEtag = require('etag')
const assert = require('assert')
const { URL } = require('url')
const Keyv = require('keyv')

const getEtag = data => computeEtag(typeof data === 'string' ? data : JSON.stringify(data))

const getKey = url => {
  const { origin } = new URL(url)
  const baseKey = normalizeUrl(url, {
    removeQueryParameters: [/^utm_\w+/i, 'force', 'filter', 'ref']
  })
  return baseKey.replace(origin, '').replace('/?', '')
}

const toSeconds = ms => Math.floor(ms / 1000)

const createSetCache = ({ revalidate }) => {
  return ({ res, createdAt, isHit, ttl, force, etag }) => {
    // Specifies the maximum amount of time a resource
    // will be considered fresh in seconds
    const diff = force ? 0 : createdAt + ttl - Date.now()
    const maxAge = toSeconds(diff)
    res.setHeader(
      'Cache-Control',
      `public, max-age=${maxAge}, s-maxage=${maxAge}, stale-while-revalidate=${toSeconds(
        revalidate(ttl)
      )}`
    )
    res.setHeader('X-Cache-Status', isHit ? 'HIT' : 'MISS')
    res.setHeader('X-Cache-Expired-At', prettyMs(diff))
    res.setHeader('ETag', etag)
  }
}

module.exports = ({
  cache = new Keyv({ namespace: 'ssr' }),
  get,
  send,
  revalidate = ttl => ttl / 24,
  ttl: defaultTtl = 7200000
} = {}) => {
  assert(get, '.get required')
  assert(send, '.send required')

  const setCache = createSetCache({
    revalidate: typeof revalidate === 'function' ? revalidate : () => revalidate
  })

  return async ({ req, res, ...opts }) => {
    const hasForce = Boolean(req.query ? req.query.force : parse(req.url).force)
    const url = urlResolve('http://localhost', req.url)
    const key = getKey(url)
    const cachedResult = await cache.get(key)
    const isHit = !!cachedResult && !hasForce

    const { etag: cachedEtag, ttl = defaultTtl, createdAt = Date.now(), data, ...props } = isHit
      ? cachedResult
      : await get({ req, res, ...opts })

    const etag = cachedEtag || getEtag(data)

    setCache({
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
