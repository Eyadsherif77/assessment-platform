import { db } from '../db/db.js';
import { v4 as uuidv4 } from 'uuid';

export type AIUsageEventType =
  | 'CACHE_HIT'
  | 'CACHE_MISS'
  | 'PROVIDER_CALL'
  | 'PROVIDER_SUCCESS'
  | 'PROVIDER_FAILURE'
  | 'BUDGET_EXCEEDED'
  | 'BUDGET_RESERVATION';

export interface ModelPricingConfig {
  inputPricePer1M: number;
  outputPricePer1M: number;
  cachedInputPricePer1M?: number;
  effectiveDate: string;
  source: string;
}

// Verified Official Google Gemini Pricing (USD per 1M tokens) - October 2026
export const VERIFIED_MODEL_PRICING: Record<string, ModelPricingConfig> = {
  // Primary model: Gemini 3 Flash Preview (standard < 128k context)
  'gemini-3-flash-preview': {
    inputPricePer1M: 0.50,
    outputPricePer1M: 3.00,
    cachedInputPricePer1M: 0.125,
    effectiveDate: '2026-10-01',
    source: 'Google AI Official Pricing Schedule (October 2026)'
  },
  'gemini-3.5-flash': {
    inputPricePer1M: 0.50,
    outputPricePer1M: 3.00,
    cachedInputPricePer1M: 0.125,
    effectiveDate: '2026-10-01',
    source: 'Google AI Official Pricing Schedule (October 2026)'
  },
  'gemini-3.6-flash': {
    inputPricePer1M: 0.50,
    outputPricePer1M: 3.00,
    cachedInputPricePer1M: 0.125,
    effectiveDate: '2026-10-01',
    source: 'Google AI Official Pricing Schedule (October 2026)'
  },
  // Stable Flash / latest
  'gemini-flash-latest': {
    inputPricePer1M: 0.10,
    outputPricePer1M: 0.40,
    cachedInputPricePer1M: 0.025,
    effectiveDate: '2026-10-01',
    source: 'Google AI Official Pricing Schedule (October 2026)'
  },
  'gemini-2.0-flash': {
    inputPricePer1M: 0.10,
    outputPricePer1M: 0.40,
    cachedInputPricePer1M: 0.025,
    effectiveDate: '2026-10-01',
    source: 'Google AI Official Pricing Schedule (October 2026)'
  },
  'gemini-1.5-flash': {
    inputPricePer1M: 0.10,
    outputPricePer1M: 0.40,
    cachedInputPricePer1M: 0.025,
    effectiveDate: '2026-10-01',
    source: 'Google AI Official Pricing Schedule (October 2026)'
  },
  // Lightweight Flash tier fallbacks
  'gemini-3.1-flash-lite': {
    inputPricePer1M: 0.075,
    outputPricePer1M: 0.30,
    cachedInputPricePer1M: 0.01875,
    effectiveDate: '2026-10-01',
    source: 'Google AI Official Pricing Schedule (October 2026)'
  },
  'gemini-3.1-flash-lite-preview': {
    inputPricePer1M: 0.075,
    outputPricePer1M: 0.30,
    cachedInputPricePer1M: 0.01875,
    effectiveDate: '2026-10-01',
    source: 'Google AI Official Pricing Schedule (October 2026)'
  },
  'gemini-2.0-flash-lite': {
    inputPricePer1M: 0.075,
    outputPricePer1M: 0.30,
    cachedInputPricePer1M: 0.01875,
    effectiveDate: '2026-10-01',
    source: 'Google AI Official Pricing Schedule (October 2026)'
  },
  // Intermediate Flash
  'gemini-2.5-flash': {
    inputPricePer1M: 0.15,
    outputPricePer1M: 0.60,
    cachedInputPricePer1M: 0.0375,
    effectiveDate: '2026-10-01',
    source: 'Google AI Official Pricing Schedule (October 2026)'
  },
  // Pro models
  'gemini-1.5-pro': {
    inputPricePer1M: 1.25,
    outputPricePer1M: 5.00,
    cachedInputPricePer1M: 0.3125,
    effectiveDate: '2026-10-01',
    source: 'Google AI Official Pricing Schedule (October 2026)'
  },
  'gemini-2.0-pro-exp': {
    inputPricePer1M: 1.25,
    outputPricePer1M: 5.00,
    cachedInputPricePer1M: 0.3125,
    effectiveDate: '2026-10-01',
    source: 'Google AI Official Pricing Schedule (October 2026)'
  },
  // Embedding model
  'gemini-embedding-001': {
    inputPricePer1M: 0.02,
    outputPricePer1M: 0.00,
    cachedInputPricePer1M: 0.00,
    effectiveDate: '2026-10-01',
    source: 'Google AI Official Pricing Schedule (October 2026)'
  },
  'text-embedding-004': {
    inputPricePer1M: 0.02,
    outputPricePer1M: 0.00,
    cachedInputPricePer1M: 0.00,
    effectiveDate: '2026-10-01',
    source: 'Google AI Official Pricing Schedule (October 2026)'
  }
};

export const DEFAULT_MODEL_PRICING: ModelPricingConfig = {
  inputPricePer1M: 0.50,
  outputPricePer1M: 3.00,
  cachedInputPricePer1M: 0.125,
  effectiveDate: '2026-10-01',
  source: 'Fallback reference price (unverified model rate)'
};

export interface RecordUsageParams {
  id?: string;
  correlationId?: string;
  studentId?: string;
  bookId?: string;
  chapterId?: string;
  gradeId?: string;
  subjectId?: string;
  configHash?: string;
  cachedExamId?: string;
  modelName?: string;
  promptTokens?: number;
  candidatesTokens?: number;
  cachedTokens?: number;
  thinkingTokens?: number;
  totalTokens?: number;
  estimatedCostUsd?: number | null;
  costStatus?: 'ESTIMATED' | 'UNKNOWN' | 'ACTUAL';
  durationMs?: number;
  errorCode?: string;
  attemptNumber?: number;
  isEstimated?: boolean;
  callPurpose?: string;
}

export interface MonthlyBudgetStatus {
  allowed: boolean;
  reason?: string;
  currentSpendingUsd: number;
  budgetLimitUsd: number;
  remainingBudgetUsd: number;
  currentTokens: number;
  tokenLimit: number;
  remainingTokens: number;
  isEnforced: boolean;
}

