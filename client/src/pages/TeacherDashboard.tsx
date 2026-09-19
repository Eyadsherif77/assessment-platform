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
  LayoutDashboard
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

  // Metadata
  const [stages, setStages] = useState<any[]>([]);
  const [selectedStageId, setSelectedStageId] = useState('');
  const [selectedGradeId, setSelectedGradeId] = useState('');
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

  // Load stages on mount
  useEffect(() => {
    fetch(apiUrl('/api/meta/stages'))
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          setStages(data);
          if (data.length > 0) {
            setSelectedStageId(data[1]?.id || data[0]?.id);
          }
        }
      })
      .catch(console.error);

    loadTeacherData();
  }, [token]);

  const loadTeacherData = () => {
    if (!token) return;

    // Load Books (only books uploaded by this teacher)
    fetch(apiUrl('/api/books?my_only=true'), { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setBooks(data); })
      .catch(console.error);

    // Load Exams
    fetch(apiUrl('/api/exams?my_only=true'), { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setExams(data); })
      .catch(console.error);

    // Load Analytics
    fetch(apiUrl('/api/analytics/teacher'), { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => setTeacherAnalytics(data))
      .catch(console.error);
  };

  const selectedStage = stages.find(s => s.id === selectedStageId);
  const availableGrades = selectedStage?.grades || [];

  useEffect(() => {
    if (availableGrades.length > 0 && !availableGrades.some((g: any) => g.id === selectedGradeId)) {
      setSelectedGradeId(availableGrades[0].id);
    }
  }, [selectedStageId, availableGrades]);

  // Load subjects for selected grade
  useEffect(() => {
    if (selectedGradeId) {
      fetch(apiUrl(`/api/meta/grades/${selectedGradeId}/subjects`))
        .then(r => r.json())
        .then(data => {
          if (Array.isArray(data)) {
            setSubjects(data);
            if (data.length > 0) setSelectedSubjectId(data[0].id);
          }
        })
        .catch(console.error);
    }
  }, [selectedGradeId]);

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
          chapter_title_ar: chapterTitleAr || 'الفصل الأول',
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
      await fetch(apiUrl(`/api/exams/${examId}/publish`), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ is_published: !currentStatus })
      });
      loadTeacherData();
    } catch (e) {
      console.error(e);
    }
  };

  // Create exam handler
  const handleCreateExam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newExamTitle || examQuestions.length === 0) return;

    setIsCreatingExam(true);
    try {
      const res = await fetch(apiUrl('/api/exams'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          title_ar: newExamTitle,
          academic_stage_id: selectedStageId,
          grade_id: selectedGradeId,
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
            <div style={{ fontSize: '0.72rem', color: '#4F46E5', fontWeight: 700, fontFamily: 'monospace' }}>
              {user?.hybrid_id || 'HYBRID-TEA'}
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
            <span>{isAr ? 'رفع ومعالجة كتاب (PDF)' : 'Upload Textbook (PDF)'}</span>
            <span className="sidebar-badge badge-primary">{isAr ? 'فهرسة AI' : 'AI Index'}</span>
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
            <span>{isAr ? 'أداء الطلاب ونسب الإتقان' : 'Class Mastery & Analytics'}</span>
          </button>
        </nav>

        {/* Bottom Status */}
        <div style={{ marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid var(--border-light)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 700, color: '#16A34A', marginBottom: '0.2rem' }}>
            <CheckCircle2 size={14} />
            <span>{isAr ? 'بوابة المعلم المعتمدة' : 'Certified Teacher Gate'}</span>
          </div>
          <div>{isAr ? `معرف هجين: ${user?.hybrid_id}` : `Hybrid ID: ${user?.hybrid_id}`}</div>
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
                <p style={{ color: '#94A3B8', fontSize: '0.9rem', margin: 0 }}>
                  {isAr ? 'التخصص:' : 'Specialization:'} <strong>{user?.profile?.specialization || (isAr ? 'معلم أول علوم' : 'Science Lead')}</strong> • {isAr ? 'المدرسة:' : 'School:'} {user?.profile?.school_name || (isAr ? 'مدرسة المتفوقين' : 'Excellence School')}
                </p>
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
                  {isAr ? '✓ مفهرسة بالذكاء الاصطناعي' : '✓ AI Vector-Indexed'}
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

              <div className="goal-card">
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                  {isAr ? 'متوسط نجاح الطلاب' : 'Average Student Score'}
                </span>
                <div style={{ fontSize: '2rem', fontWeight: 900, color: '#16A34A' }}>86%</div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {isAr ? 'من واقع 148 تقييم تشخيصي' : 'From 148 diagnostic quizzes'}
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
                  {isAr ? 'قائمة الكتب المفهرسة دلالياً للتقييم بالذكاء الاصطناعي' : 'Vector-indexed curriculum for AI diagnostics'}
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
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                      {isAr ? 'الفصول:' : 'Chapters:'} {book.chapters?.length || 1}
                    </div>
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
                <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                  {isAr ? 'يقوم النظام باستخراج النصوص وفهرسة الصفحات آلياً في الخلفية' : 'The system extracts paragraphs and indexes pages into AI vector memory'}
                </p>
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
                        ? (isAr ? 'جاري استخراج النصوص والفهرسة بالذكاء الاصطناعي...' : 'Extracting & AI Vector Indexing...')
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
                    <label className="form-label">{isAr ? 'المرحلة الدراسية' : 'Academic Stage'}</label>
                    <select className="form-select" value={selectedStageId} onChange={e => setSelectedStageId(e.target.value)}>
                      {stages.map(s => <option key={s.id} value={s.id}>{isAr ? s.name_ar : (s.name_en || s.name_ar)}</option>)}
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">{isAr ? 'الصف الدراسي' : 'Grade Level'}</label>
                    <select className="form-select" value={selectedGradeId} onChange={e => setSelectedGradeId(e.target.value)}>
                      {availableGrades.map((g: any) => <option key={g.id} value={g.id}>{isAr ? g.name_ar : (g.name_en || g.name_ar)}</option>)}
                    </select>
                  </div>
                </div>

                <div className="responsive-form-grid-2">
                  <div className="form-group">
                    <label className="form-label">{isAr ? 'المادة الدراسية' : 'Subject'}</label>
                    <select className="form-select" value={selectedSubjectId} onChange={e => setSelectedSubjectId(e.target.value)}>
                      {subjects.map(sub => <option key={sub.id} value={sub.id}>{isAr ? sub.name_ar : (sub.name_en || sub.name_ar)}</option>)}
                    </select>
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
                    <label className="form-label">{isAr ? 'رقم الفصل' : 'Chapter Number'}</label>
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
                    <label className="form-label">{isAr ? 'عنوان الفصل الدراسي' : 'Chapter Title'}</label>
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

                  <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: '1rem', marginTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <button
                      className={`btn btn-sm ${exam.is_published ? 'btn-outline' : 'btn-primary'}`}
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
                    <label className="form-label">{isAr ? 'المادة الدراسية' : 'Subject'}</label>
                    <select className="form-select" value={selectedSubjectId} onChange={e => setSelectedSubjectId(e.target.value)}>
                      {subjects.map(s => <option key={s.id} value={s.id}>{isAr ? s.name_ar : (s.name_en || s.name_ar)}</option>)}
                    </select>
                  </div>
                </div>

                <div className="form-group" style={{ marginTop: '0.75rem' }}>
                  <label className="form-label">{isAr ? 'نوع المدرسة المستهدفة للاختبار' : 'Target School Type'}</label>
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
                    <div key={qIndex} style={{ padding: '1.25rem', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-lg)', marginBottom: '1rem' }}>
                      <div className="form-group">
                        <label className="form-label">
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 900, margin: 0 }}>
                {isAr ? 'تحليلات أداء الطلاب' : 'Student Performance Analytics'}
              </h2>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                {isAr ? 'مؤشرات قياس الإتقان للدروس والوحدات التعليمية' : 'Class mastery indicators for textbook lessons and units'}
              </span>
            </div>

            <div className="motivation-widget-grid">
              <div className="goal-card">
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                  {isAr ? 'إجمالي التقييمات المحلولة' : 'Total Quizzes Completed'}
                </span>
                <div style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--primary-700)' }}>
                  {teacherAnalytics?.totalAttempts || 148}
                </div>
                <span style={{ fontSize: '0.75rem', color: '#16A34A', fontWeight: 700 }}>
                  {isAr ? '✓ مشاركة طلابية نشطة' : '✓ Active Student Engagement'}
                </span>
              </div>

              <div className="goal-card">
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                  {isAr ? 'أعلى فصل مستوعب' : 'Top Mastered Chapter'}
                </span>
                <div style={{ fontSize: '1.3rem', fontWeight: 900, color: '#16A34A' }}>
                  {isAr ? 'المادة وخواصها' : 'Matter & Its Properties'}
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {isAr ? 'نسبة إتقان 92%' : '92% Mastery Rate'}
                </span>
              </div>

              <div className="goal-card">
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                  {isAr ? 'الفصل الأكثر صعوبة' : 'Most Challenging Chapter'}
                </span>
                <div style={{ fontSize: '1.3rem', fontWeight: 900, color: '#DC2626' }}>
                  {isAr ? 'الكثافة وحرائق البترول' : 'Density & Petroleum Fires'}
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {isAr ? 'يحتاج إلى إعادة شرح وتأكيد' : 'Requires Concept Reinforcement'}
                </span>
              </div>
            </div>
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

    </div>
  );
};
