import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiUrl } from '../utils/api';
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
  Filter
} from 'lucide-react';

interface StudentItem {
  id: string;
  studentCode: string;
  email: string;
  username: string;
  fullName: string;
  initialPassword?: string;
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

  // Form State for creating student
  const [fullName, setFullName] = useState<string>('');
  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [selectedGradeId, setSelectedGradeId] = useState<string>('');
  const [schoolType, setSchoolType] = useState<'عربى' | 'لغات'>('عربى');
  const [schoolName, setSchoolName] = useState<string>('مدرسة الفارابي');
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

  // Auto-generate random password
  const generateRandomPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let p = 'Farabi@';
    for (let i = 0; i < 4; i++) {
      p += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setPassword(p);
  };

  // Auto-generate unique username based on full name or timestamp
  const generateUsernameFromFullName = (name: string) => {
    if (!name.trim()) {
      const rnd = Math.floor(1000 + Math.random() * 9000);
      setUsername(`farabi_stu_${rnd}`);
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

    if (!fullName.trim() || !username.trim() || !password.trim() || !selectedGradeId) {
      setFormError(isAr ? 'يرجى ملء جميع الحقول المطلوبة' : 'Please fill all required fields');
      return;
    }

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
          username: username.trim(),
          password: password.trim(),
          gradeId: selectedGradeId,
          schoolType,
          schoolName: schoolName.trim() || 'مدرسة الفارابي'
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'فشل إنشاء حساب الطالب');
      }

      setFormSuccess(isAr ? `✅ تم إنشاء حساب الطالب بنجاح! اسم الدخول: ${username}` : 'Student account created successfully!');
      setFullName('');
      setUsername('');
      setPassword('');
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

