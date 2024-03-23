'use strict'

const { default: listen } = require('async-listen')
const { createServer } = require('http')

const closeServer = server =>
  require('util').promisify(server.close.bind(server))()

const runServer = async (t, handler, { throwErrors = true } = {}) => {
  const server = createServer(async (req, res) => {
    try {
      await handler({ req, res })
    } catch (error) {
      console.error(error)
      if (throwErrors) throw error
      res.statusCode = 500
      res.end()
    }
  })

  const url = await listen(server)
  t.teardown(() => closeServer(server))
  return url
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
