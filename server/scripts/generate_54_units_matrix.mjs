import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();
import { connect } from '@tidbcloud/serverless';

console.log('Connecting to TiDB Cloud Serverless (Read-Only)...');
const conn = connect({
  host: process.env.TIDB_HOST,
  username: process.env.TIDB_USER,
  password: process.env.TIDB_PASSWORD,
  database: process.env.TIDB_DATABASE
});

// Load authoritative curriculum inventory
const invPath = path.resolve('src/data/authoritative_curriculum_inventory.json');
const invRaw = JSON.parse(fs.readFileSync(invPath, 'utf8'));
const invUnits = invRaw.units || [];

// 1. Fetch all books from TiDB
const dbBooks = await conn.execute(`
  SELECT b.id, b.title_ar, b.title_en, b.school_type, b.term,
         s.name_ar as subject_name_ar, s.code as subject_code,
         g.name_ar as grade_name_ar, g.code as grade_code,
         st.name_ar as stage_name_ar
  FROM books b
  LEFT JOIN subjects s ON b.subject_id = s.id
  LEFT JOIN grades g ON b.grade_id = g.id
  LEFT JOIN academic_stages st ON b.academic_stage_id = st.id
  ORDER BY g.id, s.id, b.id
`);

// 2. Fetch all chapters from TiDB
const dbChapters = await conn.execute(`
  SELECT id, book_id, chapter_number, title_ar, title_en, start_page, end_page
  FROM book_chapters
  ORDER BY book_id, chapter_number
`);

// 3. Fetch chunk counts per chapter from TiDB
const chunkCounts = await conn.execute(`
  SELECT chapter_id, COUNT(*) as chunk_count, SUM(LENGTH(content)) as total_chars
  FROM book_chunks
  GROUP BY chapter_id
`);
const chunkCountMap = new Map();
chunkCounts.forEach(r => chunkCountMap.set(r.chapter_id, { count: Number(r.chunk_count), chars: Number(r.total_chars) }));

// 4. Fetch page counts per book from TiDB
const pageCounts = await conn.execute(`
  SELECT book_id, COUNT(*) as page_count
  FROM book_pages
  GROUP BY book_id
`);
const pageCountMap = new Map();
pageCounts.forEach(r => pageCountMap.set(r.book_id, Number(r.page_count)));

// Create indexes
const invByChapterId = new Map(invUnits.map(u => [u.chapter_id, u]));
const invByBookAndNum = new Map(invUnits.map(u => [`${u.book_id}::${u.chapter_number}`, u]));

// Build unit matrix
const matrix = [];
const bookMap = new Map(dbBooks.map(b => [b.id, b]));

for (const ch of dbChapters) {
  const book = bookMap.get(ch.book_id) || {};
  const chunks = chunkCountMap.get(ch.id) || { count: 0, chars: 0 };
  
  // Try direct UUID match first, then book_id + chapter_number match
  let invUnit = invByChapterId.get(ch.id);
  let idMatchMethod = 'EXACT_UUID';
  if (!invUnit) {
    invUnit = invByBookAndNum.get(`${ch.book_id}::${ch.chapter_number}`);
    if (invUnit) {
      idMatchMethod = 'BOOK_AND_NUM_ONLY';
    }
  }

  matrix.push({
    book_id: ch.book_id,
    book_title_ar: book.title_ar || 'غير معروف',
    book_title_en: book.title_en || 'Unknown',
    grade_name_ar: book.grade_name_ar || 'غير معروف',
    grade_code: book.grade_code || '',
    subject_name_ar: book.subject_name_ar || 'غير معروف',
    subject_code: book.subject_code || '',
    chapter_id: ch.id,
    chapter_number: ch.chapter_number,
    unit_title_ar: ch.title_ar,
    unit_title_en: ch.title_en,
    page_range: `${ch.start_page} - ${ch.end_page}`,
    page_span: (Number(ch.end_page) - Number(ch.start_page) + 1),
    tidb_chunk_count: chunks.count,
    tidb_total_chars: chunks.chars,
    // Inventory attributes
    inventory_chapter_id: invUnit ? invUnit.chapter_id : null,
    id_match_method: invUnit ? idMatchMethod : 'NOT_FOUND_IN_INVENTORY',
    readiness_status: invUnit ? invUnit.readiness_status : 'NOT_AUDITED',
    visual_dependencies: invUnit ? invUnit.visual_dependencies : 'UNKNOWN',
    status_reason: invUnit ? invUnit.status_reason : 'No record in inventory',
    evidence_and_issues: invUnit ? invUnit.evidence_and_unresolved_issues : 'Unmatched in inventory'
  });
}

// Generate summary statistics
const summaryByStatus = {};
const summaryByBook = {};
let uuidExactMatches = 0;
let uuidMismatches = 0;

matrix.forEach(m => {
  summaryByStatus[m.readiness_status] = (summaryByStatus[m.readiness_status] || 0) + 1;
  if (!summaryByBook[m.book_title_ar]) {
    summaryByBook[m.book_title_ar] = {
      book_id: m.book_id,
      grade: m.grade_name_ar,
      subject: m.subject_name_ar,
      total_units: 0,
      verified_ready: 0,
      conditionally_ready: 0,
      blocked: 0,
      not_audited: 0,
      total_chunks: 0
    };
  }
  const b = summaryByBook[m.book_title_ar];
  b.total_units++;
  b.total_chunks += m.tidb_chunk_count;
  if (m.readiness_status === 'VERIFIED_READY') b.verified_ready++;
  else if (m.readiness_status === 'CONDITIONALLY_READY') b.conditionally_ready++;
  else if (m.readiness_status === 'BLOCKED') b.blocked++;
  else b.not_audited++;

  if (m.id_match_method === 'EXACT_UUID') uuidExactMatches++;
  else if (m.id_match_method === 'BOOK_AND_NUM_ONLY') uuidMismatches++;
});

const report = {
  total_tidb_books: dbBooks.length,
  total_tidb_chapters: dbChapters.length,
  total_inventory_units: invUnits.length,
  uuid_exact_matches: uuidExactMatches,
  uuid_mismatches_against_inventory: uuidMismatches,
  status_counts: summaryByStatus,
  book_summaries: summaryByBook,
  units_matrix: matrix
};

fs.writeFileSync('scripts/54_units_matrix_report.json', JSON.stringify(report, null, 2), 'utf8');
console.log('Matrix generated successfully.');
console.log('TiDB Chapters:', dbChapters.length);
console.log('Status counts from TiDB chapters mapped to inventory:');
console.log(summaryByStatus);
console.log('UUID exact matches:', uuidExactMatches, '| UUID mismatches:', uuidMismatches);

process.exit(0);
