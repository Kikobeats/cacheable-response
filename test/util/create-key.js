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

test('request targets are keyed by raw path', t => {
  const key = createKey('force')
  t.deepEqual(key({ req: { url: '//evil.com/' } }), ['//evil.com/', false])
  t.deepEqual(key({ req: { url: '//evil.com/about?force=true' } }), [
    '//evil.com/about',
    true
  ])
  t.deepEqual(key({ req: { url: '//evil.com/?utm_source=twitter' } }), [
    '//evil.com/',
    false
  ])
  t.deepEqual(key({ req: { url: '//x/../../' } }), ['//x/../../', false])
  t.deepEqual(key({ req: { url: '//x/../../about' } }), [
    '//x/../../about',
    false
  ])
  t.deepEqual(key({ req: { url: 'http://evil.com/' } }), [
    'http://evil.com/',
    false
  ])
  t.not(key({ req: { url: '//evil.com/' } })[0], '/')
  t.not(key({ req: { url: '//evil.com/about' } })[0], '/about')
  t.not(key({ req: { url: '//x/../../' } })[0], '/')
  t.not(key({ req: { url: '//x/../../about' } })[0], '/about')
  t.not(key({ req: { url: 'http://evil.com/' } })[0], '/')
})
