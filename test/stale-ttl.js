'use strict'

const test = require('ava')
const got = require('got')

const cacheableResponse = require('..')
const { parseCacheControl, createServer } = require('./helpers')

test('enabled by default', async t => {
  const url = await createServer(
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
  t.true([86399, 86400].includes(cacheControl['max-age']))
  t.true([3600, 3599].includes(cacheControl['stale-while-revalidate']))
  t.true([3600, 3599].includes(cacheControl['stale-if-error']))
})

test('as value', async t => {
  const url = await createServer(
    cacheableResponse({
      staleTtl: 300000,
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
  t.true([86399, 86400].includes(cacheControl['max-age']))
  t.true([299, 300].includes(cacheControl['stale-while-revalidate']))
  t.true([299, 300].includes(cacheControl['stale-if-error']))
})
