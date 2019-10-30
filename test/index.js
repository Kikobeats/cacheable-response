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

const getMaxAge = headers =>
  Number(
    headers['cache-control']
      .split('=')[1]
      .split(' ')[0]
      .split(',')[0]
  )

const getRevalidate = headers => Number(headers['cache-control'].split('=')[3])

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
    send: ({ data, headers, res, req, ...props }) => {
      res.end('Welcome to Micro')
    }
  })

  const { headers } = await got(`${url}/kikobeats`)
  t.true([7200, 7199].includes(getMaxAge(headers)))
  t.true([5760, 5759].includes(getRevalidate(headers)))
})

test('custom ttl', async t => {
  const url = await createServer({
    get: ({ req, res }) => ({ data: { foo: 'bar' }, ttl: 86400000 }),
    send: ({ data, headers, res, req, ...props }) => {
      res.end('Welcome to Micro')
    }
  })

  const { headers } = await got(`${url}/kikobeats`)
  t.true([86400, 86399].includes(getMaxAge(headers)))
  t.true([69120, 69119].includes(getRevalidate(headers)))
})

test('custom revalidate', async t => {
  const url = await createServer({
    revalidate: ttl => ttl * 0.8,
    get: ({ req, res }) => ({ data: { foo: 'bar' }, ttl: 86400000 }),
    send: ({ data, headers, res, req, ...props }) => {
      res.end('Welcome to Micro')
    }
  })

  const { headers } = await got(`${url}/kikobeats`)
  t.true([86400, 86399].includes(getMaxAge(headers)))
  t.true([69120, 69119].includes(getRevalidate(headers)))
})

test('custom fixed revalidate', async t => {
  const url = await createServer({
    revalidate: 300000,
    get: ({ req, res }) => ({ data: { foo: 'bar' }, ttl: 86400000 }),
    send: ({ data, headers, res, req, ...props }) => {
      res.end('Welcome to Micro')
    }
  })

  const { headers } = await got(`${url}/kikobeats`)
  t.true([86400, 86399].includes(getMaxAge(headers)))
  t.true([300, 299].includes(getRevalidate(headers)))
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
  t.true([86400, 86399].includes(getMaxAge(headersOne)))
  t.true([69120, 69119].includes(getRevalidate(headersOne)))
  const { headers: headersTwo } = await got(`${url}/kikobeats`)
  t.is(headersTwo['x-cache-status'], 'HIT')
  const { headers: headersThree } = await got(`${url}/kikobeats?force=true`)
  t.is(headersThree['x-cache-status'], 'MISS')
  t.is(headersThree['x-cache-expired-at'], '0ms')
  t.is(getMaxAge(headersThree), 0)
  t.is(getRevalidate(headersThree), 0)
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

test('compress support', async t => {
  const url = await createServer({
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
      res.end('Welcome to Micro')
    }
  })
  const { headers: headersOne } = await got(`${url}/kikobeats`)
  t.is(headersOne['x-cache-status'], 'MISS')
  const { headers: headersTwo } = await got(`${url}/kikobeats`)
  t.is(headersTwo['x-cache-status'], 'HIT')
  t.is(headersOne.etag, headersTwo.etag)
})

test('prevent send if data is undefined', async t => {
  let isSendCalled = false
  const url = await createServer({
    compress: true,
    get: ({ req, res }) => {
      throw Error()
    },
    send: ({ data, headers, res, req, ...props }) => {
      isSendCalled = true
      res.end('Welcome to Micro')
    }
  })

  try {
    await got(`${url}/kikobeats`, { retry: 0 })
  } catch (err) {
    t.false(isSendCalled)
  }
})

test('return empty 304 response when If-None-Match matches ETag', async t => {
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
  const { body, statusCode } = await got(`${url}/kikobeats`, {
    headers: { 'If-None-Match': headers.etag }
  })
  t.is(statusCode, 304)
  t.is(body, '')
})
