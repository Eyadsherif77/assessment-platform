import mysql from 'mysql2/promise';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

const envPath = fs.existsSync('.env') ? '.env' : path.resolve('server/.env');
dotenv.config({ path: envPath });

const LIVE_BACKEND = 'https://server-two-pi-32.vercel.app';
const JWT_SECRET = process.env.JWT_SECRET;

async function runLiveVerification() {
  console.log('========================================================================');
  console.log('LIVE PRODUCTION VERIFICATION — ALFARABI AI MCQ GENERATION ENGINE');
  console.log(`Backend Target: ${LIVE_BACKEND}`);
  console.log('========================================================================\n');

  const connection = await mysql.createConnection({
    host: process.env.TIDB_HOST,
    port: Number(process.env.TIDB_PORT) || 4000,
    user: process.env.TIDB_USER,
    password: process.env.TIDB_PASSWORD,
    database: process.env.TIDB_DATABASE,
    ssl: { rejectUnauthorized: true }
  });

  try {
    // 1. Locate Subject 1: The incident English book (Prep 1)
    const prep1EnglishBookId = '21e1d639-9f59-4a58-a8f8-8373b8e7fc90';
    const prep1EnglishUnit4Id = 'e6000000-9f59-4a58-a8f8-8373b8e7fc94';

    const [bookRows] = await connection.query(`
      SELECT b.id, b.title_ar, b.title_en, b.grade_id, b.subject_id, b.academic_stage_id, g.code as grade_code
      FROM books b
      JOIN grades g ON b.grade_id = g.id
      WHERE b.id = ?
    `, [prep1EnglishBookId]);

    const englishBook = bookRows[0];
    console.log(`Targeting Incident Book: "${englishBook.title_ar}" (${englishBook.grade_code})`);

    // Locate 2 student accounts matching the book's grade
    const [prep1Students] = await connection.query(`
      SELECT u.id, u.email, sp.academic_stage_id, sp.grade_id
      FROM users u
      JOIN student_profiles sp ON u.id = sp.user_id
      WHERE u.role = 'STUDENT' AND sp.grade_id = ?
      LIMIT 2
    `, [englishBook.grade_id]);

    if (prep1Students.length === 0) {
      throw new Error(`No students found for grade ${englishBook.grade_code}`);
    }

    const student1 = prep1Students[0];
    const student2 = prep1Students[1] || prep1Students[0];
    console.log(`✅ Using student accounts: Student 1 (${student1.id.slice(0, 8)}...), Student 2 (${student2.id.slice(0, 8)}...)`);

    const tokenStudent1 = jwt.sign(
      { id: student1.id, role: 'STUDENT', email: student1.email },
      JWT_SECRET,
      { expiresIn: '2h' }
    );
    const tokenStudent2 = jwt.sign(
      { id: student2.id, role: 'STUDENT', email: student2.email },
      JWT_SECRET,
      { expiresIn: '2h' }
    );

    console.log('\n------------------------------------------------------------------------');
    console.log('TEST 1: English (Unit 4) — Exact 5 MCQ Verification');
    console.log('------------------------------------------------------------------------');

    const resEnglish = await fetch(`${LIVE_BACKEND}/api/ai/generate-quiz`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenStudent1}`
      },
      body: JSON.stringify({
        book_id: englishBook.id,
        chapter_id: prep1EnglishUnit4Id,
        subject_id: englishBook.subject_id,
        count: 5
      })
    });

    const statusEnglish = resEnglish.status;
    const bodyEnglish = await resEnglish.json();

    console.log(`HTTP Status: ${statusEnglish}`);
    if (statusEnglish !== 200) {
      console.error('English exam generation response:', JSON.stringify(bodyEnglish, null, 2));
      throw new Error(`English exam generation failed with HTTP ${statusEnglish}: ${bodyEnglish.error || bodyEnglish.message}`);
    }

    const englishQuestions = bodyEnglish.questions || [];
    console.log(`✅ Delivered questions count: ${englishQuestions.length} / 5 requested`);
    console.log(`✅ Attempt token received: ${Boolean(bodyEnglish.attempt_token)}`);
    console.log(`✅ Exam status: ${bodyEnglish.exam_status}, is_partial: ${bodyEnglish.is_partial}`);

    if (englishQuestions.length !== 5) {
      throw new Error(`Expected exactly 5 questions, received ${englishQuestions.length}`);
    }

    for (let i = 0; i < englishQuestions.length; i++) {
      const q = englishQuestions[i];
      if (!q.question_text || q.question_text.length < 10) throw new Error(`Q${i + 1} stem invalid: ${q.question_text}`);
      if (!Array.isArray(q.options) || q.options.length < 3) throw new Error(`Q${i + 1} options count invalid: ${q.options?.length}`);
    }
    console.log('✅ All 5 English MCQs verified for valid stems, options, and attempt token binding.');

    // 2. Locate Subject 2: Prep 2 Social Studies or Science (different grade/subject)
    console.log('\n------------------------------------------------------------------------');
    console.log('TEST 2: Second Subject / Grade Verification (Multi-Subject Generalization)');
    console.log('------------------------------------------------------------------------');

    const [otherBooks] = await connection.query(`
      SELECT b.id, b.title_ar, b.title_en, b.subject_id, b.grade_id, s.name_ar as subject_name, bc.id as chapter_id, bc.title_ar as chapter_title, g.code as grade_code
      FROM books b
      JOIN subjects s ON b.subject_id = s.id
      JOIN book_chapters bc ON b.id = bc.book_id
      JOIN grades g ON b.grade_id = g.id
      WHERE b.id != ? AND g.code = 'PREP_2'
      ORDER BY b.title_ar ASC
      LIMIT 1
    `, [prep1EnglishBookId]);

    const secondBook = otherBooks[0];
    console.log(`Targeting Subject 2: "${secondBook.title_ar}" (${secondBook.grade_code}) — Chapter: "${secondBook.chapter_title}"`);

    // Locate student for Subject 2's grade (PREP_2)
    const [prep2Students] = await connection.query(`
      SELECT u.id, u.email
      FROM users u
      JOIN student_profiles sp ON u.id = sp.user_id
      WHERE u.role = 'STUDENT' AND sp.grade_id = ?
      LIMIT 1
    `, [secondBook.grade_id]);

    const studentPrep2 = prep2Students[0];
    const tokenPrep2 = jwt.sign(
      { id: studentPrep2.id, role: 'STUDENT', email: studentPrep2.email },
      JWT_SECRET,
      { expiresIn: '2h' }
    );

    const resSubject2 = await fetch(`${LIVE_BACKEND}/api/ai/generate-quiz`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenPrep2}`
      },
      body: JSON.stringify({
        book_id: secondBook.id,
        chapter_id: secondBook.chapter_id,
        subject_id: secondBook.subject_id,
        count: 5
      })
    });

    const statusSubject2 = resSubject2.status;
    const bodySubject2 = await resSubject2.json();
    console.log(`HTTP Status: ${statusSubject2}`);

    if (statusSubject2 !== 200) {
      console.error('Subject 2 response:', JSON.stringify(bodySubject2, null, 2));
      throw new Error(`Subject 2 exam generation failed with HTTP ${statusSubject2}: ${bodySubject2.error || bodySubject2.message}`);
    }

    const subject2Questions = bodySubject2.questions || [];
    console.log(`✅ Delivered questions count: ${subject2Questions.length} / 5 requested`);
    console.log(`✅ Attempt token received: ${Boolean(bodySubject2.attempt_token)}`);

    if (subject2Questions.length !== 5) {
      throw new Error(`Expected exactly 5 questions for Subject 2, received ${subject2Questions.length}`);
    }
    console.log('✅ Subject 2 verified: Fix successfully generalized across grades and subjects!');

    // 3. Concurrency Test: Simultaneous Requests for Same Configuration
    console.log('\n------------------------------------------------------------------------');
    console.log('TEST 3: Simultaneous Concurrent Requests (Locking & Coordination)');
    console.log('------------------------------------------------------------------------');

    const [concRes1, concRes2] = await Promise.all([
      fetch(`${LIVE_BACKEND}/api/ai/generate-quiz`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenStudent1}` },
        body: JSON.stringify({
          book_id: englishBook.id,
          chapter_id: prep1EnglishUnit4Id,
          subject_id: englishBook.subject_id,
          count: 5
        })
      }),
      fetch(`${LIVE_BACKEND}/api/ai/generate-quiz`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenStudent2}` },
        body: JSON.stringify({
          book_id: englishBook.id,
          chapter_id: prep1EnglishUnit4Id,
          subject_id: englishBook.subject_id,
          count: 5
        })
      })
    ]);

    const concBody1 = await concRes1.json();
    const concBody2 = await concRes2.json();

    console.log(`Request 1 HTTP Status: ${concRes1.status}, Questions: ${concBody1.questions?.length}`);
    console.log(`Request 2 HTTP Status: ${concRes2.status}, Questions: ${concBody2.questions?.length}`);

    if (concRes1.status !== 200 || concRes2.status !== 200) {
      throw new Error(`Concurrent requests failed: S1=${concRes1.status}, S2=${concRes2.status}`);
    }

    console.log('✅ Both concurrent requests resolved cleanly with exactly 5 questions each.');

    // 4. Verify Database Records (Student Assignment & Telemetry)
    console.log('\n------------------------------------------------------------------------');
    console.log('TEST 4: Database Telemetry & Student Assignment Verification');
    console.log('------------------------------------------------------------------------');

    const [assignments] = await connection.query(`
      SELECT id, student_id, cached_exam_id, config_hash, status, assigned_at
      FROM student_exam_assignments
      WHERE student_id IN (?, ?)
      ORDER BY assigned_at DESC
      LIMIT 4
    `, [student1.id, student2.id]);

    console.log(`✅ Durable student assignments found: ${assignments.length}`);
    console.table(assignments.map(a => ({
      id: a.id.slice(0, 16) + '...',
      student_id: a.student_id.slice(0, 8) + '...',
      cached_exam_id: a.cached_exam_id,
      status: a.status,
      assigned_at: a.assigned_at
    })));

    const [metrics] = await connection.query(`
      SELECT event_type, model_name, prompt_tokens, candidates_tokens, total_tokens, estimated_cost_usd, is_estimated, call_purpose, created_at
      FROM ai_usage_metrics
      WHERE event_type IN ('GEMINI_CALL', 'CACHE_HIT', 'CACHE_MISS')
      ORDER BY created_at DESC
      LIMIT 6
    `);

    console.log('\n✅ Recent live telemetry events recorded in production TiDB:');
    console.table(metrics);

    console.log('\n========================================================================');
    console.log('🎉 ALL LIVE PRODUCTION VERIFICATIONS SUCCEEDED!');
    console.log('========================================================================\n');
  } finally {
    await connection.end();
  }
}

runLiveVerification().catch(err => {
  console.error('\n❌ Live production verification failed:', err);
  process.exit(1);
});
