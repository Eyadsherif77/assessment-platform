import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/db.js';
import { authenticateToken, requireRole, AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

// Restricted to Governorate Supervisor and higher management tiers
router.use(authenticateToken);
router.use(requireRole(['ADMIN', 'CENTRAL_ADMIN', 'GOVERNORATE_ADMIN', 'GOVERNORATE_SUPERVISOR']));

/**
 * 1. Meta information: Supervisor Profile, Assigned Governorate, and Available Grades (1 to 12)
 */
router.get('/meta', async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;

    // Fetch caller's governorate
    let governorateName = 'جميع المحافظات';
    let lockedGovId: string | null = null;

    if (user.governorateId) {
      lockedGovId = user.governorateId;
      const govRes = await db.query('SELECT name_ar FROM governorates WHERE id = $1', [lockedGovId]);
      if (govRes.rows.length > 0) {
        governorateName = govRes.rows[0].name_ar;
      }
    }

    // Fetch all stages and grades
    const stagesRes = await db.query('SELECT * FROM academic_stages ORDER BY sort_order ASC');
    const gradesRes = await db.query(`
      SELECT g.id, g.stage_id, g.code, g.name_ar, g.name_en, g.sort_order,
             s.name_ar as stage_name_ar, s.code as stage_code
      FROM grades g
      JOIN academic_stages s ON g.stage_id = s.id
      ORDER BY s.sort_order ASC, g.sort_order ASC
    `);

    // Fetch stats
    let totalCount = 0;
    if (user.role === 'GOVERNORATE_SUPERVISOR') {
      const cntRes = await db.query(
        `SELECT COUNT(*) as cnt FROM users WHERE role = 'STUDENT' AND (created_by = $1 OR governorate_id = $2)`,
        [user.id, user.governorateId || null]
      );
      totalCount = Number(cntRes.rows[0]?.cnt || 0);
    } else if (user.role === 'GOVERNORATE_ADMIN') {
      const cntRes = await db.query(
        `SELECT COUNT(*) as cnt FROM users WHERE role = 'STUDENT' AND governorate_id = $1`,
        [user.governorateId || null]
      );
      totalCount = Number(cntRes.rows[0]?.cnt || 0);
    } else {
      const cntRes = await db.query(`SELECT COUNT(*) as cnt FROM users WHERE role = 'STUDENT'`);
      totalCount = Number(cntRes.rows[0]?.cnt || 0);
    }

    return res.json({
      role: user.role,
      fullName: user.fullName,
      governorateId: lockedGovId,
      governorateName,
      stages: stagesRes.rows,
      grades: gradesRes.rows,
      totalStudentsCreated: totalCount
    });
  } catch (err: any) {
    console.error('Error in /api/governorate-supervisor/meta:', err);
    return res.status(500).json({ error: 'خطأ في جلب البيانات الوصفية للمشرف: ' + err.message });
  }
});

/**
 * 2. Get Students created by this supervisor or in his governorate
 * Supports filtering by grade_id and search term
 */
