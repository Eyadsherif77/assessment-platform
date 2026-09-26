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

          // Hierarchy migrations for users, exams, and teacher_profiles
          const hierarchyUserCols = [
            'ALTER TABLE users ADD COLUMN governorate_id VARCHAR(64) NULL',
            'ALTER TABLE users ADD COLUMN subject_id VARCHAR(64) NULL',
            'ALTER TABLE users ADD COLUMN created_by VARCHAR(64) NULL',
            'ALTER TABLE exams ADD COLUMN governorate_id VARCHAR(64) NULL',
            'ALTER TABLE teacher_profiles ADD COLUMN governorate_id VARCHAR(64) NULL',
            'ALTER TABLE teacher_profiles ADD COLUMN subject_id VARCHAR(64) NULL',
            'ALTER TABLE teacher_profiles ADD COLUMN supervisor_id VARCHAR(64) NULL',
            'ALTER TABLE users ADD COLUMN initial_password VARCHAR(255) NULL'
          ];
          for (const colSql of hierarchyUserCols) {
            try {
              await this.tidbConn.execute(colSql);
            } catch (_) {}
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

          // Ensure platform settings table and default monthly exam limit
          try {
            await this.tidbConn.execute(`
              CREATE TABLE IF NOT EXISTS platform_settings (
                setting_key VARCHAR(64) PRIMARY KEY,
                setting_value TEXT NOT NULL,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                updated_by VARCHAR(64)
              )
            `);
            await this.tidbConn.execute(`
              INSERT INTO platform_settings (setting_key, setting_value, updated_by)
              VALUES ('monthly_exam_limit', '10', 'SYSTEM')
              ON DUPLICATE KEY UPDATE setting_value = setting_value
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
          try {
            await this.tidbConn.execute(`CREATE INDEX idx_exams_gov_sub ON exams (governorate_id, subject_id)`);
          } catch (_) {}

          await this.ensureAllGradesAndSubjects();
          console.log('✅ TiDB Cloud schema verified and active with 4-tier hierarchy support.');
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
          await this.query(`ALTER TABLE users ADD COLUMN governorate_id TEXT`);
        } catch (_) {}
        try {
          await this.query(`ALTER TABLE users ADD COLUMN subject_id TEXT`);
        } catch (_) {}
        try {
          await this.query(`ALTER TABLE users ADD COLUMN created_by TEXT`);
        } catch (_) {}
        try {
          await this.query(`ALTER TABLE exams ADD COLUMN governorate_id TEXT`);
        } catch (_) {}
        try {
          await this.query(`ALTER TABLE teacher_profiles ADD COLUMN governorate_id TEXT`);
        } catch (_) {}
        try {
          await this.query(`ALTER TABLE teacher_profiles ADD COLUMN subject_id TEXT`);
        } catch (_) {}
        try {
          await this.query(`ALTER TABLE teacher_profiles ADD COLUMN supervisor_id TEXT`);
        } catch (_) {}

        // Ensure no NULL school_type values exist in database
        try {
          await this.query(`UPDATE student_profiles SET school_type = 'عربي' WHERE school_type IS NULL OR school_type = ''`);
          await this.query(`UPDATE books SET school_type = 'كلاهما' WHERE school_type IS NULL OR school_type = ''`);
          await this.query(`UPDATE exams SET school_type = 'كلاهما' WHERE school_type IS NULL OR school_type = ''`);
        } catch (_) {}

        try {
          await this.query(`ALTER TABLE users ADD COLUMN initial_password TEXT`);
        } catch (_) {}

        // Ensure platform_settings table
        try {
          await this.query(`
            CREATE TABLE IF NOT EXISTS platform_settings (
              setting_key TEXT PRIMARY KEY,
              setting_value TEXT NOT NULL,
              updated_at TEXT,
              updated_by TEXT
            )
          `);
        } catch (_) {}

        await this.ensureAllGradesAndSubjects();
        console.log('✅ Database schema verified and active.');
      }
    } catch (error) {
      console.error('Error applying schema:', error);
      throw error;
    }
  }

  public async ensureAllGradesAndSubjects(): Promise<void> {
    try {
      const stagesDef = [
        { code: 'PRIMARY', name_ar: 'المرحلة الابتدائية', name_en: 'Primary Education', sort: 1 },
        { code: 'PREPARATORY', name_ar: 'المرحلة الإعدادية', name_en: 'Preparatory Education', sort: 2 },
        { code: 'SECONDARY', name_ar: 'المرحلة الثانوية', name_en: 'Secondary Education', sort: 3 }
      ];

      const stageMap: Record<string, string> = {};
      const { v4: uuidv4 } = await import('uuid');

      for (const s of stagesDef) {
        const existing = await this.query('SELECT id FROM academic_stages WHERE code = $1', [s.code]);
        if (existing.rows.length > 0) {
          stageMap[s.code] = existing.rows[0].id;
        } else {
          const newId = uuidv4();
          await this.query(
            'INSERT INTO academic_stages (id, code, name_ar, name_en, sort_order) VALUES ($1, $2, $3, $4, $5)',
            [newId, s.code, s.name_ar, s.name_en, s.sort]
          );
          stageMap[s.code] = newId;
        }
      }

      const gradesDef = [
        // Primary 1 to 6
        { stageCode: 'PRIMARY', code: 'PRIM_1', name_ar: 'الصف الأول الابتدائي', name_en: 'Primary 1', sort: 1 },
        { stageCode: 'PRIMARY', code: 'PRIM_2', name_ar: 'الصف الثاني الابتدائي', name_en: 'Primary 2', sort: 2 },
        { stageCode: 'PRIMARY', code: 'PRIM_3', name_ar: 'الصف الثالث الابتدائي', name_en: 'Primary 3', sort: 3 },
        { stageCode: 'PRIMARY', code: 'PRIM_4', name_ar: 'الصف الرابع الابتدائي', name_en: 'Primary 4', sort: 4 },
        { stageCode: 'PRIMARY', code: 'PRIM_5', name_ar: 'الصف الخامس الابتدائي', name_en: 'Primary 5', sort: 5 },
        { stageCode: 'PRIMARY', code: 'PRIM_6', name_ar: 'الصف السادس الابتدائي', name_en: 'Primary 6', sort: 6 },

        // Preparatory 1 to 3
        { stageCode: 'PREPARATORY', code: 'PREP_1', name_ar: 'الصف الأول الإعدادي', name_en: 'Prep 1', sort: 7 },
        { stageCode: 'PREPARATORY', code: 'PREP_2', name_ar: 'الصف الثاني الإعدادي', name_en: 'Prep 2', sort: 8 },
        { stageCode: 'PREPARATORY', code: 'PREP_3', name_ar: 'الصف الثالث الإعدادي', name_en: 'Prep 3', sort: 9 },

        // Secondary 1 to 3
        { stageCode: 'SECONDARY', code: 'SEC_1', name_ar: 'الصف الأول الثانوي', name_en: 'Secondary 1', sort: 10 },
        { stageCode: 'SECONDARY', code: 'SEC_2', name_ar: 'الصف الثاني الثانوي', name_en: 'Secondary 2', sort: 11 },
        { stageCode: 'SECONDARY', code: 'SEC_3', name_ar: 'الصف الثالث الثانوي', name_en: 'Secondary 3', sort: 12 }
      ];

      for (const g of gradesDef) {
        const stageId = stageMap[g.stageCode];
        if (!stageId) continue;
        const existing = await this.query('SELECT id FROM grades WHERE code = $1', [g.code]);
        if (existing.rows.length === 0) {
          const newId = uuidv4();
          await this.query(
            'INSERT INTO grades (id, stage_id, code, name_ar, name_en, sort_order) VALUES ($1, $2, $3, $4, $5, $6)',
            [newId, stageId, g.code, g.name_ar, g.name_en, g.sort]
          );
        }
      }

      console.log('✅ Verified all 12 grades from Primary 1 to Secondary 3.');
    } catch (e) {
      console.warn('Grades verification notice:', e);
    }
  }
}

export const db = new DatabaseManager();
