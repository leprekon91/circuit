import { describe, it, expect, vi } from 'vitest';
import { applyAxiosResilience } from '..';

function createAxiosMock() {
  const instance: any = (config: any) => instance.request(config);
  instance.request = vi.fn().mockResolvedValue({ status: 200 });
  instance.interceptors = {
    request: { use: vi.fn() },
    response: { use: vi.fn() },
  };
  return instance as any;
}

describe('applyAxiosResilience adapter', () => {
  it('does not re-wrap a request already marked as wrapped', async () => {
    const axios = createAxiosMock();
    applyAxiosResilience(axios, {});

    const errorHandler = axios.interceptors.response.use.mock.calls[0][1];
    const err = { config: { url: '/x', __circuit_wrapped: true } };

    await expect(errorHandler(err)).rejects.toBe(err);
  });

  it('wraps and retries the axios request when not already wrapped', async () => {
    const axios = createAxiosMock();
    // make request resolve
    axios.request.mockResolvedValue({ status: 201 });

    applyAxiosResilience(axios, {});
    const errorHandler = axios.interceptors.response.use.mock.calls[0][1];

    const err = { config: { url: '/x' } };
    const res = await errorHandler(err);

    expect(res).toEqual({ status: 201 });
    expect(err.config.__circuit_wrapped).toBe(true);
    expect(axios.request).toHaveBeenCalledWith(err.config);
  });

  it('rejects when the wrapped call fails', async () => {
    const axios = createAxiosMock();
    axios.request.mockRejectedValue(new Error('network'));

    applyAxiosResilience(axios, {});
    const errorHandler = axios.interceptors.response.use.mock.calls[0][1];

    const err = { config: { url: '/x' } };
    await expect(errorHandler(err)).rejects.toThrow('network');
  });
});
