import assert from 'assert';

// Simulate api.ts logic in an isolated test environment
const PRODUCTION_BACKEND_HOSTS = ['server-two-pi-32.vercel.app', 'server-mocha-sigma-86.vercel.app'];
const PRODUCTION_FRONTEND_HOSTS = ['client-pied-alpha.vercel.app'];

function isPreviewEnvironment(hostname, vercelEnv) {
  if (vercelEnv === 'preview') return true;
  if (!hostname) return false;

  const host = hostname.toLowerCase();
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local');
  if (isLocal) return false;

  const isProductionFrontend = PRODUCTION_FRONTEND_HOSTS.some(p => host === p || host.endsWith(`.${p}`));
  const isVercelDomain = host.endsWith('.vercel.app');

  if (isVercelDomain && !isProductionFrontend) {
    return true;
  }
  return false;
}

function resolveApiBase(hostname, vercelEnv, configuredUrl = '') {
  const isPreview = isPreviewEnvironment(hostname, vercelEnv);
  const cleanUrl = configuredUrl.trim();

  if (isPreview) {
    if (!cleanUrl) {
      throw new Error(
        '[PREVIEW_ROUTING_BLOCKED] Preview deployments are strictly prevented from silently proxying API requests to the production backend. An isolated, non-production API URL must be explicitly configured via VITE_API_URL.'
      );
    }
    for (const prodHost of PRODUCTION_BACKEND_HOSTS) {
      if (cleanUrl.includes(prodHost)) {
        throw new Error(
          `[PREVIEW_ROUTING_BLOCKED] VITE_API_URL points to production backend (${prodHost}). Preview deployments must use an isolated non-production API.`
        );
      }
    }
    return cleanUrl;
  }

  return cleanUrl;
}

function apiUrl(path, hostname, vercelEnv, configuredUrl = '') {
  const base = resolveApiBase(hostname, vercelEnv, configuredUrl);
  return `${base}${path}`;
}

console.log('Running Preview Routing Guard Tests...');

// Test 1: Localhost development (relative or local proxy)
{
  const url = apiUrl('/api/meta', 'localhost', '');
  assert.strictEqual(url, '/api/meta');
  console.log('✅ Localhost allowed with relative URL');
}

// Test 2: Production frontend domain (relative URL proxies to production)
{
  const url = apiUrl('/api/meta', 'client-pied-alpha.vercel.app', 'production');
  assert.strictEqual(url, '/api/meta');
  console.log('✅ Production domain allowed with relative URL');
}

// Test 3: Preview deployment with NO VITE_API_URL (must throw error)
{
  assert.throws(
    () => apiUrl('/api/meta', 'client-preview-git-feature-branch.vercel.app', 'preview', ''),
    /PREVIEW_ROUTING_BLOCKED/,
    'Should block preview with empty URL'
  );
  console.log('✅ Preview blocked when VITE_API_URL is missing');
}

// Test 4: Preview deployment with production backend URL (must throw error)
{
  assert.throws(
    () => apiUrl('/api/meta', 'client-preview-git-feature-branch.vercel.app', 'preview', 'https://server-two-pi-32.vercel.app'),
    /PREVIEW_ROUTING_BLOCKED/,
    'Should block preview with production backend URL'
  );
  console.log('✅ Preview blocked when VITE_API_URL points to production backend');
}

// Test 5: Preview deployment with explicit isolated staging URL (must succeed)
{
  const stagingUrl = 'https://server-preview-branch.vercel.app';
  const url = apiUrl('/api/meta', 'client-preview-git-feature-branch.vercel.app', 'preview', stagingUrl);
  assert.strictEqual(url, 'https://server-preview-branch.vercel.app/api/meta');
  console.log('✅ Preview allowed when configured with explicit isolated backend URL');
}

console.log('All Preview Routing Guard Tests PASSED successfully!');