router.get('/students', async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const { grade_id, search } = req.query;

    const params: any[] = [];
    const conditions: string[] = ["u.role = 'STUDENT'"];

    if (user.role === 'GOVERNORATE_SUPERVISOR') {
      params.push(user.id);
      const userParamIdx = params.length;
      if (user.governorateId) {
        params.push(user.governorateId);
        const govParamIdx = params.length;
        conditions.push(`(u.created_by = $${userParamIdx} OR u.governorate_id = $${govParamIdx})`);
      } else {
        conditions.push(`u.created_by = $${userParamIdx}`);
      }
    } else if (user.role === 'GOVERNORATE_ADMIN') {
      if (user.governorateId) {
        params.push(user.governorateId);
        conditions.push(`u.governorate_id = $${params.length}`);
      }
    }

    // Filter by specific grade
    if (grade_id && grade_id !== 'ALL') {
      params.push(grade_id);
      conditions.push(`sp.grade_id = $${params.length}`);
    }

    // Filter by search query (name or username or code)
    if (search && typeof search === 'string' && search.trim()) {
      params.push(`%${search.trim().toLowerCase()}%`);
      const searchIdx = params.length;
      conditions.push(`(LOWER(u.full_name) LIKE $${searchIdx} OR LOWER(u.username) LIKE $${searchIdx} OR LOWER(u.super_id) LIKE $${searchIdx})`);
    }

    const sql = `
      SELECT 
        u.id, 
        u.super_id as student_code,
        u.email, 
        u.username, 
        u.full_name, 
        u.initial_password,
        u.created_at,
        sp.first_name,
        sp.middle_name,
        sp.last_name,
        sp.arabic_name,
        sp.gender,
        sp.birth_date,
        sp.religion,
        sp.nationality,
        sp.batch_code,
        sp.elective_subjects,
        sp.family_code,
        sp.school_name,
        sp.school_type,
        sp.academic_stage_id,
        sp.grade_id,
        g.name_ar as grade_name_ar,
        g.name_en as grade_name_en,
        g.code as grade_code,
        s.name_ar as stage_name_ar,
        s.name_en as stage_name_en,
        gov.name_ar as governorate_name
      FROM users u
      LEFT JOIN student_profiles sp ON u.id = sp.user_id
      LEFT JOIN grades g ON sp.grade_id = g.id
      LEFT JOIN academic_stages s ON sp.academic_stage_id = s.id
      LEFT JOIN governorates gov ON u.governorate_id = gov.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY u.created_at DESC
    `;

    const result = await db.query(sql, params);

    const students = result.rows.map(row => {
      const uname = row.username || (row.email ? row.email.split('@')[0] : '');
      const autoPass = uname ? `${uname}Aa@1` : (row.initial_password || 'Aa@1');
      const isEnglishStudent = /[a-zA-Z]/.test(row.full_name || '') && !(/[\u0600-\u06FF]/.test(row.full_name || ''));
      return {
        id: row.id,
        imported: row.student_code || `#s-${row.id.substring(0, 6)}`,
        studentCode: row.student_code || `#s-${row.id.substring(0, 6)}`,
        email: row.email,
        username: uname,
        fullName: row.full_name,
        initialPassword: autoPass,
        password: autoPass,
        firstName: row.first_name || '',
        middleName: row.middle_name || '',
        lastName: row.last_name || '',
        arabicName: row.arabic_name || row.full_name || '',
        gender: row.gender || '',
        birthDate: row.birth_date || '',
        religion: row.religion || '',
        nationality: row.nationality || '',
        batchCode: row.batch_code || (isEnglishStudent ? (row.grade_name_en || row.grade_name_ar) : (row.grade_name_ar || row.grade_name_en)) || '',
        electiveSubjects: row.elective_subjects || '',
        familyCode: row.family_code || '',
        gradeId: row.grade_id,
        gradeName: isEnglishStudent ? (row.grade_name_en || row.grade_name_ar || 'Unspecified') : (row.grade_name_ar || row.grade_name_en || 'غير محدد'),
        gradeNameAr: row.grade_name_ar || 'غير محدد',
        gradeNameEn: row.grade_name_en || 'Unspecified',
        gradeCode: row.grade_code,
        stageName: isEnglishStudent ? (row.stage_name_en || row.stage_name_ar || 'Unspecified') : (row.stage_name_ar || row.stage_name_en || 'غير محدد'),
        stageNameAr: row.stage_name_ar || 'غير محدد',
        stageNameEn: row.stage_name_en || 'Unspecified',
        schoolType: row.school_type || 'عربى',
        schoolName: row.school_name || 'المدرسة الرسمية',
        governorateName: row.governorate_name || 'غير محدد',
        createdAt: row.created_at
      };
    });

    return res.json({ students });
  } catch (err: any) {
    console.error('Error fetching supervisor students:', err);
    return res.status(500).json({ error: 'خطأ في جلب بيانات الطلاب: ' + err.message });
  }
});

/**
 * 3. Create a Single Student Account
 * Password is ALWAYS automatically generated as username + Aa@1
 */
