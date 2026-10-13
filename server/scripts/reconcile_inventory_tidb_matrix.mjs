import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();
import { connect } from '@tidbcloud/serverless';

const conn = connect({
  host: process.env.TIDB_HOST,
  username: process.env.TIDB_USER,
  password: process.env.TIDB_PASSWORD,
  database: process.env.TIDB_DATABASE
});

const invRaw = JSON.parse(fs.readFileSync('src/data/authoritative_curriculum_inventory.json', 'utf8'));
const invUnits = invRaw.units || [];

const q = 'SELECT bc.id as chapter_id, bc.book_id, bc.chapter_number, bc.title_ar as unit_title_ar, bc.title_en as unit_title_en, bc.start_page, bc.end_page, b.title_ar as book_title_ar, b.title_en as book_title_en, b.grade_id, b.subject_id FROM book_chapters bc JOIN books b ON bc.book_id = b.id ORDER BY b.id, bc.chapter_number';
const dbChapters = await conn.execute(q);

console.log('TiDB total chapters in database:', dbChapters.length);
console.log('Inventory units in authoritative_curriculum_inventory.json:', invUnits.length);

// Check mapping
const dbByChId = new Map(dbChapters.map(c => [c.chapter_id, c]));
const dbByBookAndNum = new Map(dbChapters.map(c => [`${c.book_id}::${c.chapter_number}`, c]));

let matchedByUuid = 0;
let matchedByBookAndNum = 0;
let completelyUnmatched = 0;

const comparison = invUnits.map((u, idx) => {
  const matchDirect = dbByChId.get(u.chapter_id);
  const matchByNum = dbByBookAndNum.get(`${u.book_id}::${u.chapter_number}`);
  
  if (matchDirect) {
    matchedByUuid++;
    return {
      index: idx + 1,
      unit_title: u.unit_title_ar,
      book_title: u.book_title_ar,
      inv_chapter_id: u.chapter_id,
      db_chapter_id: matchDirect.chapter_id,
      status: u.readiness_status,
      id_match: 'EXACT_UUID_MATCH'
    };
  } else if (matchByNum) {
    matchedByBookAndNum++;
    return {
      index: idx + 1,
      unit_title: u.unit_title_ar,
      book_title: u.book_title_ar,
      inv_chapter_id: u.chapter_id,
      db_chapter_id: matchByNum.chapter_id,
      status: u.readiness_status,
      id_match: 'MATCH_BY_BOOK_AND_CHAPTER_NUM'
    };
  } else {
    completelyUnmatched++;
    return {
      index: idx + 1,
      unit_title: u.unit_title_ar,
      book_title: u.book_title_ar,
      inv_chapter_id: u.chapter_id,
      status: u.readiness_status,
      id_match: 'UNMATCHED'
    };
  }
});

console.log('\n--- MATCHING SUMMARY ---');
console.log('Matched by exact Chapter UUID:', matchedByUuid);
console.log('Matched by (book_id + chapter_number) but DIFFERENT Chapter UUID:', matchedByBookAndNum);
console.log('Completely unmatched:', completelyUnmatched);

// Print samples of difference if any
const diffUuids = comparison.filter(c => c.id_match === 'MATCH_BY_BOOK_AND_CHAPTER_NUM');
if (diffUuids.length > 0) {
  console.log('\n--- SAMPLE UUID MISMATCHES (Inventory UUID vs TiDB UUID) ---');
  diffUuids.slice(0, 5).forEach(d => {
    console.log(`Unit: "${d.unit_title}" | Inv Chapter ID: ${d.inv_chapter_id} | TiDB Chapter ID: ${d.db_chapter_id}`);
  });
}

process.exit(0);
