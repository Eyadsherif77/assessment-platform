import React from 'react';
import { useAuth } from '../context/AuthContext';
import { BookOpen, Globe, LogOut, User, Sparkles, School, Home as HomeIcon } from 'lucide-react';

interface NavbarProps {
  onOpenAuth?: (mode: 'login' | 'register') => void;
  activeView: 'home' | 'dashboard';
  setActiveView: (view: 'home' | 'dashboard') => void;
}

export const Navbar: React.FC<NavbarProps> = ({ activeView, setActiveView }) => {
  const { user, logout, language, setLanguage, t, isImpersonating, exitImpersonation } = useAuth();

  const toggleLanguage = () => {
    setLanguage(language === 'ar' ? 'en' : 'ar');
  };

  const getDashboardLabel = () => {
    if (user?.role === 'ADMIN') return language === 'ar' ? 'لوحة الإدارة' : 'Admin Portal';
    if (user?.role === 'STUDENT') return t.studentDashboard;
    return t.teacherDashboard;
  };

  return (
    <header className="navbar">
      {/* Impersonation Banner for Admin accessing Teacher or Student accounts */}
      {isImpersonating && (
        <div style={{
          background: 'linear-gradient(90deg, #D97706 0%, #B45309 100%)',
          color: '#FFFFFF',
          padding: '0.45rem 1.25rem',
          fontSize: '0.825rem',
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.5rem',
          zIndex: 1000,
          boxShadow: '0 2px 8px rgba(180, 83, 9, 0.25)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '1rem' }}>👁️</span>
            <span>
              {language === 'ar'
                ? `وضع معاينة الإدارة: تتصفح حالياً بصفتك (${user?.role === 'TEACHER' ? 'معلم' : 'طالب'}): ${user?.fullName} [${user?.hybrid_id || user?.id}]`
                : `Admin Impersonation Mode: Browsing as (${user?.role}): ${user?.fullName} [${user?.hybrid_id || user?.id}]`}
            </span>
          </div>
          <button
            className="btn btn-sm"
            onClick={() => { exitImpersonation(); setActiveView('dashboard'); }}
            style={{
              background: '#FFFFFF',
              color: '#92400E',
              border: 'none',
              padding: '0.25rem 0.85rem',
              fontWeight: 800,
              fontSize: '0.78rem',
              borderRadius: 'var(--radius-full)',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
            }}
          >
            ⬅️ {language === 'ar' ? 'العودة للوحة الإدارة' : 'Exit to Admin Portal'}
          </button>
        </div>
      )}

      <div className="navbar-inner">
        <a 
          href="#home" 
          className="brand-logo" 
          onClick={(e) => { e.preventDefault(); setActiveView('home'); }}
        >
          <div className="brand-icon">
            <BookOpen size={20} />
          </div>
          <div className="brand-text">
            <div className="brand-title">{t.brandName}</div>

          </div>
        </a>

        <div className="nav-actions">
          {/* Language Switcher */}
          <button 
            className="btn btn-outline btn-sm lang-btn" 
            onClick={toggleLanguage}
            title={language === 'ar' ? 'Switch to English' : 'التحويل للعربية'}
            style={{ padding: '0.35rem 0.65rem' }}
          >
            <Globe size={14} />
            <span className="lang-label">{language === 'ar' ? 'EN' : 'عربي'}</span>
          </button>

          {user ? (
            <>
              {activeView === 'home' ? (
                <button 
                  className="btn btn-sm btn-primary nav-dashboard-btn"
                  onClick={() => setActiveView('dashboard')}
                  title={getDashboardLabel()}
                  style={{ gap: '0.4rem' }}
                >
                  <Sparkles size={14} />
                  <span className="nav-btn-text">
                    {getDashboardLabel()}
                  </span>
                  <span className="nav-btn-text-mobile">
                    {language === 'ar' ? 'لوحتي' : 'Dashboard'}
                  </span>
                </button>
              ) : (
                <button 
                  className="btn btn-outline btn-sm nav-home-btn"
                  onClick={() => setActiveView('home')}
                  title={t.home}
                  style={{ gap: '0.4rem' }}
                >
                  <HomeIcon size={14} />
                  <span className="nav-btn-text">{t.home}</span>
                  <span className="nav-btn-text-mobile">
                    {language === 'ar' ? 'الرئيسية' : 'Home'}
                  </span>
                </button>
              )}

              {/* Desktop-Only User Badge */}
              <div className="user-badge-container desktop-user-badge" style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                <span className="badge badge-primary nav-user-badge" style={{ padding: '0.35rem 0.75rem', gap: '0.4rem' }}>
                  {user.role === 'STUDENT' && (
                    <>
                      <School size={13} />
                      <span className="badge-text">{language === 'ar' ? (user.profile?.grade_name_ar || 'الصف الأول الإعدادي') : (user.profile?.grade_name_en || 'Prep 1')}</span>
                    </>
                  )}
                  {user.role === 'TEACHER' && (
                    <>
                      <User size={13} />
                      <span className="badge-text">{user.hybrid_id ? (language === 'ar' ? `معلم (${user.hybrid_id})` : `Teacher (${user.hybrid_id})`) : t.teacherRole}</span>
                    </>
                  )}
                  {user.role === 'ADMIN' && (
                    <>
                      <span>👑</span>
                      <span className="badge-text">
                        {language === 'ar' ? `المالك (${user.super_id || 'SUPER-ADMIN-001'})` : `Owner (${user.super_id || 'SUPER-ADMIN-001'})`}
                      </span>
                    </>
                  )}
                </span>
                {user.role === 'STUDENT' && (
                  <span className="badge" style={{
                    padding: '0.35rem 0.65rem',
                    fontSize: '0.78rem',
                    background: user.profile?.school_type === 'لغات' ? '#EFF6FF' : '#F0FDF4',
                    color: user.profile?.school_type === 'لغات' ? '#1D4ED8' : '#15803D',
                    border: `1px solid ${user.profile?.school_type === 'لغات' ? '#BFDBFE' : '#BBF7D0'}`
                  }}>
                    {user.profile?.school_type === 'لغات'
                      ? (language === 'ar' ? '🌐 مدارس لغات' : '🌐 Language School')
                      : (language === 'ar' ? '🏫 مدارس عربي' : '🏫 Arabic School')}
                  </span>
                )}
              </div>

              {/* Logout Button */}
              <button 
                className="btn btn-outline btn-sm logout-btn" 
                onClick={() => { logout(); setActiveView('home'); }}
                title={t.logout}
                aria-label={t.logout}
                style={{ padding: '0.4rem' }}
              >
                <LogOut size={15} />
              </button>
            </>
          ) : null}
        </div>
      </div>

      {/* Mobile-Only Student Info Strip */}
      {user && (
        <div className="mobile-student-strip">
          <div className="mobile-strip-inner">
            <span className="badge badge-primary mobile-grade-badge">
              <School size={12} />
              <span>{language === 'ar' ? (user.profile?.grade_name_ar || (user.role === 'STUDENT' ? 'الصف الأول الإعدادي' : t.teacherRole)) : (user.profile?.grade_name_en || (user.role === 'STUDENT' ? 'Prep 1' : t.teacherRole))}</span>
            </span>
            {user.profile?.section && (
              <span className="badge mobile-section-badge">
                {language === 'ar' ? `شعبة: ${user.profile.section}` : `Track: ${user.profile.section}`}
              </span>
            )}
            {user.profile?.school_type && (
              <span className="badge mobile-school-badge">
                {user.profile.school_type === 'لغات' 
                  ? (language === 'ar' ? '🌐 مدارس لغات' : '🌐 Language School') 
                  : (language === 'ar' ? '🏫 مدارس عربي' : '🏫 Arabic School')}
              </span>
            )}
          </div>
        </div>
      )}
    </header>
  );
};
