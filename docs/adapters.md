# Adapters

Current adapters:

- **Axios adapter**: use `applyAxiosResilience` to protect requests made with an Axios instance. The adapter accepts the same `WrapOptions` shape.

Example:

```ts
import axios from 'axios';
import { applyAxiosResilience } from '@leprekon-hub/fault-guard';

const client = axios.create();
applyAxiosResilience(client, { retry: { retries: 2 }, monitor: (e) => console.log(e) });
```
