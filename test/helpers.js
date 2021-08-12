'use strict'

const listen = require('test-listen')
const micro = require('micro')

const createServer = server => {
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

module.exports = {
  parseCacheControl,
  createServer
}
