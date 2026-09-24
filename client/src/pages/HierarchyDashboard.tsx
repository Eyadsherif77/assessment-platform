import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiUrl } from '../utils/api';
import { 
  MapPin, 
  BookOpen, 
  FileText, 
  Users, 
  Plus, 
  Search, 
  Eye, 
  ShieldCheck, 
  CheckCircle2, 
  Clock, 
  Award, 
  HelpCircle,
  X,
  Sparkles
} from 'lucide-react';

interface Governorate {
  id: string;
  name_ar: string;
  name_en: string;
}

interface Subject {
  id: string;
  name_ar: string;
  name_en: string;
  code: string;
  icon?: string;
}

interface ExamItem {
  id: string;
  title_ar: string;
  title_en: string;
  duration_minutes: number;
  is_published: number;
  school_type: string;
  created_at: string;
  teacher_id: string;
  teacher_name: string;
  effective_gov_id: string;
  governorate_name: string;
  subject_id: string;
  subject_name_ar: string;
  subject_code: string;
  grade_name_ar: string;
  stage_name_ar: string;
  questions_count: number;
  submissions_count: number;
  avg_score: number | null;
}

interface ExamDetailQuestion {
  id: string;
  question_text: string;
  question_type: string;
  points: number;
  explanation?: string;
  page_reference?: string;
  order_index: number;
  options: { id: string; option_text: string; is_correct: number }[];
}

interface SubordinateUser {
  id: string;
  email: string;
  username: string;
  fullName: string;
  role: string;
  isActive: boolean;
  governorateId?: string;
  governorateName?: string;
  subjectId?: string;
  subjectName?: string;
  schoolName?: string;
  specialization?: string;
  examsCount: number;
  subordinatesCount: number;
  permissions: {
    can_view_exams?: boolean;
    can_create_subordinates?: boolean;
    can_edit_permissions?: boolean;
    is_active?: boolean;
    [key: string]: any;
  };
  createdAt: string;
}

