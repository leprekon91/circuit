import { describe, it, expect, vi } from 'vitest';
import { applyAxiosResilience } from '..';
import type { AxiosInstance } from 'axios';

function createAxiosMock(): AxiosInstance {
  type AxiosMock = {
    (config: unknown): Promise<unknown>;
    request: ReturnType<typeof vi.fn>;
    interceptors: {
      request: { use: ReturnType<typeof vi.fn> };
      response: { use: ReturnType<typeof vi.fn> };
    };
  };

  const instance = ((config: unknown) => instance.request(config)) as unknown as AxiosMock;
  instance.request = vi.fn().mockResolvedValue({ status: 200 });
  instance.interceptors = {
    request: { use: vi.fn() },
    response: { use: vi.fn() },
  };
  return instance as unknown as AxiosInstance;
}

describe('applyAxiosResilience adapter', () => {
  it('does not re-wrap a request already marked as wrapped', async () => {
    const axios = createAxiosMock();
    applyAxiosResilience(axios, {});

    const responseUseMock = axios.interceptors.response.use as unknown as ReturnType<typeof vi.fn>;
    const errorHandler = responseUseMock.mock.calls[0][1];
    const err = { config: { url: '/x', __circuit_wrapped: true } } as unknown as { config: { url: string; __circuit_wrapped?: boolean } };

    await expect(errorHandler(err)).rejects.toBe(err);
  });

  it('wraps and retries the axios request when not already wrapped', async () => {
    const axios = createAxiosMock();
    // make request resolve
    const requestMock = axios.request as unknown as ReturnType<typeof vi.fn>;
    requestMock.mockResolvedValue({ status: 201 });

    applyAxiosResilience(axios, {});
    const responseUseMock = axios.interceptors.response.use as unknown as ReturnType<typeof vi.fn>;
    const errorHandler = responseUseMock.mock.calls[0][1];

    const err = { config: { url: '/x' } } as unknown as { config: { url: string; __circuit_wrapped?: boolean } };
    const res = await errorHandler(err);

    expect(res).toEqual({ status: 201 });
    expect((err.config as { __circuit_wrapped?: boolean }).__circuit_wrapped).toBe(true);
    expect(requestMock).toHaveBeenCalledWith(err.config);
  });

  it('rejects when the wrapped call fails', async () => {
    const axios = createAxiosMock();
    const requestMock = axios.request as unknown as ReturnType<typeof vi.fn>;
    requestMock.mockRejectedValue(new Error('network'));

    applyAxiosResilience(axios, {});
    const responseUseMock = axios.interceptors.response.use as unknown as ReturnType<typeof vi.fn>;
    const errorHandler = responseUseMock.mock.calls[0][1];

    const err = { config: { url: '/x' } } as unknown as { config: { url: string; __circuit_wrapped?: boolean } };
    await expect(errorHandler(err)).rejects.toThrow('network');
  });
});
