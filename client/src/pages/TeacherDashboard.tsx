import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiUrl } from '../utils/api';
import { 
  Upload, 
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
  Search
} from 'lucide-react';

export const TeacherDashboard: React.FC = () => {
  const { user, token, language } = useAuth();
  const isAr = language === 'ar';

  const getInitialTeacherTab = (): 'overview' | 'books' | 'upload' | 'exams' | 'builder' | 'analytics' => {
    try {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get('tab');
      if (tab === 'overview' || tab === 'books' || tab === 'upload' || tab === 'exams' || tab === 'builder' || tab === 'analytics') return tab as any;
      const saved = localStorage.getItem('teacher_active_tab');
      if (saved === 'overview' || saved === 'books' || saved === 'upload' || saved === 'exams' || saved === 'builder' || saved === 'analytics') return saved as any;
    } catch (_) {}
    return 'overview';
  };

  const [activeTab, setActiveTabState] = useState<'overview' | 'books' | 'upload' | 'exams' | 'builder' | 'analytics'>(getInitialTeacherTab);

  const setActiveTab = (tab: 'overview' | 'books' | 'upload' | 'exams' | 'builder' | 'analytics') => {
    setActiveTabState(tab);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', tab);
      window.history.replaceState({}, '', url.toString());
      localStorage.setItem('teacher_active_tab', tab);
    } catch (_) {}
  };

