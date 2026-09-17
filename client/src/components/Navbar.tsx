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
          background: 'linear-gradient(90deg, #F59E0B 0%, #D97706 100%)',
          color: '#FFFFFF',
          padding: '0.45rem 1rem',
          fontSize: '0.825rem',
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.5rem',
          zIndex: 1000
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>👁️</span>
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
              color: '#B45309',
              border: 'none',
              padding: '0.25rem 0.75rem',
              fontWeight: 800,
              fontSize: '0.78rem',
              borderRadius: 'var(--radius-sm)'
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
            <BookOpen size={22} />
          </div>
          <div className="brand-text">
            <div className="brand-title">{t.brandName}</div>
            <div className="brand-subtitle">
              {language === 'ar' ? 'التقييم من أجل التعليم' : 'Assessment for Education'}
            </div>
          </div>
        </a>

        <div className="nav-actions">
          {/* Language Switcher */}
          <button 
            className="btn btn-outline btn-sm lang-btn" 
            onClick={toggleLanguage}
            title={language === 'ar' ? 'Switch to English' : 'التحويل للعربية'}
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
                >
                  <HomeIcon size={14} />
                  <span className="nav-btn-text">{t.home}</span>
                  <span className="nav-btn-text-mobile">
                    {language === 'ar' ? 'الرئيسية' : 'Home'}
                  </span>
                </button>
              )}

              {/* Desktop-Only User Badge (Kept in top bar on PC/Laptop) */}
              <div className="user-badge-container desktop-user-badge">
                <span className="badge badge-primary nav-user-badge">
                  {user.role === 'STUDENT' && (
                    <>
                      <School size={13} />
                      <span className="badge-text">{user.profile?.grade_name_ar || 'الصف الأول الإعدادي'}</span>
                    </>
                  )}
                  {user.role === 'TEACHER' && (
                    <>
                      <User size={13} />
                      <span className="badge-text">{user.hybrid_id ? `معلم (${user.hybrid_id})` : t.teacherRole}</span>
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
              </div>

              {/* Logout Button - Always visible and accessible */}
              <button 
                className="btn btn-outline btn-sm logout-btn" 
                onClick={() => { logout(); setActiveView('home'); }}
                title={t.logout}
                aria-label={t.logout}
              >
                <LogOut size={15} />
              </button>
            </>
          ) : null}
        </div>
      </div>

      {/* Mobile-Only Student Info Strip - 100% visible on all phones without horizontal overflow */}
      {user && (
        <div className="mobile-student-strip">
          <div className="mobile-strip-inner">
            <span className="badge badge-primary mobile-grade-badge">
              <School size={12} />
              <span>{user.profile?.grade_name_ar || (user.role === 'STUDENT' ? 'الصف الأول الإعدادي' : t.teacherRole)}</span>
            </span>
            {user.profile?.section && (
              <span className="badge mobile-section-badge">
                شعبة: {user.profile.section}
              </span>
            )}
            {user.profile?.school_type && (
              <span className="badge mobile-school-badge">
                {user.profile.school_type === 'لغات' ? '🌐 مدارس لغات' : '🏫 مدارس عربي'}
              </span>
            )}
          </div>
        </div>
      )}
    </header>
  );
};