export const HierarchyDashboard: React.FC = () => {
  const { user, token, impersonateUser } = useAuth();

  const [activeTab, setActiveTab] = useState<'exams' | 'subordinates'>(
    user?.role === 'ADMIN' ? 'subordinates' : 'exams'
  );

  // Meta & Filters
  const [governorates, setGovernorates] = useState<Governorate[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedGovId, setSelectedGovId] = useState<string>('ALL');
  const [selectedSubId, setSelectedSubId] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Stats
  const [stats, setStats] = useState<{
    examsCount: number;
    teachersCount: number;
    supervisorsCount: number;
    govAdminsCount: number;
    questionsCount: number;
  }>({ examsCount: 0, teachersCount: 0, supervisorsCount: 0, govAdminsCount: 0, questionsCount: 0 });

  // Data lists
  const [exams, setExams] = useState<ExamItem[]>([]);
  const [subordinates, setSubordinates] = useState<SubordinateUser[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Modals
  const [inspectExamModal, setInspectExamModal] = useState<{
    isOpen: boolean;
    exam: any;
    questions: ExamDetailQuestion[];
    loading: boolean;
  }>({ isOpen: false, exam: null, questions: [], loading: false });

  const [createSubModalOpen, setCreateSubModalOpen] = useState<boolean>(false);
  const [createFormData, setCreateFormData] = useState({
    fullName: '',
    email: '',
    username: '',
    password: '',
    governorateId: '',
    subjectId: '',
    schoolName: '',
    specialization: ''
  });
  const [createSubLoading, setCreateSubLoading] = useState<boolean>(false);
  const [createSubError, setCreateSubError] = useState<string | null>(null);

  const [permissionsModal, setPermissionsModal] = useState<{
    isOpen: boolean;
    user: SubordinateUser | null;
    loading: boolean;
  }>({ isOpen: false, user: null, loading: false });

  // Load Meta & Stats on mount
  useEffect(() => {
    fetchMetaAndStats();
  }, [token]);

  // Load Exams or Subordinates when tab or filters change
  useEffect(() => {
    if (activeTab === 'exams') {
      fetchExams();
    } else {
      fetchSubordinates();
    }
  }, [activeTab, selectedGovId, selectedSubId, searchQuery, token]);

  const fetchMetaAndStats = async () => {
    if (!token) return;
    try {
      const [metaRes, statsRes] = await Promise.all([
        fetch(apiUrl('/api/hierarchy/meta'), {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch(apiUrl('/api/hierarchy/stats'), {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);

      if (metaRes.ok) {
        const metaData = await metaRes.json();
        setGovernorates(metaData.governorates || []);
        setSubjects(metaData.subjects || []);

        if (metaData.scope?.lockedGovernorateId) {
          setSelectedGovId(metaData.scope.lockedGovernorateId);
        }
        if (metaData.scope?.lockedSubjectId) {
          setSelectedSubId(metaData.scope.lockedSubjectId);
        }
      }

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData.stats);
      }
    } catch (e: any) {
      console.error('Error fetching meta:', e);
    }
  };

  const fetchExams = async () => {
    if (!token) return;
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const params = new URLSearchParams();
      if (selectedGovId !== 'ALL') params.append('governorate_id', selectedGovId);
      if (selectedSubId !== 'ALL') params.append('subject_id', selectedSubId);
      if (searchQuery.trim()) params.append('search', searchQuery.trim());

      const res = await fetch(apiUrl(`/api/hierarchy/exams?${params.toString()}`), {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setExams(data.exams || []);
      } else {
        setErrorMsg(data.error || 'تعذر تحميل الاختبارات');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'خطأ في الاتصال بالخادم');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchSubordinates = async () => {
    if (!token) return;
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(apiUrl('/api/hierarchy/subordinates'), {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setSubordinates(data.subordinates || []);
      } else {
        setErrorMsg(data.error || 'تعذر تحميل بيانات المرؤوسين');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'خطأ في الاتصال بالخادم');
    } finally {
      setIsLoading(false);
    }
  };

  // Inspect Exam Clickable Handler
  const handleInspectExam = async (examId: string) => {
    setInspectExamModal({ isOpen: true, exam: null, questions: [], loading: true });
    try {
      const res = await fetch(apiUrl(`/api/hierarchy/exams/${examId}`), {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setInspectExamModal({
          isOpen: true,
          exam: data.exam,
          questions: data.questions || [],
          loading: false
        });
      } else {
        alert(data.error || 'تعذر جلب تفاصيل الاختبار');
        setInspectExamModal(prev => ({ ...prev, isOpen: false, loading: false }));
      }
    } catch (err) {
      alert('خطأ في جلب تفاصيل الاختبار');
      setInspectExamModal(prev => ({ ...prev, isOpen: false, loading: false }));
    }
  };

  // Create Subordinate Handler
  const handleCreateSubordinateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateSubError(null);
    setCreateSubLoading(true);

    try {
      const res = await fetch(apiUrl('/api/hierarchy/subordinates'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(createFormData)
      });
      const data = await res.json();
      if (res.ok) {
        alert(data.message || 'تم إنشاء الحساب بنجاح');
        setCreateSubModalOpen(false);
        setCreateFormData({
          fullName: '',
          email: '',
          username: '',
          password: '',
          governorateId: '',
          subjectId: '',
          schoolName: '',
          specialization: ''
        });
        fetchSubordinates();
        fetchMetaAndStats();
      } else {
        setCreateSubError(data.error || 'فشل في إنشاء الحساب');
      }
    } catch (err: any) {
      setCreateSubError(err.message || 'خطأ في الاتصال بالخادم');
    } finally {
      setCreateSubLoading(false);
    }
  };

  // Toggle Permissions Handler
  const handleToggleActive = async (subUser: SubordinateUser) => {
    try {
      const newStatus = !subUser.isActive;
      const res = await fetch(apiUrl(`/api/hierarchy/subordinates/${subUser.id}/permissions`), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ is_active: newStatus })
      });
      const data = await res.json();
      if (res.ok) {
        setSubordinates(prev => prev.map(u => u.id === subUser.id ? { ...u, isActive: newStatus } : u));
        if (permissionsModal.user?.id === subUser.id) {
          setPermissionsModal(prev => ({
            ...prev,
            user: prev.user ? { ...prev.user, isActive: newStatus } : null
          }));
        }
      } else {
        alert(data.error || 'تعذر تعديل الحالة');
      }
    } catch (err) {
      alert('خطأ في تحديث الصلاحيات');
    }
  };

  const handleToggleSubordinatePermission = async (permKey: string) => {
    if (!permissionsModal.user) return;
    const current = permissionsModal.user.permissions?.[permKey] ?? true;
    const updatedPerms = { ...permissionsModal.user.permissions, [permKey]: !current };

    try {
      const res = await fetch(apiUrl(`/api/hierarchy/subordinates/${permissionsModal.user.id}/permissions`), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ permissions: updatedPerms })
      });
      const data = await res.json();
      if (res.ok) {
        setPermissionsModal(prev => ({
          ...prev,
          user: prev.user ? { ...prev.user, permissions: updatedPerms } : null
        }));
        setSubordinates(prev => prev.map(u => u.id === permissionsModal.user?.id ? { ...u, permissions: updatedPerms } : u));
      } else {
        alert(data.error || 'تعذر تعديل الصلاحية');
      }
    } catch (err) {
      alert('خطأ في حفظ التعديل');
    }
  };

  // Impersonate Subordinate User (Instant Login)
  const handleImpersonateUser = async (subUser: SubordinateUser) => {
    try {
      const res = await fetch(apiUrl(`/api/hierarchy/impersonate/${subUser.id}`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (res.ok && data.token && data.user) {
        impersonateUser(data.token, data.user);
      } else {
        alert(data.error || 'تعذر الدخول إلى حساب المستخدم');
      }
    } catch (err: any) {
      alert('حدث خطأ أثناء محاولة الدخول للحساب: ' + err.message);
    }
  };

  // Helper strings based on role
  const getRoleTitle = () => {
    if (user?.role === 'CENTRAL_ADMIN') return 'الأمين المركزي العام للجمهورية';
    if (user?.role === 'GOVERNORATE_ADMIN') return `أمين محافظة ${user?.governorate_name || ''}`;
    if (user?.role === 'SUPERVISOR') return `الموجه الأول لمادة ${user?.subject_name || ''} - ${user?.governorate_name || ''}`;
    return 'المدير العام للمنصة';
  };

  const getSubordinateTabTitle = () => {
    if (user?.role === 'CENTRAL_ADMIN') return '🏢 أمناء المحافظات (27 محافظة)';
    if (user?.role === 'GOVERNORATE_ADMIN') return '📐 موجهو المواد بالمحافظة';
    if (user?.role === 'SUPERVISOR') return '👨‍🏫 معلمو المادة التابعون لي';
    return '🏛️ الأمناء المركزيون';
  };

  const getAddSubordinateBtnTitle = () => {
    if (user?.role === 'CENTRAL_ADMIN') return '➕ إضافة أمين محافظة جديد';
    if (user?.role === 'GOVERNORATE_ADMIN') return '➕ إضافة موجه مادة جديد';
    if (user?.role === 'SUPERVISOR') return '➕ إضافة معلم جديد';
    return '➕ إضافة أمين مركزي';
  };

  return (
    <div className="hierarchy-portal-container" style={{
      maxWidth: '1360px',
      margin: '0 auto',
      padding: '1.5rem 1rem 4rem',
      direction: 'rtl'
    }}>
      {/* 1. Header Banner */}
      <div style={{
        background: 'linear-gradient(135deg, #1E1B4B 0%, #312E81 50%, #1E3A8A 100%)',
        borderRadius: '1.25rem',
        padding: '2rem 1.75rem',
        color: '#FFFFFF',
        marginBottom: '2rem',
        boxShadow: '0 10px 25px -5px rgba(30, 27, 75, 0.35)',
        position: 'relative',
        overflow: 'hidden'
      }}>
        <div style={{ position: 'relative', zIndex: 2 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
            <span style={{
              background: 'rgba(255, 255, 255, 0.15)',
              backdropFilter: 'blur(8px)',
              padding: '0.35rem 0.85rem',
              borderRadius: '999px',
              fontSize: '0.825rem',
              fontWeight: 800,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              border: '1px solid rgba(255, 255, 255, 0.2)'
            }}>
              <ShieldCheck size={14} color="#60A5FA" />
              <span>نظام الرقابة والإشراف التراتبي المباشر</span>
            </span>

            {user?.governorate_name && (
              <span style={{
                background: 'rgba(245, 158, 11, 0.2)',
                color: '#FDE68A',
                border: '1px solid rgba(245, 158, 11, 0.4)',
                padding: '0.35rem 0.85rem',
                borderRadius: '999px',
                fontSize: '0.825rem',
                fontWeight: 700
              }}>
                📍 {user.governorate_name}
              </span>
            )}

            {user?.subject_name && (
              <span style={{
                background: 'rgba(16, 185, 129, 0.2)',
                color: '#A7F3D0',
                border: '1px solid rgba(16, 185, 129, 0.4)',
                padding: '0.35rem 0.85rem',
                borderRadius: '999px',
                fontSize: '0.825rem',
                fontWeight: 700
              }}>
                📚 مادة {user.subject_name}
              </span>
            )}
          </div>

          <h1 style={{ fontSize: '1.85rem', fontWeight: 900, marginBottom: '0.5rem', letterSpacing: '-0.02em' }}>
            {getRoleTitle()}
          </h1>
          <p style={{ color: '#E0E7FF', fontSize: '0.95rem', margin: 0, maxWidth: '750px', lineHeight: 1.6 }}>
            {user?.role === 'CENTRAL_ADMIN' && 'متابعة شاملة لجميع محافظات جمهورية مصر العربية، فحص كافة الاختبارات والمناهج بصورة تفاعلية بالكامل، وإدارة وتعيين أمناء المحافظات وتحديد صلاحياتهم.'}
            {user?.role === 'GOVERNORATE_ADMIN' && `متابعة المنظومة التعليمية والاختبارات على مستوى ${user?.governorate_name || 'المحافظة'}، الإشراف على موجهي المواد وتوزيع الصلاحيات.`}
            {user?.role === 'SUPERVISOR' && `متابعة اختبارات مادة ${user?.subject_name || ''} بمحافظة ${user?.governorate_name || ''}، الإشراف على المعلمين، وإصدار حساباتهم وتعيين صلاحياتهم.`}
          </p>
        </div>
      </div>

      {/* 2. Top KPI Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
        gap: '1rem',
        marginBottom: '2rem'
      }}>
        <div style={{
          background: '#FFFFFF',
          borderRadius: '1rem',
          padding: '1.25rem',
          boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)',
          border: '1px solid var(--border-light)',
          display: 'flex',
          alignItems: 'center',
          gap: '1rem'
        }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#EEF2FF', color: '#4F46E5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <FileText size={24} />
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>إجمالي الاختبارات المتاحة</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--primary-900)' }}>{stats.examsCount}</div>
          </div>
        </div>

        <div style={{
          background: '#FFFFFF',
          borderRadius: '1rem',
          padding: '1.25rem',
          boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)',
          border: '1px solid var(--border-light)',
          display: 'flex',
          alignItems: 'center',
          gap: '1rem'
        }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#F0FDF4', color: '#16A34A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Users size={24} />
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>المعلمون في النطاق</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#15803D' }}>{stats.teachersCount}</div>
          </div>
        </div>

        {(user?.role === 'CENTRAL_ADMIN' || user?.role === 'ADMIN' || user?.role === 'GOVERNORATE_ADMIN') && (
          <div style={{
            background: '#FFFFFF',
            borderRadius: '1rem',
            padding: '1.25rem',
            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)',
            border: '1px solid var(--border-light)',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem'
          }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#FEF3C7', color: '#D97706', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Award size={24} />
            </div>
            <div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                {user?.role === 'CENTRAL_ADMIN' || user?.role === 'ADMIN' ? 'أمناء المحافظات والموجهون' : 'الموجهون بالمحافظة'}
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#B45309' }}>
                {stats.govAdminsCount + stats.supervisorsCount}
              </div>
            </div>
          </div>
        )}

        <div style={{
          background: '#FFFFFF',
          borderRadius: '1rem',
          padding: '1.25rem',
          boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)',
          border: '1px solid var(--border-light)',
          display: 'flex',
          alignItems: 'center',
          gap: '1rem'
        }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#F5F3FF', color: '#7C3AED', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Sparkles size={24} />
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>حالة الرقابة والربط</div>
            <div style={{ fontSize: '1.15rem', fontWeight: 900, color: '#6D28D9' }}>متصل 100% بالخادم</div>
          </div>
        </div>
      </div>

      {/* 2.5 Dedicated Admin Callout for Central Admin Provisioning */}
      {user?.role === 'ADMIN' && (
        <div style={{
          background: 'linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)',
          border: '2px solid #93C5FD',
          borderRadius: '1.25rem',
          padding: '1.5rem 1.75rem',
          marginBottom: '2rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1.25rem',
          boxShadow: '0 8px 20px -4px rgba(59, 130, 246, 0.15)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{
              width: '54px',
              height: '54px',
              borderRadius: '14px',
              background: '#2563EB',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#FFFFFF',
              fontSize: '1.6rem',
              boxShadow: '0 4px 10px rgba(37, 99, 235, 0.3)'
            }}>
              🏛️
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                <span style={{ background: '#2563EB', color: '#fff', fontSize: '0.72rem', fontWeight: 800, padding: '0.15rem 0.5rem', borderRadius: '4px' }}>
                  المستوى 1 في التراتبية
                </span>
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 900, color: '#1E3A8A' }}>
                  إدارة وتعيين الأمين المركزي العام للجمهورية
                </h3>
              </div>
              <p style={{ margin: 0, fontSize: '0.875rem', color: '#1E40AF', fontWeight: 600, lineHeight: 1.5 }}>
                بصفتك المدير العام والمالك؛ يمكنك إنشاء حساب الأمين المركزي مباشرة، أو الدخول الفوري لحسابه لتفقد كافة الصلاحيات وإنشاء أمناء المحافظات.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button
              onClick={() => {
                setActiveTab('subordinates');
                setCreateSubError(null);
                setCreateFormData({
                  fullName: '',
                  email: '',
                  username: '',
                  password: '',
                  governorateId: '',
                  subjectId: '',
                  schoolName: '',
                  specialization: ''
                });
                setCreateSubModalOpen(true);
              }}
              style={{
                background: '#1D4ED8',
                color: '#FFFFFF',
                border: 'none',
                padding: '0.75rem 1.4rem',
                borderRadius: '0.75rem',
                fontWeight: 900,
                fontSize: '0.925rem',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                boxShadow: '0 4px 12px rgba(29, 78, 216, 0.35)',
                transition: 'transform 0.15s'
              }}
            >
              <Plus size={18} />
              <span>➕ إنشاء أمين مركزي جديد</span>
            </button>

            <button
              onClick={() => setActiveTab('subordinates')}
              style={{
                background: '#FFFFFF',
                color: '#1E40AF',
                border: '1.5px solid #93C5FD',
                padding: '0.75rem 1.25rem',
                borderRadius: '0.75rem',
                fontWeight: 800,
                fontSize: '0.875rem',
                cursor: 'pointer',
                boxShadow: '0 2px 4px rgba(0,0,0,0.04)'
              }}
            >
              عرض قائمة الأمناء المركزيين ({subordinates.length})
            </button>
          </div>
        </div>
      )}

      {/* 3. Main Navigation Tabs */}
      <div style={{
        display: 'flex',
        gap: '0.5rem',
        borderBottom: '2px solid var(--border-light)',
        marginBottom: '1.5rem'
      }}>
        <button
          onClick={() => setActiveTab('exams')}
          style={{
            padding: '0.75rem 1.5rem',
            fontWeight: 800,
            fontSize: '0.95rem',
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            borderBottom: activeTab === 'exams' ? '3px solid #4F46E5' : '3px solid transparent',
            color: activeTab === 'exams' ? '#4F46E5' : 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
        >
          <FileText size={18} />
          <span>مستكشف الاختبارات التفاعلي (قابل للنقر بالكامل)</span>
          <span style={{
            background: activeTab === 'exams' ? '#EEF2FF' : '#F3F4F6',
            color: activeTab === 'exams' ? '#4F46E5' : 'var(--text-muted)',
            padding: '0.15rem 0.5rem',
            borderRadius: '999px',
            fontSize: '0.75rem'
          }}>
            {exams.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('subordinates')}
          style={{
            padding: '0.75rem 1.5rem',
            fontWeight: 800,
            fontSize: '0.95rem',
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            borderBottom: activeTab === 'subordinates' ? '3px solid #4F46E5' : '3px solid transparent',
            color: activeTab === 'subordinates' ? '#4F46E5' : 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
        >
          <Users size={18} />
          <span>{getSubordinateTabTitle()}</span>
          <span style={{
            background: activeTab === 'subordinates' ? '#EEF2FF' : '#F3F4F6',
            color: activeTab === 'subordinates' ? '#4F46E5' : 'var(--text-muted)',
            padding: '0.15rem 0.5rem',
            borderRadius: '999px',
            fontSize: '0.75rem'
          }}>
            {subordinates.length}
          </span>
        </button>
      </div>

      {/* 4. Tab Content: EXAMS */}
      {activeTab === 'exams' && (
        <div>
          {/* Dropdown Filters Bar strictly per user requirements */}
          <div style={{
            background: '#FFFFFF',
            borderRadius: '1rem',
            padding: '1.25rem',
            boxShadow: '0 2px 4px rgba(0,0,0,0.04)',
            border: '1px solid var(--border-light)',
            marginBottom: '1.5rem',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '1rem'
          }}>
            {/* 1. Governorate Dropdown */}
            <div style={{ flex: '1 1 220px', minWidth: '200px' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                🌍 المحافظة:
              </label>
              {(user?.role === 'ADMIN' || user?.role === 'CENTRAL_ADMIN') ? (
                <select
                  value={selectedGovId}
                  onChange={(e) => setSelectedGovId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.6rem 0.85rem',
                    borderRadius: '0.5rem',
                    border: '1.5px solid var(--border-light)',
                    background: '#F9FAFB',
                    fontSize: '0.9rem',
                    fontWeight: 700,
                    color: 'var(--text-dark)',
                    outline: 'none'
                  }}
                >
                  <option value="ALL">🇪🇬 جميع محافظات مصر (27 محافظة)</option>
                  {governorates.map(g => (
                    <option key={g.id} value={g.id}>{g.name_ar}</option>
                  ))}
                </select>
              ) : (
                <div style={{
                  padding: '0.6rem 0.85rem',
                  borderRadius: '0.5rem',
                  background: '#EEF2FF',
                  color: '#3730A3',
                  fontWeight: 800,
                  fontSize: '0.9rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem'
                }}>
                  <MapPin size={16} />
                  <span>محافظة {user?.governorate_name || 'المحددة'} (مقيد بنطاقك)</span>
                </div>
              )}
            </div>

            {/* 2. Subject Dropdown */}
            <div style={{ flex: '1 1 220px', minWidth: '200px' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                📚 المادة الدراسية:
              </label>
              {(user?.role === 'ADMIN' || user?.role === 'CENTRAL_ADMIN' || user?.role === 'GOVERNORATE_ADMIN') ? (
                <select
                  value={selectedSubId}
                  onChange={(e) => setSelectedSubId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.6rem 0.85rem',
                    borderRadius: '0.5rem',
                    border: '1.5px solid var(--border-light)',
                    background: '#F9FAFB',
                    fontSize: '0.9rem',
                    fontWeight: 700,
                    color: 'var(--text-dark)',
                    outline: 'none'
                  }}
                >
                  <option value="ALL">📖 جميع المواد الدراسية</option>
                  {subjects.map(s => (
                    <option key={s.id} value={s.id}>{s.name_ar}</option>
                  ))}
                </select>
              ) : (
                <div style={{
                  padding: '0.6rem 0.85rem',
                  borderRadius: '0.5rem',
                  background: '#ECFDF5',
                  color: '#065F46',
                  fontWeight: 800,
                  fontSize: '0.9rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem'
                }}>
                  <BookOpen size={16} />
                  <span>مادة {user?.subject_name || 'المحددة'} (مقيد بتخصصك)</span>
                </div>
              )}
            </div>

            {/* 3. Search Bar */}
            <div style={{ flex: '2 1 280px', minWidth: '240px' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                🔍 بحث سريع:
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  placeholder="ابحث بعنوان الاختبار أو اسم المعلم..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.6rem 2.2rem 0.6rem 0.85rem',
                    borderRadius: '0.5rem',
                    border: '1.5px solid var(--border-light)',
                    fontSize: '0.9rem',
                    outline: 'none'
                  }}
                />
                <Search size={16} style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              </div>
            </div>
          </div>

          {/* Exam Cards Grid - Everything Clickable */}
          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
              جاري تحميل الاختبارات المرتبطة...
            </div>
          ) : errorMsg ? (
            <div style={{ padding: '1.5rem', background: '#FEE2E2', color: '#991B1B', borderRadius: '0.75rem' }}>
              {errorMsg}
            </div>
          ) : exams.length === 0 ? (
            <div style={{
              background: '#FFFFFF',
              borderRadius: '1rem',
              padding: '3.5rem 1.5rem',
              textAlign: 'center',
              border: '1px dashed var(--border-light)'
            }}>
              <FileText size={48} style={{ color: 'var(--text-muted)', margin: '0 auto 1rem', opacity: 0.5 }} />
              <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-dark)', marginBottom: '0.5rem' }}>
                لا توجد اختبارات تطابق الفلتر الحالي
              </h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                حاول اختيار محافظة أو مادة أخرى أو تفقد الحسابات التابعة.
              </p>
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
              gap: '1.25rem'
            }}>
              {exams.map(exam => (
                <div
                  key={exam.id}
                  onClick={() => handleInspectExam(exam.id)}
                  style={{
                    background: '#FFFFFF',
                    borderRadius: '1rem',
                    padding: '1.25rem',
                    border: '1.5px solid var(--border-light)',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.03)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    position: 'relative'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = '#4F46E5';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(79, 70, 229, 0.15)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border-light)';
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.03)';
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                    <span style={{
                      background: '#EEF2FF',
                      color: '#4F46E5',
                      padding: '0.2rem 0.65rem',
                      borderRadius: '999px',
                      fontSize: '0.75rem',
                      fontWeight: 800
                    }}>
                      📚 {exam.subject_name_ar}
                    </span>

                    <span style={{
                      background: exam.is_published ? '#ECFDF5' : '#FFFBEB',
                      color: exam.is_published ? '#059669' : '#D97706',
                      padding: '0.2rem 0.65rem',
                      borderRadius: '999px',
                      fontSize: '0.75rem',
                      fontWeight: 700
                    }}>
                      {exam.is_published ? 'منشور للطلاب' : 'مسودة قيد المراجعة'}
                    </span>
                  </div>

                  <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-dark)', marginBottom: '0.5rem', lineHeight: 1.4 }}>
                    {exam.title_ar}
                  </h3>

                  <div style={{ fontSize: '0.825rem', color: 'var(--text-muted)', marginBottom: '1rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <MapPin size={14} color="#6366F1" />
                      <span>{exam.governorate_name || 'محافظة القاهرة'}</span>
                      <span style={{ color: '#CBD5E1' }}>•</span>
                      <span>{exam.grade_name_ar}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <Users size={14} color="#10B981" />
                      <span>المعلم: {exam.teacher_name}</span>
                    </div>
                  </div>

                  {/* Exam metrics */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingTop: '0.75rem',
                    borderTop: '1px solid var(--border-light)',
                    fontSize: '0.8rem',
                    fontWeight: 700
                  }}>
                    <span style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <Clock size={14} />
                      {exam.duration_minutes} دقيقة
                    </span>
                    <span style={{ color: '#4F46E5', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <HelpCircle size={14} />
                      {exam.questions_count} أسئلة
                    </span>
                    <span style={{
                      background: '#F1F5F9',
                      padding: '0.2rem 0.5rem',
                      borderRadius: '0.35rem',
                      color: '#334155'
                    }}>
                      {exam.submissions_count} إجابة
                    </span>
                  </div>

                  <div style={{
                    marginTop: '0.85rem',
                    textAlign: 'center',
                    background: '#F8FAFC',
                    padding: '0.45rem',
                    borderRadius: '0.5rem',
                    fontSize: '0.8rem',
                    fontWeight: 800,
                    color: '#4F46E5',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.35rem'
                  }}>
                    <Eye size={14} />
                    <span>انقر لمعاينة أسئلة الاختبار ونموذج الإجابة 🔍</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 5. Tab Content: SUBORDINATES MANAGEMENT */}
      {activeTab === 'subordinates' && (
        <div>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1.25rem',
            flexWrap: 'wrap',
            gap: '0.75rem'
          }}>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0 }}>
                {getSubordinateTabTitle()}
              </h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '0.25rem 0 0' }}>
                يمكنك إنشاء حسابات جديدة مباشرة للمرؤوسين والتحكم بفتح وإغلاق صلاحياتهم وتجميد حساباتهم.
              </p>
            </div>

            <button
              onClick={() => {
                setCreateSubError(null);
                setCreateFormData({
                  fullName: '',
                  email: '',
                  username: '',
                  password: '',
                  governorateId: user?.governorate_id || '',
                  subjectId: user?.subject_id || '',
                  schoolName: '',
                  specialization: ''
                });
                setCreateSubModalOpen(true);
              }}
              style={{
                background: '#4F46E5',
                color: '#FFFFFF',
                border: 'none',
                padding: '0.65rem 1.25rem',
                borderRadius: '0.65rem',
                fontWeight: 800,
                fontSize: '0.875rem',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                boxShadow: '0 4px 6px -1px rgba(79, 70, 229, 0.25)'
              }}
            >
              <Plus size={16} />
              <span>{getAddSubordinateBtnTitle()}</span>
            </button>
          </div>

          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
              جاري تحميل المرؤوسين...
            </div>
          ) : subordinates.length === 0 ? (
            <div style={{
              background: '#FFFFFF',
              borderRadius: '1rem',
              padding: '3.5rem 1.5rem',
              textAlign: 'center',
              border: '1px dashed var(--border-light)'
            }}>
              <Users size={48} style={{ color: 'var(--text-muted)', margin: '0 auto 1rem', opacity: 0.5 }} />
              <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-dark)', marginBottom: '0.5rem' }}>
                لا يوجد مستخدمون مسجلون في هذه الرتبة حالياً
              </h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
                اضغط على زر الإضافة بالأعلى لإنشاء أول حساب تابع لك.
              </p>
            </div>
          ) : (
            <div style={{
              background: '#FFFFFF',
              borderRadius: '1rem',
              border: '1px solid var(--border-light)',
              overflowX: 'auto',
              boxShadow: '0 2px 4px rgba(0,0,0,0.03)'
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right' }}>
                <thead>
                  <tr style={{ background: '#F8FAFC', borderBottom: '1.5px solid var(--border-light)' }}>
                    <th style={{ padding: '0.85rem 1rem', fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-muted)' }}>الاسم الكامل والمستخدم</th>
                    <th style={{ padding: '0.85rem 1rem', fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-muted)' }}>الدور / الرتبة</th>
                    <th style={{ padding: '0.85rem 1rem', fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-muted)' }}>المحافظة / المادة</th>
                    <th style={{ padding: '0.85rem 1rem', fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-muted)' }}>إحصائيات النشاط</th>
                    <th style={{ padding: '0.85rem 1rem', fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-muted)' }}>حالة الحساب</th>
                    <th style={{ padding: '0.85rem 1rem', fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-muted)' }}>إجراءات الصلاحيات</th>
                  </tr>
                </thead>
                <tbody>
                  {subordinates.map(subUser => (
                    <tr key={subUser.id} style={{ borderBottom: '1px solid var(--border-light)', transition: 'background 0.15s' }}>
                      <td style={{ padding: '1rem' }}>
                        <div style={{ fontWeight: 800, color: 'var(--text-dark)', fontSize: '0.95rem' }}>{subUser.fullName}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{subUser.email}</div>
                      </td>

                      <td style={{ padding: '1rem' }}>
                        <span style={{
                          background: '#EEF2FF',
                          color: '#4F46E5',
                          padding: '0.25rem 0.65rem',
                          borderRadius: '999px',
                          fontSize: '0.75rem',
                          fontWeight: 800
                        }}>
                          {subUser.role === 'CENTRAL_ADMIN' && 'الأمين المركزي'}
                          {subUser.role === 'GOVERNORATE_ADMIN' && 'أمين المحافظة'}
                          {subUser.role === 'SUPERVISOR' && 'موجه مادة'}
                          {subUser.role === 'TEACHER' && 'معلم'}
                        </span>
                      </td>

                      <td style={{ padding: '1rem', fontSize: '0.85rem' }}>
                        {subUser.governorateName && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#1E293B', fontWeight: 700 }}>
                            <MapPin size={13} color="#6366F1" />
                            <span>{subUser.governorateName}</span>
                          </div>
                        )}
                        {(subUser.subjectName || subUser.specialization) && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#059669', fontSize: '0.8rem', marginTop: '0.2rem' }}>
                            <BookOpen size={13} />
                            <span>{subUser.subjectName || subUser.specialization}</span>
                          </div>
                        )}
                        {subUser.schoolName && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                            🏫 {subUser.schoolName}
                          </div>
                        )}
                      </td>

                      <td style={{ padding: '1rem', fontSize: '0.85rem' }}>
                        <div style={{ fontWeight: 700 }}>{subUser.examsCount} اختبار تم إنشاؤه</div>
                        {subUser.subordinatesCount > 0 && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            {subUser.subordinatesCount} كادر تحت إشرافه
                          </div>
                        )}
                      </td>

                      <td style={{ padding: '1rem' }}>
                        <span style={{
                          background: subUser.isActive ? '#ECFDF5' : '#FEE2E2',
                          color: subUser.isActive ? '#059669' : '#DC2626',
                          padding: '0.25rem 0.65rem',
                          borderRadius: '999px',
                          fontSize: '0.75rem',
                          fontWeight: 800
                        }}>
                          {subUser.isActive ? '● نشط ومفعل' : '● مجمّد معطل'}
                        </span>
                      </td>

                      <td style={{ padding: '1rem' }}>
                        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                          <button
                            onClick={() => handleImpersonateUser(subUser)}
                            title="تسجيل دخول فوري لحسابه ومعاينة لوحة تحكمه وصلاحياته"
                            style={{
                              background: 'linear-gradient(135deg, #4F46E5 0%, #3B82F6 100%)',
                              color: '#FFFFFF',
                              border: 'none',
                              padding: '0.4rem 0.85rem',
                              borderRadius: '0.5rem',
                              fontSize: '0.8rem',
                              fontWeight: 800,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.35rem',
                              boxShadow: '0 2px 5px rgba(79, 70, 229, 0.3)'
                            }}
                          >
                            <Sparkles size={13} />
                            <span>دخول حسابه 🚀</span>
                          </button>

                          <button
                            onClick={() => setPermissionsModal({ isOpen: true, user: subUser, loading: false })}
                            style={{
                              background: '#F8FAFC',
                              border: '1.5px solid var(--border-light)',
                              padding: '0.4rem 0.85rem',
                              borderRadius: '0.5rem',
                              fontSize: '0.8rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.3rem'
                            }}
                          >
                            <ShieldCheck size={14} color="#4F46E5" />
                            <span>الصلاحيات</span>
                          </button>

                          <button
                            onClick={() => handleToggleActive(subUser)}
                            style={{
                              background: subUser.isActive ? '#FEF2F2' : '#F0FDF4',
                              color: subUser.isActive ? '#DC2626' : '#16A34A',
                              border: 'none',
                              padding: '0.4rem 0.75rem',
                              borderRadius: '0.5rem',
                              fontSize: '0.78rem',
                              fontWeight: 700,
                              cursor: 'pointer'
                            }}
                          >
                            {subUser.isActive ? 'تجميد' : 'تفعيل'}
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

      {/* 6. MODAL: Inspect Exam Details (Clickable Full Details) */}
      {inspectExamModal.isOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.75)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '1rem'
        }}>
          <div style={{
            background: '#FFFFFF',
            borderRadius: '1.25rem',
            width: '100%',
            maxWidth: '850px',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
            direction: 'rtl'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '1.25rem 1.5rem',
              borderBottom: '1px solid var(--border-light)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: '#F8FAFC'
            }}>
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 900, color: 'var(--text-dark)', margin: 0 }}>
                  معاينة تفاصيل الاختبار ونموذج الأسئلة
                </h3>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  كافة بيانات الاختبار ونموذج الإجابة النموذجي
                </span>
              </div>
              <button
                onClick={() => setInspectExamModal(prev => ({ ...prev, isOpen: false }))}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.35rem', color: 'var(--text-muted)' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1 }}>
              {inspectExamModal.loading ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                  جاري جلب تفاصيل الاختبار...
                </div>
              ) : inspectExamModal.exam ? (
                <div>
                  {/* Meta Strip */}
                  <div style={{
                    background: '#EEF2FF',
                    borderRadius: '0.75rem',
                    padding: '1rem',
                    marginBottom: '1.5rem',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                    gap: '0.75rem',
                    fontSize: '0.85rem'
                  }}>
                    <div><strong>عنوان الاختبار:</strong> {inspectExamModal.exam.title_ar}</div>
                    <div><strong>المادة:</strong> {inspectExamModal.exam.subject_name_ar}</div>
                    <div><strong>المحافظة:</strong> {inspectExamModal.exam.governorate_name || 'غير محددة'}</div>
                    <div><strong>المعلم:</strong> {inspectExamModal.exam.teacher_name}</div>
                    <div><strong>مدة الاختبار:</strong> {inspectExamModal.exam.duration_minutes} دقيقة</div>
                    <div><strong>حالة النشر:</strong> {inspectExamModal.exam.is_published ? 'منشور للطلاب' : 'مسودة'}</div>
                    <div><strong>عدد الطلاب الممتحنين:</strong> {inspectExamModal.exam.submissions_count} طالب</div>
                    <div><strong>متوسط الدرجات:</strong> {inspectExamModal.exam.avg_score !== null ? `${inspectExamModal.exam.avg_score}%` : 'لا يوجد'}</div>
                  </div>

                  {/* Questions Section */}
                  <h4 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <HelpCircle size={18} color="#4F46E5" />
                    <span>أسئلة الاختبار ونموذج الحل ({inspectExamModal.questions.length} أسئلة)</span>
                  </h4>

                  {inspectExamModal.questions.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                      لا توجد أسئلة مسجلة في هذا الاختبار.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      {inspectExamModal.questions.map((q, idx) => (
                        <div key={q.id} style={{
                          border: '1.5px solid var(--border-light)',
                          borderRadius: '0.75rem',
                          padding: '1rem',
                          background: '#FFFFFF'
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                            <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#1E293B', display: 'flex', gap: '0.5rem' }}>
                              <span style={{ color: '#4F46E5' }}>#{idx + 1}</span>
                              <span>{q.question_text}</span>
                            </div>
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', background: '#F1F5F9', padding: '0.15rem 0.5rem', borderRadius: '4px' }}>
                              {q.points} درجات
                            </span>
                          </div>

                          {/* Options */}
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.5rem', marginBottom: '0.5rem' }}>
                            {q.options.map(opt => (
                              <div
                                key={opt.id}
                                style={{
                                  padding: '0.6rem 0.85rem',
                                  borderRadius: '0.5rem',
                                  fontSize: '0.85rem',
                                  border: opt.is_correct ? '1.5px solid #10B981' : '1px solid var(--border-light)',
                                  background: opt.is_correct ? '#ECFDF5' : '#F8FAFC',
                                  color: opt.is_correct ? '#065F46' : 'var(--text-dark)',
                                  fontWeight: opt.is_correct ? 800 : 500,
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '0.4rem'
                                }}
                              >
                                {opt.is_correct ? <CheckCircle2 size={15} color="#10B981" /> : <span style={{ width: '15px' }}>○</span>}
                                <span>{opt.option_text}</span>
                              </div>
                            ))}
                          </div>

                          {q.explanation && (
                            <div style={{ fontSize: '0.78rem', color: '#0369A1', background: '#F0F9FF', padding: '0.45rem 0.75rem', borderRadius: '0.4rem', marginTop: '0.5rem' }}>
                              💡 <strong>التفسير والشرح:</strong> {q.explanation}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            {/* Modal Footer */}
            <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border-light)', background: '#F8FAFC', textAlign: 'left' }}>
              <button
                className="btn btn-outline"
                onClick={() => setInspectExamModal(prev => ({ ...prev, isOpen: false }))}
              >
                إغلاق المعاينة
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. MODAL: Create Subordinate Account */}
      {createSubModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.75)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '1rem'
        }}>
          <div style={{
            background: '#FFFFFF',
            borderRadius: '1.25rem',
            width: '100%',
            maxWidth: '560px',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
            direction: 'rtl',
            overflow: 'hidden'
          }}>
            <div style={{
              padding: '1.25rem 1.5rem',
              borderBottom: '1px solid var(--border-light)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: '#F8FAFC'
            }}>
              <div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 900, color: 'var(--text-dark)', margin: 0 }}>
                  {getAddSubordinateBtnTitle()}
                </h3>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  يتم ربط الحساب تلقائياً بالهيكل التراتبي في قاعدة البيانات
                </span>
              </div>
              <button
                onClick={() => setCreateSubModalOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.35rem', color: 'var(--text-muted)' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateSubordinateSubmit} style={{ padding: '1.5rem' }}>
              {createSubError && (
                <div style={{ padding: '0.75rem', background: '#FEE2E2', color: '#991B1B', borderRadius: '0.5rem', fontSize: '0.85rem', marginBottom: '1rem' }}>
                  {createSubError}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 700, marginBottom: '0.35rem' }}>
                    الاسم الكامل: *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="مثال: أستاذ محمود السيد"
                    value={createFormData.fullName}
                    onChange={(e) => setCreateFormData(prev => ({ ...prev, fullName: e.target.value }))}
                    style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '0.5rem', border: '1.5px solid var(--border-light)', fontSize: '0.9rem' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 700, marginBottom: '0.35rem' }}>
                      البريد الإلكتروني: *
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="user@edu.eg"
                      value={createFormData.email}
                      onChange={(e) => setCreateFormData(prev => ({ ...prev, email: e.target.value }))}
                      style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '0.5rem', border: '1.5px solid var(--border-light)', fontSize: '0.9rem' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 700, marginBottom: '0.35rem' }}>
                      كلمة المرور: *
                    </label>
                    <input
                      type="password"
                      required
                      placeholder="••••••••"
                      value={createFormData.password}
                      onChange={(e) => setCreateFormData(prev => ({ ...prev, password: e.target.value }))}
                      style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '0.5rem', border: '1.5px solid var(--border-light)', fontSize: '0.9rem' }}
                    />
                  </div>
                </div>

                {/* If Central Admin: choose Governorate for the Governorate Admin */}
                {user?.role === 'CENTRAL_ADMIN' && (
                  <div>
                    <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 700, marginBottom: '0.35rem' }}>
                      المحافظة المسندة لأمين المحافظة: *
                    </label>
                    <select
                      required
                      value={createFormData.governorateId}
                      onChange={(e) => setCreateFormData(prev => ({ ...prev, governorateId: e.target.value }))}
                      style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '0.5rem', border: '1.5px solid var(--border-light)', fontSize: '0.9rem' }}
                    >
                      <option value="">اختر المحافظة...</option>
                      {governorates.map(g => (
                        <option key={g.id} value={g.id}>{g.name_ar}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* If Governorate Admin: choose Subject for the Supervisor */}
                {user?.role === 'GOVERNORATE_ADMIN' && (
                  <div>
                    <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 700, marginBottom: '0.35rem' }}>
                      المادة المسندة للموجه في محافظة {user.governorate_name || ''}: *
                    </label>
                    <select
                      required
                      value={createFormData.subjectId}
                      onChange={(e) => setCreateFormData(prev => ({ ...prev, subjectId: e.target.value }))}
                      style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '0.5rem', border: '1.5px solid var(--border-light)', fontSize: '0.9rem' }}
                    >
                      <option value="">اختر المادة الدراسية...</option>
                      {subjects.map(s => (
                        <option key={s.id} value={s.id}>{s.name_ar}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* If Supervisor: Teacher fields */}
                {user?.role === 'SUPERVISOR' && (
                  <>
                    <div style={{ padding: '0.65rem', background: '#F0FDF4', borderRadius: '0.5rem', fontSize: '0.8rem', color: '#15803D', fontWeight: 700 }}>
                      ✓ سيتم قفل هذا المعلم تلقائياً على مادة {user.subject_name} في محافظة {user.governorate_name}.
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 700, marginBottom: '0.35rem' }}>
                        اسم المدرسة:
                      </label>
                      <input
                        type="text"
                        placeholder="مثال: مدرسة السعيدية الثانوية"
                        value={createFormData.schoolName}
                        onChange={(e) => setCreateFormData(prev => ({ ...prev, schoolName: e.target.value }))}
                        style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '0.5rem', border: '1.5px solid var(--border-light)', fontSize: '0.9rem' }}
                      />
                    </div>
                  </>
                )}
              </div>

              <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setCreateSubModalOpen(false)}
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={createSubLoading}
                  style={{
                    background: '#4F46E5',
                    color: '#FFFFFF',
                    border: 'none',
                    padding: '0.65rem 1.5rem',
                    borderRadius: '0.5rem',
                    fontWeight: 800,
                    cursor: 'pointer'
                  }}
                >
                  {createSubLoading ? 'جاري الإنشاء...' : 'حفظ وإنشاء الحساب'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 8. MODAL: Permissions Switcher Modal */}
      {permissionsModal.isOpen && permissionsModal.user && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.75)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '1rem'
        }}>
          <div style={{
            background: '#FFFFFF',
            borderRadius: '1.25rem',
            width: '100%',
            maxWidth: '520px',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
            direction: 'rtl',
            overflow: 'hidden'
          }}>
            <div style={{
              padding: '1.25rem 1.5rem',
              borderBottom: '1px solid var(--border-light)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: '#F8FAFC'
            }}>
              <div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 900, color: 'var(--text-dark)', margin: 0 }}>
                  التحكم في صلاحيات: {permissionsModal.user.fullName}
                </h3>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  يمكنك فتح وإغلاق الصلاحيات بضغطة زر واحدة
                </span>
              </div>
              <button
                onClick={() => setPermissionsModal(prev => ({ ...prev, isOpen: false }))}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.35rem', color: 'var(--text-muted)' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Active Toggle */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '0.85rem',
                borderRadius: '0.65rem',
                background: permissionsModal.user.isActive ? '#ECFDF5' : '#FEF2F2',
                border: `1.5px solid ${permissionsModal.user.isActive ? '#A7F3D0' : '#FECACA'}`
              }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: '0.9rem', color: permissionsModal.user.isActive ? '#065F46' : '#991B1B' }}>
                    حالة الحساب العامة (تفعيل / تجميد)
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    عند التجميد يُمنع المستخدم من الدخول للمنصة نهائياً
                  </div>
                </div>
                <button
                  onClick={() => permissionsModal.user && handleToggleActive(permissionsModal.user)}
                  style={{
                    background: permissionsModal.user.isActive ? '#10B981' : '#EF4444',
                    color: '#FFFFFF',
                    border: 'none',
                    padding: '0.45rem 1rem',
                    borderRadius: '999px',
                    fontWeight: 800,
                    fontSize: '0.8rem',
                    cursor: 'pointer'
                  }}
                >
                  {permissionsModal.user.isActive ? 'مفعّل ✓' : 'مجمّد ✕'}
                </button>
              </div>

              {/* View Exams Permission */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-light)', paddingBottom: '0.85rem' }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: '0.9rem' }}>صلاحية رؤية وفحص الاختبارات</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>السماح للمستخدم بالاطلاع على جميع الاختبارات في نطاقه</div>
                </div>
                <input
                  type="checkbox"
                  checked={permissionsModal.user.permissions?.can_view_exams ?? true}
                  onChange={() => handleToggleSubordinatePermission('can_view_exams')}
                  style={{ width: '20px', height: '20px', cursor: 'pointer', accentColor: '#4F46E5' }}
                />
              </div>

              {/* Manage Subordinates Permission */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-light)', paddingBottom: '0.85rem' }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: '0.9rem' }}>صلاحية إنشاء وإدارة الكوادر الأدنى</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>السماح له بإنشاء حسابات لمن هم تحته في الهيكل</div>
                </div>
                <input
                  type="checkbox"
                  checked={permissionsModal.user.permissions?.can_create_subordinates ?? true}
                  onChange={() => handleToggleSubordinatePermission('can_create_subordinates')}
                  style={{ width: '20px', height: '20px', cursor: 'pointer', accentColor: '#4F46E5' }}
                />
              </div>

              {/* Edit Permissions of Subordinates */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: '0.9rem' }}>صلاحية تعديل صلاحيات المرؤوسين</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>السماح له بفتح وإغلاق صلاحيات الكوادر التابعة له</div>
                </div>
                <input
                  type="checkbox"
                  checked={permissionsModal.user.permissions?.can_edit_permissions ?? true}
                  onChange={() => handleToggleSubordinatePermission('can_edit_permissions')}
                  style={{ width: '20px', height: '20px', cursor: 'pointer', accentColor: '#4F46E5' }}
                />
              </div>
            </div>

            <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border-light)', background: '#F8FAFC', textAlign: 'left' }}>
              <button
                className="btn btn-primary"
                onClick={() => setPermissionsModal(prev => ({ ...prev, isOpen: false }))}
              >
                تم والانتهاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
