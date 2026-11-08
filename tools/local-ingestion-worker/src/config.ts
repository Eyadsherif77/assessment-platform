import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { DurableReplayCache } from './replayCache.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Priority: 1. .env.worker (local override), 2. server/.env (fallback for dev)
const workerEnvPath = path.resolve(__dirname, '../.env.worker');
const serverEnvPath = path.resolve(__dirname, '../../../server/.env');

if (fs.existsSync(workerEnvPath)) {
  dotenv.config({ path: workerEnvPath });
} else if (fs.existsSync(serverEnvPath)) {
  dotenv.config({ path: serverEnvPath });
} else {
  dotenv.config();
}

export interface WorkerConfiguration {
  port: number;
  host: string;
  allowedOrigins: string[];
  workerPublicKey: string; // RS256 Public Key (PEM format) - NEVER symmetric secret
  gatewayBaseUrl: string; // Cloud Gateway Endpoint (HTTPS) - Zero direct DB credentials
  localStorageDir: string;
  replayCachePath: string;
  geminiApiKey?: string;
  ocrBatchPageLimit: number;
  ocrConcurrency: number;
}

const defaultOrigins = [
  'https://farabi-ai.com',
  'https://www.farabi-ai.com',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:3000'
];

const envOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()).filter(Boolean)
  : [];

const allowedOrigins = Array.from(new Set([...defaultOrigins, ...envOrigins]));

const rawStorageDir = process.env.LOCAL_STORAGE_DIR || 'C:\\FarabiAI\\storage\\books';
let localStorageDir = path.resolve(rawStorageDir);

try {
  if (!fs.existsSync(localStorageDir)) {
    fs.mkdirSync(localStorageDir, { recursive: true });
  }
} catch (_) {
  localStorageDir = path.resolve(__dirname, '../storage/books');
  fs.mkdirSync(localStorageDir, { recursive: true });
}

// Load Asymmetric RS256 Public Key
function loadPublicKey(): string {
  if (process.env.WORKER_PUBLIC_KEY_PEM) {
    return process.env.WORKER_PUBLIC_KEY_PEM.replace(/\\n/g, '\n');
  }

  const keyFilePath = process.env.WORKER_PUBLIC_KEY_FILE || path.resolve(__dirname, '../keys/worker_public_key.pem');
  if (fs.existsSync(keyFilePath)) {
    return fs.readFileSync(keyFilePath, 'utf8');
  }

  const serverKeyPath = path.resolve(__dirname, '../../../server/keys/worker_public_key.pem');
  if (fs.existsSync(serverKeyPath)) {
    return fs.readFileSync(serverKeyPath, 'utf8');
  }

  // Placeholder notice if not yet configured
  return '';
}

let configuredPublicKey = loadPublicKey();

export function setWorkerPublicKey(pemKey: string): void {
  configuredPublicKey = pemKey;
  workerConfig.workerPublicKey = pemKey;
}

const replayCachePath = path.resolve(localStorageDir, '../consumed_jti_cache.json');
export const durableReplayCache = new DurableReplayCache(replayCachePath);

export const workerConfig: WorkerConfiguration = {
  port: parseInt(process.env.WORKER_PORT || '5050', 10),
  host: '127.0.0.1', // Strict loopback binding
  allowedOrigins,
  workerPublicKey: configuredPublicKey,
  gatewayBaseUrl: process.env.FARABI_CLOUD_GATEWAY_URL || 'http://localhost:3000',
  localStorageDir,
  replayCachePath,
  geminiApiKey: process.env.GEMINI_API_KEY,
  ocrBatchPageLimit: parseInt(process.env.OCR_BATCH_PAGE_LIMIT || '20', 10),
  ocrConcurrency: parseInt(process.env.GEMINI_OCR_MAX_CONCURRENCY || '2', 10)
};
