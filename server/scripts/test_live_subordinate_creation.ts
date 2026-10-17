import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import jwt from 'jsonwebtoken';
import { connect } from '@tidbcloud/serverless';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function verifyProductionSubordinateCreation() {
  const jwtSecret = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
  const tidbConn = connect({
    host: process.env.TIDB_HOST,
    username: process.env.TIDB_USER,
    password: process.env.TIDB_PASSWORD,
    database: process.env.TIDB_DATABASE || 'assessment_platform'
  });

  console.log('--- 1. Querying an existing Admin / Supervisor from live TiDB ---');
  const adminRes: any = await tidbConn.execute(
    "SELECT id, email, role, full_name, governorate_id, subject_id FROM users WHERE role IN ('ADMIN', 'CENTRAL_ADMIN') LIMIT 1"
  );
  const adminUser = (adminRes.rows || adminRes)[0];
  if (!adminUser) {
    throw new Error('No admin user found in database to generate auth token');
  }
  console.log(`Using admin: ${adminUser.email} (Role: ${adminUser.role}, ID: ${adminUser.id})`);

  // Generate valid token
  const token = jwt.sign(
    {
      id: adminUser.id,
      email: adminUser.email,
      role: adminUser.role,
      fullName: adminUser.full_name,
      governorateId: adminUser.governorate_id || undefined,
      subjectId: adminUser.subject_id || undefined
    },
    jwtSecret,
    { expiresIn: '15m' }
  );

  console.log('\n--- 2. Testing POST /api/hierarchy/subordinates on live production ---');
  const testEmail = `prod_test_sub_${Date.now()}@al-farabi.internal`;
  const payload = {
    fullName: 'أ. تجربة فحص حساب تابع',
    email: testEmail,
    username: `test_teacher_${Date.now()}`,
    password: 'TemporaryPassword123!',
    targetRole: 'TEACHER',
    schoolName: 'مدرسة الاختبار المعيارية',
    specialization: 'الرياضيات',
    teachingAssignments: [
      {
        subjectName: 'الرياضيات',
        gradeIds: ['2f0f4f5a-7c5c-4136-a935-33c79effca3d']
      }
    ]
  };

  const response = await fetch('https://server-two-pi-32.vercel.app/api/hierarchy/subordinates', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });

  const status = response.status;
  const data = await response.json();
  console.log(`Live HTTP Response Status: ${status}`);
  console.log('Live HTTP Response Body:', JSON.stringify(data, null, 2));

  if (status !== 201) {
    throw new Error(`Failed to create subordinate on production: ${JSON.stringify(data)}`);
  }

  const createdUserId = data.user.id;
  console.log(`\n--- 3. Verifying persisted teacher profile on live TiDB ---`);
  const profileRes: any = await tidbConn.execute(
    'SELECT user_id, full_name, teaching_assignments, assigned_subjects FROM teacher_profiles WHERE user_id = ?',
    [createdUserId]
  );
  const profile = (profileRes.rows || profileRes)[0];
  console.log('Persisted teacher_profile row:', JSON.stringify(profile, null, 2));

  if (!profile) {
    throw new Error('Teacher profile not found in live database!');
  }

  // Parse and verify teaching_assignments
  const assignments = JSON.parse(profile.teaching_assignments);
  console.log('Parsed teaching_assignments:', assignments);
  if (!Array.isArray(assignments) || assignments.length === 0 || assignments[0].subjectName !== 'الرياضيات') {
    throw new Error('Unexpected teaching_assignments value in database');
  }

  console.log('\n--- 4. Cleaning up temporary test record only ---');
  await tidbConn.execute('DELETE FROM teacher_profiles WHERE user_id = ?', [createdUserId]);
  await tidbConn.execute('DELETE FROM users WHERE id = ?', [createdUserId]);
  console.log('✅ Temporary verification account cleanly removed. Zero data pollution.');

  console.log('\n🎉 Production integration test PASSED with 100% success!');
}

verifyProductionSubordinateCreation().catch(err => {
  console.error('FATAL Verification failure:', err);
  process.exit(1);
});
