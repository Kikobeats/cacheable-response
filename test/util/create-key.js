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
