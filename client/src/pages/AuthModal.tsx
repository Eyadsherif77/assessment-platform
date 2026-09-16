import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { X, User, GraduationCap, Sparkles } from 'lucide-react';
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
  const { login, t, language } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [role, setRole] = useState<'STUDENT' | 'TEACHER'>('STUDENT');

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
  const [specialization, setSpecialization] = useState('');

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
              setAcademicStageId(data[1]?.id || data[0]?.id); // Default to Preparatory if available
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
        payload.role = role;
        payload.fullName = fullName.trim();
        if (role === 'STUDENT') {
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
        } else {
          payload.specialization = specialization;
          payload.schoolName = schoolName;
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

  const handleQuickDemoLogin = async (demoEmail: string) => {
    setError(null);
    setIsLoading(true);
    try {
      const res = await fetch(apiUrl('/api/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: demoEmail, password: '123456' })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل تسجيل الدخول التجريبي');
      login(data.token, data.user);
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 100,
      backgroundColor: 'rgba(15, 23, 42, 0.65)',
      backdropFilter: 'blur(6px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '0.5rem'
    }}>
      <div 
        className="card auth-modal-card" 
        style={{
          width: '100%',
          maxWidth: '520px',
          maxHeight: '94vh',
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          position: 'relative',
          padding: '1.5rem 1.25rem',
          borderRadius: 'var(--radius-xl)'
        }}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            position: 'absolute',
            top: '0.85rem',
            left: language === 'ar' ? '0.85rem' : 'auto',
            right: language === 'en' ? '0.85rem' : 'auto',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-muted)',
            padding: '0.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: '40px',
            minHeight: '40px',
            borderRadius: '50%'
          }}
        >
          <X size={22} />
        </button>

        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--primary-700)' }}>
            {mode === 'login' ? t.loginTitle : t.registerTitle}
          </h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            {t.brandTagline}
          </p>
        </div>

        {/* Quick Demo Logins Box */}
        <div style={{
          background: 'var(--primary-50)',
          border: '1px solid var(--primary-200)',
          borderRadius: 'var(--radius-md)',
          padding: '1rem',
          marginBottom: '1.5rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, fontSize: '0.85rem', color: 'var(--primary-800)', marginBottom: '0.5rem' }}>
            <Sparkles size={16} />
            <span>{language === 'ar' ? 'تجربة سريعة بنقرة واحدة (Demo Access):' : 'Instant One-Click Demo Access:'}</span>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button 
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ flex: 1, fontSize: '0.8rem', background: '#FFFFFF' }}
              onClick={() => handleQuickDemoLogin('student@edu.eg')}
            >
              👨‍🎓 {language === 'ar' ? 'طالب (الصف الأول الإعدادي)' : 'Student (Prep 1)'}
            </button>
            <button 
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ flex: 1, fontSize: '0.8rem', background: '#FFFFFF' }}
              onClick={() => handleQuickDemoLogin('teacher@edu.eg')}
            >
              👩‍🏫 {language === 'ar' ? 'معلم (مادة العلوم)' : 'Teacher (Science)'}
            </button>
          </div>
        </div>

        {error && (
          <div style={{
            background: 'var(--danger-50)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            color: 'var(--danger-600)',
            padding: '0.75rem 1rem',
            borderRadius: 'var(--radius-md)',
            fontSize: '0.875rem',
            marginBottom: '1.25rem'
          }}>
            {error}
          </div>
        )}

        {/* Tab switch between Login and Register */}
        <div style={{ display: 'flex', borderBottom: '2px solid var(--border-light)', marginBottom: '1.5rem' }}>
          <button
            type="button"
            className={`tab-btn ${mode === 'login' ? 'active' : ''}`}
            style={{ flex: 1, textAlign: 'center' }}
            onClick={() => { setMode('login'); setError(null); }}
          >
            {t.login}
          </button>
          <button
            type="button"
            className={`tab-btn ${mode === 'register' ? 'active' : ''}`}
            style={{ flex: 1, textAlign: 'center' }}
            onClick={() => { setMode('register'); setError(null); }}
          >
            {t.register}
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {mode === 'register' && (
            <>
              {/* Role Toggle */}
              <div className="form-group">
                <label className="form-label">{t.accountTypeLabel}</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <button
                    type="button"
                    className={`btn ${role === 'STUDENT' ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => setRole('STUDENT')}
                    style={{ padding: '0.65rem' }}
                  >
                    <GraduationCap size={18} />
                    <span>{t.studentRole}</span>
                  </button>
                  <button
                    type="button"
                    className={`btn ${role === 'TEACHER' ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => setRole('TEACHER')}
                    style={{ padding: '0.65rem' }}
                  >
                    <User size={18} />
                    <span>{t.teacherRole}</span>
                  </button>
                </div>
              </div>

              {/* Full Name */}
              <div className="form-group">
                <label className="form-label">{t.fullNameLabel}</label>
                <input
                  type="text"
                  required
                  className="form-input"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder={language === 'ar' ? 'أحمد محمد إبراهيم' : 'Full Name'}
                />
              </div>

              {/* Student Specific Fields: Stage & Grade */}
              {role === 'STUDENT' && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <div className="form-group">
                      <label className="form-label">{t.selectStage}</label>
                      <select
                        className="form-select"
                        value={academicStageId}
                        onChange={(e) => setAcademicStageId(e.target.value)}
                        required
                      >
                        {stages.map((stage: any) => (
                          <option key={stage.id} value={stage.id}>
                            {language === 'ar' ? stage.name_ar : stage.name_en}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="form-label">{t.selectGrade}</label>
                      <select
                        className="form-select"
                        value={gradeId}
                        onChange={(e) => setGradeId(e.target.value)}
                        required
                      >
                        {availableGrades.map((g: any) => (
                          <option key={g.id} value={g.id}>
                            {language === 'ar' ? g.name_ar : g.name_en}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Secondary Stage Division Selector */}
                  {isSecondaryStage && (
                    <div style={{
                      background: 'var(--primary-50)',
                      border: '1.5px solid var(--primary-200)',
                      borderRadius: 'var(--radius-md)',
                      padding: '0.85rem 1rem',
                      marginBottom: '1rem'
                    }}>
                      <div style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--primary-800)', marginBottom: '0.5rem' }}>
                        🎯 {language === 'ar' ? 'تحديد الشعبة للمرحلة الثانوية:' : 'Secondary Division:'}
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: isSec2Or3 && section === 'علمي' ? '1fr 1fr' : '1fr', gap: '0.75rem' }}>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label className="form-label" style={{ fontSize: '0.8rem' }}>
                            {language === 'ar' ? 'الشعبة' : 'Track'}
                          </label>
                          <select
                            className="form-select"
                            value={section}
                            onChange={(e) => setSection(e.target.value)}
                          >
                            <option value="علمي">{language === 'ar' ? 'الشعبة العلمية (علمي)' : 'Scientific'}</option>
                            <option value="أدبي">{language === 'ar' ? 'الشعبة الأدبية (أدبي)' : 'Literary'}</option>
                          </select>
                        </div>

                        {isSec2Or3 && section === 'علمي' && (
                          <div className="form-group" style={{ marginBottom: 0 }}>
                            <label className="form-label" style={{ fontSize: '0.8rem' }}>
                              {language === 'ar' ? 'تخصص الشعبة العلمية' : 'Science Branch'}
                            </label>
                            <select
                              className="form-select"
                              value={secondarySubDivision}
                              onChange={(e) => setSecondarySubDivision(e.target.value as any)}
                            >
                              <option value="علمي علوم">{language === 'ar' ? 'علمي علوم' : 'Science (Biology)'}</option>
                              <option value="علمي رياضة">{language === 'ar' ? 'علمي رياضة' : 'Math (Engineering)'}</option>
                            </select>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* School Type (عربي / لغات) */}
                  <div className="form-group">
                    <label className="form-label">{language === 'ar' ? 'نوع المدرسة' : 'School Curriculum Type'}</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                      <button
                        type="button"
                        className={`btn ${schoolType === 'عربي' ? 'btn-primary' : 'btn-outline'}`}
                        onClick={() => setSchoolType('عربي')}
                        style={{ padding: '0.6rem 0.5rem', fontSize: '0.85rem' }}
                      >
                        🏫 {language === 'ar' ? 'مدارس عربي' : 'Arabic School'}
                      </button>
                      <button
                        type="button"
                        className={`btn ${schoolType === 'لغات' ? 'btn-primary' : 'btn-outline'}`}
                        onClick={() => setSchoolType('لغات')}
                        style={{ padding: '0.6rem 0.5rem', fontSize: '0.85rem' }}
                      >
                        🌐 {language === 'ar' ? 'مدارس لغات' : 'Language School'}
                      </button>
                    </div>
                  </div>

                  {/* School name */}
                  <div className="form-group">
                    <label className="form-label">{t.selectSchool}</label>
                    <input
                      type="text"
                      className="form-input"
                      value={schoolName}
                      onChange={(e) => setSchoolName(e.target.value)}
                      placeholder={language === 'ar' ? 'اسم المدرسة (اختياري)' : 'School Name (optional)'}
                    />
                  </div>
                </>
              )}

              {/* Teacher Specific Fields */}
              {role === 'TEACHER' && (
                <>
                  <div className="form-group">
                    <label className="form-label">{t.specializationLabel}</label>
                    <input
                      type="text"
                      className="form-input"
                      value={specialization}
                      onChange={(e) => setSpecialization(e.target.value)}
                      placeholder={language === 'ar' ? 'معلم أول مادة العلوم' : 'Specialization'}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">{t.selectSchool}</label>
                    <input
                      type="text"
                      className="form-input"
                      value={schoolName}
                      onChange={(e) => setSchoolName(e.target.value)}
                      placeholder={language === 'ar' ? 'مدرسة النيل الحديثة' : 'School Name'}
                    />
                  </div>
                </>
              )}
            </>
          )}

          {/* Email */}
          <div className="form-group">
            <label className="form-label">{t.emailLabel}</label>
            <input
              type="email"
              required
              className="form-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
            />
          </div>

          {/* Password */}
          <div className="form-group">
            <label className="form-label">{t.passwordLabel}</label>
            <input
              type="password"
              required
              className="form-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="btn btn-primary btn-lg"
            style={{ width: '100%', marginTop: '0.75rem' }}
          >
            {isLoading ? (language === 'ar' ? 'جاري المعالجة...' : 'Processing...') : (mode === 'login' ? t.submitLogin : t.submitRegister)}
          </button>
        </form>
      </div>
    </div>
  );
};
