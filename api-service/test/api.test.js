import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { describe, it, expect, beforeEach } from 'vitest';
import { initDb } from '../src/db.js';
import { createApp, startResultListener } from '../src/server.js';

function createMockNats() {
  const subscribers = new Map();
  const calls = [];

  return {
    calls,
    publish(subject, payload) {
      calls.push({ subject, payload });
    },
    subscribe(subject) {
      const iterator = {
        queue: [],
        unsubscribed: false,
        unsubscribe() {
          iterator.unsubscribed = true;
        },
        [Symbol.asyncIterator]() {
          return {
            async next() {
              while (!iterator.queue.length && !iterator.unsubscribed) {
                await new Promise((resolve) => setTimeout(resolve, 5));
              }
              if (iterator.unsubscribed) {
                return { done: true };
              }
              return { done: false, value: iterator.queue.shift() };
            },
          };
        },
      };
      subscribers.set(subject, iterator);
      return iterator;
    },
    decode(message) {
      return message.payload;
    },
    push(subject, payload) {
      subscribers.get(subject)?.queue.push({ payload });
    },
  };
}

describe('API service', () => {
  let db;
  let app;
  let nats;
  let mediaRoot;

  beforeEach(async () => {
    const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'api-test-'));
    mediaRoot = temp;
    db = await initDb(path.join(temp, 'files.db'));
    nats = createMockNats();

    app = createApp({
      db,
      natsClient: nats,
      config: {
        processSubject: 'file.process.start',
        resultSubject: 'file.process.result',
        uploadsDir: path.join(temp, 'uploads'),
        processedDir: path.join(temp, 'processed'),
        mediaRoot,
      },
    });
  });

  it('queues processing by path', async () => {
    const filePath = path.join(mediaRoot, 'video.mp4');
    await fs.writeFile(filePath, 'data');

    const response = await request(app).post('/files/process').send({ filePath });

    expect(response.status).toBe(202);
    expect(response.body.status).toBe('Processing');
    expect(nats.calls).toHaveLength(1);
    expect(nats.calls[0].payload.filePath).toBe(filePath);
  });

  it('updates status from NATS result messages', async () => {
    const filePath = path.join(mediaRoot, 'video.mp4');
    await fs.writeFile(filePath, 'data');

    const queued = await request(app).post('/files/process').send({ filePath });

    const abort = new AbortController();
    startResultListener({
      db,
      natsClient: nats,
      config: { resultSubject: 'file.process.result' },
      signal: abort.signal,
    });

    nats.push('file.process.result', {
      fileId: queued.body.id,
      status: 'Successful',
      processedPath: '/tmp/processed/init.mp4',
    });

    await new Promise((resolve) => setTimeout(resolve, 30));

    const details = await request(app).get(`/files/${queued.body.id}`);
    expect(details.status).toBe(200);
    expect(details.body.status).toBe('Successful');
    expect(details.body.processedPath).toBe('/tmp/processed/init.mp4');

    abort.abort();
  });

  it('rejects file paths outside of media root', async () => {
    const response = await request(app)
      .post('/files/process')
      .send({ filePath: '/etc/passwd' });

    expect(response.status).toBe(400);
  });
});
