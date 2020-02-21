import { ParsedUrlQuery } from 'querystring';
interface RequestResponse {
  req: any;
  res: {
    send: any
  };
}
export interface SendParams extends RequestResponse {
  data: string;
}

declare function CacheableResponse(params: CacheableResponse.InputParams): CacheableResponse.ReturnResponse;
/**
 * Cacheable response  is a HTTP middleware for serving a pre-calculated response.
 */
declare namespace CacheableResponse {
  export interface InputParams {
    get: (params: any) => Promise<{ data, ttl?: number }>;
    send: (params: SendParams, ...props) => void
    ttl?: number; // milliseconds
    compress?: boolean;
    serialize?: (obj: object) => string;
    deserialize?: (str: string) => object;
    cache?: boolean;
    getKey: (req: any) => string,
    revalidate?: (ttl: number) => number;
  }
  type ReturnFunction = (params: SendParams) => void
  export type ReturnResponse = (params: any) => ReturnFunction

}

export default CacheableResponse;
