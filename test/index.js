'use strict'

const test = require('ava')
const got = require('got')

const cacheableResponse = require('..')
const { runServer } = require('./helpers')

test('etag is present', async t => {
  const url = await runServer(
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

test('compress support', async t => {
  const url = await runServer(
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

test('exit early is get is empty', async t => {
  let isEnd = false

  const end = (res, msg) => {
    isEnd = true
    res.end(msg)
  }

  const url = await runServer(
    cacheableResponse({
      get: ({ res }) => !isEnd && end(res, 'get'),
      send: ({ res }) => !isEnd && end(res, 'send')
    })
  )

  const res = await got(`${url}/kikobeats`)
  t.is(res.body, 'get')
})

test('prevent send if data is undefined', async t => {
  t.plan(1)

  let isSendCalled = false
  const url = await runServer(
    cacheableResponse({
      compress: true,
      get: ({ req, res }) => {
        throw Error()
      },
      send: ({ data, headers, res, req, ...props }) => {
        isSendCalled = true
        res.end('Hello World')
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
  const url = await runServer(
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
  const { body, statusCode } = await got(`${url}/kikobeats`, {
    headers: { 'If-None-Match': headers.etag }
  })
  t.is(statusCode, 304)
  t.is(body, '')
})
