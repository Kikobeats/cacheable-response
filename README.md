# cacheable-response

![Last version](https://img.shields.io/github/tag/Kikobeats/cacheable-response.svg?style=flat-square)
[![Coverage Status](https://img.shields.io/coveralls/Kikobeats/cacheable-response.svg?style=flat-square)](https://coveralls.io/github/Kikobeats/cacheable-response)
[![NPM Status](https://img.shields.io/npm/dm/cacheable-response.svg?style=flat-square)](https://www.npmjs.org/package/cacheable-response)

> An HTTP compliant route path middleware for serving cache response with invalidation support.

## Why

Server Side Rendering (_SSR_) is a luxurious but necessary thing if you want to have a first class user experience.

The main issue of doing server-side things is the extra cost associated with dynamic things: The server will take CPU cycles to compute the value to be served, probably discarded in the next page reload, losing precious resources in the process.

Instead of serving a real time™ – and costly – response, we can say it is OK serving a pre-calculated response but much much cheaper.

That will save CPU cycles, saving them for things that really matters.

## Caching states

| Value    | Description                                                                                                       |
|----------|-------------------------------------------------------------------------------------------------------------------|
| `MISS`   | The resource was looked into the cache but did not find it, so a new copy is generated and placed into the cache. |
| `HIT`    | The resources was found into the cache, being generated by a previous access.                                     |
| `EXPIRED`| The resouce was found but it is expired, being necessary regerate it.                                             |
| `BYPASS` | The cache is forced to be bypassed, regenerating the resource.                                                    |
| `STALE`  | The resource is expired but it's served while a new cache copy is generated in background.                        |

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
    ttl: 86400000 // 24 hours
  }),
  send: ({ data, res, req }) => res.send(data)
})
```

At least, **cacheable-response** needs two things:

- **get**: It creates a fresh cacheable response associated with the current route path.
- **send**: It determines how the response should be rendered.

**cacheable-response** is _framework agnostic_: It could be used with any library that accepts `(request, response)` as input.

```js
const http = require('http')
/* Explicitly pass `cacheable-response` as server */
http
  .createServer((req, res) => ssrCache({ req, res }))
  .listen(3000)
```

It could be use in the express way too:

```js
const express = require('express')
const app = express()

/* Passing `cacheable-response` instance as middleware */
app
  .use((req, res) => ssrCache({ req, res }))
```

See more [examples](#examples).

At all times the cache status is reflected as `x-cache` headers in the response.

The first resource access will be a `MISS`.

```bash
HTTP/2 200
cache-control: public, max-age=7200, stale-while-revalidate=300
ETag: "d-pedE0BZFQNM7HX6mFsKPL6l+dUo"
x-cache-status: MISS
x-cache-expired-at: 1h 59m 60s
```

Successive resource access under the `ttl` period returns a `HIT`

```bash
HTTP/2 200
cache-control: public, max-age=7170, stale-while-revalidate=298
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
curl https://myserver.dev/user?force=true # BYPASS (skip cache copy)
```

In that case, the `x-cache-status` will reflect a `'BYPASS'` value.

Additionally, you can configure a stale ttl:

```js
const cacheableResponse = require('cacheable-response')

const ssrCache = cacheableResponse({
  get: ({ req, res }) => ({
    data: doSomething(req),
    ttl: 86400000, // 24 hours
    staleTtl: 3600000 // 1h
  }),
  send: ({ data, res, req }) => res.send(data)
})
```

The stale ttl maximizes your cache HITs, allowing you to serve a no fresh cache copy _while_ doing revalidation on the background. 

```bash
curl https://myserver.dev/user # MISS (first access)
curl https://myserver.dev/user # HIT (served from cache)
curl https://myserver.dev/user # STALE (23 hours later, background revalidation)
curl https://myserver.dev/user?force=true # HIT (fresh cache copy for the next 24 hours)
```

The library provides enough good sensible defaults for most common scenarios and you can tune these values based on your use case.

## API

### cacheableResponse([options])

#### options

##### bypassQueryParameter

Type: `string`<br/>
Default: `'force'`

The name of the query parameter to be used for skipping the cache copy in an intentional way.

##### cache

Type: `boolean`<br/>
Default: `new Keyv({ namespace: 'ssr' })`

The cache instance used for backed your pre-calculated server side response copies.

The library delegates in [keyv](https://keyvhq.js.org/), a tiny key value store with [multi adapter support](https://keyvhq.js.org/#/?id=storage-adapters).

If you don't specify it, a memory cache will be used.

##### compress

Type: `boolean`<br/>
Default: `false`

Enable compress/decompress data using brotli compression format.

##### get

_Required_<br/>
Type: `function`<br/>

The method to be called for creating a fresh cacheable response associated with the current route path.

```js
async function get ({ req, res }) {
  const data = doSomething(req, res)
  const ttl = 86400000 // 24 hours
  const headers = { userAgent: 'cacheable-response' }
  return { data, ttl, headers }
}
```

The method will received `({ req, res })` and it should be returns:

- **data** `object`|`string`: The content to be saved on the cache.
- **ttl** `number`: The quantity of time in milliseconds the content is considered valid on the cache. Don't specify it means use default [`ttl`](#ttl).
- **createdAt** `date`: The timestamp associated with the content (`Date.now()` by default).

Any other property can be specified and will passed to `.send`.

In case you want to bypass the cache, preventing caching a value (e.g., when an error occurred), you should return `undefined` or `null`.

##### key

Type: `function`<br/>
Default: `({ req }) => req.url)`

It specifies how to compute the cache key, taking `req, res` as input.

Alternatively, it can return an array:

```js
const key = ({ req }) => [getKey({ req }), req.query.force]
```

where the second parameter represents whether to force the cache entry to expire.

##### logger

Type: `function`<br/>
Default: `() => {}`

When it's present, every time cacheable-response is called, a log will be printed.

##### send

_Required_<br/>
Type: `function`<br/>

The method used to determinate how the content should be rendered.

```js
async function send ({ req, res, data, headers }) {
  res.setHeader('user-agent', headers.userAgent)
  res.send(data)
}
```

It will receive `({ req, res, data, ...props })` being `props` any other data supplied to `.get`.

##### staleTtl

Type: `number`|`boolean`|`function`<br/>
Default: `3600000`

Number of milliseconds that indicates grace period after response cache expiration for refreshing it in the background. The latency of the refresh is hidden from the user.

This value can be specified as well providing it as part of [`.get`](#get) output.

The value will be associated with [`stale-while-revalidate`](https://www.mnot.net/blog/2014/06/01/chrome_and_stale-while-revalidate) directive.

You can pass a `false` to disable it.

##### ttl

Type: `number`|`function`<br/>
Default: `86400000`

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

## Pro-tip: Distributed cache with CloudFlare™️

> This content is not sponsored; Just I consider CloudFlare is doing a good job offering a cache layer as part of their free tier.

Imagine what could be better than having one cache layer? Exactly, two cache layers.

If your server domain is connected with CloudFlare you can take advantage of [unlimited bandwidth usage](https://web.archive.org/web/20200428000736/https://support.cloudflare.com/hc/en-us/articles/205177068-How-does-Cloudflare-work-).

![](https://i.imgur.com/2BCHVzh.png)

For doing that, you need to setup a `Page Rule` over your domain specifing you want to enable cache. [Read more how to do that](https://web.archive.org/web/20190429045303/https://support.cloudflare.com/hc/en-us/articles/115000150272-How-do-I-use-Cache-Everything-with-Cloudflare-).

Next time you query about a resource, a new `cf-cache-status` appeared as part of your headers response.

```bash
HTTP/2 200
cache-control: public, max-age=7200, stale-while-revalidate=300
ETag: "d-pedE0BZFQNM7HX6mFsKPL6l+dUo"
x-cache-status: MISS
x-cache-expired-at: 1h 59m 60s
cf-cache-status: MISS
```

CloudFlare will [respect your `cache-control` policy](https://web.archive.org/web/20190323033009/https://support.cloudflare.com/hc/en-us/articles/202775670-How-Do-I-Tell-Cloudflare-What-to-Cache-), creating another caching layer reflected by `cf-cache-status`

```bash
HTTP/2 200
cache-control: public, max-age=7200, stale-while-revalidate=300
ETag: "d-pedE0BZFQNM7HX6mFsKPL6l+dUo"
x-cache-status: MISS
x-cache-expired-at: 1h 59m 60s
cf-cache-status: HIT
```

Note how in this second request `x-cache-status` is still a `MISS`.

That's because CloudFlare way for caching the content includes caching the response headers.

The headers associated with the cache copy will the headers from the first request. You need to look at `cf-cache-status` instead.

You can have a better overview of the percentage of success by looking your CloudFlare domain analytics

![](https://i.imgur.com/WnPnRlk.png)

## Examples

> Make a PR for adding your project!

- [`unavatar.io`](https://unavatar.io)
- [`html-microservice`](https://github.com/microlinkhq/html/blob/master/src/index.js#L9)

## Bibliography

- [Server rendered pages are not optional, by Guillermo Rauch](https://rauchg.com/2014/7-principles-of-rich-web-applications#server-rendered-pages-are-not-optional).
- [Increasing the Performance of Dynamic Next.JS Websites, by scale AI](https://scale.ai/blog/performance-on-next-js-websites).
- [The Benefits of Microcaching, by NGINX](https://www.nginx.com/blog/benefits-of-microcaching-nginx/).
- [Cache-Control for Civilians, by Harry Robert](https://csswizardry.com/2019/03/cache-control-for-civilians/)
- [Demystifying HTTP Caching, by Bharathvaj Ganesan](https://codeburst.io/demystifying-http-caching-7457c1e4eded).
- [Keeping things fresh with stale-while-revalidate, by Jeff Posnick](https://web.dev/stale-while-revalidate/).

## License

**cacheable-response** © [Kiko Beats](https://kikobeats.com), released under the [MIT](https://github.com/Kikobeats/cacheable-response/blob/master/LICENSE.md) License.<br/>
Authored and maintained by Kiko Beats with help from [contributors](https://github.com/Kikobeats/cacheable-response/contributors).

> [kikobeats.com](https://kikobeats.com) · GitHub [Kiko Beats](https://github.com/Kikobeats) · X [@Kikobeats](https://x.com/Kikobeats)
