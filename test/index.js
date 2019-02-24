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

test('.get is required', t => {
  const error = t.throws(() => cacheableResponse({}))
  t.true(error instanceof AssertionError)
  t.is(error.message, '.get required')
})

test('.send is required', t => {
  const error = t.throws(() => cacheableResponse({ get: true }))
  t.true(error instanceof AssertionError)
  t.is(error.message, '.send required')
})

test('default ttl and revalidate', async t => {
  const url = await createServer({
    get: ({ req, res }) => ({ data: { foo: 'bar' } }),
    send: ({ data, headers, res, req, ...props }) =>
      res.end('Welcome to Micro')
  })
  const { headers } = await got(`${url}/kikobeats`)
  t.is(
    headers['cache-control'],
    'public, max-age=7200, s-maxage=7200, stale-while-revalidate=300'
  )
})

test('custom ttl', async t => {
  const url = await createServer({
    get: ({ req, res }) => ({ data: { foo: 'bar' }, ttl: 86400000 }),
    send: ({ data, headers, res, req, ...props }) =>
      res.end('Welcome to Micro')
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
    send: ({ data, headers, res, req, ...props }) =>
      res.end('Welcome to Micro')
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
    send: ({ data, headers, res, req, ...props }) =>
      res.end('Welcome to Micro')
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

test('force query params to invalidate', async t => {
  const url = await createServer({
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
  t.is(
    headersOne['cache-control'],
    'public, max-age=86400, s-maxage=86400, stale-while-revalidate=3600'
  )
  const { headers: headersTwo } = await got(`${url}/kikobeats`)
  t.is(headersTwo['x-cache-status'], 'HIT')
  const { headers: headersThree } = await got(`${url}/kikobeats?force=true`)
  t.is(headersThree['x-cache-status'], 'MISS')
  t.is(headersThree['x-cache-expired-at'], '0ms')
  t.is(
    headersThree['cache-control'],
    'public, max-age=0, s-maxage=0, stale-while-revalidate=0'
  )
  const { headers: headersFour } = await got(`${url}/kikobeats`)
  t.is(headersFour['x-cache-status'], 'HIT')
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
