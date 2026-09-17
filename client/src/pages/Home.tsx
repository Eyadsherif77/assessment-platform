import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  Sparkles, 
  ShieldCheck, 
  BookOpen, 
  Compass, 
  BarChart3, 
  ArrowRight, 
  ArrowLeft,
  Target,
  ChevronDown,
  ChevronUp,
  LogIn,
  Award
} from 'lucide-react';

interface HomeProps {
  onOpenAuth: (mode: 'login' | 'register') => void;
  onGoToDashboard: () => void;
}

export const Home: React.FC<HomeProps> = ({ onOpenAuth, onGoToDashboard }) => {
  const { user, t, language } = useAuth();
  const ArrowIcon = language === 'ar' ? ArrowLeft : ArrowRight;

  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);

  const toggleFaq = (index: number) => {
    setOpenFaqIndex(openFaqIndex === index ? null : index);
  };

  const faqs = [
    {
      q_ar: 'هل الأسئلة مطابقة 100% لكتب ومناهج وزارة التربية والتعليم الرسمية؟',
      q_en: 'Are the questions 100% aligned with official ministry textbooks?',
      a_ar: 'نعم بكل تأكيد. تعتمد المنصة على محرك استرجاع منهجي حازم يمنع الذكاء الاصطناعي من اختراع أي أسئلة خارج نص الكتاب المدرسي، ويربط كل سؤال برقم الصفحة والاقتباس المباشر.',
      a_en: 'Yes absolutely. The platform uses a strict educational AI engine that prevents hallucinations, guaranteeing every question is extracted directly from the uploaded official textbook with page references.'
    },
    {
      q_ar: 'كيف يساعد التقرير التشخيصي الطالب على رفع درجاته؟',
      q_en: 'How does the diagnostic report help students improve their grades?',
      a_ar: 'لا نكتفي بإعطاء الطالب درجة رقمية فقط! يحلل النظام الإجابات الخاطئة، ويوضح سبب عدم صحة الاختيار والمفهوم الخاطئ، ثم يقدم خطة علاجية وتوصية محددة: "راجع الفصل الأول - صفحة 7 لمراجعة مفهوم الكثافة".',
      a_en: 'We go beyond a raw score! The AI pinpoints misconceptions, explains why wrong choices were incorrect, and gives actionable review recommendations citing specific pages and chapters.'
    },
    {
      q_ar: 'ما المراحل والشعب الدراسية التي تدعمها المنصة؟',
      q_en: 'Which academic stages and divisions are supported?',
      a_ar: 'تدعم المنصة جميع المراحل: الابتدائية، والإعدادية، والمرحلة الثانوية بشُعبها (علمي، أدبي، علمي علوم، علمي رياضة)، بالإضافة لدعم مدارس اللغات والمدارس الحكومية والخاصة.',
      a_en: 'The platform supports Primary, Preparatory, and Secondary stages with full track division support (Scientific, Literary, Science Biology, Math Engineering), for both Arabic and Language schools.'
    },
    {
      q_ar: 'كيف يستفيد الطالب من بنك الأسئلة والامتحانات التفاعلية بالمنصة؟',
      q_en: 'How do students benefit from interactive question banks and practice exams?',
      a_ar: 'يستطيع كل طالب خوض اختبارات إلكترونية تفاعلية بمؤقت زمني حقيقي، وتدريب نفسه على نمط أسئلة الامتحانات الوزارية، مع الحصول على تصحيح فوري وتحليل دقيق لنقاط القوة والضعف.',
      a_en: 'Students can take timed interactive assessments modeled after official exam patterns, receiving instant automated scoring and deep diagnostic mastery reports.'
    }
  ];

  return (
    <div style={{ position: 'relative' }}>

      {/* ===== ANIMATED BACKGROUND FOR WHITE SECTIONS ===== */}
      <div className="home-bg-canvas" aria-hidden="true">
        {/* Floating geometric shapes */}
        <div className="hbg-shape hbg-shape-1" />
        <div className="hbg-shape hbg-shape-2" />
        <div className="hbg-shape hbg-shape-3" />
        <div className="hbg-shape hbg-shape-4" />
        <div className="hbg-shape hbg-shape-5" />
        <div className="hbg-ring hbg-ring-1" />
        <div className="hbg-ring hbg-ring-2" />
        {/* Animated dots grid */}
        <div className="hbg-dots" />
      </div>

      {/* Hero Banner */}
      <section className="hero-banner" style={{ position: 'relative', overflow: 'hidden' }}>
        {/* Animated hero particles */}
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
            <span>{language === 'ar' ? 'الجيل الجديد من التقويم التربوي والتشخيص الذكي 2026' : 'Next-Gen Educational AI Assessment & Diagnostics'}</span>
          </div>

          <h1 className="hero-title">
            {t.heroTitle}
          </h1>
          <p className="hero-subtitle">
            {t.heroSubtitle}
          </p>

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

      {/* Live Educational Metrics Bar */}
      <section style={{ marginTop: '-1.5rem', marginBottom: '3.5rem', position: 'relative', zIndex: 10 }}>
        <div className="card glass-panel metrics-grid" style={{
          padding: '1.5rem 1rem',
          boxShadow: '0 12px 30px -8px rgba(30, 58, 138, 0.12)'
        }}>
          <div>
            <div style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--primary-700)' }}>100%</div>
            <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-title)', marginTop: '0.25rem' }}>
              {language === 'ar' ? 'مناهج رسمية معتمدة' : 'Official Curriculum'}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {language === 'ar' ? 'مستندة للكتب المدرسية المقررة' : 'Direct textbook chunk grounding'}
            </div>
          </div>

          <div>
            <div style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--primary-700)' }}>+10,000</div>
            <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-title)', marginTop: '0.25rem' }}>
              {language === 'ar' ? 'سؤال معياري ذكي' : 'Standardized Questions'}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {language === 'ar' ? 'وفق مستويات تصنيف بلوم' : 'Mapped to Bloom’s taxonomy'}
            </div>
          </div>

          <div>
            <div style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--success-600)' }}>100%</div>
            <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-title)', marginTop: '0.25rem' }}>
              {language === 'ar' ? 'دقة الاقتباس والصفحات' : 'Page Citation Accuracy'}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {language === 'ar' ? 'شرح سبب الخطأ ورقم الصفحة' : 'Exact page & chapter reference'}
            </div>
          </div>

          <div>
            <div style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--primary-700)' }}>24/7</div>
            <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-title)', marginTop: '0.25rem' }}>
              {language === 'ar' ? 'تقييم تشخيصي فوري' : 'Instant Diagnostic Feedback'}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {language === 'ar' ? 'تحليل نقاط القوة ومسار التعلم' : 'Personalized mastery learning'}
            </div>
          </div>
        </div>
      </section>

      {/* Flagship Pedagogical Concept Box */}
      <section style={{ marginBottom: '3.5rem' }}>
        <div className="concept-card">
          <div className="concept-inner">
            <div className="concept-icon">
              <Target size={32} />
            </div>
            <div className="concept-body">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                <h3 style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--primary-800)' }}>
                  {language === 'ar' ? 'فلسفة المنصة: تقييم تشخيصي مرتبط بنصوص الكتاب المدرسي' : 'Curriculum-Linked Diagnostic Assessment'}
                </h3>
                <span className="badge badge-primary">{language === 'ar' ? 'ذكاء اصطناعي تشخيصي' : 'Diagnostic AI'}</span>
              </div>
              <p style={{ color: 'var(--text-body)', lineHeight: 1.8, fontSize: '0.975rem' }}>
                {language === 'ar' 
                  ? 'لا نعتمد على محتوى عام أو مولد عشوائياً! الذكاء الاصطناعي يستخرج فقرات الكتاب المدرسي الرسمي، يطابق الإجابات، وعند الخطأ يشرح للطالب سبب عدم صحة اختياره، ويوجهه مباشرة: "ارجع لكتاب العلوم - الفصل الأول - صفحة 7 لمراجعة مفهوم الكثافة وحرائق البترول".'
                  : 'We do not use invented general knowledge! The AI strictly retrieves textbook chunks uploaded for the student’s exact grade. When a mistake is made, it explains the misconception and directs the student: "Open Chapter 1, Page 7 to review Density and Oil Fires".'}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works - 4 Steps Section */}
      <section style={{ marginBottom: '3.5rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <span className="badge badge-primary" style={{ marginBottom: '0.5rem' }}>
            {language === 'ar' ? 'دورة التقييم الذكي' : 'Pedagogical Workflow'}
          </span>
          <h2 style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-title)' }}>
            {language === 'ar' ? 'كيف تعمل منصة التقييم من أجل التعليم؟' : 'How Does the Platform Work?'}
          </h2>
          <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem', maxWidth: '650px', margin: '0.5rem auto 0' }}>
            {language === 'ar' ? 'منظومة آلية متطورة تربط كل طالب بمنهجه وتقدم له تجربة تعليمية مخصصة' : 'An advanced pipeline connecting each student to their exact curriculum with personalized diagnostics'}
          </p>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '1.25rem'
        }}>
          {/* Step 1 */}
          <div className="card floating-card" style={{ padding: '1.75rem 1.25rem', position: 'relative' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: 'var(--radius-full)',
              background: 'var(--primary-100)',
              color: 'var(--primary-700)',
              fontWeight: 800,
              fontSize: '1.1rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '1rem'
            }}>
              1
            </div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 800, marginBottom: '0.5rem' }}>
              {language === 'ar' ? 'رفع وتصنيف الكتاب المنهجي' : 'Upload & Grade Mapping'}
            </h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
              {language === 'ar'
                ? 'فهرسة وتصنيف الكتب المنهجية الرسمية المعتمدة لصفك الدراسي بدقة لضمان تركيز الطالب التام على مقرراته فقط.'
                : 'Curriculum textbooks are mapped and indexed precisely to each student’s registered stage and grade.'}
            </p>
          </div>

          {/* Step 2 */}
          <div className="card floating-card" style={{ padding: '1.75rem 1.25rem', position: 'relative' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: 'var(--radius-full)',
              background: 'var(--primary-100)',
              color: 'var(--primary-700)',
              fontWeight: 800,
              fontSize: '1.1rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '1rem'
            }}>
              2
            </div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 800, marginBottom: '0.5rem' }}>
              {language === 'ar' ? 'الفهرسة الدلالية العميقة' : 'Semantic AI Indexing'}
            </h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
              {language === 'ar'
                ? 'يقوم محرك الذكاء الاصطناعي باستخراج فصول وفقرات الكتاب وتحويلها إلى متجهات دلالية مع رقم كل صفحة.'
                : 'The AI vector engine chunks chapter texts, indexing every paragraph with exact page coordinates.'}
            </p>
          </div>

          {/* Step 3 */}
          <div className="card floating-card" style={{ padding: '1.75rem 1.25rem', position: 'relative' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: 'var(--radius-full)',
              background: 'var(--primary-100)',
              color: 'var(--primary-700)',
              fontWeight: 800,
              fontSize: '1.1rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '1rem'
            }}>
              3
            </div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 800, marginBottom: '0.5rem' }}>
              {language === 'ar' ? 'توليد التقييمات الذكية' : 'Randomized Quiz Generation'}
            </h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
              {language === 'ar'
                ? 'يولد النظام أسئلة اختيار من متعدد مع خلط الخيارات عشوائياً لمنع التخمين، مطابقة لنص ومفاهيم الدرس.'
                : 'Generates rigorous multiple-choice items with shuffled answer distributions to prevent guessing.'}
            </p>
          </div>

          {/* Step 4 */}
          <div className="card floating-card" style={{ padding: '1.75rem 1.25rem', position: 'relative' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: 'var(--radius-full)',
              background: 'var(--primary-100)',
              color: 'var(--primary-700)',
              fontWeight: 800,
              fontSize: '1.1rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '1rem'
            }}>
              4
            </div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 800, marginBottom: '0.5rem' }}>
              {language === 'ar' ? 'التقرير التشخيصي وخطة العلاج' : 'Diagnostic Action Plan'}
            </h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
              {language === 'ar'
                ? 'يحصل الطالب فوراً على تقرير مفصل يبرز نقاط الضعف ويوجه لمراجعة صفحات معينة في الكتاب لإتقان المفهوم.'
                : 'Students receive an itemized report pinpointing weak topics and referencing exact pages to review.'}
            </p>
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
            {language === 'ar' ? 'بنية هندسية وتربوية متكاملة مصممة لملايين الطلاب في مختلف المراحل' : 'Built with high-scale architecture for millions of students across all stages'}
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

          {/* Feature 2: Strict Textbook Grounding */}
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

          {/* Feature 3: Actionable Formative Feedback */}
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

      {/* Curriculum Levels & Tracks Preview */}
      <section style={{ marginBottom: '3.5rem' }}>
        <div className="card" style={{ padding: '1.75rem 1.25rem' }}>
          <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
            <h3 style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--text-title)' }}>
              {language === 'ar' ? 'المراحل والشعب الدراسية المدعومة بالمنصة' : 'Supported Educational Stages & Tracks'}
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.25rem' }}>
              {language === 'ar' ? 'تغطية شاملة لكافة صفوف التعليم مع دعم لمدارس اللغات والمدارس العربية' : 'Comprehensive coverage for all school grades, with Language and Arabic curriculum tracks'}
            </p>
          </div>

          <div className="curriculum-grid">
            {/* Primary */}
            <div style={{
              border: '1.5px solid var(--border-light)',
              borderRadius: 'var(--radius-lg)',
              padding: '1.25rem',
              background: 'var(--bg-main)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                <span className="badge badge-primary">المرحلة الابتدائية</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>صفوف (4 - 5 - 6)</span>
              </div>
              <h4 style={{ fontWeight: 800, fontSize: '1.1rem', marginBottom: '0.4rem' }}>التأسيس المعرفي والمهاري</h4>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                تأسيس المفاهيم العلمية واللغوية بأسئلة سهلة ومباشرة تركز على التذكر والفهم والاستكشاف.
              </p>
            </div>

            {/* Preparatory */}
            <div style={{
              border: '2px solid var(--primary-400)',
              borderRadius: 'var(--radius-lg)',
              padding: '1.25rem',
              background: 'linear-gradient(135deg, #FFFFFF, #EFF6FF)',
              boxShadow: '0 8px 16px -4px rgba(37, 99, 235, 0.1)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                <span className="badge badge-success">المرحلة الإعدادية (نشطة بالكامل)</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--primary-700)', fontWeight: 700 }}>صفوف (1 - 2 - 3)</span>
              </div>
              <h4 style={{ fontWeight: 800, fontSize: '1.15rem', color: 'var(--primary-900)', marginBottom: '0.4rem' }}>الربط المنهجي العميق</h4>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-body)', lineHeight: 1.6 }}>
                كتاب العلوم وفصل المادة وخواصها مفهرس بالكامل، مع تقييم ذكي فوري بالذكاء الاصطناعي.
              </p>
            </div>

            {/* Secondary with Divisions */}
            <div style={{
              border: '1.5px solid var(--border-light)',
              borderRadius: 'var(--radius-lg)',
              padding: '1.25rem',
              background: 'var(--bg-main)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                <span className="badge badge-primary">المرحلة الثانوية</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>صفوف (1 - 2 - 3)</span>
              </div>
              <h4 style={{ fontWeight: 800, fontSize: '1.1rem', marginBottom: '0.4rem' }}>دعم الشعب والتخصصات</h4>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                شعبة علمي وأدبي، مع تخصص (علمي علوم وعلمي رياضة) لاختبارات قياس الفهم والتحليل والتقويم.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Comparison: Traditional vs Assessment for Education */}
      <section style={{ marginBottom: '3.5rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <span className="badge badge-primary" style={{ marginBottom: '0.5rem' }}>
            {language === 'ar' ? 'الفارق الحقيقي' : 'Educational Advantage'}
          </span>
          <h2 style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-title)' }}>
            {language === 'ar' ? 'التقييم التقليدي مقابل منصة التقييم من أجل التعليم' : 'Traditional Assessment vs Our Platform'}
          </h2>
        </div>

        <div className="comparison-grid">
          {/* Traditional */}
          <div className="card" style={{ background: '#FFFDFD', border: '1.5px solid #FEE2E2', padding: '1.5rem 1.25rem' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#DC2626', marginBottom: '1rem' }}>
              ❌ {language === 'ar' ? 'الامتحانات التقليدية' : 'Traditional Exams'}
            </h3>
            <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <li style={{ fontSize: '0.9rem', color: 'var(--text-body)' }}>• درجة رقمية صامتة دون توضيح سبب الخطأ أو التصحيح.</li>
              <li style={{ fontSize: '0.9rem', color: 'var(--text-body)' }}>• أسئلة عشوائية من الإنترنت لا تطابق كتاب الوزارة ومفاهيمه.</li>
              <li style={{ fontSize: '0.9rem', color: 'var(--text-body)' }}>• تصحيح متأخر يفقد الطالب فرصة تثبيت المعلومة سريعاً.</li>
              <li style={{ fontSize: '0.9rem', color: 'var(--text-body)' }}>• صعوبة حصر نقاط الضعف التراكمية لدى الطالب في كل وحدة دراسية.</li>
            </ul>
          </div>

          {/* Assessment for Education */}
          <div className="card" style={{ background: '#F0FDF4', border: '2px solid #86EFAC', padding: '1.5rem 1.25rem' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#15803D', marginBottom: '1rem' }}>
              ✅ {language === 'ar' ? 'منصة التقييم من أجل التعليم' : 'Assessment for Education Platform'}
            </h3>
            <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <li style={{ fontSize: '0.9rem', color: 'var(--text-body)', fontWeight: 600 }}>
                • تشخيص فوري لكل خطأ مع توجيه مباشر لرقم الصفحة في الكتاب.
              </li>
              <li style={{ fontSize: '0.9rem', color: 'var(--text-body)', fontWeight: 600 }}>
                • أسئلة مشتقة حصرياً وبدقة 100% من فصول وفقرات المنهج الرسمي.
              </li>
              <li style={{ fontSize: '0.9rem', color: 'var(--text-body)', fontWeight: 600 }}>
                • تحليل تراكمي لمستوى الإتقان يحدد نقاط القوة والضعف للطالب.
              </li>
              <li style={{ fontSize: '0.9rem', color: 'var(--text-body)', fontWeight: 600 }}>
                • عداد تنازلي تفاعلي مع توزيع عشوائي للخيارات لمنع التخمين.
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* FAQ Accordion Section */}
      <section style={{ marginBottom: '3.5rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <span className="badge badge-primary" style={{ marginBottom: '0.5rem' }}>
            {language === 'ar' ? 'الأسئلة الشائعة' : 'FAQ'}
          </span>
          <h2 style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-title)' }}>
            {language === 'ar' ? 'كل ما تود معرفته عن المنصة' : 'Frequently Asked Questions'}
          </h2>
        </div>

        <div style={{ maxWidth: '820px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {faqs.map((faq, index) => {
            const isOpen = openFaqIndex === index;
            return (
              <div 
                key={index}
                className="card"
                style={{
                  padding: '1.25rem 1.5rem',
                  cursor: 'pointer',
                  border: isOpen ? '1.5px solid var(--primary-400)' : '1px solid var(--border-light)',
                  background: isOpen ? 'var(--primary-50)' : 'var(--bg-card)',
                  transition: 'all 0.2s ease'
                }}
                onClick={() => toggleFaq(index)}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-title)' }}>
                    {language === 'ar' ? faq.q_ar : faq.q_en}
                  </h3>
                  {isOpen ? <ChevronUp size={20} color="var(--primary-600)" /> : <ChevronDown size={20} color="var(--text-muted)" />}
                </div>

                {isOpen && (
                  <p style={{ marginTop: '0.75rem', color: 'var(--text-body)', fontSize: '0.925rem', lineHeight: 1.7, borderTop: '1px solid rgba(0,0,0,0.06)', paddingTop: '0.75rem' }}>
                    {language === 'ar' ? faq.a_ar : faq.a_en}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Educational Excellence Charter & Pillars Section (Modern UI Boxes) */}
      <section style={{ marginBottom: '3rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <span className="badge badge-primary" style={{ marginBottom: '0.5rem' }}>
            {language === 'ar' ? 'ميثاق التميز التربوي والتقني' : 'Pedagogical Excellence Charter'}
          </span>
          <h2 style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-title)' }}>
            {language === 'ar' ? 'ركائز منظومة التقييم من أجل التعليم' : 'Core Pillars of the Assessment Platform'}
          </h2>
          <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem', maxWidth: '680px', margin: '0.5rem auto 0', lineHeight: 1.6 }}>
            {language === 'ar'
              ? 'معايير علمية وتطبيقية صارمة تضمن أعلى مستويات الدقة والأمان وتوفر للطالب بيئة تقويم تشخيصي موثوقة'
              : 'Rigorous pedagogical and technical benchmarks ensuring peak diagnostic accuracy, student safety, and curriculum alignment.'}
          </p>
        </div>

        <div className="pillars-grid">
          {/* Pillar 1 */}
          <div className="card" style={{
            background: 'linear-gradient(145deg, #FFFFFF, #EFF6FF)',
            border: '1.5px solid var(--primary-100)',
            padding: '1.5rem 1.25rem',
            borderRadius: 'var(--radius-lg)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            boxShadow: '0 4px 14px rgba(37, 99, 235, 0.05)'
          }}>
            <div>
              <div style={{
                width: '46px',
                height: '46px',
                borderRadius: 'var(--radius-md)',
                background: 'linear-gradient(135deg, var(--primary-600), var(--primary-800))',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '1rem',
                boxShadow: '0 4px 10px rgba(37, 99, 235, 0.25)'
              }}>
                <ShieldCheck size={24} />
              </div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--primary-900)', marginBottom: '0.5rem' }}>
                {language === 'ar' ? 'عزل الصفوف وأمان المنهج' : 'Strict Stage & Grade Security'}
              </h3>
              <p style={{ color: 'var(--text-body)', fontSize: '0.9rem', lineHeight: 1.7 }}>
                {language === 'ar'
                  ? 'وصول محمي ومخصص بالكامل؛ يحصل كل طالب فقط على كتب وامتحانات ومحتوى صفه الدراسي المقيد به، دون أي تشتت أو خلط بين المراحل.'
                  : 'Isolated curriculum access ensuring students only interact with textbooks and evaluations designated for their exact registered academic stage.'}
              </p>
            </div>
            <div style={{ marginTop: '1.25rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-light)' }}>
              <span className="badge badge-primary" style={{ fontSize: '0.75rem' }}>
                {language === 'ar' ? 'أمان وموثوقية 100%' : '100% Stage Isolation'}
              </span>
            </div>
          </div>

          {/* Pillar 2 */}
          <div className="card" style={{
            background: 'linear-gradient(145deg, #FFFFFF, #F0FDF4)',
            border: '1.5px solid #DCFCE7',
            padding: '1.5rem 1.25rem',
            borderRadius: 'var(--radius-lg)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            boxShadow: '0 4px 14px rgba(22, 163, 74, 0.05)'
          }}>
            <div>
              <div style={{
                width: '46px',
                height: '46px',
                borderRadius: 'var(--radius-md)',
                background: 'linear-gradient(135deg, var(--success-500), var(--success-700))',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '1rem',
                boxShadow: '0 4px 10px rgba(22, 163, 74, 0.25)'
              }}>
                <BookOpen size={24} />
              </div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#166534', marginBottom: '0.5rem' }}>
                {language === 'ar' ? 'دقة مراجع الكتب والصفحات' : 'Official Page Citations'}
              </h3>
              <p style={{ color: 'var(--text-body)', fontSize: '0.9rem', lineHeight: 1.7 }}>
                {language === 'ar'
                  ? 'ربط كل سؤال واختبار بنص الكتاب المدرسي الرسمي ورقم الصفحة بدقة متناهية، لمنع الهلوسة وضمان مطابقة معايير الامتحانات الوزارية.'
                  : 'Every diagnostic question is tied directly to official textbook passages with precise page references, preventing hallucinations.'}
              </p>
            </div>
            <div style={{ marginTop: '1.25rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-light)' }}>
              <span className="badge badge-success" style={{ fontSize: '0.75rem' }}>
                {language === 'ar' ? 'موثق بالصفحة والفقرة' : 'Exact Page Alignment'}
              </span>
            </div>
          </div>

          {/* Pillar 3 */}
          <div className="card" style={{
            background: 'linear-gradient(145deg, #FFFFFF, #FFFBEB)',
            border: '1.5px solid #FEF3C7',
            padding: '1.5rem 1.25rem',
            borderRadius: 'var(--radius-lg)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            boxShadow: '0 4px 14px rgba(217, 119, 6, 0.05)'
          }}>
            <div>
              <div style={{
                width: '46px',
                height: '46px',
                borderRadius: 'var(--radius-md)',
                background: 'linear-gradient(135deg, var(--warning-500), var(--warning-600))',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '1rem',
                boxShadow: '0 4px 10px rgba(217, 119, 6, 0.25)'
              }}>
                <Target size={24} />
              </div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#92400E', marginBottom: '0.5rem' }}>
                {language === 'ar' ? 'خطة علاجية وتشخيص فوري' : 'Actionable Remedial Feedback'}
              </h3>
              <p style={{ color: 'var(--text-body)', fontSize: '0.9rem', lineHeight: 1.7 }}>
                {language === 'ar'
                  ? 'لا نكتفي بإعطاء درجات رقمية، بل يشخص النظام سبب الخطأ والمفهوم الناقص، ويوجه الطالب مباشرة: "راجع الفصل الأول - صفحة 7".'
                  : 'Moves beyond raw grades by pinpointing the specific misconception, explaining why choices are incorrect with study prescriptions.'}
              </p>
            </div>
            <div style={{ marginTop: '1.25rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-light)' }}>
              <span className="badge" style={{ background: '#FEF3C7', color: '#92400E', fontSize: '0.75rem' }}>
                {language === 'ar' ? 'تشخيص مفاهيمي متقدم' : 'Instant Misconception Diagnosis'}
              </span>
            </div>
          </div>

          {/* Pillar 4 */}
          <div className="card" style={{
            background: 'linear-gradient(145deg, #FFFFFF, #FAF5FF)',
            border: '1.5px solid #F3E8FF',
            padding: '1.5rem 1.25rem',
            borderRadius: 'var(--radius-lg)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            boxShadow: '0 4px 14px rgba(147, 51, 234, 0.05)'
          }}>
            <div>
              <div style={{
                width: '46px',
                height: '46px',
                borderRadius: 'var(--radius-md)',
                background: 'linear-gradient(135deg, #7C3AED, #6D28D9)',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '1rem',
                boxShadow: '0 4px 10px rgba(124, 58, 237, 0.25)'
              }}>
                <BarChart3 size={24} />
              </div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#6B21A8', marginBottom: '0.5rem' }}>
                {language === 'ar' ? 'تحليلات طولية ومستوى الإتقان' : 'Longitudinal Mastery Analytics'}
              </h3>
              <p style={{ color: 'var(--text-body)', fontSize: '0.9rem', lineHeight: 1.7 }}>
                {language === 'ar'
                  ? 'متابعة تراكمية للأداء عبر الفصول والوحدات، مع تصنيف دقيق لمستوى استيعاب المفاهيم (متقن، متطور، بحاجة لدعم) لدعم مسار التعلم.'
                  : 'Track longitudinal learning curve with granular topic mastery metrics, enabling students and teachers to measure real progress.'}
              </p>
            </div>
            <div style={{ marginTop: '1.25rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-light)' }}>
              <span className="badge" style={{ background: '#F3E8FF', color: '#6B21A8', fontSize: '0.75rem' }}>
                {language === 'ar' ? 'مؤشرات أداء شاملة' : 'Continuous Progress Tracking'}
              </span>
            </div>
          </div>
        </div>

        {/* Quality Assurance Ribbon */}
        <div style={{
          background: 'linear-gradient(135deg, #F8FAFC, #EFF6FF)',
          border: '1.5px solid var(--primary-200)',
          borderRadius: 'var(--radius-lg)',
          padding: '1.25rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '1rem',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, minWidth: '220px' }}>
            <Award size={26} color="var(--primary-700)" style={{ flexShrink: 0 }} />
            <div>
              <div style={{ fontWeight: 800, color: 'var(--primary-900)', fontSize: '1rem' }}>
                {language === 'ar' ? 'معايير الجودة والاعتماد الأكاديمي للتقويم التربوي' : 'Certified Academic Quality & Evaluation Standards'}
              </div>
              <div style={{ fontSize: '0.825rem', color: 'var(--text-muted)' }}>
                {language === 'ar' ? 'مطور وفق أحدث نظريات القياس والتقويم بالذكاء الاصطناعي بواسطة فريق DevTech' : 'Engineered under modern psychometric & AI diagnostic frameworks by DevTech'}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
            <span className="badge badge-success" style={{ fontSize: '0.8rem', padding: '0.4rem 0.85rem' }}>
              {language === 'ar' ? '✓ نظام نشط ومحدث 2026' : '✓ Active System 2026'}
            </span>
          </div>
        </div>
      </section>
    </div>
  );
};
