import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { usePlatformSettings } from '../context/PlatformSettingsContext';
import { X, Lock, Mail, User, School, MapPin, GraduationCap, Eye, EyeOff } from 'lucide-react';
import { apiUrl } from '../utils/api';
import { getDeviceId } from '../utils/device';

interface AuthModalProps {
  isOpen: boolean;
  initialMode: 'login' | 'register';
  onClose: () => void;
  onSuccess: () => void;
}

const EGYPT_GOVERNORATES = [
  'القاهرة', 'الجيزة', 'الإسكندرية', 'الدقهلية', 'البحر الأحمر', 
  'البحيرة', 'الفيوم', 'الغربية', 'الإسماعيلية', 'المنوفية', 
  'المنيا', 'القليوبية', 'الوادي الجديد', 'السويس', 'أسوان', 
  'أسيوط', 'بني سويف', 'بورسعيد', 'دمياط', 'الشرقية', 
  'جنوب سيناء', 'كفر الشيخ', 'مطروح', 'الأقصر', 'قنا', 
  'شمال سيناء', 'سوهاج'
];

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  initialMode,
  onClose,
  onSuccess
}) => {
  const { user, login, language } = useAuth();
  const { platformLogo, allowStudentRegistration } = usePlatformSettings();
  const isAr = language === 'ar';

  const [mode, setMode] = useState<'login' | 'register'>(initialMode);

  // Form Fields strictly per requirements:
  // 1. نوع التعليم (عربى / لغات)
  const [educationType, setEducationType] = useState<'عربى' | 'لغات'>('عربى');
  // 2. إسم المحافظة (all in Egypt)
  const [governorate, setGovernorate] = useState<string>('القاهرة');
  // 3. الفصل الدراسى (الاول / التانى)
  const [term] = useState<'الاول' | 'التانى'>('الاول');
  // 4. إسم المدرسة
  const [schoolName, setSchoolName] = useState<string>('');
  // 5. email or code
  const [email, setEmail] = useState<string>('');
  // 7. username
  const [username, setUsername] = useState<string>('');
  // 8. password
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);

  const [gradesList, setGradesList] = useState<any[]>([]);
  const [selectedGradeId, setSelectedGradeId] = useState<string>('');

  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [registeredCode, setRegisteredCode] = useState<string | null>(null);

  useEffect(() => {
    fetch(apiUrl('/api/meta/grades'))
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setGradesList(data);
          const prep1 = data.find((g: any) => g.name_ar?.includes('الأول الإعدادي') || g.code?.toLowerCase().includes('prep1'));
          setSelectedGradeId(prep1 ? prep1.id : data[0].id);
        }
      })
      .catch(console.error);
  }, []);

  const resetForm = () => {
    setEmail('');
    setPassword('');
    setUsername('');
    setError(null);
  };

  // Reset fields on modal open or when user logs out
  useEffect(() => {
    if (isOpen || !user) {
      setMode(initialMode);
      setRegisteredCode(null);
      resetForm();
    }
  }, [initialMode, isOpen, user]);

  const handleClose = () => {
    resetForm();
    onClose();
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      if (mode === 'register') {
        if (!email.trim() || !password || !username.trim()) {
          throw new Error(isAr ? 'يرجى ملء البريد الإلكتروني واسم المستخدم وكلمة المرور' : 'Please fill in email, username, and password');
        }

        const chosenGrade = gradesList.find(g => g.id === selectedGradeId) || gradesList[0];
        const payload = {
          role: 'STUDENT',
          educationType,
          governorate,
          term,
          schoolName: schoolName.trim() || (isAr ? 'المدرسة الرسمية' : 'Official School'),
          email: email.trim(),
          username: username.trim(),
          password,
          academicStageId: chosenGrade?.stage_id || '61998777-4c5f-4e51-bc0a-38de938c842a',
          gradeId: chosenGrade?.id || '2f0f4f5a-7c5c-4136-a935-33c79effca3d',
          device_id: getDeviceId(),
          deviceId: getDeviceId()
        };

        const res = await fetch(apiUrl('/api/auth/register'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || (isAr ? 'حدث خطأ أثناء إنشاء الحساب' : 'Registration failed'));
        }

        login(data.token, data.user);
        // Show success screen with the student code before closing
        const code = data.user?.super_id || data.user?.profile?.student_code || null;
        if (code) {
          setRegisteredCode(code);
        } else {
          onSuccess();
          handleClose();
        }
      } else {
        // Login mode
        if (!email.trim() || !password) {
          throw new Error(isAr ? 'الرجاء إدخال البريد الإلكتروني أو اسم المستخدم أو الكود وكلمة المرور' : 'Please enter credentials');
        }

        const deviceId = getDeviceId();
        const res = await fetch(apiUrl('/api/auth/login'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: email.trim(),
            password,
            device_id: deviceId,
            deviceId: deviceId
          })
        });

        const data = await res.json();
        if (!res.ok) {
          if (data.code === 'DEVICE_LIMIT_EXCEEDED' || data.error?.includes('الحد الأقصى للأجهزة') || data.error === 'DEVICE_LIMIT_EXCEEDED') {
            throw new Error(data.error || data.message || (isAr 
              ? 'عذراً، لقد تجاوزت الحد الأقصى للأجهزة المسموح بها لهذا الحساب (جهازان فقط). يُرجى تسجيل الخروج من جهازك السابق أو مراجعة إدارة المنصة.' 
              : 'Maximum active devices limit reached (max 2 devices). Please logout from other devices or contact support.'));
          }
          throw new Error(data.error || (isAr ? 'البيانات غير صحيحة' : 'Invalid credentials'));
        }

        login(data.token, data.user);
        resetForm();
        onSuccess();
        onClose();
      }
    } catch (err: any) {
      setError(err.message || (isAr ? 'حدث خطأ غير متوقع' : 'An error occurred'));
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

        {/* ============================================================
            SUCCESS SCREEN: Show student code after registration
            ============================================================ */}
        {registeredCode && (
          <div style={{
            position: 'absolute',
            inset: 0,
            zIndex: 50,
            background: 'linear-gradient(135deg, #0F172A 0%, #1E3A8A 60%, #1D4ED8 100%)',
            borderRadius: 'inherit',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2.5rem 2rem',
            textAlign: 'center',
            gap: '1.25rem'
          }}>
            {/* Celebration */}
            <div style={{ fontSize: '3.5rem', lineHeight: 1 }}>🎉</div>

            <h2 style={{ fontSize: '1.6rem', fontWeight: 900, color: '#FFFFFF', margin: 0, lineHeight: 1.3 }}>
              {isAr ? 'تم إنشاء حسابك بنجاح!' : 'Account Created Successfully!'}
            </h2>

            <p style={{ fontSize: '0.9rem', color: '#CBD5E1', margin: 0, lineHeight: 1.6, maxWidth: '360px' }}>
              {isAr
                ? 'هذا هو كود الطالب الخاص بك. احتفظ به جيداً، فهو رقمك التعريفي الدائم في المنصة.'
                : 'This is your unique student code. Keep it safe — it is your permanent ID on this platform.'}
            </p>

            {/* The Code Box */}
            <div style={{
              background: 'rgba(255, 255, 255, 0.12)',
              border: '2px solid rgba(255, 255, 255, 0.35)',
              borderRadius: 'var(--radius-xl)',
              padding: '1.25rem 2.5rem',
              backdropFilter: 'blur(8px)',
              width: '100%',
              maxWidth: '320px'
            }}>
              <div style={{ fontSize: '0.75rem', color: '#94A3B8', fontWeight: 700, marginBottom: '0.5rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                {isAr ? 'كود الطالب التعريفي' : 'Your Student Code'}
              </div>
              <div style={{
                fontSize: '2.25rem',
                fontWeight: 900,
                color: '#FFFFFF',
                letterSpacing: '0.05em',
                fontFamily: 'monospace'
              }}>
                {registeredCode}
              </div>
            </div>

            <p style={{ fontSize: '0.78rem', color: '#64748B', margin: 0 }}>
              {isAr ? '⚠️ دوّن هذا الكود الآن قبل المتابعة' : '⚠️ Write down this code before continuing'}
            </p>

            {/* CTA Button */}
            <button
              onClick={() => { onSuccess(); handleClose(); }}
              style={{
                marginTop: '0.5rem',
                background: 'linear-gradient(135deg, #3B82F6, #1D4ED8)',
                color: '#FFFFFF',
                fontWeight: 900,
                fontSize: '1.05rem',
                padding: '0.9rem 2.5rem',
                borderRadius: 'var(--radius-full)',
                border: 'none',
                cursor: 'pointer',
                boxShadow: '0 8px 24px rgba(29, 78, 216, 0.5)',
                transition: 'all 0.2s ease',
                width: '100%',
                maxWidth: '320px'
              }}
            >
              {isAr ? 'الدخول للمنصة 🚀' : 'Enter Platform 🚀'}
            </button>
          </div>
        )}
        {/* Floating Close Button */}
        <button
          type="button"
          onClick={handleClose}
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

        {/* LEFT PANEL: OFFICIAL EMBLEM LOGO */}
        <div className="auth-visual-panel" style={{
          background: '#FFFFFF',
          padding: '1.25rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRight: isAr ? 'none' : '1px solid var(--border-light)',
          borderLeft: isAr ? '1px solid var(--border-light)' : 'none',
          overflow: 'hidden'
        }}>
          <img
            src={platformLogo || '/farabi-logo.png'}
            alt={isAr ? 'مدرسة الفارابي | Farabi School' : 'Farabi School Logo'}
            style={{
              width: '100%',
              height: '100%',
              maxHeight: '520px',
              objectFit: 'contain',
              display: 'block'
            }}
          />
        </div>

        {/* RIGHT PANEL: AUTHENTICATION FORM */}
        <div className="auth-form-panel">
          {/* Mode Switcher Tabs */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
            <div style={{
              display: 'inline-flex',
              background: 'var(--bg-subtle)',
              padding: '0.25rem',
              borderRadius: 'var(--radius-full)',
              border: '1px solid var(--border-light)'
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
              {allowStudentRegistration ? (
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
              ) : (
                <span style={{ fontSize: '0.75rem', color: '#DC2626', padding: '0.45rem 0.75rem', fontWeight: 800 }}>
                  {isAr ? 'التسجيل مغلق' : 'Registration Closed'}
                </span>
              )}
            </div>
          </div>

          {/* New Logo Card in Create Account */}
          {mode === 'register' && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.85rem',
              marginBottom: '1rem',
              background: '#F8FAFC',
              padding: '0.65rem 0.9rem',
              borderRadius: 'var(--radius-lg)',
              border: '1.5px solid #E2E8F0'
            }}>
              <img 
                src={platformLogo || '/farabi-logo.png'} 
                alt="Farabi School Logo" 
                style={{ width: '46px', height: '46px', objectFit: 'contain', borderRadius: '50%', background: '#FFFFFF', border: '1px solid #CBD5E1', padding: '2px', flexShrink: 0 }} 
              />
              <div>
                <div style={{ fontWeight: 900, color: '#1E293B', fontSize: '0.925rem' }}>
                  {isAr ? 'مدرسة الفارابي | Farabi School' : 'Farabi School'}
                </div>
              </div>
            </div>
          )}

          <h3 style={{ fontSize: '1.25rem', fontWeight: 900, marginBottom: '1.25rem', color: 'var(--text-title)' }}>
            {isAr 
              ? (mode === 'login' ? 'مرحباً بك مجدداً في منصة التقييم من أجل التعلم' : 'إنشاء حساب جديد (الطلاب)')
              : (mode === 'login' ? 'Welcome Back to Assessment Platform' : 'Student Account Registration')}
          </h3>

          {mode === 'register' && !allowStudentRegistration && (
            <div style={{
              background: '#FEF2F2',
              border: '1.5px solid #F87171',
              color: '#991B1B',
              padding: '0.85rem 1rem',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.85rem',
              fontWeight: 800,
              marginBottom: '1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              lineHeight: 1.5
            }}>
              <span style={{ fontSize: '1.4rem' }}>🔒</span>
              <div>
                {isAr
                  ? 'تم قفل إنشاء الحساب الذاتي للطلاب بقرار الإدارة. يتم استلام بيانات الحساب (اسم المستخدم وكلمة المرور) حصرياً من مشرف المحافظة أو إدارة المدرسة.'
                  : 'Student self-registration is currently closed by administration. Login credentials are provided exclusively by the school / governorate supervisor.'}
              </div>
            </div>
          )}

          {error && (
            <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#DC2626', padding: '0.75rem', borderRadius: 'var(--radius-md)', fontSize: '0.825rem', marginBottom: '1rem', fontWeight: 700 }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} autoComplete="off" style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
            {mode === 'register' ? (
              <>
                {/* 1. نوع التعليم (عربى / لغات) */}
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 800 }}>
                    <GraduationCap size={15} style={{ display: 'inline', marginInlineEnd: '4px' }} />
                    {isAr ? 'نوع التعليم' : 'Education Type'}
                  </label>
                  <select
                    className="form-select"
                    disabled={!allowStudentRegistration}
                    value={educationType}
                    onChange={e => setEducationType(e.target.value as any)}
                    style={{
                      opacity: !allowStudentRegistration ? 0.7 : 1,
                      cursor: !allowStudentRegistration ? 'not-allowed' : 'pointer',
                      backgroundColor: !allowStudentRegistration ? '#F8FAFC' : '#FFFFFF'
                    }}
                  >
                    <option value="عربى">{isAr ? 'عربى' : 'Arabic'}</option>
                    <option value="لغات">{isAr ? 'لغات' : 'Languages'}</option>
                  </select>
                </div>

                {/* 2. إسم المحافظة (all in Egypt) */}
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 800 }}>
                    <MapPin size={15} style={{ display: 'inline', marginInlineEnd: '4px' }} />
                    {isAr ? 'إسم المحافظة' : 'Governorate'}
                  </label>
                  <select
                    className="form-select"
                    disabled={!allowStudentRegistration}
                    value={governorate}
                    onChange={e => setGovernorate(e.target.value)}
                    style={{
                      opacity: !allowStudentRegistration ? 0.7 : 1,
                      cursor: !allowStudentRegistration ? 'not-allowed' : 'pointer',
                      backgroundColor: !allowStudentRegistration ? '#F8FAFC' : '#FFFFFF'
                    }}
                  >
                    {EGYPT_GOVERNORATES.map(gov => (
                      <option key={gov} value={gov}>{gov}</option>
                    ))}
                  </select>
                </div>

                {/* 3. الصف الدراسى – Dynamic grades */}
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 800 }}>
                    <GraduationCap size={15} style={{ display: 'inline', marginInlineEnd: '4px' }} />
                    {isAr ? 'الصف الدراسى' : 'School Grade'}
                  </label>
                  <select
                    className="form-select"
                    disabled={!allowStudentRegistration}
                    value={selectedGradeId}
                    onChange={e => setSelectedGradeId(e.target.value)}
                    style={{
                      fontWeight: 700,
                      color: 'var(--primary-700)',
                      border: '2px solid var(--primary-300)',
                      opacity: !allowStudentRegistration ? 0.7 : 1,
                      cursor: !allowStudentRegistration ? 'not-allowed' : 'pointer',
                      backgroundColor: !allowStudentRegistration ? '#F8FAFC' : '#FFFFFF'
                    }}
                  >
                    {gradesList.length > 0 ? (
                      gradesList.map((g: any) => (
                        <option key={g.id} value={g.id}>
                          📚 {isAr ? `${g.stage_name_ar || ''} - ${g.name_ar}` : `${g.stage_name_en || ''} - ${g.name_en}`}
                        </option>
                      ))
                    ) : (
                      <option value="2f0f4f5a-7c5c-4136-a935-33c79effca3d">
                        📘 {isAr ? 'المرحلة الإعدادية - الصف الأول الإعدادي' : 'Prep 1'}
                      </option>
                    )}
                  </select>
                </div>

                {/* 4. إسم المدرسة */}
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 800 }}>
                    <School size={15} style={{ display: 'inline', marginInlineEnd: '4px' }} />
                    {isAr ? 'إسم المدرسة' : 'School Name'}
                  </label>
                  <input
                    type="text"
                    disabled={!allowStudentRegistration}
                    className="form-input"
                    value={schoolName}
                    onChange={(e) => setSchoolName(e.target.value)}
                    placeholder={isAr ? 'أدخل اسم مدرستك' : 'Official School'}
                    style={{
                      opacity: !allowStudentRegistration ? 0.7 : 1,
                      cursor: !allowStudentRegistration ? 'not-allowed' : 'auto',
                      backgroundColor: !allowStudentRegistration ? '#F8FAFC' : '#FFFFFF'
                    }}
                  />
                </div>
                     {/* 5. email */}
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 800 }}>
                    {isAr ? 'البريد الإلكتروني (email)' : 'Email Address'}
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="email"
                      required
                      disabled={!allowStudentRegistration}
                      className="form-input"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="student@school.edu.eg"
                      style={{
                        [isAr ? 'paddingRight' : 'paddingLeft']: '2.5rem',
                        [isAr ? 'paddingLeft' : 'paddingRight']: '1rem',
                        opacity: !allowStudentRegistration ? 0.7 : 1,
                        cursor: !allowStudentRegistration ? 'not-allowed' : 'auto',
                        backgroundColor: !allowStudentRegistration ? '#F8FAFC' : '#FFFFFF'
                      }}
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

                {/* 6. username */}
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 800 }}>
                    <User size={15} style={{ display: 'inline', marginInlineEnd: '4px' }} />
                    {isAr ? 'اسم المستخدم (username)' : 'Username'}
                  </label>
                  <input
                    type="text"
                    required
                    disabled={!allowStudentRegistration}
                    className="form-input"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    placeholder={isAr ? 'اسم المستخدم للدخول' : 'Student username'}
                    style={{
                      opacity: !allowStudentRegistration ? 0.7 : 1,
                      cursor: !allowStudentRegistration ? 'not-allowed' : 'auto',
                      backgroundColor: !allowStudentRegistration ? '#F8FAFC' : '#FFFFFF'
                    }}
                  />
                </div>

                {/* 7. password */}
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 800 }}>
                    {isAr ? 'كلمة المرور (password)' : 'Password'}
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      disabled={!allowStudentRegistration}
                      className="form-input"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="••••••••"
                      style={{
                        paddingRight: '2.5rem',
                        paddingLeft: '2.5rem',
                        opacity: !allowStudentRegistration ? 0.7 : 1,
                        cursor: !allowStudentRegistration ? 'not-allowed' : 'auto',
                        backgroundColor: !allowStudentRegistration ? '#F8FAFC' : '#FFFFFF'
                      }}
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
                    <button
                      type="button"
                      onClick={() => setShowPassword(prev => !prev)}
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
                        color: showPassword ? 'var(--color-primary)' : 'var(--text-muted)'
                      }}
                      title={showPassword ? (isAr ? 'إخفاء كلمة المرور' : 'Hide password') : (isAr ? 'إظهار كلمة المرور' : 'Show password')}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              /* LOGIN MODE */
              <>
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 800 }}>
                    {isAr ? 'البريد الإلكتروني أو اسم المستخدم أو الكود التعريفي' : 'Email, Username or ID Code'}
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="text"
                      required
                      autoComplete="off"
                      className="form-input"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder={isAr ? 'البريد الإلكتروني أو اسم المستخدم أو الكود (مثال: HYB-SUP-...)' : 'Email, username, or code'}
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
                  <label className="form-label" style={{ fontWeight: 800 }}>
                    {isAr ? 'كلمة المرور' : 'Password'}
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      autoComplete="current-password"
                      className="form-input"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="••••••••"
                      style={{ paddingRight: '2.5rem', paddingLeft: '2.5rem' }}
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
                    <button
                      type="button"
                      onClick={() => setShowPassword(prev => !prev)}
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
                        color: showPassword ? 'var(--color-primary)' : 'var(--text-muted)'
                      }}
                      title={showPassword ? (isAr ? 'إخفاء كلمة المرور' : 'Hide password') : (isAr ? 'إظهار كلمة المرور' : 'Show password')}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
              </>
            )}

            <button
              type="submit"
              className="btn btn-primary btn-lg"
              disabled={isLoading || (mode === 'register' && !allowStudentRegistration)}
              style={{
                width: '100%',
                marginTop: '0.5rem',
                fontWeight: 800,
                ...(mode === 'register' && !allowStudentRegistration ? {
                  backgroundColor: '#94A3B8',
                  borderColor: '#94A3B8',
                  cursor: 'not-allowed',
                  opacity: 0.85
                } : {})
              }}
            >
              {isLoading
                ? (isAr ? 'جاري الاتصال بقاعدة البيانات...' : 'Processing...')
                : (mode === 'login' 
                    ? (isAr ? 'تسجيل الدخول' : 'Sign In') 
                    : (allowStudentRegistration
                        ? (isAr ? 'إنشاء حساب طالب جديد' : 'Create Student Account')
                        : (isAr ? '🔒 التسجيل الذاتي مغلق (الحساب يسلم من المشرف)' : '🔒 Registration Blocked')))}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
