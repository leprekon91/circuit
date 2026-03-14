# fault-guard

A lightweight resilience layer for Promise-returning functions and HTTP clients. It provides retries with backoff, circuit breaking, and rate limiting.

## Installation

Install from npm (package name: `@leprekon-hub/fault-guard`) and add `axios` if you plan to use the adapter:

```bash
npm install @leprekon-hub/fault-guard
# if using axios adapter
npm install axios
```

## Quick Start

Wrap a function to apply resilience features:

```ts
import { wrap } from '@leprekon-hub/fault-guard';

const result = await wrap(() => fetchMyApi(), {
  retry: { retries: 3, minDelayMs: 100 },
  circuit: { failureThreshold: 5, timeoutMs: 30000 },
  rateLimit: { maxConcurrent: 5 },
});
```

For full documentation, detailed options, and examples see the docs:

- [Docs Home](docs/index.md)

## Development

- Build: `npm run build`
- Test: `npm test`

## Contributing & License

Contributions welcome. The project is MIT licensed (see `LICENSE`).
