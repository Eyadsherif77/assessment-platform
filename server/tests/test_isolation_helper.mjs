import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Normal persistent database path that MUST NEVER be accessed during automated tests.
 */
const PERSISTENT_DIR = path.join(
  process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'),
  'assessment_platform_data'
);
const PERSISTENT_DB_PATH = path.normalize(path.join(PERSISTENT_DIR, 'platform.db')).toLowerCase();

/**
 * Initializes environment variables for an isolated, disposable SQLite database
 * in a unique subfolder of os.tmpdir().
 *
 * @param {string} suiteName - Identifying prefix for the temporary folder
 * @returns {{ tempDir: string, dbPath: string }}
 */
export function setupDisposableTestDb(suiteName = 'test') {
  const uniqueId = `${suiteName}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const tempDir = path.join(os.tmpdir(), `assessment_platform_test_${uniqueId}`);
  fs.mkdirSync(tempDir, { recursive: true });

  const dbPath = path.normalize(path.join(tempDir, 'platform_test.db'));

  // Guard: Absolutely prohibit any accidental collision with the persistent database path
  if (path.normalize(dbPath).toLowerCase() === PERSISTENT_DB_PATH) {
    throw new Error(`CRITICAL TEST ISOLATION FAILURE: Attempted to point test database to persistent DB: ${dbPath}`);
  }

  process.env.SQLITE_DB_PATH = dbPath;
  process.env.LOCALAPPDATA = tempDir; // Also redirect fallback LOCALAPPDATA

  return { tempDir, dbPath };
}

/**
 * Verifies that the active database manager is connected to the expected disposable database
 * and has not touched or defaulted to the persistent development database.
 *
 * @param {any} db - The DatabaseManager instance
 * @param {string} expectedDbPath - The expected disposable database path
 */
export function assertDatabaseIsDisposable(db, expectedDbPath) {
  const activePath = db.getSqlitePath ? db.getSqlitePath() : null;
  if (!activePath) {
    throw new Error('CRITICAL TEST ISOLATION FAILURE: DatabaseManager has no active SQLite path.');
  }

  const normalizedActive = path.normalize(activePath).toLowerCase();
  const normalizedExpected = path.normalize(expectedDbPath).toLowerCase();

  // Guard 1: Must never match persistent path
  if (normalizedActive === PERSISTENT_DB_PATH || normalizedActive.includes('assessment_platform_data')) {
    console.error(`FATAL: Test connected to persistent database: ${activePath}`);
    process.exit(1);
  }

  // Guard 2: Must match expected disposable temp path
  if (normalizedActive !== normalizedExpected) {
    console.error(`FATAL: Test database path mismatch. Expected: ${normalizedExpected}, Got: ${normalizedActive}`);
    process.exit(1);
  }
}

/**
 * Safely closes the database connection to release Windows file locks,
 * then cleans up ONLY the specific temporary directory created for this test run.
 *
 * @param {any} db - The DatabaseManager instance
 * @param {string} tempDir - The unique temporary directory created by setupDisposableTestDb
 */
export function teardownDisposableTestDb(db, tempDir) {
  try {
    if (db && typeof db.close === 'function') {
      db.close();
    }
  } catch (err) {
    console.warn(`Warning closing test database: ${err.message}`);
  }

  // Guard: NEVER delete anything outside of os.tmpdir() or any directory containing assessment_platform_data
  const normalizedTempDir = path.normalize(tempDir).toLowerCase();
  const normalizedOsTmp = path.normalize(os.tmpdir()).toLowerCase();

  if (!normalizedTempDir.startsWith(normalizedOsTmp) || normalizedTempDir.includes('assessment_platform_data')) {
    console.error(`FATAL SAFETY ABORT: Refusing to delete non-temporary directory: ${tempDir}`);
    return;
  }

  try {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  } catch (err) {
    console.warn(`Warning removing test temp dir ${tempDir}: ${err.message}`);
  }
}
