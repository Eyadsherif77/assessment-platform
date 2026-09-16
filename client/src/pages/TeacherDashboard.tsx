import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiUrl } from '../utils/api';
import { 
  Upload, 
  FileText, 
  PlusCircle, 
  Clock, 
  BarChart2, 
  Trash2
} from 'lucide-react';

export const TeacherDashboard: React.FC = () => {
  const { user, token, t, language } = useAuth();
  const getInitialTeacherTab = (): 'upload' | 'exams' | 'banks' | 'analytics' => {
    try {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get('tab');
      if (tab === 'upload' || tab === 'exams' || tab === 'banks' || tab === 'analytics') return tab;
      const saved = localStorage.getItem('teacher_active_tab');
      if (saved === 'upload' || saved === 'exams' || saved === 'banks' || saved === 'analytics') return saved as any;
    } catch (_) {}
    return 'upload';
  };

  const [activeTab, setActiveTabState] = useState<'upload' | 'exams' | 'banks' | 'analytics'>(getInitialTeacherTab);

  const setActiveTab = (tab: 'upload' | 'exams' | 'banks' | 'analytics') => {
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
  const [isUploading, setIsUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [jobProgress, setJobProgress] = useState<number>(0);
  const [jobStatusText, setJobStatusText] = useState<string>('');

  // Exams State
  const [exams, setExams] = useState<any[]>([]);
  const [newExamTitle, setNewExamTitle] = useState('');
  const [examDuration, setExamDuration] = useState('30');
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

    // Load Books
    fetch(apiUrl('/api/books'), { headers: { Authorization: `Bearer ${token}` } })
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

  // Upload book handler
  const handleUploadBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookTitleAr || !selectedStageId || !selectedGradeId || !selectedSubjectId || !pdfFile) {
      alert('الرجاء إدخال كافة بيانات الكتاب واختيار الملف');
      return;
    }

    setIsUploading(true);
    setUploadMessage(null);

    try {
      const formData = new FormData();
      formData.append('title_ar', bookTitleAr);
      formData.append('academic_stage_id', selectedStageId);
      formData.append('grade_id', selectedGradeId);
      formData.append('subject_id', selectedSubjectId);
      formData.append('chapter_number', chapterNumber);
      formData.append('chapter_title_ar', chapterTitleAr || 'الفصل الأول');
      formData.append('file', pdfFile);

      const res = await fetch(apiUrl('/api/books/upload'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل رفع الكتاب');

      setUploadMessage('تم رفع الكتاب بنجاح وبدأت معالجة الخلفية وتوليد متجهات التضمين!');
      setActiveJobId(data.bookId);
      setJobProgress(10);
      setJobStatusText('EXTRACTING');
      setBookTitleAr('');
      setPdfFile(null);
    } catch (err: any) {
      alert(err.message);
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
    <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
      {/* Teacher Profile Banner */}
      <div className="card" style={{
        background: 'linear-gradient(135deg, #FFFFFF, #EFF6FF)',
        border: '1.5px solid var(--primary-200)',
        marginBottom: '1.75rem',
        padding: '1.5rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <span className="badge badge-primary" style={{ marginBottom: '0.4rem' }}>{t.teacherDashboard}</span>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 800 }}>{user?.fullName}</h2>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
              {user?.profile?.specialization || 'معلم أول'} • {user?.profile?.school_name || 'مدرسة المستقبل'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '1rem', textAlign: 'center' }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: '1.35rem', color: 'var(--primary-700)' }}>{books.length}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>كتب دراسية</div>
            </div>
            <div style={{ borderRight: '1px solid var(--border-light)', height: '35px' }} />
            <div>
              <div style={{ fontWeight: 800, fontSize: '1.35rem', color: 'var(--primary-700)' }}>{exams.length}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>اختبارات</div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs-nav">
        <button
          className={`tab-btn ${activeTab === 'upload' ? 'active' : ''}`}
          onClick={() => setActiveTab('upload')}
          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
        >
          <Upload size={18} />
          <span>{t.tabUploadBook}</span>
        </button>

        <button
          className={`tab-btn ${activeTab === 'exams' ? 'active' : ''}`}
          onClick={() => setActiveTab('exams')}
          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
        >
          <FileText size={18} />
          <span>{t.tabManageExams} ({exams.length})</span>
        </button>

        <button
          className={`tab-btn ${activeTab === 'analytics' ? 'active' : ''}`}
          onClick={() => setActiveTab('analytics')}
          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
        >
          <BarChart2 size={18} />
          <span>{t.tabTeacherAnalytics}</span>
        </button>
      </div>

      {/* TAB 1: UPLOAD BOOK & ASYNC VECTOR INGESTION */}
      {activeTab === 'upload' && (
        <div>
          {/* Active Background Job Card */}
          {activeJobId && (
            <div className="card" style={{
              background: 'var(--primary-50)',
              border: '2px solid var(--primary-400)',
              marginBottom: '1.75rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                <Clock size={22} color="var(--primary-700)" />
                <h4 style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--primary-800)' }}>
                  {t.processingProgress} {jobStatusText} ({jobProgress}%)
                </h4>
              </div>
              <p style={{ fontSize: '0.85rem', color: 'var(--primary-700)', marginBottom: '0.75rem' }}>
                يقوم الخادم حالياً باستخراج النصوص من الصفحات، وتقسيمها إلى مقاطع دلالية، وفهرستها للتقييم الذكي...
              </p>
              <div className="progress-container">
                <div className="progress-bar" style={{ width: `${jobProgress}%` }} />
              </div>
            </div>
          )}

          {uploadMessage && (
            <div style={{
              background: 'var(--success-50)',
              border: '1px solid var(--success-500)',
              color: 'var(--success-700)',
              padding: '1rem',
              borderRadius: 'var(--radius-md)',
              marginBottom: '1.5rem',
              fontWeight: 600
            }}>
              {uploadMessage}
            </div>
          )}

          <div className="card">
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '1rem', color: 'var(--primary-800)' }}>
              {language === 'ar' ? 'رفع كتاب وزاري أو مذكرة تعليمية بصيغة PDF' : 'Upload Ministry Textbook / Document'}
            </h3>

            <form onSubmit={handleUploadBook}>
              <div className="responsive-form-grid-3">
                <div>
                  <label className="form-label">{t.selectStage}</label>
                  <select
                    className="form-select"
                    value={selectedStageId}
                    onChange={(e) => setSelectedStageId(e.target.value)}
                  >
                    {stages.map(s => (
                      <option key={s.id} value={s.id}>{language === 'ar' ? s.name_ar : s.name_en}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="form-label">{t.selectGrade}</label>
                  <select
                    className="form-select"
                    value={selectedGradeId}
                    onChange={(e) => setSelectedGradeId(e.target.value)}
                  >
                    {availableGrades.map((g: any) => (
                      <option key={g.id} value={g.id}>{language === 'ar' ? g.name_ar : g.name_en}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="form-label">{language === 'ar' ? 'المادة الدراسية' : 'Subject'}</label>
                  <select
                    className="form-select"
                    value={selectedSubjectId}
                    onChange={(e) => setSelectedSubjectId(e.target.value)}
                  >
                    {subjects.map(sub => (
                      <option key={sub.id} value={sub.id}>{sub.name_ar}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">{t.bookTitleAr}</label>
                <input
                  type="text"
                  required
                  className="form-input"
                  value={bookTitleAr}
                  onChange={(e) => setBookTitleAr(e.target.value)}
                  placeholder="مثال: كتاب العلوم المنهجي - الصف الأول الإعدادي"
                />
              </div>

              <div className="responsive-form-grid-2">
                <div>
                  <label className="form-label">رقم الفصل الأول</label>
                  <input
                    type="number"
                    className="form-input"
                    value={chapterNumber}
                    onChange={(e) => setChapterNumber(e.target.value)}
                    min="1"
                  />
                </div>
                <div>
                  <label className="form-label">عنوان الفصل الأول المرفق</label>
                  <input
                    type="text"
                    className="form-input"
                    value={chapterTitleAr}
                    onChange={(e) => setChapterTitleAr(e.target.value)}
                    placeholder="مثال: الفصل الأول: المادة وخواصها"
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">{t.selectPdfFile}</label>
                <input
                  type="file"
                  required
                  accept=".pdf,.txt"
                  className="form-input"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setPdfFile(e.target.files[0]);
                    }
                  }}
                />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  الحد الأقصى 50 ميجابايت (يتم تجزئة النص آلياً واستخراج أرقام الصفحات والمتجهات).
                </span>
              </div>

              <button
                type="submit"
                disabled={isUploading}
                className="btn btn-primary btn-lg"
                style={{ width: '100%' }}
              >
                <Upload size={20} />
                <span>{isUploading ? t.uploadingBook : 'رفع الكتاب وبدء المعالجة الذكية بالخلفية'}</span>
              </button>
            </form>
          </div>

          {/* Current Books Table */}
          <div style={{ marginTop: '2.5rem' }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '1rem' }}>
              الكتب والمناهج المسجلة:
            </h3>

            <div className="grid-cards">
              {books.map(b => (
                <div key={b.id} className="card">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <span className="badge badge-primary">{b.subject_name_ar}</span>
                    <span className="badge badge-success">{b.processing_status}</span>
                  </div>
                  <h4 style={{ fontWeight: 800, fontSize: '1.05rem', marginBottom: '0.25rem' }}>
                    {b.title_ar}
                  </h4>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    الصف: {b.grade_name_ar} • {b.total_pages || 48} صفحة
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: EXAMS MANAGEMENT & STUDIO */}
      {activeTab === 'exams' && (
        <div>
          {/* Create Exam Form */}
          <div className="card" style={{ marginBottom: '2rem' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '1rem', color: 'var(--primary-800)' }}>
              إنشاء اختبار جديد للصف الدراسي المختار
            </h3>

            <form onSubmit={handleCreateExam}>
              <div className="responsive-form-grid-3">
                <div>
                  <label className="form-label">{t.selectStage}</label>
                  <select
                    className="form-select"
                    value={selectedStageId}
                    onChange={(e) => setSelectedStageId(e.target.value)}
                  >
                    {stages.map(s => (
                      <option key={s.id} value={s.id}>{language === 'ar' ? s.name_ar : s.name_en}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="form-label">{t.selectGrade}</label>
                  <select
                    className="form-select"
                    value={selectedGradeId}
                    onChange={(e) => setSelectedGradeId(e.target.value)}
                  >
                    {availableGrades.map((g: any) => (
                      <option key={g.id} value={g.id}>{language === 'ar' ? g.name_ar : g.name_en}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="form-label">المادة</label>
                  <select
                    className="form-select"
                    value={selectedSubjectId}
                    onChange={(e) => setSelectedSubjectId(e.target.value)}
                  >
                    {subjects.map(sub => (
                      <option key={sub.id} value={sub.id}>{sub.name_ar}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="responsive-form-grid-2">
                <div>
                  <label className="form-label">{t.examTitleAr}</label>
                  <input
                    type="text"
                    required
                    className="form-input"
                    value={newExamTitle}
                    onChange={(e) => setNewExamTitle(e.target.value)}
                    placeholder="مثال: اختبار الوحدة الأولى - المادة وخواصها"
                  />
                </div>
                <div>
                  <label className="form-label">{t.durationMinutes}</label>
                  <input
                    type="number"
                    className="form-input"
                    value={examDuration}
                    onChange={(e) => setExamDuration(e.target.value)}
                    min="5"
                  />
                </div>
              </div>

              {/* Questions Builder */}
              <div style={{ marginTop: '1.5rem', marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                  <h4 style={{ fontWeight: 800, fontSize: '1.1rem' }}>أسئلة الاختبار:</h4>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      setExamQuestions(prev => [
                        ...prev,
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
                    }}
                  >
                    <PlusCircle size={16} />
                    <span>{t.addQuestion}</span>
                  </button>
                </div>

                {examQuestions.map((q, qIdx) => (
                  <div key={qIdx} style={{
                    background: 'var(--bg-main)',
                    border: '1px solid var(--border-light)',
                    borderRadius: 'var(--radius-md)',
                    padding: '1.25rem',
                    marginBottom: '1rem'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                      <span style={{ fontWeight: 700, color: 'var(--primary-700)' }}>السؤال {qIdx + 1}</span>
                      {examQuestions.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setExamQuestions(examQuestions.filter((_, i) => i !== qIdx))}
                          style={{ background: 'none', border: 'none', color: 'var(--danger-500)', cursor: 'pointer' }}
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>

                    <input
                      type="text"
                      required
                      className="form-input"
                      style={{ marginBottom: '0.75rem' }}
                      value={q.question_text}
                      onChange={(e) => {
                        const updated = [...examQuestions];
                        updated[qIdx].question_text = e.target.value;
                        setExamQuestions(updated);
                      }}
                      placeholder="نص السؤال..."
                    />

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.5rem' }}>
                      {q.options.map((opt: any, optIdx: number) => (
                        <div key={optIdx} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <input
                            type="radio"
                            name={`correct_${qIdx}`}
                            checked={opt.is_correct}
                            onChange={() => {
                              const updated = [...examQuestions];
                              updated[qIdx].options.forEach((o: any, idx: number) => {
                                o.is_correct = idx === optIdx;
                              });
                              setExamQuestions(updated);
                            }}
                            title="حدد هذا الخيار كإجابة صحيحة"
                          />
                          <input
                            type="text"
                            required
                            className="form-input"
                            style={{ padding: '0.4rem 0.6rem', fontSize: '0.85rem' }}
                            value={opt.option_text}
                            onChange={(e) => {
                              const updated = [...examQuestions];
                              updated[qIdx].options[optIdx].option_text = e.target.value;
                              setExamQuestions(updated);
                            }}
                            placeholder={`خيار ${optIdx + 1} ${optIdx === 0 ? '(الصحيح)' : ''}`}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <button
                type="submit"
                disabled={isCreatingExam}
                className="btn btn-primary btn-lg"
                style={{ width: '100%' }}
              >
                <span>{isCreatingExam ? 'جاري حفظ الاختبار...' : t.createExamBtn}</span>
              </button>
            </form>
          </div>

          {/* Active Teacher Exams List */}
          <div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '1rem' }}>
              الاختبارات التي قمت بإنشائها:
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {exams.map(exam => (
                <div key={exam.id} className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                      <span className="badge badge-primary">{exam.subject_name_ar}</span>
                      <span className="badge badge-primary">{exam.grade_name_ar}</span>
                      <span className={`badge ${exam.is_published ? 'badge-success' : 'badge-warning'}`}>
                        {exam.is_published ? 'منشور للطلاب' : 'مسودة غير منشورة'}
                      </span>
                    </div>
                    <h4 style={{ fontWeight: 800, fontSize: '1.1rem' }}>{exam.title_ar}</h4>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      المدة: {exam.duration_minutes} دقيقة • {exam.questions_count} أسئلة
                    </p>
                  </div>

                  <div>
                    <button
                      className={`btn btn-sm ${exam.is_published ? 'btn-outline' : 'btn-success'}`}
                      onClick={() => handleTogglePublish(exam.id, exam.is_published)}
                    >
                      {exam.is_published ? 'إلغاء النشر' : 'نشر الآن للطلاب'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: CLASS ANALYTICS & STUDENT RESULTS */}
      {activeTab === 'analytics' && (
        <div>
          <div className="stat-summary-grid">
            <div className="card" style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--primary-700)' }}>
                {teacherAnalytics?.stats?.total_students || 0}
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>إجمالي الطلاب المسجلين</div>
            </div>

            <div className="card" style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--primary-700)' }}>
                {teacherAnalytics?.stats?.total_my_exams || 0}
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>اختباراتك الفعالة</div>
            </div>

            <div className="card" style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--success-600)' }}>
                {teacherAnalytics?.stats?.total_attempts || 0}
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>محاولات وتسليمات الطلاب</div>
            </div>
          </div>

          <div className="card">
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '1rem' }}>
              أحدث تسليمات ونتائج الطلاب:
            </h3>

            {teacherAnalytics?.recent_attempts?.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {teacherAnalytics.recent_attempts.map((att: any) => (
                  <div key={att.id} style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.75rem 1rem',
                    background: 'var(--bg-main)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-light)'
                  }}>
                    <div>
                      <div style={{ fontWeight: 700 }}>{att.student_name}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{att.exam_title}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <span className="badge badge-success" style={{ fontSize: '0.9rem' }}>
                        {att.score} / {att.total_points} نقطة
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                لم يتم تسجيل أي محاولات تسليم جديدة من الطلاب بعد.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