export interface MonthlyAuditSummary {
  year: number;
  month: number;
  totalExamRequests: number;
  cacheHits: number;
  cacheMisses: number;
  cacheHitRatePct: number;
  providerCalls: number;
  providerFailures: number;
  promptTokens: number;
  candidatesTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  estimatedCostEgp: number;
  budgetLimitUsd: number;
  remainingBudgetUsd: number;
  exchangeRateUsdToEgp: number;
}

export class TelemetrySchemaError extends Error {
  public readonly code = 'TELEMETRY_SCHEMA_INCOMPATIBLE';
  public readonly missingColumns: string[];
  public readonly migrationFile = '20261014_add_telemetry_columns.sql';

  constructor(missingColumns: string[], details?: string) {
    super(`[TELEMETRY_SCHEMA_INCOMPATIBLE] Missing required telemetry columns [${missingColumns.join(', ')}]. Standalone migration '20261014_add_telemetry_columns.sql' required. ${details || ''}`.trim());
    this.name = 'TelemetrySchemaError';
    this.missingColumns = missingColumns;
  }
}

export class AiUsageMetricsService {
  public static readonly OFFICIAL_USD_TO_EGP_RATE = 49.50; // Reference official exchange rate (October 2026)

  private static tableEnsured = false;
  private static hasEstimatedColumn = true;
  private static hasCallPurposeColumn = true;
  private static hasCorrelationIdColumn = false;
  private static hasAttemptNumberColumn = false;
  private static hasCachedTokensColumn = false;
  private static hasCostStatusColumn = false;
  private static hasGradeIdColumn = false;
  private static hasSubjectIdColumn = false;
  private static schemaError: string | null = null;

  /**
   * Get verified pricing for a given Gemini model
   */
  public static getModelPricing(modelName?: string): {
    inputPricePerToken: number;
    outputPricePerToken: number;
    cachedPricePerToken: number;
    inputPricePer1M: number;
    outputPricePer1M: number;
    cachedPricePer1M: number;
    isRecognized: boolean;
    costStatus: 'ESTIMATED' | 'UNKNOWN';
    effectiveDate: string;
    source: string;
  } {
    const norm = (modelName || '').toLowerCase().trim();
    const isRecognized = Boolean(VERIFIED_MODEL_PRICING[norm]);
    const config = isRecognized ? VERIFIED_MODEL_PRICING[norm] : DEFAULT_MODEL_PRICING;
    const cachedPricePer1M = config.cachedInputPricePer1M ?? (config.inputPricePer1M * 0.25);
    return {
      inputPricePerToken: config.inputPricePer1M / 1_000_000,
      outputPricePerToken: config.outputPricePer1M / 1_000_000,
      cachedPricePerToken: cachedPricePer1M / 1_000_000,
      inputPricePer1M: config.inputPricePer1M,
      outputPricePer1M: config.outputPricePer1M,
      cachedPricePer1M,
      isRecognized,
      costStatus: isRecognized ? 'ESTIMATED' : 'UNKNOWN',
      effectiveDate: config.effectiveDate || '2026-10-01',
      source: config.source || 'Google AI Official Pricing Schedule (October 2026)'
    };
  }

  /**
   * Calculate exact cost in USD for a given model and token counts.
   * If model is unknown/unrecognized, never invent a price: returns 0 and flags costStatus = 'UNKNOWN'.
   */
  public static calculateCost(
    modelName: string,
    promptTokens: number,
    candidatesTokens: number,
    cachedTokens = 0
  ): number {
    const pricing = this.getModelPricing(modelName);
    if (!pricing.isRecognized) {
      return 0; // Per Task 2 requirement 4: If price not verified, mark unknown; never invent a price.
    }
    const pTokens = Math.max(0, promptTokens || 0);
    const cTokens = Math.max(0, candidatesTokens || 0);
    const cached = Math.max(0, cachedTokens || 0);
    const cost = (pTokens * pricing.inputPricePerToken) +
                 (cTokens * pricing.outputPricePerToken) +
                 (cached * pricing.cachedPricePerToken);
    return Number(cost.toFixed(8));
  }

  /**
   * Ensure ai_usage_metrics table exists in persistent database
   * Strictly avoids runtime ALTER TABLE DDL (runs only CREATE TABLE IF NOT EXISTS)
   */
  public static async ensureTable(): Promise<void> {
    if (this.tableEnsured) return;
    try {
      await db.query(`
        CREATE TABLE IF NOT EXISTS ai_usage_metrics (
          id VARCHAR(64) PRIMARY KEY,
          event_type VARCHAR(32) NOT NULL,
          student_id VARCHAR(64),
          book_id VARCHAR(64),
          chapter_id VARCHAR(64),
          config_hash VARCHAR(64),
          cached_exam_id VARCHAR(64),
          model_name VARCHAR(64),
          prompt_tokens INT DEFAULT 0,
          candidates_tokens INT DEFAULT 0,
          total_tokens INT DEFAULT 0,
          estimated_cost_usd DOUBLE DEFAULT 0,
          duration_ms INT DEFAULT 0,
          error_code VARCHAR(64),
          is_estimated TINYINT DEFAULT 0,
          call_purpose VARCHAR(64) DEFAULT 'EXAM_GENERATION',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_metric_event (event_type),
          INDEX idx_metric_created (created_at),
          INDEX idx_metric_config (config_hash)
        )
      `);

      // Inspect schema safely without executing runtime DDL
      await this.probeColumnDefinitions();
      this.tableEnsured = true;
    } catch (err: any) {
      console.warn('⚠️ [AiUsageMetricsService] ensureTable notice:', err?.message || err);
    }
  }

