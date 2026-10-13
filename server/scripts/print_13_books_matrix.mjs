import fs from 'fs';
const data = JSON.parse(fs.readFileSync('scripts/54_units_matrix_report.json', 'utf8'));

// Group matrix by book_id
const booksMap = new Map();
data.units_matrix.forEach(u => {
  if (!booksMap.has(u.book_id)) {
    booksMap.set(u.book_id, {
      book_id: u.book_id,
      title_ar: u.book_title_ar,
      title_en: u.book_title_en,
      grade: u.grade_name_ar,
      subject: u.subject_name_ar,
      units: []
    });
  }
  booksMap.get(u.book_id).units.push(u);
});

console.log(`Total books: ${booksMap.size}\n`);

for (const [bookId, b] of booksMap.entries()) {
  console.log(`### ${b.title_ar} - ${b.grade} (${b.subject})`);
  console.log(`Book ID: \`${bookId}\` | Total Units: ${b.units.length}`);
  b.units.forEach(u => {
    console.log(`- **Ch ${u.chapter_number}**: ${u.unit_title_ar} | Status: **${u.readiness_status}** | Pages: ${u.page_range} | Chunks: ${u.tidb_chunk_count} | Visual: ${u.visual_dependencies}`);
  });
  console.log('');
}
