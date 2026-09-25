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
  ShieldCheck,
  Sliders
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

  const [activeTab, setActiveTab] = useState<'hierarchy' | 'teachers' | 'students'>('hierarchy');

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

  // Monthly Exam Limit State
  const [monthlyLimit, setMonthlyLimit] = useState<number>(10);
  const [limitModalOpen, setLimitModalOpen] = useState<boolean>(false);
  const [newLimitInput, setNewLimitInput] = useState<string>('10');
  const [limitLoading, setLimitLoading] = useState<boolean>(false);

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
        if (data.stats?.monthlyExamLimit) {
          setMonthlyLimit(data.stats.monthlyExamLimit);
          setNewLimitInput(String(data.stats.monthlyExamLimit));
        }
      }
    } catch (err) {
      console.error('Error fetching admin overview:', err);
    }
  };

  const handleSaveMonthlyLimit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseInt(newLimitInput, 10);
    if (isNaN(parsed) || parsed < 1) {
      showAlert('الرجاء إدخال رقم صحيح موجب للحد الأقصى', 'error');
      return;
    }
    setLimitLoading(true);
    try {
      const res = await fetch(apiUrl('/api/admin/monthly-exam-limit'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ limit: parsed })
      });
      const data = await res.json();
      if (res.ok) {
        setMonthlyLimit(data.limit || parsed);
        setLimitModalOpen(false);
        showAlert(`تم تحديث الحد الأقصى للاختبارات شهرياً بنجاح إلى ${data.limit || parsed} اختباراً لكل طالب.`, 'success');
        fetchOverview();
      } else {
        showAlert(data.error || 'فشل تحديث الحد الأقصى', 'error');
      }
    } catch (err: any) {
      showAlert('خطأ في الاتصال بالخادم', 'error');
    } finally {
      setLimitLoading(false);
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
        background: 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 50%, #EFF6FF 100%)',
        color: 'var(--text-title)',
        padding: '2.25rem 2rem',
        borderRadius: 'var(--radius-xl)',
        marginBottom: '2rem',
        boxShadow: '0 10px 30px -10px rgba(37, 99, 235, 0.08)',
        position: 'relative',
        overflow: 'hidden',
        border: '1.5px solid var(--primary-100)'
      }}>
        <div style={{ position: 'relative', zIndex: 2 }}>
          {/* Top Badges */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
            <span style={{
              background: '#FEF3C7',
              color: '#92400E',
              fontSize: '0.8rem',
              fontWeight: 800,
              padding: '0.35rem 0.85rem',
              borderRadius: 'var(--radius-full)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              border: '1px solid #FDE68A',
              boxShadow: '0 2px 6px rgba(245, 158, 11, 0.15)'
            }}>
              👑 {language === 'ar' ? 'صلاحيات المالك الرئيسي (SuperAdmin)' : 'Owner / SuperAdmin'}
            </span>
            <span style={{
              background: 'var(--primary-50)',
              color: 'var(--primary-700)',
              fontSize: '0.78rem',
              fontWeight: 700,
              padding: '0.35rem 0.85rem',
              borderRadius: 'var(--radius-full)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              border: '1px solid var(--primary-200)'
            }}>
              <Database size={13} />
              superid: {user?.super_id || 'SUPER-ADMIN-001'}
            </span>
          </div>

          <h1 style={{ fontSize: '1.9rem', fontWeight: 800, margin: 0, color: 'var(--text-title)', letterSpacing: '-0.01em' }}>
            {language === 'ar' ? 'بوابة الرقابة والإدارة المركزية' : 'Central Platform Administration'}
          </h1>
          <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem', maxWidth: '750px', lineHeight: 1.6, fontSize: '0.925rem' }}>
            {language === 'ar'
              ? 'إدارة شاملة لكافة حسابات المعلمين والطلاب، فحص المحتوى المنشور، التحكم الدقيق في صلاحيات المعلمين، والدخول الفوري لحساب أي مستخدم.'
              : 'Master dashboard for managing teacher accounts, inspecting student learning diagnostics, granting granular permissions, and instant account impersonation.'}
          </p>

          {/* Quick Metrics Bar (Bright Light Stats Cards) */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
            gap: '1rem',
            marginTop: '1.75rem'
          }}>
            {/* Stat 1: Students */}
            <div style={{
              background: '#FFFFFF',
              padding: '1.15rem 1.25rem',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--border-light)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
              transition: 'transform var(--t-fast), border-color var(--t-fast)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 700 }}>
                  {language === 'ar' ? 'إجمالي الطلاب' : 'Total Students'}
                </span>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#E0F2FE', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <GraduationCap size={17} color="#0284C7" />
                </div>
              </div>
              <div style={{ fontSize: '2rem', fontWeight: 900, marginTop: '0.4rem', color: '#0284C7', lineHeight: 1 }}>
                {stats.totalStudents}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                {language === 'ar' ? 'مسجلون بالمنظومة' : 'Active accounts'}
              </div>
            </div>

            {/* Stat 2: Teachers */}
            <div style={{
              background: '#FFFFFF',
              padding: '1.15rem 1.25rem',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--border-light)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
              transition: 'transform var(--t-fast), border-color var(--t-fast)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 700 }}>
                  {language === 'ar' ? 'حسابات المعلمين' : 'Total Teachers'}
                </span>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#F3E8FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Users size={17} color="#7C3AED" />
                </div>
              </div>
              <div style={{ fontSize: '2rem', fontWeight: 900, marginTop: '0.4rem', color: '#7C3AED', lineHeight: 1 }}>
                {stats.totalTeachers}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                {language === 'ar' ? 'بمعرّفات هجينة' : 'Hybrid ID verified'}
              </div>
            </div>

            {/* Stat 3: Curriculum Books */}
            <div style={{
              background: '#FFFFFF',
              padding: '1.15rem 1.25rem',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--border-light)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
              transition: 'transform var(--t-fast), border-color var(--t-fast)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 700 }}>
                  {language === 'ar' ? 'الكتب والمناهج' : 'Curriculum Books'}
                </span>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#ECFDF5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <BookOpen size={17} color="#059669" />
                </div>
              </div>
              <div style={{ fontSize: '2rem', fontWeight: 900, marginTop: '0.4rem', color: '#059669', lineHeight: 1 }}>
                {stats.totalBooks}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                {language === 'ar' ? 'مفهرسة بالكامل' : 'AI vector indexed'}
              </div>
            </div>

            {/* Stat 4: Active Exams */}
            <div style={{
              background: '#FFFFFF',
              padding: '1.15rem 1.25rem',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--border-light)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
              transition: 'transform var(--t-fast), border-color var(--t-fast)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 700 }}>
                  {language === 'ar' ? 'الاختبارات المنشورة' : 'Active Exams'}
                </span>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#FEF3C7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <FileText size={17} color="#D97706" />
                </div>
              </div>
              <div style={{ fontSize: '2rem', fontWeight: 900, marginTop: '0.4rem', color: '#D97706', lineHeight: 1 }}>
                {stats.totalExams}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                {language === 'ar' ? 'بمؤقت زمني وتصحيح' : 'Live timed quizzes'}
              </div>
            </div>

            {/* Stat 5: Exam Attempts */}
            <div style={{
              background: '#FFFFFF',
              padding: '1.15rem 1.25rem',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--border-light)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
              transition: 'transform var(--t-fast), border-color var(--t-fast)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 700 }}>
                  {language === 'ar' ? 'محاولات التقييم' : 'Student Attempts'}
                </span>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#FCE7F3', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <TrendingUp size={17} color="#DB2777" />
                </div>
              </div>
              <div style={{ fontSize: '2rem', fontWeight: 900, marginTop: '0.4rem', color: '#DB2777', lineHeight: 1 }}>
                {stats.totalExamAttempts}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                {language === 'ar' ? 'بتشخيص تربوي فوري' : 'Automated evaluations'}
              </div>
            </div>

            {/* Stat 6: Monthly Exam Limit */}
            <div style={{
              background: 'linear-gradient(135deg, #F0FDF4 0%, #ECFDF5 100%)',
              padding: '1.15rem 1.25rem',
              borderRadius: 'var(--radius-lg)',
              border: '1.5px solid #A7F3D0',
              boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between'
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '0.8rem', color: '#065F46', fontWeight: 800 }}>
                    {language === 'ar' ? 'الحد الشهري لاختبارات AI' : 'Monthly AI Quiz Limit'}
                  </span>
                  <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#D1FAE5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Sliders size={17} color="#059669" />
                  </div>
                </div>
                <div style={{ fontSize: '2rem', fontWeight: 900, marginTop: '0.4rem', color: '#059669', lineHeight: 1 }}>
                  {monthlyLimit}
                </div>
                <div style={{ fontSize: '0.72rem', color: '#047857', marginTop: '0.35rem', fontWeight: 600 }}>
                  {language === 'ar' ? 'لكل طالب (اختبارات الذكاء الاصطناعي لكافة المواد)' : 'per student (AI exams across all subjects)'}
                </div>
              </div>

              <button
                onClick={() => {
                  setNewLimitInput(String(monthlyLimit));
                  setLimitModalOpen(true);
                }}
                style={{
                  marginTop: '0.85rem',
                  background: '#059669',
                  color: '#FFFFFF',
                  border: 'none',
                  padding: '0.45rem 0.85rem',
                  borderRadius: '0.5rem',
                  fontSize: '0.78rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  width: 'fit-content',
                  boxShadow: '0 2px 4px rgba(5, 150, 105, 0.2)'
                }}
              >
                <Settings size={13} />
                <span>{language === 'ar' ? 'تعديل الحد' : 'Edit Limit'}</span>
              </button>
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
          <span>{language === 'ar' ? 'الهيكل الرقابي والجمهوري (المدير المركزي ومدراء المحافظات)' : 'Supervisory Hierarchy'}</span>
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
                    {language === 'ar' ? 'استعراض نسب إتقان الوحدات ومحاولات الطلاب' : 'Inspect unit mastery rates and attempts'}
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
                  {language === 'ar' ? 'مستوى إتقان الوحدات الدراسية:' : 'Unit Mastery Levels:'}
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

      {/* MODAL 4: MONTHLY EXAM LIMIT */}
      {limitModalOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          backgroundColor: 'rgba(15, 23, 42, 0.75)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem'
        }}>
          <div className="card" style={{ width: '100%', maxWidth: '480px', padding: '1.75rem', borderRadius: 'var(--radius-xl)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: '#D1FAE5', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Sliders size={18} />
                </div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0 }}>
                  {language === 'ar' ? 'الحد الأقصى لاختبارات الذكاء الاصطناعي شهرياً' : 'Monthly AI Quiz Limit per Student'}
                </h3>
              </div>
              <button
                onClick={() => setLimitModalOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveMonthlyLimit}>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', lineHeight: 1.6, marginBottom: '1.25rem' }}>
                {language === 'ar'
                  ? 'حدد أقصى عدد لاختبارات الذكاء الاصطناعي المسموح لكل طالب توليدها شهرياً (إجمالي شامل لكافة المواد). لا يؤثر هذا الحد على اختبارات المعلمين، وعند استهلاك الطالب للحد المحدد، يتم حظر توليد اختبارات الذكاء الاصطناعي الإضافية حتى بداية الشهر القادم.'
                  : 'Set the maximum number of AI-generated quizzes a student can take per month across all subjects. This does not affect teacher exams. Once reached, the student cannot generate additional AI quizzes until next month.'}
              </p>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-dark)', marginBottom: '0.5rem' }}>
                  {language === 'ar' ? 'عدد اختبارات الذكاء الاصطناعي المسموحة شهرياً لكل طالب: *' : 'Allowed Monthly AI Quizzes per Student: *'}
                </label>
                <input
                  type="number"
                  required
                  min={1}
                  max={500}
                  value={newLimitInput}
                  onChange={(e) => setNewLimitInput(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.75rem 1rem',
                    borderRadius: '0.6rem',
                    border: '2px solid #E2E8F0',
                    fontSize: '1.25rem',
                    fontWeight: 900,
                    color: '#0F172A',
                    outline: 'none',
                    textAlign: 'center'
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#10B981'}
                  onBlur={(e) => e.target.style.borderColor = '#E2E8F0'}
                />
              </div>

              <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setLimitModalOpen(false)}
                >
                  {language === 'ar' ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={limitLoading}
                  style={{
                    background: '#059669',
                    color: '#FFFFFF',
                    border: 'none',
                    padding: '0.65rem 1.5rem',
                    borderRadius: '0.5rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                    boxShadow: '0 2px 4px rgba(5, 150, 105, 0.25)'
                  }}
                >
                  {limitLoading ? (language === 'ar' ? 'جاري الحفظ...' : 'Saving...') : (language === 'ar' ? 'حفظ وتطبيق فوراً' : 'Save & Apply')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
