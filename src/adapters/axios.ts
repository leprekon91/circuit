import { AxiosInstance, AxiosRequestConfig } from 'axios';
import { WrapOptions } from '../types';
import { wrap } from '../core/wrap';

export function applyAxiosResilience(axios: AxiosInstance, opts: WrapOptions = {}) {
  axios.interceptors.response.use(
    (res) => res,
    async (err) => {
      const config = err.config as AxiosRequestConfig & { __circuit_wrapped?: boolean };
      if (!config) return Promise.reject(err);
      if (config.__circuit_wrapped) return Promise.reject(err);

      // Only inject per-request bulkhead key when opts.bulkhead is a plain options object.
      // A pre-built Bulkhead instance carries its own keyFn and its private fields cannot be
      // spread or overridden here — skip key derivation in that case.
      const perRequestOpts: WrapOptions = { ...opts };
      const bulkheadIsOptionsObject =
        opts.bulkhead != null && typeof (opts.bulkhead as { exec?: unknown }).exec !== 'function';

      if (bulkheadIsOptionsObject) {
        const bo = opts.bulkhead as { keyed?: boolean; bulkheadKey?: unknown };
        if (bo.keyed && !bo.bulkheadKey) {
          // derive a key from request config: prefer explicit header, then tenant header, then method+path
          const derive = (): string => {
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
                const u = new URL(path, config.baseURL || undefined);
                path = u.pathname;
              } catch {
                // ignore — keep raw path
              }
              return `${method}:${path}`;
            } catch {
              return 'unknown';
            }
          };
          perRequestOpts.bulkhead = { ...bo, bulkheadKey: derive } as typeof opts.bulkhead;
        }
      }

      config.__circuit_wrapped = true;
      return wrap(() => axios(config), perRequestOpts);
    },
  );
}

