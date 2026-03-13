import { describe, it, expect } from 'vitest';
import { retry } from '..';

describe('retry', () => {
  it('retries a failing function', async () => {
    let n = 0;
    const fn = async () => {
      n++;
      if (n < 3) throw new Error('fail');
      return 'ok';
    };

    const res = await retry(fn, { retries: 3, minDelayMs: 1 });
    expect(res).toBe('ok');
  });
});
