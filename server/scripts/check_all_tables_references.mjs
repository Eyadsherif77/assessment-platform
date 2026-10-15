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

async function checkAllTables() {
  const tables = await conn.execute(`
    SELECT TABLE_NAME 
    FROM INFORMATION_SCHEMA.TABLES 
    WHERE TABLE_SCHEMA = DATABASE()
  `);
  
  let matchesFound = 0;
  for (const t of tables) {
    const tableName = t.TABLE_NAME;
    if (tableName === 'book_chunks') continue;
    const cols = await conn.execute(`
      SELECT COLUMN_NAME, DATA_TYPE 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
    `, [tableName]);
    
    for (const c of cols) {
      if (['varchar', 'text', 'char', 'longtext', 'mediumtext'].includes(c.DATA_TYPE.toLowerCase())) {
        for (const id of oobIds) {
          const match = await conn.execute(`
            SELECT COUNT(*) as cnt FROM \`${tableName}\` WHERE \`${c.COLUMN_NAME}\` LIKE ?
          `, ['%' + id + '%']);
          if (match[0].cnt > 0) {
            console.log(`MATCH FOUND: table ${tableName}, column ${c.COLUMN_NAME}, chunk ${id}, count: ${match[0].cnt}`);
            matchesFound++;
          }
        }
      }
    }
  }
  console.log(`Finished exhaustive search across all tables. Total matches outside book_chunks: ${matchesFound}`);
}

checkAllTables().catch(console.error);
