import dotenv from 'dotenv';
dotenv.config({ path: './.env' });
import { db } from '../dist/db/db.js';

async function main() {
  const keepUserId = '79f5dfd6-2893-4ba5-b6d6-7176f68d633f';

  const target = await db.query(
    "SELECT id, super_id, username, email, full_name, role FROM users WHERE id = $1",
    [keepUserId]
  );
  if (target.rows.length === 0) {
    throw new Error('Target student ahmed@saleh not found! Aborting deletion.');
  }
  console.log('Keeping student intact:', target.rows[0]);

  // Clean exam and evaluation attempts
  try {
    await db.query(`
      DELETE FROM student_answers 
      WHERE attempt_id IN (
        SELECT id FROM exam_attempts 
        WHERE student_id != '${keepUserId}'
      )
    `);
  } catch (e) {
    console.log('student_answers cleanup note:', e.message);
  }

  try {
    await db.query(`DELETE FROM exam_attempts WHERE student_id != '${keepUserId}'`);
  } catch (e) {
    console.log('exam_attempts cleanup note:', e.message);
  }

  try {
    await db.query(`DELETE FROM ai_evaluations WHERE student_id != '${keepUserId}'`);
  } catch (e) {
    console.log('ai_evaluations cleanup note:', e.message);
  }

  // Delete student profiles
  const profRes = await db.query(`
    DELETE FROM student_profiles 
    WHERE user_id IN (
      SELECT id FROM users 
      WHERE role = 'STUDENT' AND id != '${keepUserId}'
    )
  `);
  console.log('Deleted student profiles.');

  // Delete users with role STUDENT except the kept one
  const userRes = await db.query(`
    DELETE FROM users 
    WHERE role = 'STUDENT' AND id != '${keepUserId}'
  `);
  console.log(`Deleted other student accounts.`);

  const remaining = await db.query("SELECT id, super_id, username, email, full_name, role FROM users WHERE role = 'STUDENT'");
  console.log(`Remaining student count: ${remaining.rows.length}`);
  console.table(remaining.rows);

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
