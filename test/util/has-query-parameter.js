'use strict'

const test = require('ava')

const { hasQueryParameter } = require('../../src/util')

test('get from `req.query` when is possible', t => {
  const req = { query: { foo: 'bar' } }
  t.true(hasQueryParameter(req, 'foo'))
  t.false(hasQueryParameter(req, 'fooz'))
})

test('parse url as fallback', t => {
  const req = { url: '/?foo=bar' }
  t.true(hasQueryParameter(req, 'foo'))
  t.false(hasQueryParameter(req, 'fooz'))
})

test('parse url when req.query is a raw query string', t => {
  const req = { url: '/kikobeats?foo=bar&force=true', query: 'foo=bar&force=true' }
  t.true(hasQueryParameter(req, 'force'))
  t.true(hasQueryParameter(req, 'foo'))
  t.false(hasQueryParameter(req, 'fooz'))
})
