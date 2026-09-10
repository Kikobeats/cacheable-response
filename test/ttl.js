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
  t.true(cacheControl['must-revalidate'])
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
  t.true(cacheControl['must-revalidate'])
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
  t.true(cacheControl['must-revalidate'])
  t.true([86400, 86399].includes(cacheControl['max-age']))
})

test('default createdAt is persisted so HIT max-age shrinks', async t => {
  const realNow = Date.now
  let now = 1_700_000_000_000
  Date.now = () => now
  t.teardown(() => {
    Date.now = realNow
  })

  const url = await runServer(
    t,
    cacheableResponse({
      ttl: 3600000,
      staleTtl: false,
      get: () => ({ data: { foo: 'bar' } }),
      send: ({ res }) => {
        res.end('Hello World')
      }
    })
  )

  const { headers: miss } = await got(`${url}/kikobeats`)
  t.is(miss['x-cache-status'], 'MISS')
  t.is(parseCacheControl(miss)['max-age'], 3600)

  now += 30_000

  const { headers: hit } = await got(`${url}/kikobeats`)
  t.is(hit['x-cache-status'], 'HIT')
  t.is(parseCacheControl(hit)['max-age'], 3570)
})
