'use strict'

const { writeFileSync } = require('fs')
const { join } = require('path')
const { setFlagsFromString } = require('v8')
const { runInNewContext } = require('vm')

const cacheableResponse = require('..')

const RUNS = 7
const HIT_REQUESTS = 20_000
const MISS_REQUESTS = 10_000
const NOT_MODIFIED_REQUESTS = 20_000
const COMPRESSED_REQUESTS = 2_000
const SMALL_PAGE_SECTIONS = 2
const LARGE_PAGE_SECTIONS = 200

setFlagsFromString('--expose-gc')
const collectGarbage = runInNewContext('gc')

const now = () => process.hrtime.bigint()

const elapsed = started => Number(now() - started) / 1e6

const median = values => {
  const sorted = values.slice().sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

const createPage = sections =>
  Array.from(
    { length: sections },
    (_, section) =>
      `<section id="s${section}"><h2>Section ${section}</h2><p>Lorem ipsum dolor sit amet ${section}</p></section>`
  ).join('')

const SMALL_PAGE = createPage(SMALL_PAGE_SECTIONS)
const LARGE_PAGE = createPage(LARGE_PAGE_SECTIONS)

const createRequest = (url, headers = {}) => ({ url, headers })

const createResponse = () => {
  const response = {
    statusCode: 200,
    writableEnded: false,
    headers: {},
    body: undefined,
    setHeader: (name, value) => {
      response.headers[name.toLowerCase()] = value
    },
    end: body => {
      response.body = body
      response.writableEnded = true
    }
  }
  return response
}

const createHandler = ({ page = SMALL_PAGE, ...options } = {}) =>
  cacheableResponse({
    get: ({ req }) => ({ data: `${req.url}${page}` }),
    send: ({ data, res }) => res.end(data),
    ...options
  })

const serve = async (handler, url, headers) => {
  const res = createResponse()
  await handler({ req: createRequest(url, headers), res })
  return res
}

const serveSequentially = async (handler, urlOf, count, headersOf) => {
  const tally = { statuses: {}, codes: {}, bytes: 0 }
  for (let request = 0; request < count; request++) {
    const res = await serve(handler, urlOf(request), headersOf?.(request))
    const status = res.headers['x-cache-status']
    tally.statuses[status] = (tally.statuses[status] || 0) + 1
    tally.codes[res.statusCode] = (tally.codes[res.statusCode] || 0) + 1
    if (res.statusCode === 200) tally.bytes += res.body.length
  }
  return tally
}

const pageBytes = (url, page = SMALL_PAGE) => url.length + page.length

const HIT_URL = '/blog/post?utm_source=newsletter&page=2'

const hitCase = {
  name: 'cache hit',
  extra: `${HIT_REQUESTS} requests for one cached URL`,
  setup: async state => {
    state.handler = createHandler()
    await serve(state.handler, HIT_URL)
  },
  timed: state =>
    serveSequentially(state.handler, () => HIT_URL, HIT_REQUESTS),
  verify: ({ statuses, bytes }) =>
    statuses.HIT === HIT_REQUESTS &&
    bytes === HIT_REQUESTS * pageBytes(HIT_URL)
}

const missCase = {
  name: 'cache miss',
  extra: `${MISS_REQUESTS} requests for distinct URLs into an empty cache`,
  setup: () => {},
  timed: () =>
    serveSequentially(
      createHandler(),
      request => `/item/${request}?ref=home`,
      MISS_REQUESTS
    ),
  verify: ({ statuses, bytes }) =>
    statuses.MISS === MISS_REQUESTS &&
    bytes > MISS_REQUESTS * SMALL_PAGE.length
}

const notModifiedCase = {
  name: 'cache hit 304 via If-None-Match',
  extra: `${NOT_MODIFIED_REQUESTS} conditional requests for one cached URL`,
  setup: async state => {
    state.handler = createHandler()
    const res = await serve(state.handler, HIT_URL)
    state.headers = { 'if-none-match': res.headers.etag }
  },
  timed: state =>
    serveSequentially(
      state.handler,
      () => HIT_URL,
      NOT_MODIFIED_REQUESTS,
      () => state.headers
    ),
  verify: ({ statuses, codes }) =>
    statuses.HIT === NOT_MODIFIED_REQUESTS &&
    codes[304] === NOT_MODIFIED_REQUESTS
}

const compressedHitCase = {
  name: 'cache hit with brotli compression',
  extra: `${COMPRESSED_REQUESTS} requests decompressing a ${LARGE_PAGE.length} byte page`,
  setup: async state => {
    state.handler = createHandler({ compress: true, page: LARGE_PAGE })
    await serve(state.handler, HIT_URL)
  },
  timed: state =>
    serveSequentially(state.handler, () => HIT_URL, COMPRESSED_REQUESTS),
  verify: ({ statuses, bytes }) =>
    statuses.HIT === COMPRESSED_REQUESTS &&
    bytes === COMPRESSED_REQUESTS * pageBytes(HIT_URL, LARGE_PAGE)
}

const CASES = [hitCase, missCase, notModifiedCase, compressedHitCase]

const fmt = value => value.toFixed(1)

const report = slot => {
  const med = slot.walls.length ? median(slot.walls) : Number.NaN
  const min = slot.walls.length ? Math.min(...slot.walls) : Number.NaN
  const max = slot.walls.length ? Math.max(...slot.walls) : Number.NaN
  const extra = `${slot.entry.extra}, errors ${slot.errors}, runs ${RUNS}`
  console.log(
    `${slot.entry.name}  median ${fmt(med)}ms  range ${fmt(min)}-${fmt(
      max
    )}  ${extra}`
  )
  return {
    name: slot.entry.name,
    unit: 'ms',
    value: Number(med.toFixed(1)),
    range: `${fmt(min)}-${fmt(max)}`,
    extra
  }
}

const takeSample = async (slot, run) => {
  try {
    collectGarbage()
    const started = now()
    const outcome = await slot.entry.timed(slot.state)
    const wall = elapsed(started)
    if (!slot.entry.verify(outcome)) {
      console.error(`${slot.entry.name} run ${run} produced unexpected output`)
      slot.errors++
      return
    }
    slot.walls.push(wall)
  } catch (error) {
    console.error(error)
    slot.errors++
  }
}

const main = async () => {
  const slots = []
  for (const entry of CASES) {
    const state = {}
    await entry.setup(state)
    await entry.timed(state)
    slots.push({ entry, state, walls: [], errors: 0 })
  }
  for (let run = 0; run < RUNS; run++) {
    for (const slot of slots) await takeSample(slot, run)
  }
  const results = slots.map(report)
  writeFileSync(
    join(__dirname, '..', 'benchmark-output.json'),
    JSON.stringify(results, null, 2) + '\n'
  )
  const errors = slots.reduce((total, slot) => total + slot.errors, 0)
  if (errors > 0 || results.some(result => !Number.isFinite(result.value))) {
    process.exitCode = 1
  }
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
