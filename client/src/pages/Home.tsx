import React from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  Sparkles, 
  ShieldCheck, 
  BookOpen, 
  Compass, 
  BarChart3, 
  GraduationCap, 
  ArrowRight, 
  ArrowLeft,
  Target
} from 'lucide-react';

interface HomeProps {
  onOpenAuth: (mode: 'login' | 'register') => void;
  onGoToDashboard: () => void;
}

export const Home: React.FC<HomeProps> = ({ onOpenAuth, onGoToDashboard }) => {
  const { user, t, language } = useAuth();
  const ArrowIcon = language === 'ar' ? ArrowLeft : ArrowRight;

  return (
    <div>
      {/* Hero Banner */}
      <section className="hero-banner">
        <div style={{ maxWidth: '840px', margin: '0 auto' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            background: 'rgba(255, 255, 255, 0.2)',
            backdropFilter: 'blur(8px)',
            padding: '0.35rem 1rem',
            borderRadius: 'var(--radius-full)',
            fontSize: '0.875rem',
            fontWeight: 600,
            marginBottom: '1.25rem'
          }}>
            <Sparkles size={16} />
            <span>{language === 'ar' ? 'الجيل الجديد من التقويم التربوي الذكي 2026' : 'Next-Gen Educational AI Assessment'}</span>
          </div>

          <h1 className="hero-title">
            {t.heroTitle}
          </h1>
          <p className="hero-subtitle">
            {t.heroSubtitle}
          </p>

          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            {user ? (
              <button 
                className="btn btn-secondary btn-lg" 
                onClick={onGoToDashboard}
                style={{ fontWeight: 700 }}
              >
                <span>{user.role === 'STUDENT' ? t.studentDashboard : t.teacherDashboard}</span>
                <ArrowIcon size={20} />
              </button>
            ) : (
              <>
                <button 
                  className="btn btn-secondary btn-lg" 
                  onClick={() => onOpenAuth('register')}
                  style={{ fontWeight: 700 }}
                >
                  <GraduationCap size={20} />
                  <span>{t.heroCtaStudent}</span>
                </button>
                <button 
                  className="btn btn-outline btn-lg" 
                  onClick={() => onOpenAuth('login')}
                  style={{ color: 'white', borderColor: 'rgba(255, 255, 255, 0.4)', fontWeight: 600 }}
                >
                  <span>{t.heroCtaTeacher}</span>
                </button>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Flagship Pedagogical Concept Box */}
      <section style={{ marginBottom: '3.5rem' }}>
        <div className="card" style={{
          background: 'linear-gradient(135deg, #FFFFFF, #EFF6FF)',
          border: '1.5px solid var(--primary-200)',
          padding: '2rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1.25rem', flexWrap: 'wrap' }}>
            <div style={{
              width: '56px',
              height: '56px',
              borderRadius: 'var(--radius-lg)',
              background: 'linear-gradient(135deg, var(--primary-600), var(--primary-800))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              flexShrink: 0
            }}>
              <Target size={30} />
            </div>
            <div style={{ flex: 1, minWidth: '280px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                <h3 style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--primary-800)' }}>
                  {language === 'ar' ? 'فلسفة المنصة: تقييم تشخيصي مرتبط بنصوص الكتاب المدرسي' : 'Grounded Educational Diagnostic Assessment'}
                </h3>
                <span className="badge badge-primary">RAG Grounded</span>
              </div>
              <p style={{ color: 'var(--text-body)', lineHeight: 1.7, fontSize: '0.975rem' }}>
                {language === 'ar' 
                  ? 'لا نعتمد على محتوى عام أو مولد عشوائياً! الذكاء الاصطناعي يستخرج فقرات الكتاب المدرسي الرسمي، يطابق الإجابات، وعند الخطأ يشرح للطالب سبب عدم صحة اختياره، ويوجهه مباشرة: "ارجع لكتاب العلوم - الفصل الأول - صفحة 7 لمراجعة مفهوم الكثافة وحرائق البترول".'
                  : 'We do not use invented general knowledge! The AI strictly retrieves textbook chunks uploaded for the student’s exact grade. When a mistake is made, it explains the misconception and directs the student: "Open Chapter 1, Page 7 to review Density and Oil Fires".'}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Core Platform Features Grid */}
      <section style={{ marginBottom: '3.5rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-title)' }}>
            {t.featuresTitle}
          </h2>
          <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>
            {language === 'ar' ? 'بنية هندسية وتربوية متكاملة مصممة لملايين الطلاب والمعلمين' : 'Built with high-scale architecture for millions of students and educators'}
          </p>
        </div>

        <div className="grid-cards">
          {/* Feature 1: Stage/Grade Isolation */}
          <div className="card">
            <div style={{
              width: '44px',
              height: '44px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--primary-100)',
              color: 'var(--primary-700)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '1rem'
            }}>
              <ShieldCheck size={24} />
            </div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '0.5rem' }}>
              {t.feat1Title}
            </h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
              {t.feat1Desc}
            </p>
          </div>

          {/* Feature 2: RAG Vector Grounding */}
          <div className="card">
            <div style={{
              width: '44px',
              height: '44px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--primary-100)',
              color: 'var(--primary-700)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '1rem'
            }}>
              <BookOpen size={24} />
            </div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '0.5rem' }}>
              {t.feat2Title}
            </h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
              {t.feat2Desc}
            </p>
          </div>

          {/* Feature 3: Diagnosis & Page Prescriptions */}
          <div className="card">
            <div style={{
              width: '44px',
              height: '44px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--primary-100)',
              color: 'var(--primary-700)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '1rem'
            }}>
              <Compass size={24} />
            </div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '0.5rem' }}>
              {t.feat3Title}
            </h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
              {t.feat3Desc}
            </p>
          </div>

          {/* Feature 4: Longitudinal Learning Analytics */}
          <div className="card">
            <div style={{
              width: '44px',
              height: '44px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--primary-100)',
              color: 'var(--primary-700)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '1rem'
            }}>
              <BarChart3 size={24} />
            </div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '0.5rem' }}>
              {t.feat4Title}
            </h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
              {t.feat4Desc}
            </p>
          </div>
        </div>
      </section>

      {/* Curriculum Levels Preview */}
      <section style={{ marginBottom: '3rem' }}>
        <div className="card" style={{ padding: '2.5rem 2rem' }}>
          <h3 style={{ fontSize: '1.35rem', fontWeight: 800, marginBottom: '1rem', textAlign: 'center' }}>
            {language === 'ar' ? 'المراحل والصفوف الدراسية المدعومة' : 'Curriculum Stages & Supported Grades'}
          </h3>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '1rem',
            marginTop: '1.5rem'
          }}>
            <div style={{
              border: '1.5px solid var(--border-light)',
              borderRadius: 'var(--radius-md)',
              padding: '1.25rem',
              background: 'var(--bg-main)'
            }}>
              <span className="badge badge-primary" style={{ marginBottom: '0.75rem' }}>المرحلة الابتدائية</span>
              <h4 style={{ fontWeight: 700, fontSize: '1rem' }}>الصفوف (الرابع - الخامس - السادس)</h4>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                تأسيس المفاهيم العلمية واللغوية والرياضية
              </p>
            </div>

            <div style={{
              border: '2px solid var(--primary-400)',
              borderRadius: 'var(--radius-md)',
              padding: '1.25rem',
              background: 'var(--primary-50)'
            }}>
              <span className="badge badge-success" style={{ marginBottom: '0.75rem' }}>المرحلة الإعدادية (نشطة حالياً)</span>
              <h4 style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--primary-900)' }}>الصف الأول، الثاني، الثالث الإعدادي</h4>
              <p style={{ fontSize: '0.85rem', color: 'var(--primary-800)', marginTop: '0.25rem' }}>
                كتاب العلوم وفصل المادة وخواصها جاهز بالكامل للتقييم الذكي RAG
              </p>
            </div>

            <div style={{
              border: '1.5px solid var(--border-light)',
              borderRadius: 'var(--radius-md)',
              padding: '1.25rem',
              background: 'var(--bg-main)'
            }}>
              <span className="badge badge-primary" style={{ marginBottom: '0.75rem' }}>المرحلة الثانوية</span>
              <h4 style={{ fontWeight: 700, fontSize: '1rem' }}>الصفوف (الأول - الثاني - الثالث الثانوي)</h4>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                مستويات قياس عليا وفق تصنيف بلوم (التحليل والتقويم)
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
