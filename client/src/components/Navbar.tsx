import React from 'react';
import { useAuth } from '../context/AuthContext';
import { BookOpen, Globe, LogOut, User, Sparkles, School, Home as HomeIcon } from 'lucide-react';

interface NavbarProps {
  onOpenAuth: (mode: 'login' | 'register') => void;
  activeView: 'home' | 'dashboard';
  setActiveView: (view: 'home' | 'dashboard') => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenAuth, activeView, setActiveView }) => {
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
            <Globe size={15} />
            <span className="lang-label">{language === 'ar' ? 'EN' : 'عربي'}</span>
          </button>

          {user ? (
            <>
              {activeView === 'home' ? (
                <button 
                  className="btn btn-sm btn-primary nav-dashboard-btn"
                  onClick={() => setActiveView('dashboard')}
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
                </button>
              )}

              <div className="user-badge-container">
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
                
                <button 
                  className="btn btn-outline btn-sm logout-btn" 
                  onClick={logout}
                  title={t.logout}
                  aria-label={t.logout}
                >
                  <LogOut size={15} />
                </button>
              </div>
            </>
          ) : (
            <div className="auth-nav-buttons">
              <button 
                className="btn btn-secondary btn-sm" 
                onClick={() => onOpenAuth('login')}
              >
                {t.login}
              </button>
              <button 
                className="btn btn-primary btn-sm" 
                onClick={() => onOpenAuth('register')}
              >
                {t.register}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
