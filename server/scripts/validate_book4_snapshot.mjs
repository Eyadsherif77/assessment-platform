import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const snapPath = path.resolve('backups', 'snapshot_81b8a308-7fcf-4938-8c45-aa0056624f32_2026-10-11T20-02-32-408Z.json');
console.log('Path exists:', fs.existsSync(snapPath));
const content = JSON.parse(fs.readFileSync(snapPath, 'utf8'));

const calcChecksum = crypto.createHash('sha256').update(JSON.stringify(content.data)).digest('hex');

console.log(JSON.stringify({
  filePath: snapPath,
  file_size_bytes: fs.statSync(snapPath).size,
  recorded_checksum: content.meta.checksum,
  calculated_checksum: calcChecksum,
  checksum_matches: calcChecksum === content.meta.checksum,
  book_id: content.data.book_id,
  book_title: content.data.book_title,
  created_at: content.data.created_at,
  schema_version: content.data.schema_version,
  counts: content.data.counts,
  pages: content.data.tables.book_pages.map(p => ({ page_number: p.page_number, char_count: p.char_count, id: p.id })),
  chapters: content.data.tables.book_chapters.map(c => ({ id: c.id, num: c.chapter_number, title: c.title_ar, start: c.start_page, end: c.end_page })),
  chunks_count: content.data.tables.book_chunks.length,
  question_bank_items_count: content.data.tables.question_bank_items.length,
  question_bank_options_count: content.data.tables.question_bank_options.length,
  pdf_chunks_manifest_count: content.data.pdf_chunks_manifest.length
}, null, 2));
