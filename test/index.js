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

test('default ttl and revalidate', async t => {
  const url = await createServer({
    get: ({ req, res }) => ({ data: { foo: 'bar' } }),
    send: ({ data, headers, res, req, ...props }) => res.end('Welcome to Micro')
  })
  const { headers } = await got(`${url}/kikobeats`)
  t.is(headers['cache-control'], 'public, max-age=7200, s-maxage=7200, stale-while-revalidate=300')
})

test('custom ttl', async t => {
  const url = await createServer({
    get: ({ req, res }) => ({ data: { foo: 'bar' }, ttl: 86400000 }),
    send: ({ data, headers, res, req, ...props }) => res.end('Welcome to Micro')
  })
  const { headers } = await got(`${url}/kikobeats`)
  t.is(
    headers['cache-control'],
    'public, max-age=86400, s-maxage=86400, stale-while-revalidate=3600'
  )
})

test('custom revalidate', async t => {
  const url = await createServer({
    revalidate: ttl => ttl * 0.8,
    get: ({ req, res }) => ({ data: { foo: 'bar' }, ttl: 86400000 }),
    send: ({ data, headers, res, req, ...props }) => res.end('Welcome to Micro')
  })
  const { headers } = await got(`${url}/kikobeats`)
  t.is(
    headers['cache-control'],
    'public, max-age=86400, s-maxage=86400, stale-while-revalidate=69120'
  )
})

test('custom fixed revalidate', async t => {
  const url = await createServer({
    revalidate: 300000,
    get: ({ req, res }) => ({ data: { foo: 'bar' }, ttl: 86400000 }),
    send: ({ data, headers, res, req, ...props }) => res.end('Welcome to Micro')
  })
  const { headers } = await got(`${url}/kikobeats`)
  t.is(
    headers['cache-control'],
    'public, max-age=86400, s-maxage=86400, stale-while-revalidate=300'
  )
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
