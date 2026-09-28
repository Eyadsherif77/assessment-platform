import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiUrl } from '../utils/api';
import * as XLSX from 'xlsx';
import { 
  UserPlus, 
  FileSpreadsheet, 
  Search, 
  Key, 
  GraduationCap, 
  School, 
  Copy, 
  Check, 
  Trash2, 
  Eye, 
  EyeOff, 
  RefreshCw, 
  Sparkles,
  Filter,
  Upload
} from 'lucide-react';

interface StudentItem {
  id: string;
  imported?: string;
  studentCode: string;
  email: string;
  username: string;
  fullName: string;
  initialPassword?: string;
  password?: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  arabicName?: string;
  gender?: string;
  birthDate?: string;
  religion?: string;
  nationality?: string;
  batchCode?: string;
  electiveSubjects?: string;
  familyCode?: string;
  gradeId: string;
  gradeName: string;
  gradeCode?: string;
  stageName: string;
  schoolType: string;
  schoolName: string;
  governorateName: string;
  createdAt: string;
}

interface GradeInfo {
  id: string;
  stage_id: string;
  code: string;
  name_ar: string;
  name_en: string;
  sort_order: number;
  stage_name_ar: string;
  stage_code: string;
}

export const GovernorateSupervisorDashboard: React.FC = () => {
  const { token, language } = useAuth();
  const isAr = language === 'ar';

  const [students, setStudents] = useState<StudentItem[]>([]);
  const [grades, setGrades] = useState<GradeInfo[]>([]);
  const [governorateName, setGovernorateName] = useState<string>('القاهرة');
  const [totalStudentsCreated, setTotalStudentsCreated] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedGradeFilter, setSelectedGradeFilter] = useState<string>('ALL');

  // Excel File Input Ref & State
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState<boolean>(false);

  // Form State for creating student
  const [fullName, setFullName] = useState<string>('');
  const [username, setUsername] = useState<string>('');
  const [selectedGradeId, setSelectedGradeId] = useState<string>('');
  const [schoolType, setSchoolType] = useState<'عربى' | 'لغات'>('عربى');
  const [schoolName, setSchoolName] = useState<string>('المدرسة الرسمية');
  const [formLoading, setFormLoading] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  // UI helpers
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    fetchMeta();
  }, [token]);

  useEffect(() => {
    fetchStudents();
  }, [token, selectedGradeFilter, searchQuery]);

  const fetchMeta = async () => {
    if (!token) return;
    try {
      const res = await fetch(apiUrl('/api/governorate-supervisor/meta'), {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setGovernorateName(data.governorateName || 'المحافظة');
        setTotalStudentsCreated(data.totalStudentsCreated || 0);
        if (data.grades && data.grades.length > 0) {
          setGrades(data.grades);
          if (!selectedGradeId) {
            setSelectedGradeId(data.grades[0].id);
          }
        }
      }
    } catch (e) {
      console.error('Error fetching supervisor meta:', e);
    }
  };

  const fetchStudents = async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedGradeFilter !== 'ALL') params.append('grade_id', selectedGradeFilter);
      if (searchQuery.trim()) params.append('search', searchQuery.trim());

      const res = await fetch(apiUrl(`/api/governorate-supervisor/students?${params.toString()}`), {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setStudents(data.students || []);
        if (selectedGradeFilter === 'ALL' && !searchQuery.trim()) {
          setTotalStudentsCreated(data.students?.length || 0);
        }
      }
    } catch (e) {
      console.error('Error fetching students:', e);
    } finally {
      setIsLoading(false);
    }
  };

  // Auto-generate unique username based on full name or timestamp
  const generateUsernameFromFullName = (name: string) => {
    if (!name.trim()) {
      const rnd = Math.floor(1000 + Math.random() * 9000);
      setUsername(`stu_${rnd}`);
      return;
    }
    const clean = name
      .trim()
      .replace(/\s+/g, '_')
      .replace(/[^a-zA-Z0-9_\u0621-\u064A]/g, '')
      .slice(0, 15);
    const rnd = Math.floor(100 + Math.random() * 900);
    setUsername(`stu_${clean}_${rnd}`);
  };

  // Handle Create Student
  const handleCreateStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    const cleanUname = username.trim();
    if (!fullName.trim() || !cleanUname || !selectedGradeId) {
      setFormError(isAr ? 'يرجى إدخال اسم الطالب واسم المستخدم واختيار الصف الدراسي' : 'Please fill all required fields');
      return;
    }

    // Password is ALWAYS strictly username + Aa@1
    const autoPassword = `${cleanUname}Aa@1`;

    setFormLoading(true);
    try {
      const res = await fetch(apiUrl('/api/governorate-supervisor/students'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          fullName: fullName.trim(),
          username: cleanUname,
          password: autoPassword,
          gradeId: selectedGradeId,
          schoolType,
          schoolName: schoolName.trim() || 'المدرسة الرسمية'
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'فشل إنشاء حساب الطالب');
      }

      setFormSuccess(isAr ? `✅ تم إنشاء حساب الطالب بنجاح! اسم الدخول: ${cleanUname} • كلمة المرور: ${autoPassword}` : `Student account created successfully! Password: ${autoPassword}`);
      setFullName('');
      setUsername('');
      fetchStudents();
      fetchMeta();
    } catch (err: any) {
      setFormError(err.message || 'حدث خطأ أثناء إنشاء الحساب');
    } finally {
      setFormLoading(false);
    }
  };

  // Delete Student
  const handleDeleteStudent = async (studentId: string, studentName: string) => {
    const confirmMsg = isAr 
      ? `هل أنت متأكد من رغبتك في حذف حساب الطالب (${studentName})؟ لن يتمكن من تسجيل الدخول بعد الآن.`
      : `Are you sure you want to delete student (${studentName})?`;
    if (!window.confirm(confirmMsg)) return;

    try {
      const res = await fetch(apiUrl(`/api/governorate-supervisor/students/${studentId}`), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        fetchStudents();
        fetchMeta();
      } else {
        const data = await res.json();
        alert(data.error || 'فشل حذف الطالب');
      }
    } catch (e: any) {
      alert(e.message || 'خطأ في الاتصال بالخادم');
    }
  };

  // Copy to clipboard
  const handleCopyCredentials = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Toggle password visibility
  const togglePasswordVisibility = (studentId: string) => {
    setVisiblePasswords(prev => ({ ...prev, [studentId]: !prev[studentId] }));
  };

  // EXCEL EXPORT (Exactly matching New_Student_Parent_Import_Template.xlsx on Desktop)
  const handleExportToExcel = () => {
    if (students.length === 0) {
      alert(isAr ? 'لا يوجد طلاب لتصديرهم حالياً' : 'No students to export');
      return;
    }

    try {
      const wb = XLSX.utils.book_new();

      // Sheet 1: Students (Exact columns in exact arrangement as desktop template)
      const studentsRows = students.map((s, idx) => ({
        'imported': s.imported || s.studentCode || (idx + 1).toString(),
        'Username': s.username || '',
        'Name': s.fullName || '',
        'First name': s.firstName || s.fullName.split(' ')[0] || '',
        'student middle name': s.middleName || s.fullName.split(' ').slice(1, -1).join(' ') || '',
        'Last name': s.lastName || s.fullName.split(' ').slice(-1)[0] || '',
        'Gender': s.gender || 'Male',
        'Arabic Name': s.arabicName || s.fullName || '',
        'Birth Date': s.birthDate || '',
        'Religion': s.religion || 'Muslims',
        'Nationality': s.nationality || 'Egypt',
        'Email': s.email || `${s.username}@school.edu.eg`,
        'Batch Code': s.batchCode || s.gradeName || '',
        'elective subjects string': s.electiveSubjects || '',
        'Family Code': s.familyCode || `F${String(idx + 1).padStart(4, '0')}`
      }));

      const wsStudents = XLSX.utils.json_to_sheet(studentsRows);
      XLSX.utils.book_append_sheet(wb, wsStudents, 'Students');

      // Sheet 2: Parents (Exact columns as desktop template)
      const parentsRows = students.map((s, idx) => ({
        'Family Code': s.familyCode || `F${String(idx + 1).padStart(4, '0')}`,
        'Name': `ولي أمر ${s.fullName}`,
        'Username': `P${String(idx + 1).padStart(5, '0')}`,
        'Email': `parent_${s.username}@school.edu.eg`,
        'Relation with Student': 'Father',
        'Is Emergency Contact': 'Yes',
        'mobile': ''
      }));

      const wsParents = XLSX.utils.json_to_sheet(parentsRows);
      XLSX.utils.book_append_sheet(wb, wsParents, 'Parents');

      XLSX.writeFile(wb, 'New_Student_Parent_Import_Template.xlsx');
    } catch (err: any) {
      console.error('Export error:', err);
      alert(isAr ? 'حدث خطأ أثناء تصدير ملف الإكسيل' : 'Failed to export excel file');
    }
  };

  // EXCEL IMPORT (Matching New_Student_Parent_Import_Template.xlsx)
  const handleImportExcelFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });

      // Find Students sheet or first sheet
      const sheetName = workbook.SheetNames.find(n => n.toLowerCase().includes('student')) || workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<any>(worksheet, { defval: '' });

      if (rows.length === 0) {
        throw new Error(isAr ? 'ملف الإكسيل فارغ أو لا يحتوي على صفوف بيانات' : 'Excel file is empty');
      }

      // Convert date serials if any
      const cleanedRows = rows.map(r => {
        const rawDate = r['Birth Date'] || r['birthDate'];
        let formattedDate = rawDate;
        if (typeof rawDate === 'number' || (!isNaN(Number(rawDate)) && !String(rawDate).includes('-') && !String(rawDate).includes('/'))) {
          const num = Number(rawDate);
          if (num > 1000 && num < 60000) {
            const date = new Date((num - (25567 + 2)) * 86400 * 1000);
            if (!isNaN(date.getTime())) {
              formattedDate = date.toISOString().split('T')[0];
            }
          }
        }
        return {
          ...r,
          'Birth Date': formattedDate
        };
      });

      const res = await fetch(apiUrl('/api/governorate-supervisor/students/bulk'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          students: cleanedRows,
          defaultGradeId: selectedGradeId || undefined
        })
      });

      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || 'فشل استيراد الطلاب');
      }

      alert(result.message || (isAr ? 'تم استيراد كشوف الطلاب بنجاح!' : 'Students imported successfully!'));
      fetchStudents();
      fetchMeta();
    } catch (err: any) {
      console.error('Import error:', err);
      alert(err.message || (isAr ? 'حدث خطأ أثناء معالجة ملف الإكسيل' : 'Failed to import excel file'));
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div style={{
      maxWidth: '1360px',
      margin: '0 auto',
      padding: '1.25rem 1rem 4rem',
      direction: isAr ? 'rtl' : 'ltr'
    }}>
      {/* 1. Header Banner with Farabi Branding & Upper Export to Excel Button */}
      <div style={{
        background: 'linear-gradient(135deg, #1E3A8A 0%, #1E40AF 50%, #3B82F6 100%)',
        borderRadius: '1.5rem',
        padding: '1.75rem 1.5rem',
        color: '#FFFFFF',
        marginBottom: '1.75rem',
        boxShadow: '0 12px 36px rgba(30, 64, 175, 0.25)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '1.25rem',
        position: 'relative',
        overflow: 'hidden'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', zIndex: 2 }}>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            background: '#FFFFFF',
            padding: '4px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            <img src="/logo.png" alt="Platform Logo" style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: '50%' }} />
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '0.35rem' }}>
              <span style={{
                background: 'rgba(255,255,255,0.2)',
                color: '#FFFFFF',
                padding: '0.2rem 0.75rem',
                borderRadius: 'var(--radius-full)',
                fontSize: '0.75rem',
                fontWeight: 800,
                backdropFilter: 'blur(4px)',
                letterSpacing: '0.05em'
              }}>
                📋 {isAr ? 'مشرف المحافظة' : 'Governorate Supervisor'}
              </span>
              <span style={{
                background: '#F59E0B',
                color: '#78350F',
                padding: '0.2rem 0.75rem',
                borderRadius: 'var(--radius-full)',
                fontSize: '0.75rem',
                fontWeight: 800
              }}>
                📍 {governorateName}
              </span>
              <span style={{
                background: 'rgba(255,255,255,0.15)',
                color: '#FFFFFF',
                padding: '0.2rem 0.75rem',
                borderRadius: 'var(--radius-full)',
                fontSize: '0.75rem',
                fontWeight: 800
              }}>
                👥 {totalStudentsCreated} {isAr ? 'طالب مسجل' : 'Registered Students'}
              </span>
            </div>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 900, margin: 0, color: '#FFFFFF', lineHeight: 1.3 }}>
              {isAr ? 'منظومة إنشاء وتصدير حسابات الطلاب - منصة التقييم من أجل التعلم' : 'Student Accounts Management - Assessment Platform'}
            </h1>
            <p style={{ margin: '0.35rem 0 0', color: '#BFDBFE', fontSize: '0.85rem' }}>
              {isAr
                ? 'إنشاء بيانات دخول الطلاب لجميع المراحل (الابتدائي - الإعدادي - الثانوي) وتصديرها مباشرة إلى Excel.'
                : 'Generate student login credentials for all stages and export to Excel spreadsheet.'}
            </p>
          </div>
        </div>

        {/* Upper Export & Import Buttons */}
        <div style={{ zIndex: 2, display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          {/* Import Button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="btn"
            disabled={isImporting}
            style={{
              background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
              color: '#FFFFFF',
              border: 'none',
              padding: '0.85rem 1.5rem',
              borderRadius: 'var(--radius-xl)',
              fontSize: '0.95rem',
              fontWeight: 900,
              cursor: isImporting ? 'not-allowed' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.6rem',
              boxShadow: '0 8px 20px rgba(37, 99, 235, 0.35)',
              transition: 'all 0.2s ease'
            }}
          >
            <Upload size={19} />
            <span>
              {isImporting
                ? (isAr ? 'جاري الاستيراد...' : 'Importing...')
                : (isAr ? '📤 استيراد كشوف الطلاب (Excel)' : '📤 Import Students (Excel)')}
            </span>
          </button>
          <input
            type="file"
            ref={fileInputRef}
            accept=".xlsx, .xls, .csv"
            style={{ display: 'none' }}
            onChange={handleImportExcelFile}
          />

          {/* Export Button */}
          <button
            type="button"
            onClick={handleExportToExcel}
            className="btn"
            style={{
              background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
              color: '#FFFFFF',
              border: 'none',
              padding: '0.85rem 1.5rem',
              borderRadius: 'var(--radius-xl)',
              fontSize: '0.95rem',
              fontWeight: 900,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.6rem',
              boxShadow: '0 8px 20px rgba(16, 185, 129, 0.35)',
              transition: 'all 0.2s ease'
            }}
          >
            <FileSpreadsheet size={19} />
            <span>{isAr ? '📥 تصدير كشوف الطلاب (Excel)' : '📥 Export Students (Excel)'}</span>
          </button>
        </div>
      </div>

      {/* 2. Grade Filter Bar (Requirement 5) */}
      <div style={{
        background: '#FFFFFF',
        borderRadius: '1.25rem',
        padding: '1rem 1.25rem',
        marginBottom: '1.5rem',
        border: '1.5px solid var(--border-light)',
        boxShadow: 'var(--shadow-sm)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 800, color: 'var(--text-title)', fontSize: '0.95rem' }}>
            <Filter size={18} style={{ color: 'var(--primary-600)' }} />
            <span>{isAr ? 'تصفية الصلاحيات والبيانات حسب الصف الدراسي:' : 'Filter permissions & data by school grade:'}</span>
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 700 }}>
            {isAr ? `إجمالي الطلاب: ${students.length} طالب` : `Total Listed: ${students.length}`}
          </div>
        </div>

        {/* Grade Chips Scrollable */}
        <div style={{
          display: 'flex',
          gap: '0.5rem',
          overflowX: 'auto',
          paddingBottom: '0.4rem',
          scrollbarWidth: 'thin'
        }}>
          <button
            onClick={() => setSelectedGradeFilter('ALL')}
            style={{
              padding: '0.5rem 1.1rem',
              borderRadius: 'var(--radius-full)',
              border: selectedGradeFilter === 'ALL' ? '2px solid var(--primary-600)' : '1px solid var(--border-light)',
              background: selectedGradeFilter === 'ALL' ? 'var(--primary-50)' : '#FFFFFF',
              color: selectedGradeFilter === 'ALL' ? 'var(--primary-800)' : 'var(--text-body)',
              fontWeight: 800,
              fontSize: '0.825rem',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'all 0.15s ease'
            }}
          >
            🌟 {isAr ? 'جميع الصفوف (12 صف)' : 'All Grades (12)'}
          </button>

          {grades.map(g => (
            <button
              key={g.id}
              onClick={() => {
                setSelectedGradeFilter(g.id);
                setSelectedGradeId(g.id);
              }}
              style={{
                padding: '0.5rem 1.1rem',
                borderRadius: 'var(--radius-full)',
                border: selectedGradeFilter === g.id ? '2px solid var(--primary-600)' : '1px solid var(--border-light)',
                background: selectedGradeFilter === g.id ? 'var(--primary-50)' : '#FFFFFF',
                color: selectedGradeFilter === g.id ? 'var(--primary-800)' : 'var(--text-body)',
                fontWeight: 800,
                fontSize: '0.825rem',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease'
              }}
            >
              {g.code.startsWith('PRIM') ? '📚 ' : g.code.startsWith('PREP') ? '📘 ' : '🎓 '}
              {g.name_ar}
            </button>
          ))}
        </div>
      </div>

      {/* 3. Main Grid: Creation Box (Left) & Students List (Right) */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(320px, 420px) 1fr',
        gap: '1.5rem',
        alignItems: 'start'
      }}>
        {/* Left Column: Create Student Form */}
        <div style={{
          background: '#FFFFFF',
          borderRadius: '1.25rem',
          padding: '1.5rem',
          border: '1.5px solid var(--border-light)',
          boxShadow: 'var(--shadow-sm)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.35rem' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--primary-50)',
              color: 'var(--primary-600)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <UserPlus size={20} />
            </div>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 900, margin: 0, color: 'var(--text-title)' }}>
              {isAr ? 'إنشاء حساب طالب جديد' : 'New Student Account'}
            </h2>
          </div>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1.25rem', lineHeight: 1.5 }}>
            {isAr
              ? 'أدخل بيانات الطالب مع تحديد الصف الدراسي وسيتم توليد كود الطالب وإضافته فوراً لكشوف التصدير.'
              : 'Enter student credentials and select stage to create account.'}
          </p>

          {formError && (
            <div style={{
              background: '#FEF2F2',
              border: '1px solid #FCA5A5',
              color: '#DC2626',
              padding: '0.75rem',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.825rem',
              fontWeight: 700,
              marginBottom: '1rem'
            }}>
              {formError}
            </div>
          )}

          {formSuccess && (
            <div style={{
              background: '#F0FDF4',
              border: '1px solid #86EFAC',
              color: '#15803D',
              padding: '0.75rem',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.825rem',
              fontWeight: 700,
              marginBottom: '1rem'
            }}>
              {formSuccess}
            </div>
          )}

          <form onSubmit={handleCreateStudent} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* 1. Student Full Name */}
            <div className="form-group">
              <label className="form-label" style={{ fontWeight: 800 }}>
                {isAr ? 'اسم الطالب رباعي' : 'Student Full Name'} *
              </label>
              <input
                type="text"
                required
                className="form-input"
                value={fullName}
                onChange={e => {
                  setFullName(e.target.value);
                  if (!username) generateUsernameFromFullName(e.target.value);
                }}
                placeholder={isAr ? 'مثال: أحمد محمد علي حسن' : 'Enter full student name'}
              />
            </div>

            {/* 2. Username with Auto-Generate Helper */}
            <div className="form-group">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                <label className="form-label" style={{ fontWeight: 800, margin: 0 }}>
                  {isAr ? 'اسم المستخدم (Username)' : 'Username'} *
                </label>
                <button
                  type="button"
                  onClick={() => generateUsernameFromFullName(fullName)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--primary-600)',
                    fontSize: '0.75rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem'
                  }}
                >
                  <Sparkles size={12} />
                  <span>{isAr ? 'توليد تلقائي' : 'Auto Generate'}</span>
                </button>
              </div>
              <input
                type="text"
                required
                className="form-input"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder={isAr ? 'اسم المستخدم للدخول' : 'Unique student username'}
              />
            </div>

            {/* 3. Password Auto-Generated strictly as username + Aa@1 */}
            <div className="form-group">
              <label className="form-label" style={{ fontWeight: 800, margin: '0 0 0.35rem 0', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <Key size={14} />
                <span>{isAr ? 'كلمة المرور (تُولد تلقائياً: اسم_المستخدمAa@1)' : 'Password (Auto: usernameAa@1)'}</span>
              </label>
              <input
                type="text"
                readOnly
                disabled
                className="form-input"
                style={{ backgroundColor: 'var(--bg-card-hover)', cursor: 'not-allowed', color: 'var(--primary-700)', fontWeight: 800 }}
                value={username ? `${username}Aa@1` : (isAr ? 'اسم_المستخدمAa@1' : 'usernameAa@1')}
              />
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                {isAr ? '🔒 تُنشأ كلمة السر آلياً فوراً كـ: اسم المستخدم متبوعاً بـ Aa@1 (لا يمكن إدخال كلمة سر يدوية)' : '🔒 Password is auto-generated as username + Aa@1'}
              </span>
            </div>

            {/* 4. Grade Selection (Primary 1 to Secondary 3) */}
            <div className="form-group">
              <label className="form-label" style={{ fontWeight: 800 }}>
                <GraduationCap size={15} style={{ display: 'inline', marginInlineEnd: '4px' }} />
                {isAr ? 'الصف الدراسي والمرحلة' : 'Grade & Stage'} *
              </label>
              <select
                className="form-select"
                required
                value={selectedGradeId}
                onChange={e => setSelectedGradeId(e.target.value)}
                style={{ fontWeight: 700 }}
              >
                {/* Primary */}
                <optgroup label={isAr ? 'المرحلة الابتدائية (Primary 1-6)' : 'Primary Education'}>
                  {grades.filter(g => g.code.startsWith('PRIM')).map(g => (
                    <option key={g.id} value={g.id}>
                      📚 {g.name_ar}
                    </option>
                  ))}
                </optgroup>
                {/* Preparatory */}
                <optgroup label={isAr ? 'المرحلة الإعدادية (Prep 1-3)' : 'Preparatory Education'}>
                  {grades.filter(g => g.code.startsWith('PREP')).map(g => (
                    <option key={g.id} value={g.id}>
                      📘 {g.name_ar}
                    </option>
                  ))}
                </optgroup>
                {/* Secondary */}
                <optgroup label={isAr ? 'المرحلة الثانوية (Secondary 1-3)' : 'Secondary Education'}>
                  {grades.filter(g => g.code.startsWith('SEC')).map(g => (
                    <option key={g.id} value={g.id}>
                      🎓 {g.name_ar}
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>

            {/* 5. Education Type */}
            <div className="form-group">
              <label className="form-label" style={{ fontWeight: 800 }}>
                {isAr ? 'نوع التعليم' : 'Education Type'}
              </label>
              <select
                className="form-select"
                value={schoolType}
                onChange={e => setSchoolType(e.target.value as any)}
              >
                <option value="عربى">{isAr ? 'عربى' : 'Arabic'}</option>
                <option value="لغات">{isAr ? 'لغات' : 'Languages'}</option>
              </select>
            </div>

            {/* 6. School Name */}
            <div className="form-group">
              <label className="form-label" style={{ fontWeight: 800 }}>
                <School size={15} style={{ display: 'inline', marginInlineEnd: '4px' }} />
                {isAr ? 'اسم المدرسة' : 'School Name'}
              </label>
              <input
                type="text"
                className="form-input"
                value={schoolName}
                onChange={e => setSchoolName(e.target.value)}
                placeholder="المدرسة الرسمية"
              />
            </div>

            <button
              type="submit"
              disabled={formLoading}
              className="btn btn-primary btn-lg"
              style={{
                marginTop: '0.5rem',
                fontWeight: 900,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem'
              }}
            >
              {formLoading ? (
                <>
                  <RefreshCw size={18} className="animate-spin" />
                  <span>{isAr ? 'جاري إنشاء الحساب...' : 'Creating Account...'}</span>
                </>
              ) : (
                <>
                  <UserPlus size={18} />
                  <span>{isAr ? 'إنشاء حساب الطالب الآن 🚀' : 'Create Student Account'}</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* Right Column: Students Table & Search */}
        <div style={{
          background: '#FFFFFF',
          borderRadius: '1.25rem',
          padding: '1.5rem',
          border: '1.5px solid var(--border-light)',
          boxShadow: 'var(--shadow-sm)'
        }}>
          {/* Table Header Controls */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1rem',
            marginBottom: '1.25rem'
          }}>
            <div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 900, margin: 0, color: 'var(--text-title)' }}>
                {isAr ? 'سجل حسابات الطلاب المسجلين' : 'Registered Students Directory'}
              </h3>
              <p style={{ margin: '0.2rem 0 0', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                {isAr
                  ? 'عرض وتعديل ونسخ بيانات الدخول للطالب أو تصديرها إلى إكسيل'
                  : 'View, copy credentials, or export student accounts to Excel'}
              </p>
            </div>

            {/* Search Input */}
            <div style={{ position: 'relative', minWidth: '240px' }}>
              <input
                type="text"
                className="form-input"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder={isAr ? 'بحث بالاسم أو اسم المستخدم...' : 'Search students...'}
                style={{ [isAr ? 'paddingRight' : 'paddingLeft']: '2.3rem', fontSize: '0.85rem' }}
              />
              <Search
                size={16}
                style={{
                  position: 'absolute',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  [isAr ? 'right' : 'left']: '0.75rem',
                  color: 'var(--text-muted)'
                }}
              />
            </div>
          </div>

          {/* Table Container */}
          <div style={{ overflowX: 'auto', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-light)', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.02)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: isAr ? 'right' : 'left', fontSize: '0.825rem', whiteSpace: 'nowrap' }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '2px solid var(--border-light)', color: '#334155' }}>
                  <th style={{ padding: '0.85rem 0.9rem', fontWeight: 800 }}>imported</th>
                  <th style={{ padding: '0.85rem 0.9rem', fontWeight: 800 }}>Username</th>
                  <th style={{ padding: '0.85rem 0.9rem', fontWeight: 800 }}>Name</th>
                  <th style={{ padding: '0.85rem 0.9rem', fontWeight: 800 }}>First name</th>
                  <th style={{ padding: '0.85rem 0.9rem', fontWeight: 800 }}>student middle name</th>
                  <th style={{ padding: '0.85rem 0.9rem', fontWeight: 800 }}>Last name</th>
                  <th style={{ padding: '0.85rem 0.9rem', fontWeight: 800 }}>Gender</th>
                  <th style={{ padding: '0.85rem 0.9rem', fontWeight: 800 }}>Arabic Name</th>
                  <th style={{ padding: '0.85rem 0.9rem', fontWeight: 800 }}>Birth Date</th>
                  <th style={{ padding: '0.85rem 0.9rem', fontWeight: 800 }}>Religion</th>
                  <th style={{ padding: '0.85rem 0.9rem', fontWeight: 800 }}>Nationality</th>
                  <th style={{ padding: '0.85rem 0.9rem', fontWeight: 800 }}>Email</th>
                  <th style={{ padding: '0.85rem 0.9rem', fontWeight: 800 }}>Batch Code</th>
                  <th style={{ padding: '0.85rem 0.9rem', fontWeight: 800 }}>elective subjects string</th>
                  <th style={{ padding: '0.85rem 0.9rem', fontWeight: 800 }}>Family Code</th>
                  <th style={{ padding: '0.85rem 0.9rem', fontWeight: 800, background: '#FEF3C7', color: '#92400E' }}>Password</th>
                  <th style={{ padding: '0.85rem 0.9rem', fontWeight: 800, textAlign: 'center' }}>{isAr ? 'إجراءات' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={17} style={{ padding: '3.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                      <RefreshCw size={26} className="animate-spin" style={{ margin: '0 auto 0.5rem', color: 'var(--primary-600)' }} />
                      <div style={{ fontWeight: 700 }}>{isAr ? 'جاري تحميل قائمة الطلاب...' : 'Loading students...'}</div>
                    </td>
                  </tr>
                ) : students.length === 0 ? (
                  <tr>
                    <td colSpan={17} style={{ padding: '3.5rem 1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                      <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🎓</div>
                      <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--text-title)', marginBottom: '0.25rem' }}>
                        {isAr ? 'لا يوجد طلاب مسجلون بعد' : 'No students found'}
                      </div>
                      <p style={{ margin: 0, fontSize: '0.825rem' }}>
                        {isAr
                          ? 'استخدم زر الاستيراد أو نموذج الإنشاء لإضافة الطلاب'
                          : 'Use Excel import or the creation form to register students'}
                      </p>
                    </td>
                  </tr>
                ) : (
                  students.map(s => {
                    const isVisible = visiblePasswords[s.id];
                    const autoPassword = `${s.username}Aa@1`;

                    // Parse name components if not individually present
                    const nameParts = (s.fullName || '').trim().split(/\s+/);
                    const fName = s.firstName || nameParts[0] || '';
                    const mName = s.middleName || (nameParts.length > 2 ? nameParts.slice(1, -1).join(' ') : (nameParts[1] || ''));
                    const lName = s.lastName || (nameParts.length > 1 ? nameParts[nameParts.length - 1] : '');

                    return (
                      <tr
                        key={s.id}
                        style={{
                          borderBottom: '1px solid var(--border-light)',
                          transition: 'background 0.15s ease'
                        }}
                      >
                        {/* 1. imported */}
                        <td style={{ padding: '0.65rem 0.9rem' }}>
                          <span style={{
                            background: '#EFF6FF',
                            color: '#1D4ED8',
                            fontFamily: 'monospace',
                            fontWeight: 800,
                            padding: '0.2rem 0.45rem',
                            borderRadius: 'var(--radius-sm)',
                            fontSize: '0.75rem'
                          }}>
                            {s.imported || s.studentCode || `IMP-${s.id.substring(0, 6)}`}
                          </span>
                        </td>

                        {/* 2. Username */}
                        <td style={{ padding: '0.65rem 0.9rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            <span style={{ fontFamily: 'monospace', fontWeight: 800, color: 'var(--primary-700)' }}>
                              {s.username}
                            </span>
                            <button
                              onClick={() => handleCopyCredentials(s.username, `${s.id}-user`)}
                              title={isAr ? 'نسخ اسم المستخدم' : 'Copy Username'}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '0.15rem' }}
                            >
                              {copiedId === `${s.id}-user` ? <Check size={13} color="#10B981" /> : <Copy size={13} />}
                            </button>
                          </div>
                        </td>

                        {/* 3. Name */}
                        <td style={{ padding: '0.65rem 0.9rem', fontWeight: 800, color: 'var(--text-title)' }}>
                          {s.fullName}
                        </td>

                        {/* 4. First name */}
                        <td style={{ padding: '0.65rem 0.9rem', color: 'var(--text-body)' }}>
                          {fName || '-'}
                        </td>

                        {/* 5. student middle name */}
                        <td style={{ padding: '0.65rem 0.9rem', color: 'var(--text-body)' }}>
                          {mName || '-'}
                        </td>

                        {/* 6. Last name */}
                        <td style={{ padding: '0.65rem 0.9rem', color: 'var(--text-body)' }}>
                          {lName || '-'}
                        </td>

                        {/* 7. Gender */}
                        <td style={{ padding: '0.65rem 0.9rem' }}>
                          <span style={{
                            padding: '0.15rem 0.45rem',
                            borderRadius: 'var(--radius-full)',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            background: s.gender === 'Female' || s.gender === 'أنثى' ? '#FCE7F3' : '#E0E7FF',
                            color: s.gender === 'Female' || s.gender === 'أنثى' ? '#9D174D' : '#3730A3'
                          }}>
                            {s.gender || 'Male'}
                          </span>
                        </td>

                        {/* 8. Arabic Name */}
                        <td style={{ padding: '0.65rem 0.9rem', color: 'var(--text-title)', fontWeight: 600 }}>
                          {s.arabicName || s.fullName}
                        </td>

                        {/* 9. Birth Date */}
                        <td style={{ padding: '0.65rem 0.9rem', color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: '0.78rem' }}>
                          {s.birthDate || '-'}
                        </td>

                        {/* 10. Religion */}
                        <td style={{ padding: '0.65rem 0.9rem', color: 'var(--text-body)' }}>
                          {s.religion || 'مسلم'}
                        </td>

                        {/* 11. Nationality */}
                        <td style={{ padding: '0.65rem 0.9rem', color: 'var(--text-body)' }}>
                          {s.nationality || 'مصر'}
                        </td>

                        {/* 12. Email */}
                        <td style={{ padding: '0.65rem 0.9rem', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                          {s.email || '-'}
                        </td>

                        {/* 13. Batch Code */}
                        <td style={{ padding: '0.65rem 0.9rem' }}>
                          <span style={{
                            background: '#F1F5F9',
                            color: '#475569',
                            padding: '0.2rem 0.5rem',
                            borderRadius: 'var(--radius-sm)',
                            fontSize: '0.75rem',
                            fontWeight: 700
                          }}>
                            {s.batchCode || s.gradeName}
                          </span>
                        </td>

                        {/* 14. elective subjects string */}
                        <td style={{ padding: '0.65rem 0.9rem', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                          {s.electiveSubjects || '-'}
                        </td>

                        {/* 15. Family Code */}
                        <td style={{ padding: '0.65rem 0.9rem', fontFamily: 'monospace', color: '#6366F1', fontWeight: 700 }}>
                          {s.familyCode || '-'}
                        </td>

                        {/* 16. Password (Strictly username + Aa@1) */}
                        <td style={{ padding: '0.65rem 0.9rem', background: '#FFFBEB' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            <span style={{
                              fontFamily: 'monospace',
                              fontWeight: 900,
                              color: '#B45309',
                              fontSize: '0.825rem'
                            }}>
                              {isVisible ? autoPassword : '••••••••'}
                            </span>
                            <button
                              onClick={() => togglePasswordVisibility(s.id)}
                              title={isVisible ? (isAr ? 'إخفاء' : 'Hide') : (isAr ? 'إظهار' : 'Show')}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#B45309', padding: '0.15rem' }}
                            >
                              {isVisible ? <EyeOff size={13} /> : <Eye size={13} />}
                            </button>
                            <button
                              onClick={() => handleCopyCredentials(autoPassword, `${s.id}-pass`)}
                              title={isAr ? 'نسخ كلمة المرور' : 'Copy Password'}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#B45309', padding: '0.15rem' }}
                            >
                              {copiedId === `${s.id}-pass` ? <Check size={13} color="#10B981" /> : <Copy size={13} />}
                            </button>
                          </div>
                        </td>

                        {/* 17. Actions */}
                        <td style={{ padding: '0.65rem 0.9rem', textAlign: 'center' }}>
                          <button
                            onClick={() => handleDeleteStudent(s.id, s.fullName)}
                            title={isAr ? 'حذف الطالب' : 'Delete Student'}
                            style={{
                              background: '#FEE2E2',
                              color: '#DC2626',
                              border: 'none',
                              borderRadius: 'var(--radius-md)',
                              padding: '0.3rem 0.55rem',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              transition: 'all 0.15s ease'
                            }}
                          >
                            <Trash2 size={12} />
                            <span>{isAr ? 'حذف' : 'Delete'}</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GovernorateSupervisorDashboard;
