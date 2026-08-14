'use strict'

const { connect } = require('net')
const test = require('ava')
const got = require('got')

const cacheableResponse = require('..')
const { runServer } = require('./helpers')

// got/http.get parse `//host` as a scheme-relative URL and leave the server.
const rawRequest = (url, target) =>
  new Promise((resolve, reject) => {
    const socket = connect(Number(url.port), url.hostname, () => {
      socket.write(
        `GET ${target} HTTP/1.1\r\nHost: ${url.host}\r\nConnection: close\r\n\r\n`
      )
    })
    let raw = ''
    socket.setEncoding('utf8')
    socket.on('data', chunk => {
      raw += chunk
    })
    socket.on('error', reject)
    socket.on('end', () => {
      const separator = raw.indexOf('\r\n\r\n')
      const headerLines = raw.substring(0, separator).split('\r\n').slice(1)
      const headers = {}
      for (const line of headerLines) {
        const index = line.indexOf(':')
        if (index !== -1) {
          headers[line.slice(0, index).toLowerCase()] = line.slice(index + 1).trim()
        }
      }
      resolve({
        statusCode: Number(raw.substring(9, 12)),
        headers,
        body: raw.substring(separator + 4)
      })
    })
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
