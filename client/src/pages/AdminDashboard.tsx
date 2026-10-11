import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { usePlatformSettings } from '../context/PlatformSettingsContext';
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
  Sliders,
  Upload,
  Trash2,
  Image,
  RefreshCw,
  Layers,
  Key,
  Smartphone,
  Edit3
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
  gradeId?: string | null;
  gradeNameAr?: string | null;
  subjectId?: string | null;
  subjectNameAr?: string | null;
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
  const {
    activeTerm,
    allowStudentRegistration,
    allowSubordinateVisibility,
    activeGrades,
    platformLogo,
    updateSettings
  } = usePlatformSettings();

  const [activeTab, setActiveTab] = useState<'hierarchy' | 'curriculum' | 'settings' | 'teachers' | 'students'>('curriculum');

  // Curriculum books state
  const [adminBooks, setAdminBooks] = useState<any[]>([]);
  const [adminBooksLoading, setAdminBooksLoading] = useState<boolean>(false);
  const [bookTermFilter, setBookTermFilter] = useState<'ALL' | '1' | '2'>('ALL');
  const [bookSearchQuery, setBookSearchQuery] = useState<string>('');

  // Book upload form state
  const [newBookTitle, setNewBookTitle] = useState('');
  const [newBookStageId, setNewBookStageId] = useState('');
  const [newBookGradeId, setNewBookGradeId] = useState('');
  const [newBookSubjectId, setNewBookSubjectId] = useState('');
  const [newBookTerm, setNewBookTerm] = useState<1 | 2>(1);
  const [newBookSchoolType, setNewBookSchoolType] = useState<'كلاهما' | 'عربي' | 'لغات'>('كلاهما');
  const newBookChapterTitle = 'الوحدة الأولى';
  const [newBookFile, setNewBookFile] = useState<File | null>(null);
  const [isUploadingBook, setIsUploadingBook] = useState(false);
  const [bookUploadProgress, setBookUploadProgress] = useState(0);
  const [bookUploadMessage, setBookUploadMessage] = useState<string | null>(null);

  const [allStages, setAllStages] = useState<any[]>([]);
  const [gradeSubjects, setGradeSubjects] = useState<any[]>([]);

  // Book editing state (Super Admin)
  const [editingBook, setEditingBook] = useState<any | null>(null);
  const [editBookModalOpen, setEditBookModalOpen] = useState(false);
  const [editBookTitleAr, setEditBookTitleAr] = useState('');
  const [editBookTitleEn, setEditBookTitleEn] = useState('');
  const [editBookStageId, setEditBookStageId] = useState('');
  const [editBookGradeId, setEditBookGradeId] = useState('');
  const [editBookSubjectId, setEditBookSubjectId] = useState('');
  const [editBookTerm, setEditBookTerm] = useState<1 | 2>(1);
  const [editBookSchoolType, setEditBookSchoolType] = useState<'كلاهما' | 'عربي' | 'لغات'>('كلاهما');
  const [editBookSubjects, setEditBookSubjects] = useState<any[]>([]);
  const [editBookChapters, setEditBookChapters] = useState<any[]>([]);
  const [isLoadingChapters, setIsLoadingChapters] = useState(false);
  const [isSavingBook, setIsSavingBook] = useState(false);
  const [newChapterTitle, setNewChapterTitle] = useState('');
  const [newChapterStartPage, setNewChapterStartPage] = useState('1');
  const [newChapterEndPage, setNewChapterEndPage] = useState('20');

  // Logo upload preview
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [isSavingLogo, setIsSavingLogo] = useState(false);

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

  const [grades, setGrades] = useState<any[]>([]);
  const [addTeacherModalOpen, setAddTeacherModalOpen] = useState(false);
  const [newTeacherData, setNewTeacherData] = useState({
    fullName: '',
    email: '',
    password: '',
    specialization: 'معلم أول علوم',
    schoolName: 'مدرسة المتفوقين الرسمية',
    gradeId: '',
    subjectId: '',
    can_upload_books: true,
    can_create_exams: true,
    can_delete_content: true,
    can_view_analytics: true
  });
  const [creatingTeacher, setCreatingTeacher] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [teacherSubjects, setTeacherSubjects] = useState<any[]>([]);

  useEffect(() => {
    if (newTeacherData.gradeId) {
      fetch(apiUrl(`/api/meta/grades/${newTeacherData.gradeId}/subjects`))
        .then(r => r.json())
        .then(data => {
          if (Array.isArray(data)) {
            setTeacherSubjects(data);
            if (data.length > 0 && !newTeacherData.subjectId) {
              setNewTeacherData(prev => ({
                ...prev,
                subjectId: data[0].id,
                specialization: prev.specialization && prev.specialization !== 'معلم أول علوم' ? prev.specialization : `معلم ${data[0].name_ar}`
              }));
            }
          }
        })
        .catch(console.error);
    } else {
      setTeacherSubjects([]);
    }
  }, [newTeacherData.gradeId]);

  // Student diagnostic view
  const [selectedStudentForDetails, setSelectedStudentForDetails] = useState<any | null>(null);
  const [studentDetailsLoading, setStudentDetailsLoading] = useState(false);

  // Monthly Exam Limit State
  const [monthlyLimit, setMonthlyLimit] = useState<number>(10);
  const [limitModalOpen, setLimitModalOpen] = useState<boolean>(false);
  const [newLimitInput, setNewLimitInput] = useState<string>('10');
  const [limitLoading, setLimitLoading] = useState<boolean>(false);

  // Superadmin Profile & Credentials Modal State
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [profileFullName, setProfileFullName] = useState(user?.fullName || '');
  const [profileEmail, setProfileEmail] = useState(user?.email || '');
  const [profileCurrentPassword, setProfileCurrentPassword] = useState('');
  const [profileNewPassword, setProfileNewPassword] = useState('');
  const [profileConfirmPassword, setProfileConfirmPassword] = useState('');
  const [profileUpdating, setProfileUpdating] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Reset User Password Modal State (for any teacher/student)
  const [userForPasswordReset, setUserForPasswordReset] = useState<{ id: string; name: string; role: string } | null>(null);
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');
  const [resettingPassword, setResettingPassword] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  // Student Devices Management Modal State
  const [studentForDeviceManage, setStudentForDeviceManage] = useState<any | null>(null);
  const [studentDevices, setStudentDevices] = useState<any[]>([]);
  const [studentMaxDevices, setStudentMaxDevices] = useState<number>(2);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [deviceActionLoading, setDeviceActionLoading] = useState(false);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError(null);
    if (profileNewPassword && profileNewPassword !== profileConfirmPassword) {
      setProfileError(language === 'ar' ? 'كلمة المرور الجديدة وتأكيدها غير متطابقين' : 'New passwords do not match');
      return;
    }
    setProfileUpdating(true);
    try {
      const res = await fetch(apiUrl('/api/admin/profile/credentials'), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          fullName: profileFullName,
          email: profileEmail,
          currentPassword: profileCurrentPassword,
          newPassword: profileNewPassword || undefined,
          confirmPassword: profileConfirmPassword || undefined
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update credentials');
      showAlert(language === 'ar' ? 'تم تحديث بيانات الحساب وكلمة المرور بنجاح!' : 'Credentials updated successfully!', 'success');
      setIsProfileModalOpen(false);
      setProfileCurrentPassword('');
      setProfileNewPassword('');
      setProfileConfirmPassword('');
    } catch (err: any) {
      setProfileError(err.message);
    } finally {
      setProfileUpdating(false);
    }
  };

  const handleResetUserPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userForPasswordReset) return;
    setResetError(null);
    if (resetNewPassword !== resetConfirmPassword) {
      setResetError(language === 'ar' ? 'كلمات المرور غير متطابقة' : 'Passwords do not match');
      return;
    }
    if (resetNewPassword.length < 4) {
      setResetError(language === 'ar' ? 'كلمة المرور يجب أن تكون 4 أحرف على الأقل' : 'Password must be at least 4 chars');
      return;
    }
    setResettingPassword(true);
    try {
      const res = await fetch(apiUrl(`/api/admin/users/${userForPasswordReset.id}/password`), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          newPassword: resetNewPassword,
          confirmPassword: resetConfirmPassword
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to reset password');
      showAlert(language === 'ar' ? `تم إعادة تعيين كلمة المرور بنجاح للمستخدم (${userForPasswordReset.name})` : 'Password reset successfully', 'success');
      setUserForPasswordReset(null);
      setResetNewPassword('');
      setResetConfirmPassword('');
    } catch (err: any) {
      setResetError(err.message);
    } finally {
      setResettingPassword(false);
    }
  };

  const handleOpenDeviceManage = async (student: any) => {
    setStudentForDeviceManage(student);
    setLoadingDevices(true);
    setStudentDevices([]);
    try {
      const res = await fetch(apiUrl(`/api/admin/students/${student.id}/devices`), {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setStudentDevices(Array.isArray(data.devices) ? data.devices : []);
        setStudentMaxDevices(data.max_devices || 2);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingDevices(false);
    }
  };

  const handleResetAllDevices = async () => {
    if (!studentForDeviceManage) return;
    if (!confirm(language === 'ar' ? 'هل أنت متأكد من مسح وإلغاء ربط كافة أجهزة هذا الطالب؟' : 'Reset all registered devices for this student?')) return;
    setDeviceActionLoading(true);
    try {
      const res = await fetch(apiUrl(`/api/admin/students/${studentForDeviceManage.id}/devices`), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        showAlert(language === 'ar' ? 'تم مسح وإلغاء ربط الأجهزة بنجاح، يستطيع الطالب الآن تسجيل الدخول من أجهزته الجديدة.' : 'Devices reset successfully', 'success');
        handleOpenDeviceManage(studentForDeviceManage);
      }
    } catch (err: any) {
      showAlert(err.message, 'error');
    } finally {
      setDeviceActionLoading(false);
    }
  };

  const handleUpdateMaxDevices = async (newLimit: number) => {
    if (!studentForDeviceManage) return;
    setDeviceActionLoading(true);
    try {
      const res = await fetch(apiUrl(`/api/admin/students/${studentForDeviceManage.id}/max-devices`), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ max_devices: newLimit })
      });
      if (res.ok) {
        setStudentMaxDevices(newLimit);
        showAlert(language === 'ar' ? `تم تحديث الحد الأقصى للأجهزة إلى ${newLimit}` : `Device limit updated to ${newLimit}`, 'success');
      }
    } catch (err: any) {
      showAlert(err.message, 'error');
    } finally {
      setDeviceActionLoading(false);
    }
  };

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

  const fetchGrades = async () => {
    try {
      const res = await fetch(apiUrl('/api/meta/grades'));
      if (res.ok) {
        const data = await res.json();
        setGrades(data || []);
      }
    } catch (err) {
      console.error('Error fetching grades in AdminDashboard:', err);
    }
  };

  const fetchAdminBooks = async () => {
    setAdminBooksLoading(true);
    try {
      const res = await fetch(apiUrl('/api/admin/books'), {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setAdminBooks(data.books || []);
      } else {
        const errData = await res.json().catch(() => ({}));
        console.error('Error fetching admin books:', errData);
      }
    } catch (err) {
      console.error('Error fetching admin books:', err);
    } finally {
      setAdminBooksLoading(false);
    }
  };

  const fetchStages = async () => {
    try {
      const res = await fetch(apiUrl('/api/meta/stages'));
      if (res.ok) {
        const data = await res.json();
        setAllStages(data || []);
        if (data.length > 0 && !newBookStageId) {
          setNewBookStageId(data[0].id);
          if (data[0].grades && data[0].grades.length > 0) {
            setNewBookGradeId(data[0].grades[0].id);
          }
        }
      }
    } catch (err) {
      console.error('Error fetching stages:', err);
    }
  };

  useEffect(() => {
    if (newBookGradeId) {
      fetch(apiUrl(`/api/meta/grades/${newBookGradeId}/subjects`))
        .then(r => r.json())
        .then(data => {
          if (Array.isArray(data)) {
            setGradeSubjects(data);
            if (data.length > 0) {
              setNewBookSubjectId(data[0].id);
            }
          }
        })
        .catch(console.error);
    }
  }, [newBookGradeId]);

  const handleAdminUploadBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBookTitle.trim() || !newBookStageId || !newBookGradeId || !newBookSubjectId || !newBookFile) {
      showAlert('الرجاء إدخال اسم الكتاب واختيار المرحلة والصف والمادة وتحديد ملف PDF', 'error');
      return;
    }

    setIsUploadingBook(true);
    setBookUploadProgress(5);
    setBookUploadMessage('جاري تهيئة رفع الكتاب...');

    try {
      const CHUNK_SIZE = 3 * 1024 * 1024;
      const totalChunks = Math.ceil(newBookFile.size / CHUNK_SIZE);
      const uploadId = 'adm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      let completed = 0;

      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(newBookFile.size, (i + 1) * CHUNK_SIZE);
        const chunkBlob = newBookFile.slice(start, end);

        const fd = new FormData();
        fd.append('uploadId', uploadId);
        fd.append('chunkIndex', String(i));
        fd.append('totalChunks', String(totalChunks));
        fd.append('chunk', chunkBlob, `${newBookFile.name}.part_${i}`);

        const res = await fetch(apiUrl('/api/books/upload-chunk'), {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: fd
        });
        if (!res.ok) throw new Error('فشل رفع أحد أجزاء الكتاب');

        completed++;
        const pct = Math.min(85, Math.round((completed / totalChunks) * 80) + 5);
        setBookUploadProgress(pct);
        setBookUploadMessage(`جاري رفع الأجزاء: (${completed} من ${totalChunks})...`);
      }

      setBookUploadProgress(90);
      setBookUploadMessage('جاري استخراج النصوص والفهرسة الدلالية بالذكاء الاصطناعي...');

      const finalRes = await fetch(apiUrl('/api/books/finalize-chunked'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          uploadId,
          title_ar: newBookTitle.trim(),
          title_en: newBookTitle.trim(),
          academic_stage_id: newBookStageId,
          grade_id: newBookGradeId,
          subject_id: newBookSubjectId,
          term: newBookTerm,
          school_type: newBookSchoolType,
          chapter_number: 1,
          chapter_title_ar: newBookChapterTitle || 'الوحدة الأولى',
          fileName: newBookFile.name,
          fileSize: newBookFile.size,
          totalChunks
        })
      });

      const finalData = await finalRes.json();
      if (!finalRes.ok) throw new Error(finalData.error || 'فشلت معالجة الكتاب');

      setBookUploadProgress(100);
      setBookUploadMessage('تم رفع ومعالجة وفهرسة الكتاب بنجاح!');
      showAlert(`تم رفع الكتاب (${newBookTitle}) للفصل الدراسي ${newBookTerm === 1 ? 'الأول' : 'الثاني'} بنجاح!`, 'success');
      setNewBookTitle('');
      setNewBookFile(null);
      fetchAdminBooks();
      fetchOverview();
    } catch (err: any) {
      showAlert(err.message || 'خطأ أثناء رفع الكتاب', 'error');
    } finally {
      setIsUploadingBook(false);
      setTimeout(() => setBookUploadProgress(0), 2000);
    }
  };

  const handleDeleteBook = async (bookId: string, bookTitle: string) => {
    if (!confirm(`هل أنت متأكد من حذف كتاب (${bookTitle}) بالكامل وحذف كافة مقاطعه ووحداته المفهرسة؟`)) return;
    try {
      const res = await fetch(apiUrl(`/api/admin/books/${bookId}`), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        showAlert(data.message || 'تم حذف الكتاب بنجاح', 'success');
        fetchAdminBooks();
        fetchOverview();
      } else {
        showAlert(data.error || 'فشل حذف الكتاب', 'error');
      }
    } catch (err: any) {
      showAlert('خطأ أثناء حذف الكتاب', 'error');
    }
  };

  const handleOpenEditBook = async (book: any) => {
    setEditingBook(book);
    setEditBookTitleAr(book.title_ar || '');
    setEditBookTitleEn(book.title_en || book.title_ar || '');
    setEditBookStageId(book.academic_stage_id || '');
    setEditBookGradeId(book.grade_id || '');
    setEditBookSubjectId(book.subject_id || '');
    setEditBookTerm(book.term === 2 ? 2 : 1);
    setEditBookSchoolType(book.school_type || 'كلاهما');
    setEditBookModalOpen(true);

    if (book.grade_id) {
      try {
        const subRes = await fetch(apiUrl(`/api/meta/grades/${book.grade_id}/subjects`));
        const subData = await subRes.json();
        if (Array.isArray(subData)) setEditBookSubjects(subData);
      } catch (e) {
        console.error('Error fetching subjects:', e);
      }
    }

    setIsLoadingChapters(true);
    try {
      const chRes = await fetch(apiUrl(`/api/books/${book.id}/chapters`), {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (chRes.ok) {
        const chData = await chRes.json();
        setEditBookChapters(Array.isArray(chData) ? chData : []);
      }
    } catch (e) {
      console.error('Error fetching chapters:', e);
    } finally {
      setIsLoadingChapters(false);
    }
  };

  const handleSaveBookDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBook) return;
    setIsSavingBook(true);
    try {
      const res = await fetch(apiUrl(`/api/admin/books/${editingBook.id}`), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          title_ar: editBookTitleAr.trim(),
          title_en: editBookTitleEn.trim(),
          academic_stage_id: editBookStageId,
          grade_id: editBookGradeId,
          subject_id: editBookSubjectId,
          term: editBookTerm,
          school_type: editBookSchoolType
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل تحديث الكتاب');
      showAlert(language === 'ar' ? 'تم تحديث بيانات الكتاب بنجاح ومزامنة التحديثات!' : 'Book updated successfully!', 'success');
      fetchAdminBooks();
      setEditBookModalOpen(false);
    } catch (err: any) {
      showAlert(err.message || 'خطأ أثناء تحديث الكتاب', 'error');
    } finally {
      setIsSavingBook(false);
    }
  };

  const handleAddChapterToBook = async () => {
    if (!editingBook || !newChapterTitle.trim()) return;
    try {
      const nextNum = (editBookChapters.length || 0) + 1;
      const res = await fetch(apiUrl(`/api/books/${editingBook.id}/chapters`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          chapter_number: nextNum,
          title_ar: newChapterTitle.trim(),
          title_en: `Unit ${nextNum}`,
          start_page: parseInt(newChapterStartPage, 10) || 1,
          end_page: parseInt(newChapterEndPage, 10) || 20
        })
      });
      if (res.ok) {
        setNewChapterTitle('');
        const chRes = await fetch(apiUrl(`/api/books/${editingBook.id}/chapters`), {
          headers: { Authorization: `Bearer ${token}` }
        });
        const chData = await chRes.json();
        setEditBookChapters(Array.isArray(chData) ? chData : []);
        showAlert(language === 'ar' ? 'تمت إضافة الوحدة بنجاح' : 'Chapter added successfully', 'success');
      }
    } catch (e) {
      showAlert('Error adding chapter', 'error');
    }
  };

  const handleDeleteChapterFromBook = async (chapterId: string) => {
    if (!editingBook) return;
    if (!confirm(language === 'ar' ? 'هل أنت متأكد من حذف هذه الوحدة؟' : 'Delete chapter?')) return;
    try {
      const res = await fetch(apiUrl(`/api/books/${editingBook.id}/chapters/${chapterId}`), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setEditBookChapters(prev => prev.filter(c => c.id !== chapterId));
        showAlert(language === 'ar' ? 'تم حذف الوحدة' : 'Chapter deleted', 'success');
      }
    } catch (e) {
      showAlert('Error deleting chapter', 'error');
    }
  };

  const handleAutoDetectChaptersForBook = async () => {
    if (!editingBook) return;
    setIsLoadingChapters(true);
    try {
      const res = await fetch(apiUrl(`/api/books/${editingBook.id}/auto-detect-chapters`), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        showAlert(data.message || 'Auto-detection complete', 'success');
        const chRes = await fetch(apiUrl(`/api/books/${editingBook.id}/chapters`), {
          headers: { Authorization: `Bearer ${token}` }
        });
        const chData = await chRes.json();
        setEditBookChapters(Array.isArray(chData) ? chData : []);
      } else {
        showAlert(data.error || 'Failed', 'error');
      }
    } catch (e) {
      showAlert('Error auto-detecting chapters', 'error');
    } finally {
      setIsLoadingChapters(false);
    }
  };

  // Settings handlers
  const handleToggleTerm = async (newTerm: 1 | 2) => {
    const ok = await updateSettings({ active_term: newTerm }, token || undefined);
    if (ok) {
      showAlert(`تم تحويل المنظومة بالكامل بنجاح إلى: الفصل الدراسي ${newTerm === 1 ? 'الأول' : 'الثاني'}!`, 'success');
    } else {
      showAlert('فشل تغيير الفصل الدراسي', 'error');
    }
  };

  const handleToggleStudentRegistration = async (newVal: boolean) => {
    const ok = await updateSettings({ allow_student_registration: newVal }, token || undefined);
    if (ok) {
      showAlert(newVal ? 'تم فتح وتفعيل التسجيل الذاتي للطلاب على المنصة.' : 'تم قفل وتعطيل التسجيل الذاتي للطلاب.', 'success');
    } else {
      showAlert('فشل تحديث حالة التسجيل الذاتي', 'error');
    }
  };

  const handleToggleSubordinateVisibility = async (newVal: boolean) => {
    const ok = await updateSettings({ allow_subordinate_visibility: newVal }, token || undefined);
    if (ok) {
      showAlert(
        newVal
          ? (language === 'ar' ? 'تم السماح للمستخدمين (الموجهين والإداريين) بالاطلاع على التابعين لهم.' : 'Subordinate visibility enabled for supervisors.')
          : (language === 'ar' ? 'تم تقييد الرؤية: المسؤول العام فقط هو من يستطيع الاطلاع على جميع المستخدمين.' : 'Subordinate visibility restricted to superadmin only.'),
        'success'
      );
    } else {
      showAlert(language === 'ar' ? 'فشل تحديث إعداد رؤية التابعين' : 'Failed to update subordinate visibility', 'error');
    }
  };

  const handleToggleGradeActive = async (gradeId: string) => {
    let newGrades: string[] = [];
    if (activeGrades === 'ALL' || !Array.isArray(activeGrades)) {
      newGrades = grades.map(g => g.id).filter(id => id !== gradeId);
    } else {
      if (activeGrades.includes(gradeId)) {
        newGrades = activeGrades.filter(id => id !== gradeId);
      } else {
        newGrades = [...activeGrades, gradeId];
      }
    }
    const ok = await updateSettings({ active_grades: newGrades }, token || undefined);
    if (ok) {
      showAlert('تم تحديث الصفوف الدراسية الفعّالة بنجاح', 'success');
    }
  };

  const handleSelectAllGrades = async () => {
    const ok = await updateSettings({ active_grades: 'ALL' }, token || undefined);
    if (ok) showAlert('تم تفعيل كافة الصفوف الـ 12 بنجاح على المنظومة', 'success');
  };

  const handleDeselectAllGrades = async () => {
    const ok = await updateSettings({ active_grades: [] }, token || undefined);
    if (ok) showAlert('تم تعطيل كافة الصفوف مؤقتاً', 'success');
  };

  const handleLogoFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      showAlert('حجم الشعار يجب ألا يتجاوز 2 ميجابايت', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setLogoPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSaveLogo = async () => {
    if (!logoPreview) return;
    setIsSavingLogo(true);
    try {
      const ok = await updateSettings({ platform_logo: logoPreview }, token || undefined);
      if (ok) {
        showAlert('تم حفظ وتحديث شعار المنصة بنجاح عبر النظام بالكامل!', 'success');
        setLogoPreview(null);
      } else {
        showAlert('فشل حفظ الشعار الجديد', 'error');
      }
    } catch {
      showAlert('خطأ أثناء حفظ الشعار', 'error');
    } finally {
      setIsSavingLogo(false);
    }
  };

  const handleResetLogo = async () => {
    const ok = await updateSettings({ platform_logo: '/logo.png' }, token || undefined);
    if (ok) {
      setLogoPreview(null);
      showAlert('تم استعادة الشعار الافتراضي للمنصة بنجاح', 'success');
    }
  };

  useEffect(() => {
    fetchOverview();
    fetchTeachers();
    fetchStudents();
    fetchGrades();
    fetchAdminBooks();
    fetchStages();
  }, [token]);

  useEffect(() => {
    if (activeTab === 'curriculum') {
      fetchAdminBooks();
    }
  }, [activeTab]);

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
          gradeId: newTeacherData.gradeId,
          subjectId: newTeacherData.subjectId,
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
        gradeId: '',
        subjectId: '',
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

            <button
              onClick={() => {
                setProfileFullName(user?.fullName || '');
                setProfileEmail(user?.email || '');
                setProfileCurrentPassword('');
                setProfileNewPassword('');
                setProfileConfirmPassword('');
                setProfileError(null);
                setIsProfileModalOpen(true);
              }}
              style={{
                background: '#4F46E5',
                color: '#FFFFFF',
                fontSize: '0.78rem',
                fontWeight: 800,
                padding: '0.35rem 0.85rem',
                borderRadius: 'var(--radius-full)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                border: 'none',
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(79, 70, 229, 0.25)',
                marginInlineStart: 'auto'
              }}
            >
              <Key size={13} />
              <span>{language === 'ar' ? '🔐 تعديل بيانات الحساب وكلمة المرور' : 'Account & Password'}</span>
            </button>
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
                    {language === 'ar' ? 'الحد الشهري للاختبارات' : 'Monthly Exam Limit'}
                  </span>
                  <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#D1FAE5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Sliders size={17} color="#059669" />
                  </div>
                </div>
                <div style={{ fontSize: '2rem', fontWeight: 900, marginTop: '0.4rem', color: '#059669', lineHeight: 1 }}>
                  {monthlyLimit}
                </div>
                <div style={{ fontSize: '0.72rem', color: '#047857', marginTop: '0.35rem', fontWeight: 600 }}>
                  {language === 'ar' ? 'لكل طالب (شامل كافة المواد)' : 'per student (all subjects)'}
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
        flexWrap: 'wrap',
        maxWidth: '100%'
      }}>
        <button
          className={`tab-btn ${activeTab === 'curriculum' ? 'active' : ''}`}
          onClick={() => setActiveTab('curriculum')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '0.92rem',
            padding: '0.75rem 1rem',
            fontWeight: 700,
            whiteSpace: 'normal',
            maxWidth: '100%',
            textAlign: 'start',
            lineHeight: 1.4,
            boxSizing: 'border-box'
          }}
        >
          <BookOpen size={17} style={{ flexShrink: 0 }} />
          <span>{language === 'ar' ? `📚 إدارة ورفع المناهج والكتب (${adminBooks.length})` : `Curriculum Books (${adminBooks.length})`}</span>
        </button>

        <button
          className={`tab-btn ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '0.92rem',
            padding: '0.75rem 1rem',
            fontWeight: 700,
            whiteSpace: 'normal',
            maxWidth: '100%',
            textAlign: 'start',
            lineHeight: 1.4,
            boxSizing: 'border-box'
          }}
        >
          <Sliders size={17} style={{ flexShrink: 0 }} />
          <span>{language === 'ar' ? '⚙️ إعدادات المنظومة والتحكم العام' : 'Platform Settings'}</span>
        </button>

        <button
          className={`tab-btn ${activeTab === 'hierarchy' ? 'active' : ''}`}
          onClick={() => setActiveTab('hierarchy')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '0.92rem',
            padding: '0.75rem 1rem',
            fontWeight: 700,
            whiteSpace: 'normal',
            maxWidth: '100%',
            textAlign: 'start',
            lineHeight: 1.4,
            boxSizing: 'border-box'
          }}
        >
          <ShieldCheck size={17} style={{ flexShrink: 0 }} />
          <span>{language === 'ar' ? 'الهيكل الرقابي والجمهوري (المدير المركزي ومدراء المحافظات)' : 'Supervisory Hierarchy'}</span>
        </button>

        <button
          className={`tab-btn ${activeTab === 'teachers' ? 'active' : ''}`}
          onClick={() => setActiveTab('teachers')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '0.92rem',
            padding: '0.75rem 1rem',
            fontWeight: 700,
            whiteSpace: 'normal',
            maxWidth: '100%',
            textAlign: 'start',
            lineHeight: 1.4,
            boxSizing: 'border-box'
          }}
        >
          <Users size={17} style={{ flexShrink: 0 }} />
          <span>{language === 'ar' ? `إدارة المعلمين (${teachers.length})` : `Teachers (${teachers.length})`}</span>
        </button>

        <button
          className={`tab-btn ${activeTab === 'students' ? 'active' : ''}`}
          onClick={() => setActiveTab('students')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '0.92rem',
            padding: '0.75rem 1rem',
            fontWeight: 700,
            whiteSpace: 'normal',
            maxWidth: '100%',
            textAlign: 'start',
            lineHeight: 1.4,
            boxSizing: 'border-box'
          }}
        >
          <GraduationCap size={17} style={{ flexShrink: 0 }} />
          <span>{language === 'ar' ? `إدارة ومتابعة الطلاب (${students.length})` : `Students (${students.length})`}</span>
        </button>
      </div>

      {/* TAB: CURRICULUM & BOOKS MANAGEMENT (MAIN ADMIN EXCLUSIVE) */}
      {activeTab === 'curriculum' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
          {/* Header Strip */}
          <div style={{
            background: 'linear-gradient(135deg, #1E1B4B 0%, #312E81 100%)',
            color: '#FFFFFF',
            padding: '1.5rem',
            borderRadius: '1rem',
            boxShadow: '0 4px 16px rgba(49, 46, 129, 0.2)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontSize: '1.8rem' }}>🏛️</span>
              <h2 style={{ fontSize: '1.35rem', fontWeight: 900, margin: 0, color: '#FFFFFF' }}>
                {language === 'ar' ? 'المكتبة المنهجية المركزية المعتمدة - الإدارة العامة فقط' : 'Central Ministry Curriculum - Admin Only'}
              </h2>
            </div>
          </div>

          {/* Book Upload Form Card */}
          <div className="card" style={{ padding: '1.75rem', borderRadius: '1rem' }}>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 900, marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Upload size={18} color="var(--primary-600)" />
              <span>{language === 'ar' ? 'رفع كتاب' : 'Upload Book'}</span>
            </h3>

            {isUploadingBook && (
              <div style={{ background: '#EFF6FF', border: '1.5px solid #93C5FD', padding: '1.25rem', borderRadius: '0.75rem', marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: '0.9rem', marginBottom: '0.5rem', color: '#1E3A8A' }}>
                  <span>{bookUploadMessage || (language === 'ar' ? 'جاري رفع الكتاب...' : 'Uploading...')}</span>
                  <span>{bookUploadProgress}%</span>
                </div>
                <div style={{ width: '100%', height: '10px', background: '#DBEAFE', borderRadius: '999px', overflow: 'hidden' }}>
                  <div style={{ width: `${bookUploadProgress}%`, height: '100%', background: 'linear-gradient(90deg, #2563EB, #3B82F6)', transition: 'width 0.3s ease' }} />
                </div>
              </div>
            )}

            <form onSubmit={handleAdminUploadBook}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                {/* 1. Book Title */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 800, marginBottom: '0.35rem' }}>
                    {language === 'ar' ? 'اسم الكتاب المعتمد: *' : 'Textbook Title: *'}
                  </label>
                  <input
                    type="text"
                    required
                    placeholder={language === 'ar' ? 'مثال: كتاب العلوم المتكاملة' : 'e.g. Integrated Science'}
                    value={newBookTitle}
                    onChange={(e) => setNewBookTitle(e.target.value)}
                    style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '0.5rem', border: '1.5px solid var(--border-light)', fontSize: '0.9rem' }}
                  />
                </div>

                {/* 2. Stage */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 800, marginBottom: '0.35rem' }}>
                    {language === 'ar' ? 'المرحلة الدراسية: *' : 'Academic Stage: *'}
                  </label>
                  <select
                    required
                    value={newBookStageId}
                    onChange={(e) => {
                      const sId = e.target.value;
                      setNewBookStageId(sId);
                      const matchingGrades = grades.filter(g => g.stage_id === sId);
                      if (matchingGrades.length > 0) {
                        setNewBookGradeId(matchingGrades[0].id);
                      } else {
                        setNewBookGradeId('');
                      }
                    }}
                    style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '0.5rem', border: '1.5px solid var(--border-light)', fontSize: '0.9rem', fontWeight: 700 }}
                  >
                    <option value="">{language === 'ar' ? 'اختر المرحلة...' : 'Select Stage...'}</option>
                    {allStages.map(s => (
                      <option key={s.id} value={s.id}>
                        {language === 'ar' ? s.name_ar : (s.name_en || s.name_ar)}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 3. Grade */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 800, marginBottom: '0.35rem' }}>
                    {language === 'ar' ? 'الصف الدراسي: *' : 'Grade: *'}
                  </label>
                  <select
                    required
                    value={newBookGradeId}
                    onChange={(e) => setNewBookGradeId(e.target.value)}
                    style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '0.5rem', border: '1.5px solid var(--border-light)', fontSize: '0.9rem', fontWeight: 700 }}
                  >
                    <option value="">{language === 'ar' ? 'اختر الصف...' : 'Select Grade...'}</option>
                    {Array.from(new Map(grades.filter(g => !newBookStageId || g.stage_id === newBookStageId).map(g => [g.name_ar, g])).values()).map(g => (
                      <option key={g.id} value={g.id}>
                        {language === 'ar' ? g.name_ar : (g.name_en || g.name_ar)}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 4. Subject */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 800, marginBottom: '0.35rem' }}>
                    {language === 'ar' ? 'المادة الدراسية: *' : 'Subject: *'}
                  </label>
                  <select
                    required
                    value={newBookSubjectId}
                    onChange={(e) => setNewBookSubjectId(e.target.value)}
                    style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '0.5rem', border: '1.5px solid var(--border-light)', fontSize: '0.9rem', fontWeight: 700 }}
                  >
                    <option value="">{language === 'ar' ? 'اختر المادة...' : 'Select Subject...'}</option>
                    {gradeSubjects.map(s => (
                      <option key={s.id} value={s.id}>
                        {language === 'ar' ? s.name_ar : (s.name_en || s.name_ar)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Term & School Type & File Selection */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
                {/* 5. Term Selector */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 800, marginBottom: '0.35rem', color: '#1E1B4B' }}>
                    {language === 'ar' ? 'الفصل الدراسي للكتاب: *' : 'Academic Term: *'}
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                    <button
                      type="button"
                      onClick={() => setNewBookTerm(1)}
                      style={{
                        padding: '0.65rem',
                        borderRadius: '0.5rem',
                        border: newBookTerm === 1 ? '2px solid #4F46E5' : '1.5px solid var(--border-light)',
                        background: newBookTerm === 1 ? '#EEF2FF' : '#FFFFFF',
                        color: newBookTerm === 1 ? '#312E81' : '#475569',
                        fontWeight: 800,
                        fontSize: '0.85rem',
                        cursor: 'pointer'
                      }}
                    >
                      🌟 {language === 'ar' ? 'الفصل الأول (ترم 1)' : 'Term 1'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewBookTerm(2)}
                      style={{
                        padding: '0.65rem',
                        borderRadius: '0.5rem',
                        border: newBookTerm === 2 ? '2px solid #4F46E5' : '1.5px solid var(--border-light)',
                        background: newBookTerm === 2 ? '#EEF2FF' : '#FFFFFF',
                        color: newBookTerm === 2 ? '#312E81' : '#475569',
                        fontWeight: 800,
                        fontSize: '0.85rem',
                        cursor: 'pointer'
                      }}
                    >
                      🌟 {language === 'ar' ? 'الفصل الثاني (ترم 2)' : 'Term 2'}
                    </button>
                  </div>
                </div>

                {/* 6. School Type (عربي / لغات / كلاهما) */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 800, marginBottom: '0.35rem', color: '#1E1B4B' }}>
                    {language === 'ar' ? 'نوع المدرسة الموجه لها: *' : 'Target School Type: *'}
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.4rem' }}>
                    {(['كلاهما', 'عربي', 'لغات'] as const).map(st => (
                      <button
                        type="button"
                        key={st}
                        onClick={() => setNewBookSchoolType(st)}
                        style={{
                          padding: '0.65rem 0.35rem',
                          borderRadius: '0.5rem',
                          border: newBookSchoolType === st ? '2px solid #059669' : '1.5px solid var(--border-light)',
                          background: newBookSchoolType === st ? '#ECFDF5' : '#FFFFFF',
                          color: newBookSchoolType === st ? '#065F46' : '#475569',
                          fontWeight: 800,
                          fontSize: '0.8rem',
                          cursor: 'pointer'
                        }}
                      >
                        {st === 'كلاهما' ? (language === 'ar' ? '🤝 كلاهما' : 'Both') : st === 'عربي' ? (language === 'ar' ? '🏫 عربي' : 'Arabic') : (language === 'ar' ? '🌐 لغات' : 'Languages')}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 7. PDF File Picker */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 800, marginBottom: '0.35rem' }}>
                    {language === 'ar' ? 'ملف الكتاب (PDF): *' : 'PDF Textbook File: *'}
                  </label>
                  <input
                    type="file"
                    required
                    accept=".pdf,application/pdf"
                    onChange={(e) => setNewBookFile(e.target.files?.[0] || null)}
                    style={{ width: '100%', padding: '0.45rem', borderRadius: '0.5rem', border: '1.5px solid var(--border-light)', fontSize: '0.85rem' }}
                  />
                  {newBookFile && (
                    <div style={{ fontSize: '0.75rem', color: '#059669', fontWeight: 700, marginTop: '0.25rem' }}>
                      ✓ {newBookFile.name} ({(newBookFile.size / (1024 * 1024)).toFixed(1)} MB)
                    </div>
                  )}
                </div>
              </div>

              <button
                type="submit"
                disabled={isUploadingBook}
                className="btn btn-primary"
                style={{
                  padding: '0.75rem 2rem',
                  fontSize: '0.95rem',
                  fontWeight: 900,
                  boxShadow: '0 4px 14px rgba(79, 70, 229, 0.4)'
                }}
              >
                {isUploadingBook 
                  ? (language === 'ar' ? 'جاري رفع الكتاب...' : 'Uploading...') 
                  : (language === 'ar' ? '🚀 رفع كتاب' : '🚀 Upload Book')}
              </button>
            </form>
          </div>

          {/* Existing Books Explorer & Management */}
          <div className="card" style={{ padding: '1.75rem', borderRadius: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
              <div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 900, margin: 0 }}>
                  {language === 'ar' ? `المناهج والكتب المعتمدة حالياً (${adminBooks.length} كتب)` : `Curriculum Library (${adminBooks.length})`}
                </h3>
              </div>

              {/* Term Filter Pills */}
              <div style={{ display: 'inline-flex', background: '#F1F5F9', padding: '0.25rem', borderRadius: '0.75rem', gap: '0.35rem' }}>
                <button
                  type="button"
                  onClick={() => setBookTermFilter('ALL')}
                  style={{
                    padding: '0.35rem 0.85rem',
                    borderRadius: '0.5rem',
                    border: 'none',
                    background: bookTermFilter === 'ALL' ? '#FFFFFF' : 'transparent',
                    color: bookTermFilter === 'ALL' ? '#1E293B' : '#64748B',
                    fontWeight: 800,
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    boxShadow: bookTermFilter === 'ALL' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                  }}
                >
                  {language === 'ar' ? 'الكل' : 'All'}
                </button>
                <button
                  type="button"
                  onClick={() => setBookTermFilter('1')}
                  style={{
                    padding: '0.35rem 0.85rem',
                    borderRadius: '0.5rem',
                    border: 'none',
                    background: bookTermFilter === '1' ? '#EEF2FF' : 'transparent',
                    color: bookTermFilter === '1' ? '#4F46E5' : '#64748B',
                    fontWeight: 800,
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    boxShadow: bookTermFilter === '1' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                  }}
                >
                  🌟 {language === 'ar' ? 'الفصل الأول (ترم 1)' : 'Term 1'}
                </button>
                <button
                  type="button"
                  onClick={() => setBookTermFilter('2')}
                  style={{
                    padding: '0.35rem 0.85rem',
                    borderRadius: '0.5rem',
                    border: 'none',
                    background: bookTermFilter === '2' ? '#EEF2FF' : 'transparent',
                    color: bookTermFilter === '2' ? '#4F46E5' : '#64748B',
                    fontWeight: 800,
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    boxShadow: bookTermFilter === '2' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                  }}
                >
                  🌟 {language === 'ar' ? 'الفصل الثاني (ترم 2)' : 'Term 2'}
                </button>
              </div>

              {/* Search */}
              <div style={{ position: 'relative', width: '220px' }}>
                <Search size={15} style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', right: language === 'ar' ? '0.75rem' : 'auto', left: language === 'en' ? '0.75rem' : 'auto', color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  placeholder={language === 'ar' ? 'بحث بالاسم أو المادة...' : 'Search books...'}
                  value={bookSearchQuery}
                  onChange={(e) => setBookSearchQuery(e.target.value)}
                  style={{ width: '100%', paddingRight: language === 'ar' ? '2.2rem' : '0.75rem', paddingLeft: language === 'en' ? '2.2rem' : '0.75rem', paddingBlock: '0.45rem', borderRadius: '0.5rem', border: '1.5px solid var(--border-light)', fontSize: '0.85rem' }}
                />
              </div>
            </div>

            {adminBooksLoading ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                {language === 'ar' ? 'جاري تحميل الكتب المنهجية...' : 'Loading curriculum books...'}
              </div>
            ) : adminBooks.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem 1rem', background: '#F8FAFC', borderRadius: '0.75rem', border: '1.5px dashed #CBD5E1' }}>
                <p style={{ margin: 0, fontWeight: 700, color: '#64748B' }}>
                  {language === 'ar' ? 'لا توجد كتب مرفوعة حالياً. استخدم النموذج أعلاه لرفع أول كتاب وزاري.' : 'No textbooks uploaded yet. Use the form above to upload the first book.'}
                </p>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))', gap: '1.1rem' }}>
                {adminBooks
                  .filter(b => {
                    if (bookTermFilter !== 'ALL' && String(b.term || 1) !== bookTermFilter) return false;
                    if (bookSearchQuery.trim()) {
                      const q = bookSearchQuery.toLowerCase();
                      const tAr = (b.title_ar || '').toLowerCase();
                      const sAr = (b.subject_name_ar || '').toLowerCase();
                      const gAr = (b.grade_name_ar || '').toLowerCase();
                      if (!tAr.includes(q) && !sAr.includes(q) && !gAr.includes(q)) return false;
                    }
                    return true;
                  })
                  .map(book => (
                    <div
                      key={book.id}
                      style={{
                        background: '#FFFFFF',
                        border: '1.5px solid var(--border-light)',
                        borderRadius: '0.75rem',
                        padding: '1.15rem',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.03)'
                      }}
                    >
                      <div>
                        {/* Badges Bar */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.65rem' }}>
                          {/* Term Badge */}
                          <span style={{
                            fontSize: '0.72rem',
                            fontWeight: 800,
                            padding: '0.2rem 0.55rem',
                            borderRadius: '0.35rem',
                            background: book.term === 2 ? '#FEF3C7' : '#EEF2FF',
                            color: book.term === 2 ? '#92400E' : '#3730A3',
                            border: `1px solid ${book.term === 2 ? '#FDE68A' : '#C7D2FE'}`
                          }}>
                            🌟 {book.term === 2 ? (language === 'ar' ? 'ترم 2' : 'Term 2') : (language === 'ar' ? 'ترم 1' : 'Term 1')}
                          </span>

                          {/* School Type Badge */}
                          <span style={{
                            fontSize: '0.72rem',
                            fontWeight: 800,
                            padding: '0.2rem 0.55rem',
                            borderRadius: '0.35rem',
                            background: book.school_type === 'لغات' ? '#EFF6FF' : book.school_type === 'عربي' ? '#F0FDF4' : '#F5F3FF',
                            color: book.school_type === 'لغات' ? '#1D4ED8' : book.school_type === 'عربي' ? '#15803D' : '#6D28D9',
                            border: `1px solid ${book.school_type === 'لغات' ? '#BFDBFE' : book.school_type === 'عربي' ? '#BBF7D0' : '#DDD6FE'}`
                          }}>
                            {book.school_type === 'عربي' ? (language === 'ar' ? '🏫 عربي' : 'Arabic') : book.school_type === 'لغات' ? (language === 'ar' ? '🌐 لغات' : 'Languages') : (language === 'ar' ? '🤝 مشترك' : 'Common')}
                          </span>

                          <span style={{ fontSize: '0.72rem', fontWeight: 800, background: '#F1F5F9', color: '#475569', padding: '0.2rem 0.55rem', borderRadius: '0.35rem' }}>
                            {book.grade_name_ar || 'الصف المعتمد'}
                          </span>
                        </div>

                        {/* Title */}
                        <h4 style={{ fontSize: '1rem', fontWeight: 800, color: '#1E293B', margin: '0 0 0.4rem 0' }}>
                          {book.title_ar}
                        </h4>

                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                          📚 {book.subject_name_ar} • {book.total_pages || 0} {language === 'ar' ? 'صفحة' : 'pages'} • {book.chapters_count || 1} {language === 'ar' ? 'وحدة' : 'units'}
                        </div>
                      </div>

                      <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '0.72rem', color: '#059669', fontWeight: 800 }}>
                          ✓ {language === 'ar' ? 'مفهرس بالذكاء الاصطناعي' : 'Indexed'}
                        </span>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <button
                            type="button"
                            onClick={() => handleOpenEditBook(book)}
                            style={{
                              border: 'none',
                              background: '#EEF2FF',
                              color: '#4F46E5',
                              padding: '0.3rem 0.65rem',
                              borderRadius: '0.4rem',
                              fontSize: '0.75rem',
                              fontWeight: 800,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.25rem'
                            }}
                          >
                            <Edit3 size={13} />
                            <span>{language === 'ar' ? 'تعديل الكتاب' : 'Edit Book'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteBook(book.id, book.title_ar)}
                            style={{
                              border: 'none',
                              background: '#FEE2E2',
                              color: '#DC2626',
                              padding: '0.3rem 0.65rem',
                              borderRadius: '0.4rem',
                              fontSize: '0.75rem',
                              fontWeight: 800,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.25rem'
                            }}
                          >
                            <Trash2 size={13} />
                            <span>{language === 'ar' ? 'حذف الكتاب' : 'Delete'}</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB: GLOBAL PLATFORM SETTINGS & CONTROLS */}
      {activeTab === 'settings' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
          {/* 1. Global Term Switcher Hero Card */}
          <div style={{
            background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
            color: '#FFFFFF',
            padding: '1.75rem',
            borderRadius: '1rem',
            boxShadow: '0 8px 24px rgba(15, 23, 42, 0.25)',
            border: '1px solid #334155'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '1.5rem' }}>🌟</span>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 900, margin: 0 }}>
                    {language === 'ar' ? 'مفتاح التبديل الشامل للفصل الدراسي (ترم 1 / ترم 2)' : 'Global Academic Term Switcher'}
                  </h3>
                </div>
              </div>

              <span style={{
                fontSize: '0.85rem',
                fontWeight: 900,
                padding: '0.35rem 0.85rem',
                borderRadius: '2rem',
                background: '#4F46E5',
                color: '#FFFFFF',
                boxShadow: '0 0 12px rgba(99, 102, 241, 0.5)'
              }}>
                {language === 'ar' 
                  ? `المنصة تعمل حالياً وفق: الفصل الدراسي ${activeTerm === 1 ? 'الأول' : 'الثاني'}` 
                  : `Active: Term ${activeTerm}`}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginTop: '1.25rem' }}>
              <button
                type="button"
                onClick={() => handleToggleTerm(1)}
                style={{
                  padding: '1.25rem',
                  borderRadius: '0.85rem',
                  border: activeTerm === 1 ? '2.5px solid #6366F1' : '1.5px solid #334155',
                  background: activeTerm === 1 ? 'rgba(99, 102, 241, 0.25)' : 'rgba(30, 41, 59, 0.6)',
                  color: '#FFFFFF',
                  cursor: 'pointer',
                  textAlign: 'start',
                  transition: 'all 0.2s ease'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <strong style={{ fontSize: '1.05rem' }}>📘 {language === 'ar' ? 'الفصل الدراسي الأول (ترم 1)' : 'Term 1'}</strong>
                  {activeTerm === 1 && <span style={{ background: '#10B981', color: '#FFFFFF', padding: '0.15rem 0.5rem', borderRadius: '1rem', fontSize: '0.72rem', fontWeight: 900 }}>✓ {language === 'ar' ? 'فعّال الآن' : 'Active'}</span>}
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleToggleTerm(2)}
                style={{
                  padding: '1.25rem',
                  borderRadius: '0.85rem',
                  border: activeTerm === 2 ? '2.5px solid #F59E0B' : '1.5px solid #334155',
                  background: activeTerm === 2 ? 'rgba(245, 158, 11, 0.25)' : 'rgba(30, 41, 59, 0.6)',
                  color: '#FFFFFF',
                  cursor: 'pointer',
                  textAlign: 'start',
                  transition: 'all 0.2s ease'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <strong style={{ fontSize: '1.05rem' }}>📙 {language === 'ar' ? 'الفصل الدراسي الثاني (ترم 2)' : 'Term 2'}</strong>
                  {activeTerm === 2 && <span style={{ background: '#F59E0B', color: '#FFFFFF', padding: '0.15rem 0.5rem', borderRadius: '1rem', fontSize: '0.72rem', fontWeight: 900 }}>✓ {language === 'ar' ? 'فعّال الآن' : 'Active'}</span>}
                </div>
              </button>
            </div>
          </div>

          {/* 2. Platform Brand Logo Customizer */}
          <div className="card" style={{ padding: '1.75rem', borderRadius: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
              <Image size={18} color="var(--primary-600)" />
              <h3 style={{ fontSize: '1.15rem', fontWeight: 900, margin: 0 }}>
                {language === 'ar' ? 'تخصيص شعار المنصة (Platform Brand Logo)' : 'Platform Brand Logo'}
              </h3>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '2rem', flexWrap: 'wrap' }}>
              {/* Preview Box */}
              <div style={{
                width: '120px',
                height: '120px',
                borderRadius: '1rem',
                border: '2px dashed #CBD5E1',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#F8FAFC',
                padding: '0.5rem',
                overflow: 'hidden'
              }}>
                <img
                  src={logoPreview || platformLogo || '/logo.png'}
                  alt="Platform Logo Preview"
                  style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                />
              </div>

              {/* Upload Controls */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', flex: 1, minWidth: '240px' }}>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml,image/webp"
                  onChange={handleLogoFileSelect}
                  style={{ fontSize: '0.85rem' }}
                />

                <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
                  {logoPreview && (
                    <button
                      type="button"
                      disabled={isSavingLogo}
                      onClick={handleSaveLogo}
                      className="btn btn-primary"
                      style={{ fontWeight: 800, padding: '0.55rem 1.25rem', fontSize: '0.85rem' }}
                    >
                      {isSavingLogo ? (language === 'ar' ? 'جاري الحفظ...' : 'Saving...') : (language === 'ar' ? '💾 اعتماد وحفظ الشعار الجديد' : 'Save New Logo')}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleResetLogo}
                    className="btn btn-outline"
                    style={{ fontWeight: 700, padding: '0.55rem 1.25rem', fontSize: '0.85rem' }}
                  >
                    <RefreshCw size={14} />
                    <span>{language === 'ar' ? 'استعادة الشعار الافتراضي' : 'Reset to Default'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* 3. Active Working Grades Matrix */}
          <div className="card" style={{ padding: '1.75rem', borderRadius: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Layers size={18} color="var(--primary-600)" />
                  <h3 style={{ fontSize: '1.15rem', fontWeight: 900, margin: 0 }}>
                    {language === 'ar' ? 'التحكم في الصفوف الدراسية الفعّالة على المنظومة' : 'Active Working Grades'}
                  </h3>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={handleSelectAllGrades}
                  className="btn btn-primary btn-sm"
                  style={{ fontWeight: 800, fontSize: '0.8rem' }}
                >
                  ✓ {language === 'ar' ? 'تفعيل كافة الصفوف (12)' : 'Activate All 12'}
                </button>
                <button
                  type="button"
                  onClick={handleDeselectAllGrades}
                  className="btn btn-outline btn-sm"
                  style={{ fontWeight: 800, fontSize: '0.8rem' }}
                >
                  ✕ {language === 'ar' ? 'تعطيل الكل' : 'Disable All'}
                </button>
              </div>
            </div>

            {/* Grades Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: '0.75rem', marginTop: '1rem' }}>
              {grades.map(g => {
                const isActive = activeGrades === 'ALL' || (Array.isArray(activeGrades) && activeGrades.includes(g.id));
                return (
                  <div
                    key={g.id}
                    onClick={() => handleToggleGradeActive(g.id)}
                    style={{
                      padding: '0.85rem',
                      borderRadius: '0.65rem',
                      border: isActive ? '2px solid #10B981' : '1.5px solid #E2E8F0',
                      background: isActive ? '#F0FDF4' : '#F8FAFC',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div>
                      <strong style={{ fontSize: '0.875rem', color: isActive ? '#065F46' : '#64748B', display: 'block' }}>
                        {language === 'ar' ? g.name_ar : (g.name_en || g.name_ar)}
                      </strong>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        {g.stage_name_ar || ''}
                      </span>
                    </div>

                    <span style={{
                      padding: '0.2rem 0.55rem',
                      borderRadius: '1rem',
                      fontSize: '0.72rem',
                      fontWeight: 900,
                      background: isActive ? '#10B981' : '#CBD5E1',
                      color: '#FFFFFF'
                    }}>
                      {isActive ? (language === 'ar' ? 'مفعّل ✓' : 'Active') : (language === 'ar' ? 'معطّل' : 'Disabled')}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 4. Student Self-Registration Policy Toggle */}
          <div className="card" style={{ padding: '1.75rem', borderRadius: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Users size={18} color="var(--primary-600)" />
                  <h3 style={{ fontSize: '1.15rem', fontWeight: 900, margin: 0 }}>
                    {language === 'ar' ? 'التسجيل الذاتي لحسابات الطلاب' : 'Student Self-Registration Policy'}
                  </h3>
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleToggleStudentRegistration(!allowStudentRegistration)}
                style={{
                  padding: '0.75rem 1.5rem',
                  borderRadius: '0.65rem',
                  border: 'none',
                  background: allowStudentRegistration ? '#10B981' : '#EF4444',
                  color: '#FFFFFF',
                  fontWeight: 900,
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  boxShadow: allowStudentRegistration ? '0 4px 12px rgba(16, 185, 129, 0.4)' : '0 4px 12px rgba(239, 68, 68, 0.4)'
                }}
              >
                <span>{allowStudentRegistration ? '🔓 ' + (language === 'ar' ? 'التسجيل مفتوح ومتاح للطلاب' : 'Registration Open') : '🔒 ' + (language === 'ar' ? 'التسجيل مغلق بقرار الإدارة' : 'Registration Closed')}</span>
              </button>
            </div>
          </div>

          {/* 5. Subordinate Visibility Control (الرقابة الهرمية) */}
          <div className="card" style={{ padding: '1.75rem', borderRadius: '1rem', border: '1.5px solid var(--border-light)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
              <div style={{ maxWidth: '650px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <ShieldCheck size={20} color="var(--primary-600)" />
                  <h3 style={{ fontSize: '1.15rem', fontWeight: 900, margin: 0 }}>
                    {language === 'ar' ? 'التحكم في رؤية المستخدمين التابعين (الرقابة الهرمية)' : 'Subordinate Visibility Control'}
                  </h3>
                </div>
                <p style={{ margin: '0.4rem 0 0 0', fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  {language === 'ar'
                    ? 'يحدد ما إذا كان الموجهون ومديرو الإدارات والمحافظات يمكنهم رؤية المستخدمين الذين تحتهم في التسلسل الإداري، أم قصر صلاحية الرؤية التامة على الإدارة العامة (الأدمن العام) فقط.'
                    : 'Controls whether supervisors and district managers can view users beneath them in the hierarchy, or restrict full visibility strictly to the Super Admin.'}
                </p>
              </div>

              <button
                type="button"
                onClick={() => handleToggleSubordinateVisibility(!allowSubordinateVisibility)}
                style={{
                  padding: '0.75rem 1.5rem',
                  borderRadius: '0.65rem',
                  border: 'none',
                  background: allowSubordinateVisibility ? '#10B981' : '#6B7280',
                  color: '#FFFFFF',
                  fontWeight: 900,
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  boxShadow: allowSubordinateVisibility ? '0 4px 12px rgba(16, 185, 129, 0.4)' : '0 4px 12px rgba(107, 114, 128, 0.4)'
                }}
              >
                <span>
                  {allowSubordinateVisibility
                    ? '👁️ ' + (language === 'ar' ? 'مسموح برؤية التابعين' : 'Visibility Allowed')
                    : '🔒 ' + (language === 'ar' ? 'محجوبة (المدير العام فقط)' : 'Restricted to Super Admin')}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

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
                      {teacher.gradeNameAr && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.15rem' }}>
                          <span style={{
                            background: '#EEF2FF',
                            color: '#4F46E5',
                            border: '1px solid #C7D2FE',
                            padding: '0.2rem 0.6rem',
                            borderRadius: '6px',
                            fontSize: '0.78rem',
                            fontWeight: 800,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.3rem'
                          }}>
                            🎓 {language === 'ar' ? `الصف: ${teacher.gradeNameAr}` : `Grade: ${teacher.gradeNameAr}`}
                          </span>
                        </div>
                      )}
                      {teacher.subjectNameAr && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.15rem' }}>
                          <span style={{
                            background: '#EFF6FF',
                            color: '#1D4ED8',
                            border: '1px solid #BFDBFE',
                            padding: '0.2rem 0.6rem',
                            borderRadius: '6px',
                            fontSize: '0.78rem',
                            fontWeight: 800,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.3rem'
                          }}>
                            📚 {language === 'ar' ? `المادة: ${teacher.subjectNameAr}` : `Subject: ${teacher.subjectNameAr}`}
                          </span>
                        </div>
                      )}
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

                  {/* Actions: Impersonate + Permissions + Password */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.4rem', marginTop: '0.5rem' }}>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleImpersonateTeacher(teacher)}
                      style={{ fontWeight: 800, fontSize: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem', padding: '0.35rem 0.5rem' }}
                      title={language === 'ar' ? 'الدخول مباشرة إلى حساب هذا المعلم وإدارة كتبه وامتحاناته' : 'Login directly into this teacher account'}
                    >
                      <ExternalLink size={13} />
                      <span>{language === 'ar' ? 'دخول حسابه' : 'Enter'}</span>
                    </button>

                    <button
                      className="btn btn-outline btn-sm"
                      onClick={() => handleOpenPermissions(teacher)}
                      style={{ fontWeight: 700, fontSize: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem', padding: '0.35rem 0.5rem' }}
                    >
                      <Settings size={13} />
                      <span>{language === 'ar' ? 'الصلاحيات' : 'Perms'}</span>
                    </button>

                    <button
                      className="btn btn-outline btn-sm"
                      onClick={() => {
                        setUserForPasswordReset({ id: teacher.id, name: teacher.fullName, role: 'TEACHER' });
                        setResetNewPassword('');
                        setResetConfirmPassword('');
                        setResetError(null);
                      }}
                      style={{ fontWeight: 700, fontSize: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem', padding: '0.35rem 0.5rem', color: '#4F46E5', borderColor: '#C7D2FE' }}
                      title={language === 'ar' ? 'إعادة تعيين كلمة المرور لهذا المعلم' : 'Reset password'}
                    >
                      <Key size={13} />
                      <span>{language === 'ar' ? 'كلمة المرور' : 'Password'}</span>
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
                        <div style={{ display: 'inline-flex', gap: '0.35rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                          <button
                            className="btn btn-outline btn-sm"
                            onClick={() => handleInspectStudent(student)}
                            style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
                          >
                            {language === 'ar' ? '📊 التشخيص' : '📊 Diagnosis'}
                          </button>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleImpersonateStudent(student.id)}
                            style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem', fontWeight: 700 }}
                            title={language === 'ar' ? 'دخول حساب الطالب لمعاينة لوحته كطالب' : 'Login into student dashboard'}
                          >
                            {language === 'ar' ? '👁️ حسابه' : '👁️ Account'}
                          </button>
                          <button
                            className="btn btn-outline btn-sm"
                            onClick={() => {
                              setUserForPasswordReset({ id: student.id, name: student.fullName, role: 'STUDENT' });
                              setResetNewPassword('');
                              setResetConfirmPassword('');
                              setResetError(null);
                            }}
                            style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem', color: '#4F46E5', borderColor: '#C7D2FE' }}
                            title={language === 'ar' ? 'تغيير كلمة المرور للطالب' : 'Change student password'}
                          >
                            <Key size={13} />
                            <span>{language === 'ar' ? 'كلمة المرور' : 'Password'}</span>
                          </button>
                          <button
                            className="btn btn-outline btn-sm"
                            onClick={() => handleOpenDeviceManage(student)}
                            style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem', color: '#059669', borderColor: '#A7F3D0' }}
                            title={language === 'ar' ? 'إدارة الأجهزة المصرح بها لهذا الطالب' : 'Manage student devices'}
                          >
                            <Smartphone size={13} />
                            <span>{language === 'ar' ? 'الأجهزة' : 'Devices'}</span>
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

              {/* Grade Selection for Teacher */}
              <div style={{
                background: '#F5F3FF',
                border: '1.5px solid #818CF8',
                borderRadius: '0.75rem',
                padding: '0.9rem',
                marginBottom: '1rem'
              }}>
                <label className="form-label" style={{ color: '#4338CA', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem' }}>
                  <span>🎓</span>
                  <span>{language === 'ar' ? 'الصف الدراسي: *' : 'Assigned Grade: *'}</span>
                </label>
                <select
                  required
                  className="form-input"
                  value={newTeacherData.gradeId}
                  onChange={(e) => {
                    const gId = e.target.value;
                    setNewTeacherData({ ...newTeacherData, gradeId: gId, subjectId: '' });
                  }}
                  style={{ borderColor: '#6366F1', fontWeight: 800, color: '#312E81', background: '#FFFFFF' }}
                >
                  <option value="">{language === 'ar' ? 'اختر الصف الدراسي...' : 'Select Grade...'}</option>
                  {Array.from(new Map(grades.map(g => [g.id, g])).values()).map(g => (
                    <option key={g.id} value={g.id}>
                      {language === 'ar' ? `${g.name_ar} (${g.stage_name_ar || ''})` : `${g.name_en || g.name_ar}`}
                    </option>
                  ))}
                </select>
              </div>

              {/* Subject Selection for Teacher */}
              <div style={{
                background: '#EFF6FF',
                border: '1.5px solid #60A5FA',
                borderRadius: '0.75rem',
                padding: '0.9rem',
                marginBottom: '1rem'
              }}>
                <label className="form-label" style={{ color: '#1D4ED8', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem' }}>
                  <span>📚</span>
                  <span>{language === 'ar' ? 'المادة الدراسية المسندة للمعلم: *' : 'Assigned Subject: *'}</span>
                </label>
                <select
                  required
                  className="form-input"
                  value={newTeacherData.subjectId}
                  onChange={(e) => {
                    const subId = e.target.value;
                    const sub = teacherSubjects.find(s => s.id === subId);
                    setNewTeacherData({
                      ...newTeacherData,
                      subjectId: subId,
                      specialization: sub ? `معلم ${sub.name_ar}` : newTeacherData.specialization
                    });
                  }}
                  style={{ borderColor: '#3B82F6', fontWeight: 800, color: '#1E3A8A', background: '#FFFFFF' }}
                >
                  <option value="">{language === 'ar' ? (newTeacherData.gradeId ? 'اختر المادة الدراسية...' : 'يرجى اختيار الصف الدراسي أولاً') : 'Select Subject...'}</option>
                  {teacherSubjects.map(s => (
                    <option key={s.id} value={s.id}>
                      {language === 'ar' ? s.name_ar : (s.name_en || s.name_ar)}
                    </option>
                  ))}
                </select>
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
                  {language === 'ar' ? 'الحد الشهري للاختبارات' : 'Monthly Exam Limit per Student'}
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
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-dark)', marginBottom: '0.5rem' }}>
                  {language === 'ar' ? 'عدد الاختبارات المسموحة شهرياً لكل طالب: *' : 'Allowed Monthly Exams per Student: *'}
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

      {/* MODAL: SUPERADMIN PROFILE & PASSWORD CREDENTIALS */}
      {isProfileModalOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 300,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem'
        }}>
          <div className="card" style={{ width: '100%', maxWidth: '480px', padding: '1.75rem', borderRadius: 'var(--radius-xl)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Key size={20} color="#4F46E5" />
                <h3 style={{ fontSize: '1.15rem', fontWeight: 900, margin: 0 }}>
                  {language === 'ar' ? 'تعديل بيانات الحساب وكلمة المرور للمالك' : 'SuperAdmin Credentials'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsProfileModalOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                <X size={20} />
              </button>
            </div>

            {profileError && (
              <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#DC2626', padding: '0.65rem 0.85rem', borderRadius: '0.5rem', marginBottom: '1rem', fontSize: '0.85rem', fontWeight: 700 }}>
                {profileError}
              </div>
            )}

            <form onSubmit={handleUpdateProfile} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, marginBottom: '0.3rem' }}>
                  {language === 'ar' ? 'اسم المستخدم / الاسم الكامل: *' : 'Full Name: *'}
                </label>
                <input
                  type="text"
                  required
                  value={profileFullName}
                  onChange={(e) => setProfileFullName(e.target.value)}
                  style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '0.5rem', border: '1.5px solid var(--border-light)', fontSize: '0.9rem' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, marginBottom: '0.3rem' }}>
                  {language === 'ar' ? 'البريد الإلكتروني: *' : 'Email: *'}
                </label>
                <input
                  type="email"
                  required
                  value={profileEmail}
                  onChange={(e) => setProfileEmail(e.target.value)}
                  style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '0.5rem', border: '1.5px solid var(--border-light)', fontSize: '0.9rem' }}
                />
              </div>

              <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: '0.75rem', marginTop: '0.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, marginBottom: '0.3rem', color: '#DC2626' }}>
                  {language === 'ar' ? 'كلمة المرور الحالية (للتحقق وتأكيد الهوية): *' : 'Current Password: *'}
                </label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={profileCurrentPassword}
                  onChange={(e) => setProfileCurrentPassword(e.target.value)}
                  style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '0.5rem', border: '1.5px solid #FCA5A5', fontSize: '0.9rem' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, marginBottom: '0.3rem' }}>
                  {language === 'ar' ? 'كلمة المرور الجديدة (اختياري - اتركها فارغة إذا أردت تعديل الاسم والبريد فقط):' : 'New Password (Optional):'}
                </label>
                <input
                  type="password"
                  placeholder={language === 'ar' ? 'اتركها فارغة لعدم التغيير' : 'Leave empty to keep unchanged'}
                  value={profileNewPassword}
                  onChange={(e) => setProfileNewPassword(e.target.value)}
                  style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '0.5rem', border: '1.5px solid var(--border-light)', fontSize: '0.9rem' }}
                />
              </div>

              {profileNewPassword && (
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, marginBottom: '0.3rem' }}>
                    {language === 'ar' ? 'تأكيد كلمة المرور الجديدة: *' : 'Confirm New Password: *'}
                  </label>
                  <input
                    type="password"
                    required={Boolean(profileNewPassword)}
                    placeholder="••••••••"
                    value={profileConfirmPassword}
                    onChange={(e) => setProfileConfirmPassword(e.target.value)}
                    style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '0.5rem', border: '1.5px solid var(--border-light)', fontSize: '0.9rem' }}
                  />
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setIsProfileModalOpen(false)}
                >
                  {language === 'ar' ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={profileUpdating}
                  className="btn btn-primary"
                  style={{ fontWeight: 800 }}
                >
                  {profileUpdating ? (language === 'ar' ? 'جاري الحفظ...' : 'Saving...') : (language === 'ar' ? 'تحديث وتأكيد' : 'Save Changes')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: RESET USER PASSWORD (TEACHER OR STUDENT) */}
      {userForPasswordReset && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 300,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem'
        }}>
          <div className="card" style={{ width: '100%', maxWidth: '440px', padding: '1.75rem', borderRadius: 'var(--radius-xl)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Key size={20} color="#4F46E5" />
                <h3 style={{ fontSize: '1.15rem', fontWeight: 900, margin: 0 }}>
                  {language === 'ar' ? 'إعادة تعيين كلمة المرور' : 'Reset User Password'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setUserForPasswordReset(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', padding: '0.75rem 1rem', borderRadius: '0.6rem', marginBottom: '1.25rem', fontSize: '0.85rem' }}>
              <div>{language === 'ar' ? 'المستخدم:' : 'User:'} <strong>{userForPasswordReset.name}</strong></div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                {language === 'ar' ? 'النوع:' : 'Role:'} {userForPasswordReset.role === 'TEACHER' ? (language === 'ar' ? 'معلم' : 'Teacher') : (language === 'ar' ? 'طالب' : 'Student')}
              </div>
            </div>

            {resetError && (
              <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#DC2626', padding: '0.65rem 0.85rem', borderRadius: '0.5rem', marginBottom: '1rem', fontSize: '0.85rem', fontWeight: 700 }}>
                {resetError}
              </div>
            )}

            <form onSubmit={handleResetUserPassword} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, marginBottom: '0.3rem' }}>
                  {language === 'ar' ? 'كلمة المرور الجديدة: *' : 'New Password: *'}
                </label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={resetNewPassword}
                  onChange={(e) => setResetNewPassword(e.target.value)}
                  style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '0.5rem', border: '1.5px solid var(--border-light)', fontSize: '0.9rem' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, marginBottom: '0.3rem' }}>
                  {language === 'ar' ? 'تأكيد كلمة المرور الجديدة: *' : 'Confirm New Password: *'}
                </label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={resetConfirmPassword}
                  onChange={(e) => setResetConfirmPassword(e.target.value)}
                  style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '0.5rem', border: '1.5px solid var(--border-light)', fontSize: '0.9rem' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setUserForPasswordReset(null)}
                >
                  {language === 'ar' ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={resettingPassword}
                  className="btn btn-primary"
                  style={{ fontWeight: 800 }}
                >
                  {resettingPassword ? (language === 'ar' ? 'جاري الحفظ...' : 'Saving...') : (language === 'ar' ? 'تأكيد التغيير' : 'Reset Password')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: STUDENT DEVICES MANAGEMENT */}
      {studentForDeviceManage && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 300,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem'
        }}>
          <div className="card" style={{ width: '100%', maxWidth: '520px', padding: '1.75rem', borderRadius: 'var(--radius-xl)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Smartphone size={20} color="#059669" />
                <h3 style={{ fontSize: '1.15rem', fontWeight: 900, margin: 0 }}>
                  {language === 'ar' ? 'إدارة أجهزة الطالب والحد الأقصى' : 'Student Devices Management'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setStudentForDeviceManage(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', padding: '0.85rem 1rem', borderRadius: '0.6rem', marginBottom: '1.25rem' }}>
              <div style={{ fontWeight: 800, color: '#166534' }}>{studentForDeviceManage.fullName}</div>
              <div style={{ fontSize: '0.8rem', color: '#15803D', marginTop: '0.2rem' }}>{studentForDeviceManage.email}</div>
              <div style={{ fontSize: '0.8rem', color: '#166534', marginTop: '0.4rem', fontWeight: 700 }}>
                {language === 'ar' 
                  ? `الأجهزة المسجلة حالياً: ${studentDevices.length} من أصل ${studentMaxDevices} جهاز مسموح` 
                  : `Active Devices: ${studentDevices.length} / ${studentMaxDevices} allowed`}
              </div>
            </div>

            {/* Device Limit Setter */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 0', borderBottom: '1px solid var(--border-light)', marginBottom: '1rem' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 800 }}>
                {language === 'ar' ? 'الحد الأقصى للأجهزة المصرح بها:' : 'Maximum Allowed Devices:'}
              </span>
              <div style={{ display: 'flex', gap: '0.35rem' }}>
                {[1, 2, 3, 5].map(limit => (
                  <button
                    key={limit}
                    type="button"
                    onClick={() => handleUpdateMaxDevices(limit)}
                    disabled={deviceActionLoading}
                    style={{
                      padding: '0.35rem 0.75rem',
                      borderRadius: '0.4rem',
                      border: studentMaxDevices === limit ? '2px solid #059669' : '1px solid var(--border-light)',
                      background: studentMaxDevices === limit ? '#DCFCE7' : '#FFFFFF',
                      color: studentMaxDevices === limit ? '#166534' : 'var(--text-dark)',
                      fontWeight: 800,
                      cursor: 'pointer',
                      fontSize: '0.85rem'
                    }}
                  >
                    {limit}
                  </button>
                ))}
              </div>
            </div>

            {/* List of active devices */}
            <div style={{ marginBottom: '1.25rem' }}>
              <h4 style={{ fontSize: '0.875rem', fontWeight: 800, marginBottom: '0.5rem' }}>
                {language === 'ar' ? 'قائمة الأجهزة النشطة:' : 'Active Registered Devices:'}
              </h4>
              {loadingDevices ? (
                <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  {language === 'ar' ? 'جاري تحميل الأجهزة...' : 'Loading devices...'}
                </div>
              ) : studentDevices.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '1rem', background: '#F8FAFC', borderRadius: '0.5rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  {language === 'ar' ? 'لا توجد أجهزة مسجلة حالياً لهذا الطالب' : 'No devices currently registered'}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '180px', overflowY: 'auto' }}>
                  {studentDevices.map((dev, idx) => (
                    <div key={dev.id || idx} style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', padding: '0.65rem 0.85rem', borderRadius: '0.5rem', fontSize: '0.8rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: 800, color: 'var(--text-title)' }}>
                          📱 {language === 'ar' ? `جهاز #${idx + 1}` : `Device #${idx + 1}`} ({dev.device_id ? dev.device_id.substring(0, 10) + '...' : 'Browser'})
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                          IP: {dev.last_ip || 'غير معروف'} • {dev.last_login_at ? new Date(dev.last_login_at).toLocaleDateString('ar-EG') : ''}
                        </div>
                      </div>
                      <span className="badge badge-success" style={{ fontSize: '0.7rem' }}>
                        {language === 'ar' ? 'مرتبط' : 'Active'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Reset All Devices Action */}
            <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                type="button"
                onClick={handleResetAllDevices}
                disabled={deviceActionLoading || studentDevices.length === 0}
                style={{
                  background: '#FEE2E2',
                  color: '#DC2626',
                  border: '1px solid #FCA5A5',
                  padding: '0.5rem 0.85rem',
                  borderRadius: '0.5rem',
                  fontWeight: 800,
                  fontSize: '0.8rem',
                  cursor: studentDevices.length === 0 ? 'not-allowed' : 'pointer',
                  opacity: studentDevices.length === 0 ? 0.6 : 1
                }}
              >
                {language === 'ar' ? '🗑️ مسح وإلغاء ربط كافة الأجهزة' : 'Reset All Devices'}
              </button>

              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setStudentForDeviceManage(null)}
              >
                {language === 'ar' ? 'إغلاق' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* MODAL: SUPER ADMIN EDIT BOOK & CHAPTERS */}
      {editBookModalOpen && editingBook && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 250,
          backgroundColor: 'rgba(15, 23, 42, 0.7)',
          backdropFilter: 'blur(5px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem'
        }}>
          <div className="card" style={{ width: '100%', maxWidth: '780px', maxHeight: '92vh', overflowY: 'auto', padding: '1.75rem', borderRadius: 'var(--radius-xl)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-light)', paddingBottom: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <span style={{ fontSize: '1.4rem' }}>📚</span>
                <div>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 900, margin: 0, color: 'var(--text-title)' }}>
                    {language === 'ar' ? 'تعديل الكتاب والمقرر الدراسي' : 'Edit Curriculum Book & Chapters'}
                  </h3>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {editingBook.title_ar} • {editingBook.grade_name_ar || 'الصف المعتمد'}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setEditBookModalOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                <X size={22} />
              </button>
            </div>

            {/* Form for core book details */}
            <form onSubmit={handleSaveBookDetails}>
              <div className="responsive-form-grid-2">
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 800 }}>
                    {language === 'ar' ? 'اسم الكتاب (بالعربية): *' : 'Book Title (Arabic): *'}
                  </label>
                  <input
                    type="text"
                    required
                    className="form-input"
                    value={editBookTitleAr}
                    onChange={(e) => setEditBookTitleAr(e.target.value)}
                    placeholder="مثال: كتاب اللغة العربية - الجزء الأول"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 800 }}>
                    {language === 'ar' ? 'اسم الكتاب (بالإنجليزية):' : 'Book Title (English):'}
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    value={editBookTitleEn}
                    onChange={(e) => setEditBookTitleEn(e.target.value)}
                    placeholder="e.g. Arabic Language Book"
                  />
                </div>
              </div>

              <div className="responsive-form-grid-2">
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 800 }}>
                    {language === 'ar' ? 'المرحلة الدراسية:' : 'Academic Stage:'}
                  </label>
                  <select
                    className="form-input"
                    value={editBookStageId}
                    onChange={(e) => setEditBookStageId(e.target.value)}
                  >
                    {allStages.map(st => (
                      <option key={st.id} value={st.id}>
                        {language === 'ar' ? st.name_ar : (st.name_en || st.name_ar)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 800 }}>
                    {language === 'ar' ? 'الصف الدراسي:' : 'Grade:'}
                  </label>
                  <select
                    className="form-input"
                    value={editBookGradeId}
                    onChange={(e) => {
                      const newGId = e.target.value;
                      setEditBookGradeId(newGId);
                      fetch(apiUrl(`/api/meta/grades/${newGId}/subjects`))
                        .then(r => r.json())
                        .then(data => {
                          if (Array.isArray(data)) {
                            setEditBookSubjects(data);
                            if (data.length > 0) setEditBookSubjectId(data[0].id);
                          }
                        })
                        .catch(console.error);
                    }}
                  >
                    {grades.map(g => (
                      <option key={g.id} value={g.id}>
                        {language === 'ar' ? g.name_ar : (g.name_en || g.name_ar)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="responsive-form-grid-2">
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 800 }}>
                    {language === 'ar' ? 'المادة الدراسية:' : 'Subject:'}
                  </label>
                  <select
                    className="form-input"
                    value={editBookSubjectId}
                    onChange={(e) => setEditBookSubjectId(e.target.value)}
                  >
                    {editBookSubjects.map(s => (
                      <option key={s.id} value={s.id}>
                        {language === 'ar' ? s.name_ar : (s.name_en || s.name_ar)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 800 }}>
                    {language === 'ar' ? 'نوع المدرسة:' : 'School Type:'}
                  </label>
                  <select
                    className="form-input"
                    value={editBookSchoolType}
                    onChange={(e) => setEditBookSchoolType(e.target.value as any)}
                  >
                    <option value="كلاهما">{language === 'ar' ? 'مشترك (عربي ولغات)' : 'Common (Both)'}</option>
                    <option value="عربي">{language === 'ar' ? 'مدارس عربي فقط' : 'Arabic Schools'}</option>
                    <option value="لغات">{language === 'ar' ? 'مدارس لغات فقط' : 'Languages Schools'}</option>
                  </select>
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                <label className="form-label" style={{ fontWeight: 800 }}>
                  {language === 'ar' ? 'الفصل الدراسي (الترم):' : 'Term:'}
                </label>
                <div style={{ display: 'flex', gap: '1rem', marginTop: '0.4rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontWeight: 700 }}>
                    <input
                      type="radio"
                      name="editBookTerm"
                      checked={editBookTerm === 1}
                      onChange={() => setEditBookTerm(1)}
                    />
                    <span>📘 {language === 'ar' ? 'الفصل الدراسي الأول (ترم 1)' : 'Term 1'}</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontWeight: 700 }}>
                    <input
                      type="radio"
                      name="editBookTerm"
                      checked={editBookTerm === 2}
                      onChange={() => setEditBookTerm(2)}
                    />
                    <span>📙 {language === 'ar' ? 'الفصل الدراسي الثاني (ترم 2)' : 'Term 2'}</span>
                  </label>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-light)', paddingBottom: '1rem' }}>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isSavingBook}
                  style={{ fontWeight: 800, minWidth: '150px' }}
                >
                  {isSavingBook ? (language === 'ar' ? 'جاري الحفظ...' : 'Saving...') : (language === 'ar' ? '💾 حفظ بيانات الكتاب' : 'Save Book Info')}
                </button>
              </div>
            </form>

            {/* Chapters / Units Management Section */}
            <div style={{ background: '#F8FAFC', borderRadius: 'var(--radius-lg)', padding: '1.25rem', border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div>
                  <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 900, color: 'var(--text-title)' }}>
                    {language === 'ar' ? 'فهرس وحدات الكتاب ومقاطع الذكاء الاصطناعي' : 'Units & AI Chapter Index'}
                  </h4>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {language === 'ar' ? 'إدارة صفحات الوحدات لربطها بالامتحانات وتوليد الأسئلة العشوائية' : 'Manage chapter page ranges for accurate AI exam generation'}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handleAutoDetectChaptersForBook}
                  disabled={isLoadingChapters}
                  className="btn btn-outline btn-sm"
                  style={{ fontWeight: 800, fontSize: '0.78rem', background: '#FFFFFF' }}
                >
                  🤖 {language === 'ar' ? 'إعادة تقسيم الوحدات بالذكاء الاصطناعي' : 'AI Auto-Detect Units'}
                </button>
              </div>

              {isLoadingChapters ? (
                <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)' }}>
                  <RefreshCw size={20} className="animate-spin" style={{ margin: '0 auto 0.5rem' }} />
                  <div>{language === 'ar' ? 'جاري جلب وحدات الكتاب...' : 'Loading chapters...'}</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '1.25rem' }}>
                  {editBookChapters.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '1.25rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      {language === 'ar' ? 'لا توجد وحدات مضافة لهذا الكتاب بعد.' : 'No chapters added yet.'}
                    </div>
                  ) : (
                    editBookChapters.map((ch, idx) => (
                      <div
                        key={ch.id}
                        style={{
                          background: '#FFFFFF',
                          border: '1px solid #E2E8F0',
                          borderRadius: 'var(--radius-md)',
                          padding: '0.75rem 1rem',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          flexWrap: 'wrap',
                          gap: '0.75rem'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                          <span style={{ background: '#EEF2FF', color: '#4338CA', padding: '0.2rem 0.55rem', borderRadius: '0.35rem', fontWeight: 800, fontSize: '0.75rem' }}>
                            {language === 'ar' ? `الوحدة ${ch.chapter_number || idx + 1}` : `Unit ${ch.chapter_number || idx + 1}`}
                          </span>
                          <div>
                            <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#1E293B' }}>{ch.title_ar}</div>
                            {ch.title_en && ch.title_en !== ch.title_ar && (
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{ch.title_en}</div>
                            )}
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <span style={{ fontSize: '0.78rem', background: '#F1F5F9', color: '#475569', padding: '0.2rem 0.55rem', borderRadius: '0.35rem', fontWeight: 700 }}>
                            📄 {language === 'ar' ? `من ص ${ch.start_page} إلى ص ${ch.end_page}` : `Pages ${ch.start_page}-${ch.end_page}`}
                          </span>

                          <button
                            type="button"
                            onClick={() => handleDeleteChapterFromBook(ch.id)}
                            style={{
                              border: 'none',
                              background: '#FEE2E2',
                              color: '#DC2626',
                              padding: '0.25rem 0.5rem',
                              borderRadius: '0.35rem',
                              fontSize: '0.72rem',
                              fontWeight: 800,
                              cursor: 'pointer'
                            }}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Add New Chapter Inline Sub-Form */}
              <div style={{ background: '#FFFFFF', padding: '0.85rem', borderRadius: 'var(--radius-md)', border: '1px dashed #CBD5E1' }}>
                <div style={{ fontWeight: 800, fontSize: '0.825rem', marginBottom: '0.5rem', color: 'var(--text-title)' }}>
                  ➕ {language === 'ar' ? 'إضافة وحدة دراسية جديدة لهذا الكتاب:' : 'Add New Unit:'}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  <input
                    type="text"
                    className="form-input"
                    style={{ flex: 2, minWidth: '180px', padding: '0.4rem 0.6rem', fontSize: '0.825rem' }}
                    placeholder={language === 'ar' ? 'عنوان الوحدة (مثال: الوحدة الثالثة - الكون والنظام الشمسي)' : 'Unit Title'}
                    value={newChapterTitle}
                    onChange={(e) => setNewChapterTitle(e.target.value)}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{language === 'ar' ? 'من ص:' : 'From:'}</span>
                    <input
                      type="number"
                      className="form-input"
                      style={{ width: '65px', padding: '0.4rem 0.5rem', fontSize: '0.825rem' }}
                      value={newChapterStartPage}
                      onChange={(e) => setNewChapterStartPage(e.target.value)}
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{language === 'ar' ? 'إلى ص:' : 'To:'}</span>
                    <input
                      type="number"
                      className="form-input"
                      style={{ width: '65px', padding: '0.4rem 0.5rem', fontSize: '0.825rem' }}
                      value={newChapterEndPage}
                      onChange={(e) => setNewChapterEndPage(e.target.value)}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleAddChapterToBook}
                    disabled={!newChapterTitle.trim()}
                    className="btn btn-secondary btn-sm"
                    style={{ fontWeight: 800, fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}
                  >
                    {language === 'ar' ? 'إضافة الوحدة' : 'Add Unit'}
                  </button>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setEditBookModalOpen(false)}
              >
                {language === 'ar' ? 'إغلاق النافذة' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
