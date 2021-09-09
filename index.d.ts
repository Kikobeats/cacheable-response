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
     * The method to be called for creating a fresh cacheable response associated with the current route path.
     */
    get: (
      opts: Options
    ) => Promise<
      (Optional<Cache<Data>, "etag" | "ttl" | "createdAt"> & GetReturnProps) | null
    >;

    /**
     * The method used to determinate how the content should be rendered.
     */
    send: (
      opts: GetReturnProps & { data: Data } & Pick<Options, "req" | "res">
    ) => any;

    /** Cache provider, default to 'keyv' */
    cache?: CacheProvider<GetReturnProps, Data>;

    /** Enable compress, default false */
    compress?: boolean;

    /** Get cache key from request context */
    key?: (opts: Options) => string;

    /**
     * Number of milliseconds that indicates grace period after response cache expiration for refreshing it in the background.
     *  The latency of the refresh is hidden from the user.
     * You can provide a function, it will receive ttl as first parameter or a fixed value.
     *  The value will be associated with stale-while-revalidate directive.
     */
    revalidate?: (ttl: number) => number | number;

    /** ttl default to 7200000 */
    ttl?: number;
    
    /** ttl default to 3600000 */
    staleTtl?: number | boolean;

    /** Compress opts pass through to compress-brotli */
    serialize?: (o: any) => string;

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
