'use strict'

const Keyv = require('@keyvhq/core')
const test = require('ava')
const got = require('got')

const cacheableResponse = require('..')
const { runServer } = require('./helpers')

test('save etag in cache when is possible', async t => {
  const cache = new Keyv()
  const url = await runServer(
    t,
    cacheableResponse({
      cache,
      staleTtl: false,
      get: () => ({
        data: { foo: 'bar' },
        ttl: 30000,
        createdAt: Date.now(),
        foo: { bar: true }
      }),
      send: ({ data, headers, res, req, ...props }) => {
        res.end('Hello World')
      }
    })
  )
  await got(`${url}/kikobeats`)
  const { etag } = await cache.get('/')
  t.truthy(etag)
})

test('etag is present', async t => {
  const url = await runServer(
    t,
    cacheableResponse({
      staleTtl: false,
      get: ({ req, res }) => {
        return {
          data: { foo: 'bar' },
          ttl: 30000,
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
  t.is(headersOne.etag, headersTwo.etag)
})

test('etag is different', async t => {
  const url = await runServer(
    t,
    cacheableResponse({
      staleTtl: false,
      key: ({ req }) => [req.url, req.url.includes('force')],
      get: ({ req, res }) => {
        return {
          data: { foo: 'bar' },
          ttl: 30000,
          createdAt: Date.now(),
          foo: { bar: true }
        }
      },
      send: ({ data, headers, res, req }) => {
        res.end('Hello World')
      }
    })
  )
  const { headers: headersOne } = await got(`${url}/kikobeats`)
  const etagOne = headersOne.etag

  const { headers: headersTwo } = await got(`${url}/kikobeats`)
  const etagTwo = headersTwo.etag

  t.is(etagOne, etagTwo)

  const { headers: headersThree } = await got(`${url}/kikobeats&force`)
  const etagThree = headersThree.etag

  t.not(etagOne, etagThree)
})
