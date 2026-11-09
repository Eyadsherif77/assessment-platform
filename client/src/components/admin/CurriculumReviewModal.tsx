import React, { useState, useEffect } from 'react';
import {
  X,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw
} from 'lucide-react';

interface CurriculumReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  book: any | null;
  token: string;
  apiUrl: (endpoint: string) => string;
  language: 'ar' | 'en';
  onSuccess?: () => void;
}

export const CurriculumReviewModal: React.FC<CurriculumReviewModalProps> = ({
  isOpen,
  onClose,
  book,
  token,
  apiUrl,
  language,
  onSuccess
}) => {
  const isAr = language === 'ar';
  const [chapters, setChapters] = useState<any[]>([]);
  const [loadingChapters, setLoadingChapters] = useState<boolean>(false);
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);
  const [unitDetails, setUnitDetails] = useState<any | null>(null);
  const [loadingDetails, setLoadingDetails] = useState<boolean>(false);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Rejection / Revocation prompt modal state
  const [promptAction, setPromptAction] = useState<'REJECT' | 'REVOKE' | null>(null);
  const [promptReason, setPromptReason] = useState<string>('');

  // Confirmation state for approve
  const [confirmApprove, setConfirmApprove] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen && book) {
      fetchChapters();
      setSelectedChapterId(null);
      setUnitDetails(null);
      setErrorMessage(null);
      setSuccessMessage(null);
    }
  }, [isOpen, book]);

  const fetchChapters = async () => {
    if (!book) return;
    setLoadingChapters(true);
    setErrorMessage(null);
    try {
      const res = await fetch(apiUrl(`/api/books/${book.id}/chapters`), {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (Array.isArray(data)) {
        setChapters(data);
        if (data.length > 0) {
          fetchUnitDetails(data[0].id);
        }
      }
    } catch (err: any) {
      setErrorMessage(isAr ? 'فشل جلب وحدات الكتاب: ' + err.message : 'Failed to fetch chapters');
    } finally {
      setLoadingChapters(false);
    }
  };

  const fetchUnitDetails = async (chapterId: string) => {
    setSelectedChapterId(chapterId);
    setLoadingDetails(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const res = await fetch(apiUrl(`/api/admin/curriculum/units/${chapterId}/review`), {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setUnitDetails(data);
      } else {
        setErrorMessage(data.error || (isAr ? 'تعذر جلب تفاصيل مراجعة الوحدة' : 'Failed to fetch unit details'));
      }
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleApprove = async () => {
    if (!book || !selectedChapterId) return;
    setActionLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const res = await fetch(apiUrl(`/api/admin/curriculum/units/${selectedChapterId}/approve`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ book_id: book.id })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || (isAr ? 'فشل اعتماد الوحدة' : 'Approval failed'));
      }
      setSuccessMessage(isAr ? 'تم اعتماد الوحدة بنجاح! أصبحت جاهزة لتوليد الاختبارات بالذكاء الاصطناعي.' : 'Unit successfully approved for AI exams!');
      setConfirmApprove(false);
      await fetchUnitDetails(selectedChapterId);
      if (onSuccess) onSuccess();
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectOrRevoke = async () => {
    if (!book || !selectedChapterId || !promptAction) return;
    if (!promptReason.trim()) {
      setErrorMessage(isAr ? 'الرجاء إدخال سبب العملية' : 'Please provide a reason');
      return;
    }
    setActionLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const endpoint = promptAction === 'REJECT'
      ? `/api/admin/curriculum/units/${selectedChapterId}/reject`
      : `/api/admin/curriculum/units/${selectedChapterId}/revoke`;

    try {
      const res = await fetch(apiUrl(endpoint), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ book_id: book.id, reason: promptReason })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || (isAr ? 'فشلت العملية' : 'Action failed'));
      }
      setSuccessMessage(
        promptAction === 'REJECT'
          ? (isAr ? 'تم تسجيل رفض الوحدة مع السبب المحدد.' : 'Unit rejected.')
          : (isAr ? 'تم سحب اعتماد الوحدة بنجاح وحظرها من الامتحانات.' : 'Approval revoked.')
      );
      setPromptAction(null);
      setPromptReason('');
      await fetchUnitDetails(selectedChapterId);
      if (onSuccess) onSuccess();
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  if (!isOpen || !book) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.75)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '1rem'
    }}>
      <div style={{
        backgroundColor: '#FFFFFF',
        borderRadius: '1rem',
        width: '100%',
        maxWidth: '1050px',
        maxHeight: '92vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        overflow: 'hidden',
        direction: isAr ? 'rtl' : 'ltr'
      }}>
        {/* Header */}
        <div style={{
          padding: '1.25rem 1.75rem',
          background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
          color: '#FFFFFF',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid #334155'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{
              background: '#059669',
              borderRadius: '0.5rem',
              width: '2.5rem',
              height: '2.5rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <ShieldCheck size={22} color="#FFFFFF" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>
                {isAr ? 'مراجعة وتدقيق المنهج والاعتماد التربوي' : 'Curriculum Review & Academic Approval'}
              </h3>
              <p style={{ margin: 0, fontSize: '0.8rem', color: '#94A3B8' }}>
                {book.title_ar} • {book.grade_name_ar || ''} • {book.subject_name_ar || ''} • جيل المعالجة: <code style={{ color: '#38BDF8' }}>{book.active_generation_id || 'v1'}</code>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94A3B8',
              cursor: 'pointer',
              padding: '0.5rem',
              borderRadius: '0.375rem'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Alerts */}
        {errorMessage && (
          <div style={{
            margin: '0.75rem 1.5rem 0',
            padding: '0.75rem 1rem',
            background: '#FEF2F2',
            border: '1px solid #FCA5A5',
            borderRadius: '0.5rem',
            color: '#991B1B',
            fontSize: '0.85rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            <XCircle size={18} style={{ flexShrink: 0 }} />
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div style={{
            margin: '0.75rem 1.5rem 0',
            padding: '0.75rem 1rem',
            background: '#ECFDF5',
            border: '1px solid #A7F3D0',
            borderRadius: '0.5rem',
            color: '#065F46',
            fontSize: '0.85rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            <CheckCircle2 size={18} style={{ flexShrink: 0 }} />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Content Body: Sidebar Chapters + Main Review Screen */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '280px 1fr',
          flex: 1,
          overflow: 'hidden',
          minHeight: '450px'
        }}>
          {/* Sidebar: Chapters list */}
          <div style={{
            borderLeft: isAr ? '1px solid #E2E8F0' : 'none',
            borderRight: !isAr ? '1px solid #E2E8F0' : 'none',
            background: '#F8FAFC',
            overflowY: 'auto',
            padding: '1rem'
          }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#64748B', marginBottom: '0.75rem' }}>
              {isAr ? `فصول ووحدات الكتاب (${chapters.length})` : `Curriculum Units (${chapters.length})`}
            </div>

            {loadingChapters ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#94A3B8', fontSize: '0.85rem' }}>
                <RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto 0.5rem' }} />
                {isAr ? 'جاري التحميل...' : 'Loading...'}
              </div>
            ) : chapters.length === 0 ? (
              <div style={{ fontSize: '0.8rem', color: '#94A3B8', textAlign: 'center', padding: '1rem' }}>
                {isAr ? 'لا توجد وحدات مستخرجة' : 'No units extracted'}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {chapters.map((ch: any) => {
                  const isSelected = ch.id === selectedChapterId;
                  return (
                    <button
                      key={ch.id}
                      onClick={() => fetchUnitDetails(ch.id)}
                      style={{
                        textAlign: isAr ? 'right' : 'left',
                        padding: '0.75rem',
                        borderRadius: '0.5rem',
                        border: isSelected ? '1.5px solid #059669' : '1px solid #E2E8F0',
                        background: isSelected ? '#FFFFFF' : '#FFFFFF',
                        boxShadow: isSelected ? '0 2px 8px rgba(5, 150, 105, 0.15)' : 'none',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div style={{ fontSize: '0.85rem', fontWeight: 800, color: isSelected ? '#059669' : '#1E293B', marginBottom: '0.2rem' }}>
                        {ch.title_ar}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#64748B' }}>
                        {isAr ? `الصفحات: ${ch.start_page} إلى ${ch.end_page}` : `Pages: ${ch.start_page}-${ch.end_page}`}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Main Inspection & Action Panel */}
          <div style={{
            overflowY: 'auto',
            padding: '1.5rem',
            background: '#FFFFFF',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.25rem'
          }}>
            {loadingDetails ? (
              <div style={{ textAlign: 'center', padding: '4rem', color: '#94A3B8' }}>
                <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 0.75rem' }} />
                <p>{isAr ? 'جاري فحص الجاهزية وسلامة المقاطع والنصوص...' : 'Inspecting readiness and provenance...'}</p>
              </div>
            ) : !unitDetails ? (
              <div style={{ textAlign: 'center', padding: '4rem', color: '#94A3B8' }}>
                <p>{isAr ? 'اختر وحدة من القائمة لمراجعة تفاصيلها واعتمادها' : 'Select a unit to inspect'}</p>
              </div>
            ) : (
              <>
                {/* Status Bar */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: '#F1F5F9',
                  padding: '1rem 1.25rem',
                  borderRadius: '0.75rem',
                  border: '1px solid #E2E8F0'
                }}>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 700 }}>
                      {isAr ? 'حالة الاعتماد التربوي الحالية:' : 'Current Approval Status:'}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
                      {unitDetails.approval.status === 'APPROVED' ? (
                        <span style={{
                          background: '#ECFDF5',
                          color: '#065F46',
                          border: '1px solid #A7F3D0',
                          padding: '0.25rem 0.65rem',
                          borderRadius: '0.375rem',
                          fontSize: '0.85rem',
                          fontWeight: 800
                        }}>
                          ✓ {isAr ? 'معتمدة رسمياً للاختبارات بالذكاء الاصطناعي' : 'APPROVED for AI Exam Generation'}
                        </span>
                      ) : unitDetails.approval.status === 'REJECTED' ? (
                        <span style={{
                          background: '#FEF2F2',
                          color: '#991B1B',
                          border: '1px solid #FCA5A5',
                          padding: '0.25rem 0.65rem',
                          borderRadius: '0.375rem',
                          fontSize: '0.85rem',
                          fontWeight: 800
                        }}>
                          ✕ {isAr ? 'مرفوضة من الإدارة التعليمية' : 'REJECTED'}
                        </span>
                      ) : unitDetails.approval.status === 'REVOKED' ? (
                        <span style={{
                          background: '#FFFBEB',
                          color: '#92400E',
                          border: '1px solid #FDE68A',
                          padding: '0.25rem 0.65rem',
                          borderRadius: '0.375rem',
                          fontSize: '0.85rem',
                          fontWeight: 800
                        }}>
                          ⚠ {isAr ? 'مسحوب الاعتماد' : 'APPROVAL REVOKED'}
                        </span>
                      ) : (
                        <span style={{
                          background: '#F8FAFC',
                          color: '#475569',
                          border: '1px solid #CBD5E1',
                          padding: '0.25rem 0.65rem',
                          borderRadius: '0.375rem',
                          fontSize: '0.85rem',
                          fontWeight: 800
                        }}>
                          ⏳ {isAr ? 'قيد المراجعة والتدقيق (غير معتمدة)' : 'NOT AUDITED (Pending Review)'}
                        </span>
                      )}

                      {unitDetails.approval.approved_at && (
                        <span style={{ fontSize: '0.75rem', color: '#64748B' }}>
                          ({new Date(unitDetails.approval.approved_at).toLocaleString(isAr ? 'ar-EG' : 'en-US')})
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {unitDetails.approval.status !== 'APPROVED' ? (
                      <button
                        type="button"
                        onClick={() => setConfirmApprove(true)}
                        disabled={actionLoading || !unitDetails.readiness.isReadyForApproval}
                        style={{
                          background: unitDetails.readiness.isReadyForApproval ? '#059669' : '#94A3B8',
                          color: '#FFFFFF',
                          border: 'none',
                          padding: '0.5rem 1rem',
                          borderRadius: '0.5rem',
                          fontSize: '0.85rem',
                          fontWeight: 800,
                          cursor: unitDetails.readiness.isReadyForApproval ? 'pointer' : 'not-allowed',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.4rem'
                        }}
                      >
                        <ShieldCheck size={16} />
                        <span>{isAr ? 'اعتماد الوحدة رسمياً' : 'Approve Unit'}</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setPromptAction('REVOKE');
                          setPromptReason('');
                        }}
                        disabled={actionLoading}
                        style={{
                          background: '#DC2626',
                          color: '#FFFFFF',
                          border: 'none',
                          padding: '0.5rem 1rem',
                          borderRadius: '0.5rem',
                          fontSize: '0.85rem',
                          fontWeight: 800,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.4rem'
                        }}
                      >
                        <AlertTriangle size={16} />
                        <span>{isAr ? 'سحب الاعتماد' : 'Revoke Approval'}</span>
                      </button>
                    )}

                    {unitDetails.approval.status !== 'REJECTED' && (
                      <button
                        type="button"
                        onClick={() => {
                          setPromptAction('REJECT');
                          setPromptReason('');
                        }}
                        disabled={actionLoading}
                        style={{
                          background: '#FFFFFF',
                          color: '#DC2626',
                          border: '1px solid #FCA5A5',
                          padding: '0.5rem 1rem',
                          borderRadius: '0.5rem',
                          fontSize: '0.85rem',
                          fontWeight: 800,
                          cursor: 'pointer'
                        }}
                      >
                        {isAr ? 'رفض' : 'Reject'}
                      </button>
                    )}
                  </div>
                </div>

                {/* Rejection / Revocation Reason display if applicable */}
                {unitDetails.approval.rejection_reason && (
                  <div style={{
                    padding: '0.75rem 1rem',
                    background: '#FEF2F2',
                    borderRadius: '0.5rem',
                    border: '1px solid #FCA5A5',
                    fontSize: '0.85rem',
                    color: '#991B1B'
                  }}>
                    <strong>{isAr ? 'سبب الرفض: ' : 'Rejection Reason: '}</strong>
                    {unitDetails.approval.rejection_reason}
                  </div>
                )}
                {unitDetails.approval.revocation_reason && (
                  <div style={{
                    padding: '0.75rem 1rem',
                    background: '#FFFBEB',
                    borderRadius: '0.5rem',
                    border: '1px solid #FDE68A',
                    fontSize: '0.85rem',
                    color: '#92400E'
                  }}>
                    <strong>{isAr ? 'سبب سحب الاعتماد: ' : 'Revocation Reason: '}</strong>
                    {unitDetails.approval.revocation_reason}
                  </div>
                )}

                {/* Audit Grid */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: '0.75rem'
                }}>
                  <div style={{ padding: '0.75rem', background: '#F8FAFC', borderRadius: '0.5rem', border: '1px solid #E2E8F0' }}>
                    <div style={{ fontSize: '0.75rem', color: '#64748B' }}>{isAr ? 'نطاق الصفحات' : 'Page Range'}</div>
                    <div style={{ fontSize: '1rem', fontWeight: 800, color: '#1E293B', marginTop: '0.2rem' }}>
                      {unitDetails.unit.start_page} — {unitDetails.unit.end_page} ({unitDetails.unit.end_page - unitDetails.unit.start_page + 1} {isAr ? 'صفحة' : 'pages'})
                    </div>
                  </div>

                  <div style={{ padding: '0.75rem', background: '#F8FAFC', borderRadius: '0.5rem', border: '1px solid #E2E8F0' }}>
                    <div style={{ fontSize: '0.75rem', color: '#64748B' }}>{isAr ? 'المقاطع المستخرجة' : 'Text Chunks'}</div>
                    <div style={{ fontSize: '1rem', fontWeight: 800, color: '#1E293B', marginTop: '0.2rem' }}>
                      {unitDetails.coverage.total_chunks} {isAr ? 'مقطع' : 'chunks'} ({unitDetails.coverage.total_chars} {isAr ? 'حرف' : 'chars'})
                    </div>
                  </div>

                  <div style={{ padding: '0.75rem', background: '#F8FAFC', borderRadius: '0.5rem', border: '1px solid #E2E8F0' }}>
                    <div style={{ fontSize: '0.75rem', color: '#64748B' }}>{isAr ? 'التضمينات الدلالية' : 'Vector Embeddings'}</div>
                    <div style={{ fontSize: '1rem', fontWeight: 800, color: '#1E293B', marginTop: '0.2rem' }}>
                      {unitDetails.coverage.embedded_chunks} / {unitDetails.coverage.total_chunks}
                    </div>
                  </div>

                  <div style={{ padding: '0.75rem', background: '#F8FAFC', borderRadius: '0.5rem', border: '1px solid #E2E8F0' }}>
                    <div style={{ fontSize: '0.75rem', color: '#64748B' }}>{isAr ? 'الأصول البصرية' : 'Visual Assets'}</div>
                    <div style={{ fontSize: '1rem', fontWeight: 800, color: '#1E293B', marginTop: '0.2rem' }}>
                      {unitDetails.visualDependencies.type === 'NONE'
                        ? (isAr ? 'غير مطلوبة (مقرر نصي)' : 'None required')
                        : `${unitDetails.visualDependencies.assetCount} (${unitDetails.visualDependencies.type})`}
                    </div>
                  </div>
                </div>

                {/* Provenance & Issues */}
                <div style={{
                  padding: '1rem',
                  borderRadius: '0.75rem',
                  border: unitDetails.provenance.isValid ? '1px solid #A7F3D0' : '1px solid #FCA5A5',
                  background: unitDetails.provenance.isValid ? '#F0FDF4' : '#FEF2F2'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 800, color: unitDetails.provenance.isValid ? '#166534' : '#991B1B' }}>
                    {unitDetails.provenance.isValid ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
                    <span>
                      {unitDetails.provenance.isValid
                        ? (isAr ? 'فحص سلامة البيانات: جميع المقاطع ونطاقات الصفحات مطابقة ومتحقق منها' : 'Provenance Verified')
                        : (isAr ? 'فحص سلامة البيانات: تم رصد مشاكل تمنع الاعتماد' : 'Provenance Issues Detected')}
                    </span>
                  </div>

                  {unitDetails.provenance.issues.length > 0 && (
                    <ul style={{ margin: '0.5rem 0 0 1.25rem', padding: 0, fontSize: '0.85rem', color: '#991B1B' }}>
                      {unitDetails.provenance.issues.map((iss: string, idx: number) => (
                        <li key={idx}>{iss}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Modal Prompt for Reject / Revoke */}
        {promptAction && (
          <div style={{
            position: 'absolute',
            top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem'
          }}>
            <div style={{
              background: '#FFFFFF',
              borderRadius: '0.75rem',
              padding: '1.5rem',
              maxWidth: '500px',
              width: '100%',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)'
            }}>
              <h4 style={{ margin: '0 0 0.5rem 0', fontWeight: 800, color: '#1E293B' }}>
                {promptAction === 'REJECT'
                  ? (isAr ? 'تأكيد رفض اعتماد الوحدة' : 'Confirm Unit Rejection')
                  : (isAr ? 'تأكيد سحب اعتماد الوحدة' : 'Confirm Approval Revocation')}
              </h4>
              <p style={{ margin: '0 0 1rem 0', fontSize: '0.85rem', color: '#64748B' }}>
                {isAr ? 'يرجى كتابة سبب الإجراء لتسجيله في سجل التدقيق الإداري:' : 'Please enter the reason for this decision:'}
              </p>
              <textarea
                value={promptReason}
                onChange={e => setPromptReason(e.target.value)}
                rows={3}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  borderRadius: '0.375rem',
                  border: '1px solid #CBD5E1',
                  marginBottom: '1rem',
                  fontFamily: 'inherit',
                  fontSize: '0.85rem'
                }}
                placeholder={isAr ? 'مثال: نقص في نصوص الصفحات 14-18، أو وجود أسئلة غير مكتملة...' : 'Enter reason...'}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setPromptAction(null)}
                  disabled={actionLoading}
                  style={{
                    background: '#F1F5F9',
                    border: 'none',
                    padding: '0.5rem 1rem',
                    borderRadius: '0.375rem',
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="button"
                  onClick={handleRejectOrRevoke}
                  disabled={actionLoading || !promptReason.trim()}
                  style={{
                    background: '#DC2626',
                    color: '#FFFFFF',
                    border: 'none',
                    padding: '0.5rem 1rem',
                    borderRadius: '0.375rem',
                    fontSize: '0.85rem',
                    fontWeight: 800,
                    cursor: 'pointer'
                  }}
                >
                  {actionLoading ? (isAr ? 'جاري المعالجة...' : 'Processing...') : (isAr ? 'تأكيد الحفظ' : 'Confirm')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal Prompt for Confirm Approve */}
        {confirmApprove && (
          <div style={{
            position: 'absolute',
            top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem'
          }}>
            <div style={{
              background: '#FFFFFF',
              borderRadius: '0.75rem',
              padding: '1.5rem',
              maxWidth: '480px',
              width: '100%',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)'
            }}>
              <h4 style={{ margin: '0 0 0.5rem 0', fontWeight: 800, color: '#1E293B', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <ShieldCheck color="#059669" size={20} />
                <span>{isAr ? 'تأكيد اعتماد الوحدة التربوية' : 'Confirm Curriculum Unit Approval'}</span>
              </h4>
              <p style={{ margin: '0 0 1.25rem 0', fontSize: '0.85rem', color: '#475569', lineHeight: 1.5 }}>
                {isAr
                  ? `هل أنت متأكد من اعتماد الوحدة "${unitDetails?.unit?.title_ar}" رسمياً؟ سيمكن هذا الإجراء المعلمين والطلاب من توليد الامتحانات الذكية واستخدام بنوك الأسئلة لهذه الوحدة.`
                  : `Are you sure you want to approve "${unitDetails?.unit?.title_en || unitDetails?.unit?.title_ar}"? This will enable AI exam generation and question bank usage for this unit.`}
              </p>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setConfirmApprove(false)}
                  disabled={actionLoading}
                  style={{
                    background: '#F1F5F9',
                    border: 'none',
                    padding: '0.5rem 1rem',
                    borderRadius: '0.375rem',
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="button"
                  onClick={handleApprove}
                  disabled={actionLoading}
                  style={{
                    background: '#059669',
                    color: '#FFFFFF',
                    border: 'none',
                    padding: '0.5rem 1.25rem',
                    borderRadius: '0.375rem',
                    fontSize: '0.85rem',
                    fontWeight: 800,
                    cursor: 'pointer'
                  }}
                >
                  {actionLoading ? (isAr ? 'جاري الاعتماد...' : 'Approving...') : (isAr ? 'تأكيد الاعتماد' : 'Approve Now')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