  // EXCEL / CSV EXPORT WITH UTF-8 BOM
  const handleExportToExcel = () => {
    if (students.length === 0) {
      alert(isAr ? 'لا يوجد طلاب لتصديرهم حالياً' : 'No students to export');
      return;
    }

    // Prepare CSV header
    const headers = [
      'م',
      'كود الطالب',
      'اسم الطالب',
      'اسم المستخدم (Username)',
      'كلمة المرور (Password)',
      'المرحلة الدراسية',
      'الصف الدراسي',
      'نوع التعليم',
      'المدرسة',
      'المحافظة',
      'تاريخ الإنشاء'
    ];

    const rows = students.map((s, index) => [
      index + 1,
      `"${s.studentCode || ''}"`,
      `"${s.fullName.replace(/"/g, '""')}"`,
      `"${s.username || s.email}"`,
      `"${s.initialPassword || '********'}"`,
      `"${s.stageName || ''}"`,
      `"${s.gradeName || ''}"`,
      `"${s.schoolType || 'عربى'}"`,
      `"${s.schoolName || 'مدرسة الفارابي'}"`,
      `"${s.governorateName || governorateName}"`,
      `"${new Date(s.createdAt).toLocaleDateString('ar-EG')}"`
    ]);

    // Add UTF-8 BOM (\uFEFF) for perfect Arabic Excel rendering
    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const gradeNameSuffix = selectedGradeFilter !== 'ALL' 
      ? `_${grades.find(g => g.id === selectedGradeFilter)?.name_ar || ''}`
      : '_جميع_الصفوف';
    const filename = `بيانات_حسابات_الطلاب_مدرسة_الفارابي${gradeNameSuffix}_${new Date().toISOString().slice(0, 10)}.csv`;
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
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
            <img src="/logo.png" alt="Farabi School" style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: '50%' }} />
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
              {isAr ? 'منظومة إنشاء وتصدير حسابات الطلاب - مدرسة الفارابي' : 'Farabi Student Accounts Management'}
            </h1>
            <p style={{ margin: '0.35rem 0 0', color: '#BFDBFE', fontSize: '0.85rem' }}>
              {isAr
                ? 'إنشاء بيانات دخول الطلاب لجميع المراحل (الابتدائي - الإعدادي - الثانوي) وتصديرها مباشرة إلى Excel.'
                : 'Generate student login credentials for all stages and export to Excel spreadsheet.'}
            </p>
          </div>
        </div>

        {/* Upper Export to Excel Button (Requirement 4) */}
        <div style={{ zIndex: 2, display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button
            onClick={handleExportToExcel}
            className="btn"
            style={{
              background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
              color: '#FFFFFF',
              border: 'none',
              padding: '0.85rem 1.6rem',
              borderRadius: 'var(--radius-xl)',
              fontSize: '1rem',
              fontWeight: 900,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.65rem',
              boxShadow: '0 8px 20px rgba(16, 185, 129, 0.35)',
              transition: 'all 0.2s ease'
            }}
          >
            <FileSpreadsheet size={20} />
            <span>{isAr ? '📥 تصدير كشوف الطلاب إلى Excel' : '📥 Export Students to Excel'}</span>
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

            {/* 3. Password with Generate Helper */}
            <div className="form-group">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                <label className="form-label" style={{ fontWeight: 800, margin: 0 }}>
                  {isAr ? 'كلمة المرور (Password)' : 'Password'} *
                </label>
                <button
                  type="button"
                  onClick={generateRandomPassword}
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
                  <Key size={12} />
                  <span>{isAr ? 'توليد كلمة سر' : 'Generate Password'}</span>
                </button>
              </div>
              <input
                type="text"
                required
                className="form-input"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Farabi@2026"
              />
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
                placeholder="مدرسة الفارابي"
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
          <div style={{ overflowX: 'auto', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-light)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: isAr ? 'right' : 'left', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ background: 'var(--bg-subtle)', borderBottom: '1.5px solid var(--border-light)', color: 'var(--text-title)' }}>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 800 }}>{isAr ? 'كود الطالب' : 'Code'}</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 800 }}>{isAr ? 'اسم الطالب' : 'Full Name'}</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 800 }}>{isAr ? 'اسم المستخدم' : 'Username'}</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 800 }}>{isAr ? 'كلمة المرور' : 'Password'}</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 800 }}>{isAr ? 'الصف الدراسي' : 'Grade'}</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 800 }}>{isAr ? 'تاريخ الإنشاء' : 'Date'}</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 800, textAlign: 'center' }}>{isAr ? 'إجراءات' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={7} style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                      <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 0.5rem' }} />
                      <div>{isAr ? 'جاري تحميل قائمة الطلاب...' : 'Loading students...'}</div>
                    </td>
                  </tr>
                ) : students.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                      <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🎓</div>
                      <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--text-title)', marginBottom: '0.25rem' }}>
                        {isAr ? 'لا يوجد طلاب مسجلون بعد' : 'No students found'}
                      </div>
                      <p style={{ margin: 0, fontSize: '0.825rem' }}>
                        {isAr
                          ? 'استخدم النموذج لإنشاء أول حساب طالب واختيار صفه الدراسي'
                          : 'Use the form to create your first student account'}
                      </p>
                    </td>
                  </tr>
                ) : (
                  students.map(s => {
                    const isVisible = visiblePasswords[s.id];

                    return (
                      <tr
                        key={s.id}
                        style={{
                          borderBottom: '1px solid var(--border-light)',
                          transition: 'background 0.15s ease'
                        }}
                      >
                        {/* Student Code */}
                        <td style={{ padding: '0.75rem 1rem' }}>
                          <span style={{
                            background: '#EFF6FF',
                            color: '#1D4ED8',
                            fontFamily: 'monospace',
                            fontWeight: 800,
                            padding: '0.2rem 0.5rem',
                            borderRadius: 'var(--radius-sm)',
                            fontSize: '0.8rem'
                          }}>
                            {s.studentCode}
                          </span>
                        </td>

                        {/* Full Name */}
                        <td style={{ padding: '0.75rem 1rem', fontWeight: 800, color: 'var(--text-title)' }}>
                          {s.fullName}
                          <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                            {s.schoolName} ({s.schoolType})
                          </div>
                        </td>

                        {/* Username */}
                        <td style={{ padding: '0.75rem 1rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--text-body)' }}>
                              {s.username}
                            </span>
                            <button
                              onClick={() => handleCopyCredentials(s.username, `${s.id}-user`)}
                              title={isAr ? 'نسخ اسم المستخدم' : 'Copy Username'}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '0.2rem' }}
                            >
                              {copiedId === `${s.id}-user` ? <Check size={14} color="#10B981" /> : <Copy size={14} />}
                            </button>
                          </div>
                        </td>

                        {/* Password */}
                        <td style={{ padding: '0.75rem 1rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            <span style={{
                              fontFamily: 'monospace',
                              fontWeight: 800,
                              color: isVisible ? '#B45309' : 'var(--text-muted)',
                              background: '#FFFBEB',
                              padding: '0.15rem 0.45rem',
                              borderRadius: 'var(--radius-sm)'
                            }}>
                              {isVisible ? (s.initialPassword || 'Farabi@123') : '••••••••'}
                            </span>
                            <button
                              onClick={() => togglePasswordVisibility(s.id)}
                              title={isVisible ? (isAr ? 'إخفاء' : 'Hide') : (isAr ? 'إظهار' : 'Show')}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '0.2rem' }}
                            >
                              {isVisible ? <EyeOff size={14} /> : <Eye size={14} />}
                            </button>
                            <button
                              onClick={() => handleCopyCredentials(s.initialPassword || 'Farabi@123', `${s.id}-pass`)}
                              title={isAr ? 'نسخ كلمة المرور' : 'Copy Password'}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '0.2rem' }}
                            >
                              {copiedId === `${s.id}-pass` ? <Check size={14} color="#10B981" /> : <Copy size={14} />}
                            </button>
                          </div>
                        </td>

                        {/* Grade Badge */}
                        <td style={{ padding: '0.75rem 1rem' }}>
                          <span style={{
                            padding: '0.25rem 0.65rem',
                            borderRadius: 'var(--radius-full)',
                            fontSize: '0.75rem',
                            fontWeight: 800,
                            background: s.gradeCode?.startsWith('PRIM') 
                              ? '#FEF3C7' 
                              : s.gradeCode?.startsWith('PREP') 
                                ? '#E0E7FF' 
                                : '#FCE7F3',
                            color: s.gradeCode?.startsWith('PRIM') 
                              ? '#92400E' 
                              : s.gradeCode?.startsWith('PREP') 
                                ? '#3730A3' 
                                : '#9D174D'
                          }}>
                            {s.gradeName}
                          </span>
                        </td>

                        {/* Created Date */}
                        <td style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                          {new Date(s.createdAt).toLocaleDateString('ar-EG')}
                        </td>

                        {/* Action Buttons */}
                        <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                          <button
                            onClick={() => handleDeleteStudent(s.id, s.fullName)}
                            title={isAr ? 'حذف الطالب' : 'Delete Student'}
                            style={{
                              background: '#FEE2E2',
                              color: '#DC2626',
                              border: 'none',
                              borderRadius: 'var(--radius-md)',
                              padding: '0.35rem 0.65rem',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              transition: 'all 0.15s ease'
                            }}
                          >
                            <Trash2 size={13} />
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
