'use strict'

const test = require('ava')

const { createKey } = require('../../src/util')

test('default key dedupe requests', t => {
  t.deepEqual(
    createKey('force')({
      req: {
        url: '/kikobeats?foo=bar&force'
      }
    }),
    ['/kikobeats?foo=bar', true]
  )
  t.deepEqual(
    createKey('force')({
      req: {
        url: '/kikobeats?foo=bar&force=true'
      }
    }),
    ['/kikobeats?foo=bar', true]
  )
  t.deepEqual(
    createKey('force')({
      req: {
        url: '/kikobeats?foo=bar&force',
        query: {
          force: true
        }
      }
    }),
    ['/kikobeats?foo=bar', true]
  )
  t.deepEqual(
    createKey('force')({
      req: {
        url: '/kikobeats?foo=bar'
      }
    }),
    ['/kikobeats?foo=bar', false]
  )
  t.deepEqual(
    createKey('bypass')({
      req: {
        url: '/kikobeats?foo=bar&bypass=true'
      }
    }),
    ['/kikobeats?foo=bar', true]
  )
  t.deepEqual(
    createKey('bypass')({
      req: {
        url: '/kikobeats?foo=bar&bypass=true&utm_source=twitter'
      }
    }),
    ['/kikobeats?foo=bar', true]
  )
})

test('dot-segment request targets keep their path', t => {
  t.deepEqual(createKey('force')({ req: { url: '/ok/%2e%2e/' } }), [
    '/ok/%2e%2e/',
    false
  ])
  t.deepEqual(createKey('force')({ req: { url: '/ok/%2e%2e' } }), [
    '/ok/%2e%2e',
    false
  ])
  t.deepEqual(createKey('force')({ req: { url: '/foo/%2e%2e/secret' } }), [
    '/foo/%2e%2e/secret',
    false
  ])
  t.deepEqual(createKey('force')({ req: { url: '/foo/../secret' } }), [
    '/foo/../secret',
    false
  ])
  t.deepEqual(createKey('force')({ req: { url: '/./secret' } }), [
    '/./secret',
    false
  ])
  t.notDeepEqual(
    createKey('force')({ req: { url: '/ok/%2e%2e/' } })[0],
    createKey('force')({ req: { url: '/' } })[0]
  )
  t.notDeepEqual(
    createKey('force')({ req: { url: '/foo/%2e%2e/secret' } })[0],
    createKey('force')({ req: { url: '/secret' } })[0]
  )
})

test('scheme-relative request targets keep their path', t => {
  t.deepEqual(createKey('force')({ req: { url: '//evil.com/' } }), [
    '//evil.com/',
    false
  ])
  t.deepEqual(
    createKey('force')({ req: { url: '//evil.com/about?force=true' } }),
    ['//evil.com/about', true]
  )
  t.notDeepEqual(
    createKey('force')({ req: { url: '//evil.com/' } })[0],
    createKey('force')({ req: { url: '/' } })[0]
  )
})

test('absolute-form request targets key by the raw path', t => {
  t.deepEqual(
    createKey('force')({ req: { url: 'http://example.com/foo/%2e%2e/secret' } }),
    ['/foo/%2e%2e/secret', false]
  )
  t.deepEqual(
    createKey('force')({ req: { url: 'http://example.com/kikobeats?foo=bar' } }),
    ['/kikobeats?foo=bar', false]
  )
})
