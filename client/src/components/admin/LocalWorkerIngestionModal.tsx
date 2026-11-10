import React, { useState, useEffect, useRef } from 'react';
import {
  Laptop,
  CheckCircle2,
  AlertCircle,
  XCircle,
  RefreshCw,
  X,
  StopCircle,
  Play,
  ShieldCheck
} from 'lucide-react';

export type WorkerUiState =
  | 'IDLE'
  | 'CHECKING_WORKER'
  | 'WORKER_UNAVAILABLE'
  | 'WORKER_CONNECTED'
  | 'REQUESTING_SESSION'
  | 'SESSION_ISSUED'
  | 'STARTING_JOB'
  | 'PROCESSING'
  | 'SYNCHRONIZING'
  | 'PAUSED'
  | 'RECOVERABLE_FAILURE'
  | 'FATAL_FAILURE'
  | 'VALIDATION_FAILED'
  | 'VERIFIED_READY'
  | 'ACTIVATED';

interface LocalWorkerIngestionModalProps {
  isOpen: boolean;
  onClose: () => void;
  book: {
    id: string;
    title_ar: string;
    title_en?: string;
    academic_stage_id?: string;
    grade_id?: string;
    subject_id?: string;
    term?: number;
    school_type?: string;
    total_pages?: number;
    active_generation_id?: string;
  } | null;
  token: string;
  apiUrl: (path: string) => string;
  language: 'ar' | 'en';
  onSuccess?: () => void;
}

const LOCAL_WORKER_URL = 'http://127.0.0.1:5050';

/**
 * Modern Chromium Local Network Access (LNA) helper:
 * Attaches targetAddressSpace: 'loopback' for browser requests to 127.0.0.1.
 */
function createLoopbackFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const options: any = { ...init };
  options.targetAddressSpace = 'loopback';
  return fetch(input, options);
}

/**
 * Feature-detect and query modern Chromium Local Network Access permissions
 */
async function queryLnaPermission(): Promise<'granted' | 'prompt' | 'denied' | 'unsupported'> {
  if (typeof navigator === 'undefined' || !navigator.permissions || !navigator.permissions.query) {
    return 'unsupported';
  }
  try {
    const status = await (navigator.permissions.query as any)({ name: 'loopback-network' })
      .catch(() => (navigator.permissions.query as any)({ name: 'local-network-access' }));
    return status?.state || 'unsupported';
  } catch (_) {
    return 'unsupported';
  }
}

