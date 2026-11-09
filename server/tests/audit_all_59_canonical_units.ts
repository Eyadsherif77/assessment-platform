import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ReadinessValidator } from '../src/services/readinessValidator.js';
import { db } from '../src/db/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runAudit() {
  const inventoryPath = path.resolve(__dirname, '../src/data/authoritative_curriculum_inventory.json');
  const inventoryRaw = fs.readFileSync(inventoryPath, 'utf8');
  const inventoryData = JSON.parse(inventoryRaw);

  const units = inventoryData.units;
  console.log(`Auditing ${units.length} canonical curriculum units...`);

  // Intercept db.query to confirm zero DB queries occur for canonical units
  let queryCount = 0;
  const originalQuery = db.query.bind(db);
  db.query = async (sql: string, params?: any[]) => {
    queryCount++;
    console.error(`UNEXPECTED DB QUERY FOR CANONICAL UNIT: ${sql}`);
    return originalQuery(sql, params);
  };

  const results: any[] = [];
  let allReady = true;
  let allEligible = true;

  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    const res = await ReadinessValidator.getUnitReadinessAsync(u.book_id, u.chapter_id);

    const isReady = res.status === 'VERIFIED_READY';
    const isEligible = res.isEligibleForAI === true;

    if (!isReady) allReady = false;
    if (!isEligible) allEligible = false;

    results.push({
      index: i + 1,
      chapter_id: u.chapter_id,
      book_id: u.book_id,
      book_title_ar: u.book_title_ar,
      book_title_en: u.book_title_en,
      unit_title_ar: u.unit_title_ar,
      unit_title_en: u.unit_title_en,
      grade_ar: u.grade_ar,
      subject_ar: u.subject_ar,
      status: res.status,
      isEligibleForAI: res.isEligibleForAI,
      retrievalMode: res.retrievalMode,
      visualDependencies: res.visualDependencies
    });
  }

  // Restore db.query
  db.query = originalQuery;

  console.log(`Audit Complete:`);
  console.log(`Total Units Audited: ${results.length}`);
  console.log(`All 59 VERIFIED_READY: ${allReady}`);
  console.log(`All 59 isEligibleForAI === true: ${allEligible}`);
  console.log(`Database queries made during canonical audit: ${queryCount}`);

  // Write out results to JSON for verification
  fs.writeFileSync(
    path.resolve(__dirname, 'canonical_59_audit_result.json'),
    JSON.stringify({ allReady, allEligible, queryCount, results }, null, 2),
    'utf8'
  );

  if (!allReady || !allEligible || queryCount > 0) {
    process.exit(1);
  }
}

runAudit().catch(err => {
  console.error('Fatal audit error:', err);
  process.exit(1);
});
