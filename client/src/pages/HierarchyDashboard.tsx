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
  Sparkles,
  BarChart2,
  TrendingUp,
  Calendar
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

const DEFAULT_EGYPT_GOVERNORATES: Governorate[] = [
  { id: 'gov-eg-01', name_ar: 'القاهرة', name_en: 'Cairo' },
  { id: 'gov-eg-02', name_ar: 'الجيزة', name_en: 'Giza' },
  { id: 'gov-eg-03', name_ar: 'الإسكندرية', name_en: 'Alexandria' },
  { id: 'gov-eg-04', name_ar: 'الدقهلية', name_en: 'Dakahlia' },
  { id: 'gov-eg-05', name_ar: 'البحر الأحمر', name_en: 'Red Sea' },
  { id: 'gov-eg-06', name_ar: 'البحيرة', name_en: 'Beheira' },
  { id: 'gov-eg-07', name_ar: 'الفيوم', name_en: 'Fayoum' },
  { id: 'gov-eg-08', name_ar: 'الغربية', name_en: 'Gharbia' },
  { id: 'gov-eg-09', name_ar: 'الإسماعيلية', name_en: 'Ismailia' },
  { id: 'gov-eg-10', name_ar: 'المنوفية', name_en: 'Menofia' },
  { id: 'gov-eg-11', name_ar: 'المنيا', name_en: 'Minya' },
  { id: 'gov-eg-12', name_ar: 'القليوبية', name_en: 'Qalyubia' },
  { id: 'gov-eg-13', name_ar: 'الوادي الجديد', name_en: 'New Valley' },
  { id: 'gov-eg-14', name_ar: 'السويس', name_en: 'Suez' },
  { id: 'gov-eg-15', name_ar: 'أسوان', name_en: 'Aswan' },
  { id: 'gov-eg-16', name_ar: 'أسيوط', name_en: 'Assiut' },
  { id: 'gov-eg-17', name_ar: 'بني سويف', name_en: 'Beni Suef' },
  { id: 'gov-eg-18', name_ar: 'بورسعيد', name_en: 'Port Said' },
  { id: 'gov-eg-19', name_ar: 'دمياط', name_en: 'Damietta' },
  { id: 'gov-eg-20', name_ar: 'الشرقية', name_en: 'Sharqia' },
  { id: 'gov-eg-21', name_ar: 'جنوب سيناء', name_en: 'South Sinai' },
  { id: 'gov-eg-22', name_ar: 'كفر الشيخ', name_en: 'Kafr El Sheikh' },
  { id: 'gov-eg-23', name_ar: 'مطروح', name_en: 'Matrouh' },
  { id: 'gov-eg-24', name_ar: 'الأقصر', name_en: 'Luxor' },
  { id: 'gov-eg-25', name_ar: 'قنا', name_en: 'Qena' },
  { id: 'gov-eg-26', name_ar: 'شمال سيناء', name_en: 'North Sinai' },
  { id: 'gov-eg-27', name_ar: 'سوهاج', name_en: 'Sohag' }
];

const DEFAULT_SUBJECTS: Subject[] = [
  { id: 'sub-arabic', name_ar: 'اللغة العربية', name_en: 'Arabic', code: 'ARA', icon: 'BookOpen' },
  { id: 'sub-math', name_ar: 'الرياضيات', name_en: 'Mathematics', code: 'MATH', icon: 'BookOpen' },
  { id: 'sub-science', name_ar: 'العلوم', name_en: 'Science', code: 'SCI', icon: 'BookOpen' },
  { id: 'sub-english', name_ar: 'اللغة الإنجليزية', name_en: 'English', code: 'ENG', icon: 'BookOpen' }
];

