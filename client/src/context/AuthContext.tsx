import React, { createContext, useContext, useState, useEffect } from 'react';
import { translations, type Language } from '../i18n/translations';
import { apiUrl } from '../utils/api';

export type UserRole = 'STUDENT' | 'TEACHER' | 'ADMIN' | 'CENTRAL_ADMIN' | 'GOVERNORATE_ADMIN' | 'GOVERNORATE_SUPERVISOR' | 'SUPERVISOR';

export interface UserProfile {
  id: string;
  super_id?: string | null;
  hybrid_id?: string | null;
  email: string;
  username?: string | null;
  role: UserRole;
  fullName: string;
  governorate_id?: string | null;
  governorate_name?: string | null;
  subject_id?: string | null;
  subject_name?: string | null;
  created_by?: string | null;
  permissions?: {
    can_upload_books?: boolean;
    can_create_exams?: boolean;
    can_delete_content?: boolean;
    can_view_analytics?: boolean;
    can_view_exams?: boolean;
    can_create_subordinates?: boolean;
    can_edit_permissions?: boolean;
    is_active?: boolean;
    is_owner?: boolean;
    [key: string]: any;
  } | null;
  profile?: {
    academic_stage_id?: string;
    grade_id?: string;
    stage_name_ar?: string;
    stage_name_en?: string;
    grade_name_ar?: string;
    grade_name_en?: string;
    school_name?: string;
    specialization?: string;
    section?: string;
    school_type?: string;
  };
}

