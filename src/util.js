'use strict'

const { parse } = require('querystring')
const { URL } = require('url')

const size = obj => Object.keys(obj).length

const isFunction = fn => typeof fn === 'function'

const hasQueryParameter = (req, key) => {
  const value = req.query ? req.query[key] : parse(req.url.split('?')[1])[key]
  return value !== undefined && value !== null
}

const KEY_ORIGIN = 'http://localhost:8080'
const ABSOLUTE_FORM = /^https?:\/\/[^/?#]+/i

// WHATWG `URL` is safe for query-string work, but its pathname is not the
// HTTP request-target: `//host` is scheme-relative, and `.` / `..` / `%2e`
// are normalized. Node leaves `req.url` as sent, so those targets must not
// share a cache key with `/` or `/secret`.
const requestTargetPath = rawUrl => {
  let rest = rawUrl || '/'
  if (!rest.startsWith('//')) {
    const origin = rest.match(ABSOLUTE_FORM)
    if (origin) rest = rest.slice(origin[0].length) || '/'
  }

  const qIndex = rest.indexOf('?')
  const hIndex = rest.indexOf('#')
  let pathEnd = rest.length
  if (qIndex !== -1) pathEnd = qIndex
  if (hIndex !== -1 && hIndex < pathEnd) pathEnd = hIndex
  return { pathname: rest.slice(0, pathEnd) || '/', rest, qIndex, hIndex }
}

const createKey =
  bypassQueryParameter =>
    ({ req }) => {
      const { pathname, rest, qIndex, hIndex } = requestTargetPath(req.url)
      const urlObj = new URL(KEY_ORIGIN)
      if (qIndex !== -1 && (hIndex === -1 || qIndex < hIndex)) {
        urlObj.search = rest.slice(qIndex, hIndex === -1 ? rest.length : hIndex)
      }
      const OMIT_KEYS = [bypassQueryParameter, /^utm_\w+/i]
      Array.from(urlObj.searchParams.keys()).forEach(key => {
        const isOmitable = OMIT_KEYS.some(omitQueryParam =>
          omitQueryParam instanceof RegExp
            ? omitQueryParam.test(key)
            : omitQueryParam === key
        )
        if (isOmitable) {
          urlObj.searchParams.delete(key)
        }
      })

      return [
      `${pathname}${urlObj.search}`,
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
  preventCaching = false,
  res,
  staleTtl,
  ttl
}) => {
  const noStore = forceExpiration || preventCaching

  // Specifies the maximum amount of time a resource
  // will be considered fresh in seconds
  const diff = noStore ? 0 : createdAt + ttl - Date.now()
  const maxAge = toSeconds(diff)
  const revalidation = staleTtl ? toSeconds(staleTtl) : 0

  let cacheControl = noStore
    ? 'private, no-cache, no-store, max-age=0'
    : `public, must-revalidate, max-age=${maxAge}`

  if (!noStore && revalidation) {
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
