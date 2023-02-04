'use strict'

const { once } = require('events')
const http = require('http')

const createServer = async handler => {
  const server = http.createServer(async (req, res) => {
    try {
      await handler({ req, res })
    } catch (error) {
      console.error(error)
      res.statusCode = 500
      res.end()
    }
  })
  server.listen()
  await once(server, 'listening')
  const { address, port, family } = server.address()
  return `http://${family === 'IPv6' ? `[${address}]` : address}:${port}/`
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
