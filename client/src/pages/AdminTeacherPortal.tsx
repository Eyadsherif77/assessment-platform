import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiUrl } from '../utils/api';
import { ShieldCheck, Lock, Mail, ArrowRight, ArrowLeft, Sparkles, Shield } from 'lucide-react';

interface Props {
  onBackToHome: () => void;
}

export const AdminTeacherPortal: React.FC<Props> = ({ onBackToHome }) => {
  const { login, language } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const res = await fetch(apiUrl('/api/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'فشل تسجيل الدخول');
      }

      if (data.user.role !== 'ADMIN' && data.user.role !== 'TEACHER') {
        throw new Error(
          language === 'ar'
            ? 'هذه البوابة مخصصة حصرياً للمالك والإدارة والمعلمين. للطلاب، يرجى الدخول من المنصة الرئيسية.'
            : 'This portal is strictly reserved for Admin and Teachers. Students must use the main platform.'
        );
      }

      login(data.token, data.user);
    } catch (err: any) {
      setError(err.message || 'حدث خطأ غير متوقع');
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickDemoLogin = async (demoEmail: string) => {
    setError(null);
    setIsLoading(true);
    setEmail(demoEmail);
    setPassword('123456');

    try {
      const res = await fetch(apiUrl('/api/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: demoEmail, password: '123456' })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'فشل تسجيل الدخول');
      }

      if (data.user.role !== 'ADMIN' && data.user.role !== 'TEACHER') {
        throw new Error(
          language === 'ar'
            ? 'هذه البوابة مخصصة حصرياً للمالك والإدارة والمعلمين. للطلاب، يرجى الدخول من المنصة الرئيسية.'
            : 'This portal is strictly reserved for Admin and Teachers. Students must use the main platform.'
        );
      }

      login(data.token, data.user);
    } catch (err: any) {
      setError(err.message || 'حدث خطأ غير متوقع');
    } finally {
      setIsLoading(false);
    }
  };

  const isAr = language === 'ar';
  const ArrowIcon = isAr ? ArrowLeft : ArrowRight;

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
          maxWidth: '520px',
          padding: '2rem 1.25rem',
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
            marginBottom: '1.75rem',
            padding: 0,
            transition: 'color var(--t-fast)'
          }}
        >
          <ArrowIcon size={16} />
          <span>{isAr ? 'العودة إلى منصة الطلاب الرئيسية' : 'Return to Student Platform'}</span>
        </button>

        {/* Portal Header */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '64px',
            height: '64px',
            borderRadius: '20px',
            background: 'linear-gradient(135deg, #1E293B 0%, #0F172A 100%)',
            color: '#F8FAFC',
            marginBottom: '1.15rem',
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
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', lineHeight: 1.6, maxWidth: '420px', margin: '0 auto' }}>
            {isAr 
              ? 'تسجيل الدخول المخصص للأساتذة وإدارة النظام للتحكم في المناهج والامتحانات والصلاحيات.'
              : 'Dedicated access for educators and administrators to manage curriculum, exams, and permissions.'}
          </p>
        </div>

        {/* Demo Mode Notice & Buttons */}
        <div style={{
          background: 'linear-gradient(145deg, #F8FAFC, #F1F5F9)',
          border: '1px solid #E2E8F0',
          borderRadius: 'var(--radius-lg)',
          padding: '1.25rem 1rem',
          marginBottom: '1.75rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontWeight: 800, fontSize: '0.85rem', color: '#1E293B', marginBottom: '0.4rem' }}>
            <Sparkles size={16} color="#0284C7" />
            <span>{isAr ? 'فترة الاختبار والتجربة الحالية' : 'Demo & Testing Quick Access'}</span>
          </div>
          <p style={{ fontSize: '0.78rem', color: '#64748B', marginBottom: '0.85rem', lineHeight: 1.5 }}>
            {isAr 
              ? 'هذه الأزرار متاحة فقط خلال فترة التجربة لتعبئة الحسابات تلقائياً، وعند التدشين النهائي سيتم حجبها.'
              : 'These 1-click credentials prefill demo accounts and will be removed upon live production launch.'}
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            <button
              type="button"
              className="btn"
              style={{
                width: '100%',
                background: '#FFFFFF',
                border: '1.5px solid #BAE6FD',
                color: '#0369A1',
                padding: '0.75rem 1rem',
                fontSize: '0.875rem',
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                borderRadius: 'var(--radius-md)',
                boxShadow: '0 2px 5px rgba(2, 132, 199, 0.08)'
              }}
              onClick={() => handleQuickDemoLogin('teacher@edu.eg')}
              disabled={isLoading}
            >
              👩‍🏫 {isAr ? 'دخول تجريبي كمعلم (Teacher Demo)' : 'Quick Demo: Teacher'}
            </button>

            <button
              type="button"
              className="btn"
              style={{
                width: '100%',
                background: '#FEF3C7',
                border: '1.5px solid #FCD34D',
                color: '#92400E',
                padding: '0.75rem 1rem',
                fontSize: '0.875rem',
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                borderRadius: 'var(--radius-md)',
                boxShadow: '0 2px 5px rgba(180, 83, 9, 0.08)'
              }}
              onClick={() => handleQuickDemoLogin('admin@edu.eg')}
              disabled={isLoading}
            >
              👑 {isAr ? 'دخول تجريبي كمالك / إدارة (Admin Demo)' : 'Quick Demo: Admin'}
            </button>
          </div>
        </div>

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

        {/* Login Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
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
                type="password"
                required
                className="form-input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ paddingRight: isAr ? '2.5rem' : '1rem', paddingLeft: isAr ? '1rem' : '2.5rem' }}
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
        </form>
      </div>
    </div>
  );
};
