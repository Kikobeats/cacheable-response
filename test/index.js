'use strict'

const http = require('http')
const test = require('ava')
const got = require('got')

const cacheableResponse = require('..')
const { runServer } = require('./helpers')

// `path` is the request-target. got/URL would treat `//host` as scheme-relative.
const rawRequest = (url, target) =>
  new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: url.hostname === '::' ? '127.0.0.1' : url.hostname,
        port: url.port,
        path: target
      },
      res => {
        const chunks = []
        res.on('data', chunk => chunks.push(chunk))
        res.on('end', () =>
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks).toString()
          })
        )
      }
    )
    req.on('error', reject)
    req.end()
  })

test('compress support', async t => {
  const url = await runServer(
    t,
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

test('exit early is response was written', async t => {
  let isEnd = false
  const end = (res, msg) => {
    isEnd = true
    res.end(msg)
  }
  const url = await runServer(
    t,
    cacheableResponse({
      get: ({ res }) => !isEnd && end(res, 'get'),
      send: ({ res }) => !isEnd && end(res, 'send')
    })
  )
  const res = await got(`${url}/kikobeats`)
  t.is(res.body, 'get')
})

test('prevent send if get throws an error', async t => {
  t.plan(1)
  let isSendCalled = false
  const url = await runServer(
    t,
    cacheableResponse({
      compress: true,
      get: () => {
        throw Error()
      },
      send: ({ res }) => {
        isSendCalled = true
        res.end('Hello World')
      }
    }),
    { throwErrors: false }
  )
  try {
    await got(`${url}/kikobeats`, { retry: 0 })
  } catch (err) {
    t.false(isSendCalled)
  }
})

test('return empty 304 response when If-None-Match matches ETag', async t => {
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
  const { body, statusCode } = await got(`${url}/kikobeats`, {
    headers: { 'If-None-Match': headers.etag }
  })
  t.is(statusCode, 304)
  t.is(body, '')
})

test('scheme-relative request targets do not poison the origin-form cache', async t => {
  const url = await runServer(
    t,
    cacheableResponse({
      staleTtl: false,
      get: ({ req }) => ({
        data: { path: req.url },
        ttl: 86400000,
        createdAt: Date.now()
      }),
      send: ({ data, res }) => {
        res.end(data.path)
      }
    })
  )

  const poisoned = await rawRequest(url, '//evil.com/')
  t.is(poisoned.body, '//evil.com/')
  t.is(poisoned.headers['x-cache-status'], 'MISS')

  const home = await rawRequest(url, '/')
  t.is(home.body, '/')
  t.is(home.headers['x-cache-status'], 'MISS')

  await rawRequest(url, '//evil.com/?force=true')
  const homeAfterForce = await rawRequest(url, '/')
  t.is(homeAfterForce.body, '/')
  t.is(homeAfterForce.headers['x-cache-status'], 'HIT')
})