interface AuthContextType {
  user: UserProfile | null;
  token: string | null;
  language: Language;
  t: typeof translations['ar'];
  isImpersonating: boolean;
  previousUser: UserProfile | null;
  setLanguage: (lang: Language) => void;
  login: (token: string, user: UserProfile) => void;
  logout: () => void;
  impersonateUser: (impersonationToken: string, impersonatedUser: UserProfile) => void;
  exitImpersonation: () => void;
  updateUserProfile: (newProfile: any) => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(localStorage.getItem('edu_auth_token'));
  const [user, setUser] = useState<UserProfile | null>(() => {
    const saved = localStorage.getItem('edu_auth_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [isImpersonating, setIsImpersonating] = useState<boolean>(() => {
    const stackStr = localStorage.getItem('edu_impersonation_stack');
    if (stackStr) {
      try {
        const stack = JSON.parse(stackStr);
        if (Array.isArray(stack) && stack.length > 0) return true;
      } catch (_) {}
    }
    return Boolean(localStorage.getItem('edu_admin_backup_token'));
  });
  const [language, setLanguageState] = useState<Language>(() => {
    return (localStorage.getItem('edu_lang') as Language) || 'ar';
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const getPreviousUser = (): UserProfile | null => {
    try {
      const stackStr = localStorage.getItem('edu_impersonation_stack');
      if (stackStr) {
        const stack = JSON.parse(stackStr);
        if (Array.isArray(stack) && stack.length > 0) {
          return stack[stack.length - 1].user;
        }
      }
    } catch (_) {}
    const backupUserStr = localStorage.getItem('edu_admin_backup_user');
    if (backupUserStr) {
      try { return JSON.parse(backupUserStr); } catch (_) {}
    }
    return null;
  };

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('edu_lang', lang);
    document.documentElement.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
    document.documentElement.setAttribute('lang', lang);
  };

  useEffect(() => {
    document.documentElement.setAttribute('dir', language === 'ar' ? 'rtl' : 'ltr');
    document.documentElement.setAttribute('lang', language);
  }, [language]);

  useEffect(() => {
    const verifyToken = async () => {
      if (!token) {
        setIsLoading(false);
        return;
      }
      try {
        const res = await fetch(apiUrl('/api/auth/me'), {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setUser(data.user);
          localStorage.setItem('edu_auth_user', JSON.stringify(data.user));
        } else {
          // If token invalid, step back or logout
          const stackStr = localStorage.getItem('edu_impersonation_stack');
          if (stackStr || localStorage.getItem('edu_admin_backup_token')) {
            exitImpersonation();
          } else {
            logout();
          }
        }
      } catch (e) {
        console.warn('Session verification error:', e);
      } finally {
        setIsLoading(false);
      }
    };
    verifyToken();
  }, [token]);

  const login = (newToken: string, newUser: UserProfile) => {
    setToken(newToken);
    setUser(newUser);
    setIsImpersonating(false);
    localStorage.setItem('edu_auth_token', newToken);
    localStorage.setItem('edu_auth_user', JSON.stringify(newUser));
    localStorage.removeItem('edu_impersonation_stack');
    localStorage.removeItem('edu_admin_backup_token');
    localStorage.removeItem('edu_admin_backup_user');
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    setIsImpersonating(false);
    localStorage.removeItem('edu_auth_token');
    localStorage.removeItem('edu_auth_user');
    localStorage.removeItem('edu_impersonation_stack');
    localStorage.removeItem('edu_admin_backup_token');
    localStorage.removeItem('edu_admin_backup_user');
  };

  const impersonateUser = (impersonationToken: string, impersonatedUser: UserProfile) => {
    if (token && user) {
      let stack: Array<{ token: string; user: UserProfile }> = [];
      try {
        const stackStr = localStorage.getItem('edu_impersonation_stack');
        stack = stackStr ? JSON.parse(stackStr) : [];
        if (!Array.isArray(stack)) stack = [];
      } catch {
        stack = [];
      }
      stack.push({ token, user });
      localStorage.setItem('edu_impersonation_stack', JSON.stringify(stack));

      if (!localStorage.getItem('edu_admin_backup_token')) {
        localStorage.setItem('edu_admin_backup_token', token);
        localStorage.setItem('edu_admin_backup_user', JSON.stringify(user));
      }
    }

    setToken(impersonationToken);
    setUser(impersonatedUser);
    setIsImpersonating(true);
    localStorage.setItem('edu_auth_token', impersonationToken);
    localStorage.setItem('edu_auth_user', JSON.stringify(impersonatedUser));
  };

  const exitImpersonation = () => {
    let stack: Array<{ token: string; user: UserProfile }> = [];
    try {
      const stackStr = localStorage.getItem('edu_impersonation_stack');
      stack = stackStr ? JSON.parse(stackStr) : [];
      if (!Array.isArray(stack)) stack = [];
    } catch {
      stack = [];
    }

    if (stack.length > 0) {
      const prev = stack.pop()!;
      localStorage.setItem('edu_impersonation_stack', JSON.stringify(stack));
      setToken(prev.token);
      setUser(prev.user);
      setIsImpersonating(stack.length > 0);
      localStorage.setItem('edu_auth_token', prev.token);
      localStorage.setItem('edu_auth_user', JSON.stringify(prev.user));
      if (stack.length === 0) {
        localStorage.removeItem('edu_admin_backup_token');
        localStorage.removeItem('edu_admin_backup_user');
      }
    } else {
      const backupToken = localStorage.getItem('edu_admin_backup_token');
      const backupUserStr = localStorage.getItem('edu_admin_backup_user');
      if (backupToken && backupUserStr) {
        const backupUser = JSON.parse(backupUserStr);
        setToken(backupToken);
        setUser(backupUser);
        setIsImpersonating(false);
        localStorage.setItem('edu_auth_token', backupToken);
        localStorage.setItem('edu_auth_user', backupUserStr);
        localStorage.removeItem('edu_admin_backup_token');
        localStorage.removeItem('edu_admin_backup_user');
      } else {
        logout();
      }
    }
  };

  const updateUserProfile = (newProfile: any) => {
    if (!user) return;
    const updatedUser = { ...user, profile: { ...user.profile, ...newProfile } };
    setUser(updatedUser);
    localStorage.setItem('edu_auth_user', JSON.stringify(updatedUser));
  };

  const t = translations[language];

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        language,
        t,
        isImpersonating,
        previousUser: getPreviousUser(),
        setLanguage,
        login,
        logout,
        impersonateUser,
        exitImpersonation,
        updateUserProfile,
        isLoading
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