router.post('/students', async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const {
      fullName,
      username,
      gradeId,
      stageId,
      schoolType,
      schoolName,
      arabicName,
      firstName,
      middleName,
      lastName,
      gender,
      birthDate,
      religion,
      nationality,
      batchCode,
      electiveSubjects,
      familyCode
    } = req.body;

    if (!fullName || !username || !gradeId) {
      return res.status(400).json({
        error: 'الحقول الإلزامية مطلوبة: اسم الطالب، اسم المستخدم، والصف الدراسي'
      });
    }

    const cleanUsername = username.trim();
    // Strict automatic password rule: username + Aa@1
    const cleanPassword = `${cleanUsername}Aa@1`;
    const cleanFullName = fullName.trim();
    const cleanSchoolType = schoolType || 'عربى';
    const cleanSchoolName = (schoolName || 'المدرسة الرسمية').trim();

    // Check username uniqueness
    const userCheck = await db.query(
      'SELECT id FROM users WHERE LOWER(username) = $1 OR LOWER(email) = $1',
      [cleanUsername.toLowerCase()]
    );
    if (userCheck.rows.length > 0) {
      return res.status(400).json({ error: 'اسم المستخدم أو البريد الإلكتروني مسجل بالفعل لمستخدم آخر' });
    }

    // Resolve Grade and Stage
    const gradeRes = await db.query(
      `SELECT g.id, g.stage_id, g.name_ar as grade_name, s.name_ar as stage_name 
       FROM grades g 
       JOIN academic_stages s ON g.stage_id = s.id 
       WHERE g.id = $1`,
      [gradeId]
    );

    if (gradeRes.rows.length === 0) {
      return res.status(400).json({ error: 'الصف الدراسي المحدد غير صحيح' });
    }

    const targetGrade = gradeRes.rows[0];
    const resolvedStageId = stageId || targetGrade.stage_id;

    // Sequential student code
    const studentCountRes = await db.query(`SELECT COUNT(*) as cnt FROM users WHERE role = 'STUDENT'`);
    const studentCount = parseInt(studentCountRes.rows[0]?.cnt || '0', 10);
    const autoStudentCode = `#s${String(studentCount + 1).padStart(6, '0')}`;

    const newUserId = uuidv4();
    const passwordHash = await bcrypt.hash(cleanPassword, 10);
    const userEmail = cleanUsername.includes('@') ? cleanUsername.toLowerCase() : `${cleanUsername.toLowerCase()}@school.edu.eg`;

    // Governorate
    const assignedGovId = user.governorateId || null;
    let govName = 'القاهرة';
    if (assignedGovId) {
      const gRes = await db.query('SELECT name_ar FROM governorates WHERE id = $1', [assignedGovId]);
      if (gRes.rows.length > 0) govName = gRes.rows[0].name_ar;
    }

    // 1. Insert into users table
    await db.query(
      `INSERT INTO users (
        id, super_id, email, username, password_hash, role, full_name, 
        governorate_id, created_by, initial_password, is_active
       ) VALUES ($1, $2, $3, $4, $5, 'STUDENT', $6, $7, $8, $9, 1)`,
      [
        newUserId,
        autoStudentCode,
        userEmail,
        cleanUsername,
        passwordHash,
        cleanFullName,
        assignedGovId,
        user.id,
        cleanPassword
      ]
    );

    // 2. Insert into student_profiles
    await db.query(
      `INSERT INTO student_profiles (
        user_id, full_name, governorate_id, governorate_name, school_name,
        academic_stage_id, grade_id, school_type, student_code, term,
        first_name, middle_name, last_name, arabic_name, gender, birth_date,
        religion, nationality, batch_code, elective_subjects, family_code
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)`,
      [
        newUserId,
        cleanFullName,
        assignedGovId,
        govName,
        cleanSchoolName,
        resolvedStageId,
        gradeId,
        cleanSchoolType,
        autoStudentCode,
        'الاول',
        firstName || null,
        middleName || null,
        lastName || null,
        arabicName || cleanFullName,
        gender || null,
        birthDate || null,
        religion || null,
        nationality || 'Egypt',
        batchCode || targetGrade.grade_name,
        electiveSubjects || null,
        familyCode || null
      ]
    );

    return res.status(201).json({
      message: 'تم إنشاء حساب الطالب بنجاح',
      student: {
        id: newUserId,
        imported: autoStudentCode,
        studentCode: autoStudentCode,
        email: userEmail,
        username: cleanUsername,
        fullName: cleanFullName,
        initialPassword: cleanPassword,
        password: cleanPassword,
        arabicName: arabicName || cleanFullName,
        firstName: firstName || '',
        middleName: middleName || '',
        lastName: lastName || '',
        gender: gender || '',
        birthDate: birthDate || '',
        religion: religion || '',
        nationality: nationality || 'Egypt',
        batchCode: batchCode || targetGrade.grade_name,
        electiveSubjects: electiveSubjects || '',
        familyCode: familyCode || '',
        gradeId,
        gradeName: targetGrade.grade_name,
        stageName: targetGrade.stage_name,
        schoolType: cleanSchoolType,
        schoolName: cleanSchoolName,
        governorateName: govName,
        createdAt: new Date().toISOString()
      }
    });
  } catch (err: any) {
    console.error('Error creating student:', err);
    return res.status(500).json({ error: 'خطأ في إنشاء حساب الطالب: ' + err.message });
  }
});

