import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiUrl } from '../utils/api';
import { ShieldCheck, Lock, Mail, ArrowRight, ArrowLeft, Sparkles, UserCheck } from 'lucide-react';

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

  const handleQuickDemo = async (demoEmail: string) => {
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
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const isAr = language === 'ar';
  const ArrowIcon = isAr ? ArrowLeft : ArrowRight;

  return (
    <div style={{
      minHeight: '80vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem 1rem'
    }}>
      <div 
        className="card" 
        style={{
          width: '100%',
          maxWidth: '520px',
          padding: '2.5rem 2rem',
          borderRadius: 'var(--radius-xl)',
          boxShadow: '0 20px 40px -15px rgba(15, 23, 42, 0.15)',
          border: '1px solid var(--border-light)',
          background: '#FFFFFF'
        }}
      >
        {/* Back link */}
        <button
          onClick={onBackToHome}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            fontSize: '0.875rem',
            fontWeight: 600,
            marginBottom: '1.5rem',
            padding: 0
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
            borderRadius: '16px',
            background: 'linear-gradient(135deg, #1E293B 0%, #0F172A 100%)',
            color: '#F8FAFC',
            marginBottom: '1rem',
            boxShadow: '0 8px 16px -4px rgba(15, 23, 42, 0.3)'
          }}>
            <ShieldCheck size={36} color="#38BDF8" />
          </div>

          <div style={{
            display: 'inline-block',
            padding: '0.25rem 0.75rem',
            borderRadius: '999px',
            background: '#F1F5F9',
            color: '#475569',
            fontSize: '0.75rem',
            fontWeight: 700,
            marginBottom: '0.5rem',
            border: '1px solid #E2E8F0'
          }}>
            🔒 {isAr ? 'بوابة مشفرة ومحمية | /adminportalteacher' : 'Secure Staff Gate | /adminportalteacher'}
          </div>

          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '0.5rem' }}>
            {isAr ? 'بوابة المعلمين والإدارة المعتمدة' : 'Staff & Administration Portal'}
          </h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
            {isAr 
              ? 'تسجيل الدخول المخصص للأساتذة وإدارة النظام للتحكم في المناهج والامتحانات والصلاحيات.'
              : 'Dedicated access for educators and administrators to manage curriculum, exams, and permissions.'}
          </p>
        </div>

        {/* Demo Mode Notice & Buttons */}
        <div style={{
          background: 'linear-gradient(to bottom, #F8FAFC, #F1F5F9)',
          border: '1px solid #E2E8F0',
          borderRadius: 'var(--radius-lg)',
          padding: '1.25rem',
          marginBottom: '1.75rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, fontSize: '0.85rem', color: '#1E293B', marginBottom: '0.5rem' }}>
            <Sparkles size={16} color="#0284C7" />
            <span>{isAr ? 'فترة الاختبار والتجربة (Testing & Demo Period):' : 'Demo & Testing Quick Access:'}</span>
          </div>
          <p style={{ fontSize: '0.78rem', color: '#64748B', marginBottom: '0.75rem', lineHeight: 1.4 }}>
            {isAr 
              ? 'هذه الأزرار متاحة فقط خلال فترة التجربة، وعند التدشين النهائي سيتم حجبها والاكتفاء ببيانات الدخول الرسمية.'
              : 'These 1-click credentials are active during the demo phase and will be removed upon live production launch.'}
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
            <button
              type="button"
              className="btn"
              style={{
                background: '#FFFFFF',
                border: '1px solid #BAE6FD',
                color: '#0369A1',
                padding: '0.6rem 0.75rem',
                fontSize: '0.82rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.4rem',
                borderRadius: 'var(--radius-md)',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
              }}
              onClick={() => handleQuickDemo('teacher@edu.eg')}
              disabled={isLoading}
            >
              👩‍🏫 {isAr ? 'دخول المعلم (Teacher)' : 'Teacher Demo'}
            </button>

            <button
              type="button"
              className="btn"
              style={{
                background: '#FEF3C7',
                border: '1px solid #FCD34D',
                color: '#92400E',
                padding: '0.6rem 0.75rem',
                fontSize: '0.82rem',
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.4rem',
                borderRadius: 'var(--radius-md)',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
              }}
              onClick={() => handleQuickDemo('admin@edu.eg')}
              disabled={isLoading}
            >
              👑 {isAr ? 'دخول المالك (Admin)' : 'Admin Demo'}
            </button>
          </div>
        </div>

        {/* Error Alert */}
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

        {/* Login Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div>
            <label className="form-label" style={{ fontWeight: 600 }}>
              {isAr ? 'البريد الإلكتروني المهني:' : 'Work Email:'}
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type="email"
                required
                className="form-input"
                placeholder={isAr ? 'teacher@edu.eg أو admin@edu.eg' : 'staff@edu.eg'}
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
            <label className="form-label" style={{ fontWeight: 600 }}>
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
            style={{ width: '100%', marginTop: '0.5rem', fontWeight: 700 }}
          >
            {isLoading 
              ? (isAr ? 'جاري التحقق والمصادقة...' : 'Authenticating...') 
              : (isAr ? 'دخول لوحة التحكم المعتمدة' : 'Sign In to Portal')}
          </button>
        </form>

        {/* System ID Architecture Info Footer */}
        <div style={{
          marginTop: '2rem',
          paddingTop: '1.25rem',
          borderTop: '1px dashed var(--border-light)',
          fontSize: '0.75rem',
          color: 'var(--text-muted)',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.35rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 700, color: '#334155' }}>
            <UserCheck size={14} color="#0284C7" />
            <span>{isAr ? 'هيكلية الهوية الرقمية للمنصة (Future DB Schema):' : 'Platform Identity Schema:'}</span>
          </div>
          <div>• {isAr ? 'المالك / الإدارة العامة: معرف فائق' : 'Owner: Super Identifier'} <code style={{ background: '#F1F5F9', padding: '1px 4px', borderRadius: '4px' }}>super_id: SUPER-ADMIN-001</code></div>
          <div>• {isAr ? 'المعلمون: معرف هجين' : 'Teachers: Hybrid Identifier'} <code style={{ background: '#F1F5F9', padding: '1px 4px', borderRadius: '4px' }}>hybrid_id: HYBRID-TEA-SCI-01</code></div>
          <div>• {isAr ? 'الطلاب: معرف قياسي منفصل' : 'Students: Standard Identifier'} <code style={{ background: '#F1F5F9', padding: '1px 4px', borderRadius: '4px' }}>id: UUID</code></div>
        </div>
      </div>
    </div>
  );
};
