import React from 'react';
import { useAuth } from '../context/AuthContext';
import { BookOpen, Globe, LogOut, User, Sparkles, School, Home as HomeIcon } from 'lucide-react';

interface NavbarProps {
  onOpenAuth?: (mode: 'login' | 'register') => void;
  activeView: 'home' | 'dashboard';
  setActiveView: (view: 'home' | 'dashboard') => void;
}

export const Navbar: React.FC<NavbarProps> = ({ activeView, setActiveView }) => {
  const { user, logout, language, setLanguage, t } = useAuth();

  const toggleLanguage = () => {
    setLanguage(language === 'ar' ? 'en' : 'ar');
  };

  return (
    <header className="navbar">
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
                  title={user.role === 'STUDENT' ? t.studentDashboard : t.teacherDashboard}
                >
                  <Sparkles size={14} />
                  <span className="nav-btn-text">
                    {user.role === 'STUDENT' ? t.studentDashboard : t.teacherDashboard}
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
                  {user.role === 'STUDENT' ? (
                    <>
                      <School size={13} />
                      <span className="badge-text">{user.profile?.grade_name_ar || 'الصف الأول الإعدادي'}</span>
                    </>
                  ) : (
                    <>
                      <User size={13} />
                      <span className="badge-text">{t.teacherRole}</span>
                    </>
                  )}
                </span>
              </div>

              {/* Logout Button - Always visible and accessible */}
              <button 
                className="btn btn-outline btn-sm logout-btn" 
                onClick={logout}
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
