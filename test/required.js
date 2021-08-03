'use strict'

const test = require('ava')

const cacheableResponse = require('..')

const { AssertionError } = require('assert')

test('.get', t => {
  const error = t.throws(() => cacheableResponse({}))
  t.true(error instanceof AssertionError)
  t.is(error.message, '.get required')
})

test('.send', t => {
  const error = t.throws(() => cacheableResponse({ get: true }))
  t.true(error instanceof AssertionError)
  t.is(error.message, '.send required')
})