  /**
   * Inspect existing columns to detect missing or incompatible schema
   */
  private static async probeColumnDefinitions(): Promise<void> {
    try {
      await db.query(`SELECT is_estimated, call_purpose FROM ai_usage_metrics LIMIT 0`);
      this.hasEstimatedColumn = true;
      this.hasCallPurposeColumn = true;
      this.schemaError = null;
    } catch (probeErr: any) {
      const msg = probeErr?.message || String(probeErr);
      const isEstMissing = msg.toLowerCase().includes('is_estimated') || msg.toLowerCase().includes('no such column') || msg.toLowerCase().includes('unknown column');
      const isPurpMissing = msg.toLowerCase().includes('call_purpose') || msg.toLowerCase().includes('no such column') || msg.toLowerCase().includes('unknown column');
      
      this.hasEstimatedColumn = !isEstMissing;
      this.hasCallPurposeColumn = !isPurpMissing;
      
      const missing: string[] = [];
      if (!this.hasEstimatedColumn) missing.push('is_estimated');
      if (!this.hasCallPurposeColumn) missing.push('call_purpose');
      
      this.schemaError = new TelemetrySchemaError(missing, msg).message;
      console.warn(`⚠️ [AiUsageMetricsService] ${this.schemaError}`);
    }

    try {
      await db.query(`SELECT correlation_id, attempt_number, cached_tokens, cost_status, grade_id, subject_id FROM ai_usage_metrics LIMIT 0`);
      this.hasCorrelationIdColumn = true;
      this.hasAttemptNumberColumn = true;
      this.hasCachedTokensColumn = true;
      this.hasCostStatusColumn = true;
      this.hasGradeIdColumn = true;
      this.hasSubjectIdColumn = true;
    } catch (_) {
      this.hasCorrelationIdColumn = false;
      this.hasAttemptNumberColumn = false;
      this.hasCachedTokensColumn = false;
      this.hasCostStatusColumn = false;
      this.hasGradeIdColumn = false;
      this.hasSubjectIdColumn = false;
    }
  }

  /**
   * Get current schema compatibility status
   */
  public static getSchemaStatus(): {
    isCompatible: boolean;
    hasEstimatedColumn: boolean;
    hasCallPurposeColumn: boolean;
    error: string | null;
  } {
    return {
      isCompatible: this.hasEstimatedColumn && this.hasCallPurposeColumn,
      hasEstimatedColumn: this.hasEstimatedColumn,
      hasCallPurposeColumn: this.hasCallPurposeColumn,
      error: this.schemaError
    };
  }

  /**
   * Standalone schema validator for pre-flight health checks and migration tests
   */
  public static async validateSchema(customQueryFn?: (sql: string) => Promise<any>): Promise<{
    valid: boolean;
    missingColumns: string[];
    error: string | null;
  }> {
    if (customQueryFn) {
      try {
        await customQueryFn(`SELECT is_estimated, call_purpose FROM ai_usage_metrics LIMIT 0`);
        return { valid: true, missingColumns: [], error: null };
      } catch (err: any) {
        const msg = err?.message || String(err);
        const missing: string[] = [];
        if (msg.includes('is_estimated')) missing.push('is_estimated');
        if (msg.includes('call_purpose')) missing.push('call_purpose');
        if (missing.length === 0) missing.push('is_estimated', 'call_purpose');
        const schemaErr = new TelemetrySchemaError(missing, msg);
        return {
          valid: false,
          missingColumns: missing,
          error: schemaErr.message
        };
      }
    }
    this.tableEnsured = false;
    await this.ensureTable();
    const missing: string[] = [];
    if (!this.hasEstimatedColumn) missing.push('is_estimated');
    if (!this.hasCallPurposeColumn) missing.push('call_purpose');
    return {
      valid: missing.length === 0,
      missingColumns: missing,
      error: this.schemaError
    };
  }

  /**
   * Asserts schema validity or throws TelemetrySchemaError
   */
  public static async assertSchemaValid(customQueryFn?: (sql: string) => Promise<any>): Promise<void> {
    const res = await this.validateSchema(customQueryFn);
    if (!res.valid) {
      throw new TelemetrySchemaError(res.missingColumns, res.error || undefined);
    }
  }

  /**
   * Reset schema check status for unit tests
   */
  public static resetSchemaStatusForTests(): void {
    this.tableEnsured = false;
    this.hasEstimatedColumn = true;
    this.hasCallPurposeColumn = true;
    this.hasCorrelationIdColumn = false;
    this.hasAttemptNumberColumn = false;
    this.hasCachedTokensColumn = false;
    this.hasCostStatusColumn = false;
    this.hasGradeIdColumn = false;
    this.hasSubjectIdColumn = false;
    this.schemaError = null;
  }

  /**
   * Record a Cache Hit event (Zero provider tokens, Zero provider cost)
   */
  public static async recordCacheHit(params: {
    studentId?: string;
    bookId?: string;
    chapterId?: string;
    configHash?: string;
    cachedExamId?: string;
  }): Promise<void> {
    await this.ensureTable();
    try {
      await db.query(
        `INSERT INTO ai_usage_metrics (
           id, event_type, student_id, book_id, chapter_id, config_hash, cached_exam_id,
           prompt_tokens, candidates_tokens, total_tokens, estimated_cost_usd, created_at
         ) VALUES ($1, 'CACHE_HIT', $2, $3, $4, $5, $6, 0, 0, 0, 0, CURRENT_TIMESTAMP)`,
        [
          uuidv4(),
          params.studentId || null,
          params.bookId || null,
          params.chapterId || null,
          params.configHash || null,
          params.cachedExamId || null
        ]
      );
    } catch (err: any) {
      console.warn('⚠️ [AiUsageMetricsService] recordCacheHit error:', err?.message || err);
    }
  }

  /**
   * Record a Cache Miss event
   */
  public static async recordCacheMiss(params: {
    studentId?: string;
    bookId?: string;
    chapterId?: string;
    configHash?: string;
    reason?: string;
  }): Promise<void> {
    await this.ensureTable();
    try {
      await db.query(
        `INSERT INTO ai_usage_metrics (
           id, event_type, student_id, book_id, chapter_id, config_hash,
           prompt_tokens, candidates_tokens, total_tokens, estimated_cost_usd, error_code, created_at
         ) VALUES ($1, 'CACHE_MISS', $2, $3, $4, $5, 0, 0, 0, 0, $6, CURRENT_TIMESTAMP)`,
        [
          uuidv4(),
          params.studentId || null,
          params.bookId || null,
          params.chapterId || null,
          params.configHash || null,
          params.reason || null
        ]
      );
    } catch (err: any) {
      console.warn('⚠️ [AiUsageMetricsService] recordCacheMiss error:', err?.message || err);
    }
  }

