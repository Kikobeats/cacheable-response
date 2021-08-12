'use strict'

const test = require('ava')
const got = require('got')

const cacheableResponse = require('..')
const { createServer } = require('./helpers')

test('etag is present', async t => {
  const url = await createServer(
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
        res.end('Welcome to Micro')
      }
    })
  )
  const { headers: headersOne } = await got(`${url}/kikobeats`)
  t.is(headersOne['x-cache-status'], 'MISS')
  const { headers: headersTwo } = await got(`${url}/kikobeats`)
  t.is(headersTwo['x-cache-status'], 'HIT')
  t.is(headersOne.etag, headersTwo.etag)
})

test('compress support', async t => {
  const url = await createServer(
    cacheableResponse({
      compress: true,
      get: ({ req, res }) => {
        return {
          data: { foo: 'bar' },
          ttl: 30000,
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
  t.is(headersOne.etag, headersTwo.etag)
})

test('prevent send if data is undefined', async t => {
  let isSendCalled = false
  const url = await createServer(
    cacheableResponse({
      compress: true,
      get: ({ req, res }) => {
        throw Error()
      },
      send: ({ data, headers, res, req, ...props }) => {
        isSendCalled = true
        res.end('Welcome to Micro')
      }
    })
  )

  try {
    await got(`${url}/kikobeats`, { retry: 0 })
  } catch (err) {
    t.false(isSendCalled)
  }
})

test('return empty 304 response when If-None-Match matches ETag', async t => {
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
  const { body, statusCode } = await got(`${url}/kikobeats`, {
    headers: { 'If-None-Match': headers.etag }
  })
  t.is(statusCode, 304)
  t.is(body, '')
})
