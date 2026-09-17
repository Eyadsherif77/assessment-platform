import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { Pool } = pg;

export interface QueryResult<T = any> {
  rows: T[];
  rowCount: number;
}

class DatabaseManager {
  private pgPool: pg.Pool | null = null;
  private sqlite: Database.Database | null = null;
  private isInitialized = false;

  public async init(): Promise<void> {
    if (this.isInitialized) return;

    const databaseUrl = process.env.DATABASE_URL;

    if (databaseUrl && !databaseUrl.includes('placeholder')) {
      console.log('Connecting to PostgreSQL database at:', databaseUrl.split('@')[1] || 'remote host');
      try {
        this.pgPool = new Pool({
          connectionString: databaseUrl,
          ssl: databaseUrl.includes('localhost') || databaseUrl.includes('127.0.0.1')
            ? false
            : { rejectUnauthorized: false }
        });
        await this.pgPool.query('SELECT 1');
        console.log('✅ Connected to PostgreSQL successfully.');
      } catch (err) {
        console.warn('⚠️ Remote PostgreSQL connection failed. Falling back to embedded SQLite.');
        this.pgPool = null;
      }
    }

    if (!this.pgPool) {
      console.log('🗄️  Initializing embedded SQLite database...');
      const dataDir = path.join(
        process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || 'C:\\temp', 'AppData', 'Local'),
        'assessment_platform_data'
      );
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      const dbPath = path.join(dataDir, 'platform.db');
      this.sqlite = new Database(dbPath, { verbose: undefined });
      // Enable WAL mode and foreign keys for best performance & integrity
      this.sqlite.pragma('journal_mode = WAL');
      this.sqlite.pragma('foreign_keys = ON');
      console.log('✅ SQLite database initialized at:', dbPath);
    }

    this.isInitialized = true;
    await this.applySchema();
  }

  /**
   * Run a SQL query with optional parameters.
   * Automatically adapts between PostgreSQL ($1, $2) and SQLite (?) placeholders.
   */
  public async query<T = any>(sql: string, params: any[] = []): Promise<QueryResult<T>> {
    if (!this.isInitialized) {
      await this.init();
    }

    // Convert undefined values to null, and booleans to 1/0 for SQLite compatibility
    const sanitizedParams = params.map(p => {
      if (p === undefined) return null;
      if (typeof p === 'boolean') return p ? 1 : 0;
      return p;
    });

    if (this.pgPool) {
      const res = await this.pgPool.query(sql, sanitizedParams);
      return {
        rows: res.rows as T[],
        rowCount: res.rowCount ?? res.rows.length
      };
    } else if (this.sqlite) {
      // Convert PostgreSQL $1 placeholders to SQLite ? placeholders
      const sqliteSql = sql.replace(/\$(\d+)/g, '?');

      // Determine if this is a SELECT query or a mutation
      const trimmed = sqliteSql.trim().toUpperCase();
      if (trimmed.startsWith('SELECT') || trimmed.startsWith('WITH')) {
        const stmt = this.sqlite.prepare(sqliteSql);
        const rows = stmt.all(...sanitizedParams) as T[];
        return { rows, rowCount: rows.length };
      } else {
        const stmt = this.sqlite.prepare(sqliteSql);
        const info = stmt.run(...sanitizedParams);
        return { rows: [], rowCount: info.changes };
      }
    } else {
      throw new Error('Database is not initialized');
    }
  }

  /**
   * Execute one or more SQL statements without returning rows.
   * Used for schema application and migrations.
   */
  public async exec(sql: string): Promise<void> {
    if (!this.isInitialized) {
      await this.init();
    }
    if (this.pgPool) {
      await this.pgPool.query(sql);
    } else if (this.sqlite) {
      this.sqlite.exec(sql);
    }
  }

  /**
   * Run multiple queries in a SQLite transaction.
   */
  public transaction(fn: () => void): void {
    if (this.sqlite) {
      const runInTransaction = this.sqlite.transaction(fn);
      runInTransaction();
    }
  }

  private async applySchema(): Promise<void> {
    try {
      let schemaPath = path.resolve(__dirname, 'schema.sql');
      if (!fs.existsSync(schemaPath)) {
        schemaPath = path.resolve(__dirname, '../src/db/schema.sql');
      }
      if (!fs.existsSync(schemaPath)) {
        schemaPath = path.resolve(process.cwd(), 'src/db/schema.sql');
      }
      if (!fs.existsSync(schemaPath)) {
        schemaPath = path.resolve(process.cwd(), 'server/src/db/schema.sql');
      }
      if (fs.existsSync(schemaPath)) {
        const schemaSql = fs.readFileSync(schemaPath, 'utf8');
        console.log('📜 Applying database schema...');
        await this.exec(schemaSql);

        // Safe migrations for newer columns
        try {
          await this.query(`ALTER TABLE student_profiles ADD COLUMN section TEXT`);
        } catch (_) {}
        try {
          await this.query(`ALTER TABLE student_profiles ADD COLUMN school_type TEXT`);
        } catch (_) {}
        try {
          await this.query(`ALTER TABLE books ADD COLUMN school_type TEXT DEFAULT 'كلاهما'`);
        } catch (_) {}
        try {
          await this.query(`ALTER TABLE users ADD COLUMN super_id TEXT`);
        } catch (_) {}
        try {
          await this.query(`ALTER TABLE users ADD COLUMN hybrid_id TEXT`);
        } catch (_) {}
        try {
          await this.query(`ALTER TABLE users ADD COLUMN permissions TEXT`);
        } catch (_) {}

        console.log('✅ Database schema verified and active.');
      }
    } catch (error) {
      console.error('Error applying schema:', error);
      throw error;
    }
  }
}

export const db = new DatabaseManager();