/**
 * 3.5 Bulk Import Students from Excel (Matching New_Student_Parent_Import_Template.xlsx)
 * Password is ALWAYS automatically generated as username + Aa@1
 */
router.post('/students/bulk', async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const { students: incomingList, defaultGradeId } = req.body;

    if (!Array.isArray(incomingList) || incomingList.length === 0) {
      return res.status(400).json({ error: 'لم يتم توفير أي بيانات طلاب للاستيراد' });
    }

    // Cache all grades with English names
    const gradesRes = await db.query(
      `SELECT g.id, g.code, g.name_ar, g.name_en, g.stage_id, s.name_ar as stage_name, s.name_en as stage_name_en
       FROM grades g
       JOIN academic_stages s ON g.stage_id = s.id`
    );
    const allGrades = gradesRes.rows;
    const fallbackGrade = (defaultGradeId ? allGrades.find(g => g.id === defaultGradeId) : null) || allGrades[0];

    // Helper: Smart grade resolution supporting Arabic & English
    const resolveGrade = (batchCode: string, rowGradeId: string | undefined) => {
      if (rowGradeId) {
        const found = allGrades.find(g => g.id === rowGradeId);
        if (found) return found;
      }
      if (!batchCode || !batchCode.trim()) return fallbackGrade;
      const raw = batchCode.trim().toLowerCase();

      // 1. Direct name / code match
      for (const g of allGrades) {
        if (g.code && raw === g.code.toLowerCase()) return g;
        if (g.name_ar && (raw.includes(g.name_ar.toLowerCase()) || g.name_ar.toLowerCase().includes(raw))) return g;
        if (g.name_en && (raw.includes(g.name_en.toLowerCase()) || g.name_en.toLowerCase().includes(raw))) return g;
      }

      // 2. Prep / Preparatory / إعدادي / Grade 7-9
      if (/(?:prep|preparatory|إعدادي|اعدادي|grade\s*7\b|year\s*7\b|g\s*7\b)/i.test(raw)) {
        if (/(?:3|three|تالتة|ثالث)/i.test(raw) || /grade\s*9/i.test(raw)) return allGrades.find(g => g.code === 'PREP_3') || fallbackGrade;
        if (/(?:2|two|تانية|ثانية|ثاني)/i.test(raw) || /grade\s*8/i.test(raw)) return allGrades.find(g => g.code === 'PREP_2') || fallbackGrade;
        return allGrades.find(g => g.code === 'PREP_1') || fallbackGrade;
      }
      if (/grade\s*9\b|year\s*9\b|g\s*9\b/i.test(raw)) return allGrades.find(g => g.code === 'PREP_3') || fallbackGrade;
      if (/grade\s*8\b|year\s*8\b|g\s*8\b/i.test(raw)) return allGrades.find(g => g.code === 'PREP_2') || fallbackGrade;
      if (/grade\s*7\b|year\s*7\b|g\s*7\b/i.test(raw)) return allGrades.find(g => g.code === 'PREP_1') || fallbackGrade;

      // 3. Secondary / ثانوي / Grade 10-12
      if (/(?:sec|secondary|ثانوي|ثانوية)/i.test(raw)) {
        if (/(?:3|three|تالتة|ثالث)/i.test(raw) || /grade\s*12/i.test(raw)) return allGrades.find(g => g.code === 'SEC_3') || fallbackGrade;
        if (/(?:2|two|تانية|ثانية|ثاني)/i.test(raw) || /grade\s*11/i.test(raw)) return allGrades.find(g => g.code === 'SEC_2') || fallbackGrade;
        return allGrades.find(g => g.code === 'SEC_1') || fallbackGrade;
      }
      if (/grade\s*12\b|year\s*12\b|g\s*12\b/i.test(raw)) return allGrades.find(g => g.code === 'SEC_3') || fallbackGrade;
      if (/grade\s*11\b|year\s*11\b|g\s*11\b/i.test(raw)) return allGrades.find(g => g.code === 'SEC_2') || fallbackGrade;
      if (/grade\s*10\b|year\s*10\b|g\s*10\b/i.test(raw)) return allGrades.find(g => g.code === 'SEC_1') || fallbackGrade;

      // 4. Primary / ابتدائي / Grade 1-6
      if (/(?:prim|primary|ابتدائي|ابتدائى)/i.test(raw)) {
        if (/(?:6|six|سادسة|سادس)/i.test(raw)) return allGrades.find(g => g.code === 'PRIM_6') || fallbackGrade;
        if (/(?:5|five|خامسة|خامس)/i.test(raw)) return allGrades.find(g => g.code === 'PRIM_5') || fallbackGrade;
        if (/(?:4|four|رابعة|رابع)/i.test(raw)) return allGrades.find(g => g.code === 'PRIM_4') || fallbackGrade;
        if (/(?:3|three|تالتة|ثالث)/i.test(raw)) return allGrades.find(g => g.code === 'PRIM_3') || fallbackGrade;
        if (/(?:2|two|تانية|ثانية|ثاني)/i.test(raw)) return allGrades.find(g => g.code === 'PRIM_2') || fallbackGrade;
        return allGrades.find(g => g.code === 'PRIM_1') || fallbackGrade;
      }
      for (let n = 1; n <= 6; n++) {
        if (new RegExp(`(?:grade|year|g|صف|الصف)\\s*${n}\\b`, 'i').test(raw)) {
          return allGrades.find(g => g.code === `PRIM_${n}`) || fallbackGrade;
        }
      }

      return fallbackGrade;
    };

    // Cache governorate
    const assignedGovId = user.governorateId || null;
    let govName = 'القاهرة';
    if (assignedGovId) {
      const gRes = await db.query('SELECT name_ar FROM governorates WHERE id = $1', [assignedGovId]);
      if (gRes.rows.length > 0) govName = gRes.rows[0].name_ar;
    }

    let createdCount = 0;
    let updatedCount = 0;
    const errors: string[] = [];

    for (let i = 0; i < incomingList.length; i++) {
      try {
        const row = incomingList[i];
        if (!row || typeof row !== 'object') continue;

        // 1. Extract username or student code across all known column naming schemes
        const rawUsername = 
          row['Username'] || row['username'] || row['اسم المستخدم'] ||
          row['كود الطالب'] || row['كود'] || row['الرقم القومي'] ||
          row['رقم الجلوس'] || row['Student Code'] || row['studentCode'] ||
          row['Student_Code'] || row['Code'] || row['code'] ||
          row['ID'] || row['id'] || row['الرقم التعريفي'] || '';

        const firstName = String(row['First name'] || row['firstName'] || row['الاسم الأول'] || '').trim();
        const middleName = String(row['student middle name'] || row['middleName'] || row['اسم الأب'] || '').trim();
        const lastName = String(row['Last name'] || row['lastName'] || row['اسم العائلة'] || row['اللقب'] || '').trim();
        const arabicName = String(row['Arabic Name'] || row['arabicName'] || row['الاسم بالعربي'] || '').trim();

        const combinedName = [firstName, middleName, lastName].filter(Boolean).join(' ');
        const rawFullName = row['Name'] || row['name'] || row['الاسم'] || row['اسم الطالب'] || combinedName || arabicName || '';
        const cleanFullName = String(rawFullName || 'طالب').trim();

        let cleanUsername = String(rawUsername).trim();
        if (!cleanUsername) {
          // Generate unique username from name or index
          const safeName = cleanFullName.replace(/[^a-zA-Z0-9\u0621-\u064A]/g, '').slice(0, 8);
          cleanUsername = `stu_${safeName || 'user'}_${Date.now().toString(36).slice(-4)}_${i + 1}_${Math.floor(100 + Math.random() * 900)}`;
        }

        const gender = String(row['Gender'] || row['gender'] || row['النوع'] || (/[a-zA-Z]/.test(cleanFullName) ? 'Male' : 'ذكر')).trim();
        const birthDate = String(row['Birth Date'] || row['birthDate'] || row['تاريخ الميلاد'] || '').trim();
        const religion = String(row['Religion'] || row['religion'] || row['الديانة'] || (/[a-zA-Z]/.test(cleanFullName) ? 'Muslim' : 'مسلم')).trim();
        const nationality = String(row['Nationality'] || row['nationality'] || row['الجنسية'] || (/[a-zA-Z]/.test(cleanFullName) ? 'Egypt' : 'مصر')).trim();
        const batchCode = String(row['Batch Code'] || row['batchCode'] || row['كود الدفعة'] || row['Grade'] || row['grade'] || '').trim();
        const electiveSubjects = String(row['elective subjects string'] || row['electiveSubjects'] || '').trim();
        const familyCode = String(row['Family Code'] || row['familyCode'] || '').trim();
        const importedCode = String(row['imported'] || row['studentCode'] || row['كود الطالب'] || row['الرقم القومي'] || '').trim();

        const rawSchoolType = String(row['School Type'] || row['schoolType'] || row['نوع المدرسة'] || '').trim().toLowerCase();
        let cleanSchoolType = 'عربي';
        if (rawSchoolType.includes('لغات') || rawSchoolType.includes('lang') || rawSchoolType.includes('english')) {
          cleanSchoolType = 'لغات';
        } else if (rawSchoolType.includes('عرب') || rawSchoolType.includes('arabic')) {
          cleanSchoolType = 'عربي';
        } else if (/[a-zA-Z]/.test(cleanFullName) && !(/[\u0600-\u06FF]/.test(cleanFullName))) {
          cleanSchoolType = 'لغات';
        }

        const rawSchoolName = String(row['School Name'] || row['schoolName'] || row['المدرسة'] || '').trim();
        const cleanSchoolName = rawSchoolName || (cleanSchoolType === 'لغات' ? 'Official Language School' : 'المدرسة الرسمية');

        const emailRaw = row['Email'] || row['email'] || row['البريد'] || row['البريد الإلكتروني'];
        let userEmail = emailRaw ? String(emailRaw).trim().toLowerCase() : `${cleanUsername.toLowerCase()}@school.edu.eg`;

        // Resolve grade by batchCode, row.gradeId, or fallback
        const matchedGrade = resolveGrade(batchCode, row.gradeId);
        const targetGradeId = matchedGrade.id;
        const targetStageId = matchedGrade.stage_id;

        // STRICT IDENTIFICATION: Only update if matching student code or explicit imported username!
        // Never match on common email so accounts are never overwritten across grades or students!
        let existingUser: any = null;
        if (importedCode) {
          const exByCode = await db.query(
            'SELECT id, username, email FROM users WHERE super_id = $1 LIMIT 1',
            [importedCode]
          );
          if (exByCode.rows.length > 0) existingUser = exByCode.rows[0];
        }
        if (!existingUser && rawUsername && String(rawUsername).trim()) {
          const exByUname = await db.query(
            'SELECT id, username, email FROM users WHERE LOWER(username) = $1 LIMIT 1',
            [String(rawUsername).trim().toLowerCase()]
          );
          if (exByUname.rows.length > 0) existingUser = exByUname.rows[0];
        }

        if (existingUser) {
          const existingId = existingUser.id;
          const cleanPassword = `${existingUser.username}Aa@1`;
          const passwordHash = await bcrypt.hash(cleanPassword, 10);
          await db.query(
            `UPDATE users SET full_name = $1, password_hash = $2, initial_password = $3 WHERE id = $4`,
            [cleanFullName, passwordHash, cleanPassword, existingId]
          );
          await db.query(
            `UPDATE student_profiles SET 
               full_name = $1, arabic_name = $2, first_name = $3, middle_name = $4, last_name = $5,
               gender = $6, birth_date = $7, religion = $8, nationality = $9, batch_code = $10,
               elective_subjects = $11, family_code = $12, grade_id = $13, academic_stage_id = $14,
               school_type = $15, school_name = $16
             WHERE user_id = $17`,
            [
              cleanFullName, arabicName || cleanFullName, firstName, middleName, lastName,
              gender, birthDate, religion, nationality, batchCode,
              electiveSubjects, familyCode, targetGradeId, targetStageId,
              cleanSchoolType, cleanSchoolName,
              existingId
            ]
          );
          updatedCount++;
        } else {
          // Guarantee unique username
          let finalUsername = cleanUsername.toLowerCase();
          const unameCollision = await db.query('SELECT id FROM users WHERE LOWER(username) = $1', [finalUsername]);
          if (unameCollision.rows.length > 0) {
            finalUsername = `${finalUsername}_${Date.now().toString(36).slice(-3)}_${i + 1}`;
          }

          // Guarantee unique email without overriding
          let finalEmail = userEmail.toLowerCase();
          const emailCollision = await db.query('SELECT id FROM users WHERE LOWER(email) = $1', [finalEmail]);
          if (emailCollision.rows.length > 0) {
            finalEmail = `${finalUsername}@school.edu.eg`;
          }

          const finalPassword = `${finalUsername}Aa@1`;
          const passwordHash = await bcrypt.hash(finalPassword, 10);
          const newUserId = uuidv4();
          const finalStudentCode = importedCode || `STU-${Date.now().toString(36).toUpperCase().slice(-4)}-${String(i + 1).padStart(4, '0')}`;

          await db.query(
            `INSERT INTO users (
              id, super_id, email, username, password_hash, role, full_name,
              governorate_id, created_by, initial_password, is_active
             ) VALUES ($1, $2, $3, $4, $5, 'STUDENT', $6, $7, $8, $9, 1)`,
            [
              newUserId,
              finalStudentCode,
              finalEmail,
              finalUsername,
              passwordHash,
              cleanFullName,
              assignedGovId,
              user.id,
              finalPassword
            ]
          );

          await db.query(
            `INSERT INTO student_profiles (
              user_id, full_name, governorate_id, governorate_name, school_name,
              academic_stage_id, grade_id, school_type, student_code, term,
              first_name, middle_name, last_name, arabic_name, gender, birth_date,
              religion, nationality, batch_code, elective_subjects, family_code
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)`,
            [
              newUserId,
              cleanFullName,
              assignedGovId,
              govName,
              cleanSchoolName,
              targetStageId,
              targetGradeId,
              cleanSchoolType,
              finalStudentCode,
              'الاول',
              firstName,
              middleName,
              lastName,
              arabicName || cleanFullName,
              gender,
              birthDate,
              religion,
              nationality,
              batchCode,
              electiveSubjects,
              familyCode
            ]
          );
          createdCount++;
        }
      } catch (rowErr: any) {
        console.warn(`Row ${i} import notice:`, rowErr.message);
        errors.push(`صف ${i + 1}: ${rowErr.message}`);
      }
    }

    return res.status(200).json({
      message: `تم استيراد ومعالجة ${createdCount + updatedCount} طالب بنجاح (${createdCount} حساب جديد، ${updatedCount} تم تحديثه)`,
      createdCount,
      updatedCount,
      totalProcessed: createdCount + updatedCount,
      errors: errors.slice(0, 5)
    });
  } catch (err: any) {
    console.error('Error importing bulk students:', err);
    return res.status(500).json({ error: 'خطأ في استيراد شيت الإكسيل: ' + err.message });
  }
});

