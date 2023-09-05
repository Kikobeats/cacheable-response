'use strict'

const { setTimeout } = require('timers/promises')
const Keyv = require('@keyvhq/core')
const test = require('ava')
const got = require('got')

const cacheableResponse = require('..')
const { runServer } = require('./helpers')

test('MISS for first access', async t => {
  const url = await runServer(
    t,
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
        res.end('Hello World')
      }
    })
  )
  const { headers } = await got(`${url}/kikobeats`)
  t.is(headers['x-cache-status'], 'MISS')
})

test('MISS for undefined data value', async t => {
  const url = await runServer(
    t,
    cacheableResponse({
      get: ({ req, res }) => undefined,
      send: ({ data, headers, res, req, ...props }) => {
        res.end('Hello World')
      }
    })
  )
  t.is((await got(`${url}/kikobeats`)).headers['x-cache-status'], 'MISS')
  t.is((await got(`${url}/kikobeats`)).headers['x-cache-status'], 'MISS')
})

test('EXPIRED after cache expiration', async t => {
  const url = await runServer(
    t,
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
        res.end('Hello World')
      }
    })
  )
  const doRequest = () => got(`${url}/kikobeats`)
  t.is((await doRequest()).headers['x-cache-status'], 'MISS')
  t.is((await doRequest()).headers['x-cache-status'], 'EXPIRED')
})

test('BYPASS for forcing refresh', async t => {
  let index = 0
  const url = await runServer(
    t,
    cacheableResponse({
      get: ({ req, res }) => {
        return {
          data: { value: ++index },
          ttl: 86400000,
          staleTtl: false,
          createdAt: Date.now()
        }
      },
      send: ({ data, headers, res, req, ...props }) => {
        res.end(data.value.toString())
      }
    })
  )
  const { body: bodyOne, headers: headersOne } = await got(`${url}/kikobeats`)
  t.is(headersOne['x-cache-status'], 'MISS')
  t.is(bodyOne, '1')
  const { body: bodyTwo, headers: headersTwo } = await got(`${url}/kikobeats`)
  t.is(headersTwo['x-cache-status'], 'HIT')
  t.is(bodyTwo, '1')
  const { body: bodyThree, headers: headersThree } = await got(
    `${url}/kikobeats?force=true`
  )
  t.is(headersThree['x-cache-status'], 'BYPASS')
  t.is(bodyThree, '2')
  const { body: bodyFour, headers: headersFour } = await got(`${url}/kikobeats`)
  t.is(headersFour['x-cache-status'], 'HIT')
  t.is(bodyFour, '2')
})

test('STALE when response is stale', async t => {
  const url = await runServer(
    t,
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
        res.end('Hello World')
      }
    })
  )
  t.is((await got(`${url}/kikobeats`)).headers['x-cache-status'], 'MISS')
  await setTimeout(20)
  t.is((await got(`${url}/kikobeats`)).headers['x-cache-status'], 'STALE')
  t.is((await got(`${url}/kikobeats`)).headers['x-cache-status'], 'HIT')
})

test('HIT for second access', async t => {
  const url = await runServer(
    t,
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
        res.end('Hello World')
      }
    })
  )
  await got(`${url}/kikobeats`)
  const { headers } = await got(`${url}/kikobeats`)
  t.is(headers['x-cache-status'], 'HIT')
})

test('HIT after empty 304 response', async t => {
  const cache = new Keyv({ namespace: 'ssr' })
  const url = await runServer(
    t,
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
        res.end('Hello World')
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
  const url = await runServer(
    t,
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
        res.end('Hello World')
      }
    })
  )
  const { headers: headersOne } = await got(`${url}/kikobeats`)
  t.is(headersOne['x-cache-status'], 'MISS')
  const { headers: headersTwo } = await got(`${url}/kikobeats`)
  t.is(headersTwo['x-cache-status'], 'HIT')
  const { headers: headersThree } = await got(`${url}/kikobeats?bypass=true`)
  t.is(headersThree['x-cache-status'], 'BYPASS')
  const { headers: headersFour } = await got(`${url}/kikobeats`)
  t.is(headersFour['x-cache-status'], 'HIT')
  const { headers: headersFive } = await got(`${url}/kikobeats?force=true`)
  t.is(headersFive['x-cache-status'], 'MISS')
})
