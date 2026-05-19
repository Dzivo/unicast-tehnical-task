import { Pool } from 'pg';

function normalizeParams(params) {
  if (params.length === 1 && Array.isArray(params[0])) {
    return params[0];
  }
  return params;
}

function toPostgresParams(query) {
  let index = 0;
  return query.replace(/\?/g, () => `$${++index}`);
}

function createDbAdapter(pool) {
  return {
    async run(query, ...params) {
      const result = await pool.query(toPostgresParams(query), normalizeParams(params));
      return { rowCount: result.rowCount };
    },

    async get(query, ...params) {
      const result = await pool.query(toPostgresParams(query), normalizeParams(params));
      return result.rows[0];
    },

    async all(query, ...params) {
      const result = await pool.query(toPostgresParams(query), normalizeParams(params));
      return result.rows;
    },

    async close() {
      await pool.end();
    },
  };
}

export async function initDb(connection) {
  const pool = typeof connection === 'string'
    ? new Pool({ connectionString: connection })
    : connection;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS files (
      id BIGSERIAL PRIMARY KEY,
      file_path TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('Processing', 'Failed', 'Successful')),
      error_message TEXT,
      processed_path TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  return createDbAdapter(pool);
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
