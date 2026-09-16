import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Navbar } from './components/Navbar';
import { Home } from './pages/Home';
import { StudentDashboard } from './pages/StudentDashboard';
import { TeacherDashboard } from './pages/TeacherDashboard';
import { AuthModal } from './pages/AuthModal';

const PlatformApp: React.FC = () => {
  const { user, t, language } = useAuth();
  const [activeView, setActiveView] = useState<'home' | 'dashboard'>('home');
  const [authModalOpen, setAuthModalOpen] = useState<boolean>(false);
  const [authModalMode, setAuthModalMode] = useState<'login' | 'register'>('login');

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
    <div className="app-container">
      <Navbar
        onOpenAuth={handleOpenAuth}
        activeView={activeView}
        setActiveView={setActiveView}
      />

      <main className="main-content">
        {activeView === 'home' ? (
          <Home
            onOpenAuth={handleOpenAuth}
            onGoToDashboard={handleGoToDashboard}
          />
        ) : (
          <>
            {user?.role === 'STUDENT' && <StudentDashboard />}
            {(user?.role === 'TEACHER' || user?.role === 'ADMIN') && <TeacherDashboard />}
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

      {/* Footer */}
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
          <p style={{ fontWeight: 700, color: 'var(--primary-800)', marginBottom: '0.25rem' }}>
            {t.brandName} • {language === 'ar' ? 'منظومة التقويم التشخيصي الذكي المستند للمناهج' : 'Grounded Diagnostic Educational Platform'}
          </p>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-light)' }}>
            PostgreSQL + pgvector • React + TypeScript + Vite • Node.js Express • AI RAG Engine
          </p>
        </div>
      </footer>

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
