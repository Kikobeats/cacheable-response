# cacheable-response

![Last version](https://img.shields.io/github/tag/Kikobeats/cacheable-response.svg?style=flat-square)
[![Build Status](https://img.shields.io/travis/Kikobeats/cacheable-response/master.svg?style=flat-square)](https://travis-ci.org/Kikobeats/cacheable-response)
[![Coverage Status](https://img.shields.io/coveralls/Kikobeats/cacheable-response.svg?style=flat-square)](https://coveralls.io/github/Kikobeats/cacheable-response)
[![Dependency status](https://img.shields.io/david/Kikobeats/cacheable-response.svg?style=flat-square)](https://david-dm.org/Kikobeats/cacheable-response)
[![Dev Dependencies Status](https://img.shields.io/david/dev/Kikobeats/cacheable-response.svg?style=flat-square)](https://david-dm.org/Kikobeats/cacheable-response#info=devDependencies)
[![NPM Status](https://img.shields.io/npm/dm/cacheable-response.svg?style=flat-square)](https://www.npmjs.org/package/cacheable-response)

> An HTTP compliant route path middleware for serving cache response with invalidation support.

## Why

Server Side Rendering (_SSR_) is a luxurious but necessary thing if you want to have a first class user experience.

The main issue of doing server-side things is the extra cost associated with dynamic things: The server will take CPU cycles to compute the value to be served, probably discarded in the next page reload, losing precious resources in the process.

Instead of serving a real time™ – and costly – response, we can say it is OK serving a pre-calculated response but much much cheaper.

That will save CPU cycles, saving them for things that really matters.

## Install

```bash
$ npm install cacheable-response --save
```

## Get Started

**cacheable-response** is a HTTP middleware for a serving pre-calculated response.

It's like a LRU cache but with all the logic necessary for auto-invalidate response copies and refresh them.

Imagine you are currently running an HTTP microservice to compute something heavy in terms of CPU

```js
const server = ({ req, res }) => {
  const data = doSomething(req)
  res.send(data)
}
```

To leverage caching capabilities, just you need to adapt your HTTP based project a bit for following **cacheable-response** interface

```js
const cacheableResponse = require('cacheable-response')

const ssrCache = cacheableResponse({
  get: ({ req, res }) => ({
    data: doSomething(req),
    ttl: 7200000 // 2 hours
  }),
  send: ({ data, res, req }) => res.send(data)
})
```

At least, **cacheable-response** needs two things:

- **get**: The method to be called for creating a fresh cacheable response associated with the current route path.
- **send**: It determines how the response should be rendered.

**cacheable-response** is _framework agnostic_: It could be used with any library that accepts `(request, response)` as input.

```js
const micro = require('micro')

/* Explicitly pass `cacheable-response` as server */
micro((req, res) => ssrCache({ req, res }))
```

That's include any express-like framework as well.

```js
const express = require('express')
const app = express()

/* Passing `cacheable-response` instance as middleware */
app.use((req, res) => ssrCache({ req, res }))
```

See more [examples](#examples).

At all times the cache status is reflected as `x-cache` headers in the response.

The first resource access will be a `MISS`.

```bash
HTTP/2 200
cache-control: public, max-age=7200, s-maxage=7200, stale-while-revalidate=300
ETag: "d-pedE0BZFQNM7HX6mFsKPL6l+dUo"
x-cache-status: MISS
x-cache-expired-at: 1h 59m 60s
```

Successive resource access under the `ttl` period returns a `HIT`

```bash
HTTP/2 200
cache-control: public, max-age=7170
cache-control: public, max-age=7170, s-maxage=7170, stale-while-revalidate=298
ETag: "d-pedE0BZFQNM7HX6mFsKPL6l+dUo"
x-cache-status: HIT
x-cache-expired-at: 1h 59m 30s
```

After `ttl` period expired, the cache will be invalidated and refreshed in the next request.

In case you need you can force invalidate a cache response passing `force=true` as part of your query parameters.

```bash
curl https://myserver.dev/user # MISS (first access)
curl https://myserver.dev/user # HIT (served from cache)
curl https://myserver.dev/user # HIT (served from cache)
curl https://myserver.dev/user?force=true # MISS (forcing invalidation)
```

## API

### cacheableResponse([options])

#### options

##### cache

Type: `boolean`<br/>
Default: `new Keyv({ namespace: 'ssr' })`

The cache instance used for backed your pre-calculated server side response copies.

The library delegates in [keyv](https://github.com/lukechilds/keyv), a tiny key value store with [multi adapter support](https://github.com/lukechilds/keyv#official-storage-adapters).

If you don't specify it, a memory cache will be used.

##### ttl

Type: `number`<br/>
Default: `7200000`

Number of milliseconds a cache response is considered valid.

After this period of time, the cache response should be refreshed.

This value can be specified as well providing it as part of [`.get`](#get) output.

If you don't provide one, this be used as fallback for avoid keep things into cache forever.

##### serialize

Type: `function`<br/>
Default: `JSON.stringify`

Set the serializer method to be used before compress.

##### deserialize

Type: `function`<br/>
Default: `JSON.parse`

Set the deserialize method to be used after decompress.

##### compress

Type: `boolean`<br/>
Default: `false`

Enable compress/decompress data using brotli compression format.

If you enable it, you need to an additional `iltorb` package:

```bash
npm install iltorb
```

##### revalidate

Type: `function`|`number`<br/>
Default: `ttl => ttl / 24`

Number of milliseconds that indicates grace period after response cache expiration for refreshing it in the background. the latency of the refresh is hidden from the user.

You can provide a function, it will receive [`ttl`](#ttl) as first parameter or a fixed value.

The value will be associated with [`stale-while-revalidate`](https://www.mnot.net/blog/2014/06/01/chrome_and_stale-while-revalidate) directive.

##### getKey

Type: `function`<br/>
Default: `req => normalizeUrl(req.url)`

It determinates how the cache key should be computed using `req` as input.

##### get

_Required_<br/>
Type: `function`<br/>

The method to be called for creating a fresh cacheable response associated with the current route path.

```js
async function get ({ req, res }) {
  const data = doSomething(req, res)
  const ttl = 7200000 // 2 hours
  return { data, ttl }
}
```

The method will received `({ req, res })` and it should be returns:

- **data** `string`: The content to be saved on the cache.
- **ttl** `number`: The quantity of time in milliseconds the content is considered valid on the cache. Don't specify it means use default [`ttl`](#ttl).
- **createdAt** `date`: The timestamp associated with the content (`Date.now()` by default).

Any other property can be specified and will passed to `.send`.

##### send

_Required_<br/>
Type: `function`<br/>

The method used to determinate how the content should be rendered.

```js
async function get ({ req, res }) {
  const data = doSomething(req, res)
  const ttl = 7200000 // 2 hours
  const headers = { userAgent: 'cacheable-response' }
  return { data, ttl, headers }
}

async function set ({ req, res, data, headers }) {
  res.setHeader('user-agent', headers.userAgent)
  res.send(data)
}
```

It will receive `({ req, res, data, ...props })` being `props` any other data supplied to `.get`.

## Pro-tip: Distributed cache with CloudFlare™️

> This content is not sponsored; Just I consider CloudFlare is doing a good job offering a cache layer as part of their free tier.

Imagine what could be better than having one cache layer?

Exactly, two cache layers.

If your server domain is connected with CloudFlare you can take advantage of having a distributed CDN that also caches your responses.

![](https://i.imgur.com/2BCHVzh.png)

For doing that, you need to setup a `Page Rule` over your domain specifing you want to enable cache. [Read more how to do that](https://support.cloudflare.com/hc/en-us/articles/115000150272-How-do-I-use-Cache-Everything-with-Cloudflare-).

Next time you query about a resource, a new `cf-cache-status` appeared as part of your headers response.

```bash
HTTP/2 200
cache-control: public, max-age=7200, s-maxage=7200, stale-while-revalidate=300
ETag: "d-pedE0BZFQNM7HX6mFsKPL6l+dUo"
x-cache-status: MISS
x-cache-expired-at: 1h 59m 60s
cf-cache-status: MISS
```

CloudFlare will [respect your `cache-control` policy](https://support.cloudflare.com/hc/en-us/articles/202775670-How-Do-I-Tell-Cloudflare-What-to-Cache-), creating another caching layer reflected by `cf-cache-status`

```bash
HTTP/2 200
cache-control: public, max-age=7200, s-maxage=7200, stale-while-revalidate=300
ETag: "d-pedE0BZFQNM7HX6mFsKPL6l+dUo"
x-cache-status: MISS
x-cache-expired-at: 1h 59m 60s
cf-cache-status: HIT
```

Note how in this second request `x-cache-status` is still
`MISS`.

That's because CloudFlare way for caching the content includes caching the response headers.

The headers associated with the cache copy will the headers from the first request. You need to look at `cf-cache-status` instead.

You can have a better overview of the percentage of success by looking your CloudFlare domain analytics

![](https://i.imgur.com/1Eg64YS.png)

## Examples

> Make a PR for adding your project!

### Express

- [`unavatar.now.sh`](https://github.com/Kikobeats/unavatar/blob/master/src/index.js#L12)
- [`html-microservice`](https://github.com/microlinkhq/html/blob/master/src/index.js#L9)

### Next.js

- [`ssr-caching`](https://github.com/zeit/next.js/tree/canary/examples/ssr-caching)

## Bibliography

- [Server rendered pages are not optional, by Guillermo Rauch](https://rauchg.com/2014/7-principles-of-rich-web-applications#server-rendered-pages-are-not-optional).
- [Increasing the Performance of Dynamic Next.JS Websites, by scale AI](https://scale.ai/blog/performance-on-next-js-websites).
- [The Benefits of Microcaching, by NGINX](https://www.nginx.com/blog/benefits-of-microcaching-nginx/).
- [Cache-Control for Civilians, by Harry Robert](https://csswizardry.com/2019/03/cache-control-for-civilians/)

## License

**cacheable-response** © [Kiko Beats](https://kikobeats.com), released under the [MIT](https://github.com/Kikobeats/cacheable-response/blob/master/LICENSE.md) License.<br/>
Authored and maintained by Kiko Beats with help from [contributors](https://github.com/Kikobeats/cacheable-response/contributors).

> [kikobeats.com](https://kikobeats.com) · GitHub [Kiko Beats](https://github.com/Kikobeats) · Twitter [@Kikobeats](https://twitter.com/Kikobeats)
