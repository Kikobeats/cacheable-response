import { AssertionError } from 'assert'

import listen from 'test-listen'
import micro from 'micro'
import test from 'ava'
import got from 'got'

import cacheableResponse from '..'

const createServer = props => {
  const server = cacheableResponse(props)
  const api = micro((req, res) => server({ req, res }))
  return listen(api)
}

test('required props', t => {
  t.throws(() => cacheableResponse(), AssertionError, 'get is required')
  t.throws(() => cacheableResponse({}), AssertionError, 'get is required')
  t.throws(() => cacheableResponse({ get: true }), AssertionError, 'send is required')
})

test('MISS for first access', async t => {
  const url = await createServer({
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
  const { headers } = await got(`${url}/kikobeats`)
  t.is(headers['x-cache-status'], 'MISS')
})

test('HIT for second access', async t => {
  const url = await createServer({
    get: ({ req, res }) => {
      return {
        data: { foo: 'bar' },
        ttl: 10000,
        createdAt: Date.now(),
        foo: { bar: true }
      }
    },
    send: ({ data, headers, res, req, ...props }) => {
      res.end('Welcome to Micro')
    }
  })
  await got(`${url}/kikobeats`)
  const { headers } = await got(`${url}/kikobeats`)
  t.is(headers['x-cache-status'], 'HIT')
})

test('MISS after cache expiration', async t => {
  const url = await createServer({
    get: ({ req, res }) => {
      return {
        data: { foo: 'bar' },
        ttl: 1,
        createdAt: Date.now(),
        foo: { bar: true }
      }
    },
    send: ({ data, headers, res, req, ...props }) => {
      res.end('Welcome to Micro')
    }
  })
  await got(`${url}/kikobeats`)
  const { headers } = await got(`${url}/kikobeats`)
  t.is(headers['x-cache-status'], 'MISS')
})

test('etag is present', async t => {
  const url = await createServer({
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
  const { headers: headersOne } = await got(`${url}/kikobeats`)
  t.is(headersOne['x-cache-status'], 'MISS')
  const { headers: headersTwo } = await got(`${url}/kikobeats`)
  t.is(headersTwo['x-cache-status'], 'HIT')
  t.is(headersOne.etag, headersTwo.etag)
})
