import test, { describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupDisposableTestDb, assertDatabaseIsDisposable, teardownDisposableTestDb } from './test_isolation_helper.mjs';

// Setup disposable database for safe, isolated testing
const { tempDir, dbPath } = setupDisposableTestDb('dependent_account_creation');

// Set NODE_ENV to test so external network and live DB are never touched
process.env.NODE_ENV = 'test';

import { db } from '../src/db/db.js';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';

describe('Regression Test: Dependent / Subordinate Account Creation & Teaching Assignments', () => {
  let supervisorId: string;
  let adminId: string;
  let gradeId: string;
  let stageId: string;
  let subjectId: string;

  before(async () => {
    await db.init();
    assertDatabaseIsDisposable(db, dbPath);

    // 1. Fetch seeded stage & grade
    const stageRes = await db.query(`SELECT id FROM academic_stages WHERE code = 'PREPARATORY'`);
    const gradeRes = await db.query(`SELECT id FROM grades WHERE code = 'PREP_3'`);
    stageId = stageRes.rows[0].id;
    gradeId = gradeRes.rows[0].id;

    // 2. Create subject
    subjectId = `subj_${uuidv4()}`;
    await db.query(`INSERT INTO subjects (id, grade_id, code, name_ar, name_en) VALUES ($1, $2, 'MATH', 'الرياضيات', 'Mathematics')`, [subjectId, gradeId]);

    // 3. Create Admin & Supervisor users
    adminId = `admin_${uuidv4()}`;
    supervisorId = `sup_${uuidv4()}`;
    await db.query(`
      INSERT INTO users (id, email, password_hash, role, full_name, is_active)
      VALUES ($1, 'admin@test.gov.eg', 'hash', 'ADMIN', 'مدير النظام المركزى', 1),
             ($2, 'supervisor@test.gov.eg', 'hash', 'SUPERVISOR', 'الموجه العام للرياضيات', 1)
    `, [adminId, supervisorId]);
  });

  after(async () => {
    await teardownDisposableTestDb(db, tempDir);
  });

  test('Scenario 1: Creating a dependent teacher account with teachingAssignments succeeds and persists to teacher_profiles', async () => {
    const newTeacherId = uuidv4();
    const cleanEmail = `sub_teacher_${Date.now()}@test.com`;
    const cleanUsername = `sub_teacher_${Date.now()}`;
    const passwordHash = await bcrypt.hash('SecurePass123!', 10);
    const teachingAssignments = [
      {
        subjectId,
        subjectName: 'الرياضيات',
        gradeIds: [gradeId]
      }
    ];

    // Simulate POST /api/hierarchy/subordinates execution for targetRole = 'TEACHER'
    await db.query(
      `INSERT INTO users (
        id, hybrid_id, email, username, password_hash, role, full_name, 
        governorate_id, subject_id, created_by, permissions, initial_password, is_active
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        newTeacherId,
        'HYB-TEA-TEST',
        cleanEmail,
        cleanUsername,
        passwordHash,
        'TEACHER',
        'أ. أحمد محمد علي',
        null,
        subjectId,
        supervisorId,
        JSON.stringify({ can_view_exams: true }),
        'SecurePass123!',
        1
      ]
    );

    // Verify insertion into teacher_profiles including teaching_assignments column
    await db.query(
      `INSERT INTO teacher_profiles (
        user_id, full_name, school_name, specialization, 
        governorate_id, subject_id, supervisor_id, grade_id, academic_stage_id,
        assigned_subjects, assigned_grades, teaching_assignments
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        newTeacherId,
        'أ. أحمد محمد علي',
        'مدرسة النور الإعدادية',
        'الرياضيات',
        null,
        subjectId,
        supervisorId,
        gradeId,
        stageId,
        JSON.stringify(['الرياضيات']),
        JSON.stringify([gradeId]),
        JSON.stringify(teachingAssignments)
      ]
    );

    // Retrieve teacher profile as done in auth.ts
    const tp = await db.query(
      `SELECT tp.*, g.name_ar as grade_name_ar, s.name_ar as stage_name_ar
       FROM teacher_profiles tp
       LEFT JOIN grades g ON tp.grade_id = g.id
       LEFT JOIN academic_stages s ON tp.academic_stage_id = s.id
       WHERE tp.user_id = $1`,
      [newTeacherId]
    );

    assert.equal(tp.rows.length, 1, 'Teacher profile must exist');
    const row = tp.rows[0];
    assert.equal(row.full_name, 'أ. أحمد محمد علي');
    assert.equal(row.supervisor_id, supervisorId);

    // Parse teaching_assignments
    const parsedAssignments = typeof row.teaching_assignments === 'string'
      ? JSON.parse(row.teaching_assignments)
      : row.teaching_assignments;

    assert.ok(Array.isArray(parsedAssignments), 'teaching_assignments must be an array');
    assert.equal(parsedAssignments.length, 1);
    assert.equal(parsedAssignments[0].subjectId, subjectId);
    assert.equal(parsedAssignments[0].subjectName, 'الرياضيات');
    assert.deepEqual(parsedAssignments[0].gradeIds, [gradeId]);
  });

  test('Scenario 2: Creating a dependent supervisor account without teacher_profiles succeeds', async () => {
    const newSupervisorId = uuidv4();
    const cleanEmail = `sub_sup_${Date.now()}@test.com`;
    const passwordHash = await bcrypt.hash('SecurePass123!', 10);

    await db.query(
      `INSERT INTO users (
        id, hybrid_id, email, username, password_hash, role, full_name, 
        governorate_id, subject_id, created_by, permissions, initial_password, is_active
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        newSupervisorId,
        'HYB-SUP-TEST',
        cleanEmail,
        'sub_sup',
        passwordHash,
        'SUPERVISOR',
        'د. سارة محمود',
        null,
        subjectId,
        adminId,
        JSON.stringify({ can_create_subordinates: true }),
        'SecurePass123!',
        1
      ]
    );

    const u = await db.query(`SELECT id, role, created_by FROM users WHERE id = $1`, [newSupervisorId]);
    assert.equal(u.rows.length, 1);
    assert.equal(u.rows[0].role, 'SUPERVISOR');
    assert.equal(u.rows[0].created_by, adminId);
  });

  test('Scenario 3: Teacher self-registration and standard profile insertion without teaching_assignments succeeds', async () => {
    const selfTeacherId = uuidv4();
    const cleanEmail = `self_teacher_${Date.now()}@test.com`;
    const passwordHash = await bcrypt.hash('SecurePass123!', 10);

    await db.query(
      `INSERT INTO users (id, hybrid_id, email, username, password_hash, role, full_name, permissions, is_active)
       VALUES ($1, 'HYB-TEA-SELF', $2, 'self_teacher', $3, 'TEACHER', 'أ. محمد سعيد', '{}', 1)`,
      [selfTeacherId, cleanEmail, passwordHash]
    );

    // Self-registration insert query (from auth.ts)
    await db.query(
      `INSERT INTO teacher_profiles (user_id, full_name, school_name, specialization)
       VALUES ($1, $2, $3, $4)`,
      [selfTeacherId, 'أ. محمد سعيد', 'مدرسة الأمل', 'العلوم']
    );

    const tp = await db.query(`SELECT user_id, full_name, teaching_assignments FROM teacher_profiles WHERE user_id = $1`, [selfTeacherId]);
    assert.equal(tp.rows.length, 1);
    assert.equal(tp.rows[0].full_name, 'أ. محمد سعيد');
    // teaching_assignments should be null without causing any error
    assert.equal(tp.rows[0].teaching_assignments, null);
  });
});
