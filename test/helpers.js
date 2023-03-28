'use strict'

const { default: listen } = require('async-listen')
const { createServer } = require('http')

const runServer = async handler => {
  const server = createServer(async (req, res) => {
    try {
      await handler({ req, res })
    } catch (error) {
      console.error(error)
      res.statusCode = 500
      res.end()
    }
  })
  return listen(server)
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
  runServer
}
