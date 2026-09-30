import { createApp } from './app.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const server = createApp().listen(config.port, () => {
  console.log(`Support tickets API listening on http://localhost:${config.port}`);
});

// Finish in-flight requests before exiting (Ctrl+C locally, `docker stop` in a container).
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    console.log(`${signal} received, shutting down`);
    server.close(() => process.exit(0));
  });
}
