'use strict'

const Keyv = require('@keyvhq/core')
const delay = require('delay')
const test = require('ava')
const got = require('got')

const cacheableResponse = require('..')
const { createServer } = require('./helpers')

test('MISS for first access', async t => {
  const url = await createServer(
    cacheableResponse({
      get: ({ req, res }) => {
        return {
          data: { foo: 'bar' },
          ttl: 1000,
          createdAt: Date.now(),
          foo: { bar: true }
        }
      },
      send: ({ data, headers, res, req, ...props }) => {
        res.end('Welcome to Micro')
      }
    })
  )
  const { headers } = await got(`${url}/kikobeats`)
  t.is(headers['x-cache-status'], 'MISS')
})

test('MISS for undefined data value', async t => {
  const url = await createServer(
    cacheableResponse({
      get: ({ req, res }) => undefined,
      send: ({ data, headers, res, req, ...props }) => {
        res.end('Welcome to Micro')
      }
    })
  )
  t.is((await got(`${url}/kikobeats`)).headers['x-cache-status'], 'MISS')
  t.is((await got(`${url}/kikobeats`)).headers['x-cache-status'], 'MISS')
})

test('MISS after cache expiration', async t => {
  const url = await createServer(
    cacheableResponse({
      staleTtl: false,
      get: ({ req, res }) => {
        return {
          data: { foo: 'bar' },
          ttl: 1,
          createdAt: Date.now(),
          foo: { bar: true }
        }
      },
      send: ({ data, headers, res, req, ...props }) => {
        res.end('Welcome to Micro')
      }
    })
  )

  const doRequest = () => got(`${url}/kikobeats`)

  t.is((await doRequest()).headers['x-cache-status'], 'MISS')
  t.is((await doRequest()).headers['x-cache-status'], 'MISS')
})

test('BYPASS for forcing refresh', async t => {
  const url = await createServer(
    cacheableResponse({
      get: ({ req, res }) => {
        return {
          data: { foo: 'bar' },
          ttl: 86400000,
          createdAt: Date.now(),
          foo: { bar: true }
        }
      },
      send: ({ data, headers, res, req, ...props }) => {
        res.end('Welcome to Micro')
      }
    })
  )

  const { headers: headersOne } = await got(`${url}/kikobeats`)
  t.is(headersOne['x-cache-status'], 'MISS')

  const { headers: headersTwo } = await got(`${url}/kikobeats`)
  t.is(headersTwo['x-cache-status'], 'HIT')

  const { headers: headersThree } = await got(`${url}/kikobeats?force=true`)
  t.is(headersThree['x-cache-status'], 'BYPASS')
  t.is(headersThree['x-cache-expired-at'], '0ms')

  const { headers: headersFour } = await got(`${url}/kikobeats`)
  t.is(headersFour['x-cache-status'], 'HIT')
})

test('REVALIDATING when response is stale', async t => {
  const url = await createServer(
    cacheableResponse({
      staleTtl: 80,
      ttl: 100,
      get: ({ req, res }) => {
        return {
          data: { foo: 'bar' },
          createdAt: Date.now(),
          foo: { bar: true }
        }
      },
      send: ({ data, headers, res, req, ...props }) => {
        res.end('Welcome to Micro')
      }
    })
  )

  t.is((await got(`${url}/kikobeats`)).headers['x-cache-status'], 'MISS')

  await delay(20)

  t.is(
    (await got(`${url}/kikobeats`)).headers['x-cache-status'],
    'REVALIDATING'
  )

  t.is((await got(`${url}/kikobeats`)).headers['x-cache-status'], 'HIT')
})

test('HIT for second access', async t => {
  const url = await createServer(
    cacheableResponse({
      staleTtl: false,
      get: ({ req, res }) => {
        return {
          data: { foo: 'bar' },
          ttl: 10000,
          createdAt: Date.now(),
          foo: { bar: true }
        }
      },
      send: ({ data, headers, res, req, ...props }) => {
        res.end('Welcome to Micro')
      }
    })
  )
  await got(`${url}/kikobeats`)
  const { headers } = await got(`${url}/kikobeats`)
  t.is(headers['x-cache-status'], 'HIT')
})

test('HIT after empty 304 response', async t => {
  const cache = new Keyv({ namespace: 'ssr' })
  const url = await createServer(
    cacheableResponse({
      staleTtl: false,
      cache,
      get: ({ req, res }) => {
        return {
          data: { foo: 'bar' },
          ttl: 10000,
          createdAt: Date.now(),
          foo: { bar: true }
        }
      },
      send: ({ data, headers, res, req, ...props }) => {
        res.end('Welcome to Micro')
      }
    })
  )
  const { headers: headersOne } = await got(`${url}/kikobeats`)
  await cache.clear()
  await got(`${url}/kikobeats`, {
    headers: { 'If-None-Match': headersOne.etag }
  })
  const { headers: headersTwo } = await got(`${url}/kikobeats`)
  t.is(headersTwo['x-cache-status'], 'HIT')
})

test('custom bypass query parameter', async t => {
  const url = await createServer(
    cacheableResponse({
      bypassQueryParameter: 'bypass',
      get: ({ req, res }) => {
        return {
          data: { foo: 'bar' },
          ttl: 86400000,
          createdAt: Date.now(),
          foo: { bar: true }
        }
      },
      send: ({ data, headers, res, req, ...props }) => {
        res.end('Welcome to Micro')
      }
    })
  )

  const { headers: headersOne } = await got(`${url}/kikobeats`)
  t.is(headersOne['x-cache-status'], 'MISS')

  const { headers: headersTwo } = await got(`${url}/kikobeats`)
  t.is(headersTwo['x-cache-status'], 'HIT')

  const { headers: headersThree } = await got(`${url}/kikobeats?bypass=true`)
  t.is(headersThree['x-cache-status'], 'BYPASS')
  t.is(headersThree['x-cache-expired-at'], '0ms')

  const { headers: headersFour } = await got(`${url}/kikobeats`)
  t.is(headersFour['x-cache-status'], 'HIT')

  const { headers: headersFive } = await got(`${url}/kikobeats?force=true`)
  t.is(headersFive['x-cache-status'], 'MISS')
})
