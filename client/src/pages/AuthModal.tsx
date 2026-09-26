import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { X, Lock, Mail, User, School, MapPin, GraduationCap } from 'lucide-react';
import { apiUrl } from '../utils/api';

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
  const { login, language } = useAuth();
  const isAr = language === 'ar';

  const [mode, setMode] = useState<'login' | 'register'>(initialMode);

  // Form Fields strictly per requirements:
  // 1. نوع التعليم (عربى / لغات)
  const [educationType, setEducationType] = useState<'عربى' | 'لغات'>('عربى');
  // 2. إسم المحافظة (all in Egypt)
  const [governorate, setGovernorate] = useState<string>('القاهرة');
  // 3. الفصل الدراسى (الاول / التانى)
  const [term, setTerm] = useState<'الاول' | 'التانى'>('الاول');
  // 4. إسم المدرسة
  const [schoolName, setSchoolName] = useState<string>('');
  // 5. email
  const [email, setEmail] = useState<string>('');
  // 7. username
  const [username, setUsername] = useState<string>('');
  // 8. password
  const [password, setPassword] = useState<string>('');

  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [registeredCode, setRegisteredCode] = useState<string | null>(null);

  useEffect(() => {
    setMode(initialMode);
    setError(null);
    setRegisteredCode(null);
  }, [initialMode, isOpen]);

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

        // Locked strictly to Prep 3
        const payload = {
          role: 'STUDENT',
          educationType,
          governorate,
          term,
          schoolName: schoolName.trim(),
          email: email.trim(),
          username: username.trim(),
          password,
          academicStageId: '61998777-4c5f-4e51-bc0a-38de938c842a', // Preparatory
          gradeId: '2f0f4f5a-7c5c-4136-a935-33c79effca3d' // Prep 3 (الصف الثالث الإعدادي)
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
          onClose();
        }
      } else {
        // Login mode
        if (!email.trim() || !password) {
          throw new Error(isAr ? 'الرجاء إدخال البريد الإلكتروني أو اسم المستخدم وكلمة المرور' : 'Please enter credentials');
        }

        const res = await fetch(apiUrl('/api/auth/login'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: email.trim(),
            password
          })
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || (isAr ? 'البيانات غير صحيحة' : 'Invalid credentials'));
        }

        login(data.token, data.user);
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
              onClick={() => { onSuccess(); onClose(); }}
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
            src="/logo.png"
            alt={isAr ? 'مدرسة الفارابي - Farabi School' : 'Farabi School Logo'}
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
              ? (mode === 'login' ? 'مرحباً بك مجدداً في مدرسة الفارابي' : 'إنشاء حساب جديد (الطلاب)')
              : (mode === 'login' ? 'Welcome Back to Farabi School' : 'Student Account Registration')}
          </h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
            {isAr
              ? (mode === 'login'
                  ? 'أدخل البريد الإلكتروني أو اسم المستخدم وكلمة المرور للمتابعة.'
                  : 'بيانات تسجيل الطالب في منصة التقييم والتعلم بمدرسة الفارابي.')
              : (mode === 'login'
                  ? 'Enter your email or username to access your learning portal.'
                  : 'Student credentials and registration details.')}
          </p>

          {mode === 'register' && (
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
                  ? 'تم قفل إنشاء الحساب الذاتي للطلاب. يتم استلام بيانات الحساب (اسم المستخدم وكلمة المرور) حصرياً من مشرف المحافظة أو إدارة المدرسة.'
                  : 'Student self-registration is closed. Login credentials are provided exclusively by the school / governorate supervisor.'}
              </div>
            </div>
          )}

          {error && (
            <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#DC2626', padding: '0.75rem', borderRadius: 'var(--radius-md)', fontSize: '0.825rem', marginBottom: '1rem', fontWeight: 700 }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
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
                    disabled={true}
                    value={educationType}
                    onChange={e => setEducationType(e.target.value as any)}
                    style={{ opacity: 0.7, cursor: 'not-allowed', backgroundColor: '#F8FAFC' }}
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
                    disabled={true}
                    value={governorate}
                    onChange={e => setGovernorate(e.target.value)}
                    style={{ opacity: 0.7, cursor: 'not-allowed', backgroundColor: '#F8FAFC' }}
                  >
                    {EGYPT_GOVERNORATES.map(gov => (
                      <option key={gov} value={gov}>{gov}</option>
                    ))}
                  </select>
                </div>

                {/* 3. الفصل الدراسى (الاول / التانى) */}
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 800 }}>
                    {isAr ? 'الفصل الدراسى' : 'Academic Term'}
                  </label>
                  <select
                    className="form-select"
                    disabled={true}
                    value={term}
                    onChange={e => setTerm(e.target.value as any)}
                    style={{ opacity: 0.7, cursor: 'not-allowed', backgroundColor: '#F8FAFC' }}
                  >
                    <option value="الاول">{isAr ? 'الاول' : 'First Term'}</option>
                    <option value="التانى">{isAr ? 'التانى' : 'Second Term'}</option>
                  </select>
                </div>

                {/* 3b. الصف الدراسى – open grades Primary 1 to Secondary 3 */}
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 800 }}>
                    <GraduationCap size={15} style={{ display: 'inline', marginInlineEnd: '4px' }} />
                    {isAr ? 'الصف الدراسى (متاح من الابتدائي 1 حتى الثانوي 3)' : 'School Grade (Primary 1 to Secondary 3)'}
                  </label>
                  <select
                    className="form-select"
                    disabled={true}
                    defaultValue="primary1"
                    style={{
                      fontWeight: 700,
                      color: 'var(--primary-700)',
                      border: '2px solid var(--primary-300)',
                      opacity: 0.7,
                      cursor: 'not-allowed',
                      backgroundColor: '#F8FAFC'
                    }}
                  >
                    {/* ── المرحلة الابتدائية ── */}
                    <optgroup label={isAr ? 'المرحلة الابتدائية' : 'Primary Education'}>
                      <option value="primary1">📚 {isAr ? 'الصف الأول الابتدائي' : 'Primary Grade 1'}</option>
                      <option value="primary2">📚 {isAr ? 'الصف الثاني الابتدائي' : 'Primary Grade 2'}</option>
                      <option value="primary3">📚 {isAr ? 'الصف الثالث الابتدائي' : 'Primary Grade 3'}</option>
                      <option value="primary4">📚 {isAr ? 'الصف الرابع الابتدائي' : 'Primary Grade 4'}</option>
                      <option value="primary5">📚 {isAr ? 'الصف الخامس الابتدائي' : 'Primary Grade 5'}</option>
                      <option value="primary6">📚 {isAr ? 'الصف السادس الابتدائي' : 'Primary Grade 6'}</option>
                    </optgroup>
                    {/* ── المرحلة الإعدادية ── */}
                    <optgroup label={isAr ? 'المرحلة الإعدادية' : 'Preparatory Education'}>
                      <option value="prep1">📘 {isAr ? 'الصف الأول الإعدادي' : 'Prep Grade 1'}</option>
                      <option value="prep2">📘 {isAr ? 'الصف الثاني الإعدادي' : 'Prep Grade 2'}</option>
                      <option value="prep3">📘 {isAr ? 'الصف الثالث الإعدادي' : 'Prep Grade 3'}</option>
                    </optgroup>
                    {/* ── المرحلة الثانوية ── */}
                    <optgroup label={isAr ? 'المرحلة الثانوية' : 'Secondary Education'}>
                      <option value="sec1">🎓 {isAr ? 'الصف الأول الثانوي' : 'Secondary Grade 1'}</option>
                      <option value="sec2">🎓 {isAr ? 'الصف الثاني الثانوي' : 'Secondary Grade 2'}</option>
                      <option value="sec3">🎓 {isAr ? 'الصف الثالث الثانوي' : 'Secondary Grade 3'}</option>
                    </optgroup>
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
                    disabled={true}
                    className="form-input"
                    value={schoolName || (isAr ? 'مدرسة الفارابي' : 'Farabi School')}
                    onChange={(e) => setSchoolName(e.target.value)}
                    readOnly
                    style={{ opacity: 0.7, cursor: 'not-allowed', backgroundColor: '#F8FAFC' }}
                  />
                </div>



                {/* 6. email */}
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 800 }}>
                    {isAr ? 'البريد الإلكتروني (email)' : 'Email Address'}
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="email"
                      disabled={true}
                      className="form-input"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="student@farabischool.edu.eg"
                      style={{ [isAr ? 'paddingRight' : 'paddingLeft']: '2.5rem', [isAr ? 'paddingLeft' : 'paddingRight']: '1rem', opacity: 0.7, cursor: 'not-allowed', backgroundColor: '#F8FAFC' }}
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

                {/* 7. username */}
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 800 }}>
                    <User size={15} style={{ display: 'inline', marginInlineEnd: '4px' }} />
                    {isAr ? 'اسم المستخدم (username)' : 'Username'}
                  </label>
                  <input
                    type="text"
                    disabled={true}
                    className="form-input"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    placeholder={isAr ? 'اسم المستخدم المسجل بالمدرسة' : 'Assigned student username'}
                    style={{ opacity: 0.7, cursor: 'not-allowed', backgroundColor: '#F8FAFC' }}
                  />
                </div>

                {/* 8. password */}
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 800 }}>
                    {isAr ? 'كلمة المرور (password)' : 'Password'}
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="password"
                      disabled={true}
                      className="form-input"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="••••••••"
                      style={{ [isAr ? 'paddingRight' : 'paddingLeft']: '2.5rem', [isAr ? 'paddingLeft' : 'paddingRight']: '1rem', opacity: 0.7, cursor: 'not-allowed', backgroundColor: '#F8FAFC' }}
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
              </>
            ) : (
              /* LOGIN MODE */
              <>
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 800 }}>
                    {isAr ? 'البريد الإلكتروني أو اسم المستخدم' : 'Email or Username'}
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="text"
                      required
                      className="form-input"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder={isAr ? 'student@farabischool.edu.eg أو اسم المستخدم' : 'email or username'}
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
              </>
            )}

            <button
              type="submit"
              className="btn btn-primary btn-lg"
              disabled={isLoading || mode === 'register'}
              style={{
                width: '100%',
                marginTop: '0.5rem',
                fontWeight: 800,
                ...(mode === 'register' ? {
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
                    : (isAr ? '🔒 التسجيل الذاتي مغلق (الحساب يسلم من المشرف)' : '🔒 Registration Blocked'))}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
