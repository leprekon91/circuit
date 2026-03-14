import { AxiosInstance, AxiosRequestConfig } from 'axios';
import { WrapOptions } from '../types';
import { wrap } from '../core/wrap';

export function applyAxiosResilience(axios: AxiosInstance, opts: WrapOptions = {}) {
  axios.interceptors.request.use((cfg) => cfg);

  axios.interceptors.response.use(
    (res) => res,
    async (err) => {
      const config = err.config as AxiosRequestConfig & { __circuit_wrapped?: boolean };
      if (!config) return Promise.reject(err);
      if (config.__circuit_wrapped) return Promise.reject(err);

      // create per-request wrap options so we can inject a bulkheadKey derived from the request
      const perRequestOpts: WrapOptions = { ...opts };
      if (opts.bulkhead && (opts.bulkhead as { keyed?: boolean }).keyed && !(opts.bulkhead as { bulkheadKey?: unknown }).bulkheadKey) {
        // derive a key from request config: prefer explicit header, then tenant header, then method+path
        const derive = () => {
          try {
            // Support both AxiosHeaders instances (Axios v1, which expose .get()) and plain objects.
            const getHeader = (name: string): string | undefined => {
              const h = config.headers as unknown;
              if (h != null && typeof (h as { get?: unknown }).get === 'function') {
                const val = (h as { get: (n: string) => unknown }).get(name);
                return val != null ? String(val) : undefined;
              }
              if (h != null && typeof h === 'object') {
                const obj = h as Record<string, unknown>;
                const lower = name.toLowerCase();
                const v = obj[lower] ?? obj[name];
                return v != null ? String(v) : undefined;
              }
              return undefined;
            };
            const explicit = getHeader('x-bulkhead-key');
            if (explicit) return explicit;
            const tenant = getHeader('x-tenant-id');
            if (tenant) return `tenant:${tenant}`;
            const method = (config.method || 'GET').toUpperCase();
            let path = String(config.url || '');
            try {
              const base = config.baseURL || '';
              const u = new URL(path, base || undefined);
              path = u.pathname;
            } catch (e) {
              // ignore - keep raw path
            }
            return `${method}:${path}`;
          } catch (e) {
            return 'unknown';
          }
        };
        perRequestOpts.bulkhead = { ...(opts.bulkhead as object), bulkheadKey: derive } as typeof opts.bulkhead;
      }

      const promiseFn = () => axios(config);
      config.__circuit_wrapped = true;
      try {
        const result = await wrap(promiseFn, perRequestOpts);
        return result;
      } catch (e) {
        return Promise.reject(e);
      }
    }
  );
}
