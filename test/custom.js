'use strict'

const test = require('ava')
const got = require('got')

const { parseCacheControl, createServer } = require('./util')

test('ttl', async t => {
  const url = await createServer({
    get: ({ req, res }) => ({ data: { foo: 'bar' }, ttl: 86400000 }),
    send: ({ data, headers, res, req, ...props }) => {
      res.end('Welcome to Micro')
    }
  })

  const { headers } = await got(`${url}/kikobeats`)
  const cacheControl = parseCacheControl(headers)

  t.true(cacheControl.public)
  t.true(cacheControl['must-revalidate'])
  t.true([86399, 86400].includes(cacheControl['max-age']))
  t.true([17279, 17280].includes(cacheControl['stale-while-revalidate']))
  t.true([17279, 17280].includes(cacheControl['stale-if-error']))
})

test('revalidate', async t => {
  const url = await createServer({
    revalidate: ttl => ttl * 0.1,
    get: ({ req, res }) => ({ data: { foo: 'bar' }, ttl: 86400000 }),
    send: ({ data, headers, res, req, ...props }) => {
      res.end('Welcome to Micro')
    }
  })

  const { headers } = await got(`${url}/kikobeats`)
  const cacheControl = parseCacheControl(headers)

  t.true(cacheControl.public)
  t.true(cacheControl['must-revalidate'])
  t.true([86399, 86400].includes(cacheControl['max-age']))
  t.true([8639, 8640].includes(cacheControl['stale-while-revalidate']))
  t.true([8639, 8640].includes(cacheControl['stale-if-error']))
})

test('fixed revalidate', async t => {
  const url = await createServer({
    revalidate: 300000,
    get: ({ req, res }) => ({ data: { foo: 'bar' }, ttl: 86400000 }),
    send: ({ data, headers, res, req, ...props }) => {
      res.end('Welcome to Micro')
    }
  })

  const { headers } = await got(`${url}/kikobeats`)
  const cacheControl = parseCacheControl(headers)

  t.true(cacheControl.public)
  t.true(cacheControl['must-revalidate'])
  t.true([86399, 86400].includes(cacheControl['max-age']))
  t.true([299, 300].includes(cacheControl['stale-while-revalidate']))
  t.true([299, 300].includes(cacheControl['stale-if-error']))
})

test('bypass query parameter', async t => {
  const url = await createServer({
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
