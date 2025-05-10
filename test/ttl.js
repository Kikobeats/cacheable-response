'use strict'

const test = require('ava')
const got = require('got')

const cacheableResponse = require('..')
const { parseCacheControl, runServer } = require('./helpers')

test('as value', async t => {
  const url = await runServer(
    t,
    cacheableResponse({
      ttl: 3600000,
      staleTtl: 720000,
      get: ({ req, res }) => ({ data: { foo: 'bar' } }),
      send: ({ data, headers, res, req, ...props }) => {
        res.end('Hello World')
      }
    })
  )
  const { headers } = await got(`${url}/kikobeats`)
  const cacheControl = parseCacheControl(headers)
  t.true(cacheControl.public)
  t.true(cacheControl.immutable)
  t.true([3600, 3599].includes(cacheControl['max-age']))
  t.true([720, 719].includes(cacheControl['stale-while-revalidate']))
  t.true([720, 719].includes(cacheControl['stale-if-error']))
})

test('from value', async t => {
  const url = await runServer(
    t,
    cacheableResponse({
      staleTtl: 17280000,
      get: ({ req, res }) => ({ data: { foo: 'bar' }, ttl: 86400000 }),
      send: ({ data, headers, res, req, ...props }) => {
        res.end('Hello World')
      }
    })
  )
  const { headers } = await got(`${url}/kikobeats`)
  const cacheControl = parseCacheControl(headers)
  t.true(cacheControl.public)
  t.true(cacheControl.immutable)
  t.true([86399, 86400].includes(cacheControl['max-age']))
  t.true([17279, 17280].includes(cacheControl['stale-while-revalidate']))
  t.true([17279, 17280].includes(cacheControl['stale-if-error']))
})

test('sets default ttl', async t => {
  const url = await runServer(
    t,
    cacheableResponse({
      get: ({ req, res }) => ({ data: { foo: 'bar' } }),
      send: ({ data, headers, res, req, ...props }) => {
        res.end('Hello World')
      }
    })
  )
  const { headers } = await got(`${url}/kikobeats`)
  const cacheControl = parseCacheControl(headers)
  t.true(cacheControl.public)
  t.true(cacheControl.immutable)
  t.true([86400, 86399].includes(cacheControl['max-age']))
})