  /**
   * Record a Gemini Provider Call with actual token consumption and model-specific cost calculation
   */
  public static async recordProviderCall(params: {
    id?: string;
    correlationId?: string;
    studentId?: string;
    bookId?: string;
    chapterId?: string;
    gradeId?: string;
    subjectId?: string;
    configHash?: string;
    cachedExamId?: string;
    modelName: string;
    promptTokens: number;
    candidatesTokens: number;
    cachedTokens?: number;
    thinkingTokens?: number;
    totalTokens: number;
    durationMs?: number;
    isEstimated?: boolean;
    attemptNumber?: number;
    callPurpose?: string;
  }): Promise<void> {
    await this.ensureTable();
    const promptTokens = Math.max(0, params.promptTokens || 0);
    const candidateTokens = Math.max(0, params.candidatesTokens || 0);
    const cachedTokens = Math.max(0, params.cachedTokens || 0);
    const totalTokens = Math.max(promptTokens + candidateTokens, params.totalTokens || 0);
    const costUsd = this.calculateCost(params.modelName, promptTokens, candidateTokens, cachedTokens);
    const isEstimated = params.isEstimated ? 1 : 0;
    const pricing = this.getModelPricing(params.modelName);
    const costStatus = pricing.isRecognized ? 'ESTIMATED' : 'UNKNOWN';

    try {
      if (this.hasEstimatedColumn && this.hasCallPurposeColumn) {
        if (this.hasCorrelationIdColumn && this.hasAttemptNumberColumn) {
          await db.query(
            `INSERT INTO ai_usage_metrics (
               id, event_type, student_id, book_id, chapter_id, config_hash, cached_exam_id,
               model_name, prompt_tokens, candidates_tokens, total_tokens, estimated_cost_usd,
               duration_ms, is_estimated, call_purpose, correlation_id, attempt_number,
               cached_tokens, cost_status, grade_id, subject_id, created_at
             ) VALUES ($1, 'PROVIDER_CALL', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, CURRENT_TIMESTAMP)`,
            [
              params.id || uuidv4(),
              params.studentId || null,
              params.bookId || null,
              params.chapterId || null,
              params.configHash || null,
              params.cachedExamId || null,
              params.modelName || 'gemini-3-flash-preview',
              promptTokens,
              candidateTokens,
              totalTokens,
              costUsd,
              params.durationMs || 0,
              isEstimated,
              params.callPurpose || 'EXAM_GENERATION',
              params.correlationId || null,
              params.attemptNumber || 1,
              cachedTokens,
              costStatus,
              params.gradeId || null,
              params.subjectId || null
            ]
          );
        } else {
          await db.query(
            `INSERT INTO ai_usage_metrics (
               id, event_type, student_id, book_id, chapter_id, config_hash, cached_exam_id,
               model_name, prompt_tokens, candidates_tokens, total_tokens, estimated_cost_usd,
               duration_ms, is_estimated, call_purpose, created_at
             ) VALUES ($1, 'PROVIDER_CALL', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, CURRENT_TIMESTAMP)`,
            [
              params.id || uuidv4(),
              params.studentId || null,
              params.bookId || null,
              params.chapterId || null,
              params.configHash || null,
              params.cachedExamId || null,
              params.modelName || 'gemini-3-flash-preview',
              promptTokens,
              candidateTokens,
              totalTokens,
              costUsd,
              params.durationMs || 0,
              isEstimated,
              params.callPurpose || 'EXAM_GENERATION'
            ]
          );
        }
      } else {
        await db.query(
          `INSERT INTO ai_usage_metrics (
             id, event_type, student_id, book_id, chapter_id, config_hash, cached_exam_id,
             model_name, prompt_tokens, candidates_tokens, total_tokens, estimated_cost_usd,
             duration_ms, created_at
           ) VALUES ($1, 'PROVIDER_CALL', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP)`,
          [
            params.id || uuidv4(),
            params.studentId || null,
            params.bookId || null,
            params.chapterId || null,
            params.configHash || null,
            params.cachedExamId || null,
            params.modelName || 'gemini-3-flash-preview',
            promptTokens,
            candidateTokens,
            totalTokens,
            costUsd,
            params.durationMs || 0
          ]
        );
      }
    } catch (err: any) {
      console.warn('⚠️ [AiUsageMetricsService] recordProviderCall error:', err?.message || err);
    }
  }

  /**
   * Record a Provider Failure event (network timeout, rate limit, quota exhaustion, empty response)
   */
  public static async recordProviderFailure(params: {
    correlationId?: string;
    studentId?: string;
    bookId?: string;
    chapterId?: string;
    gradeId?: string;
    subjectId?: string;
    configHash?: string;
    cachedExamId?: string;
    modelName?: string;
    errorCode: string;
    durationMs?: number;
    attemptNumber?: number;
    callPurpose?: string;
  }): Promise<void> {
    await this.ensureTable();
    try {
      if (this.hasCallPurposeColumn) {
        if (this.hasCorrelationIdColumn && this.hasAttemptNumberColumn) {
          await db.query(
            `INSERT INTO ai_usage_metrics (
               id, event_type, student_id, book_id, chapter_id, config_hash,
               model_name, error_code, duration_ms, call_purpose, correlation_id,
               attempt_number, grade_id, subject_id, created_at
             ) VALUES ($1, 'PROVIDER_FAILURE', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, CURRENT_TIMESTAMP)`,
            [
              uuidv4(),
              params.studentId || null,
              params.bookId || null,
              params.chapterId || null,
              params.configHash || null,
              params.modelName || 'gemini-3-flash-preview',
              params.errorCode || 'UNKNOWN',
              params.durationMs || 0,
              params.callPurpose || 'EXAM_GENERATION',
              params.correlationId || null,
              params.attemptNumber || 1,
              params.gradeId || null,
              params.subjectId || null
            ]
          );
        } else {
          await db.query(
            `INSERT INTO ai_usage_metrics (
               id, event_type, student_id, book_id, chapter_id, config_hash,
               model_name, error_code, duration_ms, call_purpose, created_at
             ) VALUES ($1, 'PROVIDER_FAILURE', $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)`,
            [
              uuidv4(),
              params.studentId || null,
              params.bookId || null,
              params.chapterId || null,
              params.configHash || null,
              params.modelName || 'gemini-3-flash-preview',
              params.errorCode || 'UNKNOWN',
              params.durationMs || 0,
              params.callPurpose || 'EXAM_GENERATION'
            ]
          );
        }
      } else {
        await db.query(
          `INSERT INTO ai_usage_metrics (
             id, event_type, student_id, book_id, chapter_id, config_hash,
             model_name, error_code, duration_ms, created_at
           ) VALUES ($1, 'PROVIDER_FAILURE', $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)`,
          [
            uuidv4(),
            params.studentId || null,
            params.bookId || null,
            params.chapterId || null,
            params.configHash || null,
            params.modelName || 'gemini-3-flash-preview',
            params.errorCode || 'UNKNOWN',
            params.durationMs || 0
          ]
        );
      }
    } catch (err: any) {
      console.warn('⚠️ [AiUsageMetricsService] recordProviderFailure error:', err?.message || err);
    }
  }

