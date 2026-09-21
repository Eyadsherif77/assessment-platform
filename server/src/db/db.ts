import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { connect, Connection } from '@tidbcloud/serverless';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { Pool } = pg;

export interface QueryResult<T = any> {
  rows: T[];
  rowCount: number;
}

class DatabaseManager {
  private tidbConn: Connection<any> | null = null;
  private pgPool: pg.Pool | null = null;
  private sqlite: any = null;
  private isInitialized = false;

  public async init(): Promise<void> {
    if (this.isInitialized) return;

    // 1. Check TiDB Cloud Serverless (HTTP - Serverless Native, bypasses TCP port 4000)
    const tidbHost = process.env.TIDB_HOST || process.env.MYSQL_HOST;
    if (tidbHost) {
      console.log('🌐 Connecting to TiDB Cloud Serverless (HTTP) at:', tidbHost);
      try {
        this.tidbConn = connect({
          host: tidbHost,
          username: process.env.TIDB_USER || 'root',
          password: process.env.TIDB_PASSWORD || '',
          database: process.env.TIDB_DATABASE || 'assessment_platform'
        });
        await this.tidbConn.execute('SELECT 1');
        console.log('✅ Connected to TiDB Cloud Serverless (HTTP) successfully.');
        this.isInitialized = true;
        await this.applySchema();
        return;
      } catch (err) {
        console.warn('⚠️ TiDB Cloud HTTP connection failed. Falling back to next provider:', err);
        this.tidbConn = null;
      }
    }

    // 2. Check PostgreSQL
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
        this.isInitialized = true;
        await this.applySchema();
        return;
      } catch (err) {
        console.warn('⚠️ Remote PostgreSQL connection failed. Falling back to embedded SQLite.');
        this.pgPool = null;
      }
    }

    // 3. Fallback to embedded SQLite
    console.log('🗄️  Initializing embedded SQLite database...');
    try {
      const { default: Database } = await import('better-sqlite3');
      const dataDir = process.env.VERCEL
        ? '/tmp/assessment_platform_data'
        : path.join(
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
      this.isInitialized = true;
      await this.applySchema();
      return;
    } catch (e) {
      console.warn('SQLite fallback unavailable in this environment:', e);
    }

    // If all providers failed, leave isInitialized false so subsequent requests can retry
    this.isInitialized = false;
  }

  /**
   * Run a SQL query with optional parameters.
   * Automatically adapts between PostgreSQL ($1, $2) and MySQL/SQLite (?) placeholders.
   */
  public async query<T = any>(sql: string, params: any[] = []): Promise<QueryResult<T>> {
    if (!this.isInitialized) {
      await this.init();
    }

    // Convert undefined values to null, and booleans to 1/0 for SQL compatibility
    const sanitizedParams = params.map(p => {
      if (p === undefined) return null;
      if (typeof p === 'boolean') return p ? 1 : 0;
      return p;
    });

    if (this.tidbConn) {
      const orderedParams: any[] = [];
      let tidbSql = sql.replace(/\$(\d+)/g, (_, idxStr) => {
        const idx = parseInt(idxStr, 10) - 1;
        orderedParams.push(sanitizedParams[idx]);
        return '?';
      });
      tidbSql = tidbSql.replace(/datetime\(['"]now['"]\)/gi, 'NOW()');
      tidbSql = tidbSql.replace(/INSERT\s+OR\s+REPLACE\s+INTO/gi, 'REPLACE INTO');

      const res = (await this.tidbConn.execute(tidbSql, orderedParams, { fullResult: true })) as any;
      const rows = (res.rows || []) as T[];
      return {
        rows,
        rowCount: res.rowCount ?? res.rowsAffected ?? rows.length
      };
    } else if (this.pgPool) {
      const res = await this.pgPool.query(sql, sanitizedParams);
      return {
        rows: res.rows as T[],
        rowCount: res.rowCount ?? res.rows.length
      };
    } else if (this.sqlite) {
      // Convert PostgreSQL $1 placeholders to SQLite ? placeholders
      const orderedParams: any[] = [];
      const sqliteSql = sql.replace(/\$(\d+)/g, (_, idxStr) => {
        const idx = parseInt(idxStr, 10) - 1;
        orderedParams.push(sanitizedParams[idx]);
        return '?';
      });

      // Determine if this is a SELECT query or a mutation
      const trimmed = sqliteSql.trim().toUpperCase();
      if (trimmed.startsWith('SELECT') || trimmed.startsWith('WITH')) {
        const stmt = this.sqlite.prepare(sqliteSql);
        const rows = stmt.all(...orderedParams) as T[];
        return { rows, rowCount: rows.length };
      } else {
        const stmt = this.sqlite.prepare(sqliteSql);
        const info = stmt.run(...orderedParams);
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
    if (this.tidbConn) {
      let tidbSql = sql.replace(/datetime\(['"]now['"]\)/gi, 'NOW()');
      tidbSql = tidbSql.replace(/INSERT\s+OR\s+REPLACE\s+INTO/gi, 'REPLACE INTO');
      await this.tidbConn.execute(tidbSql);
    } else if (this.pgPool) {
      await this.pgPool.query(sql);
    } else if (this.sqlite) {
      this.sqlite.exec(sql);
    }
  }

  /**
   * Run multiple queries in a transaction.
   */
  public transaction(fn: () => void): void {
    if (this.sqlite) {
      const runInTransaction = this.sqlite.transaction(fn);
      runInTransaction();
    } else {
      fn();
    }
  }

  private async applySchema(): Promise<void> {
    try {
      if (this.tidbConn) {
        let schemaPath = path.resolve(__dirname, 'schema_mysql.sql');
        if (!fs.existsSync(schemaPath)) {
          schemaPath = path.resolve(process.cwd(), 'server/src/db/schema_mysql.sql');
        }
        if (fs.existsSync(schemaPath)) {
          const schemaSql = fs.readFileSync(schemaPath, 'utf8');
          console.log('📜 Applying TiDB Cloud MySQL schema...');
          const statements = schemaSql.split(';').map(s => s.trim()).filter(s => s.length > 0);
          for (const stmt of statements) {
            try {
              await this.tidbConn.execute(stmt);
            } catch (err: any) {
              // Ignore harmless table already exists warnings
            }
          }

          // Ensure chunked uploads storage table
          try {
            await this.tidbConn.execute(`
              CREATE TABLE IF NOT EXISTS file_upload_chunks (
                upload_id VARCHAR(64) NOT NULL,
                chunk_index INT NOT NULL,
                total_chunks INT NOT NULL,
                chunk_data LONGBLOB NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (upload_id, chunk_index)
              )
            `);
          } catch (_) {}

          // Ensure persistent book PDF chunks storage table
          try {
            await this.tidbConn.execute(`
              CREATE TABLE IF NOT EXISTS book_pdf_chunks (
                book_id VARCHAR(64) NOT NULL,
                chunk_index INT NOT NULL,
                chunk_data LONGBLOB NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (book_id, chunk_index)
              )
            `);
          } catch (_) {}

          // Safe high-performance indexing for question bank caching
          try {
            await this.tidbConn.execute(`CREATE INDEX idx_qbank_chapter ON question_bank_items (chapter_id)`);
          } catch (_) {}
          try {
            await this.tidbConn.execute(`CREATE INDEX idx_qbank_opt_item ON question_bank_options (question_item_id)`);
          } catch (_) {}
          try {
            await this.tidbConn.execute(`CREATE INDEX idx_book_chunks_lookup ON book_chunks (academic_stage_id, grade_id, subject_id, book_id, chapter_id)`);
          } catch (_) {}

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
          await this.query(`ALTER TABLE exams ADD COLUMN school_type TEXT DEFAULT 'كلاهما'`);
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

        // Ensure no NULL school_type values exist in database
        try {
          await this.query(`UPDATE student_profiles SET school_type = 'عربي' WHERE school_type IS NULL OR school_type = ''`);
          await this.query(`UPDATE books SET school_type = 'كلاهما' WHERE school_type IS NULL OR school_type = ''`);
          await this.query(`UPDATE exams SET school_type = 'كلاهما' WHERE school_type IS NULL OR school_type = ''`);
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
