import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiUrl } from '../utils/api';
import { cleanArabicText } from '../utils/arabicTextNormalizer';
import { 
  BookOpen, 
  Sparkles, 
  Award, 
  BarChart3, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  ArrowRight,
  ArrowLeft,
  BrainCircuit,
  BookmarkCheck,
  Flame,
  Target,
  LayoutDashboard,
  ShieldCheck,
  Edit3
} from 'lucide-react';

export const StudentDashboard: React.FC = () => {
  const { user, token, language, updateUserProfile } = useAuth();
  const isAr = language === 'ar';
  const ArrowIcon = isAr ? ArrowLeft : ArrowRight;

  const getInitialTab = (): 'home' | 'ai' | 'books' | 'exams' | 'analytics' => {
    try {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get('tab');
      if (tab === 'home' || tab === 'books' || tab === 'exams' || tab === 'ai' || tab === 'analytics') return tab as any;
      const saved = localStorage.getItem('student_active_tab');
      if (saved === 'home' || saved === 'books' || saved === 'exams' || saved === 'ai' || saved === 'analytics') return saved as any;
    } catch (_) {}
    return 'home';
  };

  const [activeTab, setActiveTabState] = useState<'home' | 'ai' | 'books' | 'exams' | 'analytics'>(getInitialTab);

  const setActiveTab = (tab: 'home' | 'ai' | 'books' | 'exams' | 'analytics') => {
    setActiveTabState(tab);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', tab);
      window.history.replaceState({}, '', url.toString());
      localStorage.setItem('student_active_tab', tab);
    } catch (_) {}
  };

  // Books Data
  const [books, setBooks] = useState<any[]>([]);
  const [selectedBook, setSelectedBook] = useState<any | null>(null);
  const [selectedChapterChunks, setSelectedChapterChunks] = useState<any[]>([]);
  const [readingChapter, setReadingChapter] = useState<any | null>(null);
  const [loadingChapterId, setLoadingChapterId] = useState<string | null>(null);

  // Exams Data
  const [exams, setExams] = useState<any[]>([]);
  const [activeExam, setActiveExam] = useState<any | null>(null);
  const [examAnswers, setExamAnswers] = useState<Record<string, string>>({});
  const [examResult, setExamResult] = useState<any | null>(null);
  const [isSubmittingExam, setIsSubmittingExam] = useState(false);
  const [examTimeLeft, setExamTimeLeft] = useState<number | null>(null);

  // Format countdown time MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Guided AI Tutor Assessment Flow State (6 Steps)
  // Step 1: Subject, Step 2: Chapter, Step 3: Generate, Step 4: Solve, Step 5: Diagnosis, Step 6: Study
  const [aiStep, setAiStep] = useState<number>(1);
  const [selectedAiBook, setSelectedAiBook] = useState<any | null>(null);
  const [selectedAiChapterId, setSelectedAiChapterId] = useState<string>('');
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [aiQuestions, setAiQuestions] = useState<any[]>([]);
  const [serverContextQuestions, setServerContextQuestions] = useState<any[]>([]);
  const [aiAnswers, setAiAnswers] = useState<Record<string, string>>({});
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0);
  const [isEvaluatingAi, setIsEvaluatingAi] = useState(false);
  const [aiReport, setAiReport] = useState<any | null>(null);

  // Learning Analytics Data
  const [analytics, setAnalytics] = useState<any | null>(null);

  // Profile edit modal state
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [allStages, setAllStages] = useState<any[]>([]);
  const [editStageId, setEditStageId] = useState(user?.profile?.academic_stage_id || '');
  const [editGradeId, setEditGradeId] = useState(user?.profile?.grade_id || '');
  const [editSchoolType, setEditSchoolType] = useState<'عربي' | 'لغات'>((user?.profile?.school_type as any) || 'عربي');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Reload student restricted books and exams
  const reloadStudentContent = () => {
    if (!token) return;
    fetch(apiUrl('/api/books'), {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          setBooks(data);
          if (data.length > 0) {
            handleSelectAiBook(data[0]);
          } else {
            setSelectedAiBook(null);
          }
        }
      })
      .catch(console.error);

    fetch(apiUrl('/api/exams'), {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setExams(data);
      })
      .catch(console.error);
  };

  const handleOpenProfileModal = () => {
    setEditStageId(user?.profile?.academic_stage_id || '');
    setEditGradeId(user?.profile?.grade_id || '');
    setEditSchoolType((user?.profile?.school_type as any) || 'عربي');
    setShowProfileModal(true);

    if (allStages.length === 0) {
      fetch(apiUrl('/api/meta/stages'))
        .then(r => r.json())
        .then(data => {
          if (Array.isArray(data)) {
            setAllStages(data);
            if (!editStageId && data.length > 0) {
              setEditStageId(data[0].id);
            }
          }
        })
        .catch(console.error);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editStageId || !editGradeId) return;

    setIsSavingProfile(true);
    try {
      const res = await fetch(apiUrl('/api/auth/profile'), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          academicStageId: editStageId,
          gradeId: editGradeId,
          schoolType: editSchoolType
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل تحديث البيانات');

      if (data.profile) {
        updateUserProfile(data.profile);
      }
      setShowProfileModal(false);
      reloadStudentContent();
      alert(isAr ? 'تم تحديث الصف الدراسي ونوع المدرسة بنجاح! تم تحديث المناهج والاختبارات المطابقة.' : 'Grade and school type updated successfully!');
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsSavingProfile(false);
    }
  };

  // Fetch books & exams on mount
  useEffect(() => {
    if (!token) return;
    reloadStudentContent();
    loadAnalytics();
  }, [token]);

  useEffect(() => {
    if (books.length > 0 && !selectedAiBook) {
      handleSelectAiBook(books[0]);
    }
  }, [books, selectedAiBook]);

  const loadAnalytics = () => {
    if (!token) return;
    fetch(apiUrl('/api/analytics/student'), {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(data => {
        setAnalytics(data);
      })
      .catch(console.error);
  };

  // Live Exam Countdown Timer Effect
  useEffect(() => {
    if (!activeExam || examTimeLeft === null || examResult) return;

    if (examTimeLeft <= 0) {
      handleSubmitExam();
      return;
    }

    const timerInterval = setInterval(() => {
      setExamTimeLeft(prev => (prev !== null && prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(timerInterval);
  }, [activeExam, examTimeLeft, examResult]);

  const handleOpenBookDetails = async (bookId: string) => {
    try {
      const res = await fetch(apiUrl(`/api/books/${bookId}`), {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setSelectedBook(data);
    } catch (e) {
      console.error(e);
    }
  };

  const handleReadChapter = async (bookId: string, chapter: any) => {
    if (readingChapter?.id === chapter.id) {
      setReadingChapter(null);
      setSelectedChapterChunks([]);
      return;
    }
    setReadingChapter(chapter);
    setLoadingChapterId(chapter.id);
    setSelectedChapterChunks([]);
    try {
      const res = await fetch(apiUrl(`/api/books/${bookId}/chapters/${chapter.id}/chunks`), {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setSelectedChapterChunks(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      setSelectedChapterChunks([]);
    } finally {
      setLoadingChapterId(null);
    }
  };

  // Start taking an exam
  const handleStartExam = async (examId: string) => {
    try {
      const res = await fetch(apiUrl(`/api/exams/${examId}`), {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setActiveExam(data);
      setExamAnswers({});
      setExamResult(null);

      const durationMin = parseInt(data.exam?.duration_minutes, 10) || 15;
      setExamTimeLeft(durationMin * 60);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSubmitExam = async () => {
    if (!activeExam) return;
    setIsSubmittingExam(true);
    setExamTimeLeft(null);
    try {
      const answersPayload = Object.entries(examAnswers).map(([qId, optId]) => ({
        question_id: qId,
        selected_option_id: optId
      }));

      const res = await fetch(apiUrl(`/api/exams/${activeExam.exam.id}/submit`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ answers: answersPayload })
      });
      const data = await res.json();
      setExamResult(data);
      loadAnalytics();
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmittingExam(false);
    }
  };

  // AI Evaluation
  const handleSelectAiBook = async (book: any) => {
    try {
      const res = await fetch(apiUrl(`/api/books/${book.id}`), {
        headers: { Authorization: `Bearer ${token}` }
      });
      const fullBook = await res.json();
      setSelectedAiBook(fullBook);
      if (fullBook.chapters?.length > 0) {
        setSelectedAiChapterId(fullBook.chapters[0].id);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleGenerateAiAssessment = async () => {
    if (!selectedAiBook || !selectedAiChapterId) return;
    setIsGeneratingAi(true);
    setAiReport(null);
    setAiAnswers({});
    setCurrentQuestionIndex(0);

    try {
      const res = await fetch(apiUrl('/api/ai/generate-quiz'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          book_id: selectedAiBook.id,
          chapter_id: selectedAiChapterId,
          subject_id: selectedAiBook.subject_id,
          count: 5
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل توليد التقييم');

      setAiQuestions(data.questions || []);
      setServerContextQuestions(data._server_context_questions || []);
      setAiStep(4); // Advance to solve step
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsGeneratingAi(false);
    }
  };

  const handleSubmitAiEvaluation = async () => {
    if (!selectedAiBook || !selectedAiChapterId || aiQuestions.length === 0) return;
    setIsEvaluatingAi(true);

    try {
      const answersList = aiQuestions.map(q => ({
        question_id: q.id,
        selected_option_id: aiAnswers[q.id] || ''
      }));

      const res = await fetch(apiUrl('/api/ai/evaluate'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          book_id: selectedAiBook.id,
          chapter_id: selectedAiChapterId,
          subject_id: selectedAiBook.subject_id,
          questions: serverContextQuestions,
          answers: answersList
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل تشخيص الإجابات');

      setAiReport(data.report);
      loadAnalytics();
      setAiStep(5); // Advance to diagnosis step
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsEvaluatingAi(false);
    }
  };

  return (
    <div className="workspace-wrapper">

      {/* =========================================================
          DESKTOP SIDEBAR NAVIGATION
          ========================================================= */}
      <aside className="workspace-sidebar">
        {/* Student Mini Profile */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          paddingBottom: '1.25rem',
          borderBottom: '1px solid var(--border-light)'
        }}>
          <div style={{
            width: '46px',
            height: '46px',
            borderRadius: 'var(--radius-full)',
            background: 'linear-gradient(135deg, var(--primary-600), var(--primary-800))',
            color: '#FFFFFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 800,
            fontSize: '1.2rem',
            boxShadow: 'var(--shadow-blue)',
            flexShrink: 0
          }}>
            {user?.fullName?.charAt(0) || 'ط'}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-title)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {user?.fullName}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              <div style={{ fontWeight: 600 }}>{isAr ? (user?.profile?.grade_name_ar || 'الصف الأول الإعدادي') : (user?.profile?.grade_name_en || 'Prep 1')}</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '2px' }}>
                <span style={{ fontSize: '0.7rem', color: 'var(--primary-700)', fontWeight: 700 }}>
                  {user?.profile?.school_type === 'لغات' ? (isAr ? '🌐 مدارس لغات' : '🌐 Language School') : (isAr ? '🏫 مدارس عربي' : '🏫 Arabic School')}
                </span>
                <button
                  onClick={handleOpenProfileModal}
                  title={isAr ? 'تغيير الصف أو نوع المدرسة' : 'Change grade or school type'}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary-600)', padding: '2px', display: 'flex' }}
                >
                  <Edit3 size={13} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Motivation Streak Chip */}
        <div style={{ textAlign: 'center' }}>
          <span className="streak-chip" style={{ width: '100%', justifyContent: 'center' }}>
            <Flame size={16} color="#D97706" />
            <span>{isAr ? '5 أيام دراسية متتالية 🔥' : '5-Day Study Streak 🔥'}</span>
          </span>
        </div>

        {/* Sidebar Nav Buttons */}
        <nav className="sidebar-nav">
          <button
            className={`sidebar-btn ${activeTab === 'home' ? 'active' : ''}`}
            onClick={() => setActiveTab('home')}
          >
            <LayoutDashboard size={18} />
            <span>{isAr ? 'مسار التعلم (الرئيسية)' : 'Learning Path (Home)'}</span>
          </button>

          <button
            className={`sidebar-btn ${activeTab === 'ai' ? 'active' : ''}`}
            onClick={() => setActiveTab('ai')}
          >
            <BrainCircuit size={18} />
            <span>{isAr ? 'المعلم الذكي والتقييم' : 'Smart AI Tutor'}</span>
            <span className="sidebar-badge badge-primary">{isAr ? 'تفاعلي' : 'Interactive'}</span>
          </button>

          <button
            className={`sidebar-btn ${activeTab === 'books' ? 'active' : ''}`}
            onClick={() => setActiveTab('books')}
          >
            <BookOpen size={18} />
            <span>{isAr ? `كتبي ومناهجي (${books.length})` : `My Textbooks (${books.length})`}</span>
          </button>

          <button
            className={`sidebar-btn ${activeTab === 'exams' ? 'active' : ''}`}
            onClick={() => setActiveTab('exams')}
          >
            <Clock size={18} />
            <span>{isAr ? `الامتحانات المجدولة (${exams.length})` : `Scheduled Exams (${exams.length})`}</span>
          </button>

          <button
            className={`sidebar-btn ${activeTab === 'analytics' ? 'active' : ''}`}
            onClick={() => setActiveTab('analytics')}
          >
            <BarChart3 size={18} />
            <span>{isAr ? 'سجل الإتقان والتقدم' : 'Mastery & Analytics'}</span>
          </button>
        </nav>

        {/* Bottom Support Info */}
        <div style={{ marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid var(--border-light)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 700, color: 'var(--primary-700)', marginBottom: '0.2rem' }}>
            <ShieldCheck size={14} />
            <span>{isAr ? 'منهج وزاري معتمد 2026' : 'Certified Curriculum 2026'}</span>
          </div>
          <div>{isAr ? 'مرتبط حصرياً بكتب مدرستك' : 'Grounded in official school textbooks'}</div>
        </div>
      </aside>

      {/* =========================================================
          WORKSPACE MAIN CONTENT
          ========================================================= */}
      <main className="workspace-content">

        {/* =========================================================
            TAB 1: PERSONALIZED LEARNING HOME & MOTIVATION LAYER
            ========================================================= */}
        {activeTab === 'home' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            
            {/* Welcome Banner */}
            <div className="card" style={{
              background: 'linear-gradient(135deg, #0F172A 0%, #1E3A8A 100%)',
              color: '#FFFFFF',
              padding: '1.75rem 2rem',
              borderRadius: 'var(--radius-xl)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '1.5rem',
              flexWrap: 'wrap'
            }}>
              <div>
                <span className="badge badge-primary" style={{ background: 'rgba(255,255,255,0.15)', color: '#FFFFFF', marginBottom: '0.5rem' }}>
                  {isAr ? 'مرحباً بك مجدداً 🌟' : 'Welcome Back 🌟'}
                </span>
                <h2 style={{ fontSize: '1.6rem', fontWeight: 900, margin: '0.25rem 0 0.5rem', color: '#FFFFFF' }}>
                  {isAr ? `أهلاً ${user?.fullName}` : `Hello, ${user?.fullName}`}
                </h2>
                <p style={{ color: '#CBD5E1', fontSize: '0.9rem', margin: 0, lineHeight: 1.5 }}>
                  {isAr
                    ? <>أنت مسجل في <strong>{user?.profile?.grade_name_ar || 'الصف الأول الإعدادي'}</strong> • <strong>{user?.profile?.school_type === 'لغات' ? '🌐 مدارس لغات' : '🏫 مدارس عربي'}</strong> • مناهج وكتب مخصصة ومطابقة 100%.</>
                    : <>Enrolled in <strong>{user?.profile?.grade_name_en || 'Prep 1'}</strong> • <strong>{user?.profile?.school_type === 'لغات' ? 'Language School' : 'Arabic School'}</strong> • 100% textbook-grounded curriculum.</>}
                </p>
                <div style={{ marginTop: '0.6rem' }}>
                  <button
                    onClick={handleOpenProfileModal}
                    className="btn btn-outline btn-sm"
                    style={{ color: '#FFFFFF', borderColor: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', padding: '0.25rem 0.65rem' }}
                  >
                    <Edit3 size={12} style={{ marginInlineEnd: '4px' }} />
                    <span>{isAr ? 'تعديل الصف أو نوع المدرسة ⚙️' : 'Change Grade / School Type ⚙️'}</span>
                  </button>
                </div>
              </div>

              <button
                className="btn btn-secondary banner-action-btn"
                onClick={() => { setActiveTab('ai'); setAiStep(1); }}
                style={{ fontWeight: 800, padding: '0.75rem 1.5rem', borderRadius: 'var(--radius-full)' }}
              >
                <span>{isAr ? 'ابدأ تقييماً تشخيصياً الآن' : 'Start Diagnostic Quiz Now'}</span>
                <ArrowIcon size={16} />
              </button>
            </div>

            {/* Motivation Layer Grid */}
            <div className="motivation-widget-grid">
              {/* Widget 1: Streak */}
              <div className="goal-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                    {isAr ? 'الحماس الدراسي (Streak)' : 'Study Streak'}
                  </span>
                  <Flame size={18} color="#D97706" />
                </div>
                <div style={{ fontSize: '1.75rem', fontWeight: 900, color: '#D97706' }}>
                  {isAr ? '5 أيام 🔥' : '5 Days 🔥'}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  {isAr ? 'حافظ على تقييم يومي لرفع تركيزك الدراسي!' : 'Keep up a daily quiz to boost retention!'}
                </div>
              </div>

              {/* Widget 2: Weekly Goal */}
              <div className="goal-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                    {isAr ? 'الهدف الأسبوعي' : 'Weekly Goal'}
                  </span>
                  <Target size={18} color="var(--primary-600)" />
                </div>
                <div style={{ fontSize: '1.75rem', fontWeight: 900, color: 'var(--primary-700)' }}>
                  {analytics?.totalAttempts ? `${Math.min(analytics.totalAttempts, 5)} / 5` : '3 / 5'}
                </div>
                <div style={{ width: '100%', height: '6px', background: 'var(--border-light)', borderRadius: '999px', overflow: 'hidden' }}>
                  <div style={{ width: '65%', height: '100%', background: 'var(--primary-600)', borderRadius: '999px' }} />
                </div>
              </div>

              {/* Widget 3: Overall Mastery */}
              <div className="goal-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                    {isAr ? 'معدل الإتقان العام' : 'Overall Mastery'}
                  </span>
                  <Award size={18} color="#16A34A" />
                </div>
                <div style={{ fontSize: '1.75rem', fontWeight: 900, color: '#16A34A' }}>
                  {analytics?.overallMasteryPercentage ? `${analytics.overallMasteryPercentage}%` : '88%'}
                </div>
                <div style={{ fontSize: '0.78rem', color: '#16A34A', fontWeight: 700 }}>
                  {isAr ? '✓ أداء متقدم ومطابق لمواصفات الوزارة' : '✓ Advanced performance matching specs'}
                </div>
              </div>
            </div>

            {/* "Continue Where You Left Off" Action Card */}
            <div className="continue-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: 'var(--radius-lg)', background: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary-700)', flexShrink: 0, boxShadow: 'var(--shadow-sm)' }}>
                  <BookOpen size={24} />
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--primary-700)' }}>
                    {isAr ? 'استكمل من حيث توقفت' : 'Continue Where You Left Off'}
                  </span>
                  <h3 style={{ fontSize: '1.15rem', fontWeight: 900, color: 'var(--primary-950)', margin: '0.2rem 0' }}>
                    {isAr ? (books[0]?.title_ar || 'كتاب العلوم - الصف الأول الإعدادي') : (books[0]?.title_en || 'Science Book - Prep 1')}
                  </h3>
                  <div style={{ fontSize: '0.825rem', color: 'var(--text-body)' }}>
                    {isAr ? 'الوحدة الأولى: المادة وخواصها • جاهز للتقييم الفوري' : 'Unit 1: Matter & Properties • Ready for quiz'}
                  </div>
                </div>
              </div>

              <button
                className="btn btn-primary continue-action-btn"
                onClick={() => {
                  if (books.length > 0) handleSelectAiBook(books[0]);
                  setActiveTab('ai');
                  setAiStep(3);
                }}
                style={{ fontWeight: 800, padding: '0.65rem 1.5rem', borderRadius: 'var(--radius-full)' }}
              >
                <span>{isAr ? 'خوض التقييم التشخيصي' : 'Take Diagnostic Quiz'}</span>
                <ArrowIcon size={16} />
              </button>
            </div>

            {/* Milestones & Badges Showcase */}
            <div className="card" style={{ padding: '1.5rem' }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-title)', marginBottom: '1rem' }}>
                {isAr ? 'الأوسمة والإنجازات الأكاديمية (Achievements)' : 'Academic Achievements & Badges'}
              </h3>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <span className="milestone-badge" style={{ color: '#15803D', background: '#F0FDF4', borderColor: '#BBF7D0' }}>
                  {isAr ? '🎯 أول تقييم تشخيصي مكتمل' : '🎯 First Completed Quiz'}
                </span>
                <span className="milestone-badge" style={{ color: '#B45309', background: '#FFFBEB', borderColor: '#FDE68A' }}>
                  {isAr ? '⚡ دقة وسرعة الإجابة' : '⚡ Precision & Speed'}
                </span>
                <span className="milestone-badge" style={{ color: '#4338CA', background: '#EEF2FF', borderColor: '#C7D2FE' }}>
                  {isAr ? '📚 إتقان مفاهيم الكثافة والمادة' : '📚 Density & Matter Mastery'}
                </span>
                <span className="milestone-badge" style={{ color: '#6B21A8', background: '#FAF5FF', borderColor: '#E9D5FF' }}>
                  {isAr ? '⭐ مستكشف المناهج الرسمية' : '⭐ Curriculum Explorer'}
                </span>
              </div>
            </div>

            {/* Quick Grid: Available Books and Exams */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.25rem' }}>
              <div className="card" style={{ padding: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: 800, margin: 0 }}>
                    {isAr ? 'مناهجي المفهرسة' : 'My Indexed Textbooks'}
                  </h3>
                  <button className="btn btn-ghost btn-sm" onClick={() => setActiveTab('books')}>
                    {isAr ? 'عرض الكل ⬅️' : 'View All ➡️'}
                  </button>
                </div>
                {books.slice(0, 2).map(b => (
                  <div key={b.id} style={{ padding: '0.75rem', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-md)', marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>{isAr ? b.title_ar : (b.title_en || b.title_ar)}</div>
                    <span className="badge badge-success" style={{ fontSize: '0.7rem' }}>
                      {isAr ? '✓ معتمد' : '✓ Certified'}
                    </span>
                  </div>
                ))}
              </div>

              <div className="card" style={{ padding: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: 800, margin: 0 }}>
                    {isAr ? 'الامتحانات المتاحة' : 'Available Exams'}
                  </h3>
                  <button className="btn btn-ghost btn-sm" onClick={() => setActiveTab('exams')}>
                    {isAr ? 'عرض الكل ⬅️' : 'View All ➡️'}
                  </button>
                </div>
                {exams.slice(0, 2).map(e => (
                  <div key={e.id} style={{ padding: '0.75rem', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-md)', marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>{e.title}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        {isAr ? `${e.duration_minutes} دقيقة • ${e.questions_count} أسئلة` : `${e.duration_minutes} mins • ${e.questions_count} questions`}
                      </div>
                    </div>
                    <button className="btn btn-sm btn-primary" onClick={() => { setActiveTab('exams'); handleStartExam(e.id); }}>
                      {isAr ? 'بدء' : 'Start'}
                    </button>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}

        {/* =========================================================
            TAB 2: STEP-BY-STEP GUIDED AI TUTOR ASSESSMENT FLOW
            ========================================================= */}
        {activeTab === 'ai' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

            {/* Guided Stepper Navigation */}
            <div className="stepper-nav">
              <span className={`step-pill ${aiStep === 1 ? 'active' : (aiStep > 1 ? 'completed' : '')}`}>
                {isAr ? '1. اختيار المادة' : '1. Subject'}
              </span>
              <span className={`step-pill ${aiStep === 2 ? 'active' : (aiStep > 2 ? 'completed' : '')}`}>
                {isAr ? '2. اختيار الفصل' : '2. Chapter'}
              </span>
              <span className={`step-pill ${aiStep === 3 ? 'active' : (aiStep > 3 ? 'completed' : '')}`}>
                {isAr ? '3. توليد الأسئلة' : '3. Questions'}
              </span>
              <span className={`step-pill ${aiStep === 4 ? 'active' : (aiStep > 4 ? 'completed' : '')}`}>
                {isAr ? '4. الحل التفاعلي' : '4. Interactive'}
              </span>
              <span className={`step-pill ${aiStep === 5 ? 'active' : (aiStep > 5 ? 'completed' : '')}`}>
                {isAr ? '5. التشخيص الذكي' : '5. Diagnosis'}
              </span>
              <span className={`step-pill ${aiStep === 6 ? 'active' : (aiStep > 6 ? 'completed' : '')}`}>
                {isAr ? '6. خطة المراجعة' : '6. Study Plan'}
              </span>
            </div>

            {/* STEP 1: CHOOSE SUBJECT & BOOK */}
            {aiStep === 1 && (
              <div className="card" style={{ padding: '2rem 1.5rem' }}>
                <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
                  <span className="badge badge-primary" style={{ marginBottom: '0.5rem' }}>
                    {isAr ? 'الخطوة 1 من 6' : 'Step 1 of 6'}
                  </span>
                  <h2 style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--text-title)' }}>
                    {isAr ? 'اختر المادة الدراسية للتقييم' : 'Select Subject for Diagnostic Quiz'}
                  </h2>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                    {isAr ? 'يتم استخراج الأسئلة حصرياً من كتاب الوزارة المعتمد لصفك' : 'Questions are strictly extracted from your official curriculum textbook'}
                  </p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
                  {books.map(b => {
                    const isSelected = selectedAiBook?.id === b.id;
                    return (
                      <div
                        key={b.id}
                        onClick={() => { handleSelectAiBook(b); setAiStep(2); }}
                        style={{
                          padding: '1.5rem',
                          borderRadius: 'var(--radius-xl)',
                          border: isSelected ? '2px solid var(--primary-600)' : '1px solid var(--border-light)',
                          background: isSelected ? 'var(--primary-50)' : 'var(--bg-card)',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '1rem'
                        }}
                      >
                        <div style={{
                          width: '46px',
                          height: '46px',
                          borderRadius: 'var(--radius-lg)',
                          background: 'linear-gradient(135deg, var(--primary-600), var(--primary-800))',
                          color: '#FFFFFF',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0
                        }}>
                          <BookOpen size={22} />
                        </div>
                        <div>
                          <h4 style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--text-title)', margin: '0 0 0.25rem' }}>
                            {isAr ? b.title_ar : (b.title_en || b.title_ar)}
                          </h4>
                          <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', alignItems: 'center', marginTop: '0.2rem' }}>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              {isAr ? b.subject_name_ar : (b.subject_name_en || b.subject_name_ar)}
                            </span>
                            <span style={{ fontSize: '0.7rem', fontWeight: 600, color: b.school_type === 'لغات' ? '#1D4ED8' : b.school_type === 'عربي' ? '#15803D' : '#6D28D9' }}>
                              • {b.school_type === 'عربي' ? (isAr ? '🏫 عربي' : 'Arabic') : b.school_type === 'لغات' ? (isAr ? '🌐 لغات' : 'Language') : (isAr ? '🤝 عام ولغات' : 'Common')}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* STEP 2: CHOOSE CHAPTER */}
            {aiStep === 2 && selectedAiBook && (
              <div className="card" style={{ padding: '2rem 1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                  <div>
                    <span className="badge badge-primary" style={{ marginBottom: '0.35rem' }}>
                      {isAr ? 'الخطوة 2 من 6' : 'Step 2 of 6'}
                    </span>
                    <h2 style={{ fontSize: '1.4rem', fontWeight: 900, margin: 0 }}>
                      {isAr ? 'اختر الفصل المطلوب تقييمه' : 'Select Chapter to Assess'}
                    </h2>
                    <span style={{ fontSize: '0.825rem', color: 'var(--text-muted)' }}>
                      {isAr ? `الكتاب: ${selectedAiBook.title_ar}` : `Textbook: ${selectedAiBook.title_en || selectedAiBook.title_ar}`}
                    </span>
                  </div>
                  <button className="btn btn-outline btn-sm" onClick={() => setAiStep(1)}>
                    {isAr ? 'تغيير المادة ↩' : 'Change Subject ↩'}
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
                  {selectedAiBook.chapters && selectedAiBook.chapters.length > 0 ? (
                    selectedAiBook.chapters.map((ch: any) => {
                      const isSelected = selectedAiChapterId === ch.id;
                      return (
                        <div
                          key={ch.id}
                          onClick={() => { setSelectedAiChapterId(ch.id); setAiStep(3); }}
                          style={{
                            padding: '1.25rem',
                            borderRadius: 'var(--radius-lg)',
                            border: isSelected ? '2px solid var(--primary-600)' : '1px solid var(--border-light)',
                            background: isSelected ? 'var(--primary-50)' : 'var(--bg-card)',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                            <span className="badge badge-primary">
                              {isAr ? `الفصل #${ch.chapter_number}` : `Chapter #${ch.chapter_number}`}
                            </span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              {isAr ? `${ch.chunks_count || 3} فقرات مفهرسة` : `${ch.chunks_count || 3} Paragraphs`}
                            </span>
                          </div>
                          <h4 style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--text-title)', margin: '0 0 0.5rem' }}>
                            {isAr ? ch.title_ar : (ch.title_en || ch.title_ar)}
                          </h4>
                          <span style={{ fontSize: '0.78rem', color: 'var(--primary-700)', fontWeight: 700 }}>
                            {isAr ? 'انقر لاختيار هذا الفصل ⬅️' : 'Click to select this chapter ➡️'}
                          </span>
                        </div>
                      );
                    })
                  ) : (
                    <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                      {isAr ? 'لا توجد فصول دراسية مدخلة لهذا الكتاب بعد.' : 'No chapters available yet for this book.'}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* STEP 3: GENERATE QUESTIONS */}
            {aiStep === 3 && (
              <div className="card" style={{ padding: '2.5rem 1.25rem', textAlign: 'center', maxWidth: '650px', margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
                <div style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '20px',
                  background: 'linear-gradient(135deg, var(--primary-600), var(--primary-800))',
                  color: '#FFFFFF',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '1.25rem',
                  boxShadow: 'var(--shadow-blue)'
                }}>
                  <Sparkles size={32} />
                </div>

                <h2 style={{ fontSize: 'clamp(1.25rem, 4.5vw, 1.6rem)', fontWeight: 900, marginBottom: '0.65rem', lineHeight: 1.35, wordBreak: 'break-word' }}>
                  {isAr ? 'جاهز لتوليد أسئلة الفصل الذكية؟' : 'Ready to Generate Questions?'}
                </h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, maxWidth: '520px', margin: '0 auto 1.75rem' }}>
                  {isAr 
                    ? 'سيقوم محرك الذكاء الاصطناعي باستخراج فقرات الكتاب المنهجي وصياغة 3 أسئلة معيارية وفق تصنيف بلوم مع ربط الصفحة لكل سؤال.'
                    : 'The AI engine will retrieve paragraphs from your textbook and generate 3 Bloom-calibrated questions grounded in specific pages.'}
                </p>

                <div className="card-actions-responsive">
                  <button
                    className="btn btn-primary btn-lg"
                    onClick={handleGenerateAiAssessment}
                    disabled={isGeneratingAi}
                    style={{ fontWeight: 800, borderRadius: 'var(--radius-full)' }}
                  >
                    {isGeneratingAi 
                      ? (isAr ? 'جاري استخراج الأسئلة من الكتاب...' : 'Extracting from textbook...') 
                      : (isAr ? 'توليد الأسئلة وبدء الحل 🚀' : 'Generate Questions & Start 🚀')}
                  </button>
                  <button className="btn btn-outline" onClick={() => setAiStep(2)} disabled={isGeneratingAi}>
                    {isAr ? 'الرجوع للفصول' : 'Back to Chapters'}
                  </button>
                </div>
              </div>
            )}

            {/* STEP 4: SOLVE QUESTIONS (INTERACTIVE QUIZ RUNNER) */}
            {aiStep === 4 && aiQuestions.length > 0 && (
              <div style={{ maxWidth: '780px', margin: '0 auto', width: '100%' }}>
                {/* Progress Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
                  <span style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--primary-800)' }}>
                    {isAr ? `السؤال ${currentQuestionIndex + 1} من ${aiQuestions.length}` : `Question ${currentQuestionIndex + 1} of ${aiQuestions.length}`}
                  </span>
                  <span className="badge badge-primary">
                    {isAr ? `${Object.keys(aiAnswers).length} من ${aiQuestions.length} تم حلها` : `${Object.keys(aiAnswers).length} of ${aiQuestions.length} answered`}
                  </span>
                </div>

                {/* Progress Bar */}
                <div style={{ width: '100%', height: '8px', background: 'var(--border-light)', borderRadius: '999px', overflow: 'hidden', marginBottom: '1.5rem' }}>
                  <div style={{
                    width: `${((currentQuestionIndex + 1) / aiQuestions.length) * 100}%`,
                    height: '100%',
                    background: 'var(--primary-600)',
                    borderRadius: '999px',
                    transition: 'width 0.3s ease'
                  }} />
                </div>

                {/* Question Card */}
                {(() => {
                  const currentQ = aiQuestions[currentQuestionIndex];
                  if (!currentQ) return null;

                  return (
                    <div className="card" style={{ padding: '1.75rem 1.25rem', borderRadius: 'var(--radius-2xl)', boxShadow: 'var(--shadow-md)', width: '100%', boxSizing: 'border-box' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                        <span className="badge badge-primary">
                          {isAr ? `مستوى الصعوبة: ${currentQ.difficulty || 'متوسط'}` : `Difficulty: ${currentQ.difficulty || 'Medium'}`}
                        </span>
                        {currentQ.source_page && (
                          <span className="badge" style={{ background: '#F1F5F9', color: '#475569' }}>
                            📖 {isAr ? `صفحة ${currentQ.source_page}` : `Page ${currentQ.source_page}`}
                          </span>
                        )}
                      </div>

                      <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-title)', lineHeight: 1.6, marginBottom: '1.5rem', wordBreak: 'break-word' }}>
                        {currentQ.question_text}
                      </h3>

                      {/* Options */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '2rem' }}>
                        {currentQ.options?.map((opt: any) => {
                          const isSelected = aiAnswers[currentQ.id] === opt.id;
                          return (
                            <div
                              key={opt.id}
                              onClick={() => setAiAnswers({ ...aiAnswers, [currentQ.id]: opt.id })}
                              style={{
                                padding: '1rem 1.15rem',
                                borderRadius: 'var(--radius-lg)',
                                border: isSelected ? '2px solid var(--primary-600)' : '1.5px solid var(--border-light)',
                                background: isSelected ? 'var(--primary-50)' : '#FFFFFF',
                                color: isSelected ? 'var(--primary-900)' : 'var(--text-title)',
                                fontWeight: isSelected ? 800 : 600,
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.75rem',
                                wordBreak: 'break-word',
                                minWidth: 0
                              }}
                            >
                              <div style={{
                                width: '22px',
                                height: '22px',
                                borderRadius: '50%',
                                border: isSelected ? '6px solid var(--primary-600)' : '2px solid var(--border-light)',
                                background: '#FFFFFF',
                                flexShrink: 0
                              }} />
                              <span style={{ minWidth: 0, wordBreak: 'break-word' }}>{opt.option_text || opt.text || ''}</span>
                            </div>
                          );
                        })}
                      </div>

                      {/* Navigation Buttons */}
                      <div className="quiz-nav-responsive">
                        <button
                          className="btn btn-outline"
                          onClick={() => setCurrentQuestionIndex(Math.max(0, currentQuestionIndex - 1))}
                          disabled={currentQuestionIndex === 0}
                        >
                          {isAr ? 'السابق' : 'Previous'}
                        </button>

                        {currentQuestionIndex < aiQuestions.length - 1 ? (
                          <button
                            className="btn btn-primary"
                            onClick={() => setCurrentQuestionIndex(currentQuestionIndex + 1)}
                            disabled={!aiAnswers[currentQ.id]}
                          >
                            {isAr ? 'السؤال التالي ⬅️' : 'Next Question ➡️'}
                          </button>
                        ) : (
                          <button
                            className="btn btn-secondary"
                            onClick={handleSubmitAiEvaluation}
                            disabled={isEvaluatingAi || Object.keys(aiAnswers).length < aiQuestions.length}
                            style={{ fontWeight: 800 }}
                          >
                            {isEvaluatingAi 
                              ? (isAr ? 'جاري التشخيص والتقييم...' : 'Evaluating & Diagnosing...') 
                              : (isAr ? 'إنهاء وإظهار التشخيص 🎯' : 'Finish & View Diagnosis 🎯')}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* STEP 5: AI DIAGNOSIS REPORT */}
            {aiStep === 5 && aiReport && (() => {
              const finalPercentage = aiReport.percentage !== undefined
                ? Math.round(aiReport.percentage)
                : (aiReport.score_percentage !== undefined ? Math.round(aiReport.score_percentage) : 0);

              const feedbackText = (isAr ? aiReport.overall_feedback_ar : aiReport.overall_feedback_en)
                || aiReport.general_feedback
                || (finalPercentage >= 80
                    ? (isAr ? 'أداء ممتاز يعكس استيعاباً رائعاً لفقرات الدرس.' : 'Excellent performance reflecting high mastery of textbook paragraphs.')
                    : (isAr ? 'تم تشخيص بعض المفاهيم التي تحتاج لمراجعة دقيقة من صفحات الكتاب المحددة أدناه.' : 'Specific concepts identified that require focused review from cited textbook pages.'));

              const strongItems = (aiReport.strong_topics && aiReport.strong_topics.length > 0)
                ? aiReport.strong_topics
                : (aiReport.strengths || []);

              const weakItems = (aiReport.weak_topics && aiReport.weak_topics.length > 0)
                ? aiReport.weak_topics
                : (aiReport.weaknesses || []);

              const scoreColor = finalPercentage >= 80 ? '#16A34A' : (finalPercentage >= 50 ? '#D97706' : '#DC2626');
              const scoreEmoji = finalPercentage >= 80 ? '🎉' : (finalPercentage >= 50 ? '👏' : '📚');
              const borderColor = finalPercentage >= 80 ? '#BBF7D0' : (finalPercentage >= 50 ? '#FEF08A' : '#FECDD3');
              const bgGradient = finalPercentage >= 80
                ? 'linear-gradient(145deg, #FFFFFF, #F0FDF4)'
                : (finalPercentage >= 50 ? 'linear-gradient(145deg, #FFFFFF, #FFFBEB)' : 'linear-gradient(145deg, #FFFFFF, #FFF1F2)');

              return (
                <div style={{ maxWidth: '820px', margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  {/* Score Celebration Card */}
                  <div className="card" style={{
                    padding: '2rem 1.25rem',
                    textAlign: 'center',
                    background: bgGradient,
                    border: `1.5px solid ${borderColor}`,
                    borderRadius: 'var(--radius-2xl)',
                    width: '100%',
                    boxSizing: 'border-box'
                  }}>
                    <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>{scoreEmoji}</div>
                    <h2 style={{ fontSize: 'clamp(1.3rem, 4.5vw, 1.7rem)', fontWeight: 900, color: 'var(--text-title)', margin: '0 0 0.5rem', lineHeight: 1.3 }}>
                      {finalPercentage >= 80
                        ? (isAr ? 'اكتمل التقييم التشخيصي بنجاح!' : 'Diagnostic Assessment Completed!')
                        : (isAr ? 'تقرير التشخيص المعرفي' : 'Diagnostic Knowledge Report')}
                    </h2>
                    <div style={{ fontSize: '2.75rem', fontWeight: 900, color: scoreColor, margin: '0.5rem 0' }}>
                      {finalPercentage}%
                    </div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '1rem' }}>
                      {isAr ? `الدرجة: ${aiReport.score ?? 0} من أصل ${aiReport.max_score ?? 3}` : `Score: ${aiReport.score ?? 0} out of ${aiReport.max_score ?? 3}`}
                    </div>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', maxWidth: '520px', margin: '0 auto 1.5rem', lineHeight: 1.6 }}>
                      {feedbackText}
                    </p>

                    <div className="card-actions-responsive">
                      <button className="btn btn-primary btn-lg" onClick={() => setAiStep(6)} style={{ fontWeight: 800 }}>
                        {isAr ? 'عرض خطة المراجعة وصفحات الكتاب 📖' : 'View Action Plan & Pages 📖'}
                      </button>
                      <button className="btn btn-outline" onClick={() => { setAiStep(1); setAiReport(null); }}>
                        {isAr ? 'تقييم فصل آخر 🔄' : 'Assess Another Chapter 🔄'}
                      </button>
                    </div>
                  </div>

                  {/* Strengths & Weaknesses Breakdown */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(260px, 100%), 1fr))', gap: '1rem' }}>
                    <div className="card" style={{ padding: '1.25rem', background: '#F8FCF9', border: '1px solid #DCFCE7' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#15803D', fontWeight: 800, marginBottom: '0.5rem' }}>
                        <CheckCircle2 size={18} />
                        <span>{isAr ? 'نقاط القوة المستوعبة:' : 'Mastered Concepts:'}</span>
                      </div>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-body)', lineHeight: 1.6, margin: 0 }}>
                        {strongItems.length > 0
                          ? strongItems.join('، ')
                          : (isAr ? 'تحتاج إلى تعزيز المفاهيم الأساسية عبر المراجعة.' : 'Core concepts require reinforcement through textbook review.')}
                      </p>
                    </div>

                    <div className="card" style={{ padding: '1.25rem', background: '#FFFDF5', border: '1px solid #FEF3C7' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#B45309', fontWeight: 800, marginBottom: '0.5rem' }}>
                        <AlertCircle size={18} />
                        <span>{isAr ? 'المفاهيم التي تحتاج مراجعة:' : 'Concepts Needing Review:'}</span>
                      </div>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-body)', lineHeight: 1.6, margin: 0 }}>
                        {weakItems.length > 0
                          ? weakItems.join('، ')
                          : (isAr ? 'لا توجد ثغرات حرجة، أحسنت استيعاب جميع أفكار الفصل!' : 'No critical gaps identified, outstanding comprehension of all chapter concepts!')}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* STEP 6: STUDY RECOMMENDATIONS & TEXTBOOK PAGE CITATIONS */}
            {aiStep === 6 && (
              <div style={{ maxWidth: '820px', margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div className="card" style={{ padding: '2rem 1.75rem', borderRadius: 'var(--radius-xl)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--primary-800)', fontWeight: 800, fontSize: '1.2rem', marginBottom: '1rem' }}>
                    <BookmarkCheck size={24} color="var(--primary-600)" />
                    <span>{isAr ? 'خطة المراجعة والتوصيات المنهجية (Action Plan)' : 'Action Plan & Textbook Citations'}</span>
                  </div>

                  <p style={{ color: 'var(--text-body)', lineHeight: 1.7, fontSize: '0.925rem', marginBottom: '1.5rem' }}>
                    {isAr 
                      ? 'بناءً على إجاباتك المشخصة، إليك تحليل كل سؤال مع رقم الصفحة المعياري من الكتاب المدرسي والتوصية العلاجية:'
                      : 'Based on your diagnosed responses, here is the question-by-question breakdown with textbook page citations:'}
                  </p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', marginBottom: '2rem' }}>
                    {aiReport?.items && aiReport.items.length > 0 ? (
                      aiReport.items.map((item: any, idx: number) => (
                        <div
                          key={item.question_id || idx}
                          style={{
                            padding: '1.15rem',
                            background: item.is_correct ? '#F8FCF9' : '#FFFDF5',
                            borderRadius: 'var(--radius-lg)',
                            border: item.is_correct ? '1px solid #DCFCE7' : '1px solid #FEF3C7'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem', flexWrap: 'wrap', gap: '0.4rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                              <span style={{ fontSize: '1.1rem' }}>{item.is_correct ? '✅' : '❌'}</span>
                              <strong style={{ color: 'var(--primary-950)', fontSize: '0.95rem' }}>
                                {isAr ? `السؤال ${idx + 1}` : `Question ${idx + 1}`}: {item.question_text}
                              </strong>
                            </div>
                            <span className="badge badge-primary">
                              📖 {isAr ? `صفحة ${item.page_reference || '7'}` : `Page ${item.page_reference || '7'}`}
                            </span>
                          </div>

                          <div style={{ fontSize: '0.85rem', margin: '0.4rem 0', color: item.is_correct ? '#15803D' : '#B45309', fontWeight: 600 }}>
                            {item.study_recommendation || (item.is_correct
                              ? (isAr ? 'تم استيعاب هذه الجزئية بنجاح.' : 'Mastered successfully.')
                              : (isAr ? `يرجى مراجعة صفحة ${item.page_reference} بعناية.` : `Please review page ${item.page_reference} carefully.`))}
                          </div>

                          {item.explanation && (
                            <p style={{ fontSize: '0.825rem', color: 'var(--text-muted)', margin: '0.35rem 0 0', lineHeight: 1.5 }}>
                              💡 <em>{item.explanation}</em>
                            </p>
                          )}
                        </div>
                      ))
                    ) : (
                      <div style={{ padding: '1rem', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-light)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem', flexWrap: 'wrap', gap: '0.4rem' }}>
                          <strong style={{ color: 'var(--primary-900)' }}>
                            {isAr ? '1. مراجعة تطبيقات الكثافة وحرائق البترول' : '1. Density Applications & Oil Fires'}
                          </strong>
                          <span className="badge badge-primary">
                            {isAr ? 'كتاب العلوم • صفحة 7' : 'Science Book • Page 7'}
                          </span>
                        </div>
                        <p style={{ fontSize: '0.825rem', color: 'var(--text-muted)', margin: 0 }}>
                          {isAr ? 'اقرأ الفقرة المعنونة بـ "تطبيقات حياتية على الكثافة" ولاحظ لماذا يطفو البترول فوق سطح الماء.' : 'Read the section on practical density applications and why oil floats over water.'}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="card-actions-responsive">
                    <button
                      className="btn btn-primary btn-lg"
                      onClick={() => { setActiveTab('home'); setAiStep(1); }}
                      style={{ fontWeight: 800 }}
                    >
                      {isAr ? 'العودة للوحة مسار التعلم 🏠' : 'Return to Learning Path 🏠'}
                    </button>
                    <button className="btn btn-outline" onClick={() => setAiStep(5)}>
                      {isAr ? '↩ العودة للتشخيص' : '↩ Back to Diagnosis'}
                    </button>
                  </div>
                </div>
              </div>
            )}

          </div>
        )}

        {/* =========================================================
            TAB 3: MY CURRICULUM BOOKS & CHUNK READER
            ========================================================= */}
        {activeTab === 'books' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 900, margin: 0 }}>
                  {isAr ? 'كتبي ومناهجي المعتمدة' : 'Official Curriculum Textbooks'}
                </h2>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  {isAr 
                    ? `مخصصة ومقيدة بصفك الدراسي (${user?.profile?.grade_name_ar || 'الصف الأول الإعدادي'}) ونوع مدرستك (${user?.profile?.school_type === 'لغات' ? 'مدارس لغات' : 'مدارس عربي'})`
                    : `Restricted to your grade (${user?.profile?.grade_name_en || 'Prep 1'}) and school (${user?.profile?.school_type === 'لغات' ? 'Language School' : 'Arabic School'})`}
                </span>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.25rem' }}>
              {books.map(book => (
                <div key={book.id} className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ width: '44px', height: '44px', borderRadius: 'var(--radius-lg)', background: 'var(--primary-100)', color: 'var(--primary-800)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' }}>
                      <BookOpen size={22} />
                    </div>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 800, margin: '0 0 0.35rem' }}>
                      {isAr ? book.title_ar : (book.title_en || book.title_ar)}
                    </h3>
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', margin: '0.4rem 0 0.75rem' }}>
                      <span className="badge badge-secondary" style={{ fontSize: '0.72rem' }}>
                        {isAr ? book.grade_name_ar : (book.grade_name_en || book.grade_name_ar)}
                      </span>
                      <span className="badge" style={{ 
                        fontSize: '0.72rem', 
                        background: book.school_type === 'لغات' ? '#EFF6FF' : book.school_type === 'عربي' ? '#F0FDF4' : '#F5F3FF',
                        color: book.school_type === 'لغات' ? '#1D4ED8' : book.school_type === 'عربي' ? '#15803D' : '#6D28D9',
                        border: `1px solid ${book.school_type === 'لغات' ? '#BFDBFE' : book.school_type === 'عربي' ? '#BBF7D0' : '#DDD6FE'}`
                      }}>
                        {book.school_type === 'عربي' 
                          ? (isAr ? '🏫 مدارس عربي' : 'Arabic')
                          : book.school_type === 'لغات'
                          ? (isAr ? '🌐 مدارس لغات' : 'Language')
                          : (isAr ? '🤝 عام ولغات (كلاهما)' : 'Both')}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                      {isAr ? book.subject_name_ar : (book.subject_name_en || book.subject_name_ar)} • {isAr ? `${book.chapters?.length || 1} فصول مفهرسة` : `${book.chapters?.length || 1} Indexed Chapters`}
                    </div>
                  </div>

                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => handleOpenBookDetails(book.id)}
                    style={{ fontWeight: 700, width: '100%', marginTop: '1rem' }}
                  >
                    {isAr ? 'تصفح فصول وفقرات الكتاب 📖' : 'Browse Chapters & Paragraphs 📖'}
                  </button>
                </div>
              ))}
            </div>

            {/* Book Details Modal / Drawer */}
            {selectedBook && (
              <div className="card" style={{ padding: '1.75rem', border: '1.5px solid var(--primary-300)', borderRadius: 'var(--radius-xl)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--border-light)' }}>
                  <h3 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0 }}>
                    {isAr ? `فصول: ${selectedBook.title_ar}` : `Chapters: ${selectedBook.title_en || selectedBook.title_ar}`}
                  </h3>
                  <button className="btn btn-ghost btn-sm" onClick={() => { setSelectedBook(null); setReadingChapter(null); setSelectedChapterChunks([]); }}>
                    {isAr ? 'إغلاق ✕' : 'Close ✕'}
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                  {selectedBook.chapters?.map((ch: any) => {
                    const isReadingThis = readingChapter?.id === ch.id;
                    const isLoadingThis = loadingChapterId === ch.id;

                    return (
                      <div
                        key={ch.id}
                        style={{
                          padding: '1.1rem',
                          background: isReadingThis ? '#F8FAFC' : 'var(--bg-subtle)',
                          borderRadius: 'var(--radius-lg)',
                          border: isReadingThis ? '2px solid var(--primary-500)' : '1px solid var(--border-light)',
                          transition: 'all 0.2s ease'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                          <div style={{ minWidth: '180px', flex: 1 }}>
                            <strong style={{ fontSize: '1rem', color: 'var(--text-title)', display: 'block' }}>
                              {isAr ? `الفصل ${ch.chapter_number}: ${ch.title_ar}` : `Chapter ${ch.chapter_number}: ${ch.title_en || ch.title_ar}`}
                            </strong>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                              {isAr ? `${ch.chunks_count || 3} فقرات دراسية مرقمة` : `${ch.chunks_count || 3} Page-Numbered Paragraphs`}
                            </div>
                          </div>
                          <button
                            className={`btn ${isReadingThis ? 'btn-secondary' : 'btn-primary'} btn-sm`}
                            onClick={() => handleReadChapter(selectedBook.id, ch)}
                            disabled={isLoadingThis}
                            style={{ flexShrink: 0, fontWeight: 700 }}
                          >
                            {isLoadingThis 
                              ? (isAr ? 'جاري التحميل...' : 'Loading...')
                              : (isReadingThis 
                                  ? (isAr ? 'إخفاء الفقرات ▲' : 'Hide Paragraphs ▲') 
                                  : (isAr ? 'قراءة الفقرات ▼' : 'Read Paragraphs ▼'))}
                          </button>
                        </div>

                        {/* Inline Chunks for THIS Chapter */}
                        {isReadingThis && (
                          <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--border-light)' }}>
                            <div style={{ marginBottom: '0.75rem', fontWeight: 800, fontSize: '0.9rem', color: 'var(--primary-800)' }}>
                              📖 {isAr ? `نصوص وفقرات الكتاب المستخرجة:` : `Extracted Textbook Paragraphs:`}
                            </div>

                            {isLoadingThis ? (
                              <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                {isAr ? 'جاري جلب فقرات الكتاب من قاعدة البيانات...' : 'Fetching textbook paragraphs...'}
                              </div>
                            ) : selectedChapterChunks.length === 0 ? (
                              <div style={{ padding: '1rem', background: '#FFFFFF', borderRadius: 'var(--radius-md)', color: 'var(--text-muted)', fontSize: '0.85rem', border: '1px solid var(--border-light)' }}>
                                {isAr ? 'لا توجد فقرات مستخرجة لهذا الفصل حالياً.' : 'No paragraphs recorded for this chapter yet.'}
                              </div>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                {selectedChapterChunks.map((chunk: any, i: number) => (
                                  <div
                                    key={chunk.id || i}
                                    style={{
                                      padding: '1rem 1.15rem',
                                      background: '#FFFFFF',
                                      border: '1px solid var(--border-light)',
                                      borderRadius: 'var(--radius-md)',
                                      fontSize: '0.9rem',
                                      lineHeight: 1.8,
                                      boxShadow: '0 1px 4px rgba(0, 0, 0, 0.04)'
                                    }}
                                  >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem' }}>
                                      <span className="badge badge-primary" style={{ fontSize: '0.75rem' }}>
                                        📖 {isAr ? `صفحة ${chunk.page_number}` : `Page ${chunk.page_number}`}
                                      </span>
                                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                        #{chunk.chunk_index || i + 1}
                                      </span>
                                    </div>
                                    <p style={{ margin: 0, color: 'var(--text-title)', whiteSpace: 'pre-line', wordBreak: 'break-word', fontSize: '0.95rem', lineHeight: 1.9 }}>
                                      {cleanArabicText(chunk.content || chunk.chunk_text || '')}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* =========================================================
            TAB 4: TIMED EXAMS RUNNER
            ========================================================= */}
        {activeTab === 'exams' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 900, margin: 0 }}>
                {isAr ? 'الامتحانات والاختبارات المجدولة' : 'Scheduled & Timed Exams'}
              </h2>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                {isAr ? 'اختبارات إلكترونية تفاعلية بمؤقت زمني حقيقي وتصحيح آلي' : 'Interactive timed exams with instant automated grading'}
              </span>
            </div>

            {/* Exam Runner Mode */}
            {activeExam ? (
              <div className="card" style={{ padding: '2rem 1.75rem', borderRadius: 'var(--radius-xl)' }}>
                {/* Header with Countdown */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border-light)', flexWrap: 'wrap', gap: '0.75rem' }}>
                  <div>
                    <h3 style={{ fontSize: '1.3rem', fontWeight: 800, margin: 0 }}>{activeExam.exam?.title}</h3>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {isAr ? activeExam.exam?.subject_name_ar : (activeExam.exam?.subject_name_en || activeExam.exam?.subject_name_ar)}
                    </span>
                  </div>

                  {examTimeLeft !== null && (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      background: examTimeLeft < 60 ? '#FEF2F2' : '#EFF6FF',
                      color: examTimeLeft < 60 ? '#DC2626' : 'var(--primary-700)',
                      padding: '0.5rem 1rem',
                      borderRadius: 'var(--radius-full)',
                      fontWeight: 900,
                      fontSize: '1.1rem',
                      fontFamily: 'monospace'
                    }}>
                      <Clock size={18} />
                      <span>{formatTime(examTimeLeft)}</span>
                    </div>
                  )}
                </div>

                {/* Exam Result Display */}
                {examResult ? (
                  <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
                    <div style={{ fontSize: '3rem' }}>🎯</div>
                    <h3 style={{ fontSize: '1.5rem', fontWeight: 800, margin: '0.5rem 0' }}>
                      {isAr ? 'انتهى الامتحان وتم التصحيح!' : 'Exam Completed & Graded!'}
                    </h3>
                    <div style={{ fontSize: '2.5rem', fontWeight: 900, color: '#16A34A', margin: '0.5rem 0' }}>
                      {examResult.score}%
                    </div>
                    <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
                      {isAr 
                        ? `الدرجة المحصلة: ${examResult.earned_points} من ${examResult.total_points} نقطة`
                        : `Final Score: ${examResult.earned_points} of ${examResult.total_points} points`}
                    </p>
                    <button className="btn btn-primary" onClick={() => { setActiveExam(null); setExamResult(null); }}>
                      {isAr ? 'العودة لقائمة الامتحانات' : 'Back to Exams'}
                    </button>
                  </div>
                ) : (
                  <div>
                    {/* Questions */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginBottom: '2rem' }}>
                      {activeExam.questions?.map((q: any, idx: number) => (
                        <div key={q.id} style={{ padding: '1.25rem', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-lg)' }}>
                          <div style={{ fontWeight: 800, fontSize: '1rem', marginBottom: '0.75rem' }}>
                            {idx + 1}. {q.question_text} ({q.points} {isAr ? 'نقاط' : 'pts'})
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {q.options?.map((opt: any) => {
                              const isSelected = examAnswers[q.id] === opt.id;
                              return (
                                <label
                                  key={opt.id}
                                  style={{
                                    padding: '0.75rem 1rem',
                                    borderRadius: 'var(--radius-md)',
                                    background: isSelected ? 'var(--primary-50)' : '#FFFFFF',
                                    border: isSelected ? '1.5px solid var(--primary-600)' : '1px solid var(--border-light)',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem'
                                  }}
                                >
                                  <input
                                    type="radio"
                                    name={`q_${q.id}`}
                                    checked={isSelected}
                                    onChange={() => setExamAnswers({ ...examAnswers, [q.id]: opt.id })}
                                  />
                                  <span>{opt.option_text}</span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                      <button className="btn btn-outline" onClick={() => setActiveExam(null)}>
                        {isAr ? 'إلغاء الامتحان' : 'Cancel Exam'}
                      </button>
                      <button
                        className="btn btn-primary"
                        onClick={handleSubmitExam}
                        disabled={isSubmittingExam}
                        style={{ fontWeight: 800 }}
                      >
                        {isSubmittingExam 
                          ? (isAr ? 'جاري تصحيح الامتحان...' : 'Grading exam...') 
                          : (isAr ? 'تسليم الإجابات الآن' : 'Submit Answers')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Exams List Grid */
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.25rem' }}>
                {exams.map(exam => (
                  <div key={exam.id} className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                        <span className="badge badge-primary">
                          {isAr ? exam.subject_name_ar : (exam.subject_name_en || exam.subject_name_ar)}
                        </span>
                        <span className="badge badge-secondary" style={{ fontSize: '0.72rem' }}>
                          {isAr ? exam.grade_name_ar : (exam.grade_name_en || exam.grade_name_ar)}
                        </span>
                        <span className="badge" style={{ 
                          fontSize: '0.72rem', 
                          background: exam.effective_school_type === 'لغات' ? '#EFF6FF' : exam.effective_school_type === 'عربي' ? '#F0FDF4' : '#F5F3FF',
                          color: exam.effective_school_type === 'لغات' ? '#1D4ED8' : exam.effective_school_type === 'عربي' ? '#15803D' : '#6D28D9',
                          border: `1px solid ${exam.effective_school_type === 'لغات' ? '#BFDBFE' : exam.effective_school_type === 'عربي' ? '#BBF7D0' : '#DDD6FE'}`
                        }}>
                          {exam.effective_school_type === 'عربي' 
                            ? (isAr ? '🏫 مدارس عربي' : 'Arabic')
                            : exam.effective_school_type === 'لغات'
                            ? (isAr ? '🌐 مدارس لغات' : 'Language')
                            : (isAr ? '🤝 عام ولغات' : 'Common')}
                        </span>
                      </div>
                      <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: '0 0 0.4rem' }}>{exam.title}</h3>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        ⏱️ {isAr ? `المدة: ${exam.duration_minutes} دقيقة` : `Duration: ${exam.duration_minutes} mins`} • 📝 {isAr ? `الأسئلة: ${exam.questions_count}` : `Questions: ${exam.questions_count}`}
                      </div>
                    </div>

                    <button
                      className="btn btn-primary"
                      onClick={() => handleStartExam(exam.id)}
                      style={{ fontWeight: 800, marginTop: '1.25rem' }}
                    >
                      {isAr ? 'بدء الامتحان الآن ⏱️' : 'Start Exam Now ⏱️'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* =========================================================
            TAB 5: LONGITUDINAL MASTERY & ANALYTICS
            ========================================================= */}
        {activeTab === 'analytics' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 900, margin: 0 }}>
                {isAr ? 'سجل الإتقان والتقدم التراكمي' : 'Mastery & Learning Progress'}
              </h2>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                {isAr ? 'متابعة دقيقة للأداء عبر الفصول الدراسية وتصنيف نواتج التعلم' : 'Longitudinal tracking across chapters and curriculum benchmarks'}
              </span>
            </div>

            {/* Metrics Cards */}
            <div className="motivation-widget-grid">
              <div className="goal-card">
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                  {isAr ? 'مستوى الإتقان التراكمي' : 'Cumulative Mastery'}
                </span>
                <div style={{ fontSize: '2rem', fontWeight: 900, color: '#16A34A' }}>
                  {analytics?.overallMasteryPercentage || 88}%
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {isAr ? 'وفق معايير التقييم التشخيصي' : 'Based on diagnostic evaluations'}
                </span>
              </div>

              <div className="goal-card">
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                  {isAr ? 'الامتحانات المكتملة' : 'Completed Exams'}
                </span>
                <div style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--primary-700)' }}>
                  {analytics?.totalAttempts || 4}
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {isAr ? 'بمعدل تصحيح فوري' : 'With instant diagnosis'}
                </span>
              </div>

              <div className="goal-card">
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                  {isAr ? 'الفصول المتقنة' : 'Mastered Units'}
                </span>
                <div style={{ fontSize: '2rem', fontWeight: 900, color: '#D97706' }}>
                  {isAr ? '3 فصول' : '3 Units'}
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {isAr ? 'نسبة إتقان أعلى من 80%' : 'Above 80% mastery threshold'}
                </span>
              </div>
            </div>

            {/* Topic Mastery List */}
            <div className="card" style={{ padding: '1.75rem' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '1rem' }}>
                {isAr ? 'مستوى استيعاب الفصول الدراسية:' : 'Chapter Mastery Breakdown:'}
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                <div style={{ padding: '1rem', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-lg)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: '0.9rem', marginBottom: '0.4rem' }}>
                    <span>{isAr ? 'العلوم • الوحدة الأولى: المادة وخواصها' : 'Science • Unit 1: Matter & Properties'}</span>
                    <span style={{ color: '#16A34A' }}>90% ({isAr ? 'متقن' : 'Mastered'})</span>
                  </div>
                  <div style={{ width: '100%', height: '8px', background: 'var(--border-light)', borderRadius: '999px', overflow: 'hidden' }}>
                    <div style={{ width: '90%', height: '100%', background: '#16A34A', borderRadius: '999px' }} />
                  </div>
                </div>

                <div style={{ padding: '1rem', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-lg)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: '0.9rem', marginBottom: '0.4rem' }}>
                    <span>{isAr ? 'العلوم • الوحدة الثانية: الطاقة وحرائق البترول' : 'Science • Unit 2: Energy & Applications'}</span>
                    <span style={{ color: 'var(--primary-700)' }}>82% ({isAr ? 'متقدم' : 'Advanced'})</span>
                  </div>
                  <div style={{ width: '100%', height: '8px', background: 'var(--border-light)', borderRadius: '999px', overflow: 'hidden' }}>
                    <div style={{ width: '82%', height: '100%', background: 'var(--primary-600)', borderRadius: '999px' }} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

      </main>

      {/* =========================================================
          MOBILE BOTTOM NAVIGATION (THUMB FRIENDLY)
          ========================================================= */}
      <nav className="mobile-bottom-nav">
        <button
          className={`mobile-nav-btn ${activeTab === 'home' ? 'active' : ''}`}
          onClick={() => setActiveTab('home')}
        >
          <LayoutDashboard size={18} />
          <span>{isAr ? 'مساري' : 'Home'}</span>
        </button>

        <button
          className={`mobile-nav-btn ${activeTab === 'ai' ? 'active' : ''}`}
          onClick={() => setActiveTab('ai')}
        >
          <BrainCircuit size={18} />
          <span>{isAr ? 'المعلم الذكي' : 'AI Tutor'}</span>
        </button>

        <button
          className={`mobile-nav-btn ${activeTab === 'books' ? 'active' : ''}`}
          onClick={() => setActiveTab('books')}
        >
          <BookOpen size={18} />
          <span>{isAr ? 'مناهجي' : 'Books'}</span>
        </button>

        <button
          className={`mobile-nav-btn ${activeTab === 'exams' ? 'active' : ''}`}
          onClick={() => setActiveTab('exams')}
        >
          <Clock size={18} />
          <span>{isAr ? 'الامتحانات' : 'Exams'}</span>
        </button>

        <button
          className={`mobile-nav-btn ${activeTab === 'analytics' ? 'active' : ''}`}
          onClick={() => setActiveTab('analytics')}
        >
          <BarChart3 size={18} />
          <span>{isAr ? 'الإتقان' : 'Mastery'}</span>
        </button>
      </nav>

      {/* Quick Profile Edit Modal (Grade & School Type) */}
      {showProfileModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.75)',
          backdropFilter: 'blur(4px)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem'
        }}>
          <div className="card" style={{
            maxWidth: '520px',
            width: '100%',
            background: 'var(--bg-card)',
            borderRadius: 'var(--radius-xl)',
            padding: '2rem',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            border: '1px solid var(--border-light)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--border-light)' }}>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 900, margin: 0 }}>
                  {isAr ? '⚙️ تعديل الصف الدراسي ونوع المدرسة' : '⚙️ Change Grade & School Type'}
                </h3>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  {isAr ? 'يتم ربط وتحديث الكتب والاختبارات فوراً بناءً على اختيارك' : 'Textbooks & exams update immediately based on selection'}
                </span>
              </div>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setShowProfileModal(false)}
                style={{ fontSize: '1.2rem', padding: '0.2rem 0.5rem' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveProfile} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div className="form-group">
                <label className="form-label" style={{ fontWeight: 700 }}>{isAr ? 'المرحلة الدراسية' : 'Academic Stage'}</label>
                <select
                  className="form-select"
                  value={editStageId}
                  onChange={e => {
                    const newStageId = e.target.value;
                    setEditStageId(newStageId);
                    const stage = allStages.find(s => s.id === newStageId);
                    if (stage && stage.grades && stage.grades.length > 0) {
                      setEditGradeId(stage.grades[0].id);
                    }
                  }}
                >
                  {allStages.map(s => (
                    <option key={s.id} value={s.id}>{isAr ? s.name_ar : (s.name_en || s.name_ar)}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label" style={{ fontWeight: 700 }}>{isAr ? 'الصف الدراسي' : 'Grade Level'}</label>
                <select
                  className="form-select"
                  value={editGradeId}
                  onChange={e => setEditGradeId(e.target.value)}
                >
                  {(() => {
                    const currentStage = allStages.find(s => s.id === editStageId) || allStages[0];
                    const gradesList = currentStage?.grades || [];
                    return gradesList.map((g: any) => (
                      <option key={g.id} value={g.id}>{isAr ? g.name_ar : (g.name_en || g.name_ar)}</option>
                    ));
                  })()}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label" style={{ fontWeight: 700 }}>{isAr ? 'نوع المدرسة' : 'School Type'}</label>
                <select
                  className="form-select"
                  value={editSchoolType}
                  onChange={e => setEditSchoolType(e.target.value as any)}
                >
                  <option value="عربي">{isAr ? '🏫 مدارس عربي (حكومي / خاص عربي)' : '🏫 Arabic Schools'}</option>
                  <option value="لغات">{isAr ? '🌐 مدارس لغات (تجريبي / متميز / دولي)' : '🌐 Language Schools'}</option>
                </select>
                <div style={{ fontSize: '0.75rem', color: 'var(--primary-700)', marginTop: '0.35rem', lineHeight: 1.4 }}>
                  {editSchoolType === 'عربي'
                    ? (isAr ? '✓ ستظهر لك الكتب باللغة العربية (مثل العلوم والرياضيات بالعربي) والمناهج المشتركة كاللغة العربية والتربية الدينية.' : '✓ Shows Arabic curriculum & common textbooks.')
                    : (isAr ? '✓ ستظهر لك كتب اللغات الإنجليزية (مثل Math و Science) والمناهج المشتركة كاللغة العربية والتربية الدينية.' : '✓ Shows English curriculum (Math/Science) & common textbooks.')}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setShowProfileModal(false)}
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isSavingProfile}
                  style={{ fontWeight: 800 }}
                >
                  {isSavingProfile ? (isAr ? 'جاري الحفظ...' : 'Saving...') : (isAr ? 'حفظ وتحديث المناهج 💾' : 'Save & Update Curricula 💾')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