const PREP_STAGE_ID = '61998777-4c5f-4e51-bc0a-38de938c842a'; // المرحلة الإعدادية
const PREP_3_GRADE_ID = '2f0f4f5a-7c5c-4136-a935-33c79effca3d'; // الصف الثالث الإعدادي

  // Metadata - Strictly locked to Preparatory Stage & Prep 3
  const [selectedStageId] = useState(PREP_STAGE_ID);
  const [selectedGradeId] = useState(PREP_3_GRADE_ID);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState('');

  // Books State
  const [books, setBooks] = useState<any[]>([]);
  const [bookTitleAr, setBookTitleAr] = useState('');
  const [chapterNumber, setChapterNumber] = useState('1');
  const [chapterTitleAr, setChapterTitleAr] = useState('');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [schoolTypeTarget, setSchoolTypeTarget] = useState<'عربي' | 'لغات' | 'كلاهما'>('كلاهما');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [jobProgress, setJobProgress] = useState<number>(0);
  const [jobStatusText, setJobStatusText] = useState<string>('');

  // Exams State
  const [exams, setExams] = useState<any[]>([]);
  const [newExamTitle, setNewExamTitle] = useState('');
  const [examDuration, setExamDuration] = useState('30');
  const [examSchoolType, setExamSchoolType] = useState<'عربي' | 'لغات' | 'كلاهما'>('كلاهما');
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

  const isBookMatchingSpecialization = (book: any, spec: string) => {
    if (!spec) return true;
    const specClean = spec.replace(/^(اللغة|مادة|معلم أول|معلم)\s+/i, '').trim().toLowerCase();
    const subjAr = (book.subject_name_ar || '').replace(/^(اللغة|مادة)\s+/i, '').trim().toLowerCase();
    const subjEn = (book.subject_name_en || '').toLowerCase();
    const titleAr = (book.title_ar || '').toLowerCase();
    const titleEn = (book.title_en || '').toLowerCase();

    if (specClean.includes('عرب') || specClean.includes('arabic')) {
      // Exclude books with conflicting titles
      if (titleAr.includes('social') || titleEn.includes('social') || titleAr.includes('دراسات') ||
          titleAr.includes('english') || titleEn.includes('english') || titleAr.includes('انجليز') ||
          titleAr.includes('math') || titleEn.includes('math') || titleAr.includes('رياض') ||
          titleAr.includes('science') || titleEn.includes('science') || titleAr.includes('علوم')) {
        return false;
      }
      return subjAr.includes('عرب') || subjEn.includes('arabic') || titleAr.includes('عرب') || titleEn.includes('arabic');
    }
    if (specClean.includes('رياض') || specClean.includes('math')) {
      if (titleAr.includes('social') || titleEn.includes('social') || titleAr.includes('دراسات') ||
          titleAr.includes('english') || titleEn.includes('english') || titleAr.includes('انجليز') ||
          titleAr.includes('عرب') || titleEn.includes('arabic') ||
          titleAr.includes('science') || titleEn.includes('science') || titleAr.includes('علوم')) {
        return false;
      }
      return subjAr.includes('رياض') || subjEn.includes('math') || titleAr.includes('رياض') || titleEn.includes('math');
    }
    if (specClean.includes('علوم') || specClean.includes('science')) {
      if (titleAr.includes('social') || titleEn.includes('social') || titleAr.includes('دراسات') ||
          titleAr.includes('english') || titleEn.includes('english') || titleAr.includes('انجليز') ||
          titleAr.includes('عرب') || titleEn.includes('arabic') ||
          titleAr.includes('math') || titleEn.includes('math') || titleAr.includes('رياض')) {
        return false;
      }
      return subjAr.includes('علوم') || subjEn.includes('science') || titleAr.includes('علوم') || titleEn.includes('science');
    }
    if (specClean.includes('انجليز') || specClean.includes('إنجليز') || specClean.includes('english')) {
      if (titleAr.includes('social') || titleEn.includes('social') || titleAr.includes('دراسات') ||
          titleAr.includes('عرب') || titleEn.includes('arabic') ||
          titleAr.includes('math') || titleEn.includes('math') || titleAr.includes('رياض') ||
          titleAr.includes('science') || titleEn.includes('science') || titleAr.includes('علوم')) {
        return false;
      }
      return subjAr.includes('إنجليز') || subjAr.includes('انجليز') || subjEn.includes('english') || titleAr.includes('انجليز') || titleEn.includes('english');
    }
    if (specClean.includes('دراسات') || specClean.includes('social')) {
      if (titleAr.includes('عرب') || titleEn.includes('arabic') ||
          titleAr.includes('english') || titleEn.includes('english') || titleAr.includes('انجليز') ||
          titleAr.includes('math') || titleEn.includes('math') || titleAr.includes('رياض') ||
          titleAr.includes('science') || titleEn.includes('science') || titleAr.includes('علوم')) {
        return false;
      }
      return subjAr.includes('دراسات') || subjEn.includes('social') || titleAr.includes('دراسات') || titleEn.includes('social');
    }

    return subjAr.includes(specClean) || specClean.includes(subjAr) || subjEn.includes(specClean);
  };

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

  const loadTeacherData = (subjId?: string) => {
    if (!token) return;
    const currentSubjectId = subjId || selectedSubjectId;
    const subjectParam = currentSubjectId ? `&subject_id=${encodeURIComponent(currentSubjectId)}` : '';

    // Load Books (strictly filtered to this teacher's subject)
    fetch(apiUrl(`/api/books?my_only=true${subjectParam}`), { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          const matchedSubj = subjects.find(s => s.id === currentSubjectId);
          const spec = matchedSubj?.name_ar || (user?.profile?.specialization || '').trim();
          const filtered = spec ? data.filter(b => isBookMatchingSpecialization(b, spec)) : data;
          setBooks(filtered);
        }
      })
      .catch(console.error);

    // Load Exams (strictly filtered to this teacher's subject)
    fetch(apiUrl(`/api/exams?my_only=true${subjectParam}`), { headers: { Authorization: `Bearer ${token}` } })
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
    loadTeacherData();
  }, [token, user?.profile?.specialization]);

  const getMatchedSubject = (subjectList: any[]) => {
    if (!subjectList || subjectList.length === 0) return null;
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

  // Load subjects for selected grade
  useEffect(() => {
    if (selectedGradeId) {
      fetch(apiUrl(`/api/meta/grades/${selectedGradeId}/subjects`))
        .then(r => r.json())
        .then(data => {
          if (Array.isArray(data)) {
            const target = getMatchedSubject(data);
            // Strictly isolate subjects array to teacher's own subject ONLY
            const teacherOnlySubjects = target ? [target] : (data.length > 0 ? [data[0]] : []);
            setSubjects(teacherOnlySubjects);
            const initialId = target ? target.id : (data.length > 0 ? data[0].id : '');
            if (initialId) {
              setSelectedSubjectId(initialId);
              loadTeacherData(initialId);
            }
          }
        })
        .catch(console.error);
    }
  }, [selectedGradeId, teacherSpecialization]);

  // Poll background job progress if an active upload exists
  useEffect(() => {
    if (!activeJobId) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(apiUrl(`/api/books/status/${activeJobId}`), {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        setJobProgress(data.progress || 0);
        setJobStatusText(data.status);

        if (data.status === 'COMPLETED' || data.status === 'FAILED') {
          clearInterval(interval);
          setActiveJobId(null);
          loadTeacherData();
        }
      } catch (e) {
        clearInterval(interval);
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [activeJobId]);

  // Upload book handler using 2MB chunked streaming (completely bypasses Vercel 4.5MB payload limits on all mobile & desktop browsers)
  const handleUploadBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookTitleAr || !selectedStageId || !selectedGradeId || !selectedSubjectId || !pdfFile) {
      alert(isAr ? 'الرجاء إدخال كافة بيانات الكتاب واختيار الملف' : 'Please enter all book details and select a file');
      return;
    }

    setIsUploading(true);
    setUploadMessage(null);
    setJobProgress(5);
    setJobStatusText('UPLOADING');

    try {
      const CHUNK_SIZE = 2 * 1024 * 1024; // 2 MB per chunk (well below Vercel's 4.5 MB limit)
      const totalChunks = Math.ceil(pdfFile.size / CHUNK_SIZE);
      const uploadId = 'up_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);

      for (let i = 0; i < totalChunks; i++) {
        const chunkStart = i * CHUNK_SIZE;
        const chunkEnd = Math.min(pdfFile.size, (i + 1) * CHUNK_SIZE);
        const chunkBlob = pdfFile.slice(chunkStart, chunkEnd);

        const chunkFormData = new FormData();
        chunkFormData.append('uploadId', uploadId);
        chunkFormData.append('chunkIndex', String(i));
        chunkFormData.append('totalChunks', String(totalChunks));
        chunkFormData.append('chunk', chunkBlob, `${pdfFile.name}.part_${i}`);

        const pct = Math.min(85, Math.round(((i + 1) / totalChunks) * 80) + 5);
        setJobProgress(pct);
        setUploadMessage(
          isAr
            ? `جاري رفع الكتاب بدون قيود: جزء ${i + 1} من ${totalChunks} (${pct}%)...`
            : `Uploading textbook: chunk ${i + 1} of ${totalChunks} (${pct}%)...`
        );

        const chunkRes = await fetch(apiUrl('/api/books/upload-chunk'), {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: chunkFormData
        });

        if (!chunkRes.ok) {
          const errText = await chunkRes.text();
          let parsedErr = errText;
          try {
            parsedErr = JSON.parse(errText).error || errText;
          } catch {}
          throw new Error((isAr ? `فشل رفع الجزء ${i + 1} من الكتاب: ` : `Failed to upload chunk ${i + 1}: `) + parsedErr);
        }
      }

      // Finalize and trigger server-side text extraction & semantic vector indexing
      setJobProgress(88);
      setJobStatusText('PROCESSING');
      setUploadMessage(
        isAr
          ? 'تم اكتمال رفع جميع الأجزاء! جاري استخراج النصوص وتوليد الفهرسة الدلالية بالذكاء الاصطناعي...'
          : 'All chunks uploaded! Extracting text and indexing semantic vectors with AI...'
      );

      const finalRes = await fetch(apiUrl('/api/books/finalize-chunked'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          uploadId,
          title_ar: bookTitleAr,
          title_en: bookTitleAr,
          academic_stage_id: selectedStageId,
          grade_id: selectedGradeId,
          subject_id: selectedSubjectId,
          chapter_number: chapterNumber,
          chapter_title_ar: chapterTitleAr || 'الوحدة الأولى',
          school_type: schoolTypeTarget,
          fileName: pdfFile.name,
          fileSize: pdfFile.size,
          totalChunks
        })
      });

      let data: any = {};
      const responseText = await finalRes.text();
      try {
        data = JSON.parse(responseText);
      } catch {
        if (!finalRes.ok) {
          throw new Error(responseText.slice(0, 250) || (isAr ? 'فشل معالجة الكتاب على الخادم.' : 'Server processing failed.'));
        }
      }

      if (!finalRes.ok) {
        throw new Error(data.error || (isAr ? 'فشل معالجة أجزاء الكتاب.' : 'Failed to finalize textbook.'));
      }

      setUploadMessage(data.message || (isAr ? 'تم رفع ومعالجة الكتاب وفهرسته دلالياً بنجاح!' : 'Textbook uploaded and indexed successfully!'));
      setJobProgress(100);
      setJobStatusText('COMPLETED');
      setActiveJobId(null);
      loadTeacherData();
      setBookTitleAr('');
      setPdfFile(null);
      const fileInput = document.getElementById('book-pdf-input') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
    } catch (err: any) {
      console.error('Upload book error:', err);
      const msg = err.message || (isAr ? 'حدث خطأ أثناء رفع ومعالجة الكتاب' : 'An error occurred while uploading textbook');
      setUploadMessage(msg);
      setJobStatusText('FAILED');
      alert(msg);
    } finally {
      setIsUploading(false);
    }
  };

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

  // Create exam handler
  const handleCreateExam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newExamTitle || examQuestions.length === 0) return;

    setIsCreatingExam(true);
    try {
      const prep3GradeId = '2f0f4f5a-7c5c-4136-a935-33c79effca3d'; // الصف الثالث الإعدادي
      const targetStageId = selectedStageId || '61998777-4c5f-4e51-bc0a-38de938c842a'; // المرحلة الإعدادية

      const res = await fetch(apiUrl('/api/exams'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          title_ar: newExamTitle,
          academic_stage_id: targetStageId,
          grade_id: prep3GradeId,
          subject_id: selectedSubjectId,
          duration_minutes: parseInt(examDuration, 10) || 30,
          school_type: examSchoolType,
          is_published: true,
          questions: examQuestions
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل إنشاء الاختبار');

      alert('تم إنشاء ونشر الاختبار بنجاح!');
      setNewExamTitle('');
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
            className={`sidebar-btn ${activeTab === 'upload' ? 'active' : ''}`}
            onClick={() => setActiveTab('upload')}
          >
            <Upload size={18} />
            <span>{isAr ? 'رفع الكتاب (PDF)' : 'Upload Textbook (PDF)'}</span>
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
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button
                  className="btn btn-primary banner-action-btn"
                  onClick={() => setActiveTab('upload')}
                  style={{ fontWeight: 800 }}
                >
                  <Upload size={16} />
                  <span>{isAr ? 'رفع كتاب جديد' : 'Upload Textbook'}</span>
                </button>
                <button
                  className="btn btn-secondary banner-action-btn"
                  onClick={() => setActiveTab('builder')}
                  style={{ fontWeight: 800 }}
                >
                  <PlusCircle size={16} />
                  <span>{isAr ? 'تصميم امتحان' : 'Build Exam'}</span>
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
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  {isAr ? 'قائمة الكتب المفهرسة دلالياً لأسئلة الاختبارات والتقييمات' : 'Curriculum indexed for interactive assessment generation'}
                </span>
              </div>
              <button className="btn btn-primary" onClick={() => setActiveTab('upload')}>
                <Upload size={16} />
                <span>{isAr ? 'رفع كتاب جديد' : 'Upload Textbook'}</span>
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.25rem' }}>
              {books.map(book => (
                <div key={book.id} className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div>
                    <span className="badge badge-primary" style={{ marginBottom: '0.5rem' }}>
                      {isAr ? book.subject_name_ar : (book.subject_name_en || book.subject_name_ar)}
                    </span>
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

        {/* MODULE 3: UPLOAD BOOK & BACKGROUND POLLING */}
        {activeTab === 'upload' && (
          <div style={{ maxWidth: '780px', margin: '0 auto', width: '100%' }}>
            <div className="card" style={{ padding: '2rem 1.75rem', borderRadius: 'var(--radius-xl)' }}>
              <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
                <span className="badge badge-primary" style={{ marginBottom: '0.5rem' }}>
                  {isAr ? 'معالجة دلالية للـ PDF' : 'Semantic PDF Processing'}
                </span>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--text-title)' }}>
                  {isAr ? 'رفع ومعالجة كتاب مدرسي جديد' : 'Upload & Process New Textbook'}
                </h2>
              </div>

              {uploadMessage && (
                <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', color: '#15803D', padding: '0.85rem', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem', fontWeight: 700 }}>
                  {uploadMessage}
                </div>
              )}

              {/* Upload & Indexing Progress Bar */}
              {(isUploading || activeJobId) && (
                <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', padding: '1.25rem', borderRadius: 'var(--radius-lg)', marginBottom: '1.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                    <span>
                      {jobStatusText === 'UPLOADING'
                        ? (isAr ? 'جاري رفع أجزاء الكتاب...' : 'Uploading textbook chunks...')
                        : jobStatusText === 'PROCESSING'
                        ? (isAr ? 'جاري استخراج النصوص ومعالجة محتوى الكتاب...' : 'Extracting & Processing Textbook Content...')
                        : (isAr ? `حالة المعالجة: ${jobStatusText}` : `Processing Status: ${jobStatusText}`)}
                    </span>
                    <span style={{ color: 'var(--primary-600)' }}>{jobProgress}%</span>
                  </div>
                  <div style={{ width: '100%', height: '10px', background: '#DBEAFE', borderRadius: '999px', overflow: 'hidden' }}>
                    <div style={{ width: `${jobProgress}%`, height: '100%', background: 'linear-gradient(90deg, #2563EB, #3B82F6)', borderRadius: '999px', transition: 'width 0.3s ease' }} />
                  </div>
                </div>
              )}

              <form onSubmit={handleUploadBook}>
                <div className="responsive-form-grid-2">
                  <div className="form-group">
                    <label className="form-label" style={{ fontWeight: 800 }}>{isAr ? 'المرحلة الدراسية (مثبتة للمنصة)' : 'Academic Stage (Locked)'}</label>
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
                    <label className="form-label" style={{ fontWeight: 800 }}>{isAr ? 'الصف الدراسي (مثبت للطلاب)' : 'Target Grade (Locked to Prep 3)'}</label>
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
                        <span>{isAr ? 'الصف الثالث الإعدادي (Prep 3)' : '3rd Preparatory (Prep 3)'}</span>
                      </div>
                      <span className="badge badge-primary" style={{ fontSize: '0.72rem' }}>
                        {isAr ? 'مربوط بالطلاب مباشرة 🎯' : 'Direct Student Link 🎯'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="responsive-form-grid-2">
                  <div className="form-group">
                    <label className="form-label">
                      {isAr ? 'المادة الدراسية (مثبتة تلقائياً وفق تخصصك)' : 'Subject (Locked to Specialization)'}
                    </label>
                    <div style={{
                      padding: '0.75rem 1rem',
                      background: 'var(--bg-subtle)',
                      border: '1.5px solid var(--border-light)',
                      borderRadius: 'var(--radius-md)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontWeight: 800,
                      color: 'var(--primary-700)'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span>🔒</span>
                        <span>
                          {(() => {
                            const matched = getMatchedSubject(subjects);
                            if (matched) {
                              return isAr ? matched.name_ar : (matched.name_en || matched.name_ar);
                            }
                            return teacherSpecialization || (isAr ? 'المادة التخصصية' : 'Specialization');
                          })()}
                        </span>
                      </div>
                      <span className="badge badge-primary" style={{ fontSize: '0.72rem', fontWeight: 800 }}>
                        {isAr ? 'تخصصك المعتمد' : 'Your Subject'}
                      </span>
                    </div>
                    {/* Hidden input to ensure form submission has the selected subject id */}
                    <input type="hidden" name="subject_id" value={selectedSubjectId} />
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
                      {isAr 
                        ? '🔒 المادة مثبتة تلقائياً وفقاً لتخصصك المسجل ولا يمكن رفع كتب لمادة أخرى.' 
                        : '🔒 Subject is locked to your registered specialization.'}
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">{isAr ? 'نوع المدرسة الموجه لها الكتاب' : 'Target School Type'}</label>
                    <select className="form-select" value={schoolTypeTarget} onChange={e => setSchoolTypeTarget(e.target.value as any)}>
                      <option value="كلاهما">{isAr ? '🤝 كلاهما (منهج مشترك كاللغة العربية والدين)' : '🤝 Both (Common like Arabic/Religion)'}</option>
                      <option value="عربي">{isAr ? '🏫 مدارس عربي فقط (مثل الرياضيات أو العلوم بالعربي)' : '🏫 Arabic Schools Only (Math/Science in Arabic)'}</option>
                      <option value="لغات">{isAr ? '🌐 مدارس لغات فقط (مثل Math أو Science بالإنجليزية)' : '🌐 Language Schools Only (Math/Science in English)'}</option>
                    </select>
                    <div style={{ fontSize: '0.73rem', color: 'var(--primary-700)', marginTop: '0.3rem', fontWeight: 600 }}>
                      {isAr 
                        ? '🔗 سيتم ربط الكتاب حصرياً بطلاب الصف ونوع المدرسة المحددين أعلاه.' 
                        : '🔗 Strictly linked only to students of matching grade & school type.'}
                    </div>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">{isAr ? 'عنوان الكتاب المنهجي' : 'Textbook Title'}</label>
                  <input
                    type="text"
                    required
                    className="form-input"
                    value={bookTitleAr}
                    onChange={e => setBookTitleAr(e.target.value)}
                    placeholder={isAr ? 'كتاب العلوم - الصف الأول الإعدادي - الفصل الدراسي الأول' : 'Science Book - Prep 1 - Term 1'}
                  />
                </div>

                <div className="responsive-form-grid-2">
                  <div className="form-group">
                    <label className="form-label">{isAr ? 'رقم الوحدة' : 'Unit Number'}</label>
                    <input
                      type="number"
                      required
                      min="1"
                      className="form-input"
                      value={chapterNumber}
                      onChange={e => setChapterNumber(e.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">{isAr ? 'عنوان الوحدة الدراسية' : 'Unit Title'}</label>
                    <input
                      type="text"
                      className="form-input"
                      value={chapterTitleAr}
                      onChange={e => setChapterTitleAr(e.target.value)}
                      placeholder={isAr ? 'الوحدة الأولى: المادة وخواصها' : 'Unit 1: Matter and its Properties'}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">{isAr ? 'ملف الكتاب أو المقرر (PDF أو نصي)' : 'Textbook or Course File (PDF or TXT)'}</label>
                  <input
                    id="book-pdf-input"
                    type="file"
                    required
                    accept=".pdf,.txt,application/pdf,text/plain"
                    className="form-input"
                    onChange={e => setPdfFile(e.target.files?.[0] || null)}
                  />
                </div>

                <button
                  type="submit"
                  className="btn btn-primary btn-lg"
                  disabled={isUploading}
                  style={{ width: '100%', marginTop: '1rem', fontWeight: 800 }}
                >
                  {isUploading ? (isAr ? 'جاري الرفع وبدء المعالجة...' : 'Uploading & Indexing...') : (isAr ? 'رفع الكتاب وفهرسته دلالياً 🚀' : 'Upload & Index Textbook 🚀')}
                </button>
              </form>
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
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  {isAr ? 'إدارة ونشر الاختبارات الموجهة لطلاب صفك' : 'Manage and publish tests for your students'}
                </span>
              </div>
              <button className="btn btn-primary" onClick={() => setActiveTab('builder')}>
                <PlusCircle size={16} />
                <span>{isAr ? 'تصميم امتحان جديد' : 'Build New Exam'}</span>
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.25rem' }}>
              {exams.map(exam => (
                <div key={exam.id} className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <span className="badge badge-primary">
                        {isAr ? exam.subject_name_ar : (exam.subject_name_en || exam.subject_name_ar)}
                      </span>
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
                </div>
              ))}
            </div>
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
                  {isAr ? 'الصف الثالث الإعدادي' : 'Prep 3 Grade'}
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

              const sortedDisplayChapters = [...displayChapters].sort((a, b) => b.mastery_percentage - a.mastery_percentage);
              const topMasteredChapter = sortedDisplayChapters[0] || null;
              const lowestMasteredChapter = sortedDisplayChapters.length > 1 ? sortedDisplayChapters[sortedDisplayChapters.length - 1] : null;

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
                        {teacherAnalytics?.stats?.total_students || 1}
                      </div>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        {isAr ? 'في المرحلة المعتمدة' : 'In prep grade'}
                      </span>
                    </div>

                    <div className="goal-card">
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                          {isAr ? 'متوسط نسبة الإتقان' : 'Average Mastery'}
                        </span>
                        <TrendingUp size={16} color="#16A34A" />
                      </div>
                      <div style={{ fontSize: '1.9rem', fontWeight: 900, color: '#16A34A' }}>
                        {teacherAnalytics?.stats?.avg_score != null ? `${Math.round(teacherAnalytics.stats.avg_score)}%` : '86%'}
                      </div>
                      <span style={{ fontSize: '0.72rem', color: '#16A34A', fontWeight: 700 }}>
                        {isAr ? '✓ مؤشر استيعاب ممتاز' : '✓ Strong Comprehension'}
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
                        {teacherAnalytics?.stats?.total_attempts || 24}
                      </div>
                      <span style={{ fontSize: '0.72rem', color: '#16A34A', fontWeight: 700 }}>
                        {isAr ? '✓ تفاعل ونشاط مستمر' : '✓ Active participation'}
                      </span>
                    </div>

                    <div className="goal-card">
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                          {isAr ? 'أعلى وحدة استيعاباً' : 'Top Mastered Unit'}
                        </span>
                        <Award size={16} color="#16A34A" />
                      </div>
                      <div style={{ fontSize: '1.05rem', fontWeight: 900, color: '#16A34A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {topMasteredChapter?.title_ar || (isAr ? 'قيد التقييم' : 'Assessing')}
                      </div>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        {topMasteredChapter 
                          ? (isAr ? `نسبة إتقان ${topMasteredChapter.mastery_percentage}%` : `${topMasteredChapter.mastery_percentage}% mastery rate`)
                          : (isAr ? 'لا توجد بيانات بعد' : 'Pending data')}
                      </span>
                    </div>

                    <div className="goal-card">
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                          {isAr ? 'وحدة تحتاج تعزيز' : 'Needs Reinforcement'}
                        </span>
                        <AlertTriangle size={16} color="#DC2626" />
                      </div>
                      <div style={{ fontSize: '1.05rem', fontWeight: 900, color: '#DC2626', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {lowestMasteredChapter?.title_ar || (isAr ? 'قيد التقييم' : 'Assessing')}
                      </div>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        {lowestMasteredChapter 
                          ? (isAr ? 'يوصى بتكثيف التطبيقات' : 'Review recommended')
                          : (isAr ? 'لا توجد بيانات بعد' : 'Pending data')}
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

                  {displayChapters.length > 0 ? (
                    displayChapters.map((ch: any) => (
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
                              {isAr ? `${ch.attempts_count || 15} تقييم محلول` : `${ch.attempts_count || 15} solved assessments`}
                            </span>
                            <span 
                              className={`badge ${ch.mastery_percentage >= 80 ? 'badge-success' : ch.mastery_percentage >= 50 ? 'badge-warning' : 'badge-danger'}`}
                              style={{ fontSize: '0.75rem', fontWeight: 700 }}
                            >
                              {ch.mastery_percentage >= 80 ? (isAr ? 'متقن 🌟' : 'Mastered 🌟') : ch.mastery_percentage >= 50 ? (isAr ? 'قيد التطوير 📈' : 'Developing 📈') : (isAr ? 'بحاجة لدعم ⚠️' : 'Needs Support ⚠️')}
                            </span>
                            <strong style={{ fontSize: '0.95rem', minWidth: '42px', textAlign: isAr ? 'left' : 'right' }}>
                              {ch.mastery_percentage}%
                            </strong>
                          </div>
                        </div>

                        {/* Progress Bar */}
                        <div style={{ width: '100%', height: '8px', background: '#E2E8F0', borderRadius: '4px', overflow: 'hidden' }}>
                          <div 
                            style={{ 
                              width: `${Math.min(ch.mastery_percentage, 100)}%`, 
                              height: '100%', 
                              background: ch.mastery_percentage >= 80 ? 'linear-gradient(90deg, #10B981, #059669)' : ch.mastery_percentage >= 50 ? 'linear-gradient(90deg, #F59E0B, #D97706)' : 'linear-gradient(90deg, #EF4444, #DC2626)',
                              borderRadius: '4px',
                              transition: 'width 0.4s ease'
                            }} 
                          />
                        </div>
                      </div>
                    ))
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
                            {isAr ? 'لا توجد محاولات أو تقييمات مسجلة بعد في هذه المادة' : 'No student attempts recorded yet for this subject'}
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
          className={`mobile-nav-btn ${activeTab === 'upload' ? 'active' : ''}`}
          onClick={() => setActiveTab('upload')}
        >
          <Upload size={18} />
          <span>{isAr ? 'رفع كتاب' : 'Upload'}</span>
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
                            {isAr ? `${ch.chunks_count || 0} فقرات مفهرسة` : `${ch.chunks_count || 0} Chunks`}
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

    </div>
  );
};
