import { createApp } from './app.js';
import { Store } from './store.js';

const port = Number.parseInt(process.env.PORT ?? '5004', 10);
const host = process.env.HOST ?? '0.0.0.0';

const store = new Store();
const app = createApp(store, { baseUrl: process.env.PUBLIC_BASE_URL });

const server = app.listen(port, host, () => {
  console.log(`podcast-testcasts listening on http://${host}:${port}`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
