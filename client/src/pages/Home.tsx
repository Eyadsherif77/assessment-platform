import React, { useState } from 'react';
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
  Target,
  ChevronDown,
  ChevronUp
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
      q_ar: 'هل يمكن للمعلمين رفع كتبهم وامتحاناتهم الخاصة؟',
      q_en: 'Can teachers upload custom textbooks and period exams?',
      a_ar: 'بالتأكيد. تتيح لوحة تحكم المعلم رفع ملفات الكتب بصيغة PDF ليقوم النظام بفهرستها فورياً، مع إمكانية تصميم امتحانات دورية بمؤقت زمني ومراقبة مستوى استيعاب الطلاب تلقائياً.',
      a_en: 'Yes! Teachers can upload PDF curriculum textbooks for instant AI indexing, create timed periodic assessments, and monitor whole-class analytics in real time.'
    }
  ];

  return (
    <div>
      {/* Hero Banner */}
      <section className="hero-banner" style={{ position: 'relative', overflow: 'hidden' }}>
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

          <h1 className="hero-title" style={{ fontSize: '2.5rem', lineHeight: 1.25, fontWeight: 900, marginBottom: '1rem' }}>
            {t.heroTitle}
          </h1>
          <p className="hero-subtitle" style={{ fontSize: '1.15rem', lineHeight: 1.7, maxWidth: '780px', margin: '0 auto 2rem' }}>
            {t.heroSubtitle}
          </p>

          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            {user ? (
              <button 
                className="btn btn-secondary btn-lg" 
                onClick={onGoToDashboard}
                style={{ fontWeight: 800, padding: '0.85rem 1.75rem' }}
              >
                <span>{user.role === 'STUDENT' ? t.studentDashboard : t.teacherDashboard}</span>
                <ArrowIcon size={20} />
              </button>
            ) : (
              <>
                <button 
                  className="btn btn-secondary btn-lg" 
                  onClick={() => onOpenAuth('register')}
                  style={{ fontWeight: 800, padding: '0.85rem 1.75rem' }}
                >
                  <GraduationCap size={22} />
                  <span>{t.heroCtaStudent}</span>
                </button>
                <button 
                  className="btn btn-outline btn-lg" 
                  onClick={() => onOpenAuth('login')}
                  style={{ color: 'white', borderColor: 'rgba(255, 255, 255, 0.5)', fontWeight: 700, padding: '0.85rem 1.75rem' }}
                >
                  <span>{t.heroCtaTeacher}</span>
                </button>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Live Educational Metrics Bar */}
      <section style={{ marginTop: '-1.5rem', marginBottom: '3.5rem', position: 'relative', zIndex: 10 }}>
        <div className="card glass-panel" style={{
          padding: '1.5rem 1rem',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '1.5rem',
          textAlign: 'center',
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
        <div className="card" style={{
          background: 'linear-gradient(135deg, #FFFFFF, #EFF6FF)',
          border: '1.5px solid var(--primary-200)',
          padding: '2.25rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1.5rem', flexWrap: 'wrap' }}>
            <div style={{
              width: '60px',
              height: '60px',
              borderRadius: 'var(--radius-lg)',
              background: 'linear-gradient(135deg, var(--primary-600), var(--primary-800))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              flexShrink: 0,
              boxShadow: '0 8px 16px -4px rgba(37, 99, 235, 0.3)'
            }}>
              <Target size={32} />
            </div>
            <div style={{ flex: 1, minWidth: '280px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                <h3 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--primary-800)' }}>
                  {language === 'ar' ? 'فلسفة المنصة: تقييم تشخيصي مرتبط بنصوص الكتاب المدرسي' : 'Curriculum-Linked Diagnostic Assessment'}
                </h3>
                <span className="badge badge-primary">{language === 'ar' ? 'ذكاء اصطناعي تشخيصي' : 'Diagnostic AI'}</span>
              </div>
              <p style={{ color: 'var(--text-body)', lineHeight: 1.8, fontSize: '1rem' }}>
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
                ? 'يقوم المعلم برفع ملف الكتاب المدرسي بصيغة PDF وتحديد المرحلة والصف والمادة بدقة لضمان عزل المناهج.'
                : 'Teachers upload curriculum textbook PDFs strictly scoped to the exact stage, grade, and subject.'}
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
        <div className="card" style={{ padding: '2.5rem 2rem' }}>
          <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
            <h3 style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--text-title)' }}>
              {language === 'ar' ? 'المراحل والشعب الدراسية المدعومة بالمنصة' : 'Supported Educational Stages & Tracks'}
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.25rem' }}>
              {language === 'ar' ? 'تغطية شاملة لكافة صفوف التعليم مع دعم لمدارس اللغات والمدارس العربية' : 'Comprehensive coverage for all school grades, with Language and Arabic curriculum tracks'}
            </p>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '1.25rem'
          }}>
            {/* Primary */}
            <div style={{
              border: '1.5px solid var(--border-light)',
              borderRadius: 'var(--radius-lg)',
              padding: '1.5rem',
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
              padding: '1.5rem',
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
              padding: '1.5rem',
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

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '1.5rem'
        }}>
          {/* Traditional */}
          <div className="card" style={{ background: '#FFFDFD', border: '1.5px solid #FEE2E2', padding: '2rem' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#DC2626', marginBottom: '1rem' }}>
              ❌ {language === 'ar' ? 'الامتحانات التقليدية' : 'Traditional Exams'}
            </h3>
            <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <li style={{ fontSize: '0.9rem', color: 'var(--text-body)' }}>• درجة رقمية صامتة دون توضيح سبب الخطأ أو التصحيح.</li>
              <li style={{ fontSize: '0.9rem', color: 'var(--text-body)' }}>• أسئلة عشوائية من الإنترنت لا تطابق كتاب الوزارة ومفاهيمه.</li>
              <li style={{ fontSize: '0.9rem', color: 'var(--text-body)' }}>• تصحيح متأخر يفقد الطالب فرصة تثبيت المعلومة سريعاً.</li>
              <li style={{ fontSize: '0.9rem', color: 'var(--text-body)' }}>• صعوبة حصر نقاط ضعف الفصل الدراسي لكل معلم.</li>
            </ul>
          </div>

          {/* Assessment for Education */}
          <div className="card" style={{ background: '#F0FDF4', border: '2px solid #86EFAC', padding: '2rem' }}>
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

      {/* Final Call to Action Box */}
      <section style={{ marginBottom: '2.5rem' }}>
        <div className="card" style={{
          background: 'linear-gradient(135deg, var(--primary-700), var(--primary-900))',
          color: 'white',
          padding: '2.75rem 2rem',
          textAlign: 'center',
          borderRadius: 'var(--radius-xl)',
          boxShadow: '0 20px 30px -10px rgba(30, 58, 138, 0.3)'
        }}>
          <h2 style={{ fontSize: '1.85rem', fontWeight: 900, marginBottom: '0.75rem', color: 'white' }}>
            {language === 'ar' ? 'ابدأ تجربة التقويم الذكي الآن مجاناً' : 'Experience Next-Gen Diagnostic Assessment Today'}
          </h2>
          <p style={{ maxWidth: '640px', margin: '0 auto 1.75rem', fontSize: '1.05rem', opacity: 0.9, lineHeight: 1.7 }}>
            {language === 'ar'
              ? 'انضم إلى المنظومة التعليمية الرقمية المعتمدة المستندة لكتب المناهج واختبر مهاراتك مع التغذية الراجعة الفورية بالذكاء الاصطناعي.'
              : 'Join the official educational platform and test your mastery with real-time curriculum diagnostic feedback.'}
          </p>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button 
              className="btn btn-secondary btn-lg" 
              onClick={() => onOpenAuth('register')}
              style={{ fontWeight: 800, padding: '0.85rem 2rem' }}
            >
              <Sparkles size={20} />
              <span>{language === 'ar' ? 'إنشاء حساب طالب مجاناً' : 'Create Free Student Account'}</span>
            </button>
            <button 
              className="btn btn-outline btn-lg" 
              onClick={() => onOpenAuth('login')}
              style={{ color: 'white', borderColor: 'rgba(255, 255, 255, 0.5)', fontWeight: 700 }}
            >
              <span>{language === 'ar' ? 'تسجيل دخول المعلمين' : 'Teacher Portal'}</span>
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};
