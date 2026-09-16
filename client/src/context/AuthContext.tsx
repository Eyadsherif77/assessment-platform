import React, { createContext, useContext, useState, useEffect } from 'react';
import { translations, type Language } from '../i18n/translations';
import { apiUrl } from '../utils/api';

export interface UserProfile {
  id: string;
  email: string;
  role: 'STUDENT' | 'TEACHER' | 'ADMIN';
  fullName: string;
  profile?: {
    academic_stage_id?: string;
    grade_id?: string;
    stage_name_ar?: string;
    stage_name_en?: string;
    grade_name_ar?: string;
    grade_name_en?: string;
    school_name?: string;
    specialization?: string;
  };
}

interface AuthContextType {
  user: UserProfile | null;
  token: string | null;
  language: Language;
  t: typeof translations['ar'];
  setLanguage: (lang: Language) => void;
  login: (token: string, user: UserProfile) => void;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(localStorage.getItem('edu_auth_token'));
  const [user, setUser] = useState<UserProfile | null>(() => {
    const saved = localStorage.getItem('edu_auth_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [language, setLanguageState] = useState<Language>(() => {
    return (localStorage.getItem('edu_lang') as Language) || 'ar';
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);

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
          logout();
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
    localStorage.setItem('edu_auth_token', newToken);
    localStorage.setItem('edu_auth_user', JSON.stringify(newUser));
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('edu_auth_token');
    localStorage.removeItem('edu_auth_user');
  };

  const t = translations[language];

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        language,
        t,
        setLanguage,
        login,
        logout,
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
