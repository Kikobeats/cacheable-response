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

test.serial(
  'default createdAt is persisted so HIT max-age shrinks',
  async t => {
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
  }
)

test.serial('compressed entries expire on their own ttl', async t => {
  const realNow = Date.now
  let now = 1_700_000_000_000
  Date.now = () => now
  t.teardown(() => {
    Date.now = realNow
  })

  let calls = 0
  const url = await runServer(
    t,
    cacheableResponse({
      compress: true,
      ttl: 86400000,
      staleTtl: false,
      get: () => {
        calls += 1
        return { data: { n: calls }, ttl: 1000 }
      },
      send: ({ data, res }) => res.end(String(data.n))
    })
  )

  const miss = await got(`${url}/kikobeats`)
  t.is(miss.headers['x-cache-status'], 'MISS')
  t.is(miss.body, '1')

  now += 5000

  const expired = await got(`${url}/kikobeats`)
  t.is(expired.headers['x-cache-status'], 'EXPIRED')
  t.is(expired.body, '2')
})

test.serial('compressed entries honor a per-entry staleTtl', async t => {
  const realNow = Date.now
  let now = 1_700_000_000_000
  Date.now = () => now
  t.teardown(() => {
    Date.now = realNow
  })

  let calls = 0
  const url = await runServer(
    t,
    cacheableResponse({
      compress: true,
      ttl: 86400000,
      staleTtl: false,
      get: () => {
        calls += 1
        return { data: { n: calls }, ttl: 20000, staleTtl: 15000 }
      },
      send: ({ data, res }) => res.end(String(data.n))
    })
  )

  const miss = await got(`${url}/kikobeats`)
  t.is(miss.headers['x-cache-status'], 'MISS')
  t.is(miss.body, '1')

  const hit = await got(`${url}/kikobeats`)
  t.is(hit.headers['x-cache-status'], 'HIT')
  t.is(hit.body, '1')

  now += 6000

  const stale = await got(`${url}/kikobeats`)
  t.is(stale.headers['x-cache-status'], 'STALE')
  t.is(stale.body, '1')
  await new Promise(resolve => setImmediate(resolve))
  t.is(calls, 2)
})

test.serial('compressed entries honor ttl and staleTtl functions', async t => {
  const realNow = Date.now
  let now = 1_700_000_000_000
  Date.now = () => now
  t.teardown(() => {
    Date.now = realNow
  })

  let calls = 0
  const url = await runServer(
    t,
    cacheableResponse({
      compress: true,
      ttl: value => value.seconds * 1000,
      staleTtl: value => value.staleSeconds * 1000,
      get: () => {
        calls += 1
        return { data: { n: calls }, seconds: 20, staleSeconds: 15 }
      },
      send: ({ data, res }) => res.end(String(data.n))
    })
  )

  const miss = await got(`${url}/kikobeats`)
  t.is(miss.headers['x-cache-status'], 'MISS')
  t.is(miss.body, '1')
  t.is(parseCacheControl(miss.headers)['max-age'], 20)
  t.is(parseCacheControl(miss.headers)['stale-while-revalidate'], 15)

  const hit = await got(`${url}/kikobeats`)
  t.is(hit.headers['x-cache-status'], 'HIT')
  t.is(hit.body, '1')

  now += 6000

  const stale = await got(`${url}/kikobeats`)
  t.is(stale.headers['x-cache-status'], 'STALE')
  t.is(stale.body, '1')
  await new Promise(resolve => setImmediate(resolve))
  t.is(calls, 2)
})

test('a compressed field on the value is not the storage envelope', async t => {
  const url = await runServer(
    t,
    cacheableResponse({
      compress: true,
      ttl: 3600000,
      staleTtl: 120000,
      get: () => ({ data: { foo: 'bar' }, compressed: { algo: 'br' } }),
      send: ({ data, compressed, res }) =>
        res.end(`${data.foo}|${compressed.algo}`)
    })
  )

  const miss = await got(`${url}/kikobeats`)
  t.is(miss.headers['x-cache-status'], 'MISS')
  t.is(miss.body, 'bar|br')
  const missCache = parseCacheControl(miss.headers)
  t.true([3600, 3599].includes(missCache['max-age']))
  t.true([120, 119].includes(missCache['stale-while-revalidate']))
  t.true([120, 119].includes(missCache['stale-if-error']))

  const hit = await got(`${url}/kikobeats`)
  t.is(hit.headers['x-cache-status'], 'HIT')
  t.is(hit.body, 'bar|br')
  const hitCache = parseCacheControl(hit.headers)
  t.true([3600, 3599].includes(hitCache['max-age']))
  t.true([120, 119].includes(hitCache['stale-while-revalidate']))
})
