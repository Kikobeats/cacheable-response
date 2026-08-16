'use strict'

const { parse } = require('querystring')

const size = obj => Object.keys(obj).length

const isFunction = fn => typeof fn === 'function'

const hasQueryParameter = (req, key) => {
  const value = req.query ? req.query[key] : parse(req.url.split('?')[1])[key]
  return value !== undefined && value !== null
}

const createKey =
  bypassQueryParameter =>
    ({ req }) => {
    // req.url is an HTTP request-target, not a WHATWG URL. Parsing it as
    // one turns `//host/` and `//x/../../` into `/` (cache poisoning).
      const rawUrl = req.url
      const q = rawUrl.indexOf('?')
      const pathname = q === -1 ? rawUrl : rawUrl.slice(0, q)
      const searchParams = new URLSearchParams(
        q === -1 ? '' : rawUrl.slice(q + 1)
      )
      const OMIT_KEYS = [bypassQueryParameter, /^utm_\w+/i]
      Array.from(searchParams.keys()).forEach(key => {
        const isOmitable = OMIT_KEYS.some(omitQueryParam =>
          omitQueryParam instanceof RegExp
            ? omitQueryParam.test(key)
            : omitQueryParam === key
        )
        if (isOmitable) {
          searchParams.delete(key)
        }
      })

      const search = searchParams.toString()
      return [
      `${pathname}${search ? `?${search}` : ''}`,
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
