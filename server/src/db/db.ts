import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import mysql from 'mysql2/promise';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { Pool } = pg;

export interface QueryResult<T = any> {
  rows: T[];
  rowCount: number;
}

class DatabaseManager {
  private mysqlPool: mysql.Pool | null = null;
  private pgPool: pg.Pool | null = null;
  private sqlite: any = null;
  private isInitialized = false;

  public async init(): Promise<void> {
    if (this.isInitialized) return;

    // 1. Check TiDB Cloud Serverless MySQL
    const tidbHost = process.env.TIDB_HOST || process.env.MYSQL_HOST;
    if (tidbHost) {
      console.log('🌐 Connecting to TiDB Cloud Serverless MySQL at:', tidbHost);
      try {
        this.mysqlPool = mysql.createPool({
          host: tidbHost,
          port: parseInt(process.env.TIDB_PORT || '4000', 10),
          user: process.env.TIDB_USER || 'root',
          password: process.env.TIDB_PASSWORD || '',
          database: process.env.TIDB_DATABASE || 'assessment_platform',
          ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
          waitForConnections: true,
          connectionLimit: 15,
          multipleStatements: true
        });
        await this.mysqlPool.query('SELECT 1');
        console.log('✅ Connected to TiDB Cloud Serverless MySQL successfully.');
      } catch (err) {
        console.warn('⚠️ TiDB Cloud connection failed. Falling back to next provider:', err);
        this.mysqlPool = null;
      }
    }

    // 2. Check PostgreSQL
    const databaseUrl = process.env.DATABASE_URL;
    if (!this.mysqlPool && databaseUrl && !databaseUrl.includes('placeholder')) {
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

    // 3. Fallback to embedded SQLite
    if (!this.mysqlPool && !this.pgPool) {
      console.log('🗄️  Initializing embedded SQLite database...');
      try {
        const { default: Database } = await import('better-sqlite3');
        const dataDir = path.join(
          process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || 'C:\\temp', 'AppData', 'Local'),
          'assessment_platform_data'
        );
        if (!fs.existsSync(dataDir)) {
          fs.mkdirSync(dataDir, { recursive: true });
        }
        const dbPath = path.join(dataDir, 'platform.db');
        this.sqlite = new Database(dbPath, { verbose: undefined });
        this.sqlite.pragma('journal_mode = WAL');
        this.sqlite.pragma('foreign_keys = ON');
        console.log('✅ SQLite database initialized at:', dbPath);
      } catch (e) {
        console.warn('SQLite fallback unavailable in serverless environment:', e);
      }
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

    if (this.mysqlPool) {
      let mysqlSql = sql.replace(/\$(\d+)/g, '?');
      mysqlSql = mysqlSql.replace(/datetime\(['"]now['"]\)/gi, 'NOW()');
      mysqlSql = mysqlSql.replace(/INSERT\s+OR\s+REPLACE\s+INTO/gi, 'REPLACE INTO');

      const [result] = await this.mysqlPool.query(mysqlSql, sanitizedParams);
      if (Array.isArray(result)) {
        return {
          rows: result as T[],
          rowCount: result.length
        };
      } else {
        const header = result as any;
        return {
          rows: [],
          rowCount: header?.affectedRows || 0
        };
      }
    } else if (this.pgPool) {
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
    if (this.mysqlPool) {
      let mysqlSql = sql.replace(/datetime\(['"]now['"]\)/gi, 'NOW()');
      mysqlSql = mysqlSql.replace(/INSERT\s+OR\s+REPLACE\s+INTO/gi, 'REPLACE INTO');
      await this.mysqlPool.query(mysqlSql);
    } else if (this.pgPool) {
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
      if (this.mysqlPool) {
        let schemaPath = path.resolve(__dirname, 'schema_mysql.sql');
        if (!fs.existsSync(schemaPath)) {
          schemaPath = path.resolve(process.cwd(), 'server/src/db/schema_mysql.sql');
        }
        if (fs.existsSync(schemaPath)) {
          const schemaSql = fs.readFileSync(schemaPath, 'utf8');
          console.log('📜 Applying TiDB Cloud MySQL schema...');
          const statements = schemaSql.split(';').map(s => s.trim()).filter(s => s.length > 0);
          for (const stmt of statements) {
            await this.mysqlPool.query(stmt);
          }
          console.log('✅ TiDB Cloud schema verified and active.');
        }
        return;
      }

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
