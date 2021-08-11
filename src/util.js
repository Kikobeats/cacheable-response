'use strict'

const { parse } = require('querystring')
const prettyMs = require('pretty-ms')
const { URL } = require('url')

const isEmpty = value =>
  value === undefined ||
  value === null ||
  (typeof value === 'object' && Object.keys(value).length === 0) ||
  (typeof value === 'string' && value.trim().length === 0)

const hasQueryParameter = (req, key) =>
  Boolean(req.query ? req.query[key] : parse(req.url.split('?')[1])[key])

const getKey = ({ req }, { bypassQueryParameter }) => {
  const urlObj = new URL(req.url, 'http://localhost:8080')
  const OMIT_KEYS = [bypassQueryParameter, /^utm_\w+/i]
  const omitKeys = Array.from(urlObj.searchParams.keys()).reduce((acc, key) => {
    const isOmitable = OMIT_KEYS.some(omitQueryParam =>
      omitQueryParam instanceof RegExp
        ? omitQueryParam.test(key)
        : omitQueryParam === key
    )
    return isOmitable ? [...acc, key] : acc
  }, [])
  omitKeys.forEach(key => urlObj.searchParams.delete(key))
  return `${urlObj.pathname}${urlObj.search}`
}

const toSeconds = ms => Math.floor(ms / 1000)

const getStatus = ({ isHit, isStale, hasForce }) =>
  isHit ? (isStale ? 'REVALIDATING' : 'HIT') : hasForce ? 'BYPASS' : 'MISS'

const createSetHeaders = ({ staleTtl }) => {
  return ({ res, createdAt, isHit, isStale, ttl, hasForce, etag }) => {
    // Specifies the maximum amount of time a resource
    // will be considered fresh in seconds
    const diff = hasForce ? 0 : createdAt + ttl - Date.now()
    const maxAge = toSeconds(diff)
    const revalidation = staleTtl ? toSeconds(staleTtl) : 0

    let cacheControl = `public, must-revalidate, max-age=${maxAge}`

    if (revalidation) {
      cacheControl = `${cacheControl}, stale-while-revalidate=${revalidation}, stale-if-error=${revalidation}`
    }

    res.setHeader('Cache-Control', cacheControl)
    res.setHeader('X-Cache-Status', getStatus({ isHit, isStale, hasForce }))
    res.setHeader('X-Cache-Expired-At', prettyMs(diff))
    res.setHeader('ETag', etag)
  }
}

module.exports = {
  isEmpty,
  hasQueryParameter,
  getKey,
  createSetHeaders
}
