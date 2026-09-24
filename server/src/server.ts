import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { db } from './db/db.js';
import { seedDatabase } from './db/seed.js';

import authRoutes from './routes/auth.js';
import metaRoutes from './routes/meta.js';
import booksRoutes from './routes/books.js';
import questionBanksRoutes from './routes/questionBanks.js';
import examsRoutes from './routes/exams.js';
import aiRoutes from './routes/ai.js';
import analyticsRoutes from './routes/analytics.js';
import adminRoutes from './routes/admin.js';
import hierarchyRoutes from './routes/hierarchy.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

// Uploads directory safe for serverless /tmp
const uploadsDir = process.env.VERCEL
  ? path.resolve('/tmp', 'uploads')
  : path.resolve(process.cwd(), 'uploads');
try {
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
} catch (e) {
  console.warn('Uploads directory creation warning:', e);
}

// Middlewares
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',')
  : ['http://localhost:5173', 'http://localhost:3000'];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, etc.) or from allowed origins
    if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
      callback(null, true);
    } else {
      callback(null, true); // In MVP mode, allow all — tighten for production
    }
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static uploaded textbook files
app.use('/uploads', express.static(uploadsDir));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/meta', metaRoutes);
app.use('/api/books', booksRoutes);
app.use('/api/question-banks', questionBanksRoutes);
app.use('/api/exams', examsRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/hierarchy', hierarchyRoutes);

// Root welcome & API status
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    platform: 'منصة التقييم من أجل التعلم',
    description: 'National AI Assessment Platform API Service',
    version: '1.0.0',
    endpoints: {
      health: '/api/health',
      meta: '/api/meta',
      auth: '/api/auth',
      books: '/api/books',
      exams: '/api/exams'
    },
    timestamp: new Date().toISOString()
  });
});

// Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    platform: 'منصة التقييم من أجل التعلم',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// SEO: Robots.txt
app.get('/robots.txt', (req, res) => {
  const host = req.get('host') || 'client-pied-alpha.vercel.app';
  res.type('text/plain');
  res.send(`User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: https://${host}/sitemap.xml\n`);
});

// SEO: Dynamic XML Sitemap
app.get('/sitemap.xml', (req, res) => {
  const host = req.get('host') || 'client-pied-alpha.vercel.app';
  const baseUrl = `https://${host}`;
  const now = new Date().toISOString().split('T')[0];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${baseUrl}/</loc>
    <lastmod>${now}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${baseUrl}/?view=home</loc>
    <lastmod>${now}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
</urlset>`;

  res.type('application/xml');
  res.send(xml);
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err.type === 'entity.parse.failed' || err.status === 400) {
    return res.status(400).json({ error: 'صيغة البيانات (JSON) المرسلة غير صالحة' });
  }
  console.error('Unhandled server error:', err);
  res.status(500).json({ error: 'حدث خطأ غير متوقع في الخادم: ' + (err.message || 'Error') });
});


// Export app for serverless environments (Vercel)
export default app;

// Initialize DB and launch server
async function startServer() {
  try {
    console.log(`🚀 Starting Assessment Platform Server on port: ${PORT}...`);
    try {
      await db.init();
      await seedDatabase();
    } catch (dbErr) {
      console.warn('Initial DB connect/seed warning:', dbErr);
    }

    app.listen(PORT, () => {
      console.log(`✨ Server running on port ${PORT}`);
      console.log(`📡 Health check ready`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
  }
}

if (!process.env.VERCEL) {
  startServer();
}
