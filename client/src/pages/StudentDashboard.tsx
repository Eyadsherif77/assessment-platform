import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiUrl } from '../utils/api';
import { 
  BookOpen, 
  Sparkles, 
  Award, 
  BarChart3, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  FileText, 
  ArrowRight,
  ArrowLeft,
  School,
  BrainCircuit,
  BookmarkCheck
} from 'lucide-react';

export const StudentDashboard: React.FC = () => {
  const { user, token, t, language } = useAuth();
  const ArrowIcon = language === 'ar' ? ArrowLeft : ArrowRight;

  const getInitialTab = (): 'books' | 'exams' | 'ai' | 'analytics' => {
    try {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get('tab');
      if (tab === 'books' || tab === 'exams' || tab === 'ai' || tab === 'analytics') return tab;
      const saved = localStorage.getItem('student_active_tab');
      if (saved === 'books' || saved === 'exams' || saved === 'ai' || saved === 'analytics') return saved as any;
    } catch (_) {}
    return 'ai';
  };

  const [activeTab, setActiveTabState] = useState<'books' | 'exams' | 'ai' | 'analytics'>(getInitialTab);

  const setActiveTab = (tab: 'books' | 'exams' | 'ai' | 'analytics') => {
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

  // AI Evaluation Studio Data
  const [selectedAiBook, setSelectedAiBook] = useState<any | null>(null);
  const [selectedAiChapterId, setSelectedAiChapterId] = useState<string>('');
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [aiQuestions, setAiQuestions] = useState<any[]>([]);
  const [serverContextQuestions, setServerContextQuestions] = useState<any[]>([]);
  const [aiAnswers, setAiAnswers] = useState<Record<string, string>>({});
  const [isEvaluatingAi, setIsEvaluatingAi] = useState(false);
  const [aiReport, setAiReport] = useState<any | null>(null);

  // Learning Analytics Data
  const [analytics, setAnalytics] = useState<any | null>(null);

  // Fetch books & exams on mount
  useEffect(() => {
    if (!token) return;

    // 1. Fetch Grade-Restricted Books
    fetch(apiUrl('/api/books'), {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          setBooks(data);
          if (data.length > 0) {
            handleSelectAiBook(data[0]);
          }
        }
      })
      .catch(console.error);

    // 2. Fetch Grade-Restricted Exams
    fetch(apiUrl('/api/exams'), {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setExams(data);
      })
      .catch(console.error);

    // 3. Fetch Analytics
    loadAnalytics();
  }, [token]);

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
      // Auto-submit when time reaches 00:00!
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
    setReadingChapter(chapter);
    try {
      const res = await fetch(apiUrl(`/api/books/${bookId}/chapters/${chapter.id}/chunks`), {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setSelectedChapterChunks(data);
    } catch (e) {
      console.error(e);
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

      // Initialize live countdown timer in seconds
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
          count: 3
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل توليد التقييم');

      setAiQuestions(data.questions || []);
      setServerContextQuestions(data._server_context_questions || []);
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
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsEvaluatingAi(false);
    }
  };

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
      {/* Student Profile & Stage Isolation Banner */}
      <div className="card student-profile-header-card" style={{
        background: 'linear-gradient(135deg, #FFFFFF, #EFF6FF)',
        border: '1.5px solid var(--primary-200)',
        marginBottom: '1.5rem',
        padding: '1.25rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{
              width: '54px',
              height: '54px',
              borderRadius: 'var(--radius-full)',
              background: 'linear-gradient(135deg, var(--primary-600), var(--primary-800))',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: '1.3rem'
            }}>
              {user?.fullName?.charAt(0) || 'ط'}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <h2 style={{ fontSize: '1.4rem', fontWeight: 800 }}>{user?.fullName}</h2>
                <span className="badge badge-primary">
                  <School size={13} />
                  <span>{user?.profile?.grade_name_ar || 'الصف الأول الإعدادي'}</span>
                </span>
                {user?.profile?.section && (
                  <span className="badge" style={{ background: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A' }}>
                    شعبة: {user.profile.section}
                  </span>
                )}
                {user?.profile?.school_type && (
                  <span className="badge" style={{ background: '#F3E8FF', color: '#6B21A8', border: '1px solid #E9D5FF' }}>
                    {user.profile.school_type === 'لغات' ? '🌐 مدارس لغات' : '🏫 مدارس عربي'}
                  </span>
                )}
              </div>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                {user?.profile?.stage_name_ar || 'المرحلة الإعدادية'} • {user?.profile?.school_name || 'مدرسة المتفوقين'}
              </p>
            </div>
          </div>

          <div style={{
            background: 'rgba(37, 99, 235, 0.08)',
            border: '1px solid var(--primary-200)',
            borderRadius: 'var(--radius-md)',
            padding: '0.5rem 1rem',
            fontSize: '0.8rem',
            color: 'var(--primary-800)',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem'
          }}>
            <BookmarkCheck size={16} />
            <span>{t.gradeLockedNotice}</span>
          </div>
        </div>
      </div>

      {/* Tabs Header */}
      <div className="tabs-nav">
        <button
          className={`tab-btn ${activeTab === 'ai' ? 'active' : ''}`}
          onClick={() => setActiveTab('ai')}
          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
        >
          <BrainCircuit size={18} />
          <span>{t.tabAiEval}</span>
          <span className="badge badge-success" style={{ fontSize: '0.7rem' }}>AI</span>
        </button>

        <button
          className={`tab-btn ${activeTab === 'books' ? 'active' : ''}`}
          onClick={() => setActiveTab('books')}
          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
        >
          <BookOpen size={18} />
          <span>{t.tabSubjects} ({books.length})</span>
        </button>

        <button
          className={`tab-btn ${activeTab === 'exams' ? 'active' : ''}`}
          onClick={() => setActiveTab('exams')}
          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
        >
          <FileText size={18} />
          <span>{t.tabExams} ({exams.length})</span>
        </button>

        <button
          className={`tab-btn ${activeTab === 'analytics' ? 'active' : ''}`}
          onClick={() => { setActiveTab('analytics'); loadAnalytics(); }}
          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
        >
          <BarChart3 size={18} />
          <span>{t.tabAnalytics}</span>
        </button>
      </div>

      {/* TAB 1: AI EVALUATION STUDIO (FLAGSHIP FEATURE) */}
      {activeTab === 'ai' && (
        <div>
          <div className="card" style={{ marginBottom: '1.5rem', borderTop: '4px solid var(--primary-600)' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '0.5rem', color: 'var(--primary-800)' }}>
              {t.aiStudioTitle}
            </h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
              {language === 'ar' 
                ? 'يتم استدعاء فقرات ونصوص الكتاب المدرسي مباشرة، وتوليد أسئلة تشخيصية وتقييم إجاباتك مع توجيهك للصفحة ورقم الفقرة في حال الخطأ.'
                : 'Directly retrieves verified textbook chunks to generate questions and diagnose mistakes with precise page references.'}
            </p>

            {/* Book and Chapter Selectors */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
              <div>
                <label className="form-label">{language === 'ar' ? 'اختر الكتاب المقرر:' : 'Select Textbook:'}</label>
                <select
                  className="form-select"
                  value={selectedAiBook?.id || ''}
                  onChange={(e) => {
                    const b = books.find(x => x.id === e.target.value);
                    if (b) handleSelectAiBook(b);
                  }}
                >
                  {books.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.title_ar} ({b.subject_name_ar})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="form-label">{language === 'ar' ? 'اختر الفصل / الوحدة:' : 'Select Chapter:'}</label>
                <select
                  className="form-select"
                  value={selectedAiChapterId}
                  onChange={(e) => setSelectedAiChapterId(e.target.value)}
                >
                  {selectedAiBook?.chapters?.map((ch: any) => (
                    <option key={ch.id} value={ch.id}>
                      {ch.chapter_number}. {ch.title_ar} (ص {ch.start_page} - {ch.end_page})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button
              className="btn btn-primary btn-lg"
              onClick={handleGenerateAiAssessment}
              disabled={isGeneratingAi || !selectedAiChapterId}
              style={{ width: '100%' }}
            >
              <Sparkles size={20} />
              <span>{isGeneratingAi ? (language === 'ar' ? 'جاري توليد الأسئلة... يرجى الانتظار ⏳' : 'Generating questions... Please wait ⏳') : t.generateQuestionsBtn}</span>
            </button>

            {/* Waiting State Notification */}
            {isGeneratingAi && (
              <div style={{
                marginTop: '1.25rem',
                background: 'linear-gradient(135deg, #EFF6FF, #DBEAFE)',
                border: '1.5px solid var(--primary-300)',
                borderRadius: 'var(--radius-lg)',
                padding: '1.25rem',
                textAlign: 'center',
                boxShadow: '0 8px 16px -4px rgba(37, 99, 235, 0.12)'
              }}>
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '44px',
                  height: '44px',
                  borderRadius: '50%',
                  background: 'var(--primary-600)',
                  color: 'white',
                  marginBottom: '0.6rem',
                  animation: 'pulseGlow 1.5s infinite'
                }}>
                  <Sparkles size={22} />
                </div>
                <h4 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--primary-900)', marginBottom: '0.25rem' }}>
                  {language === 'ar' ? '⏳ يرجى الانتظار ثوانٍ معدودة...' : '⏳ Please wait a few seconds...'}
                </h4>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-body)', maxWidth: '500px', margin: '0 auto', lineHeight: 1.6 }}>
                  {language === 'ar'
                    ? 'يقوم الذكاء الاصطناعي الآن بقراءة وتحليل صفحات الفصل المختار من الكتاب المدرسي، واستخراج أسئلة دقيقة مطابقة للمنهج مع شروحاتها ومراجع الصفحات.'
                    : 'AI is reading and analyzing the textbook chapters to generate verified questions with page references.'}
                </p>
              </div>
            )}
          </div>

          {/* AI Assessment Questions */}
          {aiQuestions.length > 0 && !aiReport && (
            <div style={{ marginTop: '2rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 800 }}>
                  {language === 'ar' ? 'الأسئلة المولدة من نصوص الكتاب:' : 'Textbook-Based Questions:'}
                </h3>
                <span className="badge badge-primary">{aiQuestions.length} أسئلة</span>
              </div>

              {aiQuestions.map((q, idx) => (
                <div key={q.id} className="card" style={{ marginBottom: '1.25rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                    <span style={{ fontWeight: 800, color: 'var(--primary-700)', fontSize: '0.95rem' }}>
                      {language === 'ar' ? `السؤال ${idx + 1}` : `Question ${idx + 1}`}
                    </span>
                    <span className="badge badge-primary" style={{ fontSize: '0.75rem' }}>
                      {t.pageRefLabel} {q.page_reference}
                    </span>
                  </div>

                  <p style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--text-title)' }}>
                    {q.question_text}
                  </p>

                  <div>
                    {q.options.map((opt: any) => (
                      <div
                        key={opt.id}
                        className={`quiz-option ${aiAnswers[q.id] === opt.id ? 'selected' : ''}`}
                        onClick={() => setAiAnswers(prev => ({ ...prev, [q.id]: opt.id }))}
                      >
                        <div style={{
                          width: '20px',
                          height: '20px',
                          borderRadius: '50%',
                          border: '2px solid var(--border-focus)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}>
                          {aiAnswers[q.id] === opt.id && (
                            <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--primary-600)' }} />
                          )}
                        </div>
                        <span style={{ fontSize: '0.975rem' }}>{opt.text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              <button
                className="btn btn-success btn-lg"
                onClick={handleSubmitAiEvaluation}
                disabled={isEvaluatingAi || Object.keys(aiAnswers).length === 0}
                style={{ width: '100%', marginTop: '1rem' }}
              >
                <Award size={20} />
                <span>{isEvaluatingAi ? t.evaluatingReport : t.submitAiAnswers}</span>
              </button>
            </div>
          )}

          {/* AI Diagnostic Feedback & Study Prescription Report */}
          {aiReport && (
            <div className="card" style={{
              background: '#FFFFFF',
              border: '2px solid var(--primary-300)',
              borderRadius: 'var(--radius-xl)',
              padding: '2rem',
              marginTop: '1.5rem',
              boxShadow: 'var(--shadow-lg)'
            }}>
              <div style={{ textAlign: 'center', borderBottom: '1px solid var(--border-light)', paddingBottom: '1.5rem', marginBottom: '1.5rem' }}>
                <span className="badge badge-primary" style={{ marginBottom: '0.5rem' }}>
                  {language === 'ar' ? 'تقرير التقييم التشخيصي المستند للكتاب' : 'Diagnostic Assessment Report'}
                </span>
                <h3 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--primary-800)' }}>
                  {t.aiDiagnosisResult}
                </h3>
                
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '2rem', margin: '1.25rem 0' }}>
                  <div>
                    <div style={{ fontSize: '2.5rem', fontWeight: 900, color: aiReport.percentage >= 70 ? 'var(--success-600)' : 'var(--danger-600)' }}>
                      {aiReport.percentage}%
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      {aiReport.score} / {aiReport.max_score} إجابات صحيحة
                    </div>
                  </div>

                  <div style={{ borderRight: '1px solid var(--border-light)', height: '50px' }} />

                  <div>
                    <div style={{ fontSize: '1.15rem', fontWeight: 800 }}>
                      {aiReport.mastery_status === 'MASTERED' && <span style={{ color: 'var(--success-600)' }}>{t.statusMastered}</span>}
                      {aiReport.mastery_status === 'PROFICIENT' && <span style={{ color: 'var(--primary-600)' }}>{t.statusProficient}</span>}
                      {aiReport.mastery_status === 'DEVELOPING' && <span style={{ color: 'var(--warning-600)' }}>{t.statusDeveloping}</span>}
                      {aiReport.mastery_status === 'NEEDS_WORK' && <span style={{ color: 'var(--danger-600)' }}>{t.statusNeedsWork}</span>}
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{t.masteryStatus}</div>
                  </div>
                </div>

                <p style={{ color: 'var(--text-body)', maxWidth: '600px', margin: '0 auto', fontSize: '0.95rem' }}>
                  {language === 'ar' ? aiReport.overall_feedback_ar : aiReport.overall_feedback_en}
                </p>
              </div>

              {/* Weak Topics Warning Box */}
              {aiReport.weak_topics?.length > 0 && (
                <div className="study-box">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 800, fontSize: '1rem', marginBottom: '0.5rem' }}>
                    <AlertCircle size={20} />
                    <span>{t.weakTopicsHeading}</span>
                  </div>
                  <ul style={{ paddingRight: language === 'ar' ? '1.25rem' : '0', paddingLeft: language === 'en' ? '1.25rem' : '0' }}>
                    {aiReport.weak_topics.map((wt: string, i: number) => (
                      <li key={i} style={{ marginBottom: '0.35rem', fontWeight: 600 }}>{wt}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Item by Item Breakdown with Citations */}
              <div style={{ marginTop: '2rem' }}>
                <h4 style={{ fontSize: '1.15rem', fontWeight: 800, marginBottom: '1rem' }}>
                  {language === 'ar' ? 'التشخيص التفصيلي لكل سؤال وخطة المذاكرة:' : 'Itemized Diagnostic Breakdown:'}
                </h4>

                {aiReport.items?.map((item: any, idx: number) => (
                  <div 
                    key={item.question_id}
                    style={{
                      border: `1.5px solid ${item.is_correct ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`,
                      borderRadius: 'var(--radius-md)',
                      padding: '1.25rem',
                      marginBottom: '1rem',
                      background: item.is_correct ? 'var(--success-50)' : 'var(--danger-50)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {item.is_correct ? (
                          <CheckCircle2 size={20} color="var(--success-600)" />
                        ) : (
                          <XCircle size={20} color="var(--danger-600)" />
                        )}
                        <span style={{ fontWeight: 800, color: 'var(--text-title)' }}>
                          سؤال {idx + 1}: {item.question_text}
                        </span>
                      </div>
                      <span className="badge badge-primary">
                        {t.pageRefLabel} {item.page_reference}
                      </span>
                    </div>

                    <div style={{ fontSize: '0.9rem', margin: '0.5rem 0' }}>
                      <div>
                        <strong>{language === 'ar' ? 'إجابتك المسجلة: ' : 'Your Answer: '}</strong>
                        <span style={{ color: item.is_correct ? 'var(--success-700)' : 'var(--danger-700)' }}>
                          {item.student_answer_text}
                        </span>
                      </div>
                      {!item.is_correct && (
                        <div>
                          <strong>{language === 'ar' ? 'الإجابة الصحيحة بالكتاب: ' : 'Textbook Correct Answer: '}</strong>
                          <span style={{ color: 'var(--success-700)' }}>{item.correct_answer_text}</span>
                        </div>
                      )}
                    </div>

                    <div style={{ fontSize: '0.875rem', color: 'var(--text-body)', marginTop: '0.5rem', background: 'rgba(255, 255, 255, 0.7)', padding: '0.75rem', borderRadius: 'var(--radius-sm)' }}>
                      <div><strong>{t.whyWrongLabel}</strong> {item.explanation}</div>
                      <div style={{ marginTop: '0.4rem', color: '#92400E', fontWeight: 700 }}>
                        {item.study_recommendation}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => { setAiReport(null); setAiQuestions([]); }}
                >
                  {language === 'ar' ? 'إجراء تقييم جديد' : 'Take Another Assessment'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: TEXTBOOKS & CURRICULUM */}
      {activeTab === 'books' && (
        <div>
          {readingChapter ? (
            <div className="card">
              <button
                className="btn btn-outline btn-sm"
                onClick={() => setReadingChapter(null)}
                style={{ marginBottom: '1rem' }}
              >
                {language === 'ar' ? '← العودة لقائمة الفصول' : '← Back to Chapters'}
              </button>

              <h3 style={{ fontSize: '1.3rem', fontWeight: 800, marginBottom: '0.5rem', color: 'var(--primary-800)' }}>
                {readingChapter.title_ar}
              </h3>
              <p style={{ color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
                {readingChapter.description} • صفحات ({readingChapter.start_page} - {readingChapter.end_page})
              </p>

              <h4 style={{ fontWeight: 700, marginBottom: '0.75rem' }}>
                {language === 'ar' ? 'نصوص وفقرات الكتاب المستخرجة للتقييم:' : 'Extracted Curriculum Chunks:'}
              </h4>

              {selectedChapterChunks.map((chunk) => (
                <div key={chunk.id} style={{
                  background: 'var(--bg-main)',
                  border: '1px solid var(--border-light)',
                  borderRadius: 'var(--radius-md)',
                  padding: '1rem',
                  marginBottom: '1rem'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <span className="badge badge-primary">صفحة {chunk.page_number}</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>فقرة رقم {chunk.chunk_index}</span>
                  </div>
                  <p style={{ whiteSpace: 'pre-line', lineHeight: 1.8, fontSize: '0.95rem' }}>
                    {chunk.content}
                  </p>
                </div>
              ))}
            </div>
          ) : selectedBook ? (
            <div className="card">
              <button
                className="btn btn-outline btn-sm"
                onClick={() => setSelectedBook(null)}
                style={{ marginBottom: '1rem' }}
              >
                {language === 'ar' ? '← العودة للكتب' : '← Back to Books'}
              </button>

              <h3 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: '0.25rem' }}>
                {selectedBook.title_ar}
              </h3>
              <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
                المادة: {selectedBook.subject_name_ar} • الصف: {selectedBook.grade_name_ar} • {selectedBook.total_pages} صفحة
              </p>

              <h4 style={{ fontWeight: 800, fontSize: '1.1rem', marginBottom: '1rem' }}>
                {language === 'ar' ? 'فصول الكتاب المتاحة:' : 'Available Chapters:'}
              </h4>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {selectedBook.chapters?.map((ch: any) => (
                  <div
                    key={ch.id}
                    className="card card-interactive"
                    style={{ padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                    onClick={() => handleReadChapter(selectedBook.id, ch)}
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--primary-800)' }}>
                        {ch.chapter_number}. {ch.title_ar}
                      </div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                        {ch.description || 'فصل دراسي مقرر'} • (صفحة {ch.start_page} - {ch.end_page})
                      </div>
                    </div>
                    <ArrowIcon size={20} color="var(--primary-600)" />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="grid-cards">
              {books.map(book => (
                <div key={book.id} className="card card-interactive" onClick={() => handleOpenBookDetails(book.id)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                    <div style={{
                      width: '42px',
                      height: '42px',
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--primary-100)',
                      color: 'var(--primary-700)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <BookOpen size={22} />
                    </div>
                    <div>
                      <span className="badge badge-primary">{book.subject_name_ar}</span>
                    </div>
                  </div>

                  <h3 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '0.5rem' }}>
                    {book.title_ar}
                  </h3>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                    {book.grade_name_ar} • {book.chapters_count || 3} فصول مستخرجة
                  </p>

                  <button className="btn btn-secondary btn-sm" style={{ width: '100%' }}>
                    <span>{t.openBook}</span>
                    <ArrowIcon size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: TEACHER EXAMS */}
      {activeTab === 'exams' && (
        <div>
          {activeExam ? (
            <div className="card">
              <button
                className="btn btn-outline btn-sm"
                onClick={() => { setActiveExam(null); setExamResult(null); setExamTimeLeft(null); }}
                style={{ marginBottom: '1.25rem' }}
              >
                {language === 'ar' ? '← إلغاء والعودة للاختبارات' : '← Back to Exams'}
              </button>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                <div>
                  <h3 style={{ fontSize: '1.35rem', fontWeight: 800 }}>{activeExam.exam.title_ar}</h3>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                    إعداد المعلم: {activeExam.exam.teacher_name} • المدة: {activeExam.exam.duration_minutes} دقيقة
                  </p>
                </div>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.4rem 0.85rem',
                  borderRadius: 'var(--radius-full)',
                  background: examTimeLeft !== null && examTimeLeft < 120 ? '#FEE2E2' : 'var(--primary-50)',
                  border: examTimeLeft !== null && examTimeLeft < 120 ? '1.5px solid #EF4444' : '1.5px solid var(--primary-200)',
                  color: examTimeLeft !== null && examTimeLeft < 120 ? '#B91C1C' : 'var(--primary-700)',
                  fontWeight: 800,
                  fontSize: '1rem',
                  transition: 'all 0.3s ease'
                }}>
                  <Clock size={18} />
                  <span>
                    {examTimeLeft !== null ? formatTime(examTimeLeft) : `${activeExam.exam.duration_minutes} ${t.durationMin}`}
                  </span>
                  {examTimeLeft !== null && examTimeLeft < 120 && (
                    <span style={{ fontSize: '0.75rem', fontWeight: 700 }}>
                      ({language === 'ar' ? 'الوقت ينفد!' : 'Ending soon!'})
                    </span>
                  )}
                </div>
              </div>

              {examResult ? (
                <div style={{
                  background: examResult.passed ? 'var(--success-50)' : 'var(--danger-50)',
                  border: `2px solid ${examResult.passed ? 'var(--success-500)' : 'var(--danger-500)'}`,
                  borderRadius: 'var(--radius-lg)',
                  padding: '1.5rem',
                  marginBottom: '2rem',
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: '2.5rem', fontWeight: 900, color: examResult.passed ? 'var(--success-600)' : 'var(--danger-600)' }}>
                    {examResult.percentage}%
                  </div>
                  <h4 style={{ fontWeight: 800, fontSize: '1.2rem', marginBottom: '0.5rem' }}>
                    {examResult.passed ? 'تهانينا! لقد اجتزت الاختبار بنجاح' : 'بحاجة لإعادة مراجعة المفاهيم'}
                  </h4>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                    الدرجة: {examResult.score} من إجمالي {examResult.total_points} نقطة
                  </p>

                  <div style={{ marginTop: '1.5rem', textAlign: 'right' }}>
                    <h5 style={{ fontWeight: 700, marginBottom: '0.75rem' }}>{t.reviewAnswers}:</h5>
                    {examResult.breakdown?.map((b: any, idx: number) => (
                      <div key={b.question_id} style={{
                        background: '#FFFFFF',
                        borderRadius: 'var(--radius-md)',
                        padding: '1rem',
                        marginBottom: '0.75rem',
                        border: '1px solid var(--border-light)'
                      }}>
                        <div style={{ fontWeight: 700, marginBottom: '0.35rem' }}>
                          سؤال {idx + 1}: {b.question_text}
                        </div>
                        <div style={{ fontSize: '0.85rem' }}>
                          <span style={{ color: b.is_correct ? 'var(--success-600)' : 'var(--danger-600)', fontWeight: 700 }}>
                            {b.is_correct ? '✓ إجابة صحيحة' : '✗ إجابة خاطئة'}
                          </span>
                          {' • '}
                          <span>إجابتك: {b.selected_text}</span>
                          {!b.is_correct && <span style={{ color: 'var(--success-700)' }}> (الصحيح: {b.correct_text})</span>}
                        </div>
                        {b.explanation && (
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                            الشرح: {b.explanation}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div>
                  {activeExam.questions?.map((q: any, idx: number) => (
                    <div key={q.id} className="card" style={{ marginBottom: '1.25rem' }}>
                      <div style={{ fontWeight: 800, fontSize: '1.05rem', marginBottom: '0.75rem' }}>
                        سؤال {idx + 1}: {q.question_text} ({q.points} نقطة)
                      </div>

                      <div>
                        {q.options?.map((opt: any) => (
                          <div
                            key={opt.id}
                            className={`quiz-option ${examAnswers[q.id] === opt.id ? 'selected' : ''}`}
                            onClick={() => setExamAnswers(prev => ({ ...prev, [q.id]: opt.id }))}
                          >
                            <div style={{
                              width: '18px',
                              height: '18px',
                              borderRadius: '50%',
                              border: '2px solid var(--primary-400)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}>
                              {examAnswers[q.id] === opt.id && (
                                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--primary-600)' }} />
                              )}
                            </div>
                            <span>{opt.option_text}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}

                  <button
                    className="btn btn-primary btn-lg"
                    onClick={handleSubmitExam}
                    disabled={isSubmittingExam || Object.keys(examAnswers).length === 0}
                    style={{ width: '100%' }}
                  >
                    {isSubmittingExam ? 'جاري تصحيح الإجابات...' : 'تسجيل الإجابات وعرض النتيجة فورياً'}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800 }}>{t.availableExams}</h3>
                <span className="badge badge-primary">{exams.length} اختبارات</span>
              </div>

              <div className="grid-cards">
                {exams.map(ex => (
                  <div key={ex.id} className="card">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                      <span className="badge badge-primary">{ex.subject_name_ar}</span>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{ex.duration_minutes} {t.durationMin}</span>
                    </div>

                    <h4 style={{ fontWeight: 800, fontSize: '1.1rem', marginBottom: '0.5rem' }}>
                      {ex.title_ar}
                    </h4>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
                      إعداد: {ex.teacher_name} • {ex.questions_count} أسئلة تقويمية
                    </p>

                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => handleStartExam(ex.id)}
                      style={{ width: '100%' }}
                    >
                      <span>{t.takeExam}</span>
                      <ArrowIcon size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: LONGITUDINAL LEARNING ANALYTICS */}
      {activeTab === 'analytics' && (
        <div>
          {/* Summary Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.75rem' }}>
            <div className="card" style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--primary-700)' }}>
                {analytics?.summary?.total_ai_assessments || 0}
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                تقييمات ذكية مكتملة
              </div>
            </div>

            <div className="card" style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--primary-700)' }}>
                {analytics?.summary?.total_exams_taken || 0}
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                اختبارات معلم تم تسليمها
              </div>
            </div>

            <div className="card" style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--warning-600)' }}>
                {analytics?.summary?.weak_topics?.length || 0}
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                مفاهيم محددة بحاجة لمراجعة
              </div>
            </div>

            <div className="card" style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--success-600)' }}>
                {analytics?.summary?.strong_topics?.length || 0}
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                مفاهيم تم إتقانها بامتياز
              </div>
            </div>
          </div>

          {/* Weak Topics Priority Box */}
          {analytics?.summary?.weak_topics?.length > 0 && (
            <div className="card" style={{ marginBottom: '1.75rem', borderLeft: language === 'en' ? '4px solid var(--warning-500)' : 'none', borderRight: language === 'ar' ? '4px solid var(--warning-500)' : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <AlertCircle size={20} color="var(--warning-600)" />
                <h4 style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--warning-700)' }}>
                  {t.weakTopicsHeading}
                </h4>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {analytics.summary.weak_topics.map((item: string, i: number) => (
                  <div key={i} style={{
                    background: 'var(--warning-50)',
                    padding: '0.65rem 1rem',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.9rem',
                    fontWeight: 600,
                    color: '#92400E'
                  }}>
                    🎯 {item}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Topic Mastery Progress List */}
          <div className="card" style={{ marginBottom: '1.75rem' }}>
            <h4 style={{ fontWeight: 800, fontSize: '1.15rem', marginBottom: '1.25rem' }}>
              {language === 'ar' ? 'مستوى إتقان الفصول الدراسية:' : 'Chapter Mastery Progression:'}
            </h4>

            {analytics?.topics?.length > 0 ? (
              analytics.topics.map((tp: any) => (
                <div key={tp.id} style={{ marginBottom: '1.25rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                    <div>
                      <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{tp.chapter_title_ar}</span>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}> ({tp.subject_name_ar})</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontWeight: 800 }}>{tp.mastery_percentage}%</span>
                      <span className={`badge ${tp.status === 'MASTERED' ? 'badge-success' : tp.status === 'PROFICIENT' ? 'badge-primary' : 'badge-warning'}`}>
                        {tp.status}
                      </span>
                    </div>
                  </div>

                  <div className="progress-container">
                    <div
                      className="progress-bar"
                      style={{
                        width: `${tp.mastery_percentage}%`,
                        background: tp.mastery_percentage >= 75 ? 'linear-gradient(90deg, var(--success-500), var(--success-600))' : 'linear-gradient(90deg, var(--primary-500), var(--primary-600))'
                      }}
                    />
                  </div>
                </div>
              ))
            ) : (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                ابدأ بإجراء أول تقييم ذكي لتتبع مستوى إتقانك هنا!
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
