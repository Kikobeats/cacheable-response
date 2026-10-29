import { IncomingMessage, ServerResponse } from "http";
import Keyv = require("@keyvhq/core");

/**
 * Cacheable response is a HTTP middleware for serving a pre-calculated response.
 */

declare function CacheableResponse<
  Options extends CacheableResponse.GetOpts = CacheableResponse.GetOpts,
  Props extends CacheableResponse.Props = {},
  Data extends {} = {}
>(
  params: CacheableResponse.InputParams<Options, Props, Data>
): CacheableResponse.Handler<Options>;

declare namespace CacheableResponse {
  /** Framework agnostic req and res object */
  export interface HttpContext {
    req: IncomingMessage;
    res: ServerResponse;
  }

  /** The middleware returned by `cacheableResponse`. */
  export interface Handler<Options extends GetOpts = GetOpts> {
    (opts: Options): any;

    /** Computes the ETag the middleware sends for a given response value. */
    getEtag(input: object | string | number | boolean | null): string;
  }

  export interface SetHeadersOptions {
    /** JS timestamp of when the response was generated. */
    createdAt: number;
    etag: string;
    forceExpiration?: boolean;
    hasValue: boolean;
    isHit: boolean;
    isStale: boolean;
    preventCaching?: boolean;
    res: ServerResponse;
    /** Grace period in milliseconds, or `false` to disable it. */
    staleTtl: number | boolean;
    /** ttl in milliseconds */
    ttl: number;
  }

  /**
   * Writes the `Cache-Control`, `X-Cache-Status` and `ETag` headers the middleware sends.
   */
  export function setHeaders(options: SetHeadersOptions): void;

  export interface InputParams<
    Options extends GetOpts,
    GetReturnProps extends Props,
    Data extends {}
  > {
    /**
     * The name of the query parameter to be used for skipping the cache copy in an intentional way.
     *
     * The default value is `'force'`.
     */
     bypassQueryParameter?: string

    /**
     * The cache backing your pre-calculated server side response copies:
     * a `@keyvhq/core` instance, or the options to create one.
     *
     * The default value is `new Keyv({ namespace: 'ssr' })`, an in-memory instance.
     */
    cache?: CacheProvider;

    /**
     * Enable compress/decompress data using brotli compression format.
     *
     * The default value is `false`.
     */
    compress?: boolean;

    /**
     * The method to be called for creating a fresh cacheable response associated with the current route path.
     */
     get: (
      opts: Options
    ) => Promise<
      (Optional<Cache<Data>, "etag" | "ttl" | "createdAt"> & GetReturnProps) | null
    >;

    /**
     * It determinates how the cache key should be computed, receiving `req, res` as input.
     *
     * The default value is determining from `req.url`.
     */
    key?: (opts: Options) => string;

    /**
     * When it's present, every time cacheable-response is called, a log will be printed.
     *
     * The default value is a noop function to avoid print logs.
     */
    logger?: (payload: object) => void;

    /**
     * The method used to determinate how the content should be rendered.
     *
     * Props are checked here but not inferred from here, so a `Keyv<any>` cache
     * cannot widen them. The indexed access is `NoInfer` for TypeScript before 5.4.
     */
    send: (
      opts: [GetReturnProps][GetReturnProps extends any ? 0 : never] & { data: Data } & Pick<Options, "req" | "res">
    ) => any;

    /**
     * Number of milliseconds that indicates grace period after response cache expiration for refreshing it in the background. The latency of the refresh is hidden from the user.
     *
     * The defalut value is `3600000`.
     */
     staleTtl?: number | boolean;

    /**
     * Number of milliseconds a cache response is considered valid.
     *
     * The default value is `86400000`.
     * */
    ttl?: number;

    /**
     * It sets the serializer method to be used before compress.
     *
     * The default value is `JSON.stringify`.
     */
    serialize?: (o: any) => string;

    /**
     * It sets the deserialize method to be used after decompress.
     *
     * The default value is `JSON.parse`.
     */
    deserialize?: (o: string) => any;
  }

  export type GetOpts = HttpContext & Props;

  /**
   * Stored when `compress` is enabled.
   * Lifetimes sit beside the brotli payload so expiry does not depend on decompressing it.
   * Entries written before that are still a raw `Buffer`.
   */
  export interface CompressedEntry {
    compressed: Buffer;
    ttl: number;
    staleTtl: number | boolean;
  }

  /**
   * A `@keyvhq/core` instance is used as is.
   * Anything else is passed to `new Keyv()` as its options, and its keys are copied onto the instance,
   * so an object with its own `get`, `set`, `has`, `delete`, `clear`, `iterator`,
   * `_getKeyPrefix`, or `_getKeyUnprefix` would replace those methods instead of being a cache.
   * `_getKeyPrefix` is how a read finds the stored entry.
   * `serialize`, `deserialize`, and `ttl` are real Keyv options, so they stay allowed.
   * `constructor` is on every object, so excluding it would reject real options too.
   */
  export type CacheProvider =
    | Keyv<any>
    | (Keyv.Options<any> & {
        [Method in
          | "get"
          | "set"
          | "has"
          | "delete"
          | "clear"
          | "iterator"
          | "_getKeyPrefix"
          | "_getKeyUnprefix"]?: never;
      });

  interface Props {
    [key: string]: any;
  }

  interface Cache<T> {
    etag: string;
    /** JS timestamps */
    createdAt: number;
    /** ttl in milliseconds */
    ttl: number;
    /** cached value */
    data: T;
  }

  type Optional<T extends object, K extends keyof T = keyof T> = Omit<T, K> &
    Partial<Pick<T, K>>;
}

export = CacheableResponse;
