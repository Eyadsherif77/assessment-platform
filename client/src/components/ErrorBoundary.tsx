import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an unhandled error:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleHome = () => {
    try {
      window.location.href = '/?view=home';
    } catch (_) {
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '70vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem 1.5rem',
          direction: 'rtl',
          fontFamily: 'Cairo, system-ui, -apple-system, sans-serif'
        }}>
          <div style={{
            maxWidth: '540px',
            width: '100%',
            background: '#ffffff',
            borderRadius: '16px',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.05)',
            border: '1px solid #e2e8f0',
            padding: '2.5rem 2rem',
            textAlign: 'center'
          }}>
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              backgroundColor: '#fee2e2',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1.5rem',
              color: '#dc2626'
            }}>
              <AlertTriangle size={32} />
            </div>

            <h2 style={{
              fontSize: '1.35rem',
              fontWeight: 800,
              color: '#1e293b',
              marginBottom: '0.75rem'
            }}>
              تعذر عرض هذه الصفحة مؤقتاً
            </h2>

            <p style={{
              color: '#64748b',
              fontSize: '0.95rem',
              lineHeight: 1.6,
              marginBottom: '2rem'
            }}>
              بياناتك وإجاباتك محفوظة بأمان تام في قاعدة البيانات. يمكنك إعادة تحميل الصفحة للمتابعة دون أي قلق.
            </p>

            <div style={{
              display: 'flex',
              gap: '1rem',
              justifyContent: 'center',
              flexWrap: 'wrap'
            }}>
              <button
                onClick={this.handleReload}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.75rem 1.5rem',
                  borderRadius: '10px',
                  backgroundColor: '#2563eb',
                  color: '#ffffff',
                  fontWeight: 600,
                  fontSize: '0.925rem',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s ease'
                }}
              >
                <RefreshCw size={18} />
                إعادة تحميل الصفحة
              </button>

              <button
                onClick={this.handleHome}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.75rem 1.5rem',
                  borderRadius: '10px',
                  backgroundColor: '#f1f5f9',
                  color: '#334155',
                  fontWeight: 600,
                  fontSize: '0.925rem',
                  border: '1px solid #cbd5e1',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s ease'
                }}
              >
                <Home size={18} />
                الصفحة الرئيسية
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
