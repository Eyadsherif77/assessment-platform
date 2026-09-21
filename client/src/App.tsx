import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Navbar } from './components/Navbar';
import { Home } from './pages/Home';
import { StudentDashboard } from './pages/StudentDashboard';
import { TeacherDashboard } from './pages/TeacherDashboard';
import { AdminDashboard } from './pages/AdminDashboard';
import { AdminTeacherPortal } from './pages/AdminTeacherPortal';
import { AuthModal } from './pages/AuthModal';
import { useScreenDetector } from './utils/useScreenDetector';

const PlatformApp: React.FC = () => {
  const { user, t, language } = useAuth();
  // Automatically detects screen dimensions, device type (mobile/tablet/desktop) and syncs CSS
  useScreenDetector();

  const checkIsAdminPortal = (): boolean => {
    try {
      const p = window.location.pathname.toLowerCase();
      const s = window.location.search.toLowerCase();
      return p.includes('adminportalteacher') || s.includes('adminportalteacher') || s.includes('portal=admin');
    } catch (_) {
      return false;
    }
  };

  const [isAdminPortalRoute, setIsAdminPortalRoute] = useState<boolean>(checkIsAdminPortal);

  useEffect(() => {
    const onPopState = () => {
      setIsAdminPortalRoute(checkIsAdminPortal());
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const handleBackToHome = () => {
    try {
      window.history.pushState({}, '', '/');
    } catch (_) {}
    setIsAdminPortalRoute(false);
    setActiveView('home');
  };

  const getInitialView = (): 'home' | 'dashboard' => {
    try {
      const params = new URLSearchParams(window.location.search);
      const v = params.get('view');
      if (v === 'dashboard' || v === 'home') return v;
      const saved = localStorage.getItem('platform_active_view');
      if (saved === 'dashboard' || saved === 'home') return saved;
    } catch (_) {}
    return 'home';
  };

  const [activeView, setActiveViewState] = useState<'home' | 'dashboard'>(getInitialView);
  const [authModalOpen, setAuthModalOpen] = useState<boolean>(false);
  const [authModalMode, setAuthModalMode] = useState<'login' | 'register'>('login');

  const setActiveView = (view: 'home' | 'dashboard') => {
    setActiveViewState(view);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('view', view);
      window.history.replaceState({}, '', url.toString());
      localStorage.setItem('platform_active_view', view);
    } catch (_) {}
  };

  const handleOpenAuth = (mode: 'login' | 'register') => {
    setAuthModalMode(mode);
    setAuthModalOpen(true);
  };

  const handleGoToDashboard = () => {
    if (user) {
      setActiveView('dashboard');
    } else {
      handleOpenAuth('login');
    }
  };

  return (
    <div className="app-container" style={{ position: 'relative' }}>
      <Navbar
        onOpenAuth={handleOpenAuth}
        activeView={activeView}
        setActiveView={setActiveView}
      />

      <main className="main-content">
        {isAdminPortalRoute ? (
          <>
            {user?.role === 'ADMIN' && <AdminDashboard />}
            {user?.role === 'TEACHER' && <TeacherDashboard />}
            {user?.role === 'STUDENT' && (
              <div style={{ textAlign: 'center', padding: '4rem 1.5rem', maxWidth: '600px', margin: '0 auto' }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🛡️</div>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--danger-600)', marginBottom: '0.75rem' }}>
                  {language === 'ar' ? 'منطقة مقتصرة على الإدارة والمعلمين' : 'Restricted Staff Zone'}
                </h2>
                <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', lineHeight: 1.6 }}>
                  {language === 'ar' 
                    ? 'أنت مسجل حالياً كحساب طالب. لا يمكن للطلاب الوصول إلى بوابة المعلمين أو أدوات الإدارة.'
                    : 'You are signed in as a student. Students are not authorized to access teacher and management controls.'}
                </p>
                <button className="btn btn-primary" onClick={handleBackToHome}>
                  {language === 'ar' ? 'العودة إلى منصة الطلاب الرئيسية' : 'Return to Student Platform'}
                </button>
              </div>
            )}
            {!user && <AdminTeacherPortal onBackToHome={handleBackToHome} />}
          </>
        ) : activeView === 'home' ? (
          <Home
            onOpenAuth={handleOpenAuth}
            onGoToDashboard={handleGoToDashboard}
          />
        ) : (
          <>
            {user?.role === 'STUDENT' && <StudentDashboard />}
            {user?.role === 'TEACHER' && <TeacherDashboard />}
            {user?.role === 'ADMIN' && <AdminDashboard />}
            {!user && (
              <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
                <p style={{ marginBottom: '1rem', color: 'var(--text-muted)' }}>
                  {language === 'ar' ? 'يرجى تسجيل الدخول للوصول إلى لوحة التحكم' : 'Please sign in to access your dashboard'}
                </p>
                <button className="btn btn-primary" onClick={() => handleOpenAuth('login')}>
                  {t.login}
                </button>
              </div>
            )}
          </>
        )}
      </main>

      {/* Footer (Only on Home View) */}
      {activeView === 'home' && (
        <footer style={{
          borderTop: '1px solid var(--border-light)',
          background: '#FFFFFF',
          padding: '2rem 1.25rem',
          marginTop: 'auto',
          textAlign: 'center',
          color: 'var(--text-muted)',
          fontSize: '0.875rem'
        }}>
          <div style={{ maxWidth: '1280px', margin: '0 auto' }}>
            <p style={{ fontWeight: 700, color: 'var(--primary-800)', margin: 0 }}>
              {t.brandName}
            </p>
          </div>
        </footer>
      )}

      {/* Authentication Modal */}
      <AuthModal
        isOpen={authModalOpen}
        initialMode={authModalMode}
        onClose={() => setAuthModalOpen(false)}
        onSuccess={() => {
          setActiveView('dashboard');
        }}
      />
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <PlatformApp />
    </AuthProvider>
  );
}
