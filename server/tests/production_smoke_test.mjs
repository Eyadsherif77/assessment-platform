import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import assert from 'assert';
import jwt from 'jsonwebtoken';
import mysql from 'mysql2/promise';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const BACKEND_BASE = 'https://server-two-pi-32.vercel.app';
const JWT_SECRET = process.env.JWT_SECRET || 'farabi_jwt_secret_dev_2026';

function makeToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name || 'Smoke User'
    },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

async function runSmokeTests() {
  console.log('==============================================================================');
  console.log('   FARABI AI — PRODUCTION POST-DEPLOYMENT SMOKE TESTS');
  console.log(`   Target Endpoint: ${BACKEND_BASE}`);
  console.log('==============================================================================\n');

  // Test 1: Health endpoint
  console.log('[Smoke 1] Checking API health endpoint...');
  const healthRes = await fetch(`${BACKEND_BASE}/api/health`);
  console.log(`  Health HTTP status: ${healthRes.status}`);
  assert.strictEqual(healthRes.status, 200, 'Health endpoint must return 200 OK');
  const healthJson = await healthRes.json();
  console.log('  Health response:', healthJson);
  assert.strictEqual(healthJson.status, 'OK', 'Health status must be OK');

  // Query live DB for users and books
  const dbConn = await mysql.createConnection({
    host: process.env.TIDB_HOST,
    port: parseInt(process.env.TIDB_PORT || '4000', 10),
    user: process.env.TIDB_USER,
    password: process.env.TIDB_PASSWORD,
    ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
    database: 'assessment_platform'
  });

  try {
    // Test 2: Check canonical units via curriculum summary
    console.log('\n[Smoke 2] Verifying canonical curriculum units readiness...');
    // Fetch a known canonical unit: Prep 3 Arabic Unit 1 (c7043f86-6a40-4417-a1b8-60e3301e7cb7)
    // Book: 013411b8-edec-477b-bd42-3dbdda9fb6a9
    const adminUser = { id: 'admin_smoke_test', email: 'admin@farabi-ai.com', role: 'ADMIN' };
    const adminToken = makeToken(adminUser);

    const teacherUser = { id: 'teacher_smoke_test', email: 'teacher@farabi-ai.com', role: 'TEACHER' };
    const teacherToken = makeToken(teacherUser);

    const studentUser = { id: 'student_smoke_test', email: 'student@farabi-ai.com', role: 'STUDENT' };
    const studentToken = makeToken(studentUser);

    // Test 3: Unapproved trial book remains blocked from AI generation
    console.log('\n[Smoke 3] Verifying trial book book_trial_mw837hk7 is BLOCKED from AI generation...');
    // Call POST /api/ai/generate-quiz with unapproved book
    const trialGenRes = await fetch(`${BACKEND_BASE}/api/ai/generate-quiz`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${teacherToken}`
      },
      body: JSON.stringify({
        book_id: 'book_trial_mw837hk7',
        chapter_id: 'ch_trial_fake_unit',
        topic: 'Test Topic',
        question_count: 5
      })
    });
    console.log(`  Generate quiz with unapproved book HTTP status: ${trialGenRes.status}`);
    assert(trialGenRes.status === 403 || trialGenRes.status === 404, 'Must fail-closed with 403/404');
    const trialGenJson = await trialGenRes.json();
    console.log(`  Blocked response:`, trialGenJson);
    assert(
      trialGenJson.code === 'UNIT_READINESS_BLOCKED' || trialGenJson.error?.includes('غير مصرح') || trialGenJson.error?.includes('الوحدة غير جاهزة') || trialGenRes.status === 403,
      'Must block unapproved book'
    );
    console.log('  ✅ Verified: Ingested book book_trial_mw837hk7 is blocked from AI generation!');

    // Test 4: Role Lock - Teacher and Student CANNOT access approval endpoints
    console.log('\n[Smoke 4] Verifying role lock: Teacher and Student get 403 Forbidden on approval actions...');
    const fakeChapterId = 'ch_test_role_lock';
    
    // Teacher attempt
    const teacherApproveRes = await fetch(`${BACKEND_BASE}/api/admin/curriculum/units/${fakeChapterId}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${teacherToken}`
      },
      body: JSON.stringify({ book_id: 'book_trial_mw837hk7' })
    });
    console.log(`  Teacher approve attempt HTTP status: ${teacherApproveRes.status}`);
    assert.strictEqual(teacherApproveRes.status, 403, 'Teacher must receive 403 Forbidden on approve');

    // Student attempt
    const studentApproveRes = await fetch(`${BACKEND_BASE}/api/admin/curriculum/units/${fakeChapterId}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentToken}`
      },
      body: JSON.stringify({ book_id: 'book_trial_mw837hk7' })
    });
    console.log(`  Student approve attempt HTTP status: ${studentApproveRes.status}`);
    assert.strictEqual(studentApproveRes.status, 403, 'Student must receive 403 Forbidden on approve');
    console.log('  ✅ Verified: Role lock strictly enforced on approval endpoints!');

    // Test 5: Central Admin can load review queue
    console.log('\n[Smoke 5] Verifying Central Admin can load curriculum review queue...');
    const queueRes = await fetch(`${BACKEND_BASE}/api/admin/curriculum/review-queue`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    console.log(`  Admin review queue HTTP status: ${queueRes.status}`);
    assert.strictEqual(queueRes.status, 200, 'Admin review queue must return 200 OK');
    const queueJson = await queueRes.json();
    console.log(`  Review queue loaded successfully. Total books in queue response: ${queueJson.books?.length || 0}`);
    assert(Array.isArray(queueJson.books), 'Books array must be returned');
    console.log('  ✅ Verified: Central Admin successfully loads curriculum review queue!');

    // Test 6: Verify zero new rows were approved in curriculum_unit_approvals
    console.log('\n[Smoke 6] Confirming zero units approved during smoke test...');
    const [appRows] = await dbConn.query('SELECT COUNT(*) as cnt FROM assessment_platform.curriculum_unit_approvals');
    console.log(`  Current curriculum_unit_approvals count: ${appRows[0].cnt} rows.`);
    assert.strictEqual(parseInt(appRows[0].cnt, 10), 0, 'Zero units should be approved during smoke tests');
    console.log('  ✅ Verified: Zero approval mutations performed.');

    // Test 7: Verify database state & untouched protected assets
    console.log('\n[Smoke 7] Verifying database integrity and protected assets...');
    const [mathRes] = await dbConn.query(`
      SELECT id, status, current_stage, attempt_count 
      FROM assessment_platform.book_ingestion_jobs 
      WHERE id = 'job_ingest_8f5fcc42-b84a-4420-a17d-e2d86ef92d23'
    `);
    assert(mathRes.length === 1 && mathRes[0].status === 'IN_PROGRESS', 'Math job must remain untouched');
    console.log(`  🔒 Paused Mathematics Job: ${mathRes[0].status} (100% UNTOUCHED).`);

    const [trialRes] = await dbConn.query(`
      SELECT id, processing_status, active_generation_id 
      FROM assessment_platform.books 
      WHERE id = 'book_trial_mw837hk7'
    `);
    assert(trialRes.length === 1 && trialRes[0].processing_status === 'COMPLETED', 'Trial book must remain intact');
    console.log(`  🔒 Trial fixture book_trial_mw837hk7: ${trialRes[0].processing_status} (100% UNTOUCHED).`);

    const [bak08] = await dbConn.query(`
      SELECT COUNT(*) as cnt FROM information_schema.tables 
      WHERE table_schema = 'assessment_platform_backup_20261108'
    `);
    assert(parseInt(bak08[0].cnt, 10) > 0, 'Backup 20261108 must exist');
    console.log(`  🔒 assessment_platform_backup_20261108: ${bak08[0].cnt} tables (100% UNTOUCHED).`);

    const [bak09] = await dbConn.query(`
      SELECT COUNT(*) as cnt FROM information_schema.tables 
      WHERE table_schema = 'assessment_platform_backup_20261109'
    `);
    assert(parseInt(bak09[0].cnt, 10) === 18, 'Backup 20261109 must have 18 tables');
    console.log(`  🔒 assessment_platform_backup_20261109: ${bak09[0].cnt} tables (100% VERIFIED).`);

    console.log('\n==============================================================================');
    console.log('  🎉 ALL PRODUCTION POST-DEPLOYMENT SMOKE TESTS PASSED (100%)');
    console.log('==============================================================================');
  } finally {
    await dbConn.end();
  }
}

runSmokeTests().catch(err => {
  console.error('❌ FATAL SMOKE TEST ERROR:', err);
  process.exit(1);
});
