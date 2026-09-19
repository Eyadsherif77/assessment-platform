import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { X, Sparkles, CheckCircle2, Lock, Mail } from 'lucide-react';
import { apiUrl } from '../utils/api';

interface AuthModalProps {
  isOpen: boolean;
  initialMode: 'login' | 'register';
  onClose: () => void;
  onSuccess: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  initialMode,
  onClose,
  onSuccess
}) => {
  const { login, language } = useAuth();
  const isAr = language === 'ar';

  const [mode, setMode] = useState<'login' | 'register'>(initialMode);

  // Form Fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [academicStageId, setAcademicStageId] = useState('');
  const [gradeId, setGradeId] = useState('');
  const countryId = '';
  const governorateId = '';
  const schoolId = '';
  const [schoolName, setSchoolName] = useState('');

  // Secondary division & School type states
  const [section, setSection] = useState('علمي');
  const [secondarySubDivision, setSecondarySubDivision] = useState<'علمي علوم' | 'علمي رياضة'>('علمي علوم');
  const [schoolType, setSchoolType] = useState<'عربي' | 'لغات'>('عربي');

  // Metadata from API
  const [stages, setStages] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    if (isOpen && mode === 'register') {
      fetch(apiUrl('/api/meta/stages'))
        .then(r => r.json())
        .then(data => {
          if (Array.isArray(data)) {
            setStages(data);
            if (data.length > 0) {
              setAcademicStageId(data[1]?.id || data[0]?.id);
            }
          }
        })
        .catch(console.error);
    }
  }, [isOpen, mode]);

  // Selected stage grades
  const selectedStage = stages.find(s => s.id === academicStageId);
  const availableGrades = selectedStage?.grades || [];
  const selectedGrade = availableGrades.find((g: any) => g.id === gradeId);

  const isSecondaryStage = selectedStage?.code === 'SECONDARY' || selectedStage?.name_ar?.includes('ثانو');
  const isSec1 = selectedGrade?.code === 'SEC_1' || selectedGrade?.name_ar?.includes('الأول');
  const isSec2Or3 = isSecondaryStage && !isSec1;

  useEffect(() => {
    if (availableGrades.length > 0 && !availableGrades.some((g: any) => g.id === gradeId)) {
      setGradeId(availableGrades[0].id);
    }
  }, [academicStageId, availableGrades]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const payload: any = {
        email: email.trim(),
        password
      };

      if (mode === 'register') {
        payload.role = 'STUDENT';
        payload.fullName = fullName.trim();
        payload.academicStageId = academicStageId;
        payload.gradeId = gradeId;
        payload.countryId = countryId;
        payload.governorateId = governorateId;
        payload.schoolId = schoolId;
        payload.schoolName = schoolName;
        payload.schoolType = schoolType;
        if (isSecondaryStage) {
          payload.section = isSec2Or3 && section === 'علمي' ? secondarySubDivision : section;
        }
      }

      const res = await fetch(apiUrl(endpoint), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'حدث خطأ في العملية');
      }

      login(data.token, data.user);
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'حدث خطأ غير متوقع');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 200,
      backgroundColor: 'rgba(15, 23, 42, 0.65)',
      backdropFilter: 'blur(6px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1rem'
    }}>
      <div className="auth-split-modal" style={{ position: 'relative' }}>
        {/* Floating Close Button for Mobile & Desktop */}
        <button
          type="button"
          onClick={onClose}
          aria-label={isAr ? 'إغلاق' : 'Close'}
          style={{
            position: 'absolute',
            top: '0.85rem',
            left: isAr ? '0.85rem' : 'auto',
            right: isAr ? 'auto' : '0.85rem',
            zIndex: 30,
            background: 'rgba(15, 23, 42, 0.45)',
            color: '#FFFFFF',
            border: '1px solid rgba(255, 255, 255, 0.25)',
            borderRadius: '50%',
            width: '32px',
            height: '32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            backdropFilter: 'blur(6px)',
            transition: 'all 0.2s ease',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
          }}
        >
          <X size={18} />
        </button>

        {/* =========================================================
            LEFT PANEL: EDUCATIONAL STORYTELLING
            ========================================================= */}
        <div className="auth-visual-panel">
          <div>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              background: 'rgba(255, 255, 255, 0.15)',
              padding: '0.35rem 0.85rem',
              borderRadius: 'var(--radius-full)',
              fontSize: '0.75rem',
              fontWeight: 800,
              marginBottom: '1.25rem'
            }}>
              <Sparkles size={14} />
              <span>{isAr ? 'منظومة التقويم الذكي المعتمدة 2026' : 'Certified Smart Assessment 2026'}</span>
            </div>

            <h3 style={{ fontSize: '1.6rem', fontWeight: 900, lineHeight: 1.3, marginBottom: '1rem', color: '#FFFFFF' }}>
              {isAr ? 'التقييم من أجل التعليم والتشخيص الفوري' : 'Assessment for Learning & Instant Diagnostics'}
            </h3>

            <p style={{ fontSize: '0.85rem', color: '#CBD5E1', lineHeight: 1.6, marginBottom: '1.75rem' }}>
              {isAr
                ? 'انضم إلى آلاف الطلاب واستمتع بأسئلة مشتقة 100% من كتاب الوزارة الرسمي لصفك مع إرشاد دقيق لرقم كل صفحة.'
                : 'Join thousands of students with questions 100% grounded in official textbooks with precise page citations.'}
            </p>

            {/* Feature Checklist */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.825rem', color: '#F1F5F9' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <CheckCircle2 size={16} color="#34D399" />
                <span>{isAr ? 'عزل صارم لمنهج صفك الدراسي فقط' : 'Strict curriculum isolation to your registered grade'}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <CheckCircle2 size={16} color="#34D399" />
                <span>{isAr ? 'تشخيص فوري للمفاهيم مع رقم الصفحة والفقرة' : 'Instant concept diagnosis citing exact page & paragraph'}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <CheckCircle2 size={16} color="#34D399" />
                <span>{isAr ? 'امتحانات بمؤقت زمني وتصحيح آلي فوري' : 'Timed practice exams with instant automated scoring'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* =========================================================
            RIGHT PANEL: RESPONSIVE ONBOARDING FORM
            ========================================================= */}
        <div className="auth-form-panel">
          {/* Top Bar: Close Button */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            {/* Tabs Toggle */}
            <div style={{
              display: 'inline-flex',
              background: 'var(--bg-subtle)',
              padding: '0.25rem',
              borderRadius: 'var(--radius-full)',
              gap: '0.25rem'
            }}>
              <button
                type="button"
                onClick={() => { setMode('login'); setError(null); }}
                style={{
                  background: mode === 'login' ? '#FFFFFF' : 'transparent',
                  color: mode === 'login' ? 'var(--primary-800)' : 'var(--text-muted)',
                  fontWeight: 800,
                  fontSize: '0.825rem',
                  border: 'none',
                  padding: '0.45rem 1.1rem',
                  borderRadius: 'var(--radius-full)',
                  cursor: 'pointer',
                  boxShadow: mode === 'login' ? 'var(--shadow-xs)' : 'none'
                }}
              >
                {isAr ? 'تسجيل الدخول' : 'Sign In'}
              </button>
              <button
                type="button"
                onClick={() => { setMode('register'); setError(null); }}
                style={{
                  background: mode === 'register' ? '#FFFFFF' : 'transparent',
                  color: mode === 'register' ? 'var(--primary-800)' : 'var(--text-muted)',
                  fontWeight: 800,
                  fontSize: '0.825rem',
                  border: 'none',
                  padding: '0.45rem 1.1rem',
                  borderRadius: 'var(--radius-full)',
                  cursor: 'pointer',
                  boxShadow: mode === 'register' ? 'var(--shadow-xs)' : 'none'
                }}
              >
                {isAr ? 'حساب جديد' : 'New Account'}
              </button>
            </div>

            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '0.25rem' }}
            >
              <X size={20} />
            </button>
          </div>

          <h3 style={{ fontSize: '1.25rem', fontWeight: 900, marginBottom: '0.35rem', color: 'var(--text-title)' }}>
            {isAr 
              ? (mode === 'login' ? 'مرحباً بك مجدداً في المنصة' : 'أنشئ حسابك وانضم للتقويم الذكي')
              : (mode === 'login' ? 'Welcome Back to the Platform' : 'Create Your Student Account')}
          </h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
            {isAr
              ? (mode === 'login'
                  ? 'أدخل بيانات حساب الطالب للمتابعة واستكمال التقييمات.'
                  : 'حدد صفك ومدرستك لربط حسابك بالمناهج المخصصة لصفك حصرياً.')
              : (mode === 'login'
                  ? 'Enter your student credentials to resume your assessments.'
                  : 'Select your grade and school to access your tailored curriculum.')}
          </p>

          {error && (
            <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#DC2626', padding: '0.75rem', borderRadius: 'var(--radius-md)', fontSize: '0.825rem', marginBottom: '1rem', fontWeight: 700 }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {mode === 'register' && (
              <div className="form-group">
                <label className="form-label">{isAr ? 'الاسم ثلاثي للطالب' : 'Student Full Name'}</label>
                <input
                  type="text"
                  required
                  className="form-input"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  placeholder={isAr ? 'محمد أحمد إبراهيم' : 'e.g. Ahmed Mohamed Ali'}
                />
              </div>
            )}

            <div className="form-group">
              <label className="form-label">{isAr ? 'البريد الإلكتروني' : 'Email Address'}</label>
              <div style={{ position: 'relative' }}>
                <input
                  type="email"
                  required
                  className="form-input"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="student@edu.eg"
                  style={{ [isAr ? 'paddingRight' : 'paddingLeft']: '2.5rem', [isAr ? 'paddingLeft' : 'paddingRight']: '1rem' }}
                />
                <Mail 
                  size={16} 
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

            <div className="form-group">
              <label className="form-label">{isAr ? 'كلمة المرور' : 'Password'}</label>
              <div style={{ position: 'relative' }}>
                <input
                  type="password"
                  required
                  className="form-input"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  style={{ [isAr ? 'paddingRight' : 'paddingLeft']: '2.5rem', [isAr ? 'paddingLeft' : 'paddingRight']: '1rem' }}
                />
                <Lock 
                  size={16} 
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

            {/* Registration Specific Selectors */}
            {mode === 'register' && (
              <>
                <div className="responsive-form-grid-2">
                  <div className="form-group">
                    <label className="form-label">{isAr ? 'المرحلة الدراسية' : 'Academic Stage'}</label>
                    <select
                      className="form-select"
                      value={academicStageId}
                      onChange={e => setAcademicStageId(e.target.value)}
                    >
                      {stages.map(s => <option key={s.id} value={s.id}>{isAr ? s.name_ar : (s.name_en || s.name_ar)}</option>)}
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">{isAr ? 'الصف الدراسي' : 'Grade Level'}</label>
                    <select
                      className="form-select"
                      value={gradeId}
                      onChange={e => setGradeId(e.target.value)}
                    >
                      {availableGrades.map((g: any) => <option key={g.id} value={g.id}>{isAr ? g.name_ar : (g.name_en || g.name_ar)}</option>)}
                    </select>
                  </div>
                </div>

                <div className="responsive-form-grid-2">
                  <div className="form-group">
                    <label className="form-label">{isAr ? 'نوع المدرسة' : 'School Type'}</label>
                    <select
                      className="form-select"
                      value={schoolType}
                      onChange={e => setSchoolType(e.target.value as any)}
                    >
                      <option value="عربي">{isAr ? 'مدارس عربي (حكومي / خاص)' : 'Arabic Curriculum Schools'}</option>
                      <option value="لغات">{isAr ? 'مدارس لغات (تجريبي / متميز / دولي)' : 'Language & International Schools'}</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">{isAr ? 'اسم المدرسة (اختياري)' : 'School Name (Optional)'}</label>
                    <input
                      type="text"
                      className="form-input"
                      value={schoolName}
                      onChange={e => setSchoolName(e.target.value)}
                      placeholder={isAr ? 'مدرسة النيل الحديثة' : 'e.g. Nile Modern School'}
                    />
                  </div>
                </div>

                {/* Secondary Divisions if Secondary Stage */}
                {isSecondaryStage && (
                  <div className="form-group" style={{ background: 'var(--bg-subtle)', padding: '0.85rem', borderRadius: 'var(--radius-md)' }}>
                    <label className="form-label" style={{ fontWeight: 800 }}>{isAr ? 'الشعبة والتخصص الأكاديمي' : 'Academic Track & Specialization'}</label>
                    <div style={{ display: 'flex', gap: '1rem', marginTop: '0.35rem' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer' }}>
                        <input type="radio" name="sec_sec" checked={section === 'علمي'} onChange={() => setSection('علمي')} />
                        <span>{isAr ? 'شعبة علمي' : 'Scientific Track'}</span>
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer' }}>
                        <input type="radio" name="sec_sec" checked={section === 'أدبي'} onChange={() => setSection('أدبي')} />
                        <span>{isAr ? 'شعبة أدبي' : 'Literary Track'}</span>
                      </label>
                    </div>

                    {isSec2Or3 && section === 'علمي' && (
                      <div style={{ display: 'flex', gap: '1rem', marginTop: '0.75rem', paddingTop: '0.5rem', borderTop: '1px dashed var(--border-light)' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer' }}>
                          <input type="radio" name="sec_sub" checked={secondarySubDivision === 'علمي علوم'} onChange={() => setSecondarySubDivision('علمي علوم')} />
                          <span>{isAr ? 'علمي علوم' : 'Science & Biology'}</span>
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer' }}>
                          <input type="radio" name="sec_sub" checked={secondarySubDivision === 'علمي رياضة'} onChange={() => setSecondarySubDivision('علمي رياضة')} />
                          <span>{isAr ? 'علمي رياضة' : 'Math & Engineering'}</span>
                        </label>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            <button
              type="submit"
              className="btn btn-primary btn-lg"
              disabled={isLoading}
              style={{ width: '100%', marginTop: '0.5rem', fontWeight: 800 }}
            >
              {isLoading
                ? (isAr ? 'جاري التحقق والمصادقة...' : 'Authenticating...')
                : (mode === 'login' ? (isAr ? 'دخول لوحة التعلم' : 'Sign In to Learning Studio') : (isAr ? 'تأكيد إنشاء الحساب' : 'Confirm & Create Account'))}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
