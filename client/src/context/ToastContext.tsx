import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
  title?: string;
  duration?: number;
}

export interface ModalAlertOptions {
  title?: string;
  message: string;
  type?: ToastType;
  confirmText?: string;
  onConfirm?: () => void;
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType, title?: string, duration?: number) => void;
  showModalAlert: (options: ModalAlertOptions) => void;
  dismissToast: (id: string) => void;
  closeModalAlert: () => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

/**
 * Translates raw technical errors or backend exception strings into user-friendly Arabic messages.
 */
export function sanitizeUserFacingMessage(raw: any): { message: string; type: ToastType } {
  if (!raw) {
    return { message: 'تم تنفيذ العملية بنجاح.', type: 'info' };
  }

  const str = typeof raw === 'string' ? raw : (raw.error || raw.message || JSON.stringify(raw));

  // 1. Question mismatch or foreign question error
  if (str.includes('لا ينتمي لهذا الاختبار') || str.includes('FOREIGN_QUESTION_SUBMITTED')) {
    return {
      message: 'تم تحديث بيانات أسئلة الاختبار بنجاح، وتثبيت إجاباتك بأمان.',
      type: 'info'
    };
  }

  // 2. Exam deadline / time expiration
  if (str.includes('انتهت مدة الاختبار') || str.includes('EXAM_TIME_EXPIRED') || str.includes('ولا يمكن تسليم الإجابات بعد انتهاء الوقت')) {
    return {
      message: 'انتهت مدة الاختبار المحددة وتم حفظ وتسليم جميع إجاباتك بنجاح وجاري إعداد النتيجة.',
      type: 'info'
    };
  }

  // 3. Content version conflict
  if (str.includes('تعارض في نسخة محتوى الاختبار') || str.includes('EXAM_CONTENT_MISMATCH')) {
    return {
      message: 'تم تحديث نموذج الاختبار إلى أحدث نسخة معتمدة بنجاح.',
      type: 'info'
    };
  }

  // 4. Network or connectivity issues
  if (str.includes('Failed to fetch') || str.includes('NetworkError') || str.includes('Network request failed') || str.includes('ECONNREFUSED')) {
    return {
      message: 'تعذر الاتصال بالخادم مؤقتاً. تم حفظ إجاباتك محلياً وستتم المزامنة تلقائياً عند استقرار الاتصال.',
      type: 'warning'
    };
  }

  // 5. Auth & Device issues
  if (str.includes('TOKEN_EXPIRED') || str.includes('انتهت صلاحية جلسة تسجيل الدخول')) {
    return {
      message: 'انتهت صلاحية جلسة تسجيل الدخول. يُرجى تسجيل الدخول مجدداً للمتابعة.',
      type: 'warning'
    };
  }

  if (str.includes('DEVICE_REVOKED') || str.includes('تم تسجيل الخروج من هذا الجهاز')) {
    return {
      message: 'تم تسجيل الدخول من جهاز آخر أو إلغاء ربط هذا الجهاز. يُرجى تسجيل الدخول مجدداً.',
      type: 'warning'
    };
  }

  // 6. Generic internal server error
  if (str.includes('INTERNAL_SERVER_ERROR') || str.includes('حدث خطأ غير متوقع في الخادم')) {
    return {
      message: 'حدث تعذر مؤقت في الخادم. بياناتك محفوظة بأمان، يرجى إعادة المحاولة.',
      type: 'warning'
    };
  }

  return { message: str, type: 'info' };
}

