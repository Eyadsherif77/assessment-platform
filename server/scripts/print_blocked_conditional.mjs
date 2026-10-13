import fs from 'fs';
const data = JSON.parse(fs.readFileSync('scripts/54_units_matrix_report.json', 'utf8'));
const blocked = data.units_matrix.filter(u => u.readiness_status === 'BLOCKED');
const conditional = data.units_matrix.filter(u => u.readiness_status === 'CONDITIONALLY_READY');

console.log('=== 4 BLOCKED UNITS ===');
blocked.forEach(u => {
  console.log(`[Book: ${u.book_title_ar} (${u.grade_name_ar})] Chapter ${u.chapter_number}: ${u.unit_title_ar}`);
  console.log(`  ID: ${u.chapter_id}`);
  console.log(`  Reason: ${u.status_reason}`);
  console.log(`  Visual: ${u.visual_dependencies}`);
  console.log(`  Evidence: ${u.evidence_and_issues}\n`);
});

console.log('=== 4 CONDITIONALLY READY UNITS ===');
conditional.forEach(u => {
  console.log(`[Book: ${u.book_title_ar} (${u.grade_name_ar})] Chapter ${u.chapter_number}: ${u.unit_title_ar}`);
  console.log(`  ID: ${u.chapter_id}`);
  console.log(`  Reason: ${u.status_reason}`);
  console.log(`  Visual: ${u.visual_dependencies}`);
  console.log(`  Evidence: ${u.evidence_and_issues}\n`);
});
