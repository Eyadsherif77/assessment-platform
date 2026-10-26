import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { usePlatformSettings } from '../context/PlatformSettingsContext';
import { apiUrl } from '../utils/api';
import { 
  FileText, 
  PlusCircle, 
  BarChart2, 
  BookOpen, 
  CheckCircle2, 
  LayoutDashboard,
  Users,
  TrendingUp,
  AlertTriangle,
  Clock,
  Award,
  Eye,
  Search,
  Lock
} from 'lucide-react';

export const TeacherDashboard: React.FC = () => {
  const { user, token, language } = useAuth();
  const { activeTerm } = usePlatformSettings();
  const isAr = language === 'ar';

  const [selectedTerm, setSelectedTerm] = useState<number>(activeTerm || 1);

  useEffect(() => {
    if (activeTerm) {
      setSelectedTerm(activeTerm);
    }
  }, [activeTerm]);

  const getInitialTeacherTab = (): 'overview' | 'books' | 'exams' | 'builder' | 'analytics' => {
    try {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get('tab');
      if (tab === 'overview' || tab === 'books' || tab === 'exams' || tab === 'builder' || tab === 'analytics') return tab as any;
      const saved = localStorage.getItem('teacher_active_tab');
      if (saved === 'overview' || saved === 'books' || saved === 'exams' || saved === 'builder' || saved === 'analytics') return saved as any;
    } catch (_) {}
    return 'overview';
  };

  const [activeTab, setActiveTabState] = useState<'overview' | 'books' | 'exams' | 'builder' | 'analytics'>(getInitialTeacherTab);

  const setActiveTab = (tab: 'overview' | 'books' | 'exams' | 'builder' | 'analytics') => {
    setActiveTabState(tab);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', tab);
      window.history.replaceState({}, '', url.toString());
      localStorage.setItem('teacher_active_tab', tab);
    } catch (_) {}
  };


  // Resolve assigned grade strictly from teacher profile/assignments
  const assignedGradeId = React.useMemo(() => {
    if (user?.profile?.grade_id) return user.profile.grade_id;
    const tAssign = user?.profile?.teaching_assignments;
    if (Array.isArray(tAssign) && tAssign.length > 0) {
      const g = typeof tAssign[0] === 'object' ? tAssign[0]?.grade_id : tAssign[0];
      if (g) return g;
    }
    const raw = user?.profile?.assigned_grades;
    if (Array.isArray(raw) && raw.length > 0) return raw[0];
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed[0];
      } catch (_) {}
      if (raw) return raw;
    }
    return '';
  }, [user?.profile]);

  // Teacher's assigned grades and subjects memoization
  const teacherAssignedGrades: string[] = React.useMemo(() => {
    const list: string[] = [];
    if (assignedGradeId) list.push(assignedGradeId);
    const tAssign = user?.profile?.teaching_assignments;
    if (Array.isArray(tAssign)) {
      for (const a of tAssign) {
        const gid = typeof a === 'object' ? a?.grade_id : a;
        if (gid && !list.includes(gid)) list.push(gid);
      }
    }
    const raw = user?.profile?.assigned_grades;
    if (Array.isArray(raw)) {
      for (const g of raw) if (g && !list.includes(g)) list.push(g);
    } else if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          for (const g of parsed) if (g && !list.includes(g)) list.push(g);
        }
      } catch (_) {}
    }
    return list;
  }, [assignedGradeId, user?.profile]);

  const teacherAssignedSubjects: string[] = React.useMemo(() => {
    const raw = user?.profile?.assigned_subjects;
    if (Array.isArray(raw) && raw.length > 0) return raw;
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (_) {}
      return raw.split(/[,،]+/).map(s => s.trim()).filter(Boolean);
    }
    const spec = user?.profile?.specialization;
    if (spec) return spec.split(/[,،]+/).map((s: string) => s.trim()).filter(Boolean);
    return [];
  }, [user?.profile?.assigned_subjects, user?.profile?.specialization]);

  // Metadata - Linked strictly to Teacher's assigned Grade & Stage
  const [allGrades, setAllGrades] = useState<any[]>([]);
  const [selectedStageId, setSelectedStageId] = useState(user?.profile?.academic_stage_id || '');
  const [selectedGradeId, setSelectedGradeId] = useState(assignedGradeId || user?.profile?.grade_id || '');
  const [subjects, setSubjects] = useState<any[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState(user?.profile?.subject_id || '');

  // Computed assigned grade display label
  const assignedGradeLabel = React.useMemo(() => {
    if (user?.profile?.grade_name_ar) {
      return isAr ? user.profile.grade_name_ar : (user.profile.grade_name_en || user.profile.grade_name_ar);
    }
    const effectiveGradeId = selectedGradeId || assignedGradeId;
    const found = allGrades.find(g => g.id === effectiveGradeId);
    if (found) {
      return isAr ? `${found.name_ar}${found.stage_name_ar ? ` (${found.stage_name_ar})` : ''}` : (found.name_en || found.name_ar);
    }
    return isAr ? 'الصف المعتمد' : 'Assigned Grade';
  }, [user?.profile, allGrades, selectedGradeId, assignedGradeId, isAr]);

  // Fetch grades strictly locked to teacher's authorized grades
  useEffect(() => {
    fetch(apiUrl('/api/meta/grades'))
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          let accessibleGrades = data;
          if (user?.role === 'TEACHER' && teacherAssignedGrades.length > 0) {
            accessibleGrades = data.filter(g => teacherAssignedGrades.includes(g.id));
            if (accessibleGrades.length === 0) accessibleGrades = data;
          }
          setAllGrades(accessibleGrades);
          // Only fallback to accessible grade if no grade was assigned to teacher
          if (!assignedGradeId && !selectedGradeId && accessibleGrades.length > 0) {
            setSelectedGradeId(accessibleGrades[0].id);
            setSelectedStageId(accessibleGrades[0].stage_id);
          }
        }
      })
      .catch(console.error);
  }, [teacherAssignedGrades, assignedGradeId, selectedGradeId]);

  useEffect(() => {
    if (assignedGradeId) {
      setSelectedGradeId(assignedGradeId);
    }
    if (user?.profile?.academic_stage_id) {
      setSelectedStageId(user.profile.academic_stage_id);
    }
  }, [assignedGradeId, user?.profile?.academic_stage_id]);

  // Books State
  const [books, setBooks] = useState<any[]>([]);

  // Exams State
  const [exams, setExams] = useState<any[]>([]);
  const [newExamTitle, setNewExamTitle] = useState('');
  const [examDuration, setExamDuration] = useState('30');
  const [examSchoolType, setExamSchoolType] = useState<'عربي' | 'لغات' | 'كلاهما'>('كلاهما');
  const [isStyleReference, setIsStyleReference] = useState<boolean>(false);
  const [examQuestions, setExamQuestions] = useState<any[]>([
    {
      question_text: '',
      points: 1,
      page_reference: '',
      options: [
        { option_text: '', is_correct: true },
        { option_text: '', is_correct: false },
        { option_text: '', is_correct: false },
        { option_text: '', is_correct: false }
      ]
    }
  ]);
  const [isCreatingExam, setIsCreatingExam] = useState(false);

  // Analytics
  const [teacherAnalytics, setTeacherAnalytics] = useState<any | null>(null);
  // Student search query for أداء الطلاب section
  const [studentSearchQuery, setStudentSearchQuery] = useState<string>('');

  // Fixed Exams View Mode State
  const [examViewMode, setExamViewMode] = useState<'all' | 'hierarchy'>('all');
  const [fixedHierarchy, setFixedHierarchy] = useState<any[]>([]);
  const [selectedFixedSubjId, setSelectedFixedSubjId] = useState<string>('');

  useEffect(() => {
    if (activeTab === 'exams' && token) {
      const q = selectedGradeId ? `?grade_id=${selectedGradeId}` : '';
      fetch(apiUrl(`/api/exams/fixed/hierarchy${q}`), {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(r => r.json())
        .then(data => {
          if (Array.isArray(data)) {
            setFixedHierarchy(data);
            if (data.length > 0 && !selectedFixedSubjId) {
              const withExams = data.find((s: any) => s.total_exams > 0);
              setSelectedFixedSubjId(withExams ? withExams.id : data[0].id);
            }
          }
        })
        .catch(console.error);
    }
  }, [activeTab, selectedGradeId, token]);

  // Submissions & Exam Review States
  const [isSubmissionsModalOpen, setIsSubmissionsModalOpen] = useState(false);
  const [examForSubmissions, setExamForSubmissions] = useState<any | null>(null);
  const [submissionsList, setSubmissionsList] = useState<any[]>([]);
  const [isLoadingSubmissions, setIsLoadingSubmissions] = useState(false);

  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [reviewData, setReviewData] = useState<any | null>(null);
  const [isLoadingReview, setIsLoadingReview] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  const handleOpenSubmissionsModal = async (exam: any) => {
    setExamForSubmissions(exam);
    setIsSubmissionsModalOpen(true);
    setIsLoadingSubmissions(true);
    try {
      const res = await fetch(apiUrl(`/api/exams/${exam.id}/submissions`), {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setSubmissionsList(Array.isArray(data) ? data : []);
      } else {
        setSubmissionsList([]);
      }
    } catch (e) {
      console.error(e);
      setSubmissionsList([]);
    } finally {
      setIsLoadingSubmissions(false);
    }
  };

  const handleOpenReviewModal = async (attemptId: string, isAiEval: boolean = false) => {
    setIsReviewModalOpen(true);
    setIsLoadingReview(true);
    setReviewError(null);
    setReviewData(null);
    try {
      const endpoint = isAiEval 
        ? `/api/ai/evaluations/${attemptId}/review`
        : `/api/exams/attempts/${attemptId}/review`;
      const res = await fetch(apiUrl(endpoint), {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || (isAr ? 'فشل تحميل ورقة إجابة الطالب' : 'Failed to load student exam review'));
      }
      setReviewData(data);
    } catch (err: any) {
      setReviewError(err.message || (isAr ? 'حدث خطأ في تحميل المراجعة' : 'Error loading review'));
    } finally {
      setIsLoadingReview(false);
    }
  };

  // Chapter Management State
  const [selectedBookForChapters, setSelectedBookForChapters] = useState<any | null>(null);
  const [bookChaptersList, setBookChaptersList] = useState<any[]>([]);
  const [isLoadingChapters, setIsLoadingChapters] = useState(false);
  const [isDetectingChapters, setIsDetectingChapters] = useState(false);
  const [showAddChapterForm, setShowAddChapterForm] = useState(false);
  const [newChNumber, setNewChNumber] = useState(1);
  const [newChTitleAr, setNewChTitleAr] = useState('');
  const [newChTitleEn, setNewChTitleEn] = useState('');
  const [newChStartPage, setNewChStartPage] = useState(1);
  const [newChEndPage, setNewChEndPage] = useState(20);

  const handleOpenChaptersModal = async (book: any) => {
    setSelectedBookForChapters(book);
    setShowAddChapterForm(false);
    setIsLoadingChapters(true);
    try {
      const res = await fetch(apiUrl(`/api/books/${book.id}/chapters`), {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setBookChaptersList(Array.isArray(data) ? data : []);
      if (Array.isArray(data)) {
        setNewChNumber(data.length + 1);
        const lastPage = data[data.length - 1]?.end_page || 1;
        setNewChStartPage(lastPage + 1);
        setNewChEndPage(lastPage + 25);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingChapters(false);
    }
  };

  const handleAutoDetectChapters = async (bookId: string) => {
    setIsDetectingChapters(true);
    try {
      const res = await fetch(apiUrl(`/api/books/${bookId}/auto-detect-chapters`), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to detect chapters');
      alert(data.message || (isAr ? 'تم استخراج الوحدات بنجاح' : 'Units detected successfully'));
      handleOpenChaptersModal(selectedBookForChapters);
      loadTeacherData();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsDetectingChapters(false);
    }
  };

  const handleAddChapter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBookForChapters) return;
    try {
      const res = await fetch(apiUrl(`/api/books/${selectedBookForChapters.id}/chapters`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          chapter_number: newChNumber,
          title_ar: newChTitleAr,
          title_en: newChTitleEn || `Chapter ${newChNumber}`,
          start_page: newChStartPage,
          end_page: newChEndPage
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add chapter');
      setShowAddChapterForm(false);
      setNewChTitleAr('');
      setNewChTitleEn('');
      handleOpenChaptersModal(selectedBookForChapters);
      loadTeacherData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDeleteChapter = async (chapterId: string) => {
    if (!selectedBookForChapters) return;
    if (!confirm(isAr ? 'هل أنت متأكد من حذف هذه الوحدة؟' : 'Are you sure you want to delete this unit?')) return;
    try {
      const res = await fetch(apiUrl(`/api/books/${selectedBookForChapters.id}/chapters/${chapterId}`), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Failed to delete');
      }
      handleOpenChaptersModal(selectedBookForChapters);
      loadTeacherData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const teacherSpecialization = (user?.profile?.specialization || '').trim();

  const isExamMatchingSpecialization = (exam: any, spec: string, subjId?: string) => {
    if (subjId && exam.subject_id && exam.subject_id !== subjId) return false;
    if (!spec) return true;
    const specClean = spec.replace(/^(اللغة|مادة|معلم أول|معلم)\s+/i, '').trim().toLowerCase();
    const subjAr = (exam.subject_name_ar || '').replace(/^(اللغة|مادة)\s+/i, '').trim().toLowerCase();
    const titleAr = (exam.title || exam.title_ar || '').toLowerCase();

    if (specClean.includes('عرب') || specClean.includes('arabic')) {
      if (titleAr.includes('social') || titleAr.includes('دراسات') ||
          titleAr.includes('english') || titleAr.includes('انجليز') ||
          titleAr.includes('math') || titleAr.includes('رياض') ||
          titleAr.includes('science') || titleAr.includes('علوم')) {
        return false;
      }
      return subjAr.includes('عرب') || titleAr.includes('عرب');
    }
    if (specClean.includes('رياض') || specClean.includes('math')) {
      if (titleAr.includes('social') || titleAr.includes('english') || titleAr.includes('عرب') || titleAr.includes('science')) return false;
      return subjAr.includes('رياض') || titleAr.includes('رياض');
    }
    if (specClean.includes('علوم') || specClean.includes('science')) {
      if (titleAr.includes('social') || titleAr.includes('english') || titleAr.includes('عرب') || titleAr.includes('math')) return false;
      return subjAr.includes('علوم') || titleAr.includes('علوم');
    }
    if (specClean.includes('انجليز') || specClean.includes('إنجليز') || specClean.includes('english')) {
      if (titleAr.includes('social') || titleAr.includes('عرب') || titleAr.includes('math') || titleAr.includes('science')) return false;
      return subjAr.includes('انجليز') || subjAr.includes('إنجليز') || titleAr.includes('english');
    }
    return true;
  };

  const isChapterMatchingSubject = (ch: any, spec: string) => {
    if (!spec) return true;
    const specClean = spec.replace(/^(اللغة|مادة|معلم أول|معلم)\s+/i, '').trim().toLowerCase();
    const title = (ch.title_ar || ch.title || '').toLowerCase();
    const bookTitle = (ch.book_title || '').toLowerCase();

    if (specClean.includes('عرب') || specClean.includes('arabic')) {
      if (bookTitle.includes('social') || bookTitle.includes('english') || bookTitle.includes('math') || bookTitle.includes('science')) return false;
      if (title.includes('حول المدينة') || title.includes('للتسوق') || title.includes('مجتمعي') || 
          title.includes('بالطائرة') || title.includes('الإنجازات') || title.includes('الجغرافيا') || 
          title.includes('الحضارات') || title.includes('المواطنة') || title.includes('الموارد الاقتصادية') ||
          title.includes('science') || title.includes('math') || title.includes('english')) {
        return false;
      }
      return true;
    }
    if (specClean.includes('انجليز') || specClean.includes('english')) {
      if (bookTitle.includes('عرب') || bookTitle.includes('social') || bookTitle.includes('math') || bookTitle.includes('science')) return false;
      if (title.includes('مكارم الأخلاق') || title.includes('بناء الحضارة') || title.includes('الفنون والآداب') || title.includes('الجغرافيا')) return false;
      return true;
    }
    if (specClean.includes('رياض') || specClean.includes('math')) {
      if (bookTitle.includes('عرب') || bookTitle.includes('english') || bookTitle.includes('social') || bookTitle.includes('science')) return false;
      return true;
    }
    if (specClean.includes('علوم') || specClean.includes('science')) {
      if (bookTitle.includes('عرب') || bookTitle.includes('english') || bookTitle.includes('social') || bookTitle.includes('math')) return false;
      return true;
    }
    return true;
  };

  const loadTeacherData = (subjId?: string, termToUse?: number) => {
    if (!token) return;
    const currentSubjectId = subjId || selectedSubjectId;
    const subjectParam = currentSubjectId ? `&subject_id=${encodeURIComponent(currentSubjectId)}` : '';
    const currentTerm = termToUse || selectedTerm || activeTerm || 1;

    // Load Books (Display all curriculum textbooks for this grade, subject & term)
    const gradeParam = selectedGradeId ? `&grade_id=${selectedGradeId}` : '';
    fetch(apiUrl(`/api/books?term=${currentTerm}${gradeParam}${subjectParam}`), { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          setBooks(data);
        }
      })
      .catch(console.error);

    // Load Exams (strictly filtered to this teacher's subject & term)
    fetch(apiUrl(`/api/exams?my_only=true${subjectParam}&term=${currentTerm}`), { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          const matchedSubj = subjects.find(s => s.id === currentSubjectId);
          const spec = matchedSubj?.name_ar || (user?.profile?.specialization || '').trim();
          const filtered = spec ? data.filter(e => isExamMatchingSpecialization(e, spec, currentSubjectId)) : data;
          setExams(filtered);
        }
      })
      .catch(console.error);

    // Load Analytics (strictly filtered to this teacher's subject)
    const analyticsUrl = currentSubjectId 
      ? `/api/analytics/teacher?subject_id=${encodeURIComponent(currentSubjectId)}` 
      : '/api/analytics/teacher';
    fetch(apiUrl(analyticsUrl), { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => setTeacherAnalytics(data))
      .catch(console.error);
  };

  useEffect(() => {
    loadTeacherData(undefined, selectedTerm);
  }, [token, user?.profile?.specialization, selectedGradeId, selectedTerm]);

  const getMatchedSubject = (subjectList: any[]) => {
    if (!subjectList || subjectList.length === 0) return null;
    if (user?.profile?.subject_id) {
      const byId = subjectList.find(s => s.id === user?.profile?.subject_id);
      if (byId) return byId;
    }
    if (!teacherSpecialization) return subjectList[0];

    const specClean = teacherSpecialization.replace(/^(اللغة|مادة)\s+/i, '').trim().toLowerCase();
    const matched = subjectList.find(s => {
      const arName = (s.name_ar || '').trim();
      const arClean = arName.replace(/^(اللغة|مادة)\s+/i, '').trim().toLowerCase();
      const enName = (s.name_en || '').trim().toLowerCase();
      const code = (s.code || '').toUpperCase();

      if (arName === teacherSpecialization || enName === teacherSpecialization.toLowerCase()) return true;
      if (arClean.includes(specClean) || specClean.includes(arClean)) return true;
      if (enName.includes(specClean) || specClean.includes(enName)) return true;

      if ((specClean.includes('عرب') || specClean.includes('arabic')) && (code === 'ARABIC' || arClean.includes('عرب'))) return true;
      if ((specClean.includes('رياض') || specClean.includes('math')) && (code === 'MATH' || arClean.includes('رياض'))) return true;
      if ((specClean.includes('علوم') || specClean.includes('science')) && (code === 'SCIENCE' || arClean.includes('علوم'))) return true;
      if ((specClean.includes('انجليز') || specClean.includes('إنجليز') || specClean.includes('english')) && (code === 'ENGLISH' || arClean.includes('إنجليز') || arClean.includes('انجليز'))) return true;

      return false;
    });

    return matched || subjectList[0];
  };

  // Load subjects for selected grade strictly locked to teacher's authorized subjects
  useEffect(() => {
    if (selectedGradeId) {
      fetch(apiUrl(`/api/meta/grades/${selectedGradeId}/subjects`))
        .then(r => r.json())
        .then(data => {
          if (Array.isArray(data)) {
            let accessibleSubjects = data;
            if (user?.role === 'TEACHER') {
              const rawAssignments = (user?.profile as any)?.teaching_assignments;
              let teachingAssignments: Array<{ subjectId: string; subjectName: string; gradeIds: string[] }> = [];
              if (Array.isArray(rawAssignments)) {
                teachingAssignments = rawAssignments;
              } else if (typeof rawAssignments === 'string') {
                try { teachingAssignments = JSON.parse(rawAssignments); } catch (_) {}
              }

              const gradeAssignments = teachingAssignments.filter(a => Array.isArray(a.gradeIds) && a.gradeIds.includes(selectedGradeId));

              if (gradeAssignments.length > 0) {
                accessibleSubjects = data.filter(s => {
                  const sNameAr = (s.name_ar || '').replace(/^(اللغة|مادة)\s+/i, '').trim().toLowerCase();
                  const sNameEn = (s.name_en || '').trim().toLowerCase();
                  return gradeAssignments.some(a => {
                    const cleanA = (a.subjectName || '').replace(/^(اللغة|مادة)\s+/i, '').trim().toLowerCase();
                    return a.subjectId === s.id || sNameAr.includes(cleanA) || cleanA.includes(sNameAr) || sNameEn.includes(cleanA);
                  });
                });
              } else if (teacherAssignedSubjects.length > 0) {
                accessibleSubjects = data.filter(s => {
                  const sNameAr = (s.name_ar || '').replace(/^(اللغة|مادة)\s+/i, '').trim().toLowerCase();
                  const sNameEn = (s.name_en || '').trim().toLowerCase();
                  const sCode = (s.code || '').toUpperCase();
                  return teacherAssignedSubjects.some(t => {
                    const cleanT = t.replace(/^(اللغة|مادة|معلم أول|معلم)\s+/i, '').trim().toLowerCase();
                    if (sNameAr.includes(cleanT) || cleanT.includes(sNameAr)) return true;
                    if (sNameEn.includes(cleanT) || cleanT.includes(sNameEn)) return true;
                    if (cleanT.includes('عرب') && (sCode === 'ARABIC' || sNameAr.includes('عرب'))) return true;
                    if (cleanT.includes('رياض') && (sCode === 'MATH' || sNameAr.includes('رياض'))) return true;
                    if (cleanT.includes('علوم') && (sCode === 'SCIENCE' || sNameAr.includes('علوم'))) return true;
                    if ((cleanT.includes('انجليز') || cleanT.includes('إنجليز')) && (sCode === 'ENGLISH' || sNameAr.includes('انجليز'))) return true;
                    if (cleanT.includes('دراسات') && (sCode === 'SOCIAL' || sNameAr.includes('دراسات'))) return true;
                    return false;
                  });
                });
              }
              if (accessibleSubjects.length === 0) accessibleSubjects = data;
            }
            setSubjects(accessibleSubjects);
            const target = getMatchedSubject(accessibleSubjects);
            const initialId = target ? target.id : (accessibleSubjects.length > 0 ? accessibleSubjects[0].id : '');
            if (initialId) {
              setSelectedSubjectId(initialId);
              loadTeacherData(initialId);
            }
          }
        })
        .catch(console.error);
    }
  }, [selectedGradeId, teacherAssignedSubjects, teacherSpecialization]);

  // Toggle publish exam
  const handleTogglePublish = async (examId: string, currentStatus: boolean) => {
    try {
      const res = await fetch(apiUrl(`/api/exams/${examId}/publish`), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ is_published: !currentStatus })
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'فشل تحديث حالة النشر');
      }
      loadTeacherData();
    } catch (e: any) {
      console.error(e);
      alert(e.message || 'فشل تحديث حالة النشر');
    }
  };

  // Toggle style reference status
  const handleToggleStyleReference = async (examId: string, currentVal: any) => {
    try {
      const newVal = (currentVal === true || currentVal === 1 || currentVal === '1') ? 0 : 1;
      const res = await fetch(apiUrl(`/api/exams/${examId}/style-reference`), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ is_style_reference: newVal })
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || (isAr ? 'فشل تحديث مرجع الأسلوب' : 'Failed to update style reference'));
      }
      loadTeacherData();
    } catch (e: any) {
      console.error(e);
      alert(e.message || (isAr ? 'فشل تحديث مرجع الأسلوب' : 'Failed to update style reference'));
    }
  };

  // Create exam handler
  const handleCreateExam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newExamTitle || examQuestions.length === 0) return;

    setIsCreatingExam(true);
    try {
      const targetGradeId = selectedGradeId || user?.profile?.grade_id || '2f0f4f5a-7c5c-4136-a935-33c79effca3d';
      const targetStageId = selectedStageId || user?.profile?.academic_stage_id || '61998777-4c5f-4e51-bc0a-38de938c842a';

      const res = await fetch(apiUrl('/api/exams'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          title_ar: newExamTitle,
          academic_stage_id: targetStageId,
          grade_id: targetGradeId,
          subject_id: selectedSubjectId,
          duration_minutes: parseInt(examDuration, 10) || 30,
          school_type: examSchoolType,
          is_published: true,
          is_style_reference: isStyleReference ? 1 : 0,
          questions: examQuestions
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل إنشاء الاختبار');

      alert('تم إنشاء ونشر الاختبار بنجاح!');
      setNewExamTitle('');
      setIsStyleReference(false);
      loadTeacherData();
      setActiveTab('exams');
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsCreatingExam(false);
    }
  };

  return (
    <div className="workspace-wrapper">

      {/* =========================================================
          DESKTOP SIDEBAR NAVIGATION (TEACHER WORKSPACE)
          ========================================================= */}
      <aside className="workspace-sidebar">
        {/* Teacher Mini Profile */}
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
            background: 'linear-gradient(135deg, #1E3A8A, #3B82F6)',
            color: '#FFFFFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 800,
            fontSize: '1.2rem',
            boxShadow: 'var(--shadow-blue)',
            flexShrink: 0
          }}>
            {user?.fullName?.charAt(0) || 'م'}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-title)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {user?.fullName}
            </div>
            <div style={{ fontSize: '0.72rem', color: '#4F46E5', fontWeight: 700 }}>
              {isAr ? 'المعلم' : 'Teacher'}
            </div>
          </div>
        </div>

        {/* Sidebar Nav Buttons */}
        <nav className="sidebar-nav">
          <button
            className={`sidebar-btn ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            <LayoutDashboard size={18} />
            <span>{isAr ? 'نظرة عامة والنشاط' : 'Overview & Activity'}</span>
          </button>

          <button
            className={`sidebar-btn ${activeTab === 'books' ? 'active' : ''}`}
            onClick={() => setActiveTab('books')}
          >
            <BookOpen size={18} />
            <span>{isAr ? `المناهج والكتب (${books.length})` : `Textbooks (${books.length})`}</span>
          </button>

          <button
            className={`sidebar-btn ${activeTab === 'exams' ? 'active' : ''}`}
            onClick={() => setActiveTab('exams')}
          >
            <FileText size={18} />
            <span>{isAr ? `بنك الامتحانات (${exams.length})` : `Exam Bank (${exams.length})`}</span>
          </button>

          <button
            className={`sidebar-btn ${activeTab === 'builder' ? 'active' : ''}`}
            onClick={() => setActiveTab('builder')}
          >
            <PlusCircle size={18} />
            <span>{isAr ? 'مصمم الامتحانات' : 'Exam Builder'}</span>
          </button>

          <button
            className={`sidebar-btn ${activeTab === 'analytics' ? 'active' : ''}`}
            onClick={() => setActiveTab('analytics')}
          >
            <BarChart2 size={18} />
            <span>{isAr ? 'أداء الطلاب' : 'Class Mastery & Analytics'}</span>
          </button>
        </nav>

        {/* Bottom Status */}
        <div style={{ marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid var(--border-light)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 700, color: '#16A34A', marginBottom: '0.2rem' }}>
            <CheckCircle2 size={14} />
            <span>{isAr ? 'بوابة المعلم المعتمدة' : 'Certified Teacher Gate'}</span>
          </div>
        </div>
      </aside>

      {/* =========================================================
          WORKSPACE MAIN CONTENT
          ========================================================= */}
      <main className="workspace-content">

        {/* Mobile Quick Horizontal Tab Bar */}
        <div className="teacher-mobile-tab-bar" style={{
          display: 'none',
          gap: '0.45rem',
          overflowX: 'auto',
          paddingBottom: '0.6rem',
          marginBottom: '1.25rem',
          WebkitOverflowScrolling: 'touch',
          whiteSpace: 'nowrap',
          maxWidth: '100%'
        }}>
          <button
            className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
            style={{ padding: '0.5rem 0.85rem', fontSize: '0.82rem', fontWeight: 700 }}
          >
            <LayoutDashboard size={15} />
            <span>{isAr ? 'نظرة عامة' : 'Overview'}</span>
          </button>
          <button
            className={`tab-btn ${activeTab === 'books' ? 'active' : ''}`}
            onClick={() => setActiveTab('books')}
            style={{ padding: '0.5rem 0.85rem', fontSize: '0.82rem', fontWeight: 700 }}
          >
            <BookOpen size={15} />
            <span>{isAr ? `الكتب (${books.length})` : `Books (${books.length})`}</span>
          </button>
          <button
            className={`tab-btn ${activeTab === 'exams' ? 'active' : ''}`}
            onClick={() => setActiveTab('exams')}
            style={{ padding: '0.5rem 0.85rem', fontSize: '0.82rem', fontWeight: 700 }}
          >
            <FileText size={15} />
            <span>{isAr ? `الامتحانات (${exams.length})` : `Exams (${exams.length})`}</span>
          </button>
          <button
            className={`tab-btn ${activeTab === 'builder' ? 'active' : ''}`}
            onClick={() => setActiveTab('builder')}
            style={{ padding: '0.5rem 0.85rem', fontSize: '0.82rem', fontWeight: 700 }}
          >
            <PlusCircle size={15} />
            <span>{isAr ? 'مصمم الامتحانات' : 'Builder'}</span>
          </button>
          <button
            className={`tab-btn ${activeTab === 'analytics' ? 'active' : ''}`}
            onClick={() => setActiveTab('analytics')}
            style={{ padding: '0.5rem 0.85rem', fontSize: '0.82rem', fontWeight: 700 }}
          >
            <BarChart2 size={15} />
            <span>{isAr ? 'أداء الطلاب' : 'Analytics'}</span>
          </button>
        </div>

        {/* MODULE 1: OVERVIEW & RECENT ACTIVITY */}
        {activeTab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Header Banner */}
            <div className="card" style={{
              background: 'linear-gradient(135deg, #1E293B 0%, #0F172A 100%)',
              color: '#FFFFFF',
              padding: '2rem',
              borderRadius: 'var(--radius-xl)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '1.25rem'
            }}>
              <div>
                <span className="badge badge-primary" style={{ background: 'rgba(255,255,255,0.15)', color: '#FFFFFF', marginBottom: '0.5rem' }}>
                  {isAr ? 'مساحة المعلم الرقمية 👩‍🏫' : 'Teacher Digital Workspace 👩‍🏫'}
                </span>
                <h2 style={{ fontSize: '1.7rem', fontWeight: 900, margin: '0.25rem 0 0.5rem', color: '#FFFFFF' }}>
                  {isAr ? `مرحباً ${user?.fullName}` : `Welcome, ${user?.fullName}`}
                </h2>
                <p style={{ color: '#94A3B8', fontSize: '0.9rem', margin: '0 0 0.75rem' }}>
                  {isAr ? 'التخصص المسجل:' : 'Specialization:'} <strong>{teacherSpecialization || (isAr ? 'معلم مادة' : 'Teacher')}</strong> • {isAr ? 'المدرسة:' : 'School:'} {user?.profile?.school_name || (isAr ? 'مدرسة المتفوقين' : 'Excellence School')}
                </p>

                {/* Active Subject (Locked to Teacher's Specialization Only) */}
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.6rem', background: 'rgba(255,255,255,0.08)', padding: '0.4rem 0.85rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(255,255,255,0.18)', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.82rem', color: '#CBD5E1', fontWeight: 700 }}>
                    {isAr ? '📚 المادة التخصصية:' : '📚 Your Subject:'}
                  </span>
                  <span style={{
                    background: 'rgba(79, 70, 229, 0.35)',
                    color: '#FFFFFF',
                    border: '1px solid rgba(165, 180, 252, 0.45)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '0.25rem 0.75rem',
                    fontWeight: 800,
                    fontSize: '0.85rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem'
                  }}>
                    <span>🔒</span>
                    <span>
                      {(() => {
                        const matched = getMatchedSubject(subjects);
                        return matched ? (isAr ? matched.name_ar : (matched.name_en || matched.name_ar)) : (teacherSpecialization || (isAr ? 'اللغة العربية' : 'Arabic'));
                      })()}
                    </span>
                  </span>
                  <span className="badge badge-success" style={{ fontSize: '0.7rem', fontWeight: 800 }}>
                    {isAr ? 'مثبتة ومفلترة لمادتك حصراً 🎯' : 'Locked to Your Subject 🎯'}
                  </span>
                </div>

                {/* Active Grade (Locked / Read-Only from Teacher Profile) */}
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.6rem', background: 'rgba(255,255,255,0.08)', padding: '0.35rem 0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(255,255,255,0.18)', flexWrap: 'wrap', marginInlineStart: '0.5rem' }}>
                  <span style={{ fontSize: '0.82rem', color: '#CBD5E1', fontWeight: 700 }}>
                    {isAr ? '🎓 الصف الدراسي النشط:' : '🎓 Active Grade:'}
                  </span>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}>
                    <span style={{
                      background: '#0F172A',
                      color: '#38BDF8',
                      border: '1px solid rgba(56, 189, 248, 0.45)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '0.25rem 0.65rem',
                      fontWeight: 800,
                      fontSize: '0.82rem',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem'
                    }}>
                      <Lock size={13} style={{ color: '#38BDF8' }} />
                      <span>{assignedGradeLabel}</span>
                    </span>
                    <span className="badge badge-success" style={{ fontSize: '0.7rem', fontWeight: 800 }}>
                      {isAr ? 'مثبت من حساب المعلم 🔒' : 'Locked to Assigned Grade 🔒'}
                    </span>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button
                  className="btn btn-primary banner-action-btn"
                  onClick={() => setActiveTab('builder')}
                  style={{ fontWeight: 800 }}
                >
                  <PlusCircle size={16} />
                  <span>{isAr ? 'تصميم امتحان جديد' : 'Build New Exam'}</span>
                </button>
              </div>
            </div>

            {/* Quick Metrics */}
            <div className="motivation-widget-grid">
              <div className="goal-card">
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                  {isAr ? 'الكتب والمناهج' : 'Textbooks & Curriculum'}
                </span>
                <div style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--primary-700)' }}>{books.length}</div>
                <span style={{ fontSize: '0.75rem', color: '#16A34A', fontWeight: 700 }}>
                  {isAr ? '✓ مفهرسة بالكامل' : '✓ Fully Indexed'}
                </span>
              </div>

              <div className="goal-card">
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                  {isAr ? 'الامتحانات المنشورة' : 'Published Exams'}
                </span>
                <div style={{ fontSize: '2rem', fontWeight: 900, color: '#D97706' }}>{exams.length}</div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {isAr ? 'متاحة بمؤقت زمني' : 'Timed & Active'}
                </span>
              </div>

              <div
                className="goal-card"
                onClick={() => setActiveTab('analytics')}
                style={{ cursor: 'pointer', transition: 'all 0.2s ease' }}
                title={isAr ? 'انقر لعرض أداء الطلاب' : 'Click to view student performance'}
              >
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                  {isAr ? 'أداء الطلاب' : 'Student Performance'}
                </span>
                <div style={{ fontSize: '2rem', fontWeight: 900, color: '#16A34A' }}>
                  {teacherAnalytics?.stats?.avg_score != null ? `${Math.round(teacherAnalytics.stats.avg_score)}%` : '86%'}
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--primary-600)', fontWeight: 700 }}>
                  {isAr ? '← انقر لعرض أداء الطلاب' : '← Click to view student performance'}
                </span>
              </div>
            </div>

            {/* Books & Exams Quick List */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
              <div className="card" style={{ padding: '1.5rem' }}>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 800, marginBottom: '1rem' }}>
                  {isAr ? 'الكتب المرفوعة حديثاً' : 'Recently Uploaded Books'}
                </h3>
                {books.slice(0, 3).map(b => (
                  <div key={b.id} style={{ padding: '0.75rem', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-md)', marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: '0.875rem' }}>{isAr ? b.title_ar : (b.title_en || b.title_ar)}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {isAr ? b.subject_name_ar : (b.subject_name_en || b.subject_name_ar)} • {b.school_type === 'عربي' ? (isAr ? '🏫 مدارس عربي' : 'Arabic') : b.school_type === 'لغات' ? (isAr ? '🌐 مدارس لغات' : 'Language') : (isAr ? '🤝 عام ولغات' : 'Common')}
                      </div>
                    </div>
                    <span className="badge badge-success" style={{ fontSize: '0.7rem' }}>
                      {isAr ? 'نشط' : 'Active'}
                    </span>
                  </div>
                ))}
              </div>

              <div className="card" style={{ padding: '1.5rem' }}>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 800, marginBottom: '1rem' }}>
                  {isAr ? 'الامتحانات النشطة' : 'Active Exams'}
                </h3>
                {exams.slice(0, 3).map(e => (
                  <div key={e.id} style={{ padding: '0.75rem', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-md)', marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: '0.875rem' }}>{e.title}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {e.duration_minutes} {isAr ? 'دقيقة' : 'min'} • {e.questions_count} {isAr ? 'أسئلة' : 'Questions'}
                      </div>
                    </div>
                    <span className={`badge ${e.is_published ? 'badge-success' : 'badge-warning'}`} style={{ fontSize: '0.7rem' }}>
                      {e.is_published ? (isAr ? 'منشور' : 'Published') : (isAr ? 'مسودة' : 'Draft')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* MODULE 2: CURRICULUM & BOOKS */}
        {activeTab === 'books' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 900, margin: 0 }}>
                  {isAr ? 'إدارة الكتب والمناهج المرفوعة' : 'Manage Curriculum Textbooks'}
                </h2>
              </div>
              {/* Term Switcher */}
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', background: '#F1F5F9', padding: '0.35rem', borderRadius: 'var(--radius-lg)', border: '1px solid #E2E8F0' }}>
                <button
                  type="button"
                  className={`btn btn-sm ${selectedTerm === 1 ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => {
                    setSelectedTerm(1);
                    loadTeacherData(undefined, 1);
                  }}
                  style={{ fontWeight: 800, padding: '0.4rem 1rem' }}
                >
                  📘 {isAr ? 'الفصل الدراسي الأول (الترم 1)' : 'Term 1'}
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${selectedTerm === 2 ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => {
                    setSelectedTerm(2);
                    loadTeacherData(undefined, 2);
                  }}
                  style={{ fontWeight: 800, padding: '0.4rem 1rem' }}
                >
                  📙 {isAr ? 'الفصل الدراسي الثاني (الترم 2)' : 'Term 2'}
                </button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.25rem' }}>
              {books.map(book => (
                <div key={book.id} className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <span className="badge badge-primary">
                        {isAr ? book.subject_name_ar : (book.subject_name_en || book.subject_name_ar)}
                      </span>
                      <span className="badge" style={{
                        fontSize: '0.72rem',
                        background: book.term === 2 ? '#FEF3C7' : '#E0E7FF',
                        color: book.term === 2 ? '#B45309' : '#3730A3',
                        border: `1px solid ${book.term === 2 ? '#FDE68A' : '#C7D2FE'}`,
                        fontWeight: 800
                      }}>
                        {book.term === 2 ? (isAr ? '📙 الترم الثاني' : 'Term 2') : (isAr ? '📘 الترم الأول' : 'Term 1')}
                      </span>
                    </div>
                    <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: '0 0 0.35rem' }}>
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
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                      {isAr ? 'الوحدات:' : 'Units:'} {book.chapters_count || book.chapters?.length || 1}
                    </div>
                    <button
                      className="btn btn-outline btn-sm"
                      onClick={() => handleOpenChaptersModal(book)}
                      style={{ width: '100%', marginBottom: '0.75rem', fontWeight: 700, fontSize: '0.8rem' }}
                    >
                      📖 {isAr ? 'إدارة وتعديل الوحدات' : 'Manage & Edit Units'}
                    </button>
                  </div>
                  <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.75rem', color: '#16A34A', fontWeight: 700 }}>
                      {isAr ? '✓ مفهرس بالكامل' : '✓ Fully Indexed'}
                    </span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      {new Date(book.created_at).toLocaleDateString(isAr ? 'ar-EG' : 'en-US')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* MODULE 4: EXAMS MANAGEMENT */}
        {activeTab === 'exams' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 900, margin: 0 }}>
                  {isAr ? 'بنك الاختبارات والامتحانات' : 'Exam & Quiz Bank'}
                </h2>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                  {isAr ? 'تصفح الاختبارات الجاهزة والمخصصة لصفوفك الدراسية' : 'Browse fixed and custom assessments for your grades'}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                <div style={{ display: 'inline-flex', background: '#F1F5F9', padding: '0.25rem', borderRadius: 'var(--radius-lg)', gap: '0.25rem', border: '1px solid var(--border-light)' }}>
                  <button
                    type="button"
                    className={`btn btn-sm ${examViewMode === 'all' ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setExamViewMode('all')}
                    style={{ fontWeight: 800, padding: '0.35rem 0.85rem' }}
                  >
                    {isAr ? `جميع الامتحانات (${exams.length})` : `All Exams (${exams.length})`}
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm ${examViewMode === 'hierarchy' ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setExamViewMode('hierarchy')}
                    style={{ fontWeight: 800, padding: '0.35rem 0.85rem' }}
                  >
                    🏛️ {isAr ? 'الامتحانات الثابتة (حسب المواد والوحدات)' : 'Fixed Exams (Subject & Units)'}
                  </button>
                </div>
                <button className="btn btn-primary" onClick={() => setActiveTab('builder')}>
                  <PlusCircle size={16} />
                  <span>{isAr ? 'تصميم امتحان جديد' : 'Build New Exam'}</span>
                </button>
              </div>
            </div>

            {examViewMode === 'hierarchy' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {/* Subject Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1rem' }}>
                  {fixedHierarchy.map(subj => {
                    const isSelected = (selectedFixedSubjId || fixedHierarchy[0]?.id) === subj.id;
                    return (
                      <div
                        key={subj.id}
                        onClick={() => setSelectedFixedSubjId(subj.id)}
                        className="card"
                        style={{
                          padding: '1.25rem',
                          cursor: 'pointer',
                          borderRadius: 'var(--radius-xl)',
                          border: isSelected ? '2px solid var(--primary)' : '1px solid var(--border-light)',
                          background: isSelected ? 'var(--primary-light, #EEF2FF)' : 'var(--bg-card)',
                          boxShadow: isSelected ? '0 4px 14px rgba(79, 70, 229, 0.15)' : 'none',
                          transition: 'all 0.2s ease'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '1.75rem' }}>{subj.icon || '📚'}</span>
                          <span className={`badge ${subj.total_exams > 0 ? 'badge-primary' : 'badge-secondary'}`}>
                            {subj.total_exams} {isAr ? 'امتحان ثابت' : 'Fixed Exams'}
                          </span>
                        </div>
                        <h3 style={{ fontSize: '1.1rem', fontWeight: 900, marginTop: '0.75rem', marginBottom: '0.25rem' }}>
                          {isAr ? subj.name_ar : (subj.name_en || subj.name_ar)}
                        </h3>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          {subj.units?.length || 0} {isAr ? 'وحدات دراسية' : 'Units'}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Selected Subject's Units & Exams */}
                {(() => {
                  const currentSubj = fixedHierarchy.find(s => s.id === (selectedFixedSubjId || fixedHierarchy[0]?.id));
                  if (!currentSubj) return null;

                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-light)', paddingBottom: '0.75rem' }}>
                        <h3 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span>{currentSubj.icon || '📚'}</span>
                          <span>{isAr ? `وحدات مادة ${currentSubj.name_ar}` : `Units of ${currentSubj.name_en || currentSubj.name_ar}`}</span>
                        </h3>
                        <span className="badge badge-primary">
                          {currentSubj.total_exams} {isAr ? 'امتحانات جاهزة' : 'Ready Exams'}
                        </span>
                      </div>

                      {currentSubj.units && currentSubj.units.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                          {currentSubj.units.map((unit: any) => (
                            <div key={unit.id} className="card" style={{ padding: '1.5rem', borderRadius: 'var(--radius-xl)' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                                <div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <span className="badge badge-secondary" style={{ fontWeight: 800 }}>
                                      {isAr ? `الوحدة ${unit.unit_number}` : `Unit ${unit.unit_number}`}
                                    </span>
                                    <h4 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0 }}>
                                      {unit.title}
                                    </h4>
                                  </div>
                                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                                    📖 {isAr ? `صفحات الكتاب: ${unit.start_page} إلى ${unit.end_page}` : `Book pages: ${unit.start_page} to ${unit.end_page}`}
                                  </div>
                                </div>
                                <span className="badge badge-success">
                                  {unit.exams?.length || 0} {isAr ? 'امتحان متاح' : 'Exams Available'}
                                </span>
                              </div>

                              {unit.exams && unit.exams.length > 0 ? (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
                                  {unit.exams.map((ex: any) => (
                                    <div
                                      key={ex.id}
                                      style={{
                                        border: '1px solid var(--border-light)',
                                        borderRadius: 'var(--radius-lg)',
                                        padding: '1.25rem',
                                        background: 'var(--bg-subtle)',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        justifyContent: 'space-between',
                                        gap: '0.75rem'
                                      }}
                                    >
                                      <div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                                          <span className="badge" style={{ background: '#e0e7ff', color: '#4338ca', fontWeight: 800, fontSize: '0.75rem' }}>
                                            🏛️ {isAr ? 'امتحان وزاري ثابت' : 'Fixed Exam'}
                                          </span>
                                          <span className={`badge ${ex.is_published ? 'badge-success' : 'badge-warning'}`}>
                                            {ex.is_published ? (isAr ? 'منشور' : 'Published') : (isAr ? 'مسودة' : 'Draft')}
                                          </span>
                                        </div>
                                        <h5 style={{ fontSize: '1rem', fontWeight: 800, margin: '0 0 0.4rem' }}>
                                          {ex.title}
                                        </h5>
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                          ⏱️ {ex.duration_minutes} {isAr ? 'دقيقة' : 'min'} • 📝 {ex.questions_count} {isAr ? 'سؤال' : 'questions'}
                                        </div>
                                      </div>

                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', borderTop: '1px solid var(--border-light)', paddingTop: '0.75rem' }}>
                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                          <button
                                            className="btn btn-primary btn-sm"
                                            onClick={() => handleOpenSubmissionsModal(ex)}
                                            style={{ flex: 1, fontWeight: 800, fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}
                                          >
                                            <Eye size={14} />
                                            <span>{isAr ? `إجابات الطلاب (${ex.submissions_count || 0})` : `Submissions (${ex.submissions_count || 0})`}</span>
                                          </button>
                                          <button
                                            className={`btn btn-sm ${ex.is_published ? 'btn-outline' : 'btn-secondary'}`}
                                            onClick={() => handleTogglePublish(ex.id, ex.is_published)}
                                            style={{ fontSize: '0.8rem' }}
                                          >
                                            {ex.is_published ? (isAr ? 'إلغاء' : 'Unpublish') : (isAr ? 'نشر' : 'Publish')}
                                          </button>
                                        </div>
                                        <button
                                          className={`btn btn-sm ${(ex.is_style_reference === 1 || ex.is_style_reference === true || ex.is_style_reference === '1') ? 'btn-outline' : 'btn-secondary'}`}
                                          onClick={() => handleToggleStyleReference(ex.id, ex.is_style_reference)}
                                          style={{ fontWeight: 700, fontSize: '0.75rem', width: '100%' }}
                                        >
                                          🎨 {(ex.is_style_reference === 1 || ex.is_style_reference === true || ex.is_style_reference === '1')
                                            ? (isAr ? 'إلغاء كمرجع أسلوب' : 'Remove Style Ref')
                                            : (isAr ? '«استخدم كمرجع لأسلوب الأسئلة»' : 'Use as Style Reference')}
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                  {isAr ? 'لا توجد امتحانات ثابتة مخصصة لهذه الوحدة حتى الآن.' : 'No fixed exams assigned to this unit yet.'}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                          {isAr ? 'لم يتم العثور على وحدات دراسية مسجلة لهذه المادة.' : 'No units found for this subject.'}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.25rem' }}>
                {exams.map(exam => (
                  <div key={exam.id} className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.4rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                          <span className="badge badge-primary">
                            {isAr ? exam.subject_name_ar : (exam.subject_name_en || exam.subject_name_ar)}
                          </span>
                          {(exam.is_style_reference === 1 || exam.is_style_reference === true || exam.is_style_reference === '1') && (
                            <span className="badge" style={{ background: '#e0e7ff', color: '#4338ca', fontWeight: 800, border: '1px solid #c7d2fe' }}>
                              🏛️ {isAr ? 'امتحان وزاري ثابت / مرجع أسلوب' : 'Fixed Ministerial Exam'}
                            </span>
                          )}
                        </div>
                        <span className={`badge ${exam.is_published ? 'badge-success' : 'badge-warning'}`}>
                          {exam.is_published ? (isAr ? 'منشور' : 'Published') : (isAr ? 'مسودة' : 'Draft')}
                        </span>
                      </div>
                      <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: '0 0 0.4rem' }}>{exam.title}</h3>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        ⏱️ {isAr ? 'المدة:' : 'Duration:'} {exam.duration_minutes} {isAr ? 'دقيقة' : 'min'} • 📝 {isAr ? 'الأسئلة:' : 'Questions:'} {exam.questions_count}
                      </div>
                    </div>

                    <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: '1rem', marginTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => handleOpenSubmissionsModal(exam)}
                          style={{ fontWeight: 800, fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                        >
                          <Eye size={15} />
                          <span>{isAr ? `إجابات وتسليمات الطلاب (${exam.submissions_count || 0})` : `Submissions (${exam.submissions_count || 0})`}</span>
                        </button>
                        <button
                          className={`btn btn-sm ${exam.is_published ? 'btn-outline' : 'btn-secondary'}`}
                          onClick={() => handleTogglePublish(exam.id, exam.is_published)}
                        >
                          {exam.is_published 
                            ? (isAr ? 'إلغاء النشر' : 'Unpublish') 
                            : (isAr ? 'نشر الاختبار للطلاب' : 'Publish to Students')}
                        </button>
                      </div>
                      <button
                        className={`btn btn-sm ${(exam.is_style_reference === 1 || exam.is_style_reference === true || exam.is_style_reference === '1') ? 'btn-outline' : 'btn-secondary'}`}
                        onClick={() => handleToggleStyleReference(exam.id, exam.is_style_reference)}
                        title={isAr ? 'تحديد أو إلغاء اعتماد هذا الامتحان كمرجع أسلوبي لتوليد الأسئلة' : 'Toggle style reference status for AI generation'}
                        style={{ fontWeight: 700, fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                      >
                        <span>🎨</span>
                        <span>
                          {(exam.is_style_reference === 1 || exam.is_style_reference === true || exam.is_style_reference === '1')
                            ? (isAr ? 'إلغاء كمرجع أسلوب' : 'Remove Style Ref')
                            : (isAr ? '«استخدم كمرجع لأسلوب الأسئلة»' : 'Use as Style Reference')}
                        </span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* MODULE 5: EXAM BUILDER STUDIO */}
        {activeTab === 'builder' && (
          <div style={{ maxWidth: '820px', margin: '0 auto', width: '100%' }}>
            <div className="card" style={{ padding: '2rem 1.75rem', borderRadius: 'var(--radius-xl)' }}>
              <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
                <span className="badge badge-primary" style={{ marginBottom: '0.5rem' }}>
                  {isAr ? 'استوديو تصميم الامتحانات' : 'Exam Builder Studio'}
                </span>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 900 }}>
                  {isAr ? 'إنشاء اختبار دوري بمؤقت للطلاب' : 'Create Timed Periodic Assessment'}
                </h2>
              </div>

              <form onSubmit={handleCreateExam}>
                <div className="form-group">
                  <label className="form-label">{isAr ? 'عنوان الامتحان' : 'Exam Title'}</label>
                  <input
                    type="text"
                    required
                    className="form-input"
                    value={newExamTitle}
                    onChange={e => setNewExamTitle(e.target.value)}
                    placeholder={isAr ? 'امتحان شهر أكتوبر في العلوم - الوحدة الأولى' : 'October Science Assessment - Unit 1'}
                  />
                </div>

                {/* Stage and Locked Prep 3 Grade Field */}
                <div className="responsive-form-grid-2">
                  <div className="form-group">
                    <label className="form-label" style={{ fontWeight: 800 }}>
                      {isAr ? 'المرحلة الدراسية (مثبتة للمنصة)' : 'Academic Stage (Locked)'}
                    </label>
                    <div style={{
                      padding: '0.65rem 0.9rem',
                      background: 'var(--bg-subtle)',
                      border: '1.5px solid var(--border-light)',
                      borderRadius: 'var(--radius-md)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontWeight: 800,
                      color: 'var(--primary-700)',
                      minHeight: '44px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span>🔒</span>
                        <span>{isAr ? 'المرحلة الإعدادية' : 'Preparatory Stage'}</span>
                      </div>
                      <span className="badge badge-primary" style={{ fontSize: '0.72rem' }}>
                        {isAr ? 'إعدادي' : 'Prep'}
                      </span>
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label" style={{ fontWeight: 800 }}>
                      {isAr ? 'الصف الدراسي (مثبت للطلاب)' : 'Target Grade (Locked to Prep 3)'}
                    </label>
                    <div style={{
                      padding: '0.65rem 0.9rem',
                      background: 'var(--bg-subtle)',
                      border: '1.5px solid var(--border-light)',
                      borderRadius: 'var(--radius-md)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontWeight: 800,
                      color: 'var(--primary-700)',
                      minHeight: '44px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span>🔒</span>
                        <span>{isAr ? 'الصف الثالث الإعدادي (Prep 3)' : '3rd Preparatory (Prep 3)'}</span>
                      </div>
                      <span className="badge badge-primary" style={{ fontSize: '0.7rem' }}>
                        {isAr ? 'مربوط بالطلاب مباشرة 🎯' : 'Direct Student Link 🎯'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="responsive-form-grid-2">
                  <div className="form-group">
                    <label className="form-label">{isAr ? 'مدة الامتحان (بالدقائق)' : 'Duration (Minutes)'}</label>
                    <input
                      type="number"
                      required
                      min="5"
                      className="form-input"
                      value={examDuration}
                      onChange={e => setExamDuration(e.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">{isAr ? 'المادة الدراسية (وفق تخصصك)' : 'Subject (Your Specialization)'}</label>
                    <div style={{
                      padding: '0.65rem 0.9rem',
                      background: 'var(--bg-subtle)',
                      border: '1.5px solid var(--border-light)',
                      borderRadius: 'var(--radius-md)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontWeight: 800,
                      color: 'var(--primary-700)'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span>🔒</span>
                        <span>
                          {(() => {
                            const matched = getMatchedSubject(subjects);
                            return matched ? (isAr ? matched.name_ar : (matched.name_en || matched.name_ar)) : (teacherSpecialization || (isAr ? 'مادتك' : 'Subject'));
                          })()}
                        </span>
                      </div>
                      <span className="badge badge-primary" style={{ fontSize: '0.7rem' }}>
                        {isAr ? 'مادتك' : 'Subject'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="form-group" style={{ marginTop: '0.75rem' }}>
                  <label className="form-label">{isAr ? 'نوع التعليم' : 'Education Type'}</label>
                  <select className="form-select" value={examSchoolType} onChange={e => setExamSchoolType(e.target.value as any)}>
                    <option value="كلاهما">{isAr ? '🤝 كلاهما (عربي ولغات) — متاح للجميع' : '🤝 Both (Public & Language)'}</option>
                    <option value="عربي">{isAr ? '🏫 مدارس عربي فقط' : '🏫 Arabic Schools Only'}</option>
                    <option value="لغات">{isAr ? '🌐 مدارس لغات فقط' : '🌐 Language Schools Only'}</option>
                  </select>
                  <div style={{ fontSize: '0.72rem', color: 'var(--primary-700)', marginTop: '0.25rem', fontWeight: 600 }}>
                    {isAr ? '🔗 سيظهر الاختبار حصرياً لطلاب الصف ونوع المدرسة المحددين.' : '🔗 Strictly linked only to students matching this grade & school type.'}
                  </div>
                </div>

                {/* Style Reference Checkbox */}
                <div 
                  style={{
                    marginTop: '1rem',
                    padding: '1rem 1.25rem',
                    borderRadius: 'var(--radius-lg)',
                    background: isStyleReference ? 'rgba(79, 70, 229, 0.08)' : 'var(--bg-subtle)',
                    border: isStyleReference ? '1.5px solid var(--primary-500, #4f46e5)' : '1px solid var(--border-light)',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '0.75rem',
                    cursor: 'pointer'
                  }} 
                  onClick={() => setIsStyleReference(!isStyleReference)}
                >
                  <input
                    type="checkbox"
                    id="is-style-ref-checkbox"
                    checked={isStyleReference}
                    onChange={e => setIsStyleReference(e.target.checked)}
                    onClick={e => e.stopPropagation()}
                    style={{ marginTop: '0.25rem', width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                  <div style={{ flex: 1 }}>
                    <label 
                      htmlFor="is-style-ref-checkbox" 
                      style={{ fontWeight: 800, fontSize: '0.95rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', margin: 0, color: isStyleReference ? 'var(--primary-700, #4338ca)' : 'inherit' }}
                      onClick={e => e.stopPropagation()}
                    >
                      <span>🎨</span>
                      <span>{isAr ? '«استخدم كمرجع لأسلوب الأسئلة»' : '«Use as Style Reference for Questions»'}</span>
                    </label>
                    <p style={{ margin: '0.25rem 0 0', fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                      {isAr 
                        ? 'عند تفعيل هذا الخيار، سيتم اعتماد نمط وصياغة أسئلة هذا الاختبار كنموذج أسلوبي للذكاء الاصطناعي عند توليد اختبارات جديدة لنفس مادتك وصفك الدراسي (دون نسخ الأسئلة نصياً).' 
                        : 'When enabled, this exam\'s question phrasing style and structure will serve as an AI reference pattern for future quizzes in your subject & grade (without duplicating questions).'}
                    </p>
                  </div>
                </div>

                {/* Questions Composer */}
                <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--border-light)', paddingTop: '1.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0 }}>
                      {isAr ? `أسئلة الامتحان (${examQuestions.length})` : `Exam Questions (${examQuestions.length})`}
                    </h3>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={() => setExamQuestions([...examQuestions, {
                        question_text: '',
                        points: 1,
                        page_reference: '',
                        options: [
                          { option_text: '', is_correct: true },
                          { option_text: '', is_correct: false },
                          { option_text: '', is_correct: false },
                          { option_text: '', is_correct: false }
                        ]
                      }])}
                    >
                      {isAr ? '+ إضافة سؤال' : '+ Add Question'}
                    </button>
                  </div>

                  {examQuestions.map((q, qIndex) => (
                    <div key={qIndex} style={{ padding: '1.25rem', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-lg)', marginBottom: '1rem', border: '1px solid var(--border-light)' }}>
                      <div className="responsive-form-grid-2" style={{ alignItems: 'flex-start' }}>
                        <div className="form-group" style={{ flex: 2 }}>
                          <label className="form-label" style={{ fontWeight: 800 }}>
                            {isAr ? `نص السؤال #${qIndex + 1}` : `Question Text #${qIndex + 1}`}
                          </label>
                          <input
                            type="text"
                            required
                            className="form-input"
                            value={q.question_text}
                            onChange={e => {
                              const updated = [...examQuestions];
                              updated[qIndex].question_text = e.target.value;
                              setExamQuestions(updated);
                            }}
                            placeholder={isAr ? 'مثال: وحدة قياس الكثافة هي...' : 'e.g., The unit of measurement for density is...'}
                          />
                        </div>

                        <div className="form-group" style={{ flex: 1 }}>
                          <label className="form-label" style={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            <span>📖</span>
                            <span>{isAr ? 'رقم الصفحة بالكتاب (مرجع الإجابة):' : 'Book Page (Answer Reference):'}</span>
                          </label>
                          <input
                            type="text"
                            className="form-input"
                            value={q.page_reference || ''}
                            onChange={e => {
                              const updated = [...examQuestions];
                              updated[qIndex].page_reference = e.target.value;
                              setExamQuestions(updated);
                            }}
                            placeholder={isAr ? 'مثال: 5 أو صفحة 5' : 'e.g. 5 or Page 5'}
                          />
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                            {isAr ? '💡 ستظهر للطالب بجوار الإجابة الصحيحة عند مراجعة الامتحان.' : '💡 Shown to the student next to the correct answer.'}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.75rem' }}>
                        <label className="form-label" style={{ fontSize: '0.8rem' }}>
                          {isAr ? 'الخيارات (حدد الإجابة الصحيحة):' : 'Options (Mark the correct answer):'}
                        </label>
                        {q.options.map((opt: any, optIndex: number) => (
                          <div key={optIndex} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <input
                              type="radio"
                              name={`correct_${qIndex}`}
                              checked={opt.is_correct}
                              onChange={() => {
                                const updated = [...examQuestions];
                                updated[qIndex].options.forEach((o: any, i: number) => {
                                  o.is_correct = i === optIndex;
                                });
                                setExamQuestions(updated);
                              }}
                            />
                            <input
                              type="text"
                              required
                              className="form-input"
                              value={opt.option_text}
                              onChange={e => {
                                const updated = [...examQuestions];
                                updated[qIndex].options[optIndex].option_text = e.target.value;
                                setExamQuestions(updated);
                              }}
                              placeholder={isAr ? `الخيار ${optIndex + 1}` : `Option ${optIndex + 1}`}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  type="submit"
                  className="btn btn-primary btn-lg"
                  disabled={isCreatingExam}
                  style={{ width: '100%', marginTop: '1.5rem', fontWeight: 800 }}
                >
                  {isCreatingExam 
                    ? (isAr ? 'جاري الحفظ والنشر...' : 'Saving & Publishing...') 
                    : (isAr ? 'حفظ ونشر الامتحان للطلاب 🚀' : 'Save & Publish Exam 🚀')}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* MODULE 6: STUDENT PERFORMANCE & ANALYTICS */}
        {activeTab === 'analytics' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <h2 style={{ fontSize: '1.6rem', fontWeight: 900, margin: 0, color: 'var(--text-title)' }}>
                  {isAr ? 'أداء الطلاب' : 'Student Performance'}
                </h2>
                <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                  {isAr 
                    ? `تحليلات تفصيلية لمستوى استيعاب وتقييمات الطلاب لمادة ${teacherAnalytics?.subject?.name_ar || teacherSpecialization || 'المرحلة الدراسية'}` 
                    : 'Detailed analytics on student comprehension and assessment mastery for your subject'}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <span className="badge badge-primary" style={{ padding: '0.4rem 0.85rem', fontSize: '0.8rem', fontWeight: 700 }}>
                  {assignedGradeLabel}
                </span>
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => loadTeacherData()}
                  style={{ fontWeight: 700 }}
                  title={isAr ? 'تحديث البيانات' : 'Refresh Data'}
                >
                  🔄 {isAr ? 'تحديث التحليلات' : 'Refresh'}
                </button>
              </div>
            </div>

            {(() => {
              const matchedSubj = subjects.find(s => s.id === selectedSubjectId);
              const activeSubjectName = matchedSubj?.name_ar || teacherSpecialization || 'اللغة العربية';

              const displayChapters = (teacherAnalytics?.chapters_mastery || []).filter((ch: any) => 
                isChapterMatchingSubject(ch, activeSubjectName)
              );

              const hasCompletedAttempts = (teacherAnalytics?.stats?.total_attempts ?? 0) > 0;
              const assessedChapters = displayChapters.filter((ch: any) => (ch.attempts_count || 0) > 0);
              const sortedAssessedChapters = [...assessedChapters].sort((a, b) => b.mastery_percentage - a.mastery_percentage);
              const topMasteredChapter = sortedAssessedChapters[0] || null;
              const lowestMasteredChapter = sortedAssessedChapters.length > 1 ? sortedAssessedChapters[sortedAssessedChapters.length - 1] : null;

              const displayAttempts = (teacherAnalytics?.recent_attempts || []).filter((att: any) => {
                const title = (att.exam_title || '').toLowerCase();
                if (activeSubjectName.includes('عرب')) {
                  if (title.includes('english') || title.includes('social') || title.includes('math') || title.includes('science') ||
                      title.includes('مادة وخواصها') || title.includes('تركيب المادة') || title.includes('التركيب الذري') || 
                      title.includes('الجغرافيا') || title.includes('حول المدينة')) {
                    return false;
                  }
                }
                return true;
              });

              return (
                <>
                  {/* Quick Metrics Grid */}
                  <div className="motivation-widget-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
                    <div className="goal-card">
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                          {isAr ? 'الطلاب المسجلون' : 'Enrolled Students'}
                        </span>
                        <Users size={16} color="var(--primary-600)" />
                      </div>
                      <div style={{ fontSize: '1.9rem', fontWeight: 900, color: 'var(--primary-800)' }}>
                        {teacherAnalytics?.stats?.total_students ?? 0}
                      </div>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        {isAr ? `في ${assignedGradeLabel}` : 'In assigned grade'}
                      </span>
                    </div>

                    <div className="goal-card">
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                          {isAr ? 'متوسط نسبة الإتقان' : 'Average Mastery'}
                        </span>
                        <TrendingUp size={16} color={hasCompletedAttempts ? '#16A34A' : 'var(--text-muted)'} />
                      </div>
                      <div style={{ fontSize: '1.9rem', fontWeight: 900, color: hasCompletedAttempts ? '#16A34A' : 'var(--text-muted)' }}>
                        {hasCompletedAttempts && teacherAnalytics?.stats?.avg_score != null ? `${Math.round(teacherAnalytics.stats.avg_score)}%` : '--'}
                      </div>
                      <span style={{ fontSize: '0.72rem', color: hasCompletedAttempts ? '#16A34A' : 'var(--text-muted)', fontWeight: 700 }}>
                        {hasCompletedAttempts 
                          ? (isAr ? '✓ مؤشر استيعاب تقييمي' : '✓ Assessment metric')
                          : (isAr ? 'لا توجد تقييمات مكتملة حتى الآن' : 'No completed assessments')}
                      </span>
                    </div>

                    <div className="goal-card">
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                          {isAr ? 'التقييمات المكتملة' : 'Completed Quizzes'}
                        </span>
                        <FileText size={16} color="var(--primary-600)" />
                      </div>
                      <div style={{ fontSize: '1.9rem', fontWeight: 900, color: 'var(--primary-700)' }}>
                        {teacherAnalytics?.stats?.total_attempts ?? 0}
                      </div>
                      <span style={{ fontSize: '0.72rem', color: hasCompletedAttempts ? '#16A34A' : 'var(--text-muted)', fontWeight: 700 }}>
                        {hasCompletedAttempts 
                          ? (isAr ? '✓ تفاعل ونشاط مستمر' : '✓ Active participation')
                          : (isAr ? 'لا توجد تقييمات مكتملة حتى الآن' : 'No completed assessments')}
                      </span>
                    </div>

                    <div className="goal-card">
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                          {isAr ? 'أعلى وحدة استيعاباً' : 'Top Mastered Unit'}
                        </span>
                        <Award size={16} color={topMasteredChapter ? '#16A34A' : 'var(--text-muted)'} />
                      </div>
                      <div style={{ fontSize: '1.05rem', fontWeight: 900, color: topMasteredChapter ? '#16A34A' : 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {topMasteredChapter?.title_ar || (isAr ? 'لا توجد تقييمات مكتملة حتى الآن' : 'No completed assessments')}
                      </div>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        {topMasteredChapter 
                          ? (isAr ? `نسبة إتقان ${topMasteredChapter.mastery_percentage}%` : `${topMasteredChapter.mastery_percentage}% mastery rate`)
                          : (isAr ? 'في انتظار حل الطلاب للاختبارات' : 'Pending student attempts')}
                      </span>
                    </div>

                    <div className="goal-card">
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                          {isAr ? 'وحدة تحتاج تعزيز' : 'Needs Reinforcement'}
                        </span>
                        <AlertTriangle size={16} color={lowestMasteredChapter ? '#DC2626' : 'var(--text-muted)'} />
                      </div>
                      <div style={{ fontSize: '1.05rem', fontWeight: 900, color: lowestMasteredChapter ? '#DC2626' : 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {lowestMasteredChapter?.title_ar || (isAr ? 'لا توجد تقييمات مكتملة حتى الآن' : 'No completed assessments')}
                      </div>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        {lowestMasteredChapter 
                          ? (isAr ? `يوصى بتكثيف التطبيقات (${lowestMasteredChapter.mastery_percentage}%)` : `Review recommended (${lowestMasteredChapter.mastery_percentage}%)`)
                          : (isAr ? 'في انتظار حل الطلاب للاختبارات' : 'Pending student attempts')}
                      </span>
                    </div>
                  </div>

                {/* Chapter Mastery Breakdown Grid */}
                <div className="card" style={{ padding: '1.5rem', borderRadius: 'var(--radius-xl)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-light)', paddingBottom: '0.75rem' }}>
                    <div>
                      <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0 }}>
                        {isAr ? `مستويات إتقان وحدات المنهج الدراسي (${activeSubjectName})` : `Curriculum Unit Mastery Levels (${activeSubjectName})`}
                      </h3>
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        {isAr ? 'نسب استيعاب الطلاب لكل وحدة من واقع إجابات الامتحانات والتقييمات لهذه المادة حصراً' : 'Student mastery rates per unit strictly for this subject'}
                      </span>
                    </div>
                    <span className="badge badge-secondary" style={{ fontSize: '0.75rem' }}>
                      {isAr ? 'محدث تلقائياً' : 'Live Aggregate'}
                    </span>
                  </div>

                  {/* Empty state alert when no attempts completed */}
                  {!hasCompletedAttempts && displayChapters.length > 0 && (
                    <div style={{ padding: '0.85rem 1.25rem', background: '#FEF3C7', border: '1px solid #F59E0B', borderRadius: 'var(--radius-md)', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#92400E' }}>
                      <AlertTriangle size={18} style={{ flexShrink: 0 }} />
                      <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>
                        {isAr 
                          ? 'لا توجد تقييمات مكتملة حتى الآن — الوحدات الدراسية مسجلة أدناه وفي انتظار أولى إجابات الطلاب لاحتساب نسب الإتقان الفعلية.' 
                          : 'No completed assessments yet — units below are part of the curriculum and awaiting first student submissions.'}
                      </span>
                    </div>
                  )}

                  {displayChapters.length > 0 ? (
                    displayChapters.map((ch: any) => {
                      const chAttempts = Number(ch.attempts_count || 0);
                      const hasChAttempts = chAttempts > 0;
                      return (
                        <div 
                          key={ch.id || ch.chapter_number} 
                          style={{ 
                            padding: '1rem', 
                            borderRadius: 'var(--radius-md)', 
                            background: 'var(--bg-subtle)', 
                            marginBottom: '0.75rem',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.5rem'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                              <span style={{ 
                                width: '26px', 
                                height: '26px', 
                                borderRadius: '50%', 
                                background: 'var(--primary-100)', 
                                color: 'var(--primary-800)', 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'center', 
                                fontWeight: 800, 
                                fontSize: '0.75rem' 
                              }}>
                                {ch.chapter_number}
                              </span>
                              <strong style={{ fontSize: '0.92rem' }}>{ch.title_ar}</strong>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                {isAr ? `${chAttempts} تقييم محلول` : `${chAttempts} solved assessments`}
                              </span>
                              <span 
                                className={`badge ${!hasChAttempts ? 'badge-secondary' : ch.mastery_percentage >= 80 ? 'badge-success' : ch.mastery_percentage >= 50 ? 'badge-warning' : 'badge-danger'}`}
                                style={{ fontSize: '0.75rem', fontWeight: 700 }}
                              >
                                {!hasChAttempts 
                                  ? (isAr ? 'لم يُقيّم بعد' : 'Not Assessed') 
                                  : ch.mastery_percentage >= 80 ? (isAr ? 'متقن 🌟' : 'Mastered 🌟') : ch.mastery_percentage >= 50 ? (isAr ? 'قيد التطوير 📈' : 'Developing 📈') : (isAr ? 'بحاجة لدعم ⚠️' : 'Needs Support ⚠️')}
                              </span>
                              <strong style={{ fontSize: '0.95rem', minWidth: '42px', textAlign: isAr ? 'left' : 'right', color: hasChAttempts ? 'inherit' : 'var(--text-muted)' }}>
                                {hasChAttempts ? `${ch.mastery_percentage}%` : '--'}
                              </strong>
                            </div>
                          </div>

                          {/* Progress Bar */}
                          <div style={{ width: '100%', height: '8px', background: '#E2E8F0', borderRadius: '4px', overflow: 'hidden' }}>
                            <div 
                              style={{ 
                                width: hasChAttempts ? `${Math.min(ch.mastery_percentage, 100)}%` : '0%', 
                                height: '100%', 
                                background: ch.mastery_percentage >= 80 ? 'linear-gradient(90deg, #10B981, #059669)' : ch.mastery_percentage >= 50 ? 'linear-gradient(90deg, #F59E0B, #D97706)' : 'linear-gradient(90deg, #EF4444, #DC2626)',
                                borderRadius: '4px',
                                transition: 'width 0.4s ease'
                              }} 
                            />
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--text-muted)' }}>
                      <BookOpen size={36} style={{ opacity: 0.35, marginBottom: '0.6rem' }} />
                      <p style={{ fontWeight: 800, margin: 0, fontSize: '0.95rem' }}>
                        {isAr ? 'لا توجد وحدات مضافة بعد لهذه المادة' : 'No curriculum units found for this subject'}
                      </p>
                      <p style={{ fontSize: '0.8rem', marginTop: '0.3rem' }}>
                        {isAr ? 'قم برفع كتاب المادة لربط المنهج وتحليل إتقان الطلاب تلقائياً' : 'Upload textbook to track live mastery'}
                      </p>
                    </div>
                  )}
                </div>

                {/* Students Attempts & Performance Table */}
                <div className="card" style={{ padding: '1.5rem', borderRadius: 'var(--radius-xl)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--border-light)', paddingBottom: '0.75rem' }}>
                    <div>
                      <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0 }}>
                        {isAr ? `سجل تقييمات ومحاولات الطلاب في مادة (${activeSubjectName})` : `Student Assessment Records (${activeSubjectName})`}
                      </h3>
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        {isAr ? 'تفاصيل الدرجات ونسب الإتقان المسجلة للطلاب في هذه المادة فقط' : 'Individual student grades, scores, and mastery percentages for this subject only'}
                      </span>
                    </div>
                    <span className="badge badge-primary" style={{ fontSize: '0.75rem' }}>
                      {isAr 
                        ? `${displayAttempts.length} سجل متوفر` 
                        : `${displayAttempts.length} records`}
                    </span>
                  </div>

                  {/* Search Bar */}
                  <div style={{ position: 'relative', marginBottom: '1.25rem' }}>
                    <Search
                      size={17}
                      style={{
                        position: 'absolute',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        [isAr ? 'right' : 'left']: '0.9rem',
                        color: 'var(--text-muted)',
                        pointerEvents: 'none'
                      }}
                    />
                    <input
                      type="text"
                      className="form-input"
                      value={studentSearchQuery}
                      onChange={e => setStudentSearchQuery(e.target.value)}
                      placeholder={isAr ? 'ابحث باسم الطالب أو كود الطالب...' : 'Search by student name or code...'}
                      style={{
                        [isAr ? 'paddingRight' : 'paddingLeft']: '2.6rem',
                        [isAr ? 'paddingLeft' : 'paddingRight']: studentSearchQuery ? '2.6rem' : '1rem',
                        fontWeight: 600,
                        borderRadius: 'var(--radius-lg)',
                        border: '1.5px solid var(--border-light)',
                        background: 'var(--bg-subtle)'
                      }}
                    />
                    {studentSearchQuery && (
                      <button
                        onClick={() => setStudentSearchQuery('')}
                        style={{
                          position: 'absolute',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          [isAr ? 'left' : 'right']: '0.9rem',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: 'var(--text-muted)',
                          fontSize: '1rem',
                          lineHeight: 1,
                          padding: 0
                        }}
                        title={isAr ? 'مسح البحث' : 'Clear search'}
                      >✕</button>
                    )}
                  </div>

                  {(() => {
                    const allAttempts = displayAttempts;
                    const q = studentSearchQuery.trim().toLowerCase();
                    const filtered = q
                      ? allAttempts.filter((att: any) =>
                          (att.student_name || '').toLowerCase().includes(q) ||
                          (att.student_code || '').toLowerCase().includes(q) ||
                          (att.super_id || '').toLowerCase().includes(q)
                        )
                      : allAttempts;

                    if (allAttempts.length === 0) {
                      return (
                        <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--text-muted)' }}>
                          <Users size={36} style={{ opacity: 0.35, marginBottom: '0.6rem' }} />
                          <p style={{ fontWeight: 800, margin: 0, fontSize: '0.95rem' }}>
                            {isAr ? 'لا توجد تقييمات مكتملة حتى الآن' : 'No completed assessments yet'}
                          </p>
                          <p style={{ fontSize: '0.8rem', marginTop: '0.3rem' }}>
                            {isAr ? 'بمجرد أن يخوض الطلاب تقييمات المادة ستظهر سجلاتهم ودرجاتهم هنا' : 'Student scores and submissions will appear here once submitted'}
                          </p>
                        </div>
                      );
                    }

                    if (filtered.length === 0) {
                      return (
                        <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-muted)' }}>
                          <Search size={32} style={{ opacity: 0.3, marginBottom: '0.5rem' }} />
                          <p style={{ fontWeight: 700, margin: 0 }}>
                            {isAr ? 'لا توجد نتائج مطابقة للبحث' : 'No matching records found'}
                          </p>
                          <p style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
                            {isAr ? 'جرب اسم مختلف أو كود الطالب' : 'Try a different name or student code'}
                          </p>
                        </div>
                      );
                    }

                return filtered.map((att: any) => (
                <div 
                  key={att.id} 
                  style={{ 
                    padding: '0.9rem 1rem', 
                    borderRadius: 'var(--radius-md)', 
                    background: 'var(--bg-subtle)', 
                    marginBottom: '0.6rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '0.75rem'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: '220px' }}>
                    <div style={{ 
                      width: '38px', 
                      height: '38px', 
                      borderRadius: '50%', 
                      background: 'linear-gradient(135deg, #3B82F6, #1D4ED8)', 
                      color: '#FFFFFF', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      fontWeight: 800, 
                      fontSize: '0.9rem',
                      flexShrink: 0
                    }}>
                      {att.student_name?.charAt(0) || 'ط'}
                    </div>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--text-title)' }}>
                        {att.student_name}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {att.exam_title}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ textAlign: isAr ? 'left' : 'right' }}>
                      <div style={{ fontWeight: 900, fontSize: '0.95rem', color: att.percentage >= 80 ? '#16A34A' : att.percentage >= 50 ? '#D97706' : '#DC2626' }}>
                        {att.percentage}% ({att.score}/{att.total_points})
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <Clock size={11} />
                        <span>{att.completed_at ? new Date(att.completed_at).toLocaleDateString(isAr ? 'ar-EG' : 'en-US') : ''}</span>
                      </div>
                    </div>

                    <span 
                      className={`badge ${att.percentage >= 80 ? 'badge-success' : att.percentage >= 50 ? 'badge-warning' : 'badge-danger'}`}
                      style={{ fontSize: '0.75rem', fontWeight: 700, padding: '0.35rem 0.65rem' }}
                    >
                      {att.percentage >= 80 ? (isAr ? 'إتقان تام' : 'Mastered') : att.percentage >= 50 ? (isAr ? 'مستوى متوسط' : 'Developing') : (isAr ? 'يحتاج دعم' : 'Needs Support')}
                    </span>

                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={() => handleOpenReviewModal(att.attempt_id || att.id, att.attempt_type === 'AI_EVALUATION')}
                      style={{
                        fontWeight: 800,
                        fontSize: '0.78rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        borderColor: 'var(--primary-300)',
                        color: 'var(--primary-700)',
                        background: '#FFFFFF',
                        cursor: 'pointer'
                      }}
                    >
                      <Eye size={14} />
                      <span>{isAr ? 'مراجعة الإجابات' : 'Review Answers'}</span>
                    </button>
                  </div>
                </div>
              ));
            })()}

            </div>
          </>
        );
      })()}
    </div>
  )}

      </main>

      {/* =========================================================
          MOBILE BOTTOM NAVIGATION (TEACHER)
          ========================================================= */}
      <nav className="mobile-bottom-nav">
        <button
          className={`mobile-nav-btn ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          <LayoutDashboard size={18} />
          <span>{isAr ? 'الرئيسية' : 'Home'}</span>
        </button>

        <button
          className={`mobile-nav-btn ${activeTab === 'books' ? 'active' : ''}`}
          onClick={() => setActiveTab('books')}
        >
          <BookOpen size={18} />
          <span>{isAr ? 'المناهج' : 'Books'}</span>
        </button>



        <button
          className={`mobile-nav-btn ${activeTab === 'exams' ? 'active' : ''}`}
          onClick={() => setActiveTab('exams')}
        >
          <FileText size={18} />
          <span>{isAr ? 'الامتحانات' : 'Exams'}</span>
        </button>

        <button
          className={`mobile-nav-btn ${activeTab === 'analytics' ? 'active' : ''}`}
          onClick={() => setActiveTab('analytics')}
        >
          <BarChart2 size={18} />
          <span>{isAr ? 'الأداء' : 'Analytics'}</span>
        </button>
      </nav>

        {/* =========================================================
            CHAPTER MANAGEMENT MODAL
            ========================================================= */}
        {selectedBookForChapters && (
          <div style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem'
          }}>
            <div className="card" style={{
              maxWidth: '750px',
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: '2rem',
              borderRadius: 'var(--radius-xl)',
              boxShadow: 'var(--shadow-xl)',
              position: 'relative'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-light)', paddingBottom: '1rem' }}>
                <div>
                  <h3 style={{ fontSize: '1.3rem', fontWeight: 900, margin: 0 }}>
                    {isAr ? `وحدات كتاب: ${selectedBookForChapters.title_ar}` : `Units of: ${selectedBookForChapters.title_en || selectedBookForChapters.title_ar}`}
                  </h3>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {isAr ? 'تقسيم الكتاب لوحدات دراسية مع توزيع الفقرات التعليمية' : 'Manage textbook units & educational chunk partitions'}
                  </span>
                </div>
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => setSelectedBookForChapters(null)}
                  style={{ borderRadius: '50%', width: '36px', height: '36px', padding: 0 }}
                >
                  ✕
                </button>
              </div>

              {/* Actions Toolbar */}
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => setShowAddChapterForm(!showAddChapterForm)}
                  style={{ fontWeight: 800 }}
                >
                  {showAddChapterForm ? (isAr ? 'إلغاء الإضافة' : 'Cancel') : (isAr ? '➕ إضافة وحدة يدوياً' : '➕ Add Unit Manually')}
                </button>
                <button
                  className="btn btn-outline btn-sm"
                  disabled={isDetectingChapters}
                  onClick={() => handleAutoDetectChapters(selectedBookForChapters.id)}
                  style={{ fontWeight: 800, background: '#EEF2FF', borderColor: '#818CF8', color: '#4F46E5' }}
                >
                  {isDetectingChapters ? (isAr ? 'جاري الفحص الذكي...' : 'Detecting...') : (isAr ? '✨ استخراج الوحدات بالذكاء الاصطناعي' : '✨ AI Auto-Detect Units')}
                </button>
              </div>

              {/* Add Chapter Inline Form */}
              {showAddChapterForm && (
                <div style={{ background: 'var(--bg-subtle)', padding: '1.25rem', borderRadius: 'var(--radius-lg)', marginBottom: '1.5rem', border: '1px solid var(--border-light)' }}>
                  <h4 style={{ fontWeight: 800, fontSize: '0.95rem', margin: '0 0 1rem' }}>
                    {isAr ? 'إضافة وحدة دراسية جديدة للكتاب:' : 'Add New Unit to Textbook:'}
                  </h4>
                  <form onSubmit={handleAddChapter}>
                    <div className="responsive-form-grid-2" style={{ gap: '0.75rem', marginBottom: '0.75rem' }}>
                      <div>
                        <label className="form-label" style={{ fontSize: '0.78rem' }}>{isAr ? 'رقم الوحدة' : 'Unit #'}</label>
                        <input
                          type="number"
                          required
                          min="1"
                          className="form-input"
                          value={newChNumber}
                          onChange={e => setNewChNumber(parseInt(e.target.value, 10) || 1)}
                        />
                      </div>
                      <div>
                        <label className="form-label" style={{ fontSize: '0.78rem' }}>{isAr ? 'عنوان الوحدة (بالعربية)' : 'Title (Arabic)'}</label>
                        <input
                          type="text"
                          required
                          className="form-input"
                          value={newChTitleAr}
                          onChange={e => setNewChTitleAr(e.target.value)}
                          placeholder={isAr ? 'الوحدة الثانية: الجبر' : 'Unit 2: Algebra'}
                        />
                      </div>
                    </div>
                    <div className="responsive-form-grid-2" style={{ gap: '0.75rem', marginBottom: '0.75rem' }}>
                      <div>
                        <label className="form-label" style={{ fontSize: '0.78rem' }}>{isAr ? 'عنوان الوحدة (بالإنجليزية)' : 'Title (English)'}</label>
                        <input
                          type="text"
                          className="form-input"
                          value={newChTitleEn}
                          onChange={e => setNewChTitleEn(e.target.value)}
                          placeholder="Unit 2: Algebra & Expressions"
                        />
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <div style={{ flex: 1 }}>
                          <label className="form-label" style={{ fontSize: '0.78rem' }}>{isAr ? 'من ص' : 'From p.'}</label>
                          <input
                            type="number"
                            min="1"
                            className="form-input"
                            value={newChStartPage}
                            onChange={e => setNewChStartPage(parseInt(e.target.value, 10) || 1)}
                          />
                        </div>
                        <div style={{ flex: 1 }}>
                          <label className="form-label" style={{ fontSize: '0.78rem' }}>{isAr ? 'إلى ص' : 'To p.'}</label>
                          <input
                            type="number"
                            min="1"
                            className="form-input"
                            value={newChEndPage}
                            onChange={e => setNewChEndPage(parseInt(e.target.value, 10) || 1)}
                          />
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                      <button type="button" className="btn btn-outline btn-sm" onClick={() => setShowAddChapterForm(false)}>
                        {isAr ? 'إلغاء' : 'Cancel'}
                      </button>
                      <button type="submit" className="btn btn-primary btn-sm" style={{ fontWeight: 800 }}>
                        {isAr ? 'حفظ الوحدة' : 'Save Unit'}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Chapters List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {isLoadingChapters ? (
                  <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                    {isAr ? 'جاري تحميل الوحدات...' : 'Loading units...'}
                  </div>
                ) : bookChaptersList.length > 0 ? (
                  bookChaptersList.map(ch => (
                    <div
                      key={ch.id}
                      style={{
                        padding: '1rem',
                        background: 'var(--bg-subtle)',
                        borderRadius: 'var(--radius-lg)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '0.5rem'
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                          <span className="badge badge-primary">
                            {isAr ? `الوحدة #${ch.chapter_number}` : `Unit #${ch.chapter_number}`}
                          </span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            📖 {isAr ? `الصفحات: ${ch.start_page} - ${ch.end_page}` : `Pages: ${ch.start_page} - ${ch.end_page}`}
                          </span>
                          <span className="badge" style={{ background: '#F1F5F9', color: '#475569', fontSize: '0.7rem' }}>
                            {isAr ? `${ch.chunks_count || 0} مقطع منهجي مفهرس` : `${ch.chunks_count || 0} Indexed Sections`}
                          </span>
                        </div>
                        <h4 style={{ fontWeight: 800, fontSize: '0.95rem', margin: 0, color: 'var(--text-title)' }}>
                          {isAr ? ch.title_ar : (ch.title_en || ch.title_ar)}
                        </h4>
                      </div>
                      <button
                        className="btn btn-outline btn-sm"
                        onClick={() => handleDeleteChapter(ch.id)}
                        style={{ color: '#DC2626', borderColor: '#FECDD3', background: '#FFF1F2', fontSize: '0.75rem' }}
                      >
                        {isAr ? 'حذف' : 'Delete'}
                      </button>
                    </div>
                  ))
                ) : (
                  <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                    {isAr ? 'لا توجد وحدات مضافة بعد. انقر على "استخراج الوحدات بالذكاء الاصطناعي" أعلاه.' : 'No units yet. Click "AI Auto-Detect Units" above.'}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* =========================================================
            STUDENT SUBMISSIONS LIST MODAL
            ========================================================= */}
        {isSubmissionsModalOpen && examForSubmissions && (
          <div style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem'
          }}>
            <div className="card" style={{
              maxWidth: '800px',
              width: '100%',
              maxHeight: '88vh',
              overflowY: 'auto',
              padding: '2rem',
              borderRadius: 'var(--radius-xl)',
              boxShadow: 'var(--shadow-xl)',
              position: 'relative'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-light)', paddingBottom: '1rem' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                    <span className="badge badge-primary">
                      {isAr ? 'تسليمات وإجابات الطلاب' : 'Student Submissions'}
                    </span>
                    <span className="badge badge-secondary">
                      {isAr ? `${submissionsList.length} طالب أنجز الاختبار` : `${submissionsList.length} completed`}
                    </span>
                  </div>
                  <h3 style={{ fontSize: '1.3rem', fontWeight: 900, margin: 0 }}>
                    {examForSubmissions.title}
                  </h3>
                </div>
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => { setIsSubmissionsModalOpen(false); setExamForSubmissions(null); }}
                  style={{ borderRadius: '50%', width: '36px', height: '36px', padding: 0 }}
                >
                  ✕
                </button>
              </div>

              {isLoadingSubmissions ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                  <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>⏳</div>
                  <div>{isAr ? 'جاري جلب إجابات وتسليمات الطلاب...' : 'Loading student submissions...'}</div>
                </div>
              ) : submissionsList.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                  <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>📝</div>
                  <div style={{ fontWeight: 700, fontSize: '1.05rem', marginBottom: '0.35rem' }}>
                    {isAr ? 'لا توجد تسليمات مسجلة لهذا الاختبار حتى الآن' : 'No submissions yet for this exam'}
                  </div>
                  <div style={{ fontSize: '0.82rem' }}>
                    {isAr ? 'عندما يحل الطلاب هذا الاختبار، ستظهر هنا درجاتهم مع إمكانية مراجعة إجابة كل طالب سؤالاً بسؤال.' : 'When students complete this exam, their submissions and answers will appear here for review.'}
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {submissionsList.map((sub: any) => (
                    <div
                      key={sub.id}
                      style={{
                        padding: '1rem',
                        background: 'var(--bg-subtle)',
                        borderRadius: 'var(--radius-lg)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '0.75rem',
                        border: '1px solid var(--border-light)'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '50%',
                          background: 'linear-gradient(135deg, #3B82F6, #1D4ED8)',
                          color: '#FFFFFF',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 800,
                          fontSize: '0.95rem',
                          flexShrink: 0
                        }}>
                          {sub.student_name?.charAt(0) || 'ط'}
                        </div>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-title)' }}>
                            {sub.student_name}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            {sub.student_code ? `كود الطالب: ${sub.student_code}` : sub.student_email} • {sub.school_name || (isAr ? 'المدرسة' : 'School')}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div style={{ textAlign: isAr ? 'left' : 'right' }}>
                          <div style={{ fontWeight: 900, fontSize: '1rem', color: sub.percentage >= 80 ? '#16A34A' : sub.percentage >= 50 ? '#D97706' : '#DC2626' }}>
                            {sub.percentage}% ({sub.score} / {sub.total_points})
                          </div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                            {sub.completed_at ? new Date(sub.completed_at).toLocaleDateString(isAr ? 'ar-EG' : 'en-US') : ''}
                          </div>
                        </div>

                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => handleOpenReviewModal(sub.id, false)}
                          style={{
                            fontWeight: 800,
                            fontSize: '0.8rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                            padding: '0.45rem 0.85rem'
                          }}
                        >
                          <Eye size={15} />
                          <span>{isAr ? 'مراجعة الإجابات' : 'Review Paper'}</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* =========================================================
            STUDENT EXAM PAPER REVIEW MODAL (FULL ANSWERS INSPECTION)
            ========================================================= */}
        {isReviewModalOpen && (
          <div style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.7)',
            backdropFilter: 'blur(7px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1050,
            padding: '1rem'
          }}>
            <div className="card" style={{
              maxWidth: '840px',
              width: '100%',
              maxHeight: '92vh',
              overflowY: 'auto',
              padding: '2rem',
              borderRadius: 'var(--radius-xl)',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              position: 'relative'
            }}>
              {/* Modal Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', borderBottom: '1.5px solid var(--border-light)', paddingBottom: '1rem' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                    <span className="badge badge-primary" style={{ fontWeight: 800 }}>
                      📝 {isAr ? 'مراجعة ورقة إجابات الطالب' : 'Student Exam Answer Sheet'}
                    </span>
                    {reviewData?.attempt?.is_ai_evaluation && (
                      <span className="badge badge-secondary">
                        🤖 {isAr ? 'تقييم تشخيصي ذكي' : 'AI Diagnostic'}
                      </span>
                    )}
                  </div>
                  <h3 style={{ fontSize: '1.35rem', fontWeight: 900, margin: '0 0 0.25rem', color: 'var(--text-title)' }}>
                    {reviewData?.attempt?.exam_title || (isAr ? 'مراجعة الاختبار' : 'Exam Review')}
                  </h3>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {isAr ? 'فحص دقيق لخيارات وإجابات الطالب مقابل الإجابات النموذجية ومصادر المنهج' : 'Detailed breakdown of student answers vs correct answers'}
                  </div>
                </div>
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => { setIsReviewModalOpen(false); setReviewData(null); setReviewError(null); }}
                  style={{ borderRadius: '50%', width: '36px', height: '36px', padding: 0 }}
                >
                  ✕
                </button>
              </div>

              {isLoadingReview ? (
                <div style={{ textAlign: 'center', padding: '3.5rem', color: 'var(--text-muted)' }}>
                  <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⏳</div>
                  <div style={{ fontWeight: 700 }}>{isAr ? 'جاري تحميل ورقة الإجابة والأسئلة...' : 'Loading exam paper & answers...'}</div>
                </div>
              ) : reviewError ? (
                <div style={{ padding: '1.5rem', background: '#FEF2F2', border: '1px solid #FECDD3', borderRadius: 'var(--radius-md)', color: '#DC2626' }}>
                  <div style={{ fontWeight: 800, marginBottom: '0.5rem' }}>⚠️ {isAr ? 'خطأ في جلب المراجعة' : 'Review Error'}</div>
                  <div>{reviewError}</div>
                </div>
              ) : reviewData ? (
                <div>
                  {/* Student & Score Banner */}
                  <div style={{
                    background: 'linear-gradient(135deg, #1E293B 0%, #0F172A 100%)',
                    color: '#FFFFFF',
                    padding: '1.5rem',
                    borderRadius: 'var(--radius-lg)',
                    marginBottom: '1.75rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '1rem'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                      <div style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, #3B82F6, #1D4ED8)',
                        color: '#FFFFFF',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 900,
                        fontSize: '1.2rem',
                        flexShrink: 0
                      }}>
                        {reviewData.attempt.student_name?.charAt(0) || 'ط'}
                      </div>
                      <div>
                        <div style={{ fontSize: '1.15rem', fontWeight: 900 }}>
                          {reviewData.attempt.student_name}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: '#94A3B8', marginTop: '0.15rem' }}>
                          {reviewData.attempt.student_code ? `كود الطالب: ${reviewData.attempt.student_code}` : reviewData.attempt.student_email}
                          {reviewData.attempt.school_name ? ` • ${reviewData.attempt.school_name}` : ''}
                        </div>
                        <div style={{ fontSize: '0.73rem', color: '#64748B', marginTop: '0.2rem' }}>
                          {isAr ? 'تاريخ التسليم:' : 'Submitted:'} {reviewData.attempt.completed_at ? new Date(reviewData.attempt.completed_at).toLocaleString(isAr ? 'ar-EG' : 'en-US') : ''}
                        </div>
                      </div>
                    </div>

                    <div style={{ textAlign: isAr ? 'left' : 'right', background: 'rgba(255,255,255,0.08)', padding: '0.85rem 1.25rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(255,255,255,0.12)' }}>
                      <div style={{ fontSize: '0.75rem', color: '#94A3B8', fontWeight: 700 }}>
                        {isAr ? 'النتيجة الإجمالية' : 'Total Score'}
                      </div>
                      <div style={{ fontSize: '1.5rem', fontWeight: 900, color: reviewData.attempt.percentage >= 80 ? '#4ADE80' : reviewData.attempt.percentage >= 50 ? '#FBBF24' : '#F87171' }}>
                        {reviewData.attempt.score} / {reviewData.attempt.total_points}
                        <span style={{ fontSize: '1rem', marginRight: '0.35rem', marginLeft: '0.35rem', color: '#FFFFFF' }}>
                          ({reviewData.attempt.percentage}%)
                        </span>
                      </div>
                      <span className={`badge ${reviewData.attempt.percentage >= 80 ? 'badge-success' : reviewData.attempt.percentage >= 50 ? 'badge-warning' : 'badge-danger'}`} style={{ fontSize: '0.72rem', fontWeight: 800, marginTop: '0.25rem' }}>
                        {reviewData.attempt.percentage >= 80 ? (isAr ? 'إتقان تام 🌟' : 'Mastered') : reviewData.attempt.percentage >= 50 ? (isAr ? 'مستوى متوسط 📈' : 'Developing') : (isAr ? 'بحاجة لدعم ⚠️' : 'Needs Support')}
                      </span>
                    </div>
                  </div>

                  {/* AI Evaluation Diagnostic Summary (if available) */}
                  {reviewData.attempt.evaluation_report && reviewData.attempt.evaluation_report.strengths && (
                    <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', padding: '1.25rem', borderRadius: 'var(--radius-lg)', marginBottom: '1.5rem' }}>
                      <h4 style={{ color: '#15803D', fontWeight: 800, margin: '0 0 0.5rem', fontSize: '0.92rem' }}>
                        ✨ {isAr ? 'التحليل والتشخيص التربوي للمحاولة:' : 'Educational Diagnosis:'}
                      </h4>
                      <p style={{ fontSize: '0.83rem', color: '#166534', margin: 0, lineHeight: 1.6 }}>
                        {reviewData.attempt.evaluation_report.summary || reviewData.attempt.evaluation_report.study_plan || (isAr ? 'تم تشخيص نقاط القوة ومعالجة المفاهيم التربوية بنجاح.' : 'Performance analyzed successfully.')}
                      </p>
                    </div>
                  )}

                  {/* Questions Breakdown List */}
                  <div style={{ marginBottom: '1rem' }}>
                    <h4 style={{ fontWeight: 900, fontSize: '1.1rem', margin: '0 0 1rem', color: 'var(--text-title)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span>📋</span>
                      <span>{isAr ? `ورقة الأسئلة وإجابات الطالب (${reviewData.questions.length} سؤال):` : `Questions & Student Answers (${reviewData.questions.length}):`}</span>
                    </h4>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                      {reviewData.questions.map((q: any, qIdx: number) => (
                        <div
                          key={q.id || qIdx}
                          style={{
                            background: 'var(--bg-subtle)',
                            border: q.is_correct ? '1.5px solid #BBF7D0' : '1.5px solid #FECDD3',
                            borderRadius: 'var(--radius-lg)',
                            padding: '1.25rem',
                            position: 'relative'
                          }}
                        >
                          {/* Question Top Header */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <span style={{
                                width: '28px',
                                height: '28px',
                                borderRadius: '50%',
                                background: q.is_correct ? '#DCFCE7' : '#FEE2E2',
                                color: q.is_correct ? '#16A34A' : '#DC2626',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 900,
                                fontSize: '0.85rem'
                              }}>
                                {qIdx + 1}
                              </span>
                              <strong style={{ fontSize: '0.9rem', color: 'var(--text-title)' }}>
                                {isAr ? `السؤال رقم ${qIdx + 1}` : `Question #${qIdx + 1}`}
                              </strong>
                              {q.page_reference && (
                                <span className="badge badge-secondary" style={{ fontSize: '0.7rem' }}>
                                  📖 {isAr ? `صفحة ${q.page_reference}` : `p. ${q.page_reference}`}
                                </span>
                              )}
                            </div>

                            <span
                              className={`badge ${q.is_correct ? 'badge-success' : 'badge-danger'}`}
                              style={{ fontSize: '0.75rem', fontWeight: 800 }}
                            >
                              {q.is_correct 
                                ? (isAr ? `✓ إجابة صحيحة (${q.points_awarded}/${q.points} درجة)` : `✓ Correct (${q.points_awarded}/${q.points})`)
                                : (isAr ? `✗ إجابة غير صحيحة (0/${q.points} درجة)` : `✗ Incorrect (0/${q.points})`)}
                            </span>
                          </div>

                          {/* Question Text */}
                          <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-title)', marginBottom: '1rem', lineHeight: 1.6 }}>
                            {q.question_text}
                          </div>

                          {/* Options List */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.75rem' }}>
                            {q.options && q.options.map((opt: any, optIdx: number) => {
                              const isStudentSelected = opt.id === q.selected_option_id;
                              const isCorrectOpt = opt.is_correct;

                              let optBg = '#FFFFFF';
                              let optBorder = '1px solid #E2E8F0';
                              let optColor = '#334155';
                              let optBadgeText = '';
                              let optBadgeBg = '';
                              let optBadgeColor = '';

                              if (isStudentSelected && isCorrectOpt) {
                                optBg = '#DCFCE7';
                                optBorder = '2px solid #16A34A';
                                optColor = '#14532D';
                                optBadgeText = isAr ? '✓ إجابة الطالب (صحيحة)' : '✓ Student Answer (Correct)';
                                optBadgeBg = '#16A34A';
                                optBadgeColor = '#FFFFFF';
                              } else if (isStudentSelected && !isCorrectOpt) {
                                optBg = '#FEE2E2';
                                optBorder = '2px solid #DC2626';
                                optColor = '#7F1D1D';
                                optBadgeText = isAr ? '✗ إجابة الطالب (خاطئة)' : '✗ Student Answer (Wrong)';
                                optBadgeBg = '#DC2626';
                                optBadgeColor = '#FFFFFF';
                              } else if (isCorrectOpt) {
                                optBg = '#F0FDF4';
                                optBorder = '2px dashed #16A34A';
                                optColor = '#15803D';
                                optBadgeText = isAr ? '✓ الإجابة النموذجية الصحيحة' : '✓ Model Answer';
                                optBadgeBg = '#22C55E';
                                optBadgeColor = '#FFFFFF';
                              }

                              return (
                                <div
                                  key={opt.id || optIdx}
                                  style={{
                                    padding: '0.75rem 1rem',
                                    borderRadius: 'var(--radius-md)',
                                    background: optBg,
                                    border: optBorder,
                                    color: optColor,
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    fontWeight: (isStudentSelected || isCorrectOpt) ? 800 : 500,
                                    fontSize: '0.88rem'
                                  }}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                    <span style={{
                                      width: '22px',
                                      height: '22px',
                                      borderRadius: '50%',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      fontSize: '0.75rem',
                                      fontWeight: 800,
                                      background: (isStudentSelected || isCorrectOpt) ? 'rgba(0,0,0,0.08)' : '#E2E8F0'
                                    }}>
                                      {String.fromCharCode(65 + optIdx)}
                                    </span>
                                    <span>{opt.option_text}</span>
                                  </div>

                                  {optBadgeText && (
                                    <span style={{
                                      fontSize: '0.72rem',
                                      fontWeight: 800,
                                      padding: '0.2rem 0.5rem',
                                      borderRadius: 'var(--radius-full)',
                                      background: optBadgeBg,
                                      color: optBadgeColor,
                                      whiteSpace: 'nowrap'
                                    }}>
                                      {optBadgeText}
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>

                          {/* Explanation if available */}
                          {q.explanation && (
                            <div style={{
                              background: '#F8FAFC',
                              border: '1px solid #E2E8F0',
                              padding: '0.75rem 0.9rem',
                              borderRadius: 'var(--radius-md)',
                              fontSize: '0.8rem',
                              color: '#475569',
                              lineHeight: 1.5
                            }}>
                              <strong style={{ color: 'var(--primary-700)', display: 'block', marginBottom: '0.2rem' }}>
                                💡 {isAr ? 'التوضيح والشرح النموذجي:' : 'Explanation:'}
                              </strong>
                              {q.explanation}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Close Modal Footer */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem', borderTop: '1px solid var(--border-light)', paddingTop: '1rem' }}>
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={() => { setIsReviewModalOpen(false); setReviewData(null); }}
                      style={{ fontWeight: 800 }}
                    >
                      {isAr ? 'إغلاق المراجعة' : 'Close Review'}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        )}

      {/* Mobile Bottom Navigation Bar */}
      <nav className="mobile-bottom-nav" aria-label="Mobile Navigation">
        <button
          className={`mobile-nav-btn ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          <LayoutDashboard size={20} />
          <span>{isAr ? 'نظرة عامة' : 'Overview'}</span>
        </button>
        <button
          className={`mobile-nav-btn ${activeTab === 'books' ? 'active' : ''}`}
          onClick={() => setActiveTab('books')}
        >
          <BookOpen size={20} />
          <span>{isAr ? 'الكتب' : 'Books'}</span>
        </button>
        <button
          className={`mobile-nav-btn ${activeTab === 'exams' ? 'active' : ''}`}
          onClick={() => setActiveTab('exams')}
        >
          <FileText size={20} />
          <span>{isAr ? 'الامتحانات' : 'Exams'}</span>
        </button>
        <button
          className={`mobile-nav-btn ${activeTab === 'builder' ? 'active' : ''}`}
          onClick={() => setActiveTab('builder')}
        >
          <PlusCircle size={20} />
          <span>{isAr ? 'إنشاء' : 'Create'}</span>
        </button>
        <button
          className={`mobile-nav-btn ${activeTab === 'analytics' ? 'active' : ''}`}
          onClick={() => setActiveTab('analytics')}
        >
          <BarChart2 size={20} />
          <span>{isAr ? 'الطلاب' : 'Students'}</span>
        </button>
      </nav>

    </div>
  );
};
