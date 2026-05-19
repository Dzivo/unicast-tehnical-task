import cors from 'cors';
import fs from 'node:fs/promises';
import path from 'node:path';
import multer from 'multer';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { upsertFileStatus } from './db.js';

function toFileDto(row) {
  return {
    id: row.id,
    filePath: row.file_path,
    status: row.status,
    processedPath: row.processed_path,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function isInsideRoot(filePath, rootPath) {
  const normalizedTarget = path.resolve(filePath);
  const normalizedRoot = path.resolve(rootPath);
  return normalizedTarget === normalizedRoot || normalizedTarget.startsWith(`${normalizedRoot}${path.sep}`);
}

async function resolveExistingMp4Path(filePath, mediaRoot) {
  if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) {
    return { error: 'filePath must be an absolute path' };
  }

  const normalized = path.resolve(filePath);
  if (!normalized.toLowerCase().endsWith('.mp4')) {
    return { error: 'filePath must point to an .mp4 file' };
  }
  if (!isInsideRoot(normalized, mediaRoot)) {
    return { error: 'filePath is outside allowed media root' };
  }
  return { resolvedPath: normalized };
}

export function createApp({ db, natsClient, config }) {
  const app = express();
  const limiter = rateLimit({
    windowMs: 60_000,
    limit: 120,
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.use(limiter);
  app.use(cors());
  app.use(express.json());

  const storage = multer.diskStorage({
    destination: async (_req, _file, cb) => {
      await fs.mkdir(config.uploadsDir, { recursive: true });
      cb(null, config.uploadsDir);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || '.mp4';
      cb(null, `${Date.now()}-${Math.random().toString(16).slice(2)}${ext}`);
    },
  });

  const upload = multer({
    storage,
    fileFilter: (_req, file, cb) => {
      if (!file.originalname.toLowerCase().endsWith('.mp4')) {
        cb(new Error('Only .mp4 files are allowed'));
        return;
      }
      cb(null, true);
    },
  });

  async function queueProcessing(filePath) {
    const insert = await db.get(
      `INSERT INTO files (file_path, status)
       VALUES (?, 'Processing')
       RETURNING id`,
      filePath,
    );

    const fileId = insert.id;
    try {
      natsClient.publish(config.processSubject, { fileId, filePath, processedDir: config.processedDir });
    } catch (error) {
      await upsertFileStatus(db, {
        fileId,
        status: 'Failed',
        errorMessage: `NATS publish failed: ${error.message}`,
      });
      throw error;
    }

    const record = await db.get('SELECT * FROM files WHERE id = ?', fileId);
    return toFileDto(record);
  }

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/files', async (_req, res, next) => {
    try {
      const rows = await db.all('SELECT * FROM files ORDER BY id DESC');
      res.json(rows.map(toFileDto));
    } catch (error) {
      next(error);
    }
  });

  app.get('/files/:id', async (req, res, next) => {
    try {
      const row = await db.get('SELECT * FROM files WHERE id = ?', Number(req.params.id));
      if (!row) {
        res.status(404).json({ message: 'File not found' });
        return;
      }

      res.json(toFileDto(row));
    } catch (error) {
      next(error);
    }
  });

  app.post('/files/process', async (req, res, next) => {
    try {
      const { filePath } = req.body ?? {};
      const result = await resolveExistingMp4Path(filePath, config.mediaRoot);
      if (result.error) {
        res.status(400).json({ message: result.error });
        return;
      }

      const queued = await queueProcessing(result.resolvedPath);
      res.status(202).json(queued);
    } catch (error) {
      next(error);
    }
  });

  app.post('/files/upload', upload.single('file'), async (req, res, next) => {
    try {
      if (!req.file) {
        res.status(400).json({ message: 'Missing file upload' });
        return;
      }

      const queued = await queueProcessing(req.file.path);
      res.status(202).json(queued);
    } catch (error) {
      next(error);
    }
  });

  app.delete('/files/:id', async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const record = await db.get('SELECT * FROM files WHERE id = ?', id);
      if (!record) {
        res.status(404).json({ message: 'File not found' });
        return;
      }

      if (record.processed_path && isInsideRoot(record.processed_path, config.processedDir)) {
        await fs.rm(record.processed_path, { force: true });
      }

      await db.run('DELETE FROM files WHERE id = ?', id);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  app.use((error, _req, res, _next) => {
    if (error?.message?.includes('Only .mp4 files are allowed')) {
      res.status(400).json({ message: error.message });
      return;
    }

    res.status(500).json({ message: 'Internal server error' });
  });

  return app;
}

export function startResultListener({ db, natsClient, config, signal }) {
  const subscription = natsClient.subscribe(config.resultSubject);

  (async () => {
    for await (const message of subscription) {
      if (signal?.aborted) {
        subscription.unsubscribe();
        break;
      }

      const payload = natsClient.decode(message);
      await upsertFileStatus(db, {
        fileId: payload.fileId,
        status: payload.status,
        processedPath: payload.processedPath ?? null,
        errorMessage: payload.errorMessage ?? null,
      });
    }
  })().catch(() => {
    subscription.unsubscribe();
  });

  return subscription;
}
