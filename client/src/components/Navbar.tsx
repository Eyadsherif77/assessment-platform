import React from 'react';
import { useAuth } from '../context/AuthContext';
import { BookOpen, Globe, LogOut, User, Sparkles, School, Home as HomeIcon } from 'lucide-react';

interface NavbarProps {
  onOpenAuth?: (mode: 'login' | 'register') => void;
  activeView: 'home' | 'dashboard';
  setActiveView: (view: 'home' | 'dashboard') => void;
}

export const Navbar: React.FC<NavbarProps> = ({ activeView, setActiveView }) => {
  const { user, logout, language, setLanguage, t, isImpersonating, exitImpersonation, previousUser } = useAuth();

  const toggleLanguage = () => {
    setLanguage(language === 'ar' ? 'en' : 'ar');
  };

  const getDashboardLabel = () => {
    if (user?.role === 'ADMIN') return language === 'ar' ? 'لوحة الإدارة' : 'Admin Portal';
    if (user?.role === 'CENTRAL_ADMIN') return language === 'ar' ? 'لوحة المدير المركزي' : 'Central Director';
    if (user?.role === 'GOVERNORATE_ADMIN') return language === 'ar' ? 'لوحة مدير المحافظة' : 'Governorate Director';
    if (user?.role === 'SUPERVISOR') return language === 'ar' ? 'لوحة الموجه' : 'Supervisor Portal';
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
          padding: '0.45rem 1rem',
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: '1 1 auto', minWidth: '220px' }}>
            <span style={{ fontSize: '1rem', flexShrink: 0 }}>👁️</span>
            <span style={{ lineHeight: 1.3 }}>
              {language === 'ar'
                ? `وضع معاينة الإشراف: تتصفح حالياً بصفتك (${
                    user?.role === 'CENTRAL_ADMIN' ? 'المدير المركزي' :
                    user?.role === 'GOVERNORATE_ADMIN' ? `مدير محافظة ${user?.governorate_name || ''}` :
                    user?.role === 'SUPERVISOR' ? `موجه مادة ${user?.subject_name || ''}` :
                    user?.role === 'TEACHER' ? 'معلم' :
                    user?.role === 'STUDENT' ? 'طالب' : user?.role
                  }): ${user?.fullName}`
                : `Supervisory Impersonation Mode: Browsing as (${user?.role}): ${user?.fullName}`}
            </span>
          </div>
          <button
            className="btn btn-sm"
            onClick={() => { exitImpersonation(); setActiveView('dashboard'); }}
            style={{
              background: '#FFFFFF',
              color: '#92400E',
              border: 'none',
              padding: '0.35rem 1rem',
              fontWeight: 900,
              fontSize: '0.8rem',
              borderRadius: 'var(--radius-full)',
              boxShadow: '0 2px 5px rgba(0,0,0,0.15)',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              flexShrink: 0
            }}
          >
            <span>↩</span>
            <span>
              {language === 'ar'
                ? (previousUser 
                    ? `الرجوع إلى: ${previousUser.fullName} (${
                        previousUser.role === 'ADMIN' ? 'المدير العام' :
                        previousUser.role === 'CENTRAL_ADMIN' ? 'المدير المركزي' :
                        previousUser.role === 'GOVERNORATE_ADMIN' ? 'مدير المحافظة' :
                        previousUser.role === 'SUPERVISOR' ? 'الموجه' : previousUser.role
                      })`
                    : 'الرجوع للحساب السابق')
                : (previousUser 
                    ? `Back to: ${previousUser.fullName}`
                    : 'Back to previous account')}
            </span>
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
                      <span className="badge-text">{language === 'ar' ? 'المعلم' : 'Teacher'}</span>
                    </>
                  )}
                  {user.role === 'ADMIN' && (
                    <>
                      <span>👑</span>
                      <span className="badge-text">
                        {language === 'ar' ? `المدير العام (${user.super_id || 'SUPER-ADMIN-001'})` : `Admin (${user.super_id || 'SUPER-ADMIN-001'})`}
                      </span>
                    </>
                  )}
                  {user.role === 'CENTRAL_ADMIN' && (
                    <>
                      <span>🏛️</span>
                      <span className="badge-text">
                        {language === 'ar' ? 'المدير المركزي' : 'Central Director'}
                      </span>
                    </>
                  )}
                  {user.role === 'GOVERNORATE_ADMIN' && (
                    <>
                      <span>🏢</span>
                      <span className="badge-text">
                        {language === 'ar' ? `مدير المحافظة (${user.governorate_name || 'المحافظة'})` : `Gov Director (${user.governorate_name || 'Gov'})`}
                      </span>
                    </>
                  )}
                  {user.role === 'SUPERVISOR' && (
                    <>
                      <span>📐</span>
                      <span className="badge-text">
                        {language === 'ar' ? `الموجه (${user.subject_name || 'المادة'})` : `Supervisor (${user.subject_name || 'Subject'})`}
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

      {/* Mobile-Only Role / Student Info Strip */}
      {user && (
        <div className="mobile-student-strip">
          <div className="mobile-strip-inner" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span className="badge badge-primary mobile-grade-badge">
              {user.role === 'STUDENT' ? (
                <>
                  <School size={12} />
                  <span>{language === 'ar' ? (user.profile?.grade_name_ar || 'الصف الأول الإعدادي') : (user.profile?.grade_name_en || 'Prep 1')}</span>
                </>
              ) : user.role === 'ADMIN' ? (
                <span>👑 {language === 'ar' ? 'المدير العام' : 'General Admin'}</span>
              ) : user.role === 'CENTRAL_ADMIN' ? (
                <span>🏛️ {language === 'ar' ? 'المدير المركزي' : 'Central Director'}</span>
              ) : user.role === 'GOVERNORATE_ADMIN' ? (
                <span>🏢 {language === 'ar' ? `مدير محافظة ${user.governorate_name || ''}` : `Gov Director - ${user.governorate_name || ''}`}</span>
              ) : user.role === 'SUPERVISOR' ? (
                <span>📐 {language === 'ar' ? `الموجه (${user.subject_name || ''})` : `Supervisor (${user.subject_name || ''})`}</span>
              ) : (
                <span>👨‍🏫 {language === 'ar' ? 'معلم' : 'Teacher'}</span>
              )}
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
