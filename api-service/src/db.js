import fs from 'node:fs/promises';
import path from 'node:path';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

export async function initDb(dbPath) {
  await fs.mkdir(path.dirname(dbPath), { recursive: true });
  const db = await open({ filename: dbPath, driver: sqlite3.Database });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_path TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('Processing', 'Failed', 'Successful')),
      error_message TEXT,
      processed_path TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  return db;
}

export async function upsertFileStatus(db, { fileId, status, processedPath = null, errorMessage = null }) {
  await db.run(
    `UPDATE files
     SET status = ?, processed_path = ?, error_message = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    status,
    processedPath,
    errorMessage,
    fileId,
  );
}
