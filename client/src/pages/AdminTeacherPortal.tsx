import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiUrl } from '../utils/api';
import { 
  ShieldCheck, 
  Lock, 
  Mail, 
  ArrowRight, 
  ArrowLeft, 
  Shield, 
  UserPlus, 
  LogIn, 
  User, 
  BookOpen, 
  Building2, 
  CheckCircle2,
  GraduationCap,
  Eye,
  EyeOff
} from 'lucide-react';

interface Props {
  onBackToHome: () => void;
}

const COMMON_SPECIALIZATIONS = [
  'اللغة العربية',
  'الرياضيات',
  'العلوم',
  'اللغة الإنجليزية',
  'الدراسات الاجتماعية',
  'الفيزياء',
  'الكيمياء',
  'الأحياء'
];

export const AdminTeacherPortal: React.FC<Props> = ({ onBackToHome }) => {
  const { login, language } = useAuth();
  const isAr = language === 'ar';
  const ArrowIcon = isAr ? ArrowLeft : ArrowRight;

  // Active Tab: 'login' | 'register'
  const [activeTab, setActiveTab] = useState<'login' | 'register'>('login');

  // Login form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showRegPassword, setShowRegPassword] = useState(false);

  // Register form state
  const [fullName, setFullName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>(['اللغة العربية']);
  const [customSubjectInput, setCustomSubjectInput] = useState('');
  const [schoolName, setSchoolName] = useState('');
  const [grades, setGrades] = useState<any[]>([]);
  const [selectedGradeIds, setSelectedGradeIds] = useState<string[]>([]);

  // Feedback states
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    fetch(apiUrl('/api/meta/grades'))
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          setGrades(data);
          if (data.length > 0 && selectedGradeIds.length === 0) {
            setSelectedGradeIds([data[0].id]);
          }
        }
      })
      .catch(console.error);
  }, []);

  const toggleSubject = (subj: string) => {
    const clean = subj.trim();
    if (!clean) return;
    if (selectedSubjects.includes(clean)) {
      if (selectedSubjects.length > 1) {
        setSelectedSubjects(selectedSubjects.filter(s => s !== clean));
      }
    } else {
      setSelectedSubjects([...selectedSubjects, clean]);
    }
  };

  const toggleGrade = (gId: string) => {
    if (selectedGradeIds.includes(gId)) {
      if (selectedGradeIds.length > 1) {
        setSelectedGradeIds(selectedGradeIds.filter(id => id !== gId));
      }
    } else {
      setSelectedGradeIds([...selectedGradeIds, gId]);
    }
  };

  // Handle Login
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setIsLoading(true);

    try {
      const res = await fetch(apiUrl('/api/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || (isAr ? 'فشل تسجيل الدخول' : 'Sign-in failed'));
      }

      if (data.user.role !== 'ADMIN' && data.user.role !== 'TEACHER') {
        throw new Error(
          isAr
            ? 'هذه البوابة مخصصة حصرياً للمالك والإدارة والمعلمين. للطلاب، يرجى الدخول من المنصة الرئيسية.'
            : 'This portal is strictly reserved for Admin and Teachers. Students must use the main platform.'
        );
      }

      login(data.token, data.user);
    } catch (err: any) {
      setError(err.message || (isAr ? 'حدث خطأ غير متوقع' : 'Unexpected error'));
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Teacher Registration
  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (!fullName.trim() || !regEmail.trim() || !regPassword.trim()) {
      setError(isAr ? 'الرجاء إدخال كافة البيانات الأساسية المطلوبة' : 'Please fill all required fields');
      return;
    }

    if (selectedSubjects.length === 0) {
      setError(isAr ? 'الرجاء اختيار مادة تعليمية واحدة على الأقل' : 'Please select at least one teaching subject');
      return;
    }

    if (selectedGradeIds.length === 0) {
      setError(isAr ? 'الرجاء اختيار صف دراسي واحد على الأقل' : 'Please select at least one grade');
      return;
    }

    if (regPassword.length < 6) {
      setError(isAr ? 'كلمة المرور يجب أن لا تقل عن 6 أحرف' : 'Password must be at least 6 characters');
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch(apiUrl('/api/auth/register-teacher'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: fullName.trim(),
          email: regEmail.trim(),
          password: regPassword,
          specialization: selectedSubjects.join('، '),
          schoolName: schoolName.trim() || (isAr ? 'مدرسة المتفوقين' : 'STEM School'),
          gradeId: selectedGradeIds[0],
          assignedSubjects: selectedSubjects,
          assignedGrades: selectedGradeIds
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || (isAr ? 'فشل إنشاء حساب المعلم' : 'Failed to create teacher account'));
      }

      setSuccessMsg(
        isAr 
          ? `تم إنشاء حسابك بنجاح! المعرّف الهجين الخاص بك هو: ${data.user?.hybrid_id || 'HYBRID-TEA'}` 
          : `Account created successfully! Your Hybrid ID is: ${data.user?.hybrid_id || 'HYBRID-TEA'}`
      );

      // Immediately log in the new teacher
      setTimeout(() => {
        login(data.token, data.user);
      }, 700);

    } catch (err: any) {
      setError(err.message || (isAr ? 'حدث خطأ أثناء إنشاء حساب المعلم' : 'Registration failed'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '82vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2.5rem 1rem'
    }}>
      <div 
        className="card" 
        style={{
          width: '100%',
          maxWidth: '540px',
          padding: '2rem 1.5rem',
          boxSizing: 'border-box',
          borderRadius: 'var(--radius-xl)',
          boxShadow: '0 24px 48px -12px rgba(15, 23, 42, 0.12)',
          border: '1px solid var(--border-light)',
          background: 'rgba(255, 255, 255, 0.98)',
          backdropFilter: 'blur(12px)'
        }}
      >
        {/* Back link */}
        <button
          onClick={onBackToHome}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.45rem',
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            fontSize: '0.875rem',
            fontWeight: 700,
            marginBottom: '1.5rem',
            padding: 0,
            transition: 'color var(--t-fast)'
          }}
        >
          <ArrowIcon size={16} />
          <span>{isAr ? 'العودة إلى منصة الطلاب الرئيسية' : 'Return to Student Platform'}</span>
        </button>

        {/* Portal Header */}
        <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '64px',
            height: '64px',
            borderRadius: '20px',
            background: 'linear-gradient(135deg, #1E293B 0%, #0F172A 100%)',
            color: '#F8FAFC',
            marginBottom: '1rem',
            boxShadow: '0 10px 22px -6px rgba(15, 23, 42, 0.35)'
          }}>
            <ShieldCheck size={34} color="#38BDF8" />
          </div>

          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.35rem',
            padding: '0.3rem 0.85rem',
            borderRadius: 'var(--radius-full)',
            background: '#F1F5F9',
            color: '#475569',
            fontSize: '0.75rem',
            fontWeight: 700,
            marginBottom: '0.75rem',
            border: '1px solid #E2E8F0'
          }}>
            <Shield size={12} color="#0284C7" />
            <span>{isAr ? 'بوابة مشفرة ومحمية | /adminportalteacher' : 'Secure Staff Gate | /adminportalteacher'}</span>
          </div>

          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-title)', marginBottom: '0.45rem', letterSpacing: '-0.01em' }}>
            {isAr ? 'بوابة المعلمين والإدارة المعتمدة' : 'Staff & Administration Portal'}
          </h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', lineHeight: 1.6, maxWidth: '440px', margin: '0 auto' }}>
            {isAr 
              ? 'تسجيل الدخول وإنشاء حسابات المعلمين للتحكم في المناهج والامتحانات ورفع الكتب المدرسية.'
              : 'Sign in or register as an educator to manage curriculum, create AI exams, and upload textbooks.'}
          </p>
        </div>

        {/* Tab Switcher: Login vs Register */}
        <div style={{
          display: 'flex',
          background: '#F1F5F9',
          padding: '4px',
          borderRadius: 'var(--radius-lg)',
          marginBottom: '1.75rem',
          border: '1px solid #E2E8F0'
        }}>
          <button
            type="button"
            onClick={() => { setActiveTab('login'); setError(null); setSuccessMsg(null); }}
            style={{
              flex: 1,
              padding: '0.65rem 1rem',
              borderRadius: 'var(--radius-md)',
              border: 'none',
              background: activeTab === 'login' ? '#FFFFFF' : 'transparent',
              color: activeTab === 'login' ? 'var(--primary-700)' : 'var(--text-muted)',
              fontWeight: activeTab === 'login' ? 800 : 600,
              fontSize: '0.9rem',
              boxShadow: activeTab === 'login' ? '0 2px 8px rgba(0,0,0,0.06)' : 'none',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.45rem'
            }}
          >
            <LogIn size={16} />
            <span>{isAr ? 'تسجيل الدخول' : 'Sign In'}</span>
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab('register'); setError(null); setSuccessMsg(null); }}
            style={{
              flex: 1,
              padding: '0.65rem 1rem',
              borderRadius: 'var(--radius-md)',
              border: 'none',
              background: activeTab === 'register' ? '#FFFFFF' : 'transparent',
              color: activeTab === 'register' ? 'var(--primary-700)' : 'var(--text-muted)',
              fontWeight: activeTab === 'register' ? 800 : 600,
              fontSize: '0.9rem',
              boxShadow: activeTab === 'register' ? '0 2px 8px rgba(0,0,0,0.06)' : 'none',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.45rem'
            }}
          >
            <UserPlus size={16} />
            <span>{isAr ? 'إنشاء حساب معلم جديد' : 'Create Teacher Account'}</span>
          </button>
        </div>

        {/* Success Alert */}
        {successMsg && (
          <div style={{
            background: '#F0FDF4',
            border: '1px solid #86EFAC',
            color: '#15803D',
            padding: '0.85rem 1rem',
            borderRadius: 'var(--radius-md)',
            fontSize: '0.85rem',
            marginBottom: '1.25rem',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            <CheckCircle2 size={18} color="#16A34A" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div style={{
            background: '#FEF2F2',
            border: '1px solid #FCA5A5',
            color: '#DC2626',
            padding: '0.75rem 1rem',
            borderRadius: 'var(--radius-md)',
            fontSize: '0.85rem',
            marginBottom: '1.25rem',
            fontWeight: 600
          }}>
            {error}
          </div>
        )}

        {/* TAB 1: LOGIN FORM */}
        {activeTab === 'login' && (
          <form onSubmit={handleLoginSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div>
              <label className="form-label" style={{ fontWeight: 700, fontSize: '0.875rem' }}>
                {isAr ? 'البريد الإلكتروني المهني:' : 'Work Email:'}
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="email"
                  required
                  className="form-input"
                  placeholder={isAr ? 'teacher@edu.eg' : 'staff@edu.eg'}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={{ paddingRight: isAr ? '2.5rem' : '1rem', paddingLeft: isAr ? '1rem' : '2.5rem' }}
                />
                <Mail 
                  size={18} 
                  style={{
                    position: 'absolute',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    [isAr ? 'right' : 'left']: '0.85rem',
                    color: 'var(--text-muted)'
                  }} 
                />
              </div>
            </div>

            <div>
              <label className="form-label" style={{ fontWeight: 700, fontSize: '0.875rem' }}>
                {isAr ? 'كلمة المرور:' : 'Password:'}
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showLoginPassword ? 'text' : 'password'}
                  required
                  className="form-input"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{ paddingRight: '2.5rem', paddingLeft: '2.5rem' }}
                />
                <Lock 
                  size={18} 
                  style={{
                    position: 'absolute',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    [isAr ? 'right' : 'left']: '0.85rem',
                    color: 'var(--text-muted)'
                  }} 
                />
                <button
                  type="button"
                  onClick={() => setShowLoginPassword(prev => !prev)}
                  tabIndex={-1}
                  style={{
                    position: 'absolute',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    [isAr ? 'left' : 'right']: '0.85rem',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: showLoginPassword ? 'var(--color-primary)' : 'var(--text-muted)'
                  }}
                  title={showLoginPassword ? (isAr ? 'إخفاء كلمة المرور' : 'Hide password') : (isAr ? 'إظهار كلمة المرور' : 'Show password')}
                >
                  {showLoginPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-lg"
              disabled={isLoading}
              style={{ width: '100%', marginTop: '0.5rem', fontWeight: 800, padding: '0.85rem' }}
            >
              {isLoading 
                ? (isAr ? 'جاري التحقق والمصادقة...' : 'Authenticating...') 
                : (isAr ? 'دخول لوحة التحكم المعتمدة' : 'Sign In to Portal')}
            </button>

            {/* Bottom Switch Link */}
            <div style={{ textAlign: 'center', marginTop: '0.5rem' }}>
              <button
                type="button"
                onClick={() => { setActiveTab('register'); setError(null); }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--primary-600)',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  fontWeight: 700
                }}
              >
                {isAr ? 'ليس لديك حساب معلم بعد؟ اضغط هنا لإنشاء حساب جديد' : "Don't have a teacher account? Create one now"}
              </button>
            </div>
          </form>
        )}

        {/* TAB 2: CREATE TEACHER ACCOUNT FORM */}
        {activeTab === 'register' && (
          <form onSubmit={handleRegisterSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Full Name */}
            <div>
              <label className="form-label" style={{ fontWeight: 700, fontSize: '0.875rem' }}>
                {isAr ? 'اسم المعلم بالكامل (الرباعي):' : 'Teacher Full Name:'}
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  required
                  className="form-input"
                  placeholder={isAr ? 'أ. أحمد محمود الشريف' : 'Prof. Ahmed Al-Sharif'}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  style={{ paddingRight: isAr ? '2.5rem' : '1rem', paddingLeft: isAr ? '1rem' : '2.5rem' }}
                />
                <User 
                  size={18} 
                  style={{
                    position: 'absolute',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    [isAr ? 'right' : 'left']: '0.85rem',
                    color: 'var(--text-muted)'
                  }} 
                />
              </div>
            </div>

            {/* Work Email */}
            <div>
              <label className="form-label" style={{ fontWeight: 700, fontSize: '0.875rem' }}>
                {isAr ? 'البريد الإلكتروني المهني:' : 'Work Email:'}
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="email"
                  required
                  className="form-input"
                  placeholder={isAr ? 'teacher.ahmed@edu.eg' : 'teacher.ahmed@edu.eg'}
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  style={{ paddingRight: isAr ? '2.5rem' : '1rem', paddingLeft: isAr ? '1rem' : '2.5rem' }}
                />
                <Mail 
                  size={18} 
                  style={{
                    position: 'absolute',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    [isAr ? 'right' : 'left']: '0.85rem',
                    color: 'var(--text-muted)'
                  }} 
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="form-label" style={{ fontWeight: 700, fontSize: '0.875rem' }}>
                {isAr ? 'كلمة المرور (6 أحرف أو أكثر):' : 'Password (6+ characters):'}
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showRegPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  className="form-input"
                  placeholder="••••••••"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  style={{ paddingRight: '2.5rem', paddingLeft: '2.5rem' }}
                />
                <Lock 
                  size={18} 
                  style={{
                    position: 'absolute',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    [isAr ? 'right' : 'left']: '0.85rem',
                    color: 'var(--text-muted)'
                  }} 
                />
                <button
                  type="button"
                  onClick={() => setShowRegPassword(prev => !prev)}
                  tabIndex={-1}
                  style={{
                    position: 'absolute',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    [isAr ? 'left' : 'right']: '0.85rem',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: showRegPassword ? 'var(--color-primary)' : 'var(--text-muted)'
                  }}
                  title={showRegPassword ? (isAr ? 'إخفاء كلمة المرور' : 'Hide password') : (isAr ? 'إظهار كلمة المرور' : 'Show password')}
                >
                  {showRegPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* Specialization / Subjects (Multi-select) */}
            <div>
              <label className="form-label" style={{ fontWeight: 700, fontSize: '0.875rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.4rem', marginBottom: '0.45rem' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <BookOpen size={16} style={{ color: 'var(--primary-600)', flexShrink: 0 }} />
                  <span>{isAr ? 'المواد التعليمية التي يدرّسها المعلم (يمكن اختيار أكثر من مادة):' : 'Teaching Subjects (Select one or more):'}</span>
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--primary-700)', fontWeight: 800, background: '#EFF6FF', padding: '0.15rem 0.5rem', borderRadius: '999px' }}>
                  {selectedSubjects.length} {isAr ? 'محددة' : 'selected'}
                </span>
              </label>

              {/* Subject toggle chips */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem', marginBottom: '0.65rem' }}>
                {COMMON_SPECIALIZATIONS.map(spec => {
                  const isSelected = selectedSubjects.includes(spec);
                  return (
                    <button
                      key={spec}
                      type="button"
                      onClick={() => toggleSubject(spec)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        border: isSelected ? '1.5px solid var(--primary-600)' : '1px solid #CBD5E1',
                        background: isSelected ? 'linear-gradient(135deg, #1E40AF 0%, #2563EB 100%)' : '#F8FAFC',
                        color: isSelected ? '#FFFFFF' : '#334155',
                        borderRadius: 'var(--radius-full)',
                        padding: '0.35rem 0.85rem',
                        fontSize: '0.82rem',
                        fontWeight: isSelected ? 800 : 600,
                        cursor: 'pointer',
                        boxShadow: isSelected ? '0 2px 6px rgba(37, 99, 235, 0.25)' : 'none',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {isSelected ? '✓ ' : '+ '}
                      <span>{spec}</span>
                    </button>
                  );
                })}
              </div>

              {/* Optional custom subject add */}
              <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.35rem' }}>
                <input
                  type="text"
                  className="form-input"
                  placeholder={isAr ? '✍️ إضافة مادة أخرى (مثال: البرمجة والذكاء الاصطناعي)...' : '✍️ Add custom subject...'}
                  value={customSubjectInput}
                  onChange={(e) => setCustomSubjectInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (customSubjectInput.trim()) {
                        toggleSubject(customSubjectInput.trim());
                        setCustomSubjectInput('');
                      }
                    }
                  }}
                  style={{ fontSize: '0.82rem', padding: '0.45rem 0.75rem' }}
                />
                <button
                  type="button"
                  onClick={() => {
                    if (customSubjectInput.trim()) {
                      toggleSubject(customSubjectInput.trim());
                      setCustomSubjectInput('');
                    }
                  }}
                  style={{
                    padding: '0.45rem 0.85rem',
                    background: 'var(--primary-600)',
                    color: '#FFF',
                    border: 'none',
                    borderRadius: 'var(--radius-md)',
                    fontWeight: 700,
                    fontSize: '0.8rem',
                    cursor: 'pointer'
                  }}
                >
                  {isAr ? 'إضافة' : 'Add'}
                </button>
              </div>
            </div>

            {/* Grade Selection (Multi-grade support) */}
            <div>
              <label className="form-label" style={{ fontWeight: 700, fontSize: '0.875rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.4rem', marginBottom: '0.45rem' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <GraduationCap size={16} style={{ color: 'var(--primary-600)', flexShrink: 0 }} />
                  <span>{isAr ? 'الصفوف الدراسية المعتمدة لحساب المعلم (يمكن اختيار أكثر من صف):' : 'Authorized Grades (Select one or more):'}</span>
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--primary-700)', fontWeight: 800, background: '#EFF6FF', padding: '0.15rem 0.5rem', borderRadius: '999px' }}>
                  {selectedGradeIds.length} {isAr ? 'محددة' : 'selected'}
                </span>
              </label>

              <div style={{
                maxHeight: '170px',
                overflowY: 'auto',
                border: '1px solid #CBD5E1',
                borderRadius: 'var(--radius-md)',
                padding: '0.5rem',
                background: '#F8FAFC',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                gap: '0.4rem'
              }}>
                {grades.map(g => {
                  const isSelected = selectedGradeIds.includes(g.id);
                  return (
                    <div
                      key={g.id}
                      onClick={() => toggleGrade(g.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.45rem',
                        padding: '0.4rem 0.65rem',
                        borderRadius: 'var(--radius-sm)',
                        background: isSelected ? '#EFF6FF' : '#FFFFFF',
                        border: isSelected ? '1.5px solid var(--primary-600)' : '1px solid #E2E8F0',
                        cursor: 'pointer',
                        userSelect: 'none',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}}
                        style={{ cursor: 'pointer', accentColor: 'var(--primary-600)' }}
                      />
                      <span style={{ fontSize: '0.8rem', fontWeight: isSelected ? 800 : 500, color: isSelected ? 'var(--primary-800)' : 'var(--text-body)' }}>
                        {isAr ? `${g.name_ar} (${g.stage_name_ar || ''})` : (g.name_en || g.name_ar)}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div style={{ fontSize: '0.73rem', color: '#475569', marginTop: '0.35rem', fontWeight: 600 }}>
                {isAr 
                  ? '🔒 تنبيه أمني: داخل لوحة تحكم المعلم، سيتم قفل الاختيارات حصرياً على المواد والصفوف التي حددتها هنا ولن تظهر أي مواد أو صفوف أخرى.' 
                  : '🔒 Note: Inside your dashboard, the system locks strictly to these subjects and grades only.'}
              </div>
            </div>

            {/* School / Institution Name */}
            <div>
              <label className="form-label" style={{ fontWeight: 700, fontSize: '0.875rem' }}>
                {isAr ? 'المدرسة أو الإدارة التعليمية:' : 'School or Educational Directorate:'}
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  className="form-input"
                  placeholder={isAr ? 'مدرسة المتفوقين الرسمية لغات' : 'STEM Official School'}
                  value={schoolName}
                  onChange={(e) => setSchoolName(e.target.value)}
                  style={{ paddingRight: isAr ? '2.5rem' : '1rem', paddingLeft: isAr ? '1rem' : '2.5rem' }}
                />
                <Building2 
                  size={18} 
                  style={{
                    position: 'absolute',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    [isAr ? 'right' : 'left']: '0.85rem',
                    color: 'var(--text-muted)'
                  }} 
                />
              </div>
            </div>

            {/* Hybrid ID notice */}
            <div style={{
              background: '#F8FAFC',
              border: '1px dashed #CBD5E1',
              borderRadius: 'var(--radius-md)',
              padding: '0.75rem',
              fontSize: '0.75rem',
              color: '#475569',
              lineHeight: 1.5
            }}>
              💡 {isAr 
                ? 'سيتم تلقائياً توليد معرّف هجين موحد (Hybrid ID) لحسابك يربط تخصصك ومدرستك ويمنحك صلاحيات كاملة لرفع المناهج وبناء الامتحانات.' 
                : 'A unified Hybrid ID will be automatically generated for your account, granting full curriculum upload and exam creation permissions.'}
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-lg"
              disabled={isLoading}
              style={{ width: '100%', marginTop: '0.25rem', fontWeight: 800, padding: '0.85rem' }}
            >
              {isLoading 
                ? (isAr ? 'جاري إنشاء حساب المعلم...' : 'Creating Teacher Account...') 
                : (isAr ? 'إنشاء حساب المعلم والبدء فوراً 🚀' : 'Create Teacher Account & Enter 🚀')}
            </button>

            {/* Bottom Switch Link */}
            <div style={{ textAlign: 'center', marginTop: '0.5rem' }}>
              <button
                type="button"
                onClick={() => { setActiveTab('login'); setError(null); }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--primary-600)',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  fontWeight: 700
                }}
              >
                {isAr ? 'لديك حساب معلم بالفعل؟ تسجيل الدخول' : 'Already have an account? Sign in'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