/**
 * 4. Delete Student Account
 */
router.delete('/students/:id', async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const { id } = req.params;

    const studentCheck = await db.query(
      `SELECT id, created_by, governorate_id FROM users WHERE id = $1 AND role = 'STUDENT'`,
      [id]
    );

    if (studentCheck.rows.length === 0) {
      return res.status(404).json({ error: 'حساب الطالب غير موجود' });
    }

    const st = studentCheck.rows[0];

    // Authorization check
    if (
      user.role === 'GOVERNORATE_SUPERVISOR' &&
      st.created_by !== user.id &&
      st.governorate_id !== user.governorateId
    ) {
      return res.status(403).json({ error: 'غير مصرح لك بحذف هذا الطالب' });
    }

    if (user.role === 'GOVERNORATE_ADMIN' && st.governorate_id !== user.governorateId) {
      return res.status(403).json({ error: 'غير مصرح لك بحذف طالب من خارج محافظتك' });
    }

    // Cascade delete student
    await db.query('DELETE FROM student_profiles WHERE user_id = $1', [id]);
    await db.query('DELETE FROM users WHERE id = $1', [id]);

    return res.json({ message: 'تم حذف حساب الطالب بنجاح' });
  } catch (err: any) {
    console.error('Error deleting student:', err);
    return res.status(500).json({ error: 'خطأ في حذف الطالب: ' + err.message });
  }
});

export default router;