  /**
   * Concurrency-safe budget reservation: reserves estimated cost atomically before making provider call.
   * Prevents concurrent distributed instances from bypassing the monthly budget limit.
   */
  public static async reserveBudget(params: {
    studentId?: string;
    bookId?: string;
    chapterId?: string;
    configHash?: string;
    modelName?: string;
    estimatedTokens?: number;
    callPurpose?: string;
  }): Promise<{ allowed: boolean; reservationId?: string; reason?: string; budgetStatus: MonthlyBudgetStatus }> {
    await this.ensureTable();
    const budgetStatus = await this.checkMonthlyBudgetLimit();
    if (!budgetStatus.allowed) {
      return { allowed: false, reason: budgetStatus.reason, budgetStatus };
    }

    const modelName = params.modelName || 'gemini-3-flash-preview';
    const estimatedTokens = params.estimatedTokens || 6400; // provisional baseline assumption
    const estimatedPrompt = Math.round(estimatedTokens * 0.8);
    const estimatedCandidate = estimatedTokens - estimatedPrompt;
    const estimatedCostUsd = this.calculateCost(modelName, estimatedPrompt, estimatedCandidate);

    if (budgetStatus.isEnforced && budgetStatus.remainingBudgetUsd < estimatedCostUsd) {
      return { allowed: false, reason: 'BUDGET_LIMIT_REACHED', budgetStatus };
    }

    const reservationId = uuidv4();
    try {
      if (this.hasEstimatedColumn && this.hasCallPurposeColumn) {
        await db.query(
          `INSERT INTO ai_usage_metrics (
             id, event_type, student_id, book_id, chapter_id, config_hash,
             model_name, prompt_tokens, candidates_tokens, total_tokens, estimated_cost_usd,
             is_estimated, call_purpose, created_at
           ) VALUES ($1, 'BUDGET_RESERVATION', $2, $3, $4, $5, $6, $7, $8, $9, $10, 1, $11, CURRENT_TIMESTAMP)`,
          [
            reservationId,
            params.studentId || null,
            params.bookId || null,
            params.chapterId || null,
            params.configHash || null,
            modelName,
            estimatedPrompt,
            estimatedCandidate,
            estimatedTokens,
            estimatedCostUsd,
            params.callPurpose || 'EXAM_GENERATION'
          ]
        );
      } else {
        await db.query(
          `INSERT INTO ai_usage_metrics (
             id, event_type, student_id, book_id, chapter_id, config_hash,
             model_name, prompt_tokens, candidates_tokens, total_tokens, estimated_cost_usd,
             created_at
           ) VALUES ($1, 'BUDGET_RESERVATION', $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP)`,
          [
            reservationId,
            params.studentId || null,
            params.bookId || null,
            params.chapterId || null,
            params.configHash || null,
            modelName,
            estimatedPrompt,
            estimatedCandidate,
            estimatedTokens,
            estimatedCostUsd
          ]
        );
      }
      return { allowed: true, reservationId, budgetStatus };
    } catch (err: any) {
      console.warn('⚠️ [AiUsageMetricsService] reserveBudget error:', err?.message || err);
      return { allowed: false, reason: 'RESERVATION_FAILED', budgetStatus };
    }
  }

  /**
   * Commit a previously reserved budget entry with actual provider token consumption and cost.
   */
  public static async commitReservation(params: {
    reservationId?: string;
    studentId?: string;
    bookId?: string;
    chapterId?: string;
    configHash?: string;
    cachedExamId?: string;
    modelName: string;
    promptTokens: number;
    candidatesTokens: number;
    totalTokens: number;
    durationMs?: number;
    isEstimated?: boolean;
    callPurpose?: string;
  }): Promise<void> {
    await this.ensureTable();
    if (!params.reservationId) {
      await this.recordProviderCall(params);
      return;
    }

    const promptTokens = Math.max(0, params.promptTokens || 0);
    const candidatesTokens = Math.max(0, params.candidatesTokens || 0);
    const totalTokens = Math.max(promptTokens + candidatesTokens, params.totalTokens || 0);
    const costUsd = this.calculateCost(params.modelName, promptTokens, candidatesTokens);
    const isEstimated = params.isEstimated ? 1 : 0;

    try {
      const updateFields = [
        "event_type = 'PROVIDER_CALL'",
        "student_id = COALESCE($1, student_id)",
        "book_id = COALESCE($2, book_id)",
        "chapter_id = COALESCE($3, chapter_id)",
        "config_hash = COALESCE($4, config_hash)",
        "cached_exam_id = $5",
        "model_name = $6",
        "prompt_tokens = $7",
        "candidates_tokens = $8",
        "total_tokens = $9",
        "estimated_cost_usd = $10",
        "duration_ms = $11"
      ];
      const updateParams: any[] = [
        params.studentId || null,
        params.bookId || null,
        params.chapterId || null,
        params.configHash || null,
        params.cachedExamId || null,
        params.modelName,
        promptTokens,
        candidatesTokens,
        totalTokens,
        costUsd,
        params.durationMs || 0
      ];

      if (this.hasEstimatedColumn) {
        updateParams.push(isEstimated);
        updateFields.push(`is_estimated = $${updateParams.length}`);
      }
      if (this.hasCallPurposeColumn) {
        updateParams.push(params.callPurpose || 'EXAM_GENERATION');
        updateFields.push(`call_purpose = COALESCE($${updateParams.length}, call_purpose)`);
      }
      updateParams.push(params.reservationId);
      const res = await db.query(
        `UPDATE ai_usage_metrics SET ${updateFields.join(', ')} WHERE id = $${updateParams.length}`,
        updateParams
      );
      if (res.rowCount === 0) {
        await this.recordProviderCall(params);
      }
    } catch (err: any) {
      console.warn('⚠️ [AiUsageMetricsService] commitReservation error:', err?.message || err);
    }
  }

