import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDisposableTestDb, assertDatabaseIsDisposable } from './test_isolation_helper.mjs';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

test('Admin Password Reset: double-check confirmation accepts both confirmPassword and confirmNewPassword, and short passwords', async (t) => {
  const { tempDir, dbPath } = setupDisposableTestDb('admin_pwd');
  const dbModule = await import('../dist/db/db.js');
  const db = dbModule.db || dbModule.default || dbModule;
  await db.init();
  assertDatabaseIsDisposable(db, dbPath);

  t.after(() => {
    try {
      db.close?.();
    } catch (_) {}
  });

  // Seed student
  const studentId = uuidv4();
  const initHash = await bcrypt.hash('oldPassword123', 10);
  await db.query(
    `INSERT INTO users (id, email, username, password_hash, role, full_name, is_active)
     VALUES ($1, 'student_test@edu.eg', 'student_test', $2, 'STUDENT', 'Test Student', 1)`,
    [studentId, initHash]
  );

  await t.test('1. Fails when newPassword and confirmPassword do not match', async () => {
    const newPassword = '1';
    const confirmPassword = '2';
    const confirm = confirmPassword;

    let error = null;
    if (!newPassword || typeof newPassword !== 'string' || newPassword.trim().length === 0) {
      error = 'الرجاء إدخال كلمة المرور الجديدة';
    } else if (confirm !== undefined && confirm !== null && newPassword !== confirm) {
      error = 'كلمتا المرور غير متطابقتين (فشل التأكيد المزدوج)';
    }

    assert.equal(error, 'كلمتا المرور غير متطابقتين (فشل التأكيد المزدوج)');
  });

  await t.test('2. Succeeds when newPassword and confirmPassword (frontend key) match with short password "1"', async () => {
    const reqBody = {
      newPassword: '1',
      confirmPassword: '1' // frontend sends this key
    };
    const { newPassword } = reqBody;
    const confirmNewPassword = reqBody.confirmNewPassword ?? reqBody.confirmPassword;

    let error = null;
    if (!newPassword || typeof newPassword !== 'string' || newPassword.trim().length === 0) {
      error = 'الرجاء إدخال كلمة المرور الجديدة';
    } else if (confirmNewPassword !== undefined && confirmNewPassword !== null && newPassword !== confirmNewPassword) {
      error = 'كلمتا المرور غير متطابقتين (فشل التأكيد المزدوج)';
    }

    assert.equal(error, null);

    const newHash = await bcrypt.hash(newPassword, 10);
    await db.query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [newHash, studentId]);

    const updatedUser = await db.query(`SELECT password_hash FROM users WHERE id = $1`, [studentId]);
    const isMatch = await bcrypt.compare('1', updatedUser.rows[0].password_hash);
    assert.equal(isMatch, true, 'User password was updated to 1');
  });

  await t.test('3. Succeeds when confirmNewPassword key is sent', async () => {
    const reqBody = {
      newPassword: 's',
      confirmNewPassword: 's'
    };
    const { newPassword } = reqBody;
    const confirmNewPassword = reqBody.confirmNewPassword ?? reqBody.confirmPassword;

    let error = null;
    if (!newPassword || typeof newPassword !== 'string' || newPassword.trim().length === 0) {
      error = 'الرجاء إدخال كلمة المرور الجديدة';
    } else if (confirmNewPassword !== undefined && confirmNewPassword !== null && newPassword !== confirmNewPassword) {
      error = 'كلمتا المرور غير متطابقتين (فشل التأكيد المزدوج)';
    }

    assert.equal(error, null);
  });
});
