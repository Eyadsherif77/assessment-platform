import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../context/AuthContext';
import { apiUrl } from '../utils/api';
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
  Edit3,
  ExternalLink,
  X,
  Calendar,
  TrendingUp
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

  // Dedicated Completed Exams History Modal State
  const [showExamsHistoryModal, setShowExamsHistoryModal] = useState<boolean>(false);

  // Books Data & PDF Reader
  const [books, setBooks] = useState<any[]>([]);
  const [selectedPdfBook, setSelectedPdfBook] = useState<any | null>(null);
  const [pdfLoading, setPdfLoading] = useState<boolean>(false);
  const [pdfProgress, setPdfProgress] = useState<number>(0);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);

  const handleOpenPdfBook = async (book: any) => {
    setSelectedPdfBook(book);
    setPdfLoading(true);
    setPdfProgress(12);
    if (pdfBlobUrl) {
      URL.revokeObjectURL(pdfBlobUrl);
      setPdfBlobUrl(null);
    }

    const pdfEndpoint = apiUrl(`/api/books/${book.id}/pdf?token=${token}`);
    const startTime = Date.now();

    // Smooth ticker to guarantee active visual progress
    let tickerProgress = 12;
    const progressTicker = setInterval(() => {
      tickerProgress = Math.min(92, tickerProgress + Math.floor(Math.random() * 8 + 4));
      setPdfProgress(tickerProgress);
    }, 140);

    try {
      const response = await fetch(pdfEndpoint);
      if (!response.ok) throw new Error('فشل تحميل ملف الكتاب');

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      setPdfBlobUrl(objectUrl);
      setPdfProgress(100);
    } catch (err) {
      console.error('PDF fetch fallback to direct endpoint:', err);
      setPdfBlobUrl(pdfEndpoint);
      setPdfProgress(100);
    } finally {
      clearInterval(progressTicker);
      const elapsed = Date.now() - startTime;
      const minDisplayTime = Math.max(300, 700 - elapsed);
      setTimeout(() => {
        setPdfLoading(false);
      }, minDisplayTime);
    }
  };

  const handleClosePdf = () => {
    setSelectedPdfBook(null);
    setPdfLoading(false);
    if (pdfBlobUrl) {
      URL.revokeObjectURL(pdfBlobUrl);
      setPdfBlobUrl(null);
    }
  };

  // Keyboard shortcut (Escape) & Lock body overflow when PDF is open or modal is active
  useEffect(() => {
    if (selectedPdfBook || showExamsHistoryModal) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedPdfBook) handleClosePdf();
        if (showExamsHistoryModal) setShowExamsHistoryModal(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [selectedPdfBook, pdfBlobUrl, showExamsHistoryModal]);

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
  const [aiGenError, setAiGenError] = useState<string | null>(null);

  // AI Assessment Debug Mode (Development Only - Hidden in Production)
  const isDevMode = import.meta.env.DEV || (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'));
  const [showAiDebugModal, setShowAiDebugModal] = useState<boolean>(false);
  const [aiDebugData, setAiDebugData] = useState<any[] | null>(null);
  const [selectedDebugIdx, setSelectedDebugIdx] = useState<number>(0);

  // Learning Analytics Data
  const [analytics, setAnalytics] = useState<any | null>(null);

  const calculatedMastery = (analytics?.summary?.overall_mastery_percentage !== undefined && analytics?.summary?.overall_mastery_percentage > 0)
    ? analytics.summary.overall_mastery_percentage
    : (analytics?.topics && analytics.topics.length > 0
        ? Math.round(analytics.topics.reduce((acc: number, t: any) => acc + (Number(t.mastery_percentage) || 0), 0) / analytics.topics.length)
        : 0);

  const totalCompletedAssessments = analytics?.summary?.total_exams_taken 
    || analytics?.summary?.total_attempts 
    || analytics?.topics?.length 
    || 0;

  // Periodic Average Level Filter State (Monthly / Weekly / Subject)
  const [periodType, setPeriodType] = useState<'month' | 'week'>('month');
  const [selectedPeriodKey, setSelectedPeriodKey] = useState<string>('all');
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState<string>('all');

  const { monthlyGroups, weeklyGroups, activePeriodGroup, filteredExams, currentAvgRate, availableSubjects } = useMemo(() => {
    const allExams: any[] = analytics?.completed_exams || [];

    // --- Extract unique subjects from all exams ---
    const subjectMap = new Map<string, { id: string; nameAr: string; nameEn: string; count: number }>();
    allExams.forEach(e => {
      if (!e) return;
      const sid = e.subject_id || e.subject_name_ar || 'unknown';
      if (!subjectMap.has(sid)) {
        subjectMap.set(sid, {
          id: sid,
          nameAr: e.subject_name_ar || 'غير محدد',
          nameEn: e.subject_name_en || e.subject_name_ar || 'Unknown',
          count: 0
        });
      }
      subjectMap.get(sid)!.count++;
    });
    const availableSubjects = Array.from(subjectMap.values()).sort((a, b) => b.count - a.count);

    // --- Filter by selected subject first ---
    const subjectFiltered = selectedSubjectFilter === 'all'
      ? allExams
      : allExams.filter(e => e && (e.subject_id === selectedSubjectFilter || e.subject_name_ar === selectedSubjectFilter));
    
    // Sort exams by created_at descending (latest first)
    const sortedExams = [...subjectFiltered].filter(e => e && e.created_at).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    const monthMap = new Map<string, { labelAr: string; labelEn: string; startDate: Date; endDate: Date; exams: any[] }>();
    const weekMap = new Map<string, { labelAr: string; labelEn: string; subLabelAr?: string; subLabelEn?: string; startDate: Date; endDate: Date; exams: any[] }>();

    sortedExams.forEach(exam => {
      const d = new Date(exam.created_at);
      if (isNaN(d.getTime())) return;

      // --- Month Grouping ---
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!monthMap.has(monthKey)) {
        const monthStart = new Date(d.getFullYear(), d.getMonth(), 1);
        const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
        const labelAr = d.toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' });
        const labelEn = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        monthMap.set(monthKey, { labelAr, labelEn, startDate: monthStart, endDate: monthEnd, exams: [] });
      }
      monthMap.get(monthKey)!.exams.push(exam);

      // --- Week Grouping (Week starts on Saturday) ---
      const day = d.getDay(); // 0 is Sun, 6 is Sat
      const offset = (day + 1) % 7;
      const weekStart = new Date(d);
      weekStart.setDate(d.getDate() - offset);
      weekStart.setHours(0, 0, 0, 0);

      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);

      const weekKey = `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, '0')}-${String(weekStart.getDate()).padStart(2, '0')}`;
      if (!weekMap.has(weekKey)) {
        const labelAr = `${weekStart.getDate()} ${weekStart.toLocaleDateString('ar-EG', { month: 'short' })} - ${weekEnd.getDate()} ${weekEnd.toLocaleDateString('ar-EG', { month: 'short', year: 'numeric' })}`;
        const labelEn = `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
        
        const now = new Date();
        const isCurrentWeek = now >= weekStart && now <= weekEnd;
        const subLabelAr = isCurrentWeek ? 'الأسبوع الحالي' : `أسبوع ${weekStart.getDate()} ${weekStart.toLocaleDateString('ar-EG', { month: 'short' })}`;
        const subLabelEn = isCurrentWeek ? 'Current Week' : `Week of ${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;

        weekMap.set(weekKey, { labelAr, labelEn, subLabelAr, subLabelEn, startDate: weekStart, endDate: weekEnd, exams: [] });
      }
      weekMap.get(weekKey)!.exams.push(exam);
    });

    const buildGroupList = (map: Map<string, any>) => {
      return Array.from(map.entries()).map(([key, data]) => {
        const percentages = data.exams.map((e: any) => e.percentage ?? Math.round(((e.score || 0) / (e.total || 1)) * 100));
        const avgPercentage = percentages.length > 0 
          ? Math.round(percentages.reduce((a: number, b: number) => a + b, 0) / percentages.length)
          : 0;
        const highestScore = percentages.length > 0 ? Math.max(...percentages) : 0;
        const lowestScore = percentages.length > 0 ? Math.min(...percentages) : 0;

        return {
          key,
          labelAr: data.labelAr,
          labelEn: data.labelEn,
          subLabelAr: data.subLabelAr,
          subLabelEn: data.subLabelEn,
          startDate: data.startDate,
          endDate: data.endDate,
          exams: data.exams,
          avgPercentage,
          highestScore,
          lowestScore
        };
      }).sort((a, b) => b.startDate.getTime() - a.startDate.getTime());
    };

    const monthlyGroups = buildGroupList(monthMap);
    const weeklyGroups = buildGroupList(weekMap);

    const activeList = periodType === 'month' ? monthlyGroups : weeklyGroups;
    const activePeriodGroup = selectedPeriodKey === 'all' 
      ? null 
      : activeList.find(g => g.key === selectedPeriodKey) || null;

    const filteredExams = activePeriodGroup 
      ? activePeriodGroup.exams 
      : sortedExams;

    const currentPercentages = filteredExams.map((e: any) => e.percentage ?? Math.round(((e.score || 0) / (e.total || 1)) * 100));
    const currentAvgRate = currentPercentages.length > 0
      ? Math.round(currentPercentages.reduce((a: number, b: number) => a + b, 0) / currentPercentages.length)
      : (calculatedMastery || 0);

    return { monthlyGroups, weeklyGroups, activePeriodGroup, filteredExams, currentAvgRate, availableSubjects };
  }, [analytics?.completed_exams, periodType, selectedPeriodKey, selectedSubjectFilter, calculatedMastery]);

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
    setAiGenError(null);
    setAiReport(null);
    setAiAnswers({});
    setCurrentQuestionIndex(0);

    try {
      const res = await fetch(apiUrl('/api/ai/generate-quiz'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          ...(isDevMode ? { 'x-dev-debug': 'true' } : {})
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
      if (isDevMode) {
        setAiDebugData(data.debug_info || data.questions || null);
      }
      setAiStep(4); // Advance to solve step
    } catch (err: any) {
      setAiGenError(err.message || 'فشل توليد التقييم');
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
              <div style={{ fontWeight: 600 }}>{isAr ? (user?.profile?.grade_name_ar || 'الصف الثالث الإعدادي') : (user?.profile?.grade_name_en || 'Prep 3')}</div>
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
            <span>{isAr ? `${analytics?.summary?.study_streak_days || 0} أيام دراسية متتالية 🔥` : `${analytics?.summary?.study_streak_days || 0}-Day Study Streak 🔥`}</span>
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
            <span>{isAr ? 'امتحانات متغيرة' : 'Variable Exams'}</span>
          </button>

          <button
            className={`sidebar-btn ${activeTab === 'exams' ? 'active' : ''}`}
            onClick={() => setActiveTab('exams')}
          >
            <Clock size={18} />
            <span>{isAr ? `امتحانات ثابتة (${exams.length})` : `Fixed Exams (${exams.length})`}</span>
          </button>

          <button
            className={`sidebar-btn ${activeTab === 'analytics' ? 'active' : ''}`}
            onClick={() => setActiveTab('analytics')}
          >
            <BarChart3 size={18} />
            <span>{isAr ? 'تحليلات النتائج' : 'Results Analytics'}</span>
          </button>
        </nav>
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
                    ? <>{user?.profile?.grade_name_ar || 'الصف الثالث الإعدادي'} • <strong>{user?.profile?.school_type === 'لغات' ? '🌐 مدارس لغات' : '🏫 مدارس عربي'}</strong></>
                    : <>Enrolled in <strong>{user?.profile?.grade_name_en || 'Prep 1'}</strong> • <strong>{user?.profile?.school_type === 'لغات' ? 'Language School' : 'Arabic School'}</strong></>}
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
                  {analytics?.summary?.study_streak_days ? `${analytics.summary.study_streak_days} ${isAr ? 'أيام 🔥' : 'Days 🔥'}` : (isAr ? '0 أيام 🔥' : '0 Days 🔥')}
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
                  {`${Math.min(analytics?.summary?.total_attempts || 0, 5)} / 5`}
                </div>
                <div style={{ width: '100%', height: '6px', background: 'var(--border-light)', borderRadius: '999px', overflow: 'hidden' }}>
                  <div style={{ width: `${Math.min(100, Math.round(((analytics?.summary?.total_attempts || 0) / 5) * 100))}%`, height: '100%', background: 'var(--primary-600)', borderRadius: '999px', transition: 'width 0.3s ease' }} />
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
                  {`${calculatedMastery}%`}
                </div>
                <div style={{ fontSize: '0.78rem', color: '#16A34A', fontWeight: 700 }}>
                  {calculatedMastery >= 80 
                    ? (isAr ? '✓ أداء متقدم ومطابق لمواصفات الوزارة' : '✓ Advanced performance matching specs')
                    : totalCompletedAssessments > 0
                    ? (isAr ? '📈 قيد التطوير والتحسين المستمر' : '📈 Developing in progress')
                    : (isAr ? '🌟 ابدأ أول تقييم لتحديد مستواك' : '🌟 Take your first quiz to assess level')}
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
                    {isAr ? (books[0]?.title_ar || 'كتاب العلوم - الصف الثالث الإعدادي') : (books[0]?.title_en || 'Science Book - Prep 3')}
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

            {/* Quick Grid: Available Exams */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.25rem' }}>

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


            {/* Recent Completed Assessments on Home */}
            {analytics?.completed_exams && analytics.completed_exams.length > 0 && (
              <div className="card" style={{ padding: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '1.2rem' }}>📊</span>
                    <h3 style={{ fontSize: '1.05rem', fontWeight: 800, margin: 0 }}>
                      {isAr ? 'آخر الاختبارات والتقييمات المنجزة' : 'Recent Completed Assessments'}
                    </h3>
                  </div>
                  <button className="btn btn-ghost btn-sm" onClick={() => setActiveTab('analytics')}>
                    {isAr ? 'عرض تحليلات النتائج ⬅️' : 'View Results Analytics ➡️'}
                  </button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.75rem' }}>
                  {analytics.completed_exams.slice(0, 3).map((exam: any, i: number) => {
                    const pct = exam.percentage ?? Math.round(((exam.score || 0) / (exam.total || 1)) * 100);
                    const isMastered = pct >= 80;
                    const isProficient = pct >= 60 && pct < 80;
                    const badgeColor = isMastered ? '#16A34A' : isProficient ? '#2563EB' : '#D97706';
                    return (
                      <div key={exam.id || i} style={{ padding: '0.85rem 1rem', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: '0.88rem' }}>
                            {isAr ? (exam.chapter_title_ar || exam.title_ar) : (exam.chapter_title_en || exam.title_en)}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            {isAr ? exam.subject_name_ar : (exam.subject_name_en || exam.subject_name_ar)} • {exam.score}/{exam.total} {isAr ? 'درجات' : 'pts'}
                          </div>
                        </div>
                        <span style={{ fontWeight: 900, color: badgeColor, fontSize: '1rem' }}>
                          {pct}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

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
                    {isAr ? 'اختار المادة الدراسية للتقييم' : 'Select Subject for Diagnostic Quiz'}
                  </h2>
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
                      const isBookEnglish = !/[\u0600-\u06FF]/.test(selectedAiBook.title_ar || '') || 
                        /math|science|english/i.test(`${selectedAiBook.title_ar} ${selectedAiBook.title_en} ${selectedAiBook.subject_name_en || ''}`);
                      
                      const displayTitle = isBookEnglish 
                        ? (ch.title_en || ch.title_ar) 
                        : (isAr ? ch.title_ar : (ch.title_en || ch.title_ar));

                      const displayDescription = isBookEnglish
                        ? (ch.description_en || (!/[\u0600-\u06FF]/.test(ch.description || '') ? ch.description : (
                            ch.chapter_number === 1 ? 'The set of rational numbers, ordering, comparisons, fundamental arithmetic operations, and properties.' :
                            ch.chapter_number === 2 ? 'Algebraic terms and expressions, degrees of terms, operations on polynomials, and linear equations.' :
                            ch.chapter_number === 3 ? 'Measures of central tendency: arithmetic mean, median, mode, and probability principles.' :
                            ch.chapter_number === 4 ? 'Angle relationships, vertically opposite angles, triangle congruence criteria, and parallelism.' :
                            'Curriculum concepts, exercises, and diagnostic assessments.'
                          )))
                        : (isAr ? ch.description : (ch.description_en || ch.description));

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
                            transition: 'all 0.2s ease',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between'
                          }}
                        >
                          <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                              <span className="badge badge-primary">
                                {isBookEnglish || !isAr ? `Chapter #${ch.chapter_number}` : `الفصل #${ch.chapter_number}`}
                              </span>
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                {isBookEnglish || !isAr ? `${ch.chunks_count ?? 3} Paragraphs` : `${ch.chunks_count ?? 3} فقرات مفهرسة`}
                              </span>
                            </div>
                            <h4 style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--text-title)', margin: '0 0 0.4rem' }}>
                              {displayTitle}
                            </h4>
                            {displayDescription && (
                              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0 0 0.75rem', lineHeight: '1.4' }}>
                                {displayDescription}
                              </p>
                            )}
                          </div>
                          <span style={{ fontSize: '0.78rem', color: 'var(--primary-700)', fontWeight: 700, marginTop: '0.5rem' }}>
                            {isBookEnglish || !isAr ? 'Click to select this chapter ➡️' : 'انقر لاختيار هذا الفصل ⬅️'}
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

                <h2 style={{ fontSize: 'clamp(1.25rem, 4.5vw, 1.6rem)', fontWeight: 900, marginBottom: '1.75rem', lineHeight: 1.35, wordBreak: 'break-word' }}>
                  {isAr ? 'جاهز لامتحان جديد' : 'Ready for a New Exam?'}
                </h2>


                {aiGenError && (
                  <div style={{
                    padding: '0.85rem 1.25rem',
                    marginBottom: '1.25rem',
                    background: '#FEF2F2',
                    border: '1.5px solid #FCA5A5',
                    borderRadius: 'var(--radius-lg)',
                    color: '#991B1B',
                    fontSize: '0.88rem',
                    fontWeight: 700,
                    lineHeight: 1.6,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.6rem',
                    textAlign: 'start'
                  }}>
                    <AlertCircle size={22} style={{ flexShrink: 0, color: '#DC2626' }} />
                    <div style={{ flex: 1 }}>{aiGenError}</div>
                  </div>
                )}

                <div className="card-actions-responsive">
                  <button
                    className="btn btn-primary btn-lg"
                    onClick={handleGenerateAiAssessment}
                    disabled={isGeneratingAi}
                    style={{ fontWeight: 800, borderRadius: 'var(--radius-full)' }}
                  >
                    {isGeneratingAi 
                      ? (isAr ? 'جاري تجهيز أسئلة الاختبار...' : 'Preparing exam questions...') 
                      : (isAr ? 'بدء الاختبار وحل الأسئلة 🚀' : 'Start Exam & Solve Questions 🚀')}
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
                {/* AI Assessment Debug Mode Banner (Development Only - Hidden in Production) */}
                {isDevMode && (
                  <div style={{
                    background: 'linear-gradient(135deg, #1E1B4B 0%, #312E81 100%)',
                    borderRadius: 'var(--radius-xl)',
                    padding: '0.85rem 1.25rem',
                    marginBottom: '1.25rem',
                    border: '1.5px solid #4338CA',
                    boxShadow: '0 4px 15px rgba(49, 46, 129, 0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '0.75rem'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <span style={{ fontSize: '1.3rem' }}>🛠️</span>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ color: '#FFFFFF', fontWeight: 800, fontSize: '0.9rem' }}>
                            {isAr ? 'وضع فحص التوليد الذكي (AI Debug Mode)' : 'AI Assessment Debug Mode'}
                          </span>
                          <span style={{
                            background: '#F59E0B',
                            color: '#78350F',
                            fontSize: '0.65rem',
                            fontWeight: 900,
                            padding: '2px 7px',
                            borderRadius: '999px',
                            letterSpacing: '0.5px'
                          }}>
                            DEV ONLY
                          </span>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#C7D2FE', marginTop: '2px' }}>
                          {isAr ? 'فحص الفقرات المنهجية التي استلمها Gemini ونسب بلوم ودرجات التشابه' : 'Inspect raw textbook chunk text, Bloom levels & database traceability'}
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => setShowAiDebugModal(true)}
                      style={{
                        background: '#4F46E5',
                        color: '#FFFFFF',
                        border: '1px solid #6366F1',
                        borderRadius: 'var(--radius-lg)',
                        padding: '0.5rem 1rem',
                        fontSize: '0.82rem',
                        fontWeight: 800,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        boxShadow: '0 2px 8px rgba(79, 70, 229, 0.4)'
                      }}
                    >
                      <span>🔍</span>
                      <span>{isAr ? 'فتح لوحة فحص التوليد' : 'Open Inspection Panel'}</span>
                    </button>
                  </div>
                )}

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
                  const isQEn = ((currentQ.question_text || '').match(/[a-zA-Z]/g) || []).length > ((currentQ.question_text || '').match(/[\u0600-\u06FF]/g) || []).length;

                  return (
                    <div key={currentQ.id || currentQuestionIndex} className="card" style={{ padding: '1.75rem 1.25rem', borderRadius: 'var(--radius-2xl)', boxShadow: 'var(--shadow-md)', width: '100%', boxSizing: 'border-box' }}>
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

                          <h3 style={{
                            fontSize: '1.2rem',
                            fontWeight: 800,
                            color: 'var(--text-title)',
                            lineHeight: 1.6,
                            marginBottom: '1.5rem',
                            wordBreak: 'break-word',
                            direction: isQEn ? 'ltr' : 'rtl',
                            textAlign: isQEn ? 'left' : 'right'
                          }}>
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
                                    minWidth: 0,
                                    flexDirection: isQEn ? 'row' : 'row'
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
                                  <span style={{
                                    minWidth: 0,
                                    wordBreak: 'break-word',
                                    direction: isQEn ? 'ltr' : 'rtl',
                                    textAlign: isQEn ? 'left' : 'right'
                                  }}>
                                    {opt.option_text || opt.text || ''}
                                  </span>
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
                      {isDevMode && (
                        <button
                          className="btn btn-outline"
                          onClick={() => setShowAiDebugModal(true)}
                          style={{
                            fontWeight: 800,
                            borderColor: '#818CF8',
                            color: '#4F46E5',
                            background: '#EEF2FF',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.4rem'
                          }}
                        >
                          <Sparkles size={16} />
                          <span>{isAr ? 'فحص توليد الأسئلة (Debug Panel)' : 'Inspect Questions (Debug Panel)'}</span>
                          <span style={{
                            background: '#F59E0B',
                            color: '#78350F',
                            fontSize: '0.65rem',
                            fontWeight: 900,
                            padding: '1px 6px',
                            borderRadius: '999px'
                          }}>DEV</span>
                        </button>
                      )}
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', color: 'var(--primary-800)', fontWeight: 800, fontSize: '1.2rem', marginBottom: '1rem' }}>
                    <BookmarkCheck size={24} color="var(--primary-600)" />
                    <span>{isAr ? 'خطة المراجعة والتوصيات لفهم و تعلم الوحدة' : 'Action Plan & Recommendations'}</span>
                    {(selectedAiBook?.subject_name_ar || selectedAiBook?.title_ar) && (
                      <span className="badge badge-primary" style={{ fontSize: '0.85rem', padding: '0.25rem 0.75rem', borderRadius: 'var(--radius-md)', fontWeight: 700, border: '1px solid var(--primary-200)', background: 'var(--primary-50)', color: 'var(--primary-700)' }}>
                        {isAr ? (selectedAiBook?.subject_name_ar || selectedAiBook?.title_ar) : (selectedAiBook?.subject_name_en || selectedAiBook?.title_en || selectedAiBook?.title_ar)}
                      </span>
                    )}
                  </div>

                  <p style={{ color: 'var(--text-body)', lineHeight: 1.7, fontSize: '0.925rem', marginBottom: '1.5rem' }}>
                    {isAr 
                      ? 'بناءا على اجابة الطالب سنوضح تحليل إجابة كل سؤال مع التوجييه بمراجعة صفحات محددة بالكتاب المدرسى لمزيد من الفهم و التعلم'
                      : 'Based on the student response, we provide an analysis for each question with guidance to review specific textbook pages for deeper understanding.'}
                  </p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', marginBottom: '2rem' }}>
                    {aiReport?.items && aiReport.items.length > 0 ? (
                      aiReport.items.map((item: any, idx: number) => {
                        const isItemEn = ((item.question_text || '').match(/[a-zA-Z]/g) || []).length > ((item.question_text || '').match(/[\u0600-\u06FF]/g) || []).length;
                        return (
                        <div
                          key={item.question_id || idx}
                          style={{
                            padding: '1.15rem',
                            background: item.is_correct ? '#F8FCF9' : '#FFFDF5',
                            borderRadius: 'var(--radius-lg)',
                            border: item.is_correct ? '1px solid #DCFCE7' : '1px solid #FEF3C7',
                            direction: isItemEn ? 'ltr' : 'rtl',
                            textAlign: isItemEn ? 'left' : 'right'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                              <span style={{ fontSize: '1.1rem' }}>{item.is_correct ? '✅' : '❌'}</span>
                              <strong style={{ color: 'var(--primary-950)', fontSize: '0.95rem' }}>
                                {isAr ? `السؤال ${idx + 1}` : `Question ${idx + 1}`}: {item.question_text}
                              </strong>
                              <span className="badge badge-primary" style={{ marginInlineStart: '0.25rem' }}>
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
                      );
                    })
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
                    ? `مخصصة ومقيدة بصفك الدراسي (${user?.profile?.grade_name_ar || 'الصف الثالث الإعدادي'}) ونوع مدرستك (${user?.profile?.school_type === 'لغات' ? 'مدارس لغات' : 'مدارس عربي'})`
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
                    className="btn btn-primary"
                    onClick={() => handleOpenPdfBook(book)}
                    style={{ fontWeight: 800, width: '100%', marginTop: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '0.75rem' }}
                  >
                    <BookOpen size={18} />
                    {isAr ? 'فتح وتصفح الكتاب (PDF) 📖' : 'Open & Read Book (PDF) 📖'}
                  </button>
                </div>
              ))}
            </div>

            {/* Dedicated Fullscreen PDF Reader Modal via Portal - Single Unified Navbar & Photo 2 Radial Spinner */}
            {selectedPdfBook && createPortal(
              <div style={{
                position: 'fixed',
                inset: 0,
                width: '100vw',
                height: '100vh',
                backgroundColor: '#0F172A',
                zIndex: 999999,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                boxSizing: 'border-box'
              }}>
                {/* SINGLE UNIFIED TOP NAVBAR */}
                <header style={{
                  height: '64px',
                  background: '#0F172A',
                  color: '#FFFFFF',
                  borderBottom: '1px solid #334155',
                  padding: '0 1.25rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '1rem',
                  flexShrink: 0,
                  zIndex: 1000000,
                  boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)'
                }}>
                  {/* Right side (RTL): Exit button + Textbook details */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', minWidth: 0 }}>
                    <button
                      onClick={handleClosePdf}
                      style={{
                        background: 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)',
                        color: '#FFFFFF',
                        fontWeight: 800,
                        padding: '0.55rem 1.15rem',
                        borderRadius: 'var(--radius-lg)',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '0.9rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        flexShrink: 0,
                        boxShadow: '0 4px 14px rgba(220, 38, 38, 0.4)',
                        transition: 'all 0.15s ease'
                      }}
                      title={isAr ? 'إغلاق الكتاب والعودة للوحة التحكم (Esc)' : 'Close Book & Return (Esc)'}
                    >
                      <X size={18} strokeWidth={3} />
                      <span>{isAr ? 'إغلاق الكتاب والعودة' : 'Close & Return'}</span>
                      <span style={{
                        background: 'rgba(0,0,0,0.25)',
                        fontSize: '0.7rem',
                        padding: '0.1rem 0.4rem',
                        borderRadius: '4px',
                        fontFamily: 'monospace'
                      }}>Esc</span>
                    </button>

                    <div style={{ height: '24px', width: '1px', background: '#334155' }} />

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', overflow: 'hidden' }}>
                      <div style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: 'var(--radius-md)',
                        background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        color: '#FFFFFF'
                      }}>
                        <BookOpen size={18} />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                        <strong style={{ fontSize: '0.95rem', color: '#F8FAFC', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                          {isAr ? selectedPdfBook.title_ar : (selectedPdfBook.title_en || selectedPdfBook.title_ar)}
                        </strong>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.72rem', color: '#94A3B8' }}>
                          <span>{isAr ? selectedPdfBook.grade_name_ar : (selectedPdfBook.grade_name_en || selectedPdfBook.grade_name_ar)}</span>
                          <span>•</span>
                          <span>{isAr ? selectedPdfBook.subject_name_ar : (selectedPdfBook.subject_name_en || selectedPdfBook.subject_name_ar)}</span>
                          {selectedPdfBook.school_type && (
                            <>
                              <span>•</span>
                              <span style={{
                                color: selectedPdfBook.school_type === 'لغات' ? '#60A5FA' : '#4ADE80',
                                fontWeight: 700
                              }}>
                                {selectedPdfBook.school_type === 'لغات' ? (isAr ? '🌐 مدارس لغات' : 'Language') : (isAr ? '🏫 عربي' : 'Arabic')}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Left side (RTL): External window link */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
                    <a
                      href={apiUrl(`/api/books/${selectedPdfBook.id}/pdf?token=${token}`)}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        background: 'rgba(255, 255, 255, 0.08)',
                        color: '#E2E8F0',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                        fontWeight: 700,
                        padding: '0.45rem 0.85rem',
                        borderRadius: 'var(--radius-md)',
                        textDecoration: 'none',
                        fontSize: '0.8rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        transition: 'background 0.15s ease'
                      }}
                      title={isAr ? 'فتح الكتاب في نافذة مستقلة' : 'Open in new tab'}
                    >
                      <ExternalLink size={14} />
                      <span>{isAr ? 'نافذة خارجية ↗' : 'New Tab ↗'}</span>
                    </a>
                  </div>
                </header>

                {/* PDF Content Area */}
                <div style={{ flex: 1, position: 'relative', width: '100%', height: 'calc(100vh - 64px)', background: '#0F172A' }}>
                  {/* Animated Radial Loading Overlay (Matches Photo 2) */}
                  {pdfLoading && (
                    <div style={{
                      position: 'absolute',
                      inset: 0,
                      background: '#0B0F17',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      zIndex: 50,
                      padding: '2rem'
                    }}>
                      <div className="radial-loader-wrapper">
                        {/* 12-Segment Radial Spinner SVG from Photo 2 */}
                        <svg
                          className="radial-loader-svg"
                          viewBox="0 0 64 64"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          {[
                            { rot: 0, op: 0.12 },
                            { rot: 30, op: 0.18 },
                            { rot: 60, op: 0.25 },
                            { rot: 90, op: 0.33 },
                            { rot: 120, op: 0.42 },
                            { rot: 150, op: 0.52 },
                            { rot: 180, op: 0.62 },
                            { rot: 210, op: 0.72 },
                            { rot: 240, op: 0.82 },
                            { rot: 270, op: 0.90 },
                            { rot: 300, op: 0.96 },
                            { rot: 330, op: 1.0 }
                          ].map(({ rot, op }, i) => (
                            <rect
                              key={i}
                              x="29"
                              y="4"
                              width="6"
                              height="16"
                              rx="3"
                              fill="#FFFFFF"
                              opacity={op}
                              transform={`rotate(${rot} 32 32)`}
                            />
                          ))}
                        </svg>

                        <div className="radial-loader-title">
                          LOADING...
                        </div>

                        <div className="radial-loader-percent">
                          {pdfProgress}%
                        </div>

                        <div className="radial-loader-text">
                          {isAr ? 'جاري تحميل وتجهيز صفحات الكتاب المدرسي...' : 'Loading and buffering textbook pages...'}
                        </div>

                        <div className="radial-progress-track">
                          <div
                            className="radial-progress-fill"
                            style={{ width: `${pdfProgress}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {pdfBlobUrl && (
                    <iframe
                      src={pdfBlobUrl}
                      title={selectedPdfBook.title_ar}
                      style={{
                        width: '100%',
                        height: '100%',
                        border: 'none',
                        display: 'block'
                      }}
                    />
                  )}
                </div>
              </div>,
              document.body
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

                {/* Exam Result Display with Textbook Page References */}
                {examResult ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
                    {/* Header Score Card */}
                    <div style={{
                      textAlign: 'center',
                      padding: '2rem 1.5rem',
                      background: 'linear-gradient(180deg, var(--bg-subtle) 0%, #FFFFFF 100%)',
                      borderRadius: 'var(--radius-xl)',
                      border: '1px solid var(--border-light)'
                    }}>
                      <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>🎯</div>
                      <h3 style={{ fontSize: '1.5rem', fontWeight: 900, margin: '0 0 0.5rem' }}>
                        {isAr ? 'انتهى الامتحان وتم التصحيح الفوري!' : 'Exam Completed & Automatically Graded!'}
                      </h3>
                      <div style={{
                        fontSize: '3rem',
                        fontWeight: 900,
                        color: (examResult.percentage ?? 0) >= 80 ? '#16A34A' : (examResult.percentage ?? 0) >= 50 ? '#D97706' : '#DC2626',
                        margin: '0.25rem 0'
                      }}>
                        {examResult.percentage !== undefined ? `${examResult.percentage}%` : `${Math.round(((examResult.score || 0) / (examResult.total_points || 1)) * 100)}%`}
                      </div>
                      <p style={{ color: 'var(--text-muted)', fontWeight: 700, margin: '0 0 1.25rem' }}>
                        {isAr 
                          ? `الدرجة المحصلة: ${examResult.score ?? examResult.earned_points ?? 0} من إجمالي ${examResult.total_points || 0} درجة`
                          : `Score: ${examResult.score ?? examResult.earned_points ?? 0} of ${examResult.total_points || 0} points`}
                      </p>
                      <button
                        className="btn btn-outline"
                        onClick={() => { setActiveExam(null); setExamResult(null); }}
                        style={{ fontWeight: 800 }}
                      >
                        {isAr ? 'العودة لقائمة الامتحانات ↩' : 'Back to Exams ↩'}
                      </button>
                    </div>

                    {/* Question Checking Breakdown */}
                    {examResult.breakdown && examResult.breakdown.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                          <h4 style={{ fontSize: '1.15rem', fontWeight: 900, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span>📝</span>
                            <span>{isAr ? 'مراجعة إجابات الأسئلة ومراجع الكتاب المدرسي:' : 'Question Review & Textbook References:'}</span>
                          </h4>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                            {isAr ? `${examResult.breakdown.length} أسئلة تم تصحيحها` : `${examResult.breakdown.length} questions reviewed`}
                          </span>
                        </div>

                        {examResult.breakdown.map((item: any, idx: number) => {
                          const isQEn = ((item.question_text || '').match(/[a-zA-Z]/g) || []).length > ((item.question_text || '').match(/[\u0600-\u06FF]/g) || []).length;
                          const isCorrect = item.is_correct;

                          return (
                            <div
                              key={item.question_id || idx}
                              style={{
                                padding: '1.5rem',
                                background: 'var(--bg-card)',
                                borderRadius: 'var(--radius-xl)',
                                border: isCorrect ? '1.5px solid #BBF7D0' : '1.5px solid #FECACA',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.03)',
                                direction: isQEn ? 'ltr' : 'rtl',
                                textAlign: isQEn ? 'left' : 'right'
                              }}
                            >
                              {/* Question Title & Points Header */}
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                                <div style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--text-title)', flex: 1 }}>
                                  <span style={{ color: 'var(--primary-700)', marginLeft: isQEn ? '0' : '0.4rem', marginRight: isQEn ? '0.4rem' : '0' }}>
                                    {isAr ? `السؤال ${idx + 1}:` : `Question ${idx + 1}:`}
                                  </span>
                                  {item.question_text}
                                </div>
                                <span style={{
                                  fontSize: '0.75rem',
                                  fontWeight: 800,
                                  padding: '0.2rem 0.55rem',
                                  borderRadius: 'var(--radius-full)',
                                  background: isCorrect ? '#F0FDF4' : '#FEF2F2',
                                  color: isCorrect ? '#15803D' : '#DC2626',
                                  border: `1px solid ${isCorrect ? '#BBF7D0' : '#FECACA'}`
                                }}>
                                  {item.points_awarded} / {item.max_points} {isAr ? 'درجة' : 'pts'}
                                </span>
                              </div>

                              {/* Student's Answer */}
                              <div style={{
                                padding: '0.85rem 1rem',
                                borderRadius: 'var(--radius-md)',
                                background: isCorrect ? '#F0FDF4' : '#FEF2F2',
                                border: `1px solid ${isCorrect ? '#BBF7D0' : '#FECACA'}`,
                                color: isCorrect ? '#15803D' : '#DC2626',
                                fontWeight: 700,
                                fontSize: '0.9rem',
                                marginBottom: '0.65rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem'
                              }}>
                                <span>{isCorrect ? '✅' : '❌'}</span>
                                <span>
                                  <strong>{isAr ? 'إجابتك المسجلة:' : 'Your Answer:'}</strong> {item.selected_text || (isAr ? 'لم يتم اختيار إجابة' : 'No answer selected')}
                                </span>
                              </div>

                              {/* Correct Answer + Textbook Page Reference */}
                              <div style={{
                                padding: '0.85rem 1rem',
                                borderRadius: 'var(--radius-md)',
                                background: '#EFF6FF',
                                border: '1.5px solid #BFDBFE',
                                color: '#1E40AF',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                flexWrap: 'wrap',
                                gap: '0.75rem'
                              }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, fontSize: '0.9rem' }}>
                                  <span>✓</span>
                                  <span>
                                    <strong>{isAr ? 'الإجابة النموذجية الصحيحة:' : 'Correct Answer:'}</strong> {item.correct_text}
                                  </span>
                                </div>

                                {/* Page Reference Badge shown next to right answer */}
                                {item.page_reference && (
                                  <span style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.4rem',
                                    background: '#FEF3C7',
                                    color: '#92400E',
                                    border: '1.5px solid #FCD34D',
                                    padding: '0.3rem 0.75rem',
                                    borderRadius: 'var(--radius-full)',
                                    fontSize: '0.8rem',
                                    fontWeight: 800,
                                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                                  }}>
                                    <span>📖</span>
                                    <span>
                                      {isAr 
                                        ? `مرجع الإجابة: صفحة ${item.page_reference} بالكتاب المدرسي` 
                                        : `Answer Reference: Page ${item.page_reference} in textbook`}
                                    </span>
                                  </span>
                                )}
                              </div>

                              {/* Explanation if available */}
                              {item.explanation && (
                                <div style={{
                                  marginTop: '0.65rem',
                                  padding: '0.7rem 0.9rem',
                                  background: 'var(--bg-subtle)',
                                  borderRadius: 'var(--radius-md)',
                                  fontSize: '0.82rem',
                                  color: 'var(--text-muted)'
                                }}>
                                  💡 <strong>{isAr ? 'توضيح الشرح:' : 'Explanation:'}</strong> {item.explanation}
                                </div>
                              )}
                            </div>
                          );
                        })}

                        {/* Final Return Button */}
                        <div style={{ textAlign: 'center', marginTop: '1rem' }}>
                          <button
                            className="btn btn-primary btn-lg"
                            onClick={() => { setActiveExam(null); setExamResult(null); }}
                            style={{ fontWeight: 800, padding: '0.75rem 2.5rem' }}
                          >
                            {isAr ? 'إغلاق ومتابعة مسار التعلم' : 'Close & Continue Learning'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    {/* Questions */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginBottom: '2rem' }}>
                      {activeExam.questions?.map((q: any, idx: number) => {
                        const isQEn = ((q.question_text || '').match(/[a-zA-Z]/g) || []).length > ((q.question_text || '').match(/[\u0600-\u06FF]/g) || []).length;
                        return (
                        <div key={q.id} style={{
                          padding: '1.25rem',
                          background: 'var(--bg-subtle)',
                          borderRadius: 'var(--radius-lg)',
                          direction: isQEn ? 'ltr' : 'rtl',
                          textAlign: isQEn ? 'left' : 'right'
                        }}>
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
                      );
                    })}
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
                {isAr ? 'تحليلات النتائج والتقدم التراكمي' : 'Results Analytics & Learning Progress'}
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
                  {`${calculatedMastery}%`}
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {isAr ? 'وفق معايير التقييم التشخيصي' : 'Based on diagnostic evaluations'}
                </span>
              </div>

              <div 
                className="goal-card"
                onClick={() => setShowExamsHistoryModal(true)}
                style={{
                  cursor: 'pointer',
                  border: '1.5px solid var(--primary-200)',
                  background: 'linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%)',
                  transition: 'all 0.2s ease',
                  position: 'relative'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--primary-500)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 8px 24px rgba(37, 99, 235, 0.14)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--primary-200)';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '';
                }}
                title={isAr ? 'اضغط هنا لفتح سجل الامتحانات وتفاصيل التقييمات' : 'Click to view completed exams history'}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                    {isAr ? 'الامتحانات المكتملة' : 'Completed Exams'}
                  </span>
                  <span style={{
                    fontSize: '0.7rem',
                    fontWeight: 800,
                    color: 'var(--primary-700)',
                    background: 'var(--primary-100)',
                    padding: '0.18rem 0.5rem',
                    borderRadius: 'var(--radius-full)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.2rem'
                  }}>
                    <span>{isAr ? 'عرض السجل' : 'View'}</span>
                    <ArrowIcon size={11} />
                  </span>
                </div>
                <div style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--primary-700)', margin: '0.2rem 0' }}>
                  {totalCompletedAssessments}
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--primary-600)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <span>📋</span>
                  <span>{isAr ? 'اضغط لعرض سجل التقييمات ↗' : 'Click to open exams history ↗'}</span>
                </span>
              </div>

              <div className="goal-card">
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                  {isAr ? 'الفصول المتقنة' : 'Mastered Units'}
                </span>
                <div style={{ fontSize: '2rem', fontWeight: 900, color: '#D97706' }}>
                  {`${analytics?.summary?.mastered_topics_count ?? 0} ${isAr ? 'فصول' : 'Units'}`}
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
                {analytics?.topics && analytics.topics.length > 0 ? (
                  analytics.topics.map((t: any) => {
                    const pct = Number(t.mastery_percentage) || 0;
                    const isMastered = pct >= 80;
                    const isProficient = pct >= 60 && pct < 80;
                    const barColor = isMastered ? '#16A34A' : isProficient ? 'var(--primary-600)' : '#D97706';
                    const statusLabel = isMastered 
                      ? (isAr ? 'متقن' : 'Mastered') 
                      : isProficient 
                      ? (isAr ? 'متقدم' : 'Proficient') 
                      : (isAr ? 'بحاجة لمراجعة' : 'Developing');
                    return (
                      <div key={t.id || t.chapter_id} style={{ padding: '1rem', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-lg)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 800, fontSize: '0.9rem', marginBottom: '0.4rem', flexWrap: 'wrap', gap: '0.4rem' }}>
                          <span>{isAr ? `${t.subject_name_ar} • ${t.chapter_title_ar}` : `${t.subject_name_en || t.subject_name_ar} • ${t.chapter_title_en || t.chapter_title_ar}`}</span>
                          <span style={{ color: barColor }}>{pct}% ({statusLabel})</span>
                        </div>
                        <div style={{ width: '100%', height: '8px', background: 'var(--border-light)', borderRadius: '999px', overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: barColor, borderRadius: '999px', transition: 'width 0.3s ease' }} />
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div style={{ textAlign: 'center', padding: '2.5rem 1rem', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-lg)' }}>
                    <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>📊</div>
                    <h4 style={{ fontWeight: 800, margin: '0 0 0.5rem' }}>{isAr ? 'لا توجد تقييمات مسجلة بعد' : 'No evaluation records yet'}</h4>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', maxWidth: '440px', margin: '0 auto 1.25rem' }}>
                      {isAr
                        ? 'ابدأ أول تقييم تشخيصي أو خض امتحاناً لتظهر تحليلات نواتج التعلم وتحليلات النتائج هنا.'
                        : 'Take your first diagnostic assessment or timed exam to generate real mastery analytics.'}
                    </p>
                    <button className="btn btn-primary" onClick={() => { setActiveTab('ai'); setAiStep(1); }}>
                      {isAr ? 'بدء تقييم تشخيصي الآن 🚀' : 'Start Diagnostic Quiz 🚀'}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Periodic Level Average & Performance Box (Monthly / Weekly / Subject Filter) */}
            <div className="card" style={{
              padding: '1.75rem',
              border: '1.5px solid var(--border-light)',
              background: 'linear-gradient(180deg, var(--bg-card) 0%, var(--bg-subtle) 100%)',
              position: 'relative',
              overflow: 'hidden'
            }}>
              {/* Header with Title and Mode Switcher */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                flexWrap: 'wrap',
                gap: '1rem',
                marginBottom: '1rem'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                  <div style={{
                    width: '46px',
                    height: '46px',
                    borderRadius: 'var(--radius-lg)',
                    background: 'linear-gradient(135deg, var(--primary-600) 0%, var(--primary-800) 100%)',
                    color: '#FFF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)',
                    flexShrink: 0
                  }}>
                    <TrendingUp size={24} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 900, margin: 0, color: 'var(--text-title)' }}>
                      {isAr ? 'معدل المستوى ومتوسط الدرجات الدوري' : 'Periodic Level Average & Mastery Trends'}
                    </h3>
                    <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                      {isAr 
                        ? 'احسب متوسط مستواك التراكمي وتطور أدائك شهرياً أو أسبوعياً استناداً لتواريخ الاختبارات الفعلية'
                        : 'Calculate your average level & learning growth monthly or weekly based on actual exam dates'}
                    </span>
                  </div>
                </div>

                {/* Filter Controls: Monthly / Weekly toggle + Select dropdown */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                  {/* Period Type Pills */}
                  <div style={{
                    display: 'flex',
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-light)',
                    borderRadius: 'var(--radius-full)',
                    padding: '3px'
                  }}>
                    <button
                      type="button"
                      onClick={() => {
                        setPeriodType('month');
                        setSelectedPeriodKey('all');
                      }}
                      style={{
                        border: 'none',
                        background: periodType === 'month' ? 'var(--primary-600)' : 'transparent',
                        color: periodType === 'month' ? '#FFFFFF' : 'var(--text-muted)',
                        padding: '0.4rem 0.9rem',
                        borderRadius: 'var(--radius-full)',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      <Calendar size={14} />
                      <span>{isAr ? 'شهرياً' : 'Monthly'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPeriodType('week');
                        setSelectedPeriodKey('all');
                      }}
                      style={{
                        border: 'none',
                        background: periodType === 'week' ? 'var(--primary-600)' : 'transparent',
                        color: periodType === 'week' ? '#FFFFFF' : 'var(--text-muted)',
                        padding: '0.4rem 0.9rem',
                        borderRadius: 'var(--radius-full)',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      <Clock size={14} />
                      <span>{isAr ? 'أسبوعياً' : 'Weekly'}</span>
                    </button>
                  </div>

                  {/* Dropdown Selector */}
                  <div style={{ position: 'relative' }}>
                    <select
                      value={selectedPeriodKey}
                      onChange={(e) => setSelectedPeriodKey(e.target.value)}
                      style={{
                        padding: '0.45rem 1.8rem 0.45rem 0.9rem',
                        borderRadius: 'var(--radius-md)',
                        border: '1.5px solid var(--border-light)',
                        background: 'var(--bg-card)',
                        color: 'var(--text-title)',
                        fontSize: '0.82rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        outline: 'none',
                        minWidth: '170px'
                      }}
                    >
                      <option value="all">
                        {isAr 
                          ? (periodType === 'month' ? '✨ كل الأشهر (المتوسط العام)' : '✨ كل الأسابيع (المتوسط العام)')
                          : (periodType === 'month' ? '✨ All Months (Overall Avg)' : '✨ All Weeks (Overall Avg)')}
                      </option>
                      {(periodType === 'month' ? monthlyGroups : weeklyGroups).map(g => (
                        <option key={g.key} value={g.key}>
                          {isAr ? g.labelAr : g.labelEn} ({g.avgPercentage}% - {g.exams.length} {isAr ? 'اختبار' : 'tests'})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Subject Filter Pills */}
              {availableSubjects.length > 1 && (
                <div style={{ marginBottom: '1.25rem' }}>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                    {isAr ? '📚 تصفية حسب المادة:' : '📚 Filter by Subject:'}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
                    {/* All subjects pill */}
                    <button
                      type="button"
                      onClick={() => { setSelectedSubjectFilter('all'); setSelectedPeriodKey('all'); }}
                      style={{
                        padding: '0.35rem 0.85rem',
                        borderRadius: 'var(--radius-full)',
                        border: `2px solid ${selectedSubjectFilter === 'all' ? 'var(--primary-500)' : 'var(--border-light)'}`,
                        background: selectedSubjectFilter === 'all' ? 'var(--primary-600)' : 'var(--bg-card)',
                        color: selectedSubjectFilter === 'all' ? '#FFF' : 'var(--text-title)',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.35rem'
                      }}
                    >
                      <span>🗂️</span>
                      <span>{isAr ? 'جميع المواد' : 'All Subjects'}</span>
                      <span style={{ fontSize: '0.7rem', opacity: 0.8 }}>({analytics?.completed_exams?.length || 0})</span>
                    </button>

                    {/* Per-subject pills */}
                    {availableSubjects.map(subj => (
                      <button
                        key={subj.id}
                        type="button"
                        onClick={() => { setSelectedSubjectFilter(subj.id); setSelectedPeriodKey('all'); }}
                        style={{
                          padding: '0.35rem 0.85rem',
                          borderRadius: 'var(--radius-full)',
                          border: `2px solid ${selectedSubjectFilter === subj.id ? 'var(--primary-500)' : 'var(--border-light)'}`,
                          background: selectedSubjectFilter === subj.id ? 'var(--primary-600)' : 'var(--bg-card)',
                          color: selectedSubjectFilter === subj.id ? '#FFF' : 'var(--text-title)',
                          fontSize: '0.8rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.35rem'
                        }}
                      >
                        <span>{isAr ? subj.nameAr : subj.nameEn}</span>
                        <span style={{ fontSize: '0.7rem', opacity: 0.8 }}>({subj.count})</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* KPI Summary Cards */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '1rem',
                marginBottom: '1.5rem'
              }}>
                {/* 1. Average Rate */}
                <div style={{
                  padding: '1.25rem',
                  background: 'var(--bg-card)',
                  borderRadius: 'var(--radius-lg)',
                  border: '1.5px solid var(--border-light)',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                      {isAr ? 'متوسط معدل المستوى' : 'Average Level Rate'}
                    </span>
                    <span style={{
                      fontSize: '0.7rem',
                      fontWeight: 800,
                      padding: '0.15rem 0.5rem',
                      borderRadius: 'var(--radius-full)',
                      background: currentAvgRate >= 80 ? '#F0FDF4' : currentAvgRate >= 60 ? '#EFF6FF' : '#FFFBEB',
                      color: currentAvgRate >= 80 ? '#16A34A' : currentAvgRate >= 60 ? '#2563EB' : '#D97706',
                      border: `1px solid ${currentAvgRate >= 80 ? '#BBF7D0' : currentAvgRate >= 60 ? '#BFDBFE' : '#FDE68A'}`
                    }}>
                      {currentAvgRate >= 85 
                        ? (isAr ? '🌟 متفوق' : '🌟 Excellent') 
                        : currentAvgRate >= 70 
                        ? (isAr ? '🟢 متقدم' : '🟢 Advanced') 
                        : currentAvgRate >= 50 
                        ? (isAr ? '🟡 متوسط' : '🟡 Good') 
                        : (isAr ? '🟠 بحاجة لدعم' : '🟠 Developing')}
                    </span>
                  </div>
                  <div style={{
                    fontSize: '2.25rem',
                    fontWeight: 900,
                    color: currentAvgRate >= 80 ? '#16A34A' : currentAvgRate >= 60 ? 'var(--primary-700)' : '#D97706',
                    lineHeight: 1.1,
                    marginBottom: '0.4rem'
                  }}>
                    {currentAvgRate}%
                  </div>
                  {/* Visual Bar */}
                  <div style={{ width: '100%', height: '6px', background: 'var(--border-light)', borderRadius: '999px', overflow: 'hidden' }}>
                    <div style={{
                      width: `${currentAvgRate}%`,
                      height: '100%',
                      background: currentAvgRate >= 80 ? '#16A34A' : currentAvgRate >= 60 ? 'var(--primary-600)' : '#D97706',
                      borderRadius: '999px',
                      transition: 'width 0.4s ease'
                    }} />
                  </div>
                </div>

                {/* 2. Exams Count */}
                <div style={{
                  padding: '1.25rem',
                  background: 'var(--bg-card)',
                  borderRadius: 'var(--radius-lg)',
                  border: '1.5px solid var(--border-light)',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
                }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                    {isAr ? 'الاختبارات المحسوبة' : 'Calculated Assessments'}
                  </span>
                  <div style={{ fontSize: '2.25rem', fontWeight: 900, color: 'var(--text-title)', lineHeight: 1.1, margin: '0.4rem 0' }}>
                    {filteredExams.length}
                  </div>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                    {isAr ? 'تقييمات مجتازة في النطاق المحدد' : 'Completed within this timeframe'}
                  </span>
                </div>

                {/* 3. Highest / Lowest Score */}
                <div style={{
                  padding: '1.25rem',
                  background: 'var(--bg-card)',
                  borderRadius: 'var(--radius-lg)',
                  border: '1.5px solid var(--border-light)',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
                }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                    {isAr ? 'المدى التقييمي للدرجات' : 'Score Range (Min / Max)'}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', margin: '0.4rem 0' }}>
                    <div>
                      <span style={{ fontSize: '0.7rem', color: '#16A34A', fontWeight: 700 }}>{isAr ? 'الأعلى:' : 'Max:'}</span>
                      <div style={{ fontSize: '1.35rem', fontWeight: 900, color: '#16A34A' }}>
                        {filteredExams.length > 0 ? `${Math.max(...filteredExams.map((e: any) => e.percentage ?? Math.round(((e.score || 0) / (e.total || 1)) * 100)))}%` : '0%'}
                      </div>
                    </div>
                    <div style={{ width: '1px', height: '28px', background: 'var(--border-light)' }} />
                    <div>
                      <span style={{ fontSize: '0.7rem', color: '#D97706', fontWeight: 700 }}>{isAr ? 'الأدنى:' : 'Min:'}</span>
                      <div style={{ fontSize: '1.35rem', fontWeight: 900, color: '#D97706' }}>
                        {filteredExams.length > 0 ? `${Math.min(...filteredExams.map((e: any) => e.percentage ?? Math.round(((e.score || 0) / (e.total || 1)) * 100)))}%` : '0%'}
                      </div>
                    </div>
                  </div>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                    {isAr ? 'أفضل وأقل نتيجة مسجلة' : 'Best & lowest recorded score'}
                  </span>
                </div>

                {/* 4. Active Period Name */}
                <div style={{
                  padding: '1.25rem',
                  background: 'var(--bg-card)',
                  borderRadius: 'var(--radius-lg)',
                  border: '1.5px solid var(--border-light)',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
                }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                    {isAr ? 'الفترة المحددة' : 'Selected Timeframe'}
                  </span>
                  <div style={{ fontSize: '1.15rem', fontWeight: 900, color: 'var(--primary-700)', margin: '0.4rem 0', wordBreak: 'break-word' }}>
                    {activePeriodGroup 
                      ? (isAr ? activePeriodGroup.labelAr : activePeriodGroup.labelEn)
                      : (isAr ? (periodType === 'month' ? 'جميع الأشهر' : 'جميع الأسابيع') : (periodType === 'month' ? 'All Months' : 'All Weeks'))}
                  </div>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                    {activePeriodGroup 
                      ? (isAr ? `${activePeriodGroup.exams.length} اختبارات في هذه الفترة` : `${activePeriodGroup.exams.length} exams in this period`)
                      : (isAr ? 'عرض المعدل التراكمي الشامل' : 'Showing overall cumulative average')}
                  </span>
                </div>
              </div>

              {/* Periodic Breakdown Timeline Cards (Interactive List of all months or weeks) */}
              {(periodType === 'month' ? monthlyGroups : weeklyGroups).length > 0 && (
                <div style={{ marginBottom: '1.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <h4 style={{ fontSize: '0.95rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span>{periodType === 'month' ? '🗓️' : '⏱️'}</span>
                      <span>
                        {isAr 
                          ? (periodType === 'month' ? 'تطور المعدل عبر الأشهر:' : 'تطور المعدل عبر الأسابيع:') 
                          : (periodType === 'month' ? 'Monthly Performance Breakdown:' : 'Weekly Performance Breakdown:')}
                      </span>
                    </h4>
                    {selectedPeriodKey !== 'all' && (
                      <button
                        onClick={() => setSelectedPeriodKey('all')}
                        className="btn btn-ghost btn-sm"
                        style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', height: 'auto', fontWeight: 700 }}
                      >
                        {isAr ? 'إلغاء التحديد وعرض الكل ✕' : 'Clear Filter ✕'}
                      </button>
                    )}
                  </div>

                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                    gap: '0.75rem'
                  }}>
                    {(periodType === 'month' ? monthlyGroups : weeklyGroups).map((group) => {
                      const isSelected = selectedPeriodKey === group.key;
                      const gPct = group.avgPercentage;
                      const gColor = gPct >= 80 ? '#16A34A' : gPct >= 60 ? 'var(--primary-600)' : '#D97706';

                      return (
                        <div
                          key={group.key}
                          onClick={() => setSelectedPeriodKey(isSelected ? 'all' : group.key)}
                          style={{
                            padding: '0.85rem 1rem',
                            background: isSelected ? 'var(--primary-50)' : 'var(--bg-card)',
                            border: `2px solid ${isSelected ? 'var(--primary-500)' : 'var(--border-light)'}`,
                            borderRadius: 'var(--radius-lg)',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            boxShadow: isSelected ? '0 4px 14px rgba(37, 99, 235, 0.12)' : 'none',
                            position: 'relative'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                            <span style={{ fontWeight: 800, fontSize: '0.85rem', color: isSelected ? 'var(--primary-800)' : 'var(--text-title)' }}>
                              {isAr ? group.labelAr : group.labelEn}
                            </span>
                            <span style={{
                              fontWeight: 900,
                              fontSize: '0.95rem',
                              color: gColor
                            }}>
                              {gPct}%
                            </span>
                          </div>

                          {/* Progress bar */}
                          <div style={{ width: '100%', height: '5px', background: 'var(--border-light)', borderRadius: '999px', overflow: 'hidden', marginBottom: '0.45rem' }}>
                            <div style={{ width: `${gPct}%`, height: '100%', background: gColor, borderRadius: '999px' }} />
                          </div>

                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                            <span>{group.exams.length} {isAr ? 'تقييمات' : 'assessments'}</span>
                            <span style={{ fontWeight: 700, color: isSelected ? 'var(--primary-600)' : 'inherit' }}>
                              {isSelected ? (isAr ? '✓ محدد' : '✓ Active') : (isAr ? 'اضغط للفلترة' : 'Click to filter')}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Filtered Exams List for this timeframe */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <h4 style={{ fontSize: '0.95rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span>📋</span>
                    <span>
                      {isAr 
                        ? `الاختبارات المنجزة في الفترة المحددة (${filteredExams.length}):`
                        : `Assessments Completed in Selected Timeframe (${filteredExams.length}):`}
                    </span>
                  </h4>
                  {activePeriodGroup && (
                    <span style={{
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      padding: '0.2rem 0.6rem',
                      borderRadius: 'var(--radius-full)',
                      background: 'var(--primary-100)',
                      color: 'var(--primary-700)'
                    }}>
                      {isAr ? activePeriodGroup.labelAr : activePeriodGroup.labelEn}
                    </span>
                  )}
                </div>

                {filteredExams.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                    {filteredExams.map((exam: any, idx: number) => {
                      const pct = exam.percentage ?? Math.round(((exam.score || 0) / (exam.total || 1)) * 100);
                      const isMastered = pct >= 80;
                      const isProficient = pct >= 60 && pct < 80;
                      const badgeColor = isMastered ? '#16A34A' : isProficient ? '#2563EB' : '#D97706';
                      const badgeBg = isMastered ? '#F0FDF4' : isProficient ? '#EFF6FF' : '#FFFBEB';
                      const badgeBorder = isMastered ? '#BBF7D0' : isProficient ? '#BFDBFE' : '#FDE68A';

                      const examDate = exam.created_at
                        ? new Date(exam.created_at).toLocaleDateString(isAr ? 'ar-EG' : 'en-US', {
                            weekday: 'short',
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })
                        : '';

                      return (
                        <div
                          key={exam.id || idx}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '0.9rem 1.1rem',
                            background: 'var(--bg-card)',
                            borderRadius: 'var(--radius-md)',
                            border: '1px solid var(--border-light)',
                            flexWrap: 'wrap',
                            gap: '0.75rem'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: '220px', flex: 1 }}>
                            <div style={{
                              width: '38px',
                              height: '38px',
                              borderRadius: 'var(--radius-md)',
                              background: badgeBg,
                              border: `1px solid ${badgeBorder}`,
                              color: badgeColor,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '1.1rem',
                              fontWeight: 900,
                              flexShrink: 0
                            }}>
                              {exam.type === 'TIMED_EXAM' ? '⏱️' : '📝'}
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                              <div style={{ fontWeight: 800, fontSize: '0.88rem', color: 'var(--text-title)' }}>
                                {isAr ? (exam.chapter_title_ar || exam.title_ar || exam.subject_name_ar) : (exam.chapter_title_en || exam.title_en || exam.subject_name_en)}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                <span style={{ fontWeight: 600 }}>{isAr ? exam.subject_name_ar : (exam.subject_name_en || exam.subject_name_ar)}</span>
                                <span>•</span>
                                <span>{examDate}</span>
                              </div>
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flexShrink: 0 }}>
                            <div style={{ textAlign: isAr ? 'left' : 'right' }}>
                              <div style={{ fontSize: '1.15rem', fontWeight: 900, color: badgeColor }}>
                                {pct}%
                              </div>
                              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                                {exam.score} / {exam.total} {isAr ? 'درجة' : 'pts'}
                              </div>
                            </div>

                            {exam.report && (
                              <button
                                className="btn btn-outline btn-sm"
                                onClick={() => {
                                  setAiReport(exam.report);
                                  setActiveTab('ai');
                                  setAiStep(5);
                                }}
                                style={{ fontWeight: 700, fontSize: '0.75rem', padding: '0.3rem 0.6rem', height: 'auto', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                                title={isAr ? 'عرض تقرير التشخيص والإجابات' : 'View Diagnostic Report'}
                              >
                                <span>{isAr ? 'التقرير 📋' : 'Report 📋'}</span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{
                    textAlign: 'center',
                    padding: '2rem 1rem',
                    background: 'var(--bg-card)',
                    borderRadius: 'var(--radius-lg)',
                    border: '1px dashed var(--border-light)',
                    color: 'var(--text-muted)'
                  }}>
                    <div style={{ fontSize: '2rem', marginBottom: '0.4rem' }}>📅</div>
                    <div style={{ fontWeight: 800, fontSize: '0.9rem', marginBottom: '0.25rem' }}>
                      {isAr ? 'لا توجد اختبارات مسجلة في هذا النطاق الزمني' : 'No assessments found for this timeframe'}
                    </div>
                    <p style={{ fontSize: '0.78rem', margin: 0 }}>
                      {isAr 
                        ? 'جرّب تغيير الفلتر لاختيار شهر أو أسبوع آخر، أو ابدأ امتحاناً جديداً لتسجيل درجاتك.' 
                        : 'Try changing the filter to another period or take a new exam to record your performance.'}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Completed Exams History Section */}
            <div className="card" style={{ padding: '1.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                <div>
                  <h3 style={{ fontSize: '1.2rem', fontWeight: 900, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span>📝</span>
                    <span>{isAr ? 'سجل الامتحانات والتقييمات المنجزة' : 'Completed Assessments History'}</span>
                    {analytics?.completed_exams && analytics.completed_exams.length > 0 && (
                      <span className="badge badge-primary" style={{ fontSize: '0.75rem', padding: '0.2rem 0.6rem' }}>
                        {analytics.completed_exams.length} {isAr ? 'امتحانات' : 'Exams'}
                      </span>
                    )}
                  </h3>
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                    {isAr ? 'قائمة تفصيلية بجميع الاختبارات التي خضتها مع نتائج التشخيص الدقيقة' : 'Detailed log of all completed exams with diagnostic breakdown'}
                  </span>
                </div>
              </div>

              {analytics?.completed_exams && analytics.completed_exams.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                  {analytics.completed_exams.map((exam: any, idx: number) => {
                    const pct = exam.percentage ?? Math.round(((exam.score || 0) / (exam.total || 1)) * 100);
                    const isMastered = pct >= 80;
                    const isProficient = pct >= 60 && pct < 80;
                    const badgeColor = isMastered ? '#16A34A' : isProficient ? '#2563EB' : '#D97706';
                    const badgeBg = isMastered ? '#F0FDF4' : isProficient ? '#EFF6FF' : '#FFFBEB';
                    const badgeBorder = isMastered ? '#BBF7D0' : isProficient ? '#BFDBFE' : '#FDE68A';
                    const statusText = isMastered
                      ? (isAr ? 'متقن (Mastered)' : 'Mastered')
                      : isProficient
                      ? (isAr ? 'متقدم (Proficient)' : 'Proficient')
                      : (isAr ? 'بحاجة لمراجعة (Developing)' : 'Developing');

                    const formattedDate = exam.created_at
                      ? new Date(exam.created_at).toLocaleDateString(isAr ? 'ar-EG' : 'en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })
                      : '';

                    return (
                      <div
                        key={exam.id || idx}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '1.15rem 1.25rem',
                          background: 'var(--bg-subtle)',
                          borderRadius: 'var(--radius-lg)',
                          border: '1px solid var(--border-light)',
                          flexWrap: 'wrap',
                          gap: '1rem'
                        }}
                      >
                        {/* Exam Info */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', minWidth: '240px', flex: 1 }}>
                          <div style={{
                            width: '44px',
                            height: '44px',
                            borderRadius: 'var(--radius-md)',
                            background: badgeBg,
                            border: `1px solid ${badgeBorder}`,
                            color: badgeColor,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '1.2rem',
                            fontWeight: 900,
                            flexShrink: 0
                          }}>
                            {exam.type === 'TIMED_EXAM' ? '⏱️' : '📝'}
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                              <span style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-title)' }}>
                                {isAr ? (exam.chapter_title_ar || exam.title_ar || exam.subject_name_ar) : (exam.chapter_title_en || exam.title_en || exam.subject_name_en)}
                              </span>
                              <span style={{
                                fontSize: '0.7rem',
                                fontWeight: 700,
                                padding: '0.15rem 0.5rem',
                                borderRadius: 'var(--radius-full)',
                                background: badgeBg,
                                color: badgeColor,
                                border: `1px solid ${badgeBorder}`
                              }}>
                                {statusText}
                              </span>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                              <span style={{ fontWeight: 600 }}>{isAr ? exam.subject_name_ar : (exam.subject_name_en || exam.subject_name_ar)}</span>
                              <span>•</span>
                              <span>{formattedDate}</span>
                            </div>
                          </div>
                        </div>

                        {/* Score & Action */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexShrink: 0 }}>
                          <div style={{ textAlign: isAr ? 'left' : 'right' }}>
                            <div style={{ fontSize: '1.25rem', fontWeight: 900, color: badgeColor }}>
                              {pct}%
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                              {exam.score} / {exam.total} {isAr ? 'درجات' : 'pts'}
                            </div>
                          </div>

                          {exam.report && (
                            <button
                              className="btn btn-outline btn-sm"
                              onClick={() => {
                                setAiReport(exam.report);
                                setActiveTab('ai');
                                setAiStep(5);
                              }}
                              style={{ fontWeight: 700, fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem', whiteSpace: 'nowrap' }}
                              title={isAr ? 'عرض تقرير التشخيص والإجابات' : 'View Diagnostic Report'}
                            >
                              <span>{isAr ? 'تقرير التشخيص 📋' : 'Diagnosis Report 📋'}</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-muted)' }}>
                  <p style={{ margin: 0, fontSize: '0.9rem' }}>
                    {isAr ? 'لم يتم تسجيل أي امتحانات بعد.' : 'No completed assessments found.'}
                  </p>
                </div>
              )}
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
          <span>{isAr ? 'امتحانات متغيرة' : 'Variable Exams'}</span>
        </button>

        <button
          className={`mobile-nav-btn ${activeTab === 'exams' ? 'active' : ''}`}
          onClick={() => setActiveTab('exams')}
        >
          <Clock size={18} />
          <span>{isAr ? 'امتحانات ثابتة' : 'Fixed Exams'}</span>
        </button>

        <button
          className={`mobile-nav-btn ${activeTab === 'analytics' ? 'active' : ''}`}
          onClick={() => setActiveTab('analytics')}
        >
          <BarChart3 size={18} />
          <span>{isAr ? 'تحليلات النتائج' : 'Results Analytics'}</span>
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

      {/* =========================================================
          AI ASSESSMENT GENERATOR DEBUG PANEL (DEVELOPMENT ONLY)
          Allows inspecting the exact textbook chunk sent to Gemini,
          Bloom levels, retrieval similarity scores, and grounding IDs.
          Never visible to students in production.
          ========================================================= */}
      {isDevMode && showAiDebugModal && createPortal(
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.75)',
          backdropFilter: 'blur(8px)',
          zIndex: 9999999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1.25rem',
          direction: 'rtl'
        }}>
          <div style={{
            backgroundColor: '#0F172A',
            color: '#F8FAFC',
            borderRadius: '1.25rem',
            border: '1.5px solid #334155',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
            width: '100%',
            maxWidth: '960px',
            maxHeight: '92vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}>
            {/* Top Header */}
            <div style={{
              padding: '1.25rem 1.5rem',
              borderBottom: '1px solid #1E293B',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'linear-gradient(90deg, #1E1B4B 0%, #0F172A 100%)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{
                  background: '#4F46E5',
                  color: '#FFFFFF',
                  padding: '7px',
                  borderRadius: '10px',
                  display: 'flex'
                }}>
                  <Sparkles size={22} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 900, color: '#FFFFFF' }}>
                      {isAr ? 'لوحة فحص الذكاء الاصطناعي (AI Assessment Debug Mode)' : 'AI Assessment Generator Debug Panel'}
                    </h3>
                    <span style={{
                      background: '#F59E0B',
                      color: '#78350F',
                      fontSize: '0.65rem',
                      fontWeight: 900,
                      padding: '2px 8px',
                      borderRadius: '999px'
                    }}>
                      DEV ONLY
                    </span>
                  </div>
                  <p style={{ margin: '3px 0 0', fontSize: '0.78rem', color: '#94A3B8' }}>
                    {isAr ? 'فحص الفقرات المنهجية الأصلية التي استلمها Gemini ومستويات بلوم وتطابق الجودة لكل سؤال' : 'Inspect raw textbook chunk received by Gemini, Bloom level, similarity & grounding'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowAiDebugModal(false)}
                style={{
                  background: '#1E293B',
                  border: '1px solid #334155',
                  color: '#CBD5E1',
                  borderRadius: '8px',
                  padding: '6px 14px',
                  cursor: 'pointer',
                  fontWeight: 700,
                  fontSize: '0.85rem'
                }}
              >
                ✕ {isAr ? 'إغلاق' : 'Close'}
              </button>
            </div>

            {/* Question Selector Tabs */}
            <div style={{
              padding: '0.75rem 1.5rem',
              background: '#0B0F19',
              borderBottom: '1px solid #1E293B',
              display: 'flex',
              gap: '0.5rem',
              overflowX: 'auto'
            }}>
              {aiQuestions.map((q, idx) => {
                const isSelected = selectedDebugIdx === idx;
                const bloom = q.bloom_level || 'UNDERSTANDING';
                return (
                  <button
                    key={q.id || idx}
                    onClick={() => setSelectedDebugIdx(idx)}
                    style={{
                      background: isSelected ? '#4F46E5' : '#1E293B',
                      color: isSelected ? '#FFFFFF' : '#94A3B8',
                      border: isSelected ? '1px solid #818CF8' : '1px solid #334155',
                      borderRadius: '8px',
                      padding: '6px 12px',
                      fontSize: '0.8rem',
                      fontWeight: 800,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <span>السؤال {idx + 1}</span>
                    <span style={{
                      background: isSelected ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.35)',
                      padding: '1px 6px',
                      borderRadius: '4px',
                      fontSize: '0.7rem'
                    }}>
                      {bloom}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Inspection Details */}
            {(() => {
              const activeQ = aiQuestions[selectedDebugIdx];
              const debugItem = (aiDebugData && aiDebugData[selectedDebugIdx]) || activeQ;
              if (!activeQ && !debugItem) {
                return <div style={{ padding: '2.5rem', textAlign: 'center', color: '#94A3B8' }}>لا توجد بيانات فحص متاحة حتى الآن. اضغط توليد تقييم لبدء الفحص.</div>;
              }

              const qText = debugItem?.question_text || activeQ?.question_text;
              const bloomLevel = (debugItem?.bloom_level || activeQ?.bloom_level || 'UNDERSTANDING').toUpperCase();
              const chunkId = debugItem?.chunk_id || activeQ?.chunk_id || 'N/A';
              const bookId = debugItem?.book_id || activeQ?.book_id || selectedAiBook?.id || 'N/A';
              const chapterId = debugItem?.chapter_id || activeQ?.chapter_id || selectedAiChapterId || 'N/A';
              const chunkText = debugItem?.chunk_text || activeQ?.chunk_text || activeQ?.source_excerpt || 'المحتوى المنهجي المعتمد للفصل الدراسي المسترجع من قاعدة البيانات.';
              const similarityScore = debugItem?.similarity_score !== undefined ? debugItem.similarity_score : 1.0;
              const validationStatus = debugItem?.validation_status || { isValid: true };

              const getBloomBadge = (level: string) => {
                if (level.includes('KNOW')) return { color: '#38BDF8', bg: '#0284C720', border: '#38BDF860', label: '40% Knowledge (تذكر)' };
                if (level.includes('UNDER')) return { color: '#A78BFA', bg: '#7C3AED20', border: '#A78BFA60', label: '30% Understanding (فهم)' };
                if (level.includes('APP')) return { color: '#34D399', bg: '#05966920', border: '#34D39960', label: '20% Application (تطبيق)' };
                return { color: '#FBBF24', bg: '#D9770620', border: '#FBBF2460', label: '10% Analysis (تحليل)' };
              };
              const bloomInfo = getBloomBadge(bloomLevel);

              return (
                <div style={{ padding: '1.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  {/* Question & Bloom Card */}
                  <div style={{ background: '#1E293B', padding: '1.25rem', borderRadius: '12px', border: '1px solid #334155' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <span style={{ fontSize: '0.8rem', color: '#94A3B8', fontWeight: 700 }}>
                        Question Text (نص السؤال المعروض للطالب):
                      </span>
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <span style={{
                          background: bloomInfo.bg,
                          color: bloomInfo.color,
                          border: `1px solid ${bloomInfo.border}`,
                          fontSize: '0.75rem',
                          fontWeight: 800,
                          padding: '3px 9px',
                          borderRadius: '6px'
                        }}>
                          🎯 {bloomInfo.label}
                        </span>
                        <span style={{
                          background: validationStatus.isValid ? '#10B98120' : '#EF444420',
                          color: validationStatus.isValid ? '#34D399' : '#F87171',
                          border: `1px solid ${validationStatus.isValid ? '#10B98160' : '#EF444460'}`,
                          fontSize: '0.75rem',
                          fontWeight: 800,
                          padding: '3px 9px',
                          borderRadius: '6px'
                        }}>
                          {validationStatus.isValid ? '✅ Quality Validation: PASSED' : `⚠️ Flagged: ${validationStatus.reason}`}
                        </span>
                      </div>
                    </div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#F8FAFC', lineHeight: 1.6 }}>
                      {qText}
                    </div>

                    {/* Options Preview */}
                    {activeQ?.options && (
                      <div style={{ marginTop: '0.85rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.5rem' }}>
                        {activeQ.options.map((opt: any, optIdx: number) => (
                          <div key={optIdx} style={{
                            background: '#0F172A',
                            border: '1px solid #334155',
                            padding: '0.5rem 0.75rem',
                            borderRadius: '6px',
                            fontSize: '0.8rem',
                            color: '#E2E8F0'
                          }}>
                            <span style={{ color: '#94A3B8', marginLeft: '6px' }}>{String.fromCharCode(65 + optIdx)})</span>
                            <span>{opt.option_text || opt.text}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Grounding IDs & Similarity Score Grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
                    <div style={{ background: '#1E293B', padding: '0.85rem 1rem', borderRadius: '8px', border: '1px solid #334155' }}>
                      <div style={{ fontSize: '0.7rem', color: '#94A3B8', fontWeight: 700, marginBottom: '4px' }}>CHUNK ID (معرف الفقرة)</div>
                      <code style={{ fontSize: '0.8rem', color: '#38BDF8', wordBreak: 'break-all' }}>{chunkId}</code>
                    </div>
                    <div style={{ background: '#1E293B', padding: '0.85rem 1rem', borderRadius: '8px', border: '1px solid #334155' }}>
                      <div style={{ fontSize: '0.7rem', color: '#94A3B8', fontWeight: 700, marginBottom: '4px' }}>BOOK ID (معرف الكتاب)</div>
                      <code style={{ fontSize: '0.8rem', color: '#A78BFA', wordBreak: 'break-all' }}>{bookId}</code>
                    </div>
                    <div style={{ background: '#1E293B', padding: '0.85rem 1rem', borderRadius: '8px', border: '1px solid #334155' }}>
                      <div style={{ fontSize: '0.7rem', color: '#94A3B8', fontWeight: 700, marginBottom: '4px' }}>CHAPTER ID (معرف الفصل)</div>
                      <code style={{ fontSize: '0.8rem', color: '#34D399', wordBreak: 'break-all' }}>{chapterId}</code>
                    </div>
                    <div style={{ background: '#1E293B', padding: '0.85rem 1rem', borderRadius: '8px', border: '1px solid #334155' }}>
                      <div style={{ fontSize: '0.7rem', color: '#94A3B8', fontWeight: 700, marginBottom: '4px' }}>SIMILARITY / RETRIEVAL SCORE</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <code style={{ fontSize: '0.85rem', color: '#FBBF24', fontWeight: 800 }}>{similarityScore}</code>
                        <div style={{ flex: 1, height: '6px', background: '#0F172A', borderRadius: '999px', overflow: 'hidden' }}>
                          <div style={{ width: `${Math.min(100, Math.round(similarityScore * 100))}%`, height: '100%', background: '#FBBF24' }} />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* The EXACT Raw Textbook Chunk Provided to Gemini */}
                  <div style={{ background: '#0B0F19', padding: '1.25rem', borderRadius: '12px', border: '1px solid #1E293B' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#38BDF8', fontWeight: 800, fontSize: '0.85rem' }}>
                        <span>📖</span>
                        <span>الفقرة التعليمية المسترجعة من الكتاب المدرسي التي استلمها Gemini (Retrieved Chunk):</span>
                      </div>
                      <span style={{ fontSize: '0.75rem', color: '#64748B' }}>
                        {chunkText.length} حرف
                      </span>
                    </div>
                    <div style={{
                      background: '#030712',
                      padding: '1rem',
                      borderRadius: '8px',
                      border: '1px solid #1F2937',
                      fontSize: '0.85rem',
                      color: '#E2E8F0',
                      lineHeight: 1.7,
                      whiteSpace: 'pre-wrap',
                      fontFamily: 'monospace',
                      maxHeight: '220px',
                      overflowY: 'auto'
                    }}>
                      {chunkText}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#94A3B8', marginTop: '0.5rem' }}>
                      💡 تحقق المطور: تم تجريد أرقام الصفحات والعناوين والبيانات الوصفية تماماً قبل التضمين والتوليد لضمان صياغة سؤال مفاهيمي صافٍ.
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>,
        document.body
      )}

      {/* Dedicated Completed Exams History Modal via Portal */}
      {showExamsHistoryModal && createPortal(
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.7)',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 999999,
          padding: '1.25rem',
          boxSizing: 'border-box'
        }}>
          <div style={{
            background: 'var(--bg-card)',
            color: 'var(--text-body)',
            width: '100%',
            maxWidth: '720px',
            maxHeight: '88vh',
            borderRadius: 'var(--radius-xl)',
            border: '1px solid var(--border-light)',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '1.25rem 1.5rem',
              borderBottom: '1px solid var(--border-light)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '1rem',
              background: 'var(--bg-subtle)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--primary-100)',
                  color: 'var(--primary-800)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.25rem',
                  fontWeight: 900
                }}>
                  📝
                </div>
                <div>
                  <h3 style={{ fontSize: '1.2rem', fontWeight: 900, margin: 0, color: 'var(--text-title)' }}>
                    {isAr ? 'سجل الامتحانات والتقييمات المنجزة' : 'Completed Assessments History'}
                  </h3>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    {isAr 
                      ? `تم العثور على ${analytics?.completed_exams?.length || totalCompletedAssessments} امتحانات مع تفاصيل النتائج والتشخيص`
                      : `Found ${analytics?.completed_exams?.length || totalCompletedAssessments} exams with diagnosis breakdown`}
                  </span>
                </div>
              </div>

              <button
                onClick={() => setShowExamsHistoryModal(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-muted)',
                  padding: '0.4rem',
                  borderRadius: 'var(--radius-md)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                title={isAr ? 'إغلاق (Esc)' : 'Close (Esc)'}
              >
                <X size={20} />
              </button>
            </div>

            {/* Quick Metrics Bar inside Modal */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '0.75rem',
              padding: '1rem 1.5rem',
              background: 'var(--bg-card)',
              borderBottom: '1px solid var(--border-light)'
            }}>
              <div style={{ padding: '0.65rem 0.85rem', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700 }}>
                  {isAr ? 'الامتحانات المكتملة' : 'Completed Exams'}
                </div>
                <div style={{ fontSize: '1.3rem', fontWeight: 900, color: 'var(--primary-700)' }}>
                  {analytics?.completed_exams?.length || totalCompletedAssessments}
                </div>
              </div>

              <div style={{ padding: '0.65rem 0.85rem', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700 }}>
                  {isAr ? 'نسبة الإتقان التراكمي' : 'Cumulative Mastery'}
                </div>
                <div style={{ fontSize: '1.3rem', fontWeight: 900, color: '#16A34A' }}>
                  {calculatedMastery}%
                </div>
              </div>

              <div style={{ padding: '0.65rem 0.85rem', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700 }}>
                  {isAr ? 'الفصول المتقنة' : 'Mastered Units'}
                </div>
                <div style={{ fontSize: '1.3rem', fontWeight: 900, color: '#D97706' }}>
                  {analytics?.summary?.mastered_topics_count ?? 0}
                </div>
              </div>
            </div>

            {/* Modal Body / Exam Items */}
            <div style={{
              padding: '1.25rem 1.5rem',
              overflowY: 'auto',
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              gap: '0.85rem'
            }}>
              {analytics?.completed_exams && analytics.completed_exams.length > 0 ? (
                analytics.completed_exams.map((exam: any, idx: number) => {
                  const pct = exam.percentage ?? Math.round(((exam.score || 0) / (exam.total || 1)) * 100);
                  const isMastered = pct >= 80;
                  const isProficient = pct >= 60 && pct < 80;
                  const badgeColor = isMastered ? '#16A34A' : isProficient ? '#2563EB' : '#D97706';
                  const badgeBg = isMastered ? '#F0FDF4' : isProficient ? '#EFF6FF' : '#FFFBEB';
                  const badgeBorder = isMastered ? '#BBF7D0' : isProficient ? '#BFDBFE' : '#FDE68A';
                  const statusText = isMastered
                    ? (isAr ? 'متقن (Mastered)' : 'Mastered')
                    : isProficient
                    ? (isAr ? 'متقدم (Proficient)' : 'Proficient')
                    : (isAr ? 'بحاجة لمراجعة (Developing)' : 'Developing');

                  const formattedDate = exam.created_at
                    ? new Date(exam.created_at).toLocaleDateString(isAr ? 'ar-EG' : 'en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })
                    : '';

                  return (
                    <div
                      key={exam.id || idx}
                      style={{
                        padding: '1rem 1.15rem',
                        background: 'var(--bg-subtle)',
                        borderRadius: 'var(--radius-lg)',
                        border: '1px solid var(--border-light)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '0.75rem'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flex: 1, minWidth: '220px' }}>
                        <div style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: 'var(--radius-md)',
                          background: badgeBg,
                          border: `1px solid ${badgeBorder}`,
                          color: badgeColor,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '1.1rem',
                          fontWeight: 900,
                          flexShrink: 0
                        }}>
                          {exam.type === 'TIMED_EXAM' ? '⏱️' : '🧠'}
                        </div>

                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--text-title)' }}>
                              {isAr ? (exam.chapter_title_ar || exam.title_ar || exam.subject_name_ar) : (exam.chapter_title_en || exam.title_en || exam.subject_name_en)}
                            </span>
                            <span style={{
                              fontSize: '0.68rem',
                              fontWeight: 700,
                              padding: '0.12rem 0.45rem',
                              borderRadius: 'var(--radius-full)',
                              background: badgeBg,
                              color: badgeColor,
                              border: `1px solid ${badgeBorder}`
                            }}>
                              {statusText}
                            </span>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                            <span style={{ fontWeight: 600 }}>{isAr ? exam.subject_name_ar : (exam.subject_name_en || exam.subject_name_ar)}</span>
                            {exam.book_title_ar && (
                              <>
                                <span>•</span>
                                <span>{isAr ? exam.book_title_ar : (exam.book_title_en || exam.book_title_ar)}</span>
                              </>
                            )}
                            <span>•</span>
                            <span>{formattedDate}</span>
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flexShrink: 0 }}>
                        <div style={{ textAlign: isAr ? 'left' : 'right' }}>
                          <div style={{ fontSize: '1.15rem', fontWeight: 900, color: badgeColor }}>
                            {pct}%
                          </div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                            {exam.score} / {exam.total} {isAr ? 'درجة' : 'pts'}
                          </div>
                        </div>

                        {exam.report && (
                          <button
                            className="btn btn-outline btn-sm"
                            onClick={() => {
                              setShowExamsHistoryModal(false);
                              setAiReport(exam.report);
                              setActiveTab('ai');
                              setAiStep(5);
                            }}
                            style={{ fontWeight: 700, fontSize: '0.78rem', whiteSpace: 'nowrap' }}
                          >
                            {isAr ? 'تقرير التشخيص 📋' : 'View Report 📋'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-muted)' }}>
                  <p style={{ margin: 0 }}>
                    {isAr ? 'لا توجد امتحانات مكتملة مسجلة بعد.' : 'No completed exams found yet.'}
                  </p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: '0.85rem 1.5rem',
              borderTop: '1px solid var(--border-light)',
              display: 'flex',
              justifyContent: 'flex-end',
              background: 'var(--bg-subtle)'
            }}>
              <button
                className="btn btn-primary"
                onClick={() => setShowExamsHistoryModal(false)}
                style={{ fontWeight: 800, padding: '0.5rem 1.5rem' }}
              >
                {isAr ? 'إغلاق' : 'Close'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
};