export const ToastProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [modalAlert, setModalAlert] = useState<ModalAlertOptions | null>(null);

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const showToast = useCallback((message: string, type: ToastType = 'info', title?: string, duration: number = 4500) => {
    const sanitized = sanitizeUserFacingMessage(message);
    const resolvedMessage = sanitized.message;
    const resolvedType = type === 'info' && sanitized.type !== 'info' ? sanitized.type : type;

    const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const newToast: ToastItem = {
      id,
      message: resolvedMessage,
      type: resolvedType,
      title,
      duration
    };

    setToasts(prev => [...prev.slice(-4), newToast]); // Keep at most 5 visible toasts

    if (duration > 0) {
      setTimeout(() => {
        dismissToast(id);
      }, duration);
    }
  }, [dismissToast]);

  const showModalAlert = useCallback((options: ModalAlertOptions) => {
    const sanitized = sanitizeUserFacingMessage(options.message);
    setModalAlert({
      ...options,
      message: sanitized.message,
      type: options.type || sanitized.type
    });
  }, []);

  const closeModalAlert = useCallback(() => {
    if (modalAlert?.onConfirm) {
      try {
        modalAlert.onConfirm();
      } catch (_) {}
    }
    setModalAlert(null);
  }, [modalAlert]);

  // Intercept window.alert safely to prevent disruptive browser popups
  useEffect(() => {
    const originalAlert = window.alert;

    window.alert = (message?: any) => {
      const sanitized = sanitizeUserFacingMessage(message);
      showToast(sanitized.message, sanitized.type);
    };

    return () => {
      window.alert = originalAlert;
    };
  }, [showToast]);

  return (
    <ToastContext.Provider value={{ showToast, showModalAlert, dismissToast, closeModalAlert }}>
      {children}

      {/* Floating Toasts Container */}
      <div
        aria-live="polite"
        style={{
          position: 'fixed',
          bottom: '24px',
          left: '24px',
          zIndex: 99999,
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          maxWidth: '420px',
          width: 'calc(100% - 48px)',
          pointerEvents: 'none',
          direction: 'rtl',
          fontFamily: 'Cairo, system-ui, -apple-system, sans-serif'
        }}
      >
        {toasts.map(toast => {
          const isSuccess = toast.type === 'success';
          const isError = toast.type === 'error';
          const isWarning = toast.type === 'warning';

          const bgColor = isSuccess ? '#ecfdf5' : isError ? '#fef2f2' : isWarning ? '#fffbeb' : '#f0f9ff';
          const borderColor = isSuccess ? '#a7f3d0' : isError ? '#fecaca' : isWarning ? '#fde68a' : '#bae6fd';
          const textColor = isSuccess ? '#065f46' : isError ? '#991b1b' : isWarning ? '#92400e' : '#075985';
          const iconColor = isSuccess ? '#10b981' : isError ? '#ef4444' : isWarning ? '#f59e0b' : '#0284c7';

          return (
            <div
              key={toast.id}
              role="alert"
              style={{
                pointerEvents: 'auto',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px',
                backgroundColor: bgColor,
                border: `1px solid ${borderColor}`,
                borderRadius: '12px',
                padding: '12px 16px',
                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)',
                animation: 'slideIn 0.25s ease-out',
                transition: 'all 0.2s ease'
              }}
            >
              <div style={{ flexShrink: 0, marginTop: '2px', color: iconColor }}>
                {isSuccess && <CheckCircle2 size={20} />}
                {isError && <AlertCircle size={20} />}
                {isWarning && <AlertTriangle size={20} />}
                {!isSuccess && !isError && !isWarning && <Info size={20} />}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                {toast.title && (
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', color: textColor, marginBottom: '2px' }}>
                    {toast.title}
                  </div>
                )}
                <div style={{ fontSize: '0.875rem', lineHeight: 1.5, color: textColor, wordBreak: 'break-word' }}>
                  {toast.message}
                </div>
              </div>

              <button
                onClick={() => dismissToast(toast.id)}
                aria-label="إغلاق التنبيه"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: textColor,
                  opacity: 0.6,
                  cursor: 'pointer',
                  padding: '2px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '4px'
                }}
              >
                <X size={16} />
              </button>
            </div>
          );
        })}
      </div>

      {/* Non-blocking Modern Modal Alert */}
      {modalAlert && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 999999,
            backgroundColor: 'rgba(15, 23, 42, 0.45)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            direction: 'rtl',
            fontFamily: 'Cairo, system-ui, -apple-system, sans-serif'
          }}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '16px',
              maxWidth: '460px',
              width: '100%',
              padding: '1.75rem',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              textAlign: 'center',
              border: '1px solid #e2e8f0',
              animation: 'scaleIn 0.2s ease-out'
            }}
          >
            <div
              style={{
                width: '52px',
                height: '52px',
                borderRadius: '50%',
                backgroundColor: modalAlert.type === 'success' ? '#ecfdf5' : modalAlert.type === 'error' ? '#fef2f2' : '#fffbeb',
                color: modalAlert.type === 'success' ? '#10b981' : modalAlert.type === 'error' ? '#ef4444' : '#f59e0b',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 1rem'
              }}
            >
              {modalAlert.type === 'success' ? <CheckCircle2 size={28} /> : modalAlert.type === 'error' ? <AlertCircle size={28} /> : <Info size={28} />}
            </div>

            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#1e293b', marginBottom: '0.5rem' }}>
              {modalAlert.title || 'تنبيه النظام'}
            </h3>

            <p style={{ fontSize: '0.95rem', color: '#64748b', lineHeight: 1.6, marginBottom: '1.5rem' }}>
              {modalAlert.message}
            </p>

            <button
              onClick={closeModalAlert}
              style={{
                width: '100%',
                padding: '0.75rem 1.5rem',
                borderRadius: '10px',
                backgroundColor: '#2563eb',
                color: '#ffffff',
                fontWeight: 700,
                fontSize: '0.95rem',
                border: 'none',
                cursor: 'pointer',
                transition: 'background-color 0.2s ease'
              }}
            >
              {modalAlert.confirmText || 'موافق'}
            </button>
          </div>
        </div>
      )}
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    // Return safe fallbacks if accessed outside provider
    return {
      showToast: (message: string) => console.log('Toast:', message),
      showModalAlert: (opts: ModalAlertOptions) => console.log('ModalAlert:', opts),
      dismissToast: () => {},
      closeModalAlert: () => {}
    };
  }
  return context;
};
