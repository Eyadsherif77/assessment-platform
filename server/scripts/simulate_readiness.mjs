import { connect } from '@tidbcloud/serverless';
import dotenv from 'dotenv';
dotenv.config();

const conn = connect({
  host: process.env.TIDB_HOST,
  username: process.env.TIDB_USER,
  password: process.env.TIDB_PASSWORD,
  database: process.env.TIDB_DATABASE
});

const targetUnits = [
  { b: '19886434-1839-427d-af31-4c64fcf79525', ch: '8ccdd54b-87ed-419f-a737-a35f11620f15', name: 'Math Prep 2 Unit 1' },
  { b: 'bc6bb834-7192-474c-8507-c53265028b4e', ch: '902f6adf-8043-4247-b80c-42bb48d200b8', name: 'Arabic Prep 1 Unit 1' },
  { b: '21e1d639-9f59-4a58-a8f8-8373b8e7fc90', ch: '192c06db-b3e1-4717-b6e9-0b06a0364764', name: 'English Prep 1 Unit 1' },
  { b: '37bfa0c0-c4ce-419f-930a-000043d8d3f9', ch: 'af732e7e-1a38-4b17-b23e-d09ac0ac92f1', name: 'English Prep 2 Unit 1' }
];

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

async function simulateReadiness() {
  console.log('--- Simulating Readiness Evaluation (Excluding the 12 OOB chunks) ---');
  for (const u of targetUnits) {
    const sql = `
      SELECT 
        b.id AS book_id,
        b.title_ar AS book_title_ar,
        bc.id AS chapter_id,
        bc.chapter_number,
        bc.title_ar AS unit_title_ar,
        bc.start_page,
        bc.end_page,
        COUNT(chk.id) AS total_chunks,
        COALESCE(SUM(LENGTH(chk.content)), 0) AS total_chars,
        COUNT(CASE WHEN chk.embedding IS NOT NULL AND LENGTH(chk.embedding) > 50 THEN 1 END) AS embedded_chunks,
        COUNT(CASE WHEN chk.id IS NOT NULL AND (chk.page_number < bc.start_page OR chk.page_number > bc.end_page) THEN 1 END) AS oob_chunks,
        MIN(chk.page_number) as min_page,
        MAX(chk.page_number) as max_page
      FROM books b
      JOIN book_chapters bc ON bc.book_id = b.id
      LEFT JOIN book_chunks chk ON chk.book_id = b.id AND chk.chapter_id = bc.id AND chk.id NOT IN (${oobIds.map(() => '?').join(',')})
      WHERE b.id = ? AND bc.id = ?
      GROUP BY b.id, b.title_ar, bc.id, bc.chapter_number, bc.title_ar, bc.start_page, bc.end_page
    `;
    const res = await conn.execute(sql, [...oobIds, u.b, u.ch]);
    console.log(`\nUnit: ${u.name}`);
    console.table(res);
  }
}

simulateReadiness().catch(console.error);
