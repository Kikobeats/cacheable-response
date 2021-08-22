'use strict'

const { parse } = require('querystring')
const { URL } = require('url')

const size = obj => Object.keys(obj).length

const isFunction = fn => typeof fn === 'function'

const hasQueryParameter = (req, key) => {
  const value = req.query ? req.query[key] : parse(req.url.split('?')[1])[key]
  return value !== undefined && value !== null
}

const createKey = bypassQueryParameter => ({ req }) => {
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
  return [
    `${urlObj.pathname}${urlObj.search}`,
    hasQueryParameter(req, bypassQueryParameter)
  ]
}

const toSeconds = ms => Math.floor(ms / 1000)

const getStatus = ({ hasValue, isHit, isStale, forceExpiration }) =>
  isHit
    ? isStale
        ? 'STALE'
        : 'HIT'
    : forceExpiration
      ? 'BYPASS'
      : hasValue
        ? 'EXPIRED'
        : 'MISS'

const setHeaders = ({
  createdAt,
  etag,
  forceExpiration,
  hasValue,
  isHit,
  isStale,
  res,
  staleTtl,
  ttl
}) => {
  // Specifies the maximum amount of time a resource
  // will be considered fresh in seconds
  const diff = forceExpiration ? 0 : createdAt + ttl - Date.now()
  const maxAge = toSeconds(diff)
  const revalidation = staleTtl ? toSeconds(staleTtl) : 0

  let cacheControl = `public, must-revalidate, max-age=${maxAge}`

  if (revalidation) {
    cacheControl = `${cacheControl}, stale-while-revalidate=${revalidation}, stale-if-error=${revalidation}`
  }

  res.setHeader('Cache-Control', cacheControl)
  res.setHeader(
    'X-Cache-Status',
    getStatus({ hasValue, isHit, isStale, forceExpiration })
  )
  res.setHeader('ETag', etag)
}

module.exports = {
  createKey,
  hasQueryParameter,
  isFunction,
  setHeaders,
  size
}
