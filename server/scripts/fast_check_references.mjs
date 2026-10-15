import { connect } from '@tidbcloud/serverless';
import dotenv from 'dotenv';
dotenv.config();

const conn = connect({
  host: process.env.TIDB_HOST,
  username: process.env.TIDB_USER,
  password: process.env.TIDB_PASSWORD,
  database: process.env.TIDB_DATABASE
});

const oobIds = [
  '3424e307-7752-4181-b9a8-7e6c8476d824',
  '01d46f85-e7f2-4d9d-99bb-ec7f85a631b9',
  'ea569bc9-ea0d-42aa-8b4b-b727b930804c',
  '53a5ab62-4e00-4180-8ce2-d2ecb9cfd7e3',
  '4e215896-79b1-4474-95e7-1e499848e082',
  'b433fbb8-4b77-4552-97de-2f7b0639910a',
  '0aec7ec0-6bdc-4709-80c4-bc5234f95b93',
  '5d882c5c-1b43-4f84-9a22-75d1e0ce1aef',
  '39eaab2d-f2aa-4765-88fd-1a5b602da4b2',
  'a0987196-f4a6-4cbd-a981-fa0a1cb71656',
  '6bdbcf8e-d771-471e-b879-558761777248',
  '74227d01-6d25-47da-9f6e-1641a910b850'
];

async function fastCheck() {
  const tables = await conn.execute(`
    SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME != 'book_chunks'
      AND DATA_TYPE IN ('varchar', 'text', 'char', 'longtext', 'mediumtext')
  `);
  
  // Group by table
  const tableMap = {};
  for (const row of tables) {
    if (!tableMap[row.TABLE_NAME]) tableMap[row.TABLE_NAME] = [];
    tableMap[row.TABLE_NAME].push(row.COLUMN_NAME);
  }

  let totalMatches = 0;
  const placeholders = oobIds.map(() => '?').join(',');

  for (const [table, cols] of Object.entries(tableMap)) {
    // Construct single query per table: WHERE col1 IN (...) OR col2 IN (...)
    const conditions = cols.map(c => `\`${c}\` IN (${placeholders})`).join(' OR ');
    const params = [];
    for (let i = 0; i < cols.length; i++) {
      params.push(...oobIds);
    }
    const query = `SELECT COUNT(*) as cnt FROM \`${table}\` WHERE ${conditions}`;
    try {
      const res = await conn.execute(query, params);
      if (res[0].cnt > 0) {
        console.log(`⚠️ MATCH FOUND in table ${table}: ${res[0].cnt} records!`);
        totalMatches += res[0].cnt;
      }
    } catch (err) {
      console.warn(`Query on ${table} notice:`, err.message);
    }
  }

  console.log(`\nFast check complete: Total references across all non-chunk tables = ${totalMatches}`);
}

fastCheck().catch(console.error);
