import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiUrl } from '../utils/api';
import {
  Users,
  GraduationCap,
  BookOpen,
  FileText,
  Settings,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Plus,
  Search,
  Database,
  TrendingUp,
  X,
  School,
  ShieldCheck
} from 'lucide-react';
import { HierarchyDashboard } from './HierarchyDashboard';

interface TeacherItem {
  id: string;
  super_id?: string | null;
  hybrid_id: string;
  email: string;
  fullName: string;
  schoolName: string;
  specialization: string;
  isActive: boolean;
  booksCount: number;
  examsCount: number;
  permissions: {
    can_upload_books: boolean;
    can_create_exams: boolean;
    can_delete_content: boolean;
    can_view_analytics: boolean;
    is_active: boolean;
  };
  createdAt: string;
}

interface StudentItem {
  id: string; // id only
  email: string;
  fullName: string;
  stageNameAr: string;
  gradeNameAr: string;
  schoolName: string;
  schoolType: string;
  section?: string | null;
  attemptsCount: number;
  aiEvalsCount: number;
  avgScore: number | null;
  isActive: boolean;
  createdAt: string;
}

export const AdminDashboard: React.FC = () => {
  const { user, token, language, impersonateUser } = useAuth();

  const [activeTab, setActiveTab] = useState<'hierarchy' | 'teachers' | 'students' | 'architecture'>('hierarchy');

  // Overview stats
  const [stats, setStats] = useState<any>({
    totalStudents: 0,
    totalTeachers: 0,
    totalBooks: 0,
    totalExams: 0,
    totalExamAttempts: 0
  });

  // Teachers state
  const [teachers, setTeachers] = useState<TeacherItem[]>([]);
  const [teachersLoading, setTeachersLoading] = useState(false);
  const [teacherSearch, setTeacherSearch] = useState('');

  // Students state
  const [students, setStudents] = useState<StudentItem[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [studentSearch, setStudentSearch] = useState('');

  // Modals state
  const [selectedTeacherForPerms, setSelectedTeacherForPerms] = useState<TeacherItem | null>(null);
  const [editPermissions, setEditPermissions] = useState<any>({});
  const [savingPerms, setSavingPerms] = useState(false);

  const [addTeacherModalOpen, setAddTeacherModalOpen] = useState(false);
  const [newTeacherData, setNewTeacherData] = useState({
    fullName: '',
    email: '',
    password: '',
    specialization: 'معلم أول علوم',
    schoolName: 'مدرسة المتفوقين الرسمية',
    can_upload_books: true,
    can_create_exams: true,
    can_delete_content: true,
    can_view_analytics: true
  });
  const [creatingTeacher, setCreatingTeacher] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Student diagnostic view
  const [selectedStudentForDetails, setSelectedStudentForDetails] = useState<any | null>(null);
  const [studentDetailsLoading, setStudentDetailsLoading] = useState(false);

  // Status message
  const [alertMessage, setAlertMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showAlert = (text: string, type: 'success' | 'error' = 'success') => {
    setAlertMessage({ text, type });
    setTimeout(() => setAlertMessage(null), 4000);
  };

  // Fetch overview
  const fetchOverview = async () => {
    try {
      const res = await fetch(apiUrl('/api/admin/overview'), {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setStats(data.stats);
      }
    } catch (err) {
      console.error('Error fetching admin overview:', err);
    }
  };

  // Fetch teachers
  const fetchTeachers = async () => {
    setTeachersLoading(true);
    try {
      const res = await fetch(apiUrl('/api/admin/teachers'), {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setTeachers(data.teachers || []);
      }
    } catch (err) {
      console.error('Error fetching teachers:', err);
    } finally {
      setTeachersLoading(false);
    }
  };

  // Fetch students
  const fetchStudents = async () => {
    setStudentsLoading(true);
    try {
      const res = await fetch(apiUrl('/api/admin/students'), {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setStudents(data.students || []);
      }
    } catch (err) {
      console.error('Error fetching students:', err);
    } finally {
      setStudentsLoading(false);
    }
  };

  useEffect(() => {
    fetchOverview();
    fetchTeachers();
    fetchStudents();
  }, [token]);

  // Handle "Go inside teacher account" (Impersonation)
  const handleImpersonateTeacher = async (teacher: TeacherItem) => {
    try {
      const res = await fetch(apiUrl(`/api/admin/impersonate/teacher/${teacher.id}`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل الدخول إلى حساب المعلم');

      impersonateUser(data.token, data.user);
    } catch (err: any) {
      showAlert(err.message, 'error');
    }
  };

  // Handle "Go inside student account" (Impersonation)
  const handleImpersonateStudent = async (studentId: string) => {
    try {
      const res = await fetch(apiUrl(`/api/admin/impersonate/student/${studentId}`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل الدخول إلى حساب الطالب');

      impersonateUser(data.token, data.user);
    } catch (err: any) {
      showAlert(err.message, 'error');
    }
  };

  // Open permissions editor
  const handleOpenPermissions = (teacher: TeacherItem) => {
    setSelectedTeacherForPerms(teacher);
    setEditPermissions({ ...teacher.permissions });
  };

  // Save updated permissions
  const handleSavePermissions = async () => {
    if (!selectedTeacherForPerms) return;
    setSavingPerms(true);
    try {
      const res = await fetch(apiUrl(`/api/admin/teachers/${selectedTeacherForPerms.id}/permissions`), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          permissions: editPermissions,
          is_active: editPermissions.is_active
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل حفظ الصلاحيات');

      showAlert('تم تحديث صلاحيات المعلم بنجاح', 'success');
      setSelectedTeacherForPerms(null);
      fetchTeachers();
    } catch (err: any) {
      showAlert(err.message, 'error');
    } finally {
      setSavingPerms(false);
    }
  };

  // Create new teacher
  const handleCreateTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingTeacher(true);
    setModalError(null);

    try {
      const res = await fetch(apiUrl('/api/admin/teachers'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          fullName: newTeacherData.fullName,
          email: newTeacherData.email,
          password: newTeacherData.password,
          specialization: newTeacherData.specialization,
          schoolName: newTeacherData.schoolName,
          permissions: {
            can_upload_books: newTeacherData.can_upload_books,
            can_create_exams: newTeacherData.can_create_exams,
            can_delete_content: newTeacherData.can_delete_content,
            can_view_analytics: newTeacherData.can_view_analytics,
            is_active: true
          }
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل إنشاء حساب المعلم');

      showAlert(`تم إنشاء حساب المعلم بنجاح بمعرّف هجين: ${data.teacher.hybrid_id}`, 'success');
      setAddTeacherModalOpen(false);
      setNewTeacherData({
        fullName: '',
        email: '',
        password: '',
        specialization: 'معلم أول علوم',
        schoolName: 'مدرسة المتفوقين الرسمية',
        can_upload_books: true,
        can_create_exams: true,
        can_delete_content: true,
        can_view_analytics: true
      });
      fetchTeachers();
      fetchOverview();
    } catch (err: any) {
      setModalError(err.message);
    } finally {
      setCreatingTeacher(false);
    }
  };

  // Inspect student details
  const handleInspectStudent = async (student: StudentItem) => {
    setStudentDetailsLoading(true);
    setSelectedStudentForDetails({ student, attempts: [], topicMastery: [] });
    try {
      const res = await fetch(apiUrl(`/api/admin/students/${student.id}/details`), {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedStudentForDetails(data);
      }
    } catch (err) {
      console.error('Error fetching student details:', err);
    } finally {
      setStudentDetailsLoading(false);
    }
  };

  // Filtered lists
  const filteredTeachers = teachers.filter(t => 
    t.fullName.toLowerCase().includes(teacherSearch.toLowerCase()) ||
    t.email.toLowerCase().includes(teacherSearch.toLowerCase()) ||
    t.hybrid_id.toLowerCase().includes(teacherSearch.toLowerCase()) ||
    t.specialization.toLowerCase().includes(teacherSearch.toLowerCase())
  );

  const filteredStudents = students.filter(s => 
    s.fullName.toLowerCase().includes(studentSearch.toLowerCase()) ||
    s.email.toLowerCase().includes(studentSearch.toLowerCase()) ||
    s.gradeNameAr.toLowerCase().includes(studentSearch.toLowerCase()) ||
    s.schoolName.toLowerCase().includes(studentSearch.toLowerCase())
  );

  return (
    <div className="container" style={{ padding: '2rem 1rem', maxWidth: '1280px', margin: '0 auto' }}>
      
      {/* Alert Banner */}
      {alertMessage && (
        <div style={{
          background: alertMessage.type === 'success' ? '#F0FDF4' : '#FEF2F2',
          border: `1px solid ${alertMessage.type === 'success' ? '#86EFAC' : '#FCA5A5'}`,
          color: alertMessage.type === 'success' ? '#15803D' : '#DC2626',
          padding: '0.85rem 1.25rem',
          borderRadius: 'var(--radius-md)',
          marginBottom: '1.5rem',
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
        }}>
          {alertMessage.type === 'success' ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
          <span>{alertMessage.text}</span>
        </div>
      )}

      {/* Header Banner with Modernized Admin Stats Cards */}
      <div className="card" style={{
        background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
        color: '#FFFFFF',
        padding: '2.25rem 2rem',
        borderRadius: 'var(--radius-xl)',
        marginBottom: '2rem',
        boxShadow: '0 16px 36px -10px rgba(15, 23, 42, 0.25)',
        position: 'relative',
        overflow: 'hidden',
        border: '1px solid rgba(255, 255, 255, 0.1)'
      }}>
        <div style={{ position: 'relative', zIndex: 2 }}>
          {/* Top Badges */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
            <span style={{
              background: '#F59E0B',
              color: '#78350F',
              fontSize: '0.8rem',
              fontWeight: 800,
              padding: '0.35rem 0.85rem',
              borderRadius: 'var(--radius-full)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              boxShadow: '0 2px 6px rgba(245, 158, 11, 0.3)'
            }}>
              👑 {language === 'ar' ? 'صلاحيات المالك الرئيسي (SuperAdmin)' : 'Owner / SuperAdmin'}
            </span>
            <span style={{
              background: 'rgba(255, 255, 255, 0.12)',
              color: '#E2E8F0',
              fontSize: '0.78rem',
              fontWeight: 700,
              padding: '0.35rem 0.85rem',
              borderRadius: 'var(--radius-full)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              border: '1px solid rgba(255, 255, 255, 0.15)'
            }}>
              <Database size={13} />
              superid: {user?.super_id || 'SUPER-ADMIN-001'}
            </span>
          </div>

          <h1 style={{ fontSize: '1.9rem', fontWeight: 800, margin: 0, color: '#FFFFFF', letterSpacing: '-0.01em' }}>
            {language === 'ar' ? 'بوابة الرقابة والإدارة المركزية' : 'Central Platform Administration'}
          </h1>
          <p style={{ color: '#94A3B8', marginTop: '0.5rem', maxWidth: '750px', lineHeight: 1.6, fontSize: '0.925rem' }}>
            {language === 'ar'
              ? 'إدارة شاملة لكافة حسابات المعلمين والطلاب، فحص المحتوى المنشور، التحكم الدقيق في صلاحيات المعلمين، والدخول الفوري لحساب أي مستخدم.'
              : 'Master dashboard for managing teacher accounts, inspecting student learning diagnostics, granting granular permissions, and instant account impersonation.'}
          </p>

          {/* Quick Metrics Bar (Redesigned Admin Stats Cards) */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
            gap: '1rem',
            marginTop: '1.75rem'
          }}>
            {/* Stat 1: Students */}
            <div style={{
              background: 'rgba(255, 255, 255, 0.08)',
              backdropFilter: 'blur(8px)',
              padding: '1.15rem 1.25rem',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              transition: 'transform var(--t-fast), border-color var(--t-fast)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.8rem', color: '#CBD5E1', fontWeight: 700 }}>
                  {language === 'ar' ? 'إجمالي الطلاب' : 'Total Students'}
                </span>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(56, 189, 248, 0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <GraduationCap size={17} color="#38BDF8" />
                </div>
              </div>
              <div style={{ fontSize: '2rem', fontWeight: 900, marginTop: '0.4rem', color: '#38BDF8', lineHeight: 1 }}>
                {stats.totalStudents}
              </div>
              <div style={{ fontSize: '0.72rem', color: '#94A3B8', marginTop: '0.35rem' }}>
                {language === 'ar' ? 'مسجلون بالمنظومة' : 'Active accounts'}
              </div>
            </div>

            {/* Stat 2: Teachers */}
            <div style={{
              background: 'rgba(255, 255, 255, 0.08)',
              backdropFilter: 'blur(8px)',
              padding: '1.15rem 1.25rem',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              transition: 'transform var(--t-fast), border-color var(--t-fast)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.8rem', color: '#CBD5E1', fontWeight: 700 }}>
                  {language === 'ar' ? 'حسابات المعلمين' : 'Total Teachers'}
                </span>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(167, 139, 250, 0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Users size={17} color="#A78BFA" />
                </div>
              </div>
              <div style={{ fontSize: '2rem', fontWeight: 900, marginTop: '0.4rem', color: '#A78BFA', lineHeight: 1 }}>
                {stats.totalTeachers}
              </div>
              <div style={{ fontSize: '0.72rem', color: '#94A3B8', marginTop: '0.35rem' }}>
                {language === 'ar' ? 'بمعرّفات هجينة' : 'Hybrid ID verified'}
              </div>
            </div>

            {/* Stat 3: Curriculum Books */}
            <div style={{
              background: 'rgba(255, 255, 255, 0.08)',
              backdropFilter: 'blur(8px)',
              padding: '1.15rem 1.25rem',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              transition: 'transform var(--t-fast), border-color var(--t-fast)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.8rem', color: '#CBD5E1', fontWeight: 700 }}>
                  {language === 'ar' ? 'الكتب والمناهج' : 'Curriculum Books'}
                </span>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(52, 211, 153, 0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <BookOpen size={17} color="#34D399" />
                </div>
              </div>
              <div style={{ fontSize: '2rem', fontWeight: 900, marginTop: '0.4rem', color: '#34D399', lineHeight: 1 }}>
                {stats.totalBooks}
              </div>
              <div style={{ fontSize: '0.72rem', color: '#94A3B8', marginTop: '0.35rem' }}>
                {language === 'ar' ? 'مفهرسة بالكامل' : 'AI vector indexed'}
              </div>
            </div>

            {/* Stat 4: Active Exams */}
            <div style={{
              background: 'rgba(255, 255, 255, 0.08)',
              backdropFilter: 'blur(8px)',
              padding: '1.15rem 1.25rem',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              transition: 'transform var(--t-fast), border-color var(--t-fast)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.8rem', color: '#CBD5E1', fontWeight: 700 }}>
                  {language === 'ar' ? 'الاختبارات المنشورة' : 'Active Exams'}
                </span>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(251, 191, 36, 0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <FileText size={17} color="#FBBF24" />
                </div>
              </div>
              <div style={{ fontSize: '2rem', fontWeight: 900, marginTop: '0.4rem', color: '#FBBF24', lineHeight: 1 }}>
                {stats.totalExams}
              </div>
              <div style={{ fontSize: '0.72rem', color: '#94A3B8', marginTop: '0.35rem' }}>
                {language === 'ar' ? 'بمؤقت زمني وتصحيح' : 'Live timed quizzes'}
              </div>
            </div>

            {/* Stat 5: Exam Attempts */}
            <div style={{
              background: 'rgba(255, 255, 255, 0.08)',
              backdropFilter: 'blur(8px)',
              padding: '1.15rem 1.25rem',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              transition: 'transform var(--t-fast), border-color var(--t-fast)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.8rem', color: '#CBD5E1', fontWeight: 700 }}>
                  {language === 'ar' ? 'محاولات التقييم' : 'Student Attempts'}
                </span>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(244, 114, 182, 0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <TrendingUp size={17} color="#F472B6" />
                </div>
              </div>
              <div style={{ fontSize: '2rem', fontWeight: 900, marginTop: '0.4rem', color: '#F472B6', lineHeight: 1 }}>
                {stats.totalExamAttempts}
              </div>
              <div style={{ fontSize: '0.72rem', color: '#94A3B8', marginTop: '0.35rem' }}>
                {language === 'ar' ? 'بتشخيص تربوي فوري' : 'Automated evaluations'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modern Tabs Navigation */}
      <div style={{
        display: 'flex',
        gap: '0.5rem',
        borderBottom: '2px solid var(--border-light)',
        marginBottom: '1.75rem',
        flexWrap: 'wrap'
      }}>
        <button
          className={`tab-btn ${activeTab === 'hierarchy' ? 'active' : ''}`}
          onClick={() => setActiveTab('hierarchy')}
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.95rem', padding: '0.75rem 1.25rem', fontWeight: 700 }}
        >
          <ShieldCheck size={17} />
          <span>{language === 'ar' ? 'الهيكل الرقابي والجمهوري (الأمين المركزي والمحافظات)' : 'Supervisory Hierarchy'}</span>
        </button>

        <button
          className={`tab-btn ${activeTab === 'teachers' ? 'active' : ''}`}
          onClick={() => setActiveTab('teachers')}
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.95rem', padding: '0.75rem 1.25rem', fontWeight: 700 }}
        >
          <Users size={17} />
          <span>{language === 'ar' ? `إدارة المعلمين (${teachers.length})` : `Teachers (${teachers.length})`}</span>
        </button>

        <button
          className={`tab-btn ${activeTab === 'students' ? 'active' : ''}`}
          onClick={() => setActiveTab('students')}
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.95rem', padding: '0.75rem 1.25rem', fontWeight: 700 }}
        >
          <GraduationCap size={17} />
          <span>{language === 'ar' ? `إدارة ومتابعة الطلاب (${students.length})` : `Students (${students.length})`}</span>
        </button>

        <button
          className={`tab-btn ${activeTab === 'architecture' ? 'active' : ''}`}
          onClick={() => setActiveTab('architecture')}
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.95rem', padding: '0.75rem 1.25rem', fontWeight: 700 }}
        >
          <Database size={17} />
          <span>{language === 'ar' ? 'معمارية المعرّفات (superid / hybrid_id / id)' : 'ID Architecture'}</span>
        </button>
      </div>

      {/* TAB 0: HIERARCHY MANAGEMENT */}
      {activeTab === 'hierarchy' && (
        <HierarchyDashboard />
      )}

      {/* TAB 1: TEACHERS MANAGEMENT */}
      {activeTab === 'teachers' && (
        <div>
          {/* Top Actions: Search + Add Teacher Button */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: '240px', maxWidth: '420px' }}>
              <Search size={16} style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', right: language === 'ar' ? '0.85rem' : 'auto', left: language === 'en' ? '0.85rem' : 'auto', color: 'var(--text-muted)' }} />
              <input
                type="text"
                className="form-input"
                value={teacherSearch}
                onChange={(e) => setTeacherSearch(e.target.value)}
                placeholder={language === 'ar' ? 'بحث بالاسم، البريد، أو المعرّف الهجين...' : 'Search teachers...'}
                style={{ paddingRight: language === 'ar' ? '2.5rem' : '0.85rem', paddingLeft: language === 'en' ? '2.5rem' : '0.85rem' }}
              />
            </div>

            <button
              className="btn btn-primary"
              onClick={() => setAddTeacherModalOpen(true)}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 800, padding: '0.65rem 1.25rem' }}
            >
              <Plus size={18} />
              <span>{language === 'ar' ? 'إضافة معلم جديد' : 'Add New Teacher'}</span>
            </button>
          </div>

          {/* Teachers Cards List */}
          {teachersLoading ? (
            <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
              {language === 'ar' ? 'جاري تحميل قائمة المعلمين...' : 'Loading teachers list...'}
            </div>
          ) : filteredTeachers.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
              {language === 'ar' ? 'لا يوجد معلمين مطابقين للبحث.' : 'No teachers matching search.'}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1.25rem' }}>
              {filteredTeachers.map(teacher => (
                <div key={teacher.id} className="card" style={{
                  padding: '1.5rem',
                  border: teacher.isActive ? '1px solid var(--border-light)' : '1.5px solid #FCA5A5',
                  background: teacher.isActive ? 'var(--bg-card)' : '#FEF2F2',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '1rem',
                  boxShadow: 'var(--shadow-sm)',
                  borderRadius: 'var(--radius-lg)'
                }}>
                  <div>
                    {/* Header: Name + hybrid_id */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.5rem' }}>
                      <div>
                        <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0, color: 'var(--text-title)' }}>
                          {teacher.fullName}
                        </h3>
                        <span style={{ fontSize: '0.825rem', color: 'var(--text-muted)', display: 'block', marginTop: '0.2rem' }}>
                          {teacher.email}
                        </span>
                      </div>
                      <span style={{
                        background: '#EEF2FF',
                        color: '#4F46E5',
                        border: '1px solid #C7D2FE',
                        padding: '0.2rem 0.6rem',
                        borderRadius: 'var(--radius-full)',
                        fontSize: '0.72rem',
                        fontWeight: 800,
                        fontFamily: 'monospace'
                      }}>
                        {teacher.hybrid_id}
                      </span>
                    </div>

                    {/* School and specialization */}
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-body)', marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <School size={14} color="var(--primary-600)" />
                        <span>{teacher.schoolName}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <BookOpen size={14} color="var(--primary-600)" />
                        <span style={{ fontWeight: 600 }}>{teacher.specialization}</span>
                      </div>
                    </div>

                    {/* Stats */}
                    <div style={{ display: 'flex', gap: '1rem', marginTop: '0.85rem', padding: '0.65rem 0', borderTop: '1px solid var(--border-light)', borderBottom: '1px solid var(--border-light)', fontSize: '0.825rem' }}>
                      <div>
                        <span style={{ color: 'var(--text-muted)' }}>{language === 'ar' ? 'الكتب: ' : 'Books: '}</span>
                        <strong>{teacher.booksCount}</strong>
                      </div>
                      <div>
                        <span style={{ color: 'var(--text-muted)' }}>{language === 'ar' ? 'الامتحانات: ' : 'Exams: '}</span>
                        <strong>{teacher.examsCount}</strong>
                      </div>
                      <div>
                        <span style={{ color: 'var(--text-muted)' }}>{language === 'ar' ? 'الحالة: ' : 'Status: '}</span>
                        <span style={{ color: teacher.isActive ? '#16A34A' : '#DC2626', fontWeight: 700 }}>
                          {teacher.isActive ? (language === 'ar' ? 'نشط' : 'Active') : (language === 'ar' ? 'معطّل' : 'Suspended')}
                        </span>
                      </div>
                    </div>

                    {/* Permissions summary badges */}
                    <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
                      <span style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', borderRadius: '4px', background: teacher.permissions.can_upload_books ? '#DCFCE7' : '#F3F4F6', color: teacher.permissions.can_upload_books ? '#15803D' : '#9CA3AF', fontWeight: 700 }}>
                        {teacher.permissions.can_upload_books ? (language === 'ar' ? '✓ رفع كتب' : '✓ Upload Books') : (language === 'ar' ? '✕ منع الكتب' : '✕ No Books')}
                      </span>
                      <span style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', borderRadius: '4px', background: teacher.permissions.can_create_exams ? '#DCFCE7' : '#F3F4F6', color: teacher.permissions.can_create_exams ? '#15803D' : '#9CA3AF', fontWeight: 700 }}>
                        {teacher.permissions.can_create_exams ? (language === 'ar' ? '✓ امتحانات' : '✓ Exams') : (language === 'ar' ? '✕ منع الامتحانات' : '✕ No Exams')}
                      </span>
                      <span style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', borderRadius: '4px', background: teacher.permissions.can_view_analytics ? '#DCFCE7' : '#F3F4F6', color: teacher.permissions.can_view_analytics ? '#15803D' : '#9CA3AF', fontWeight: 700 }}>
                        {teacher.permissions.can_view_analytics ? (language === 'ar' ? '✓ تحليلات' : '✓ Analytics') : (language === 'ar' ? '✕ حجب التحليلات' : '✕ No Analytics')}
                      </span>
                    </div>
                  </div>

                  {/* Actions: Impersonate + Permissions */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '0.5rem' }}>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleImpersonateTeacher(teacher)}
                      style={{ fontWeight: 800, fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}
                      title={language === 'ar' ? 'الدخول مباشرة إلى حساب هذا المعلم وإدارة كتبه وامتحاناته' : 'Login directly into this teacher account'}
                    >
                      <ExternalLink size={14} />
                      <span>{language === 'ar' ? 'دخول حسابه' : 'Enter Account'}</span>
                    </button>

                    <button
                      className="btn btn-outline btn-sm"
                      onClick={() => handleOpenPermissions(teacher)}
                      style={{ fontWeight: 700, fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}
                    >
                      <Settings size={14} />
                      <span>{language === 'ar' ? 'الصلاحيات' : 'Permissions'}</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: STUDENTS MANAGEMENT */}
      {activeTab === 'students' && (
        <div>
          {/* Search bar */}
          <div style={{ marginBottom: '1.5rem', maxWidth: '450px' }}>
            <div style={{ position: 'relative' }}>
              <Search size={16} style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', right: language === 'ar' ? '0.85rem' : 'auto', left: language === 'en' ? '0.85rem' : 'auto', color: 'var(--text-muted)' }} />
              <input
                type="text"
                className="form-input"
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                placeholder={language === 'ar' ? 'بحث باسم الطالب، الصف، أو المدرسة...' : 'Search students...'}
                style={{ paddingRight: language === 'ar' ? '2.5rem' : '0.85rem', paddingLeft: language === 'en' ? '2.5rem' : '0.85rem' }}
              />
            </div>
          </div>

          {studentsLoading ? (
            <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
              {language === 'ar' ? 'جاري تحميل بيانات الطلاب...' : 'Loading students data...'}
            </div>
          ) : filteredStudents.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
              {language === 'ar' ? 'لا يوجد طلاب مطابقين للبحث.' : 'No students matching search.'}
            </div>
          ) : (
            <div style={{ overflowX: 'auto', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-light)', boxShadow: 'var(--shadow-sm)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', background: '#FFFFFF' }}>
                <thead>
                  <tr style={{ background: '#F8FAFC', borderBottom: '1px solid var(--border-light)', textAlign: language === 'ar' ? 'right' : 'left' }}>
                    <th style={{ padding: '0.85rem 1rem', fontSize: '0.825rem', fontWeight: 800, color: 'var(--text-title)' }}>
                      {language === 'ar' ? 'اسم الطالب والبريد' : 'Student & Email'}
                    </th>
                    <th style={{ padding: '0.85rem 1rem', fontSize: '0.825rem', fontWeight: 800, color: 'var(--text-title)' }}>
                      {language === 'ar' ? 'المعرف القياسي (id)' : 'Standard ID (id)'}
                    </th>
                    <th style={{ padding: '0.85rem 1rem', fontSize: '0.825rem', fontWeight: 800, color: 'var(--text-title)' }}>
                      {language === 'ar' ? 'المرحلة والصف' : 'Stage & Grade'}
                    </th>
                    <th style={{ padding: '0.85rem 1rem', fontSize: '0.825rem', fontWeight: 800, color: 'var(--text-title)' }}>
                      {language === 'ar' ? 'نوع المدرسة' : 'School Type'}
                    </th>
                    <th style={{ padding: '0.85rem 1rem', fontSize: '0.825rem', fontWeight: 800, color: 'var(--text-title)' }}>
                      {language === 'ar' ? 'المحاولات والدرجة' : 'Attempts & Score'}
                    </th>
                    <th style={{ padding: '0.85rem 1rem', fontSize: '0.825rem', fontWeight: 800, color: 'var(--text-title)', textAlign: 'center' }}>
                      {language === 'ar' ? 'الإجراءات' : 'Actions'}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.map(student => (
                    <tr key={student.id} style={{ borderBottom: '1px solid var(--border-light)', transition: 'background var(--t-fast)' }}>
                      <td style={{ padding: '0.85rem 1rem' }}>
                        <div style={{ fontWeight: 800, color: 'var(--text-title)' }}>{student.fullName}</div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{student.email}</div>
                      </td>
                      <td style={{ padding: '0.85rem 1rem' }}>
                        <code style={{ fontSize: '0.72rem', background: '#F1F5F9', padding: '0.2rem 0.4rem', borderRadius: '4px' }}>
                          {student.id.substring(0, 8)}...
                        </code>
                      </td>
                      <td style={{ padding: '0.85rem 1rem', fontSize: '0.85rem' }}>
                        <div style={{ fontWeight: 700 }}>{student.gradeNameAr}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{student.stageNameAr}</div>
                      </td>
                      <td style={{ padding: '0.85rem 1rem', fontSize: '0.825rem' }}>
                        <span className={`badge ${student.schoolType === 'لغات' ? 'badge-primary' : ''}`}>
                          {student.schoolType === 'لغات' 
                            ? (language === 'ar' ? '🌐 لغات' : '🌐 Language') 
                            : (language === 'ar' ? '🏫 عربي' : '🏫 Arabic')}
                        </span>
                      </td>
                      <td style={{ padding: '0.85rem 1rem', fontSize: '0.85rem' }}>
                        <div><strong>{student.attemptsCount}</strong> {language === 'ar' ? 'امتحانات' : 'exams'}</div>
                        {student.avgScore !== null && (
                          <div style={{ fontSize: '0.75rem', color: '#16A34A', fontWeight: 700 }}>
                            {language === 'ar' ? 'متوسط: ' : 'Avg: '}{student.avgScore}%
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
                        <div style={{ display: 'inline-flex', gap: '0.4rem' }}>
                          <button
                            className="btn btn-outline btn-sm"
                            onClick={() => handleInspectStudent(student)}
                            style={{ fontSize: '0.78rem', padding: '0.35rem 0.75rem' }}
                          >
                            {language === 'ar' ? '📊 التشخيص' : '📊 Diagnosis'}
                          </button>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleImpersonateStudent(student.id)}
                            style={{ fontSize: '0.78rem', padding: '0.35rem 0.75rem', fontWeight: 700 }}
                            title={language === 'ar' ? 'دخول حساب الطالب لمعاينة لوحته كطالب' : 'Login into student dashboard'}
                          >
                            {language === 'ar' ? '👁️ حسابه' : '👁️ Account'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: ID ARCHITECTURE & DB SCHEMA DOCUMENTATION */}
      {activeTab === 'architecture' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div className="card" style={{ padding: '2rem 1.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <Database size={22} color="var(--primary-600)" />
              <h2 style={{ fontSize: '1.35rem', fontWeight: 800, margin: 0, color: 'var(--text-title)' }}>
                {language === 'ar' ? 'معمارية المعرّفات تمهيداً لقاعدة البيانات السحابية' : 'Future Database ID Architecture'}
              </h2>
            </div>

            <p style={{ color: 'var(--text-body)', lineHeight: 1.7, fontSize: '0.925rem' }}>
              وفقاً للتصميم المعتمد، تم ضبط بنية المعرّفات في النظام للتوافق التام مع الترحيل المستقبلي لقاعدة البيانات الإنتاجية السحابية:
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem', marginTop: '1.25rem' }}>
              {/* Owner */}
              <div style={{ border: '1.5px solid #FCD34D', borderRadius: 'var(--radius-lg)', padding: '1.35rem', background: '#FFFDF5' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#B45309', fontWeight: 800, fontSize: '1.05rem' }}>
                  <span>👑 المالك والمدير العام (Owner / SuperAdmin)</span>
                </div>
                <div style={{ marginTop: '0.75rem', fontSize: '0.875rem', color: '#78350F', lineHeight: 1.6 }}>
                  • <strong>صيغة المعرف:</strong> <code>superid</code> (مثل <code>SUPER-ADMIN-001</code>)
                  <br />
                  • <strong>الوظيفة:</strong> معرّف فائق يمتلك صلاحية الرقابة المطلقة، تعديل صلاحيات المعلمين، والدخول في أي حساب ("go inside it").
                </div>
              </div>

              {/* Teacher */}
              <div style={{ border: '1.5px solid #C7D2FE', borderRadius: 'var(--radius-lg)', padding: '1.35rem', background: '#F5F7FF' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#4338CA', fontWeight: 800, fontSize: '1.05rem' }}>
                  <span>👩‍🏫 المعلم (Teacher)</span>
                </div>
                <div style={{ marginTop: '0.75rem', fontSize: '0.875rem', color: '#312E81', lineHeight: 1.6 }}>
                  • <strong>صيغة المعرف:</strong> <code>hybrid_id</code> (مثل <code>HYBRID-TEA-SCI-01</code>)
                  <br />
                  • <strong>الوظيفة:</strong> معرّف هجين مركب يربط كود المعلم وتخصصه ومدرسته، ويخضع للتحكم في الصلاحيات بواسطة الإدارة.
                </div>
              </div>

              {/* Student */}
              <div style={{ border: '1.5px solid #A7F3D0', borderRadius: 'var(--radius-lg)', padding: '1.35rem', background: '#F0FDF4' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#065F46', fontWeight: 800, fontSize: '1.05rem' }}>
                  <span>👨‍🎓 الطالب (Student)</span>
                </div>
                <div style={{ marginTop: '0.75rem', fontSize: '0.875rem', color: '#064E3B', lineHeight: 1.6 }}>
                  • <strong>صيغة المعرف:</strong> <code>id</code> فقط (UUID قياسي بسيط)
                  <br />
                  • <strong>الوظيفة:</strong> معرّف بسيط ومباشر دون تركيب هجين، لضمان السرعة والعزل الصارم حسب الصف والمرحلة.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1: PERMISSIONS EDITOR */}
      {selectedTeacherForPerms && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 200,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem'
        }}>
          <div className="card" style={{ width: '100%', maxWidth: '500px', padding: '1.75rem', borderRadius: 'var(--radius-xl)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0 }}>
                  {language === 'ar' ? `صلاحيات المعلم: ${selectedTeacherForPerms.fullName}` : `Teacher Permissions: ${selectedTeacherForPerms.fullName}`}
                </h3>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  {language === 'ar' ? 'المعرّف الهجين: ' : 'Hybrid ID: '}{selectedTeacherForPerms.hybrid_id}
                </span>
              </div>
              <button
                onClick={() => setSelectedTeacherForPerms(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
              {/* Permission: Upload Books */}
              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem', background: '#F8FAFC', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>
                    {language === 'ar' ? 'رفع ومعالجة كتب المناهج (PDF)' : 'Upload & Process Textbooks (PDF)'}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {language === 'ar' ? 'السماح للمعلم برفع الكتب واستخراج المتجهات' : 'Allow teacher to upload textbooks and extract semantic vectors'}
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={Boolean(editPermissions.can_upload_books)}
                  onChange={(e) => setEditPermissions({ ...editPermissions, can_upload_books: e.target.checked })}
                  style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                />
              </label>

              {/* Permission: Create Exams */}
              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem', background: '#F8FAFC', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>
                    {language === 'ar' ? 'إنشاء وتصميم الاختبارات الدورية' : 'Build Periodic Exams & Quizzes'}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {language === 'ar' ? 'السماح للمعلم بتصميم امتحانات بمؤقت للطلاب' : 'Allow teacher to build timed exams for students'}
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={Boolean(editPermissions.can_create_exams)}
                  onChange={(e) => setEditPermissions({ ...editPermissions, can_create_exams: e.target.checked })}
                  style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                />
              </label>

              {/* Permission: Delete Content */}
              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem', background: '#F8FAFC', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>
                    {language === 'ar' ? 'حذف وتعديل المحتوى' : 'Delete & Edit Content'}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {language === 'ar' ? 'إمكانية حذف الكتب والأسئلة القديمة' : 'Ability to delete obsolete textbooks & questions'}
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={Boolean(editPermissions.can_delete_content)}
                  onChange={(e) => setEditPermissions({ ...editPermissions, can_delete_content: e.target.checked })}
                  style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                />
              </label>

              {/* Permission: View Analytics */}
              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem', background: '#F8FAFC', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>
                    {language === 'ar' ? 'الاطلاع على تحليلات ونتائج الطلاب' : 'View Student Results & Analytics'}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {language === 'ar' ? 'استعراض نسب إتقان الفصول ومحاولات الطلاب' : 'Inspect chapter mastery rates and attempts'}
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={Boolean(editPermissions.can_view_analytics)}
                  onChange={(e) => setEditPermissions({ ...editPermissions, can_view_analytics: e.target.checked })}
                  style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                />
              </label>

              {/* Account Status: Active/Suspended */}
              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem', background: editPermissions.is_active ? '#F0FDF4' : '#FEF2F2', border: editPermissions.is_active ? '1px solid #BBF7D0' : '1px solid #FECACA', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', color: editPermissions.is_active ? '#15803D' : '#DC2626' }}>
                    {editPermissions.is_active 
                      ? (language === 'ar' ? 'الحساب نشط ويستطيع الدخول' : 'Account is Active') 
                      : (language === 'ar' ? 'الحساب مجمّد وموقوف عن العمل' : 'Account is Suspended')}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {language === 'ar' ? 'تجميد حساب المعلم فورياً يمنع تسجيل دخوله' : 'Suspending a teacher account immediately revokes login access'}
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={Boolean(editPermissions.is_active)}
                  onChange={(e) => setEditPermissions({ ...editPermissions, is_active: e.target.checked })}
                  style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                />
              </label>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                className="btn btn-outline"
                onClick={() => setSelectedTeacherForPerms(null)}
                disabled={savingPerms}
              >
                {language === 'ar' ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                className="btn btn-primary"
                onClick={handleSavePermissions}
                disabled={savingPerms}
                style={{ fontWeight: 800 }}
              >
                {savingPerms 
                  ? (language === 'ar' ? 'جاري الحفظ...' : 'Saving...') 
                  : (language === 'ar' ? 'حفظ الصلاحيات' : 'Save Permissions')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: ADD TEACHER */}
      {addTeacherModalOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 200,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem'
        }}>
          <div className="card" style={{ width: '100%', maxWidth: '520px', maxHeight: '90vh', overflowY: 'auto', padding: '1.75rem', borderRadius: 'var(--radius-xl)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0 }}>
                  {language === 'ar' ? 'إضافة حساب معلم جديد (بالمعرّف الهجين)' : 'Add New Teacher (Hybrid ID)'}
                </h3>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  {language === 'ar' ? 'سيتم توليد hybrid_id تلقائياً وتعيين الصلاحيات' : 'hybrid_id will be auto-generated with default permissions'}
                </span>
              </div>
              <button
                onClick={() => setAddTeacherModalOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                <X size={20} />
              </button>
            </div>

            {modalError && (
              <div style={{ background: 'var(--danger-50)', color: 'var(--danger-600)', padding: '0.75rem', borderRadius: 'var(--radius-md)', fontSize: '0.85rem', marginBottom: '1rem' }}>
                {modalError}
              </div>
            )}

            <form onSubmit={handleCreateTeacher}>
              <div className="form-group">
                <label className="form-label">{language === 'ar' ? 'الاسم ثلاثي للمعلم' : 'Teacher Full Name'}</label>
                <input
                  type="text"
                  required
                  className="form-input"
                  value={newTeacherData.fullName}
                  onChange={(e) => setNewTeacherData({ ...newTeacherData, fullName: e.target.value })}
                  placeholder={language === 'ar' ? 'أ. شريف محمود عبد الله' : 'e.g. Sherif Mahmoud'}
                />
              </div>

              <div className="responsive-form-grid-2">
                <div className="form-group">
                  <label className="form-label">{language === 'ar' ? 'البريد الإلكتروني' : 'Email Address'}</label>
                  <input
                    type="email"
                    required
                    className="form-input"
                    value={newTeacherData.email}
                    onChange={(e) => setNewTeacherData({ ...newTeacherData, email: e.target.value })}
                    placeholder="sherif.teacher@edu.eg"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">{language === 'ar' ? 'كلمة المرور' : 'Password'}</label>
                  <input
                    type="password"
                    required
                    className="form-input"
                    value={newTeacherData.password}
                    onChange={(e) => setNewTeacherData({ ...newTeacherData, password: e.target.value })}
                    placeholder="••••••••"
                  />
                </div>
              </div>

              <div className="responsive-form-grid-2">
                <div className="form-group">
                  <label className="form-label">{language === 'ar' ? 'التخصص التعليمي' : 'Specialization'}</label>
                  <input
                    type="text"
                    required
                    className="form-input"
                    value={newTeacherData.specialization}
                    onChange={(e) => setNewTeacherData({ ...newTeacherData, specialization: e.target.value })}
                    placeholder={language === 'ar' ? 'معلم أول علوم' : 'Science Teacher'}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">{language === 'ar' ? 'المدرسة التابع لها' : 'School Name'}</label>
                  <input
                    type="text"
                    required
                    className="form-input"
                    value={newTeacherData.schoolName}
                    onChange={(e) => setNewTeacherData({ ...newTeacherData, schoolName: e.target.value })}
                    placeholder={language === 'ar' ? 'مدرسة النيل الإعدادية' : 'Nile Prep School'}
                  />
                </div>
              </div>

              <div style={{ marginTop: '0.5rem', marginBottom: '1.25rem' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.5rem' }}>
                  {language === 'ar' ? 'الصلاحيات الأولية الممنوحة:' : 'Initial Permissions Granted:'}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.8rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={newTeacherData.can_upload_books}
                      onChange={(e) => setNewTeacherData({ ...newTeacherData, can_upload_books: e.target.checked })}
                    />
                    <span>{language === 'ar' ? 'رفع ومعالجة الكتب' : 'Upload Books'}</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={newTeacherData.can_create_exams}
                      onChange={(e) => setNewTeacherData({ ...newTeacherData, can_create_exams: e.target.checked })}
                    />
                    <span>{language === 'ar' ? 'تصميم الامتحانات' : 'Build Exams'}</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={newTeacherData.can_view_analytics}
                      onChange={(e) => setNewTeacherData({ ...newTeacherData, can_view_analytics: e.target.checked })}
                    />
                    <span>{language === 'ar' ? 'الاطلاع على التحليلات' : 'View Analytics'}</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={newTeacherData.can_delete_content}
                      onChange={(e) => setNewTeacherData({ ...newTeacherData, can_delete_content: e.target.checked })}
                    />
                    <span>{language === 'ar' ? 'حذف المحتوى' : 'Delete Content'}</span>
                  </label>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setAddTeacherModalOpen(false)}
                  disabled={creatingTeacher}
                >
                  {language === 'ar' ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={creatingTeacher}
                  style={{ fontWeight: 800 }}
                >
                  {creatingTeacher 
                    ? (language === 'ar' ? 'جاري الإنشاء...' : 'Creating...') 
                    : (language === 'ar' ? 'إنشاء حساب المعلم' : 'Create Teacher Account')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: STUDENT INSPECT & DIAGNOSTICS */}
      {selectedStudentForDetails && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 200,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem'
        }}>
          <div className="card" style={{ width: '100%', maxWidth: '640px', maxHeight: '90vh', overflowY: 'auto', padding: '1.75rem', borderRadius: 'var(--radius-xl)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
              <div>
                <h3 style={{ fontSize: '1.3rem', fontWeight: 800, margin: 0 }}>
                  {language === 'ar' ? `تقرير الطالب: ${selectedStudentForDetails.student?.fullName || selectedStudentForDetails.student?.full_name}` : `Student Report: ${selectedStudentForDetails.student?.fullName || selectedStudentForDetails.student?.full_name}`}
                </h3>
                <div style={{ fontSize: '0.825rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                  {language === 'ar' ? 'المعرف: ' : 'ID: '}<code>{selectedStudentForDetails.student?.id}</code> • {selectedStudentForDetails.student?.grade_name_ar || selectedStudentForDetails.student?.gradeNameAr}
                </div>
              </div>
              <button
                onClick={() => setSelectedStudentForDetails(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                <X size={20} />
              </button>
            </div>

            {studentDetailsLoading ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                {language === 'ar' ? 'جاري جلب سجلات الطالب...' : 'Loading student records...'}
              </div>
            ) : (
              <div>
                {/* Recent Exam Attempts */}
                <h4 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '0.75rem', color: 'var(--text-title)' }}>
                  {language === 'ar' ? 'سجل الامتحانات المكتملة:' : 'Completed Exam History:'}
                </h4>
                {selectedStudentForDetails.attempts && selectedStudentForDetails.attempts.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.5rem' }}>
                    {selectedStudentForDetails.attempts.map((att: any) => (
                      <div key={att.id} style={{ padding: '0.75rem', background: '#F8FAFC', borderRadius: 'var(--radius-md)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '0.875rem' }}>{att.exam_title}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{att.completed_at ? new Date(att.completed_at).toLocaleDateString(language === 'ar' ? 'ar-EG' : 'en-US') : (language === 'ar' ? 'مكتمل' : 'Completed')}</div>
                        </div>
                        <span style={{ fontWeight: 800, color: '#16A34A', fontSize: '1.1rem' }}>
                          {att.score}%
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ padding: '1rem', background: '#F8FAFC', borderRadius: 'var(--radius-md)', color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
                    {language === 'ar' ? 'لم يقم الطالب بأي محاولات اختبارات حتى الآن.' : 'No attempts recorded for this student yet.'}
                  </div>
                )}

                {/* Topic Mastery */}
                <h4 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '0.75rem', color: 'var(--text-title)' }}>
                  {language === 'ar' ? 'مستوى إتقان الفصول الدراسية:' : 'Chapter Mastery Levels:'}
                </h4>
                {selectedStudentForDetails.topicMastery && selectedStudentForDetails.topicMastery.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.5rem' }}>
                    {selectedStudentForDetails.topicMastery.map((tm: any) => (
                      <div key={tm.id} style={{ padding: '0.75rem', background: '#F8FAFC', borderRadius: 'var(--radius-md)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '0.875rem' }}>
                          <span>{tm.subject_name_ar} • {tm.chapter_title_ar}</span>
                          <span style={{ color: 'var(--primary-700)' }}>{tm.mastery_percentage}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ padding: '1rem', background: '#F8FAFC', borderRadius: 'var(--radius-md)', color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
                    {language === 'ar' ? 'لا توجد بيانات إتقان مسجلة بعد.' : 'No mastery data recorded yet.'}
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                  <button
                    className="btn btn-secondary"
                    onClick={() => {
                      const stId = selectedStudentForDetails.student?.id;
                      setSelectedStudentForDetails(null);
                      handleImpersonateStudent(stId);
                    }}
                    style={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                  >
                    <ExternalLink size={15} />
                    <span>{language === 'ar' ? 'دخول حساب الطالب بالكامل' : 'Enter Student Dashboard'}</span>
                  </button>
                  <button
                    className="btn btn-outline"
                    onClick={() => setSelectedStudentForDetails(null)}
                  >
                    {language === 'ar' ? 'إغلاق' : 'Close'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
};
