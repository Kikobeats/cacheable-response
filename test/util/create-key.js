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

test('scheme-relative request targets keep their path', t => {
  t.deepEqual(createKey('force')({ req: { url: '//evil.com/' } }), [
    '//evil.com/',
    false
  ])
  t.deepEqual(
    createKey('force')({ req: { url: '//evil.com/about?force=true' } }),
    ['//evil.com/about', true]
  )
  t.deepEqual(
    createKey('force')({ req: { url: '//evil.com/?utm_source=twitter' } }),
    ['//evil.com/', false]
  )
  t.notDeepEqual(
    createKey('force')({ req: { url: '//evil.com/' } })[0],
    createKey('force')({ req: { url: '/' } })[0]
  )
  t.notDeepEqual(
    createKey('force')({ req: { url: '//evil.com/about' } })[0],
    createKey('force')({ req: { url: '/about' } })[0]
  )
})
