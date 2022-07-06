import { IncomingMessage, ServerResponse } from "http";

/**
 * Cacheable response is a HTTP middleware for serving a pre-calculated response.
 */

declare function CacheableResponse<
  Options extends CacheableResponse.GetOpts = CacheableResponse.GetOpts,
  Props extends CacheableResponse.Props = {},
  Data extends {} = {}
>(
  params: CacheableResponse.InputParams<Options, Props, Data>
): (opts: Options) => any;

/** Framework agnostic req and res object */
export interface HttpContext {
  req: IncomingMessage;
  res: ServerResponse;
}

declare namespace CacheableResponse {
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
     * The cache instance used for backed your pre-calculated server side response copies.
     *
     * The default value is an in-memory instance.
     */
    cache?: CacheProvider<GetReturnProps, Data>;

    /**
     * Enable compress/decompress data using brotli compression format.
     *
     * The default value is `true`.
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
     */
    send: (
      opts: GetReturnProps & { data: Data } & Pick<Options, "req" | "res">
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

  export interface CacheProvider<P extends Props, V = any> {
    /** Returns the cached value, or the compressed buffer when compress option is set to true. */
    get(key: string): Promise<Buffer | (Cache<V> & P) | undefined>;

    /**
     * Set a value. You can implements an expiry TTL in milliseconds.
     */
    set(
      key: string,
      value: Buffer | (Cache<V> & P),
      ttl: number
    ): Promise<true>;
  }

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

export default CacheableResponse;