export const LocalWorkerIngestionModal: React.FC<LocalWorkerIngestionModalProps> = ({
  isOpen,
  onClose,
  book,
  token,
  apiUrl,
  language,
  onSuccess
}) => {
  const [uiState, setUiState] = useState<WorkerUiState>('CHECKING_WORKER');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [currentStage, setCurrentStage] = useState<string>('INITIALIZING');
  const [processedPages, setProcessedPages] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(book?.total_pages || 0);
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isRevoking, setIsRevoking] = useState<boolean>(false);

  const pollIntervalRef = useRef<any>(null);

  useEffect(() => {
    if (!isOpen || !book) {
      cleanupPolling();
      return;
    }

    setErrorMessage(null);
    setProcessedPages(0);
    setProgressPercent(0);
    setTotalPages(book.total_pages || 0);
    checkWorkerStatusAndAttach();

    return () => cleanupPolling();
  }, [isOpen, book?.id]);

  const cleanupPolling = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  };

  /**
   * 1. Check if Local Worker is Online at 127.0.0.1:5050
   */
  const checkWorkerStatusAndAttach = async () => {
    setUiState('CHECKING_WORKER');
    setStatusMessage(
      language === 'ar'
        ? 'جاري فحص اتصال مشغل المعالجة المحلي على الجهاز (127.0.0.1:5050)...'
        : 'Probing local ingestion worker at 127.0.0.1:5050...'
    );

    // Feature detect modern Chromium Local Network Access (LNA)
    const lnaState = await queryLnaPermission();
    if (lnaState === 'denied') {
      setUiState('WORKER_UNAVAILABLE');
      setStatusMessage(
        language === 'ar'
          ? 'تم حظر الوصول إلى الشبكة المحلية (127.0.0.1) بواسطة سياسة المتصفح. يرجى الضغط على أيقونة الإعدادات بجانب شريط العنوان والسماح بالوصول للأجهزة المحلية.'
          : 'Local Network Access blocked by browser policy. Click site settings in address bar and enable Local network access.'
      );
      return;
    }

    try {
      const res = await createLoopbackFetch(`${LOCAL_WORKER_URL}/api/worker/health`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });

      if (!res.ok) {
        throw new Error(`Worker responded with HTTP ${res.status}`);
      }

      const data = await res.json();
      if (data.status === 'ONLINE') {
        // Worker is online! Check if this book already has an active task
        await checkExistingTaskOrReady();
      } else {
        throw new Error('Worker status is not ONLINE');
      }
    } catch (_) {
      setUiState('WORKER_UNAVAILABLE');
      setStatusMessage(
        language === 'ar'
          ? 'مشغل المعالجة المحلي غير متصل أو لم يتم تشغيله على هذا الجهاز.'
          : 'Local Ingestion Worker is not reachable on this computer.'
      );
    }
  };

  /**
   * Check if there's already a running task on the worker for this book
   */
  const checkExistingTaskOrReady = async () => {
    if (!book) return;

    try {
      const res = await createLoopbackFetch(`${LOCAL_WORKER_URL}/api/worker/tasks/by-book/${book.id}`, {
        headers: { 'Accept': 'application/json' }
      });

      if (res.ok) {
        const taskData = await res.json();
        if (taskData && taskData.jobId) {
          setActiveJobId(taskData.jobId);
          if (taskData.status === 'IN_PROGRESS' || taskData.status === 'PROCESSING') {
            setUiState('PROCESSING');
            startPollingTask(taskData.jobId);
            return;
          } else if (taskData.status === 'COMPLETED' || taskData.status === 'VERIFIED_READY') {
            setUiState('VERIFIED_READY');
            setProgressPercent(100);
            return;
          }
        }
      }
    } catch (_) {}

    setUiState('WORKER_CONNECTED');
    setStatusMessage(
      language === 'ar'
        ? 'مشغل المعالجة المحلي متصل وجاهز لبدء المعالجة المعتمدة.'
        : 'Local worker connected and ready for authorized textbook ingestion.'
    );
  };

  /**
   * 2. Request Session from Central Backend & Dispatch to Local Worker
   */
  const handleStartProcessing = async () => {
    if (!book) return;

    setErrorMessage(null);
    setUiState('REQUESTING_SESSION');
    setStatusMessage(
      language === 'ar'
        ? 'جاري إصدار جلسة معالجة مشفرة ومقيدة من السحابة المركزية...'
        : 'Requesting cryptographically scoped worker session from cloud...'
    );

    let sessionData: any = null;

    try {
      // Step A: Request session token from Cloud Backend
      const sessRes = await fetch(apiUrl(`/api/admin/books/${book.id}/worker-session`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          totalPages: book.total_pages || 0
        })
      });

      if (!sessRes.ok) {
        const errJson = await sessRes.json().catch(() => ({}));
        throw new Error(errJson.error || 'Failed to issue worker session');
      }

      sessionData = await sessRes.json();
      setUiState('SESSION_ISSUED');
      setStatusMessage(
        language === 'ar'
          ? 'تم إصدار الجلسة بنجاح. جاري بدء معالجة الكتاب على المعالج المحلي...'
          : 'Session issued. Dispatching task to local machine...'
      );
    } catch (sessErr: any) {
      setUiState('FATAL_FAILURE');
      setErrorMessage(
        language === 'ar'
          ? `فشل إصدار جلسة المعالجة: ${sessErr.message}`
          : `Session issuance failed: ${sessErr.message}`
      );
      return;
    }

    try {
      setUiState('STARTING_JOB');
      // Step B: Send scoped session to Local Worker at 127.0.0.1:5050
      // Uses the minted RS256 token in Authorization header
      const startRes = await createLoopbackFetch(`${LOCAL_WORKER_URL}/api/worker/session/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionData.workerAuthToken}`,
          'Origin': window.location.origin
        },
        body: JSON.stringify({
          bookId: book.id,
          jobId: sessionData.jobId,
          sessionToken: sessionData.sessionToken,
          generationId: sessionData.generationId,
          gatewayBaseUrl: window.location.origin,
          titleAr: book.title_ar,
          titleEn: book.title_en,
          academicStageId: book.academic_stage_id,
          gradeId: book.grade_id,
          subjectId: book.subject_id,
          term: book.term,
          schoolType: book.school_type
        })
      });

      if (!startRes.ok) {
        const workerErr = await startRes.json().catch(() => ({}));
        throw new Error(workerErr.error || 'Local worker rejected session initiation');
      }

      const startedData = await startRes.json();
      setActiveJobId(startedData.jobId || sessionData.jobId);
      setUiState('PROCESSING');
      setStatusMessage(
        language === 'ar'
          ? 'بدأت المعالجة المحلية: جاري استخراج النصوص والصور وتوليد المتجهات...'
          : 'Local processing active: extracting pages and generating embeddings...'
      );

      // Start live status polling
      startPollingTask(startedData.jobId || sessionData.jobId);
    } catch (workerErr: any) {
      setUiState('FATAL_FAILURE');
      setErrorMessage(
        language === 'ar'
          ? `فشل تشغيل المعالجة على الجهاز المحلي: ${workerErr.message}`
          : `Failed to launch task on local worker: ${workerErr.message}`
      );
    }
  };

  /**
   * 3. Live Polling of Local Worker & Cloud Gateway Progress
   */
  const startPollingTask = (jobId: string) => {
    cleanupPolling();

    pollIntervalRef.current = setInterval(async () => {
      try {
        const res = await createLoopbackFetch(`${LOCAL_WORKER_URL}/api/worker/tasks/${jobId}`, {
          headers: { 'Accept': 'application/json' }
        });

        if (!res.ok) {
          // Worker might be momentarily busy or restarting
          return;
        }

        const task = await res.json();
        if (!task) return;

        setCurrentStage(task.currentStage || 'PROCESSING');
        if (typeof task.processedPages === 'number') setProcessedPages(task.processedPages);
        if (typeof task.totalPages === 'number' && task.totalPages > 0) setTotalPages(task.totalPages);
        if (typeof task.progress === 'number') setProgressPercent(task.progress);

        if (task.status === 'COMPLETED' || task.status === 'VERIFIED_READY') {
          cleanupPolling();
          setUiState('VERIFIED_READY');
          setProgressPercent(100);
          setStatusMessage(
            language === 'ar'
              ? 'اكتملت المعالجة والفهرسة المحلية بنجاح! تم اعتماد وتفعيل الكتاب رسمياً.'
              : 'Local ingestion and verification complete! Textbook verified and activated.'
          );
          if (onSuccess) onSuccess();
        } else if (task.status === 'FAILED') {
          cleanupPolling();
          setUiState('FATAL_FAILURE');
          setErrorMessage(task.lastError || (language === 'ar' ? 'فشلت معالجة الكتاب محلياً.' : 'Local ingestion failed.'));
        } else if (task.status === 'REQUIRES_REMEDIATION') {
          cleanupPolling();
          setUiState('VALIDATION_FAILED');
          setErrorMessage(task.lastError || (language === 'ar' ? 'فحص الجاهزية تطلب مراجعة المحتوى.' : 'Readiness validation required remediation.'));
        } else if (task.status === 'PAUSED') {
          setUiState('PAUSED');
        } else {
          setUiState(task.currentStage?.includes('SYNC') || task.currentStage?.includes('UPLOAD') ? 'SYNCHRONIZING' : 'PROCESSING');
        }
      } catch (_) {
        // Transient network blip on localhost
      }
    }, 1500);
  };

  /**
   * 4. Cancel & Revoke Active Worker Session
   */
  const handleRevokeSession = async () => {
    if (!book) return;
    setIsRevoking(true);

    try {
      // Revoke server-side
      await fetch(apiUrl(`/api/admin/books/${book.id}/worker-session/revoke`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      // Cancel locally on worker
      if (activeJobId) {
        await createLoopbackFetch(`${LOCAL_WORKER_URL}/api/worker/tasks/${activeJobId}/cancel`, {
          method: 'POST',
          headers: { 'Accept': 'application/json' }
        }).catch(() => {});
      }

      cleanupPolling();
      setUiState('PAUSED');
      setStatusMessage(
        language === 'ar'
          ? 'تم إلغاء وإبطال جلسة المعالجة بنجاح. توقفت جميع عمليات المزامنة.'
          : 'Worker session revoked. Processing and synchronization stopped.'
      );
    } catch (err: any) {
      setErrorMessage(language === 'ar' ? `فشل إلغاء الجلسة: ${err.message}` : `Revocation failed: ${err.message}`);
    } finally {
      setIsRevoking(false);
    }
  };

  if (!isOpen || !book) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '1rem'
      }}
    >
      <div
        style={{
          background: '#FFFFFF',
          borderRadius: '1rem',
          width: '100%',
          maxWidth: '640px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
            color: '#FFFFFF',
            padding: '1.25rem 1.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '0.5rem',
                background: 'linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Laptop size={20} color="#FFFFFF" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#FFFFFF' }}>
                {language === 'ar' ? 'معالجة الكتاب على الجهاز المحلي' : 'Process on Local Machine'}
              </h3>
              <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.8rem', color: '#94A3B8' }}>
                {book.title_ar} • {language === 'ar' ? 'تشغيل آمن بدون استهلاك سحابي' : 'Zero Vercel Compute Ingestion'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94A3B8',
              cursor: 'pointer',
              padding: '0.25rem',
              borderRadius: '0.375rem'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Status Badge & Indicator */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0.85rem 1rem',
              borderRadius: '0.75rem',
              background:
                uiState === 'VERIFIED_READY' || uiState === 'ACTIVATED'
                  ? '#ECFDF5'
                  : uiState === 'WORKER_UNAVAILABLE' || uiState === 'FATAL_FAILURE' || uiState === 'VALIDATION_FAILED'
                  ? '#FEF2F2'
                  : uiState === 'PROCESSING' || uiState === 'SYNCHRONIZING'
                  ? '#EFF6FF'
                  : '#F8FAFC',
              border: `1px solid ${
                uiState === 'VERIFIED_READY' || uiState === 'ACTIVATED'
                  ? '#A7F3D0'
                  : uiState === 'WORKER_UNAVAILABLE' || uiState === 'FATAL_FAILURE' || uiState === 'VALIDATION_FAILED'
                  ? '#FECACA'
                  : uiState === 'PROCESSING' || uiState === 'SYNCHRONIZING'
                  ? '#BFDBFE'
                  : '#E2E8F0'
              }`
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              {uiState === 'VERIFIED_READY' || uiState === 'ACTIVATED' ? (
                <CheckCircle2 size={20} color="#059669" />
              ) : uiState === 'WORKER_UNAVAILABLE' || uiState === 'FATAL_FAILURE' || uiState === 'VALIDATION_FAILED' ? (
                <XCircle size={20} color="#DC2626" />
              ) : uiState === 'PROCESSING' || uiState === 'SYNCHRONIZING' || uiState === 'REQUESTING_SESSION' || uiState === 'CHECKING_WORKER' ? (
                <RefreshCw size={20} color="#2563EB" className="animate-spin" />
              ) : (
                <ShieldCheck size={20} color="#0284C7" />
              )}
              <span
                style={{
                  fontWeight: 800,
                  fontSize: '0.875rem',
                  color:
                    uiState === 'VERIFIED_READY' || uiState === 'ACTIVATED'
                      ? '#065F46'
                      : uiState === 'WORKER_UNAVAILABLE' || uiState === 'FATAL_FAILURE' || uiState === 'VALIDATION_FAILED'
                      ? '#991B1B'
                      : uiState === 'PROCESSING' || uiState === 'SYNCHRONIZING'
                      ? '#1E40AF'
                      : '#334155'
                }}
              >
                {uiState === 'CHECKING_WORKER' && (language === 'ar' ? 'فحص الاتصال...' : 'Checking worker...')}
                {uiState === 'WORKER_UNAVAILABLE' && (language === 'ar' ? 'المشغل المحلي غير متصل' : 'Worker Unavailable')}
                {uiState === 'WORKER_CONNECTED' && (language === 'ar' ? 'المشغل المحلي جاهز' : 'Worker Connected & Ready')}
                {uiState === 'REQUESTING_SESSION' && (language === 'ar' ? 'طلب جلسة مؤمنة...' : 'Issuing Session...')}
                {uiState === 'SESSION_ISSUED' && (language === 'ar' ? 'تم اعتماد الجلسة' : 'Session Issued')}
                {uiState === 'STARTING_JOB' && (language === 'ar' ? 'بدء تشغيل المهمة...' : 'Starting Task...')}
                {uiState === 'PROCESSING' && (language === 'ar' ? `جاري المعالجة محلياً (${currentStage})` : `Processing Locally (${currentStage})`)}
                {uiState === 'SYNCHRONIZING' && (language === 'ar' ? 'مزامنة النتائج مع السحابة...' : 'Synchronizing with Gateway...')}
                {uiState === 'PAUSED' && (language === 'ar' ? 'تم إيقاف المعالجة' : 'Paused / Cancelled')}
                {uiState === 'FATAL_FAILURE' && (language === 'ar' ? 'فشلت المعالجة' : 'Failed')}
                {uiState === 'VALIDATION_FAILED' && (language === 'ar' ? 'فشل فحص الجاهزية' : 'Validation Failed')}
                {(uiState === 'VERIFIED_READY' || uiState === 'ACTIVATED') && (language === 'ar' ? 'جاهز ومعتمد رسمياً ✓' : 'VERIFIED_READY ✓')}
              </span>
            </div>

            {/* Stage Counter */}
            {(uiState === 'PROCESSING' || uiState === 'SYNCHRONIZING') && (
              <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#1E40AF', background: '#DBEAFE', padding: '0.2rem 0.6rem', borderRadius: '0.375rem' }}>
                {processedPages} / {totalPages > 0 ? totalPages : '...'} {language === 'ar' ? 'صفحة' : 'pages'}
              </span>
            )}
          </div>

          {/* Progress Bar (when active or complete) */}
          {(uiState === 'PROCESSING' || uiState === 'SYNCHRONIZING' || uiState === 'VERIFIED_READY') && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.4rem', color: '#64748B' }}>
                <span>{language === 'ar' ? 'نسبة الإنجاز المباشرة:' : 'Live Completion Progress:'}</span>
                <span style={{ color: '#0F172A', fontWeight: 800 }}>{progressPercent}%</span>
              </div>
              <div style={{ width: '100%', height: '10px', background: '#E2E8F0', borderRadius: '999px', overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${progressPercent}%`,
                    height: '100%',
                    background: uiState === 'VERIFIED_READY' ? 'linear-gradient(90deg, #059669, #10B981)' : 'linear-gradient(90deg, #2563EB, #3B82F6)',
                    transition: 'width 0.4s ease'
                  }}
                />
              </div>
            </div>
          )}

          {/* Explanatory Message / Status Details */}
          {statusMessage && (
            <div style={{ fontSize: '0.85rem', color: '#475569', lineHeight: 1.5, background: '#F8FAFC', padding: '0.75rem 1rem', borderRadius: '0.5rem', border: '1px solid #E2E8F0' }}>
              {statusMessage}
            </div>
          )}

          {/* Actionable Error Card for WORKER_UNAVAILABLE */}
          {uiState === 'WORKER_UNAVAILABLE' && (
            <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', padding: '1rem', borderRadius: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#B45309', fontWeight: 800, fontSize: '0.875rem' }}>
                <AlertCircle size={18} />
                <span>{language === 'ar' ? 'كيفية تشغيل مشغل المعالجة المحلي على حاسوبك:' : 'How to start the Local Ingestion Worker:'}</span>
              </div>
              <ol style={{ margin: 0, paddingInlineStart: '1.25rem', fontSize: '0.8rem', color: '#92400E', lineHeight: 1.6 }}>
                <li>{language === 'ar' ? 'افتح موجه الأوامر (PowerShell / Terminal) على جهازك.' : 'Open PowerShell or Terminal on this Windows computer.'}</li>
                <li>{language === 'ar' ? 'انتقل إلى مجلد: tools/local-ingestion-worker' : 'Navigate to: tools/local-ingestion-worker'}</li>
                <li>
                  {language === 'ar' ? 'قم بتشغيل الأمر التالي: ' : 'Execute command: '}
                  <code style={{ background: '#FEF3C7', padding: '0.15rem 0.4rem', borderRadius: '0.25rem', fontWeight: 700 }}>npm run worker</code>
                </li>
                <li>{language === 'ar' ? 'بعد ظهور رسالة "ACTIVE", اضغط على زر "إعادة فحص الاتصال" أدناه.' : 'After "ACTIVE" appears, click "Retry Connection" below.'}</li>
              </ol>
            </div>
          )}

          {/* Error Alert */}
          {errorMessage && (
            <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', padding: '0.75rem 1rem', borderRadius: '0.5rem', color: '#991B1B', fontSize: '0.825rem', display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
              <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '0.15rem' }} />
              <div>{errorMessage}</div>
            </div>
          )}
        </div>

        {/* Modal Footer Actions */}
        <div
          style={{
            background: '#F8FAFC',
            borderTop: '1px solid #E2E8F0',
            padding: '1rem 1.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.75rem'
          }}
        >
          {/* Left action (Cancel/Revoke or Close) */}
          {(uiState === 'PROCESSING' || uiState === 'SYNCHRONIZING') ? (
            <button
              type="button"
              disabled={isRevoking}
              onClick={handleRevokeSession}
              style={{
                background: '#FEE2E2',
                color: '#DC2626',
                border: '1px solid #FCA5A5',
                padding: '0.5rem 1rem',
                borderRadius: '0.5rem',
                fontSize: '0.85rem',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem'
              }}
            >
              <StopCircle size={16} />
              <span>{isRevoking ? (language === 'ar' ? 'جاري الإلغاء...' : 'Revoking...') : (language === 'ar' ? 'إلغاء وإبطال الجلسة' : 'Revoke Session')}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              style={{
                background: '#FFFFFF',
                color: '#64748B',
                border: '1px solid #CBD5E1',
                padding: '0.5rem 1.1rem',
                borderRadius: '0.5rem',
                fontSize: '0.85rem',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              {language === 'ar' ? 'إغلاق' : 'Close'}
            </button>
          )}

          {/* Right Action */}
          {uiState === 'WORKER_UNAVAILABLE' && (
            <button
              type="button"
              onClick={checkWorkerStatusAndAttach}
              style={{
                background: '#2563EB',
                color: '#FFFFFF',
                border: 'none',
                padding: '0.55rem 1.25rem',
                borderRadius: '0.5rem',
                fontSize: '0.875rem',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}
            >
              <RefreshCw size={16} />
              <span>{language === 'ar' ? 'إعادة فحص الاتصال' : 'Retry Connection'}</span>
            </button>
          )}

          {uiState === 'WORKER_CONNECTED' && (
            <button
              type="button"
              onClick={handleStartProcessing}
              style={{
                background: 'linear-gradient(135deg, #1D4ED8 0%, #2563EB 100%)',
                color: '#FFFFFF',
                border: 'none',
                padding: '0.6rem 1.35rem',
                borderRadius: '0.5rem',
                fontSize: '0.875rem',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)'
              }}
            >
              <Play size={16} />
              <span>{language === 'ar' ? 'بدء المعالجة على هذا الجهاز' : 'Start Processing on This PC'}</span>
            </button>
          )}

          {(uiState === 'VERIFIED_READY' || uiState === 'ACTIVATED') && (
            <button
              type="button"
              onClick={onClose}
              style={{
                background: '#059669',
                color: '#FFFFFF',
                border: 'none',
                padding: '0.6rem 1.35rem',
                borderRadius: '0.5rem',
                fontSize: '0.875rem',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem'
              }}
            >
              <CheckCircle2 size={16} />
              <span>{language === 'ar' ? 'تم بنجاح (إغلاق)' : 'Done (Close)'}</span>
            </button>
          )}

          {(uiState === 'FATAL_FAILURE' || uiState === 'VALIDATION_FAILED' || uiState === 'PAUSED') && (
            <button
              type="button"
              onClick={handleStartProcessing}
              style={{
                background: '#4F46E5',
                color: '#FFFFFF',
                border: 'none',
                padding: '0.55rem 1.25rem',
                borderRadius: '0.5rem',
                fontSize: '0.875rem',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem'
              }}
            >
              <RefreshCw size={15} />
              <span>{language === 'ar' ? 'إعادة المحاولة' : 'Retry Processing'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
