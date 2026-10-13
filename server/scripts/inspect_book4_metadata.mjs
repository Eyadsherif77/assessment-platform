import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { db } from '../dist/db/db.js';

async function main() {
  const res = await db.query('SELECT * FROM books WHERE id = $1', ['81b8a308-7fcf-4938-8c45-aa0056624f32']);
  console.log(JSON.stringify(res.rows[0], null, 2));
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
