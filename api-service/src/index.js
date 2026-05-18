import fs from 'node:fs/promises';
import { config } from './config.js';
import { initDb } from './db.js';
import { connectNats } from './natsClient.js';
import { createApp, startResultListener } from './server.js';

const db = await initDb(config.dbPath);
await fs.mkdir(config.processedDir, { recursive: true });
const natsClient = await connectNats(config.natsUrl);

const app = createApp({ db, natsClient, config });
const abortController = new AbortController();
startResultListener({ db, natsClient, config, signal: abortController.signal });

const server = app.listen(config.port, () => {
  console.log(`API service listening on ${config.port}`);
});

async function shutdown() {
  abortController.abort();
  server.close(async () => {
    await natsClient.close();
    await db.close();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
