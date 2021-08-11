'use strict'

const test = require('ava')

const { getKey } = require('../src/util')

test('default getKey dedupe requests', t => {
  t.is(
    getKey(
      {
        req: {
          url: '/kikobeats?foo=bar&force'
        }
      },
      { bypassQueryParameter: 'force' }
    ),
    '/kikobeats?foo=bar'
  )
  t.is(
    getKey(
      {
        req: {
          url: '/kikobeats?foo=bar&force=true'
        }
      },
      { bypassQueryParameter: 'force' }
    ),
    '/kikobeats?foo=bar'
  )
  t.is(
    getKey(
      {
        req: {
          url: '/kikobeats?foo=bar&bypass=true'
        }
      },
      { bypassQueryParameter: 'bypass' }
    ),
    '/kikobeats?foo=bar'
  )
  t.is(
    getKey(
      {
        req: {
          url: '/kikobeats?foo=bar&bypass=true&utm_source=twitter'
        }
      },
      { bypassQueryParameter: 'bypass' }
    ),
    '/kikobeats?foo=bar'
  )
})
