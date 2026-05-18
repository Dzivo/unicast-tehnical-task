import path from 'node:path';

const rootDir = path.resolve(process.cwd(), '..');

export const config = {
  port: Number(process.env.PORT || 3000),
  dbPath: process.env.DB_PATH || path.resolve(process.cwd(), 'data', 'files.db'),
  natsUrl: process.env.NATS_URL || 'nats://localhost:4222',
  processSubject: process.env.NATS_PROCESS_SUBJECT || 'file.process.start',
  resultSubject: process.env.NATS_RESULT_SUBJECT || 'file.process.result',
  uploadsDir: process.env.UPLOADS_DIR || path.resolve(process.cwd(), 'uploads'),
  processedDir: process.env.PROCESSED_DIR || path.resolve(process.cwd(), 'processed'),
  mediaRoot: process.env.MEDIA_ROOT || rootDir,
};
