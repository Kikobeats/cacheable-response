'use strict'

const test = require('ava')

const { key } = require('../../src/util')

test('default key dedupe requests', t => {
  t.is(
    key(
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
    key(
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
    key(
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
    key(
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
