const PRODUCTION_BACKEND_HOSTS = ['server-two-pi-32.vercel.app', 'server-mocha-sigma-86.vercel.app'];
const PRODUCTION_FRONTEND_HOSTS = ['client-pied-alpha.vercel.app'];

/**
 * Determine if current execution is within a Vercel Preview deployment context.
 */
export function isPreviewEnvironment(): boolean {
  // 1. Injected via build-time Vercel / Vite define
  const vercelEnv = (import.meta.env.VITE_VERCEL_ENV || (globalThis as any).__VERCEL_ENV__ || '') as string;
  if (vercelEnv === 'preview') return true;

  // 2. Runtime browser hostname inspection
  if (typeof window !== 'undefined' && window.location?.hostname) {
    const host = window.location.hostname.toLowerCase();
    const isLocal = host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local');
    if (isLocal) return false;

    const isProductionFrontend = PRODUCTION_FRONTEND_HOSTS.some(p => host === p || host.endsWith(`.${p}`));
    const isVercelDomain = host.endsWith('.vercel.app');

    // Any non-production vercel.app deployment is a Preview build
    if (isVercelDomain && !isProductionFrontend) {
      return true;
    }
  }

  return false;
}

/**
 * Resolves API base URL with strict preview air-gapping.
 * Prevents Preview deployments from silently hitting the production backend.
 */
export function resolveApiBase(): string {
  const configuredUrl = (import.meta.env.VITE_API_URL || '').trim();

  if (isPreviewEnvironment()) {
    if (!configuredUrl) {
      throw new Error(
        '[PREVIEW_ROUTING_BLOCKED] Preview deployments are strictly prevented from silently proxying API requests to the production backend. An isolated, non-production API URL must be explicitly configured via VITE_API_URL.'
      );
    }

    for (const prodHost of PRODUCTION_BACKEND_HOSTS) {
      if (configuredUrl.includes(prodHost)) {
        throw new Error(
          `[PREVIEW_ROUTING_BLOCKED] VITE_API_URL points to production backend (${prodHost}). Preview deployments must use an isolated non-production API.`
        );
      }
    }

    return configuredUrl;
  }

  // Production or Localhost: preserve existing behavior
  return configuredUrl;
}

export const API_BASE = (import.meta.env.VITE_API_URL || '').trim();

export function apiUrl(path: string): string {
  const base = resolveApiBase();
  return `${base}${path}`;
}

export async function apiFetch(path: string, options?: RequestInit): Promise<Response> {
  const url = apiUrl(path);
  return fetch(url, options);
}

export function authHeaders(token: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

