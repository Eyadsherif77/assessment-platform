import React from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  Sparkles, 
  ArrowRight, 
  ArrowLeft,
  LogIn,
} from 'lucide-react';

interface HomeProps {
  onOpenAuth: (mode: 'login' | 'register') => void;
  onGoToDashboard: () => void;
}

export const Home: React.FC<HomeProps> = ({ onOpenAuth, onGoToDashboard }) => {
  const { user, t, language } = useAuth();
  const ArrowIcon = language === 'ar' ? ArrowLeft : ArrowRight;

  return (
    <div style={{ position: 'relative' }}>

      {/* ===== ANIMATED BACKGROUND FOR WHITE SECTIONS ===== */}
      <div className="home-bg-canvas" aria-hidden="true">
        <div className="hbg-shape hbg-shape-1" />
        <div className="hbg-shape hbg-shape-2" />
        <div className="hbg-shape hbg-shape-3" />
        <div className="hbg-shape hbg-shape-4" />
        <div className="hbg-shape hbg-shape-5" />
        <div className="hbg-ring hbg-ring-1" />
        <div className="hbg-ring hbg-ring-2" />
        <div className="hbg-dots" />
      </div>

      {/* Hero Banner */}
      <section className="hero-banner" style={{ position: 'relative', overflow: 'hidden' }}>
        <div className="hero-particle hero-p1" />
        <div className="hero-particle hero-p2" />
        <div className="hero-particle hero-p3" />
        <div className="hero-particle hero-p4" />
        <div className="hero-particle hero-p5" />
        <div className="hero-particle hero-p6" />
        <div className="hero-wave-ring hero-wr1" />
        <div className="hero-wave-ring hero-wr2" />
        <div style={{ maxWidth: '920px', margin: '0 auto', position: 'relative', zIndex: 2 }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            background: 'rgba(255, 255, 255, 0.2)',
            backdropFilter: 'blur(8px)',
            padding: '0.4rem 1.25rem',
            borderRadius: 'var(--radius-full)',
            fontSize: '0.875rem',
            fontWeight: 700,
            marginBottom: '1.25rem',
            border: '1px solid rgba(255, 255, 255, 0.3)'
          }}>
            <Sparkles size={18} />
            <span>{language === 'ar' ? 'منصة التقييم من أجل التعلم' : 'Assessment for Learning Platform'}</span>
          </div>

          <h1 className="hero-title" style={{ fontSize: '2.15rem', fontWeight: 800, lineHeight: 1.5, maxWidth: '860px', margin: '0 auto 2rem auto' }}>
            {t.heroTitle}
          </h1>
          {t.heroSubtitle ? (
            <p className="hero-subtitle">
              {t.heroSubtitle}
            </p>
          ) : null}

          <div className="hero-actions-container" style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap', maxWidth: '560px', margin: '0 auto' }}>
            {user ? (
              <button 
                className="btn btn-secondary btn-lg" 
                onClick={onGoToDashboard}
                style={{ fontWeight: 800, padding: '0.85rem 2rem' }}
              >
                <span>
                  {user.role === 'STUDENT' ? t.studentDashboard : (user.role === 'ADMIN' ? (language === 'ar' ? 'لوحة تحكم الإدارة' : 'Admin Portal') : t.teacherDashboard)}
                </span>
                <ArrowIcon size={20} />
              </button>
            ) : (
              <>
                <button 
                  className="btn btn-secondary btn-lg hero-cta-btn" 
                  onClick={() => onOpenAuth('register')}
                  style={{
                    fontWeight: 800,
                    padding: '0.85rem 2rem',
                    fontSize: '1.05rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    boxShadow: '0 8px 24px -4px rgba(0, 0, 0, 0.25)'
                  }}
                >
                  <Sparkles size={20} />
                  <span>{language === 'ar' ? 'إنشاء حساب جديد' : 'Create New Account'}</span>
                </button>
                <button 
                  className="btn btn-outline btn-lg hero-cta-btn" 
                  onClick={() => onOpenAuth('login')}
                  style={{
                    color: 'white',
                    borderColor: 'rgba(255, 255, 255, 0.75)',
                    background: 'rgba(255, 255, 255, 0.12)',
                    backdropFilter: 'blur(8px)',
                    fontWeight: 800,
                    padding: '0.85rem 2rem',
                    fontSize: '1.05rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem'
                  }}
                >
                  <LogIn size={20} />
                  <span>{language === 'ar' ? 'تسجيل الدخول' : 'Sign In'}</span>
                </button>
              </>
            )}
          </div>
        </div>
      </section>

    </div>
  );
};
