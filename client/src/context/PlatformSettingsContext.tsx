import React, { createContext, useContext, useState, useEffect } from 'react';
import { apiUrl } from '../utils/api';

export interface PlatformSettings {
  active_term: number;
  allow_student_registration: boolean;
  allow_subordinate_visibility: boolean;
  active_grades: string[] | 'ALL';
  platform_logo: string;
  monthly_exam_limit: number;
}

interface PlatformSettingsContextType {
  settings: PlatformSettings;
  platformLogo: string;
  activeTerm: number;
  allowStudentRegistration: boolean;
  allowSubordinateVisibility: boolean;
  activeGrades: string[] | 'ALL';
  monthlyExamLimit: number;
  isLoading: boolean;
  refreshSettings: () => Promise<void>;
  updateSettings: (updates: Partial<PlatformSettings>, token?: string) => Promise<boolean>;
}

const defaultSettings: PlatformSettings = {
  active_term: 1,
  allow_student_registration: true,
  allow_subordinate_visibility: true,
  active_grades: 'ALL',
  platform_logo: '/logo.png',
  monthly_exam_limit: 10
};

const PlatformSettingsContext = createContext<PlatformSettingsContextType>({
  settings: defaultSettings,
  platformLogo: '/logo.png',
  activeTerm: 1,
  allowStudentRegistration: true,
  allowSubordinateVisibility: true,
  activeGrades: 'ALL',
  monthlyExamLimit: 10,
  isLoading: false,
  refreshSettings: async () => {},
  updateSettings: async () => false
});

export const PlatformSettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<PlatformSettings>(defaultSettings);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const fetchSettings = async () => {
    try {
      const res = await fetch(apiUrl('/api/meta/platform-settings'));
      if (res.ok) {
        const data = await res.json();
        setSettings({
          active_term: parseInt(data.active_term, 10) || 1,
          allow_student_registration: data.allow_student_registration !== false,
          allow_subordinate_visibility: data.allow_subordinate_visibility !== false,
          active_grades: data.active_grades || 'ALL',
          platform_logo: data.platform_logo || '/logo.png',
          monthly_exam_limit: parseInt(data.monthly_exam_limit, 10) || 10
        });
      }
    } catch (err) {
      console.warn('Failed to load platform settings:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const updateSettings = async (updates: Partial<PlatformSettings>, token?: string): Promise<boolean> => {
    try {
      const authToken = token || localStorage.getItem('auth_token');
      if (!authToken) return false;

      const res = await fetch(apiUrl('/api/admin/settings'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`
        },
        body: JSON.stringify(updates)
      });

      if (res.ok) {
        await fetchSettings();
        return true;
      }
      return false;
    } catch (err) {
      console.error('Error updating platform settings:', err);
      return false;
    }
  };

  return (
    <PlatformSettingsContext.Provider
      value={{
        settings,
        platformLogo: settings.platform_logo || '/logo.png',
        activeTerm: settings.active_term || 1,
        allowStudentRegistration: settings.allow_student_registration,
        allowSubordinateVisibility: settings.allow_subordinate_visibility,
        activeGrades: settings.active_grades,
        monthlyExamLimit: settings.monthly_exam_limit,
        isLoading,
        refreshSettings: fetchSettings,
        updateSettings
      }}
    >
      {children}
    </PlatformSettingsContext.Provider>
  );
};

export const usePlatformSettings = () => useContext(PlatformSettingsContext);
