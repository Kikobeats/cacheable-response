const { AssertionError } = require('assert')

const listen = require('test-listen')
const micro = require('micro')
const Keyv = require('keyv')
const test = require('ava')
const got = require('got')

const cacheableResponse = require('..')

const createServer = props => {
  const server = cacheableResponse(props)
  const api = micro((req, res) => server({ req, res }))
  return listen(api)
}

const parseCacheControl = headers => {
  const header = headers['cache-control']
  return header.split(', ').reduce((acc, rawKey) => {
    let value = true
    let key = rawKey
    if (rawKey.includes('=')) {
      const [parsedKey, parsedValue] = rawKey.split('=')
      key = parsedKey
      value = Number(parsedValue)
    }
    return { ...acc, [key]: value }
  }, {})
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
    send: ({ data, headers, res, req, ...props }) => {
      res.end('Welcome to Micro')
    }
  })

  const { headers } = await got(`${url}/kikobeats`)
  const cacheControl = parseCacheControl(headers)

  t.true(cacheControl.public)
  t.true(cacheControl['must-revalidate'])
  t.true([7199, 7200].includes(cacheControl['max-age']))
  t.true([7199, 7200].includes(cacheControl['s-maxage']))
  t.true([1439, 1440].includes(cacheControl['stale-while-revalidate']))
  t.true([1439, 1440].includes(cacheControl['stale-if-error']))
})

test('custom ttl', async t => {
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

test('custom revalidate', async t => {
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

test('custom fixed revalidate', async t => {
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

test('disable revalidation', async t => {
  const url = await createServer({
    revalidate: false,
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
  t.false(!!cacheControl['stale-while-revalidate'])
  t.false(!!cacheControl['stale-if-error'])
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
  // t.snapshot(parseCacheControl(headersOne))

  const { headers: headersTwo } = await got(`${url}/kikobeats`)
  t.is(headersTwo['x-cache-status'], 'HIT')

  const { headers: headersThree } = await got(`${url}/kikobeats?force=true`)
  t.is(headersThree['x-cache-status'], 'MISS')
  t.is(headersThree['x-cache-expired-at'], '0ms')
  // t.snapshot(parseCacheControl(headersThree))

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

test('return HIT after empty 304 response', async t => {
  const cache = new Keyv({ namespace: 'ssr' })
  const url = await createServer({
    cache,
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
  const { headers: headersOne } = await got(`${url}/kikobeats`)
  await cache.clear()
  await got(`${url}/kikobeats`, {
    headers: { 'If-None-Match': headersOne.etag }
  })
  const { headers: headersTwo } = await got(`${url}/kikobeats`)
  t.is(headersTwo['x-cache-status'], 'HIT')
})
