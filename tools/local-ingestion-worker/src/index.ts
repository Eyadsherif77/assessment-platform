import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { workerConfig } from './config.js';
import { workerSecurityGuard, AuthenticatedAdminRequest } from './authMiddleware.js';
import { LocalIngestionRunner } from './localIngestionRunner.js';
import { WorkerGatewayClient } from './workerGatewayClient.js';

const app = express();

// Disable x-powered-by header
app.disable('x-powered-by');

// Apply security guard to all incoming requests
app.use(workerSecurityGuard);

// JSON parser with safe limit for metadata
app.use(express.json({ limit: '5mb' }));

// Configure multer storage directly into the local archive directory
const diskStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, workerConfig.localStorageDir);
  },
  filename: (_req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._\-\u0600-\u06FF]/g, '_');
    const uniqueName = `upload_${Date.now()}_${safeName}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage: diskStorage,
  limits: {
    fileSize: 500 * 1024 * 1024 // 500 MB max PDF size
  },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
      cb(null, true);
    } else {
      cb(new Error('الملف المرفوع يجب أن يكون بصيغة PDF فقط.'));
    }
  }
});

/**
 * Health & Diagnostics Endpoint (Zero Direct Database Credentials)
 */
app.get('/api/worker/health', async (_req, res) => {
  const memoryUsage = process.memoryUsage();

  return res.json({
    status: 'ONLINE',
    service: 'Farabi Local Ingestion Worker',
    version: '1.1.0',
    platform: process.platform,
    arch: process.arch,
    pid: process.pid,
    uptimeSeconds: Math.round(process.uptime()),
    databaseIsolation: {
      directDbCredentials: false,
      gatewayConfigured: true,
      gatewayBaseUrl: workerConfig.gatewayBaseUrl
    },
    localStorageDir: workerConfig.localStorageDir,
    memory: {
      rssMb: Math.round(memoryUsage.rss / 1024 / 1024),
      heapUsedMb: Math.round(memoryUsage.heapUsed / 1024 / 1024),
      heapTotalMb: Math.round(memoryUsage.heapTotal / 1024 / 1024)
    }
  });
});

/**
 * Direct High-Speed Textbook Upload & Ingestion Endpoint
 */
app.post('/api/worker/upload', upload.single('file'), async (req: AuthenticatedAdminRequest, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'لم يتم استلام أي ملف PDF.' });
  }

  const {
    title_ar,
    title_en,
    academic_stage_id,
    grade_id,
    subject_id,
    term = 1,
    school_type = 'كلاهما',
    book_id,
    session_token
  } = req.body;

  if (!title_ar || !academic_stage_id || !grade_id || !subject_id) {
    fs.unlink(req.file.path, () => {});
    return res.status(400).json({ error: 'بيانات الكتاب الأساسية غير مكتملة (العنوان، المرحلة، الصف، المادة).' });
  }

  const uploadedFilePath = req.file.path;
  const fileName = req.file.originalname;

  try {
    const gatewayClient = session_token ? new WorkerGatewayClient({ sessionToken: session_token }) : undefined;

    // Launch ingestion asynchronously in local Node background
    const taskPromise = LocalIngestionRunner.executeIngestion({
      bookId: book_id,
      titleAr: title_ar.trim(),
      titleEn: title_en ? title_en.trim() : title_ar.trim(),
      academicStageId: academic_stage_id,
      gradeId: grade_id,
      subjectId: subject_id,
      term: parseInt(String(term), 10) || 1,
      schoolType: school_type,
      pdfFilePath: uploadedFilePath,
      fileName,
      gatewayClient
    });

    taskPromise.catch(bgErr => {
      console.error(`🚨 [Local Worker] Background task error for "${title_ar}":`, bgErr.message);
    });

    return res.status(202).json({
      success: true,
      message: 'تم استلام ملف الكتاب محلياً وبدأت المعالجة والاستخراج بالذكاء الاصطناعي.',
      fileName,
      fileSizeBytes: req.file.size,
      status: 'PROCESSING'
    });

  } catch (err: any) {
    fs.unlink(uploadedFilePath, () => {});
    console.error('Error starting local ingestion:', err);
    return res.status(500).json({ error: 'فشل بدء معالجة الكتاب محلياً: ' + err.message });
  }
});

/**
 * Query Task Status
 */
app.get('/api/worker/tasks/:jobId', (req, res) => {
  const task = LocalIngestionRunner.getTaskStatus(req.params.jobId);
  if (!task) {
    return res.status(404).json({ error: 'المهمة غير موجودة في الذاكرة المحلية.' });
  }
  return res.json(task);
});

/**
 * Query Task Status by Book ID
 */
app.get('/api/worker/tasks/by-book/:bookId', (req: AuthenticatedAdminRequest, res) => {
  const task = LocalIngestionRunner.getTaskByBookId(req.params.bookId);
  if (!task) {
    return res.status(404).json({ error: 'لا توجد مهمة نشطة لهذا الكتاب حالياً.' });
  }
  return res.json(task);
});

/**
 * Start Ingestion via Scoped Cloud Session (Zero Direct DB Access)
 */
app.post('/api/worker/session/start', async (req: AuthenticatedAdminRequest, res) => {
  const {
    bookId,
    jobId,
    sessionToken,
    generationId,
    gatewayBaseUrl,
    titleAr,
    titleEn,
    academicStageId,
    gradeId,
    subjectId,
    term,
    schoolType
  } = req.body;

  if (!bookId || !sessionToken) {
    return res.status(400).json({ error: 'Missing required bookId or sessionToken.' });
  }

  // Enforce token scoping
  if (req.adminUser?.bookId && req.adminUser.bookId !== bookId) {
    return res.status(403).json({ error: `Forbidden: Token is scoped for book ${req.adminUser.bookId}, not ${bookId}.` });
  }

  try {
    const started = await LocalIngestionRunner.startSessionIngestion({
      bookId,
      jobId,
      sessionToken,
      generationId,
      gatewayBaseUrl,
      titleAr,
      titleEn,
      academicStageId,
      gradeId,
      subjectId,
      term,
      schoolType
    });

    return res.status(202).json({
      success: true,
      message: 'بدأت معالجة الكتاب محلياً بناءً على الجلسة المعتمدة.',
      jobId: started.jobId,
      status: 'IN_PROGRESS'
    });
  } catch (err: any) {
    console.error('Error starting session ingestion:', err);
    return res.status(500).json({ error: 'فشل بدء معالجة الجلسة محلياً: ' + err.message });
  }
});

/**
 * Cancel Ingestion Task
 */
app.post('/api/worker/tasks/:jobId/cancel', (req: AuthenticatedAdminRequest, res) => {
  if (req.adminUser?.jobId && req.adminUser.jobId !== req.params.jobId) {
    return res.status(403).json({ error: `Forbidden: Token is scoped for job ${req.adminUser.jobId}, not ${req.params.jobId}.` });
  }
  const cancelled = LocalIngestionRunner.cancelTask(req.params.jobId);
  if (!cancelled) {
    return res.status(404).json({ error: 'المهمة غير موجودة أو انتهت بالفعل.' });
  }
  return res.json({ success: true, message: 'تم إلغاء المهمة بنجاح.' });
});

/**
 * List Active Tasks
 */
app.get('/api/worker/tasks', (_req, res) => {
  return res.json({
    tasks: LocalIngestionRunner.listTasks()
  });
});

// Start Server strictly bound to loopback 127.0.0.1
const server = app.listen(workerConfig.port, workerConfig.host, () => {
  console.log('==============================================================================');
  console.log(`🚀 FARABI LOCAL INGESTION WORKER ACTIVE (GATEWAY CLIENT MODE)`);
  console.log(`📍 Loopback Address:    http://${workerConfig.host}:${workerConfig.port}`);
  console.log(`☁️  Cloud Gateway Base:  ${workerConfig.gatewayBaseUrl}`);
  console.log(`📁 Local Storage:       ${workerConfig.localStorageDir}`);
  console.log(`🛡️  Origin Guard:       ${workerConfig.allowedOrigins.join(', ')}`);
  console.log('==============================================================================');
});

// Graceful Shutdown
function handleShutdown(signal: string) {
  console.log(`\n🛑 [Worker] Received ${signal}. Initiating graceful shutdown...`);
  server.close(() => {
    console.log('✅ [Worker] HTTP listener closed.');
    process.exit(0);
  });
  setTimeout(() => {
    console.warn('⚠️ [Worker] Forcing process exit.');
    process.exit(1);
  }, 5000);
}

process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));

export { app, server };
