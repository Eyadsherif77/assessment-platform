import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { X, Sparkles, CheckCircle2, Lock, Mail, User, School, MapPin, Hash, GraduationCap } from 'lucide-react';
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
  // 5. كود الطالب
  const [studentCode, setStudentCode] = useState<string>('');
  // 6. email
  const [email, setEmail] = useState<string>('');
  // 7. username
  const [username, setUsername] = useState<string>('');
  // 8. password
  const [password, setPassword] = useState<string>('');

  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  useEffect(() => {
    setMode(initialMode);
    setError(null);
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
          studentCode: studentCode.trim(),
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
        onSuccess();
        onClose();
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

        {/* LEFT PANEL: EDUCATIONAL STORYTELLING */}
        <div className="auth-visual-panel">
          <div>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              background: 'rgba(255, 255, 255, 0.15)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: 'var(--radius-full)',
              padding: '0.35rem 0.85rem',
              fontSize: '0.75rem',
              fontWeight: 800,
              marginBottom: '1.25rem'
            }}>
              <Sparkles size={14} />
              <span>{isAr ? 'الصف الثالث الإعدادي • Prep 3' : '3rd Prep Curriculum 2026'}</span>
            </div>

            <h3 style={{ fontSize: '1.6rem', fontWeight: 900, lineHeight: 1.3, marginBottom: '1rem', color: '#FFFFFF' }}>
              {isAr ? 'التقييم من أجل التعلم والتشخيص الفوري' : 'Assessment for Learning & Instant Diagnostics'}
            </h3>

            <p style={{ fontSize: '0.85rem', color: '#CBD5E1', lineHeight: 1.6, marginBottom: '1.75rem' }}>
              {isAr
                ? 'انضم الآن لطلاب الصف الثالث الإعدادي واستمتع بأسئلة مشتقة 100% من كتاب الوزارة الرسمي مع إرشاد دقيق لرقم كل صفحة.'
                : 'Join 3rd Prep students with questions 100% grounded in official textbooks with precise page citations.'}
            </p>

            {/* Feature Checklist */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.825rem', color: '#F1F5F9' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <CheckCircle2 size={16} color="#34D399" />
                <span>{isAr ? 'مخصص حصرياً لمنهج الصف الثالث الإعدادي' : 'Strictly tailored for Grade 9 (Prep 3)'}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <CheckCircle2 size={16} color="#34D399" />
                <span>{isAr ? 'أسئلة معتمدة مطابقة للتقويم الوزاري' : 'Official curriculum alignment'}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <CheckCircle2 size={16} color="#34D399" />
                <span>{isAr ? 'تشخيص فوري للأخطاء وخطة مذاكرة بالصفحة' : 'Instant misconception diagnosis'}</span>
              </div>
            </div>
          </div>

          <div style={{
            marginTop: '2rem',
            paddingTop: '1.25rem',
            borderTop: '1px solid rgba(255, 255, 255, 0.15)',
            fontSize: '0.75rem',
            color: '#94A3B8'
          }}>
            {isAr ? 'منظومة التقويم الذكي المعتمدة 2026' : 'Certified AI Assessment 2026'}
          </div>
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
              ? (mode === 'login' ? 'مرحباً بك مجدداً في المنصة' : 'إنشاء حساب جديد (الصف الثالث الإعدادي)')
              : (mode === 'login' ? 'Welcome Back to the Platform' : 'Create 3rd Prep Student Account')}
          </h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
            {isAr
              ? (mode === 'login'
                  ? 'أدخل البريد الإلكتروني أو اسم المستخدم وكلمة المرور للمتابعة.'
                  : 'أدخل بيانات الطالب للتسجيل المباشر في منصة التقييم من أجل التعلم.')
              : (mode === 'login'
                  ? 'Enter your email or username to access your learning portal.'
                  : 'Fill in your student credentials to register for Prep 3.')}
          </p>

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
                    value={educationType}
                    onChange={e => setEducationType(e.target.value as any)}
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
                    value={governorate}
                    onChange={e => setGovernorate(e.target.value)}
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
                    value={term}
                    onChange={e => setTerm(e.target.value as any)}
                  >
                    <option value="الاول">{isAr ? 'الاول' : 'First Term'}</option>
                    <option value="التانى">{isAr ? 'التانى' : 'Second Term'}</option>
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
                    required
                    className="form-input"
                    value={schoolName}
                    onChange={e => setSchoolName(e.target.value)}
                    placeholder={isAr ? 'اكتب اسم المدرسة' : 'Enter school name'}
                  />
                </div>

                {/* 5. كود الطالب (مع توضيح ما يحتويه) */}
                <div className="form-group">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                    <label className="form-label" style={{ marginBottom: 0, fontWeight: 800 }}>
                      <Hash size={15} style={{ display: 'inline', marginInlineEnd: '4px' }} />
                      {isAr ? 'كود الطالب' : 'Student Code'}
                    </label>
                    <span style={{ fontSize: '0.72rem', color: 'var(--primary-600)', fontWeight: 700 }}>
                      {isAr ? 'الرقم التعريفي للطالب' : 'Student ID'}
                    </span>
                  </div>
                  <input
                    type="text"
                    required
                    className="form-input"
                    value={studentCode}
                    onChange={e => setStudentCode(e.target.value)}
                    placeholder={isAr ? 'اكتب كود الطالب التعريفي (أرقام)' : 'e.g. 10293847'}
                  />
                  <small style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginTop: '0.25rem', lineHeight: 1.4 }}>
                    {isAr 
                      ? 'كود الطالب التعريفي الموحد المسجل لدى المدرسة أو وزارة التربية والتعليم' 
                      : 'The unique student identification code registered with the school or ministry'}
                  </small>
                </div>

                {/* 6. email */}
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 800 }}>
                    {isAr ? 'البريد الإلكتروني (email)' : 'Email Address'}
                  </label>
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

                {/* 7. username */}
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 800 }}>
                    <User size={15} style={{ display: 'inline', marginInlineEnd: '4px' }} />
                    {isAr ? 'اسم المستخدم (username)' : 'Username'}
                  </label>
                  <input
                    type="text"
                    required
                    className="form-input"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    placeholder={isAr ? 'اكتب اسم مستخدم فريد للدخول به' : 'Choose unique username'}
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
                      placeholder={isAr ? 'student@edu.eg أو اسم المستخدم' : 'email or username'}
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
              disabled={isLoading}
              style={{ width: '100%', marginTop: '0.5rem', fontWeight: 800 }}
            >
              {isLoading
                ? (isAr ? 'جاري الاتصال بقاعدة البيانات...' : 'Processing...')
                : (mode === 'login' ? (isAr ? 'تسجيل الدخول' : 'Sign In') : (isAr ? 'تأكيد إنشاء الحساب' : 'Confirm & Register'))}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
