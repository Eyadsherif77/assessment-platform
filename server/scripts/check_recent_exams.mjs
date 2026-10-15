import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

const envPath = fs.existsSync('.env') ? '.env' : path.resolve('server/.env');
dotenv.config({ path: envPath });

async function check() {
  const connection = await mysql.createConnection({
    host: process.env.TIDB_HOST,
    port: Number(process.env.TIDB_PORT) || 4000,
    user: process.env.TIDB_USER,
    password: process.env.TIDB_PASSWORD,
    database: process.env.TIDB_DATABASE,
    ssl: { rejectUnauthorized: true }
  });

  try {
    const [exams] = await connection.query(`
      SELECT id, book_id, total_questions, provenance_verified, parameters_json, created_at
      FROM shared_cached_exams
      ORDER BY created_at DESC
      LIMIT 8
    `);
    console.table(exams);
  } finally {
    await connection.end();
  }
}

check().catch(console.error);