  /**
   * Release or convert a budget reservation when provider call fails or aborts
   */
  public static async releaseReservation(
    reservationId?: string,
    failure?: { errorCode?: string; modelName?: string; durationMs?: number; callPurpose?: string }
  ): Promise<void> {
    if (!reservationId) return;
    await this.ensureTable();
    try {
      if (failure) {
        if (this.hasCallPurposeColumn) {
          await db.query(
            `UPDATE ai_usage_metrics SET
               event_type = 'PROVIDER_FAILURE',
               error_code = $1,
               model_name = COALESCE($2, model_name),
               duration_ms = $3,
               estimated_cost_usd = 0,
               prompt_tokens = 0,
               candidates_tokens = 0,
               total_tokens = 0,
               call_purpose = COALESCE($4, call_purpose)
             WHERE id = $5`,
            [
              failure.errorCode || 'UNKNOWN',
              failure.modelName || null,
              failure.durationMs || 0,
              failure.callPurpose || 'EXAM_GENERATION',
              reservationId
            ]
          );
        } else {
          await db.query(
            `UPDATE ai_usage_metrics SET
               event_type = 'PROVIDER_FAILURE',
               error_code = $1,
               model_name = COALESCE($2, model_name),
               duration_ms = $3,
               estimated_cost_usd = 0,
               prompt_tokens = 0,
               candidates_tokens = 0,
               total_tokens = 0
             WHERE id = $4`,
            [
              failure.errorCode || 'UNKNOWN',
              failure.modelName || null,
              failure.durationMs || 0,
              reservationId
            ]
          );
        }
      } else {
        await db.query(`DELETE FROM ai_usage_metrics WHERE id = $1 AND event_type = 'BUDGET_RESERVATION'`, [reservationId]);
      }
    } catch (err: any) {
      console.warn('⚠️ [AiUsageMetricsService] releaseReservation error:', err?.message || err);
    }
  }

  /**
   * Check Application-Side Monthly Budget and Token Limits before initiating new Gemini generation.
   * Includes active concurrent reservations (< 120 seconds old) so distributed instances cannot collide.
   */
  public static async checkMonthlyBudgetLimit(): Promise<MonthlyBudgetStatus> {
    await this.ensureTable();

    // 1. Fetch configurable limits from platform_settings or environment variables
    let budgetLimitUsd = parseFloat(process.env.GEMINI_MONTHLY_BUDGET_USD || '50.00');
    let tokenLimit = parseInt(process.env.GEMINI_MONTHLY_TOKEN_LIMIT || '50000000', 10);
    let isEnforced = process.env.GEMINI_BUDGET_ENFORCED !== 'false';

    try {
      const settingsRes = await db.query(
        `SELECT setting_key, setting_value FROM platform_settings
         WHERE setting_key IN ('gemini_monthly_budget_usd', 'gemini_monthly_token_limit', 'gemini_budget_enforced')`
      );
      for (const row of settingsRes.rows) {
        if (row.setting_key === 'gemini_monthly_budget_usd') {
          const val = parseFloat(row.setting_value);
          if (Number.isFinite(val) && val > 0) budgetLimitUsd = val;
        } else if (row.setting_key === 'gemini_monthly_token_limit') {
          const val = parseInt(row.setting_value, 10);
          if (Number.isFinite(val) && val > 0) tokenLimit = val;
        } else if (row.setting_key === 'gemini_budget_enforced') {
          isEnforced = row.setting_value === 'true' || row.setting_value === '1';
        }
      }
    } catch (_) {}

    if (!isEnforced) {
      return {
        allowed: true,
        currentSpendingUsd: 0,
        budgetLimitUsd,
        remainingBudgetUsd: budgetLimitUsd,
        currentTokens: 0,
        tokenLimit,
        remainingTokens: tokenLimit,
        isEnforced: false
      };
    }

    // 2. Query cumulative monthly consumption (including active concurrent reservations)
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 19).replace('T', ' ');
    const activeReservationCutoff = new Date(now.getTime() - 120_000).toISOString().slice(0, 19).replace('T', ' ');

    let currentSpendingUsd = 0;
    let currentTokens = 0;

    try {
      const usageRes = await db.query(
        `SELECT COALESCE(SUM(estimated_cost_usd), 0) AS total_spent,
                COALESCE(SUM(total_tokens), 0) AS total_tokens
         FROM ai_usage_metrics
         WHERE (
           (event_type = 'PROVIDER_CALL' AND created_at >= $1)
           OR (event_type = 'BUDGET_RESERVATION' AND created_at >= $2)
         )`,
        [startOfMonth, activeReservationCutoff]
      );
      if (usageRes.rows.length > 0) {
        currentSpendingUsd = Number(usageRes.rows[0].total_spent) || 0;
        currentTokens = Number(usageRes.rows[0].total_tokens) || 0;
      }
    } catch (_) {}

    const remainingBudgetUsd = Math.max(0, budgetLimitUsd - currentSpendingUsd);
    const remainingTokens = Math.max(0, tokenLimit - currentTokens);

    // Buffer: If less than estimated cost of 1 exam generation ($0.0062) or 3,000 tokens remains
    const MIN_GEN_COST_USD = 0.0062;
    const MIN_GEN_TOKENS = 3000;

    if (currentSpendingUsd >= budgetLimitUsd || remainingBudgetUsd < MIN_GEN_COST_USD) {
      return {
        allowed: false,
        reason: 'BUDGET_LIMIT_REACHED',
        currentSpendingUsd,
        budgetLimitUsd,
        remainingBudgetUsd,
        currentTokens,
        tokenLimit,
        remainingTokens,
        isEnforced: true
      };
    }