export const HierarchyDashboard: React.FC = () => {
  const { user, token, language, impersonateUser } = useAuth();
  const isAr = language === 'ar';

  const [activeTab, setActiveTab] = useState<'analysis' | 'exams' | 'subordinates'>('analysis');

  // Supervisory Analysis State
  const [analysisTimeframe, setAnalysisTimeframe] = useState<'monthly' | 'weekly'>('monthly');
  const [analysisGovId, setAnalysisGovId] = useState<string>('ALL');
  const [analysisSubId, setAnalysisSubId] = useState<string>('ALL');
  const [analysisData, setAnalysisData] = useState<any>(null);
  const [isAnalysisLoading, setIsAnalysisLoading] = useState<boolean>(false);

  // Meta & Filters
  const [governorates, setGovernorates] = useState<Governorate[]>(DEFAULT_EGYPT_GOVERNORATES);
  const [subjects, setSubjects] = useState<Subject[]>(DEFAULT_SUBJECTS);
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

  // Load appropriate data when tab or filters change
  useEffect(() => {
    if (activeTab === 'analysis') {
      fetchSupervisoryAnalysis();
    } else if (activeTab === 'exams') {
      fetchExams();
    } else {
      fetchSubordinates();
    }
  }, [activeTab, selectedGovId, selectedSubId, searchQuery, analysisTimeframe, analysisGovId, analysisSubId, token]);

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
        if (metaData.governorates && metaData.governorates.length > 0) {
          setGovernorates(metaData.governorates);
        }
        if (metaData.subjects && metaData.subjects.length > 0) {
          setSubjects(metaData.subjects);
        }

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

  const fetchSupervisoryAnalysis = async () => {
    if (!token) return;
    setIsAnalysisLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('timeframe', analysisTimeframe);
      if (analysisGovId !== 'ALL') params.append('governorate_id', analysisGovId);
      if (analysisSubId !== 'ALL') params.append('subject_id', analysisSubId);

      const res = await fetch(apiUrl(`/api/hierarchy/supervisory-analysis?${params.toString()}`), {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setAnalysisData(data);
      }
    } catch (e: any) {
      console.error('Error fetching supervisory analysis:', e);
    } finally {
      setIsAnalysisLoading(false);
    }
  };

  const handleImpersonateById = async (userId: string) => {
    try {
      const res = await fetch(apiUrl(`/api/hierarchy/impersonate/${userId}`), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to impersonate user');
      impersonateUser(data.token, data.user);
    } catch (err: any) {
      alert(err.message);
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
        setErrorMsg(data.error || (isAr ? 'فشل تحميل الاختبارات' : 'Failed to load exams'));
      }
    } catch (err: any) {
      setErrorMsg(err.message || (isAr ? 'خطأ في الاتصال بالخادم' : 'Server connection error'));
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
        setErrorMsg(data.error || (isAr ? 'فشل تحميل قائمة المرؤوسين' : 'Failed to load subordinates list'));
      }
    } catch (err: any) {
      setErrorMsg(err.message || (isAr ? 'خطأ في الاتصال بالخادم' : 'Server connection error'));
    } finally {
      setIsLoading(false);
    }
  };

  // Inspect Exam Detail Modal
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
        alert(data.error || (isAr ? 'تعذر جلب تفاصيل الاختبار' : 'Failed to fetch exam details'));
        setInspectExamModal(prev => ({ ...prev, isOpen: false, loading: false }));
      }
    } catch (err) {
      alert(isAr ? 'خطأ في تحميل تفاصيل الاختبار' : 'Error loading exam details');
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
        alert(data.message || (isAr ? 'تم إنشاء الحساب بنجاح' : 'Account created successfully'));
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
        setCreateSubError(data.error || (isAr ? 'فشل في إنشاء الحساب' : 'Failed to create account'));
      }
    } catch (err: any) {
      setCreateSubError(err.message || (isAr ? 'خطأ في الاتصال بالخادم' : 'Server connection error'));
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
        alert(data.error || (isAr ? 'تعذر تعديل الحالة' : 'Failed to update status'));
      }
    } catch (err) {
      alert(isAr ? 'خطأ في تحديث الصلاحيات' : 'Error updating permissions');
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
        alert(data.error || (isAr ? 'تعذر تعديل الصلاحية' : 'Failed to modify permission'));
      }
    } catch (err) {
      alert(isAr ? 'خطأ في حفظ التعديل' : 'Error saving modification');
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
        alert(data.error || (isAr ? 'تعذر الدخول إلى حساب المستخدم' : 'Failed to enter user account'));
      }
    } catch (err: any) {
      alert((isAr ? 'حدث خطأ أثناء محاولة الدخول للحساب: ' : 'Error entering account: ') + err.message);
    }
  };

  // Helper strings based on role
  const getRoleTitle = () => {
    if (user?.role === 'CENTRAL_ADMIN') return isAr ? 'المدير المركزي' : 'Central Director';
    if (user?.role === 'GOVERNORATE_ADMIN') return isAr ? `مدير محافظة ${user?.governorate_name || ''}` : `Governorate Director - ${user?.governorate_name || ''}`;
    if (user?.role === 'SUPERVISOR') return isAr ? `الموجه الأول لمادة ${user?.subject_name || ''} - ${user?.governorate_name || ''}` : `Head Supervisor - ${user?.subject_name || ''} (${user?.governorate_name || ''})`;
    return isAr ? 'المدير العام للمنصة' : 'General Platform Administrator';
  };

  const getSubordinateTabTitle = () => {
    if (user?.role === 'CENTRAL_ADMIN') return isAr ? '🏢 مدراء المحافظات (27 محافظة)' : '🏢 Governorate Directors (27 Governorates)';
    if (user?.role === 'GOVERNORATE_ADMIN') return isAr ? '📐 موجهو المواد بالمحافظة' : '📐 Subject Supervisors in Governorate';
    if (user?.role === 'SUPERVISOR') return isAr ? '👨‍🏫 معلمو المادة التابعون لي' : '👨‍🏫 Subordinate Subject Teachers';
    return isAr ? '🏛️ المدراء المركزيون' : '🏛️ Central Directors';
  };

  const getAddSubordinateBtnTitle = () => {
    if (user?.role === 'CENTRAL_ADMIN') return isAr ? '➕ إضافة مدير محافظة جديد' : '➕ Add New Governorate Director';
    if (user?.role === 'GOVERNORATE_ADMIN') return isAr ? '➕ إضافة موجه مادة جديد' : '➕ Add New Subject Supervisor';
    if (user?.role === 'SUPERVISOR') return isAr ? '➕ إضافة معلم جديد' : '➕ Add New Teacher';
    return isAr ? '➕ إضافة مدير مركزي' : '➕ Add Central Director';
  };

  return (
    <div className="hierarchy-portal-container" style={{
      maxWidth: '1360px',
      margin: '0 auto',
      padding: '1rem 0.75rem 3.5rem',
      direction: isAr ? 'rtl' : 'ltr'
    }}>
      {/* 1. Header Banner (Bright Theme - Fully Mobile Responsive) */}
      <div className="card" style={{
        background: 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 50%, #EEF2FF 100%)',
        borderRadius: '1.25rem',
        padding: '1.25rem 1rem',
        color: 'var(--text-title)',
        marginBottom: '1.5rem',
        boxShadow: '0 10px 30px -10px rgba(79, 70, 229, 0.08)',
        border: '1.5px solid #E0E7FF',
        position: 'relative',
        overflow: 'hidden'
      }}>
        <div style={{ position: 'relative', zIndex: 2 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.65rem', flexWrap: 'wrap' }}>
            <span style={{
              background: '#EEF2FF',
              color: '#4F46E5',
              padding: '0.3rem 0.75rem',
              borderRadius: '999px',
              fontSize: '0.78rem',
              fontWeight: 800,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              border: '1px solid #C7D2FE'
            }}>
              <ShieldCheck size={14} color="#4F46E5" />
              <span>{isAr ? 'نظام الرقابة والإشراف التراتبي المباشر' : 'Direct Hierarchical Governance & Supervision System'}</span>
            </span>

            {user?.governorate_name && (
              <span style={{
                background: '#FEF3C7',
                color: '#92400E',
                border: '1px solid #FDE68A',
                padding: '0.3rem 0.75rem',
                borderRadius: '999px',
                fontSize: '0.78rem',
                fontWeight: 700
              }}>
                📍 {user.governorate_name}
              </span>
            )}

            {user?.subject_name && (
              <span style={{
                background: '#ECFDF5',
                color: '#065F46',
                border: '1px solid #A7F3D0',
                padding: '0.3rem 0.75rem',
                borderRadius: '999px',
                fontSize: '0.78rem',
                fontWeight: 700
              }}>
                📚 {isAr ? `مادة ${user.subject_name}` : `Subject: ${user.subject_name}`}
              </span>
            )}
          </div>

          <h1 style={{ fontSize: 'clamp(1.25rem, 3.5vw, 1.85rem)', fontWeight: 900, margin: 0, color: 'var(--text-title)', letterSpacing: '-0.02em', lineHeight: 1.3 }}>
            {getRoleTitle()}
          </h1>
        </div>
      </div>

      {/* 2. Top KPI Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))',
        gap: '0.75rem',
        marginBottom: '1.5rem'
      }}>
        <div style={{
          background: '#FFFFFF',
          borderRadius: '0.875rem',
          padding: '1rem',
          boxShadow: '0 2px 4px rgba(0,0,0,0.03)',
          border: '1px solid var(--border-light)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem'
        }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: '#EEF2FF', color: '#4F46E5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <FileText size={20} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>
              {isAr ? 'إجمالي الاختبارات المتاحة' : 'Total Available Exams'}
            </div>
            <div style={{ fontSize: '1.35rem', fontWeight: 900, color: 'var(--primary-900)' }}>{stats.examsCount}</div>
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
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>
              {isAr ? 'المعلمون في النطاق' : 'Teachers in Scope'}
            </div>
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
                {user?.role === 'CENTRAL_ADMIN' || user?.role === 'ADMIN'
                  ? (isAr ? 'مدراء المحافظات والموجهون' : 'Gov Directors & Supervisors')
                  : (isAr ? 'الموجهون بالمحافظة' : 'Governorate Supervisors')}
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
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>
              {isAr ? 'حالة الرقابة والربط' : 'Supervisory Connection'}
            </div>
            <div style={{ fontSize: '1.15rem', fontWeight: 900, color: '#6D28D9' }}>
              {isAr ? 'متصل 100% بالخادم' : '100% Cloud Connected'}
            </div>
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
              boxShadow: '0 4px 10px rgba(37, 99, 255, 0.3)'
            }}>
              🏛️
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                <span style={{ background: '#2563EB', color: '#fff', fontSize: '0.72rem', fontWeight: 800, padding: '0.15rem 0.5rem', borderRadius: '4px' }}>
                  {isAr ? 'المستوى 1 في التراتبية' : 'Hierarchy Level 1'}
                </span>
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 900, color: '#1E3A8A' }}>
                  {isAr ? 'إدارة وتعيين المدير المركزي' : 'Manage & Assign Central Director'}
                </h3>
              </div>
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
              <span>{isAr ? '➕ إنشاء مدير مركزي جديد' : '➕ Create Central Director'}</span>
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
              {isAr ? `عرض قائمة المدراء المركزيين (${subordinates.length})` : `View Central Directors (${subordinates.length})`}
            </button>
          </div>
        </div>
      )}

      {/* 3. Main Navigation Tabs (Swipeable / Scrollable on Mobile) */}
      <div style={{
        display: 'flex',
        gap: '0.5rem',
        borderBottom: '2px solid var(--border-light)',
        marginBottom: '1.5rem',
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
        paddingBottom: '2px',
        scrollbarWidth: 'none'
      }}>
        <button
          onClick={() => setActiveTab('analysis')}
          style={{
            padding: '0.75rem 1.25rem',
            fontWeight: 800,
            fontSize: '0.9rem',
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            borderBottom: activeTab === 'analysis' ? '3px solid #4F46E5' : '3px solid transparent',
            color: activeTab === 'analysis' ? '#4F46E5' : 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.45rem',
            whiteSpace: 'nowrap',
            flexShrink: 0
          }}
        >
          <BarChart2 size={17} />
          <span>{isAr ? 'التحليلات والمتابعة الإشرافية' : 'Supervisory Analytics'}</span>
          <span style={{
            background: activeTab === 'analysis' ? '#EEF2FF' : '#F3F4F6',
            color: activeTab === 'analysis' ? '#4F46E5' : 'var(--text-muted)',
            padding: '0.15rem 0.5rem',
            borderRadius: '999px',
            fontSize: '0.75rem'
          }}>
            {analysisData?.kpis?.totalExams ?? '📊'}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('exams')}
          style={{
            padding: '0.75rem 1.25rem',
            fontWeight: 800,
            fontSize: '0.9rem',
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            borderBottom: activeTab === 'exams' ? '3px solid #4F46E5' : '3px solid transparent',
            color: activeTab === 'exams' ? '#4F46E5' : 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.45rem',
            whiteSpace: 'nowrap',
            flexShrink: 0
          }}
        >
          <FileText size={17} />
          <span>{isAr ? 'مستكشف الاختبارات التفاعلي' : 'Interactive Exams Explorer'}</span>
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
            padding: '0.75rem 1.25rem',
            fontWeight: 800,
            fontSize: '0.9rem',
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            borderBottom: activeTab === 'subordinates' ? '3px solid #4F46E5' : '3px solid transparent',
            color: activeTab === 'subordinates' ? '#4F46E5' : 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.45rem',
            whiteSpace: 'nowrap',
            flexShrink: 0
          }}
        >
          <Users size={17} />
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

      {/* 4. Tab Content: SUPERVISORY ANALYSIS */}
      {activeTab === 'analysis' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Analysis Filter Bar */}
          <div style={{
            background: '#FFFFFF',
            borderRadius: '1rem',
            padding: '1.25rem 1.5rem',
            boxShadow: '0 2px 4px rgba(0,0,0,0.04)',
            border: '1px solid var(--border-light)',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem'
          }}>
            {/* Timeframe selector (Monthly / Weekly) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <Calendar size={16} />
                {isAr ? 'نطاق المتابعة:' : 'Timeframe:'}
              </span>
              <div style={{
                display: 'inline-flex',
                background: '#F1F5F9',
                borderRadius: '0.75rem',
                padding: '0.25rem',
                gap: '0.25rem'
              }}>
                <button
                  type="button"
                  onClick={() => setAnalysisTimeframe('monthly')}
                  style={{
                    padding: '0.45rem 1rem',
                    borderRadius: '0.5rem',
                    fontSize: '0.85rem',
                    fontWeight: 800,
                    border: 'none',
                    cursor: 'pointer',
                    background: analysisTimeframe === 'monthly' ? '#4F46E5' : 'transparent',
                    color: analysisTimeframe === 'monthly' ? '#FFFFFF' : '#64748B',
                    boxShadow: analysisTimeframe === 'monthly' ? '0 1px 3px rgba(79, 70, 229, 0.3)' : 'none',
                    transition: 'all 0.2s ease'
                  }}
                >
                  {isAr ? '📅 شهرياً (Monthly)' : '📅 Monthly'}
                </button>
                <button
                  type="button"
                  onClick={() => setAnalysisTimeframe('weekly')}
                  style={{
                    padding: '0.45rem 1rem',
                    borderRadius: '0.5rem',
                    fontSize: '0.85rem',
                    fontWeight: 800,
                    border: 'none',
                    cursor: 'pointer',
                    background: analysisTimeframe === 'weekly' ? '#4F46E5' : 'transparent',
                    color: analysisTimeframe === 'weekly' ? '#FFFFFF' : '#64748B',
                    boxShadow: analysisTimeframe === 'weekly' ? '0 1px 3px rgba(79, 70, 229, 0.3)' : 'none',
                    transition: 'all 0.2s ease'
                  }}
                >
                  {isAr ? '📆 أسبوعياً (Weekly)' : '📆 Weekly'}
                </button>
              </div>
            </div>

            {/* Scope Selectors (Governorate & Subject) */}
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.75rem' }}>
              {/* Governorate Dropdown (27 governorates for Central Admin & Admin) */}
              {(user?.role === 'ADMIN' || user?.role === 'CENTRAL_ADMIN') ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <MapPin size={16} color="#6366F1" />
                  <select
                    value={analysisGovId}
                    onChange={(e) => setAnalysisGovId(e.target.value)}
                    style={{
                      padding: '0.5rem 0.875rem',
                      borderRadius: '0.625rem',
                      border: '1px solid var(--border-light)',
                      background: '#F8FAFC',
                      fontSize: '0.875rem',
                      fontWeight: 700,
                      color: 'var(--text-main)',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="ALL">{isAr ? '🌐 كل المحافظات (27 محافظة)' : '🌐 All Governorates (27)'}</option>
                    {governorates.map(gov => (
                      <option key={gov.id} value={gov.id}>
                        {isAr ? gov.name_ar : gov.name_en}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  padding: '0.45rem 0.85rem',
                  background: '#EEF2FF',
                  color: '#4F46E5',
                  borderRadius: '0.5rem',
                  fontSize: '0.825rem',
                  fontWeight: 700
                }}>
                  <MapPin size={14} />
                  <span>{user?.governorate_name || (isAr ? 'المحافظة التابع لها' : 'Assigned Governorate')}</span>
                </div>
              )}

              {/* Subject Dropdown */}
              {(user?.role === 'ADMIN' || user?.role === 'CENTRAL_ADMIN' || user?.role === 'GOVERNORATE_ADMIN') ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <BookOpen size={16} color="#6366F1" />
                  <select
                    value={analysisSubId}
                    onChange={(e) => setAnalysisSubId(e.target.value)}
                    style={{
                      padding: '0.5rem 0.875rem',
                      borderRadius: '0.625rem',
                      border: '1px solid var(--border-light)',
                      background: '#F8FAFC',
                      fontSize: '0.875rem',
                      fontWeight: 700,
                      color: 'var(--text-main)',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="ALL">{isAr ? '📚 كل المواد الدراسية' : '📚 All Subjects'}</option>
                    {subjects.map(sub => (
                      <option key={sub.id} value={sub.id}>
                        {isAr ? sub.name_ar : sub.name_en}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  padding: '0.45rem 0.85rem',
                  background: '#FDF2F8',
                  color: '#DB2777',
                  borderRadius: '0.5rem',
                  fontSize: '0.825rem',
                  fontWeight: 700
                }}>
                  <BookOpen size={14} />
                  <span>{user?.subject_name || (isAr ? 'المادة التخصصية' : 'Assigned Subject')}</span>
                </div>
              )}

              <button
                type="button"
                onClick={fetchSupervisoryAnalysis}
                disabled={isAnalysisLoading}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '0.625rem',
                  border: '1px solid #E2E8F0',
                  background: '#FFFFFF',
                  color: '#475569',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                }}
              >
                <span>🔄</span>
                <span>{isAnalysisLoading ? (isAr ? 'جاري التحميل...' : 'Loading...') : (isAr ? 'تحديث' : 'Refresh')}</span>
              </button>
            </div>
          </div>

          {/* KPI Stat Cards (5 metrics - Mobile Responsive & Combined Generated + Teacher Exams) */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 140px), 1fr))',
            gap: '0.75rem'
          }}>
            {/* 1. Exams in period */}
            <div style={{
              background: '#FFFFFF',
              borderRadius: '0.875rem',
              padding: '1rem',
              border: '1px solid #E0E7FF',
              boxShadow: '0 2px 4px rgba(79, 70, 229, 0.04)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.4rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                  {analysisTimeframe === 'monthly' ? (isAr ? 'إجمالي الاختبارات شهرياً' : 'Exams this Month') : (isAr ? 'إجمالي الاختبارات أسبوعياً' : 'Exams this Week')}
                </span>
                <span style={{ padding: '0.3rem', background: '#EEF2FF', borderRadius: '0.45rem', color: '#4F46E5' }}>
                  <FileText size={16} />
                </span>
              </div>
              <div style={{ fontSize: 'clamp(1.4rem, 4vw, 1.85rem)', fontWeight: 900, color: '#1E293B', lineHeight: 1.1 }}>
                {analysisData?.kpis?.totalExams ?? 0}
              </div>
              <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginTop: '0.1rem' }}>
                <span style={{ fontSize: '0.7rem', background: '#F0FDF4', color: '#166534', padding: '0.15rem 0.4rem', borderRadius: '4px', fontWeight: 700 }}>
                  {isAr ? `🤖 ${analysisData?.kpis?.generatedExamsCount ?? 0} مولدة` : `🤖 ${analysisData?.kpis?.generatedExamsCount ?? 0} AI`}
                </span>
                <span style={{ fontSize: '0.7rem', background: '#EEF2FF', color: '#3730A3', padding: '0.15rem 0.4rem', borderRadius: '4px', fontWeight: 700 }}>
                  {isAr ? `👨‍🏫 ${analysisData?.kpis?.teacherExamsCount ?? 0} مضافة` : `👨‍🏫 ${analysisData?.kpis?.teacherExamsCount ?? 0} Teacher`}
                </span>
              </div>
              <div style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 600 }}>
                {isAr ? `تراكمي: ${analysisData?.kpis?.lifetimeExams ?? 0} اختبار` : `Lifetime: ${analysisData?.kpis?.lifetimeExams ?? 0} exams`}
              </div>
            </div>

            {/* 2. Total Attempts */}
            <div style={{
              background: '#FFFFFF',
              borderRadius: '0.875rem',
              padding: '1rem',
              border: '1px solid #DCFCE7',
              boxShadow: '0 2px 4px rgba(5, 150, 105, 0.04)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.4rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                  {isAr ? 'محاولات ونتائج الطلاب' : 'Student Submissions'}
                </span>
                <span style={{ padding: '0.3rem', background: '#ECFDF5', borderRadius: '0.45rem', color: '#059669' }}>
                  <CheckCircle2 size={16} />
                </span>
              </div>
              <div style={{ fontSize: 'clamp(1.4rem, 4vw, 1.85rem)', fontWeight: 900, color: '#059669', lineHeight: 1.1 }}>
                {analysisData?.kpis?.totalAttempts ?? 0}
              </div>
              <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginTop: '0.1rem' }}>
                <span style={{ fontSize: '0.7rem', background: '#F0FDF4', color: '#166534', padding: '0.15rem 0.4rem', borderRadius: '4px', fontWeight: 700 }}>
                  {isAr ? `🤖 ${analysisData?.kpis?.generatedAttemptsCount ?? 0} تقييم ذكي` : `🤖 ${analysisData?.kpis?.generatedAttemptsCount ?? 0} AI`}
                </span>
                <span style={{ fontSize: '0.7rem', background: '#EEF2FF', color: '#3730A3', padding: '0.15rem 0.4rem', borderRadius: '4px', fontWeight: 700 }}>
                  {isAr ? `👨‍🏫 ${analysisData?.kpis?.teacherAttemptsCount ?? 0} امتحانات` : `👨‍🏫 ${analysisData?.kpis?.teacherAttemptsCount ?? 0} Tests`}
                </span>
              </div>
              <div style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 600 }}>
                {isAr ? 'نتائج مصححة ومقيدة بالمنظومة' : 'Graded in system'}
              </div>
            </div>

            {/* 3. Average Score */}
            <div style={{
              background: '#FFFFFF',
              borderRadius: '0.875rem',
              padding: '1rem',
              border: '1px solid #FEF3C7',
              boxShadow: '0 2px 4px rgba(217, 119, 6, 0.04)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.4rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                  {isAr ? 'متوسط درجات الطلاب' : 'Average Student Score'}
                </span>
                <span style={{ padding: '0.3rem', background: '#FFFBEB', borderRadius: '0.45rem', color: '#D97706' }}>
                  <Award size={16} />
                </span>
              </div>
              <div style={{ fontSize: 'clamp(1.4rem, 4vw, 1.85rem)', fontWeight: 900, color: '#D97706', lineHeight: 1.1 }}>
                {analysisData?.kpis?.averageScore ?? 0}%
              </div>
              <div style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 600 }}>
                {analysisData?.kpis?.averageScore >= 75 ? (isAr ? '🌟 أداء ممتاز ومرتفع' : '🌟 High Performance') : (isAr ? '📈 أداء مستقر وقيد المتابعة' : '📈 Stable performance')}
              </div>
            </div>

            {/* 4. Pass Rate */}
            <div style={{
              background: '#FFFFFF',
              borderRadius: '0.875rem',
              padding: '1rem',
              border: '1px solid #E0F2FE',
              boxShadow: '0 2px 4px rgba(2, 132, 199, 0.04)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.4rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                  {isAr ? 'نسبة اجتياز الطلاب' : 'Student Pass Rate'}
                </span>
                <span style={{ padding: '0.3rem', background: '#F0F9FF', borderRadius: '0.45rem', color: '#0284C7' }}>
                  <TrendingUp size={16} />
                </span>
              </div>
              <div style={{ fontSize: 'clamp(1.4rem, 4vw, 1.85rem)', fontWeight: 900, color: '#0284C7', lineHeight: 1.1 }}>
                {analysisData?.kpis?.passRate ?? 0}%
              </div>
              <div style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 600 }}>
                {isAr ? 'الدرجات أعلى من 50%' : 'Scores >= 50%'}
              </div>
            </div>

            {/* 5. Active Staff Under Supervision */}
            <div style={{
              background: '#FFFFFF',
              borderRadius: '0.875rem',
              padding: '1rem',
              border: '1px solid #FCE7F3',
              boxShadow: '0 2px 4px rgba(219, 39, 119, 0.04)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.4rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                  {isAr ? 'الكوادر الفعالة تحتي' : 'Active Subordinates'}
                </span>
                <span style={{ padding: '0.3rem', background: '#FDF2F8', borderRadius: '0.45rem', color: '#DB2777' }}>
                  <Users size={16} />
                </span>
              </div>
              <div style={{ fontSize: 'clamp(1.4rem, 4vw, 1.85rem)', fontWeight: 900, color: '#DB2777', lineHeight: 1.1 }}>
                {analysisData?.kpis?.activeSubordinatesCount ?? 0}
                <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#94A3B8', marginInlineStart: '0.35rem' }}>
                  / {analysisData?.kpis?.totalSubordinatesCount ?? 0}
                </span>
              </div>
              <div style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 600 }}>
                {isAr ? 'أنشأوا اختبارات ونشطوا بالفترة' : 'Active in period'}
              </div>
            </div>
          </div>

          {/* Timeline Trend Breakdown */}
          {analysisData?.timelineTrend && analysisData.timelineTrend.length > 0 && (
            <div style={{
              background: '#FFFFFF',
              borderRadius: '1rem',
              padding: '1.25rem 1rem',
              border: '1px solid var(--border-light)',
              boxShadow: '0 2px 4px rgba(0,0,0,0.04)'
            }}>
              <h3 style={{
                margin: '0 0 1rem 0',
                fontSize: '1rem',
                fontWeight: 800,
                color: '#1E293B',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                flexWrap: 'wrap'
              }}>
                <TrendingUp size={18} color="#4F46E5" />
                <span>
                  {analysisTimeframe === 'monthly'
                    ? (isAr ? 'مقارنة تطور الأداء والامتحانات (آخر 4 شهور)' : 'Performance & Exam Progression (Last 4 Months)')
                    : (isAr ? 'مقارنة تطور الأداء والامتحانات (آخر 4 أسابيع)' : 'Performance & Exam Progression (Last 4 Weeks)')}
                </span>
              </h3>

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))',
                gap: '0.75rem'
              }}>
                {analysisData.timelineTrend.map((slot: any, idx: number) => (
                  <div key={idx} style={{
                    padding: '0.85rem',
                    background: '#F8FAFC',
                    borderRadius: '0.75rem',
                    border: '1px solid #E2E8F0',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 800, fontSize: '0.85rem', color: '#334155' }}>
                        {isAr ? slot.label : slot.labelEn}
                      </span>
                      <span style={{
                        background: '#EEF2FF',
                        color: '#4F46E5',
                        padding: '0.15rem 0.45rem',
                        borderRadius: '0.375rem',
                        fontSize: '0.72rem',
                        fontWeight: 700
                      }}>
                        {slot.examsCount} {isAr ? 'اختبار' : 'exams'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#64748B' }}>
                      <span>{isAr ? 'المحاولات:' : 'Atts:'} <strong>{slot.attemptsCount}</strong></span>
                      <span>{isAr ? 'المتوسط:' : 'Avg:'} <strong style={{ color: slot.avgScore >= 50 ? '#059669' : '#D97706' }}>{slot.avgScore}%</strong></span>
                    </div>

                    {/* Progress visual */}
                    <div style={{
                      width: '100%',
                      height: '6px',
                      background: '#E2E8F0',
                      borderRadius: '999px',
                      overflow: 'hidden'
                    }}>
                      <div style={{
                        width: `${Math.min(slot.avgScore, 100)}%`,
                        height: '100%',
                        background: slot.avgScore >= 75 ? '#059669' : (slot.avgScore >= 50 ? '#4F46E5' : '#D97706'),
                        borderRadius: '999px',
                        transition: 'width 0.4s ease'
                      }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Subordinates Under Me Performance Cards */}
          <div style={{
            background: '#FFFFFF',
            borderRadius: '1rem',
            padding: '1.25rem 1rem',
            border: '1px solid var(--border-light)',
            boxShadow: '0 2px 4px rgba(0,0,0,0.04)'
          }}>
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '1.25rem',
              gap: '0.75rem'
            }}>
              <div>
                <h3 style={{
                  margin: 0,
                  fontSize: '1.05rem',
                  fontWeight: 800,
                  color: '#1E293B',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  flexWrap: 'wrap'
                }}>
                  <Users size={18} color="#4F46E5" />
                  <span>
                    {(user?.role === 'ADMIN' || user?.role === 'CENTRAL_ADMIN')
                      ? (isAr ? 'تحليل ومتابعة المحافظات ومدراء المحافظات التابعين لي' : 'Governorates & Governorate Directors Analysis')
                      : (user?.role === 'GOVERNORATE_ADMIN')
                        ? (isAr ? 'تحليل ومتابعة المواد والموجهين في محافظتي' : 'Subjects & Supervisors in My Governorate')
                        : (isAr ? 'تحليل ومتابعة المعلمين تحت إشرافي وتخصصي' : 'Teachers Under My Supervision')}
                  </span>
                </h3>
                <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8rem', color: '#64748B' }}>
                  {isAr
                    ? 'فحص شامل لمعدلات الاختبارات (المولدة ذكياً والمضافة من المعلمين) ومحاولات ودرجات الطلاب مع إمكانية الدخول المباشر للحساب'
                    : 'Comprehensive review of exams (AI generated + teacher added) and student scores with direct account access'}
                </p>
              </div>

              <span style={{
                background: '#F1F5F9',
                color: '#475569',
                padding: '0.3rem 0.65rem',
                borderRadius: '0.5rem',
                fontSize: '0.78rem',
                fontWeight: 700
              }}>
                {isAr ? `العدد: ${analysisData?.subordinatesAnalysis?.length || 0}` : `Total: ${analysisData?.subordinatesAnalysis?.length || 0}`}
              </span>
            </div>

            {isAnalysisLoading ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: '#64748B' }}>
                <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>⏳</div>
                <p style={{ margin: 0, fontWeight: 700 }}>{isAr ? 'جاري تحميل التحليلات الإشرافية...' : 'Loading supervisory analysis...'}</p>
              </div>
            ) : !analysisData?.subordinatesAnalysis || analysisData.subordinatesAnalysis.length === 0 ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: '#94A3B8' }}>
                <p style={{ margin: 0, fontWeight: 700 }}>{isAr ? 'لا توجد بيانات مطابقة لهذا النطاق حالياً' : 'No subordinate data found for this scope'}</p>
              </div>
            ) : (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))',
                gap: '1rem'
              }}>
                {analysisData.subordinatesAnalysis.map((item: any, idx: number) => {
                  const statusBg = item.status === 'EXCELLENT' ? '#ECFDF5' : (item.status === 'GOOD' ? '#EEF2FF' : '#FFFBEB');
                  const statusColor = item.status === 'EXCELLENT' ? '#059669' : (item.status === 'GOOD' ? '#4F46E5' : '#D97706');
                  const statusText = item.status === 'EXCELLENT'
                    ? (isAr ? 'ممتاز 🌟' : 'Excellent')
                    : (item.status === 'GOOD' ? (isAr ? 'مستقر 📈' : 'Good') : (isAr ? 'بحاجة لمتابعة ⚠️' : 'Needs Support'));

                  return (
                    <div
                      key={item.id || idx}
                      style={{
                        background: '#FFFFFF',
                        border: '1px solid #E2E8F0',
                        borderRadius: '0.875rem',
                        padding: '1.15rem',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        gap: '0.85rem',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                        transition: 'transform 0.15s ease, box-shadow 0.15s ease'
                      }}
                    >
                      <div>
                        {/* Header: Title & Status */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.65rem' }}>
                          <div>
                            <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#0F172A' }}>
                              {item.title}
                            </div>
                            <div style={{ fontSize: '0.78rem', color: '#64748B', marginTop: '0.15rem' }}>
                              {item.subordinateName} {item.schoolName ? `• ${item.schoolName}` : ''}
                            </div>
                          </div>
                          <span style={{
                            padding: '0.2rem 0.55rem',
                            borderRadius: '999px',
                            background: statusBg,
                            color: statusColor,
                            fontSize: '0.72rem',
                            fontWeight: 800,
                            whiteSpace: 'nowrap'
                          }}>
                            {statusText}
                          </span>
                        </div>

                        {/* Metrics Grid */}
                        <div style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(3, 1fr)',
                          gap: '0.4rem',
                          background: '#F8FAFC',
                          borderRadius: '0.625rem',
                          padding: '0.65rem',
                          textAlign: 'center'
                        }}>
                          <div>
                            <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 600 }}>
                              {isAr ? 'الاختبارات' : 'Exams'}
                            </div>
                            <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#1E293B', marginTop: '0.1rem' }}>
                              {item.totalExams}
                            </div>
                            <div style={{ fontSize: '0.65rem', color: '#94A3B8' }}>
                              {item.teacherExams || 0} مضاف + {item.generatedExams || 0} ذكي
                            </div>
                          </div>

                          <div>
                            <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 600 }}>
                              {isAr ? 'المحاولات' : 'Attempts'}
                            </div>
                            <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#1E293B', marginTop: '0.1rem' }}>
                              {item.totalAttempts}
                            </div>
                            <div style={{ fontSize: '0.65rem', color: '#94A3B8' }}>
                              {isAr ? 'محاولة طالب' : 'student att.'}
                            </div>
                          </div>

                          <div>
                            <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 600 }}>
                              {isAr ? 'المتوسط' : 'Avg'}
                            </div>
                            <div style={{ fontSize: '1.05rem', fontWeight: 800, color: statusColor, marginTop: '0.1rem' }}>
                              {item.averageScore}%
                            </div>
                            <div style={{ fontSize: '0.65rem', color: '#94A3B8' }}>
                              {isAr ? `نجاح ${item.passRate}%` : `${item.passRate}% pass`}
                            </div>
                          </div>
                        </div>

                        {item.subordinateEmail && (
                          <div style={{ fontSize: '0.72rem', color: '#94A3B8', marginTop: '0.4rem', direction: 'ltr', textAlign: isAr ? 'right' : 'left' }}>
                            ✉️ {item.subordinateEmail}
                          </div>
                        )}
                      </div>

                      {/* Footer Actions */}
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        paddingTop: '0.65rem',
                        borderTop: '1px solid #F1F5F9',
                        flexWrap: 'wrap',
                        gap: '0.5rem'
                      }}>
                        <span style={{ fontSize: '0.72rem', color: '#64748B' }}>
                          {isAr ? `نسبة الاجتياز: ${item.passRate}%` : `Pass: ${item.passRate}%`}
                        </span>

                        {item.subordinateId ? (
                          <button
                            type="button"
                            onClick={() => handleImpersonateById(item.subordinateId)}
                            style={{
                              padding: '0.4rem 0.75rem',
                              background: '#4F46E5',
                              color: '#FFFFFF',
                              borderRadius: '0.5rem',
                              border: 'none',
                              fontSize: '0.78rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.3rem',
                              boxShadow: '0 2px 4px rgba(79, 70, 229, 0.2)',
                              transition: 'background 0.15s ease'
                            }}
                          >
                            <Eye size={13} />
                            <span>
                              {isAr 
                                ? (item.targetType === 'GOVERNORATE' 
                                    ? 'معاينة ودخول حساب مدير المحافظة' 
                                    : item.targetType === 'SUBJECT_SUPERVISOR' 
                                      ? 'معاينة ودخول حساب الموجه' 
                                      : 'معاينة ودخول حساب المعلم') 
                                : 'Access Account'}
                            </span>
                          </button>
                        ) : (
                          <span style={{ fontSize: '0.72rem', color: '#94A3B8', fontStyle: 'italic' }}>
                            {isAr ? 'غير معيّن بعد' : 'Not assigned'}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 5. Tab Content: EXAMS */}
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
                {isAr ? '🌍 المحافظة:' : '🌍 Governorate:'}
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
                  <option value="ALL">{isAr ? '🇪🇬 جميع محافظات مصر (27 محافظة)' : '🇪🇬 All Egypt Governorates (27)'}</option>
                  {governorates.map(g => (
                    <option key={g.id} value={g.id}>
                      {isAr ? g.name_ar : (g.name_en || g.name_ar)}
                    </option>
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
                  <span>
                    {isAr 
                      ? `محافظة ${user?.governorate_name || 'المحددة'} (مقيد بنطاقك)` 
                      : `${user?.governorate_name || 'Assigned'} Governorate (Scoped)`}
                  </span>
                </div>
              )}
            </div>

            {/* 2. Subject Dropdown */}
            <div style={{ flex: '1 1 220px', minWidth: '200px' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                {isAr ? '📚 المادة الدراسية:' : '📚 Subject:'}
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
                  <option value="ALL">{isAr ? '📖 جميع المواد الدراسية' : '📖 All Academic Subjects'}</option>
                  {subjects.map(s => (
                    <option key={s.id} value={s.id}>
                      {isAr ? s.name_ar : (s.name_en || s.name_ar)}
                    </option>
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
                  <span>
                    {isAr 
                      ? `مادة ${user?.subject_name || 'المحددة'} (مقيد بتخصصك)` 
                      : `${user?.subject_name || 'Assigned'} Subject (Scoped)`}
                  </span>
                </div>
              )}
            </div>

            {/* 3. Search Bar */}
            <div style={{ flex: '2 1 280px', minWidth: '240px' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                {isAr ? '🔍 بحث سريع:' : '🔍 Quick Search:'}
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  placeholder={isAr ? 'ابحث بعنوان الاختبار أو اسم المعلم...' : 'Search by exam title or teacher name...'}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    width: '100%',
                    padding: isAr ? '0.6rem 2.2rem 0.6rem 0.85rem' : '0.6rem 0.85rem 0.6rem 2.2rem',
                    borderRadius: '0.5rem',
                    border: '1.5px solid var(--border-light)',
                    fontSize: '0.9rem',
                    outline: 'none'
                  }}
                />
                <Search size={16} style={{ 
                  position: 'absolute', 
                  [isAr ? 'right' : 'left']: '0.75rem', 
                  top: '50%', 
                  transform: 'translateY(-50%)', 
                  color: 'var(--text-muted)' 
                }} />
              </div>
            </div>
          </div>

          {/* Exam Cards Grid - Everything Clickable */}
          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
              {isAr ? 'جاري تحميل الاختبارات المرتبطة...' : 'Loading associated exams...'}
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
                {isAr ? 'لا توجد اختبارات تطابق الفلتر الحالي' : 'No exams matching current filter'}
              </h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                {isAr ? 'حاول اختيار محافظة أو مادة أخرى أو تفقد الحسابات التابعة.' : 'Try selecting another governorate or subject, or check subordinate accounts.'}
              </p>
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))',
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
                      {exam.is_published 
                        ? (isAr ? 'منشور للطلاب' : 'Published') 
                        : (isAr ? 'مسودة قيد المراجعة' : 'Draft')}
                    </span>
                  </div>

                  <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-dark)', marginBottom: '0.5rem', lineHeight: 1.4 }}>
                    {exam.title_ar}
                  </h3>

                  <div style={{ fontSize: '0.825rem', color: 'var(--text-muted)', marginBottom: '1rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <MapPin size={14} color="#6366F1" />
                      <span>{exam.governorate_name || (isAr ? 'محافظة القاهرة' : 'Cairo')}</span>
                      <span style={{ color: '#CBD5E1' }}>•</span>
                      <span>{exam.grade_name_ar}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <Users size={14} color="#10B981" />
                      <span>{isAr ? `المعلم: ${exam.teacher_name}` : `Teacher: ${exam.teacher_name}`}</span>
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
                      {exam.duration_minutes} {isAr ? 'دقيقة' : 'min'}
                    </span>
                    <span style={{ color: '#4F46E5', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <HelpCircle size={14} />
                      {exam.questions_count} {isAr ? 'أسئلة' : 'Questions'}
                    </span>
                    <span style={{
                      background: '#F1F5F9',
                      padding: '0.2rem 0.5rem',
                      borderRadius: '0.35rem',
                      color: '#334155'
                    }}>
                      {exam.submissions_count} {isAr ? 'إجابة' : 'Submissions'}
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
                    <span>{isAr ? 'انقر لمعاينة أسئلة الاختبار ونموذج الإجابة 🔍' : 'Click to inspect exam questions & answers 🔍'}</span>
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
              {isAr ? 'جاري تحميل المرؤوسين...' : 'Loading subordinates...'}
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
                {isAr ? 'لا يوجد مستخدمون مسجلون في هذه الرتبة حالياً' : 'No staff currently registered at this rank'}
              </h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
                {isAr ? 'اضغط على زر الإضافة بالأعلى لإنشاء أول حساب تابع لك.' : 'Click Add above to create your first subordinate account.'}
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
              <table style={{ minWidth: '650px', width: '100%', borderCollapse: 'collapse', textAlign: isAr ? 'right' : 'left' }}>
                <thead>
                  <tr style={{ background: '#F8FAFC', borderBottom: '1.5px solid var(--border-light)' }}>
                    <th style={{ padding: '0.85rem 1rem', fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-muted)' }}>
                      {isAr ? 'الاسم الكامل والمستخدم' : 'Full Name & Email'}
                    </th>
                    <th style={{ padding: '0.85rem 1rem', fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-muted)' }}>
                      {isAr ? 'الدور / الرتبة' : 'Role / Rank'}
                    </th>
                    <th style={{ padding: '0.85rem 1rem', fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-muted)' }}>
                      {isAr ? 'المحافظة / المادة' : 'Governorate / Subject'}
                    </th>
                    <th style={{ padding: '0.85rem 1rem', fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-muted)' }}>
                      {isAr ? 'إحصائيات النشاط' : 'Activity Stats'}
                    </th>
                    <th style={{ padding: '0.85rem 1rem', fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-muted)' }}>
                      {isAr ? 'حالة الحساب' : 'Account Status'}
                    </th>
                    <th style={{ padding: '0.85rem 1rem', fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-muted)' }}>
                      {isAr ? 'إجراءات الصلاحيات' : 'Actions & Permissions'}
                    </th>
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
                          {subUser.role === 'CENTRAL_ADMIN' && (isAr ? 'المدير المركزي' : 'Central Director')}
                          {subUser.role === 'GOVERNORATE_ADMIN' && (isAr ? 'مدير المحافظة' : 'Gov Director')}
                          {subUser.role === 'SUPERVISOR' && (isAr ? 'موجه مادة' : 'Subject Supervisor')}
                          {subUser.role === 'TEACHER' && (isAr ? 'معلم' : 'Teacher')}
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
                        <div style={{ fontWeight: 700 }}>
                          {subUser.examsCount} {isAr ? 'اختبار تم إنشاؤه' : 'exams created'}
                        </div>
                        {subUser.subordinatesCount > 0 && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            {subUser.subordinatesCount} {isAr ? 'كادر تحت إشرافه' : 'subordinates'}
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
                          {subUser.isActive 
                            ? (isAr ? '● نشط ومفعل' : '● Active') 
                            : (isAr ? '● مجمّد معطل' : '● Suspended')}
                        </span>
                      </td>

                      <td style={{ padding: '1rem' }}>
                        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                          <button
                            onClick={() => handleImpersonateUser(subUser)}
                            title={isAr ? 'تسجيل دخول فوري لحسابه ومعاينة لوحة تحكمه وصلاحياته' : 'Login directly into their account'}
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
                            <span>{isAr ? 'دخول حسابه 🚀' : 'Enter Account 🚀'}</span>
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
                            <span>{isAr ? 'الصلاحيات' : 'Permissions'}</span>
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
                            {subUser.isActive 
                              ? (isAr ? 'تجميد' : 'Freeze') 
                              : (isAr ? 'تفعيل' : 'Activate')}
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
            direction: isAr ? 'rtl' : 'ltr'
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
                  {isAr ? 'معاينة تفاصيل الاختبار ونموذج الأسئلة' : 'Inspect Exam Details & Questions'}
                </h3>
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
                  {isAr ? 'جاري جلب تفاصيل الاختبار...' : 'Fetching exam details...'}
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
                    <div><strong>{isAr ? 'عنوان الاختبار:' : 'Exam Title:'}</strong> {inspectExamModal.exam.title_ar}</div>
                    <div><strong>{isAr ? 'المادة:' : 'Subject:'}</strong> {inspectExamModal.exam.subject_name_ar}</div>
                    <div><strong>{isAr ? 'المحافظة:' : 'Governorate:'}</strong> {inspectExamModal.exam.governorate_name || (isAr ? 'غير محددة' : 'Not specified')}</div>
                    <div><strong>{isAr ? 'المعلم:' : 'Teacher:'}</strong> {inspectExamModal.exam.teacher_name}</div>
                    <div><strong>{isAr ? 'مدة الاختبار:' : 'Duration:'}</strong> {inspectExamModal.exam.duration_minutes} {isAr ? 'دقيقة' : 'min'}</div>
                    <div><strong>{isAr ? 'حالة النشر:' : 'Status:'}</strong> {inspectExamModal.exam.is_published ? (isAr ? 'منشور للطلاب' : 'Published') : (isAr ? 'مسودة' : 'Draft')}</div>
                    <div><strong>{isAr ? 'عدد الطلاب الممتحنين:' : 'Students Examined:'}</strong> {inspectExamModal.exam.submissions_count}</div>
                    <div><strong>{isAr ? 'متوسط الدرجات:' : 'Average Score:'}</strong> {inspectExamModal.exam.avg_score !== null ? `${inspectExamModal.exam.avg_score}%` : (isAr ? 'لا يوجد' : 'N/A')}</div>
                  </div>

                  {/* Questions Section */}
                  <h4 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <HelpCircle size={18} color="#4F46E5" />
                    <span>{isAr ? `أسئلة الاختبار ونموذج الحل (${inspectExamModal.questions.length} أسئلة)` : `Exam Questions & Answer Key (${inspectExamModal.questions.length} questions)`}</span>
                  </h4>

                  {inspectExamModal.questions.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                      {isAr ? 'لا توجد أسئلة مسجلة في هذا الاختبار.' : 'No questions recorded in this exam.'}
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
                              {q.points} {isAr ? 'درجات' : 'pts'}
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
                              💡 <strong>{isAr ? 'التفسير والشرح:' : 'Explanation:'}</strong> {q.explanation}
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
            <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border-light)', background: '#F8FAFC', textAlign: isAr ? 'left' : 'right' }}>
              <button
                className="btn btn-outline"
                onClick={() => setInspectExamModal(prev => ({ ...prev, isOpen: false }))}
              >
                {isAr ? 'إغلاق المعاينة' : 'Close Inspection'}
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
            maxHeight: '90vh',
            overflowY: 'auto',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
            direction: isAr ? 'rtl' : 'ltr'
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
                    {isAr ? 'الاسم الكامل: *' : 'Full Name: *'}
                  </label>
                  <input
                    type="text"
                    required
                    placeholder={isAr ? 'مثال: أستاذ محمود السيد' : 'e.g. Mahmoud Elsayed'}
                    value={createFormData.fullName}
                    onChange={(e) => setCreateFormData(prev => ({ ...prev, fullName: e.target.value }))}
                    style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '0.5rem', border: '1.5px solid var(--border-light)', fontSize: '0.9rem' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 700, marginBottom: '0.35rem' }}>
                      {isAr ? 'البريد الإلكتروني: *' : 'Email Address: *'}
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
                      {isAr ? 'كلمة المرور: *' : 'Password: *'}
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
                      {isAr ? 'المحافظة المسندة لمدير المحافظة: *' : 'Assigned Governorate: *'}
                    </label>
                    <select
                      required
                      value={createFormData.governorateId}
                      onChange={(e) => setCreateFormData(prev => ({ ...prev, governorateId: e.target.value }))}
                      style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '0.5rem', border: '1.5px solid var(--border-light)', fontSize: '0.9rem' }}
                    >
                      <option value="">{isAr ? 'اختر المحافظة...' : 'Select Governorate...'}</option>
                      {governorates.map(g => (
                        <option key={g.id} value={g.id}>
                          {isAr ? g.name_ar : (g.name_en || g.name_ar)}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* If Governorate Admin: choose Subject for the Supervisor */}
                {user?.role === 'GOVERNORATE_ADMIN' && (
                  <div>
                    <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 700, marginBottom: '0.35rem' }}>
                      {isAr ? `المادة المسندة للموجه في محافظة ${user.governorate_name || ''}: *` : `Assigned Subject for Supervisor in ${user.governorate_name || ''}: *`}
                    </label>
                    <select
                      required
                      value={createFormData.subjectId}
                      onChange={(e) => setCreateFormData(prev => ({ ...prev, subjectId: e.target.value }))}
                      style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '0.5rem', border: '1.5px solid var(--border-light)', fontSize: '0.9rem' }}
                    >
                      <option value="">{isAr ? 'اختر المادة الدراسية...' : 'Select Academic Subject...'}</option>
                      {subjects.map(s => (
                        <option key={s.id} value={s.id}>
                          {isAr ? s.name_ar : (s.name_en || s.name_ar)}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* If Supervisor: Teacher fields */}
                {user?.role === 'SUPERVISOR' && (
                  <>
                    <div style={{ padding: '0.65rem', background: '#F0FDF4', borderRadius: '0.5rem', fontSize: '0.8rem', color: '#15803D', fontWeight: 700 }}>
                      {isAr 
                        ? `✓ سيتم قفل هذا المعلم تلقائياً على مادة ${user.subject_name} في محافظة ${user.governorate_name}.` 
                        : `✓ This teacher will be locked to ${user.subject_name} in ${user.governorate_name}.`}
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 700, marginBottom: '0.35rem' }}>
                        {isAr ? 'اسم المدرسة:' : 'School Name:'}
                      </label>
                      <input
                        type="text"
                        placeholder={isAr ? 'مثال: مدرسة السعيدية الثانوية' : 'e.g. Al-Saadia School'}
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
                  {isAr ? 'إلغاء' : 'Cancel'}
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
                  {createSubLoading 
                    ? (isAr ? 'جاري الإنشاء...' : 'Creating...') 
                    : (isAr ? 'حفظ وإنشاء الحساب' : 'Save & Create Account')}
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
            maxHeight: '90vh',
            overflowY: 'auto',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
            direction: isAr ? 'rtl' : 'ltr'
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
                  {isAr ? `التحكم في صلاحيات: ${permissionsModal.user.fullName}` : `Manage Permissions: ${permissionsModal.user.fullName}`}
                </h3>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  {isAr ? 'يمكنك فتح وإغلاق الصلاحيات بضغطة زر واحدة' : 'Enable or disable permissions instantly'}
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
                    {isAr ? 'حالة الحساب العامة (تفعيل / تجميد)' : 'Account Status (Active / Suspended)'}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {isAr ? 'عند التجميد يُمنع المستخدم من الدخول للمنصة نهائياً' : 'Suspended users cannot access the platform'}
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
                  {permissionsModal.user.isActive 
                    ? (isAr ? 'مفعّل ✓' : 'Active ✓') 
                    : (isAr ? 'مجمّد ✕' : 'Suspended ✕')}
                </button>
              </div>

              {/* View Exams Permission */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-light)', paddingBottom: '0.85rem' }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: '0.9rem' }}>
                    {isAr ? 'صلاحية رؤية وفحص الاختبارات' : 'Inspect & View Exams'}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {isAr ? 'السماح للمستخدم بالاطلاع على جميع الاختبارات في نطاقه' : 'Allow inspecting all exams within scope'}
                  </div>
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
                  <div style={{ fontWeight: 800, fontSize: '0.9rem' }}>
                    {isAr ? 'صلاحية إنشاء وإدارة الكوادر الأدنى' : 'Create & Manage Subordinates'}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {isAr ? 'السماح له بإنشاء حسابات لمن هم تحته في الهيكل' : 'Allow creating accounts for staff under their rank'}
                  </div>
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
                  <div style={{ fontWeight: 800, fontSize: '0.9rem' }}>
                    {isAr ? 'صلاحية تعديل صلاحيات المرؤوسين' : 'Edit Subordinate Permissions'}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {isAr ? 'السماح له بفتح وإغلاق صلاحيات الكوادر التابعة له' : 'Allow opening/closing permissions of their direct subordinates'}
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={permissionsModal.user.permissions?.can_edit_permissions ?? true}
                  onChange={() => handleToggleSubordinatePermission('can_edit_permissions')}
                  style={{ width: '20px', height: '20px', cursor: 'pointer', accentColor: '#4F46E5' }}
                />
              </div>
            </div>

            <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border-light)', background: '#F8FAFC', textAlign: isAr ? 'left' : 'right' }}>
              <button
                className="btn btn-primary"
                onClick={() => setPermissionsModal(prev => ({ ...prev, isOpen: false }))}
              >
                {isAr ? 'تم والانتهاء' : 'Done'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
