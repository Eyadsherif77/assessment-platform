import dotenv from 'dotenv';
dotenv.config({ path: './.env' });
import { connect } from '@tidbcloud/serverless';

async function cleanup() {
  const conn = connect({
    host: process.env.TIDB_HOST,
    username: process.env.TIDB_USER,
    password: process.env.TIDB_PASSWORD,
    database: process.env.TIDB_DATABASE
  });

  console.log('--- Step 1: Deleting the 5 pre-made Prep 1 exams ---');
  const exams = await conn.execute(`SELECT id FROM exams WHERE id LIKE 'exam_prep1_%'`);
  console.log(`Found ${exams.length} seeded exams to remove.`);

  for (const ex of exams) {
    const qRows = await conn.execute(`SELECT id FROM exam_questions WHERE exam_id = ?`, [ex.id]);
    for (const q of qRows) {
      await conn.execute(`DELETE FROM exam_question_options WHERE question_id = ?`, [q.id]);
    }
    await conn.execute(`DELETE FROM exam_questions WHERE exam_id = ?`, [ex.id]);
    await conn.execute(`DELETE FROM exams WHERE id = ?`, [ex.id]);
  }
  console.log('Seeded exams removed successfully.');

  console.log('--- Step 2: Removing all users except ADMIN ---');
  const nonAdminUsers = await conn.execute(`SELECT id, full_name, role FROM users WHERE role != 'ADMIN' AND id != 'admin-owner-001'`);
  console.log(`Found ${nonAdminUsers.length} non-admin users to remove:`, nonAdminUsers.map(u => `${u.full_name} (${u.role})`));

  for (const u of nonAdminUsers) {
    const uid = u.id;
    // Clean up student answers via attempt_id
    const attempts = await conn.execute(`SELECT id FROM exam_attempts WHERE student_id = ?`, [uid]);
    for (const att of attempts) {
      await conn.execute(`DELETE FROM student_answers WHERE attempt_id = ?`, [att.id]);
    }
    await conn.execute(`DELETE FROM exam_attempts WHERE student_id = ?`, [uid]);
    await conn.execute(`DELETE FROM ai_evaluations WHERE student_id = ?`, [uid]);
    await conn.execute(`DELETE FROM student_topic_mastery WHERE student_id = ?`, [uid]);
    await conn.execute(`DELETE FROM student_learning_history WHERE student_id = ?`, [uid]);
    await conn.execute(`DELETE FROM user_active_devices WHERE user_id = ?`, [uid]);
    
    // Clean up profiles
    await conn.execute(`DELETE FROM student_profiles WHERE user_id = ?`, [uid]);
    await conn.execute(`DELETE FROM teacher_profiles WHERE user_id = ?`, [uid]);

    // Delete user record
    await conn.execute(`DELETE FROM users WHERE id = ?`, [uid]);
  }

  // Also clean up any lingering attempts or devices not attached to admin
  await conn.execute(`DELETE FROM user_active_devices WHERE user_id != 'admin-owner-001'`);
  await conn.execute(`DELETE FROM exam_attempts WHERE student_id != 'admin-owner-001'`);

  console.log('--- Step 3: Verification ---');
  const remainingUsers = await conn.execute(`SELECT id, full_name, email, role FROM users`);
  console.log('Remaining Users in DB:', remainingUsers);

  const remainingExams = await conn.execute(`SELECT id, title_ar FROM exams`);
  console.log('Remaining Exams in DB:', remainingExams);

  const booksCount = await conn.execute(`SELECT COUNT(*) as cnt FROM books`);
  console.log('Books count intact:', booksCount[0].cnt);

  console.log('Cleanup completed successfully!');
}

cleanup().catch(err => {
  console.error('Cleanup failed:', err);
  process.exit(1);
});