    if (currentTokens >= tokenLimit || remainingTokens < MIN_GEN_TOKENS) {
      return {
        allowed: false,
        reason: 'TOKEN_LIMIT_REACHED',
        currentSpendingUsd,
        budgetLimitUsd,
        remainingBudgetUsd,
        currentTokens,
        tokenLimit,
        remainingTokens,
        isEnforced: true
      };
    }

    return {
      allowed: true,
      currentSpendingUsd,
      budgetLimitUsd,
      remainingBudgetUsd,
      currentTokens,
      tokenLimit,
      remainingTokens,
      isEnforced: true
    };
  }

  /**
   * Produce comprehensive auditable telemetry report for current month or specified period
   */
  public static async getMonthlyAuditSummary(year?: number, month?: number): Promise<MonthlyAuditSummary> {
    await this.ensureTable();

    const now = new Date();
    const targetYear = year ?? now.getFullYear();
    const targetMonth = month ?? (now.getMonth() + 1);

    const startOfMonth = new Date(targetYear, targetMonth - 1, 1).toISOString().slice(0, 19).replace('T', ' ');
    const endOfMonth = new Date(targetYear, targetMonth, 1).toISOString().slice(0, 19).replace('T', ' ');

    let cacheHits = 0;
    let cacheMisses = 0;
    let providerCalls = 0;
    let providerFailures = 0;
    let promptTokens = 0;
    let candidatesTokens = 0;
    let totalTokens = 0;
    let estimatedCostUsd = 0;

    try {
      const statsRes = await db.query(
        `SELECT event_type,
                COUNT(*) as cnt,
                COALESCE(SUM(prompt_tokens), 0) as p_tokens,
                COALESCE(SUM(candidates_tokens), 0) as c_tokens,
                COALESCE(SUM(total_tokens), 0) as t_tokens,
                COALESCE(SUM(estimated_cost_usd), 0) as cost
         FROM ai_usage_metrics
         WHERE created_at >= $1 AND created_at < $2
         GROUP BY event_type`,
        [startOfMonth, endOfMonth]
      );

      for (const row of statsRes.rows) {
        const cnt = Number(row.cnt) || 0;
        switch (row.event_type) {
          case 'CACHE_HIT':
            cacheHits += cnt;
            break;
          case 'CACHE_MISS':
            cacheMisses += cnt;
            break;
          case 'PROVIDER_CALL':
            providerCalls += cnt;
            promptTokens += Number(row.p_tokens) || 0;
            candidatesTokens += Number(row.c_tokens) || 0;
            totalTokens += Number(row.t_tokens) || 0;
            estimatedCostUsd += Number(row.cost) || 0;
            break;
          case 'PROVIDER_FAILURE':
            providerFailures += cnt;
            break;
        }
      }
    } catch (_) {}

    const totalRequests = cacheHits + cacheMisses;
    const cacheHitRatePct = totalRequests > 0 ? Number(((cacheHits / totalRequests) * 100).toFixed(2)) : 0;
    const estimatedCostEgp = Number((estimatedCostUsd * this.OFFICIAL_USD_TO_EGP_RATE).toFixed(2));

    const budgetStatus = await this.checkMonthlyBudgetLimit();

    return {
      year: targetYear,
      month: targetMonth,
      totalExamRequests: totalRequests,
      cacheHits,
      cacheMisses,
      cacheHitRatePct,
      providerCalls,
      providerFailures,
      promptTokens,
      candidatesTokens,
      totalTokens,
      estimatedCostUsd: Number(estimatedCostUsd.toFixed(4)),
      estimatedCostEgp,
      budgetLimitUsd: budgetStatus.budgetLimitUsd,
      remainingBudgetUsd: budgetStatus.remainingBudgetUsd,
      exchangeRateUsdToEgp: this.OFFICIAL_USD_TO_EGP_RATE
    };
  }

  /**
   * Produce comprehensive aggregated usage and cost report by model, date range, and exam.
   * Clearly distinguishes actual token counts from estimates and estimated cost from confirmed billing.
   */
  public static async getAggregatedUsageReport(filter: {
    modelName?: string;
    startDate?: string | Date;
    endDate?: string | Date;
    cachedExamId?: string;
    bookId?: string;
  } = {}): Promise<{
    timeframe: { startDate?: string; endDate?: string };
    totals: {
      totalCalls: number;
      successfulCalls: number;
      failedCalls: number;
      actualPromptTokens: number;
      actualCandidatesTokens: number;
      actualTotalTokens: number;
      estimatedPromptTokens: number;
      estimatedCandidatesTokens: number;
      estimatedTotalTokens: number;
      grandTotalTokens: number;
      estimatedCostUsd: number;
      billingNotice: string;
    };
    byModel: Array<{
      modelName: string;
      totalCalls: number;
      successfulCalls: number;
      failedCalls: number;
      actualTokens: number;
      estimatedTokens: number;
      totalTokens: number;
      estimatedCostUsd: number;
      pricingStatus: 'VERIFIED' | 'UNKNOWN';
      effectivePricingDate?: string;
      pricingSource?: string;
    }>;
    byExam: Array<{
      cachedExamId: string;
      totalCalls: number;
      totalTokens: number;
      estimatedCostUsd: number;
    }>;
  }> {
    await this.ensureTable();

    const whereClauses: string[] = [];
    const queryParams: any[] = [];

    if (filter.startDate) {
      const startStr = typeof filter.startDate === 'string'
        ? filter.startDate
        : filter.startDate.toISOString().slice(0, 19).replace('T', ' ');
      queryParams.push(startStr);
      whereClauses.push(`created_at >= $${queryParams.length}`);
    }

    if (filter.endDate) {
      const endStr = typeof filter.endDate === 'string'
        ? filter.endDate
        : filter.endDate.toISOString().slice(0, 19).replace('T', ' ');
      queryParams.push(endStr);
      whereClauses.push(`created_at <= $${queryParams.length}`);
    }

    if (filter.modelName) {
      queryParams.push(filter.modelName);
      whereClauses.push(`model_name = $${queryParams.length}`);
    }

    if (filter.cachedExamId) {
      queryParams.push(filter.cachedExamId);
      whereClauses.push(`cached_exam_id = $${queryParams.length}`);
    }

    if (filter.bookId) {
      queryParams.push(filter.bookId);
      whereClauses.push(`book_id = $${queryParams.length}`);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    let totalCalls = 0;
    let successfulCalls = 0;
    let failedCalls = 0;
    let actualPromptTokens = 0;
    let actualCandidatesTokens = 0;
    let actualTotalTokens = 0;
    let estimatedPromptTokens = 0;
    let estimatedCandidatesTokens = 0;
    let estimatedTotalTokens = 0;
    let estimatedCostUsd = 0;

    const modelMap = new Map<string, {
      totalCalls: number;
      successfulCalls: number;
      failedCalls: number;
      actualTokens: number;
      estimatedTokens: number;
      totalTokens: number;
      estimatedCostUsd: number;
    }>();

    try {
      const isEstSelect = this.hasEstimatedColumn ? 'is_estimated' : '0 AS is_estimated';
      const statsRes = await db.query(
        `SELECT model_name, event_type, ${isEstSelect},
                COUNT(*) as cnt,
                COALESCE(SUM(prompt_tokens), 0) as p_tokens,
                COALESCE(SUM(candidates_tokens), 0) as c_tokens,
                COALESCE(SUM(total_tokens), 0) as t_tokens,
                COALESCE(SUM(estimated_cost_usd), 0) as cost
         FROM ai_usage_metrics
         ${whereSql}
         GROUP BY model_name, event_type, ${isEstSelect}`,
        queryParams
      );

      for (const row of statsRes.rows) {
        const mName = row.model_name || 'unknown';
        const cnt = Number(row.cnt) || 0;
        const pTok = Number(row.p_tokens) || 0;
        const cTok = Number(row.c_tokens) || 0;
        const tTok = Number(row.t_tokens) || 0;
        const cost = Number(row.cost) || 0;
        const isEst = Number(row.is_estimated) === 1;

        if (!modelMap.has(mName)) {
          modelMap.set(mName, {
            totalCalls: 0,
            successfulCalls: 0,
            failedCalls: 0,
            actualTokens: 0,
            estimatedTokens: 0,
            totalTokens: 0,
            estimatedCostUsd: 0
          });
        }
        const mEntry = modelMap.get(mName)!;
        mEntry.totalCalls += cnt;
        totalCalls += cnt;

        if (row.event_type === 'PROVIDER_CALL') {
          successfulCalls += cnt;
          mEntry.successfulCalls += cnt;
          mEntry.totalTokens += tTok;
          mEntry.estimatedCostUsd += cost;
          estimatedCostUsd += cost;

          if (isEst) {
            estimatedPromptTokens += pTok;
            estimatedCandidatesTokens += cTok;
            estimatedTotalTokens += tTok;
            mEntry.estimatedTokens += tTok;
          } else {
            actualPromptTokens += pTok;
            actualCandidatesTokens += cTok;
            actualTotalTokens += tTok;
            mEntry.actualTokens += tTok;
          }
        } else if (row.event_type === 'PROVIDER_FAILURE') {
          failedCalls += cnt;
          mEntry.failedCalls += cnt;
        }
      }
    } catch (err: any) {
      console.warn('⚠️ [AiUsageMetricsService] getAggregatedUsageReport stats query error:', err?.message || err);
    }

    const byModel = Array.from(modelMap.entries()).map(([modelName, stats]) => {
      const pricing = this.getModelPricing(modelName);
      return {
        modelName,
        totalCalls: stats.totalCalls,
        successfulCalls: stats.successfulCalls,
        failedCalls: stats.failedCalls,
        actualTokens: stats.actualTokens,
        estimatedTokens: stats.estimatedTokens,
        totalTokens: stats.totalTokens,
        estimatedCostUsd: Number(stats.estimatedCostUsd.toFixed(6)),
        pricingStatus: (pricing.isRecognized ? 'VERIFIED' : 'UNKNOWN') as 'VERIFIED' | 'UNKNOWN',
        effectivePricingDate: pricing.effectiveDate,
        pricingSource: pricing.source
      };
    });

    const byExam: Array<{ cachedExamId: string; totalCalls: number; totalTokens: number; estimatedCostUsd: number }> = [];
    try {
      const examWhereClauses = [...whereClauses, "cached_exam_id IS NOT NULL AND cached_exam_id != ''"];
      const examWhereSql = `WHERE ${examWhereClauses.join(' AND ')}`;
      const examRes = await db.query(
        `SELECT cached_exam_id,
                COUNT(*) as cnt,
                COALESCE(SUM(total_tokens), 0) as t_tokens,
                COALESCE(SUM(estimated_cost_usd), 0) as cost
         FROM ai_usage_metrics
         ${examWhereSql}
         GROUP BY cached_exam_id
         ORDER BY cnt DESC
         LIMIT 100`,
        queryParams
      );
      for (const row of examRes.rows) {
        byExam.push({
          cachedExamId: row.cached_exam_id,
          totalCalls: Number(row.cnt) || 0,
          totalTokens: Number(row.t_tokens) || 0,
          estimatedCostUsd: Number(Number(row.cost || 0).toFixed(6))
        });
      }
    } catch (err: any) {
      console.warn('⚠️ [AiUsageMetricsService] getAggregatedUsageReport exam query error:', err?.message || err);
    }

    return {
      timeframe: {
        startDate: filter.startDate ? String(filter.startDate) : undefined,
        endDate: filter.endDate ? String(filter.endDate) : undefined
      },
      totals: {
        totalCalls,
        successfulCalls,
        failedCalls,
        actualPromptTokens,
        actualCandidatesTokens,
        actualTotalTokens,
        estimatedPromptTokens,
        estimatedCandidatesTokens,
        estimatedTotalTokens,
        grandTotalTokens: actualTotalTokens + estimatedTotalTokens,
        estimatedCostUsd: Number(estimatedCostUsd.toFixed(6)),
        billingNotice: 'Estimated provider cost is calculated from verified per-model token pricing rates. Confirmed billing is determined exclusively by Google Cloud / Gemini official invoices.'
      },
      byModel,
      byExam
    };
  }
}
