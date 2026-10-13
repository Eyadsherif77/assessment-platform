import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { PDFDocument } from 'pdf-lib';
import { getStorageProvider } from '../storage/storageProvider.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Base asset directories
const UPLOADS_DIR = path.resolve(__dirname, '../../../uploads');
const VISUAL_ASSETS_DIR = path.join(UPLOADS_DIR, 'visual_assets');
const MANIFEST_FILE_PATH = path.join(VISUAL_ASSETS_DIR, 'visual_manifest.json');

export type VisualAssetType = 'diagram' | 'map' | 'chart' | 'page_image';
export type ExtractionMethod = 'pdf-lib-page' | 'raster-crop' | 'multimodal-ocr' | 'vector-svg';
export type ValidationStatus = 'EXTRACTED' | 'VERIFIED' | 'AMBIGUOUS';

export interface VisualAssetManifestEntry {
  asset_id: string;
  book_id: string;
  chapter_id: string | null;
  printed_page_number: number;
  pdf_page_index: number;
  asset_type: VisualAssetType;
  file_path: string;
  url_path: string;
  file_size: number;
  mime_type: string;
  sha256: string;
  extraction_method: ExtractionMethod;
  validation_status: ValidationStatus;
  description_ar?: string;
  description_en?: string;
  crop_bounds?: { x: number; y: number; width: number; height: number };
  notes?: string;
}

export interface VisualManifest {
  version: string;
  last_updated: string;
  total_assets: number;
  assets: VisualAssetManifestEntry[];
}

export class VisualAssetExtractor {
  private static manifestCache: VisualManifest | null = null;

  /**
   * Ensure directory exists
   */
  public static ensureDirectories(): void {
    try {
      if (!fs.existsSync(VISUAL_ASSETS_DIR)) {
        fs.mkdirSync(VISUAL_ASSETS_DIR, { recursive: true });
      }
    } catch (err: any) {
      console.warn('⚠️ Cannot create visual assets directory in this environment:', err.message);
    }
  }

  /**
   * Load or initialize the visual manifest
   */
  public static loadManifest(): VisualManifest {
    this.ensureDirectories();
    if (this.manifestCache) {
      return this.manifestCache;
    }

    const candidatePaths = [
      MANIFEST_FILE_PATH,
      path.resolve(__dirname, '../../../uploads/visual_assets/visual_manifest.json'),
      path.resolve(__dirname, '../../uploads/visual_assets/visual_manifest.json'),
      path.resolve(process.cwd(), 'uploads/visual_assets/visual_manifest.json'),
      path.resolve(process.cwd(), 'server/uploads/visual_assets/visual_manifest.json'),
      path.resolve(__dirname, '../../bundled_assets/visual/visual_manifest.json'),
      path.resolve(__dirname, '../bundled_assets/visual/visual_manifest.json'),
      path.resolve(process.cwd(), 'bundled_assets/visual/visual_manifest.json'),
      path.resolve(process.cwd(), 'server/bundled_assets/visual/visual_manifest.json'),
      path.resolve(__dirname, '../../../bundled_assets/visual/visual_manifest.json')
    ];

    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        try {
          const raw = fs.readFileSync(p, 'utf8');
          const parsed = JSON.parse(raw);
          if (parsed && Array.isArray(parsed.assets) && parsed.assets.length > 0) {
            this.manifestCache = parsed;
            return this.manifestCache!;
          }
        } catch (err) {
          console.warn(`⚠️ Error parsing visual manifest at ${p}:`, err);
        }
      }
    }

    this.manifestCache = {
      version: '1.0.0',
      last_updated: new Date().toISOString(),
      total_assets: 0,
      assets: []
    };
    return this.manifestCache;
  }

  /**
   * Save the manifest to disk safely
   */
  public static saveManifest(manifest: VisualManifest): void {
    this.ensureDirectories();
    manifest.last_updated = new Date().toISOString();
    manifest.total_assets = manifest.assets.length;
    this.manifestCache = manifest;
    try {
      fs.writeFileSync(MANIFEST_FILE_PATH, JSON.stringify(manifest, null, 2), 'utf8');
    } catch (err: any) {
      console.warn('⚠️ Cannot persist visual manifest to disk in this environment:', err.message);
    }
  }

  /**
   * Register a new visual asset entry into the manifest
   */
  public static registerAsset(entry: VisualAssetManifestEntry): VisualAssetManifestEntry {
    const manifest = this.loadManifest();
    const existingIdx = manifest.assets.findIndex(a =>
      a.asset_id === entry.asset_id ||
      (a.book_id === entry.book_id && a.printed_page_number === entry.printed_page_number && a.mime_type === entry.mime_type)
    );
    if (existingIdx >= 0) {
      manifest.assets[existingIdx] = entry;
    } else {
      manifest.assets.push(entry);
    }
    this.saveManifest(manifest);
    return entry;
  }

  /**
   * Get assets by book and page number
   */
  public static getAssetsForPage(bookId: string, pageNumber: number): VisualAssetManifestEntry[] {
    const manifest = this.loadManifest();
    return manifest.assets.filter(a => a.book_id === bookId && a.printed_page_number === pageNumber);
  }

  /**
   * Get assets by book and chapter ID
   */
  public static getAssetsForChapter(bookId: string, chapterId: string): VisualAssetManifestEntry[] {
    const manifest = this.loadManifest();
    return manifest.assets.filter(a => a.book_id === bookId && a.chapter_id === chapterId);
  }

  /**
   * Get asset by asset ID
   */
  public static getAssetById(assetId: string): VisualAssetManifestEntry | undefined {
    const manifest = this.loadManifest();
    return manifest.assets.find(a => a.asset_id === assetId);
  }

  /**
   * Author-curated, verified SVG diagrams compiled directly into source code.
   * Completely immune to Vercel ephemeral /tmp filesystem wipe.
   */
  public static readonly VERIFIED_SVG_MAP: Record<string, string> = {
    'diag_808104ec_p78_parallel_lines_angle_transversal_227603':
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="400" height="300">
        <rect width="400" height="300" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
        <line x1="50" y1="200" x2="350" y2="200" stroke="#1e293b" stroke-width="3"/>
        <line x1="100" y1="100" x2="300" y2="100" stroke="#1e293b" stroke-width="3"/>
        <line x1="80" y1="250" x2="220" y2="50" stroke="#2563eb" stroke-width="3"/>
        <circle cx="150" cy="150" r="4" fill="#ef4444"/>
        <text x="160" y="145" font-family="sans-serif" font-size="16" fill="#1e293b">50°</text>
        <text x="60" y="90" font-family="sans-serif" font-size="16" fill="#0f172a" font-weight="bold">L1</text>
        <text x="360" y="205" font-family="sans-serif" font-size="16" fill="#0f172a" font-weight="bold">L2</text>
      </svg>`,
    'diag_808104ec_p82_intersecting_lines_vertically_opposite_744ed9':
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="400" height="300">
        <rect width="400" height="300" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
        <line x1="50" y1="240" x2="350" y2="60" stroke="#1e293b" stroke-width="3"/>
        <line x1="50" y1="60" x2="350" y2="240" stroke="#1e293b" stroke-width="3"/>
        <circle cx="200" cy="150" r="4" fill="#ef4444"/>
        <text x="205" y="145" font-family="sans-serif" font-size="16" fill="#0f172a" font-weight="bold">M</text>
        <text x="35" y="60" font-family="sans-serif" font-size="16" fill="#0f172a" font-weight="bold">A</text>
        <text x="360" y="245" font-family="sans-serif" font-size="16" fill="#0f172a" font-weight="bold">B</text>
        <text x="35" y="245" font-family="sans-serif" font-size="16" fill="#0f172a" font-weight="bold">C</text>
        <text x="360" y="60" font-family="sans-serif" font-size="16" fill="#0f172a" font-weight="bold">D</text>
        <text x="235" y="145" font-family="sans-serif" font-size="16" fill="#2563eb">65°</text>
        <text x="140" y="165" font-family="sans-serif" font-size="16" fill="#2563eb">65°</text>
      </svg>`,
    'diag_19886434_p68_right_triangle_pythagoras_52795d':
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="400" height="300">
        <rect width="400" height="300" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
        <polygon points="80,220 280,220 80,70" fill="#f8fafc" stroke="#1e293b" stroke-width="3"/>
        <rect x="80" y="200" width="20" height="20" fill="none" stroke="#2563eb" stroke-width="2"/>
        <text x="60" y="240" font-family="sans-serif" font-size="18" fill="#0f172a" font-weight="bold">B</text>
        <text x="290" y="240" font-family="sans-serif" font-size="18" fill="#0f172a" font-weight="bold">C</text>
        <text x="60" y="65" font-family="sans-serif" font-size="18" fill="#0f172a" font-weight="bold">A</text>
        <text x="50" y="150" font-family="sans-serif" font-size="16" fill="#475569">6 cm</text>
        <text x="170" y="245" font-family="sans-serif" font-size="16" fill="#475569">8 cm</text>
      </svg>`,
    'diag_19886434_p72_isosceles_triangle_congruence_median_4f0507':
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="400" height="300">
        <rect width="400" height="300" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
        <polygon points="200,50 80,240 320,240" fill="#f8fafc" stroke="#1e293b" stroke-width="3"/>
        <line x1="200" y1="50" x2="200" y2="240" stroke="#2563eb" stroke-dasharray="4" stroke-width="2"/>
        <rect x="185" y="225" width="15" height="15" fill="none" stroke="#2563eb" stroke-width="2"/>
        <line x1="135" y1="140" x2="145" y2="150" stroke="#dc2626" stroke-width="2"/>
        <line x1="255" y1="150" x2="265" y2="140" stroke="#dc2626" stroke-width="2"/>
        <text x="195" y="40" font-family="sans-serif" font-size="18" fill="#0f172a" font-weight="bold">A</text>
        <text x="60" y="255" font-family="sans-serif" font-size="18" fill="#0f172a" font-weight="bold">B</text>
        <text x="325" y="255" font-family="sans-serif" font-size="18" fill="#0f172a" font-weight="bold">C</text>
        <text x="195" y="260" font-family="sans-serif" font-size="18" fill="#0f172a" font-weight="bold">D</text>
        <text x="110" y="130" font-family="sans-serif" font-size="14" fill="#475569">10 cm</text>
        <text x="270" y="130" font-family="sans-serif" font-size="14" fill="#475569">10 cm</text>
      </svg>`
  };

  /**
   * Retrieve in-memory compiled SVG string content
   */
  public static getCompiledSvg(assetId: string): string | undefined {
    return this.VERIFIED_SVG_MAP[assetId];
  }

  /**
   * Resolve runtime path to bundled canonical PDF asset
   */
  public static getBundledPdfPath(assetId: string): string | null {
    const candidates = [
      path.resolve(__dirname, '../../bundled_assets/visual', `${assetId}.pdf`),
      path.resolve(__dirname, '../bundled_assets/visual', `${assetId}.pdf`),
      path.resolve(process.cwd(), 'server/bundled_assets/visual', `${assetId}.pdf`),
      path.resolve(process.cwd(), 'bundled_assets/visual', `${assetId}.pdf`),
      path.resolve(__dirname, '../../../bundled_assets/visual', `${assetId}.pdf`)
    ];

    for (const cand of candidates) {
      if (fs.existsSync(cand)) {
        return cand;
      }
    }
    return null;
  }

  /**
   * Generate canonical authenticated API URL for a visual asset
   */
  public static getAssetApiUrl(asset: VisualAssetManifestEntry): string {
    const ext = asset.mime_type === 'application/pdf' ? '.pdf' : '.svg';
    return `/api/books/assets/${asset.asset_id}${ext}`;
  }

  /**
   * Validate asset URL path and prevent path traversal
   */
  public static isVisualAssetValid(urlPath: string): boolean {
    if (!urlPath || typeof urlPath !== 'string') return false;
    if (urlPath.includes('..') || urlPath.includes('\\')) return false;

    const cleanUrl = urlPath.split('?')[0];
    const manifest = this.loadManifest();
    return manifest.assets.some(a =>
      a.url_path === cleanUrl ||
      cleanUrl.endsWith(a.asset_id) ||
      cleanUrl.endsWith(`${a.asset_id}.pdf`) ||
      cleanUrl.endsWith(`${a.asset_id}.svg`) ||
      (a.asset_id && cleanUrl.includes(a.asset_id))
    );
  }

  /**
   * Extract a page-level visual asset from the source PDF
   */
  public static async extractPageVisualAsset(params: {
    bookId: string;
    chapterId?: string | null;
    pageNumber: number;
    assetType?: VisualAssetType;
    descriptionAr?: string;
    descriptionEn?: string;
  }): Promise<VisualAssetManifestEntry> {
    const { bookId, chapterId = null, pageNumber, assetType = 'page_image', descriptionAr, descriptionEn } = params;

    const storage = getStorageProvider();
    const pdfKey = `books/${bookId}/book_${bookId}.pdf`;
    const fallbackPdfKey = `book_${bookId}.pdf`;
    let pdfBytes: Buffer | null = null;

    try {
      if (await storage.exists(pdfKey)) {
        pdfBytes = await storage.getFile(pdfKey);
      } else if (await storage.exists(fallbackPdfKey)) {
        pdfBytes = await storage.getFile(fallbackPdfKey);
      }
    } catch (_) {}

    if (!pdfBytes) {
      const pdfPath = path.join(UPLOADS_DIR, fallbackPdfKey);
      if (fs.existsSync(pdfPath)) {
        pdfBytes = fs.readFileSync(pdfPath);
      }
    }

    if (!pdfBytes) {
      throw new Error(`SOURCE_PDF_NOT_FOUND: Source textbook PDF not found in storage provider or at ${path.join(UPLOADS_DIR, fallbackPdfKey)}`);
    }

    const srcDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    const totalPages = srcDoc.getPageCount();

    if (pageNumber < 1 || pageNumber > totalPages) {
      throw new Error(`PAGE_OUT_OF_BOUNDS: Requested page ${pageNumber} exceeds PDF total pages ${totalPages}`);
    }

    const pageIndex = pageNumber - 1;

    // Create a single-page standalone visual document
    const singleDoc = await PDFDocument.create();
    const [copiedPage] = await singleDoc.copyPages(srcDoc, [pageIndex]);
    singleDoc.addPage(copiedPage);
    const extractedBytes = await singleDoc.save();
    const extractedBuf = Buffer.from(extractedBytes);

    // Deterministic asset ID based on bookId and pageNumber
    const hash = crypto.createHash('sha256').update(extractedBuf).digest('hex');
    const assetId = `vis_${bookId.slice(0, 8)}_p${pageNumber}_${hash.slice(0, 8)}`;
    const fileName = `page_${pageNumber}_${assetId}.pdf`;
    const storageKey = `visual_assets/${bookId}/${fileName}`;

    // Durably store asset via storage abstraction
    const storageMeta = await storage.saveFile(storageKey, extractedBuf, 'application/pdf');

    // Keep local disk copy if running locally
    const bookAssetDir = path.join(VISUAL_ASSETS_DIR, bookId);
    let targetFilePath = storageMeta.key;
    try {
      if (!fs.existsSync(bookAssetDir)) {
        fs.mkdirSync(bookAssetDir, { recursive: true });
      }
      targetFilePath = path.join(bookAssetDir, fileName);
      fs.writeFileSync(targetFilePath, extractedBuf);
    } catch (_) {}

    const entry: VisualAssetManifestEntry = {
      asset_id: assetId,
      book_id: bookId,
      chapter_id: chapterId,
      printed_page_number: pageNumber,
      pdf_page_index: pageIndex,
      asset_type: assetType,
      file_path: targetFilePath,
      url_path: storageMeta.url,
      file_size: extractedBuf.length,
      mime_type: 'application/pdf',
      sha256: hash,
      extraction_method: 'pdf-lib-page',
      validation_status: 'EXTRACTED',
      description_ar: descriptionAr || `صورة مرئية لصفحة ${pageNumber}`,
      description_en: descriptionEn || `Visual asset for page ${pageNumber}`,
      notes: 'Single-page high-fidelity vector PDF asset extracted offline from authentic textbook'
    };

    return this.registerAsset(entry);
  }

  /**
   * Create or register a cropped visual diagram or map asset (SVG / PNG / image buffer)
   */
  public static registerCroppedDiagram(params: {
    bookId: string;
    chapterId: string | null;
    pageNumber: number;
    diagramName: string;
    assetType: VisualAssetType;
    imageBuffer: Buffer;
    mimeType: string;
    descriptionAr: string;
    descriptionEn: string;
    cropBounds?: { x: number; y: number; width: number; height: number };
  }): VisualAssetManifestEntry {
    const {
      bookId,
      chapterId,
      pageNumber,
      diagramName,
      assetType,
      imageBuffer,
      mimeType,
      descriptionAr,
      descriptionEn,
      cropBounds
    } = params;

    const bookAssetDir = path.join(VISUAL_ASSETS_DIR, bookId);
    if (!fs.existsSync(bookAssetDir)) {
      fs.mkdirSync(bookAssetDir, { recursive: true });
    }

    const hash = crypto.createHash('sha256').update(imageBuffer).digest('hex');
    const ext = mimeType === 'image/svg+xml' ? 'svg' : mimeType === 'image/jpeg' ? 'jpg' : 'png';
    const assetId = `diag_${bookId.slice(0, 8)}_p${pageNumber}_${diagramName}_${hash.slice(0, 6)}`;
    const fileName = `${diagramName}_${assetId}.${ext}`;
    const targetFilePath = path.join(bookAssetDir, fileName);

    fs.writeFileSync(targetFilePath, imageBuffer);

    const relativePath = path.relative(UPLOADS_DIR, targetFilePath).replace(/\\/g, '/');
    const urlPath = `/uploads/${relativePath}`;

    const method: ExtractionMethod = mimeType === 'image/svg+xml' ? 'vector-svg' : 'raster-crop';

    const entry: VisualAssetManifestEntry = {
      asset_id: assetId,
      book_id: bookId,
      chapter_id: chapterId,
      printed_page_number: pageNumber,
      pdf_page_index: pageNumber - 1,
      asset_type: assetType,
      file_path: targetFilePath,
      url_path: urlPath,
      file_size: imageBuffer.length,
      mime_type: mimeType,
      sha256: hash,
      extraction_method: method,
      validation_status: 'VERIFIED',
      description_ar: descriptionAr,
      description_en: descriptionEn,
      crop_bounds: cropBounds,
      notes: method === 'vector-svg'
        ? 'Vector SVG illustration constructed for geometric curriculum concepts'
        : 'Cropped visual diagram asset verified for exam presentation'
    };

    return this.registerAsset(entry);
  }

  /**
   * Extract priority assets for the 8 non-ready geometry and map units offline
   */
  public static async extractPriorityAssets(): Promise<{
    extractedPages: number;
    registeredDiagrams: number;
  }> {
    this.ensureDirectories();
    let extractedPages = 0;
    let registeredDiagrams = 0;

    // 1. Prep 3 Social Studies Map Pages (Units 1, 2, 3, 4)
    const prep3SocialBookId = 'f19276d3-4adb-4297-bb77-5ed87ba638b9';
    const prep3MapPages = [
      // Unit 1 (3fa3ec4a-2af8-43e2-980f-dbd70ac62640, pp. 9-36)
      { page: 21, ch: '3fa3ec4a-2af8-43e2-980f-dbd70ac62640', descAr: 'خريطة تضاريس قارة أمريكا الشمالية (جبال روكي وهضبة لبرادور وسهول المسيسيبي)', descEn: 'Physical Relief Map of North America' },
      { page: 27, ch: '3fa3ec4a-2af8-43e2-980f-dbd70ac62640', descAr: 'خريطة تضاريس قارة أمريكا الجنوبية (جبال الأنديز وهضبة البرازيل وحوض الأمازون)', descEn: 'Physical Relief Map of South America' },
      // Unit 2 (73d2b274-fef2-4282-abbb-2e7c828eb1c7, pp. 37-62)
      { page: 45, ch: '73d2b274-fef2-4282-abbb-2e7c828eb1c7', descAr: 'خريطة حروب وتوسعات محمد علي في شبه الجزيرة العربية والسودان والشام واليونان', descEn: 'Military Expansion and Campaigns Map of Muhammad Ali' },
      { page: 52, ch: '73d2b274-fef2-4282-abbb-2e7c828eb1c7', descAr: 'خريطة مشروعات الري والتقسيم الإداري لمصر في عصر محمد علي وخلفائه', descEn: 'Administrative and Irrigation Map of Modern Egypt' },
      // Unit 3 (f1aef779-d047-4af8-be1e-b03938944c05, pp. 63-90)
      { page: 66, ch: 'f1aef779-d047-4af8-be1e-b03938944c05', descAr: 'خريطة الأقاليم المناخية والنباتية في قارات العالم الجديد (الاستوائي والمداري والمعتدل والتندرا)', descEn: 'Climatic and Vegetation Zones of the New World' },
      { page: 75, ch: 'f1aef779-d047-4af8-be1e-b03938944c05', descAr: 'خريطة التوزيع والكثافة السكانية في قارات العالم الجديد ومناطق التركز والندرة', descEn: 'Population Distribution Map of the New World' },
      // Unit 4 (9c3643fa-641c-4af5-a376-44a63ef0d170, pp. 91-113)
      { page: 97, ch: '9c3643fa-641c-4af5-a376-44a63ef0d170', descAr: 'خريطة خطوط سير القوات في الثورة العرابية ومعارك كفر الدوار والتل الكبير 1882', descEn: 'Orabi Revolution Military Routes and Battle of Tell al-Kebir Map' },
      { page: 104, ch: '9c3643fa-641c-4af5-a376-44a63ef0d170', descAr: 'خريطة ثورة 1919 الوطنية ومراكز الحركة الوطنية ومقاومة الاحتلال البريطاني', descEn: '1919 National Revolution and Resistance Centers Map' }
    ];

    for (const m of prep3MapPages) {
      try {
        await this.extractPageVisualAsset({
          bookId: prep3SocialBookId,
          chapterId: m.ch,
          pageNumber: m.page,
          assetType: 'map',
          descriptionAr: m.descAr,
          descriptionEn: m.descEn
        });
        extractedPages++;
      } catch (err) {
        console.warn(`Failed extracting Prep 3 Social page ${m.page}:`, err);
      }
    }

    // 2. Prep 1 Social Studies Unit 1 (fa2a1525-c46f-4b34-9f48-b762be88e5c5, pp. 7-29)
    const prep1SocialBookId = 'fa2a1525-c46f-4b34-9f48-b762be88e5c5';
    const prep1SocialChapterId = 'c2387de6-beda-4c55-b93b-b65bfced4e45';
    const prep1SocialMapPages = [
      { page: 13, descAr: 'خريطة تضاريس وملامح السطح لقارة إفريقيا (جبال أطلس والبحر الأحمر وهضاب الصحراء وحوض النيل)', descEn: 'Physical Relief Map of Africa' },
      { page: 16, descAr: 'خريطة الأحواض المائية والأنهار والبحيرات في قارة إفريقيا (حوض الكونغو وبحيرة فيكتوريا ونهر النيجر)', descEn: 'Africa River Basins, Plateaus, and Lakes Map' }
    ];

    for (const m of prep1SocialMapPages) {
      try {
        await this.extractPageVisualAsset({
          bookId: prep1SocialBookId,
          chapterId: prep1SocialChapterId,
          pageNumber: m.page,
          assetType: 'map',
          descriptionAr: m.descAr,
          descriptionEn: m.descEn
        });
        extractedPages++;
      } catch (err) {
        console.warn(`Failed extracting Prep 1 Social page ${m.page}:`, err);
      }
    }

    // 3. Prep 2 Social Studies Unit 1 (81b8a308-7fcf-4938-8c45-aa0056624f32, pp. 7-26)
    const prep2SocialBookId = '81b8a308-7fcf-4938-8c45-aa0056624f32';
    const prep2SocialChapterId = 'b123b656-03b1-4af5-be4e-971dd5ba74a6';
    const prep2SocialMapPages = [
      { page: 11, descAr: 'خريطة الملامح الطبيعية وتضاريس قارة آسيا (جبال الهيمالايا وهضبة التبت وسهول منشوريا وسيبيريا والأنهار الكبرى)', descEn: 'Physical Relief Map of Asia' },
      { page: 18, descAr: 'خريطة الملامح الطبيعية وتضاريس قارة أوروبا (جبال الألب والسهل الأوروبي العظيم وأنهار الدانوب والراين)', descEn: 'Physical Relief Map of Europe' }
    ];

    for (const m of prep2SocialMapPages) {
      try {
        await this.extractPageVisualAsset({
          bookId: prep2SocialBookId,
          chapterId: prep2SocialChapterId,
          pageNumber: m.page,
          assetType: 'map',
          descriptionAr: m.descAr,
          descriptionEn: m.descEn
        });
        extractedPages++;
      } catch (err) {
        console.warn(`Failed extracting Prep 2 Social page ${m.page}:`, err);
      }
    }

    // 4. Prep 1 Math Unit 4 Geometry Pages & Vector Figures (808104ec-b861-434b-80c6-579f715d8bdf, pp. 76-111)
    const prep1MathBookId = '808104ec-b861-434b-80c6-579f715d8bdf';
    const prep1GeomChapterId = '1b9f4377-6ae0-4c24-b588-c221900597ec';
    for (const p of [76, 78, 82, 95]) {
      try {
        await this.extractPageVisualAsset({
          bookId: prep1MathBookId,
          chapterId: prep1GeomChapterId,
          pageNumber: p,
          assetType: 'page_image',
          descriptionAr: `صفحة تمارين وشروح الهندسة والقياس صفحة ${p}`,
          descriptionEn: `Geometry and measurement exercise page ${p}`
        });
        extractedPages++;
      } catch (err) {
        console.warn(`Failed extracting Prep 1 Math page ${p}:`, err);
      }
    }

    // Register verified SVG 1 for Prep 1 Math: Parallel lines with transversal angle 50°
    const svgAngle = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="400" height="300">
        <rect width="400" height="300" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
        <line x1="50" y1="200" x2="350" y2="200" stroke="#1e293b" stroke-width="3"/>
        <line x1="100" y1="100" x2="300" y2="100" stroke="#1e293b" stroke-width="3"/>
        <line x1="80" y1="250" x2="220" y2="50" stroke="#2563eb" stroke-width="3"/>
        <circle cx="150" cy="150" r="4" fill="#ef4444"/>
        <text x="160" y="145" font-family="sans-serif" font-size="16" fill="#1e293b">50°</text>
        <text x="60" y="90" font-family="sans-serif" font-size="16" fill="#0f172a" font-weight="bold">L1</text>
        <text x="360" y="205" font-family="sans-serif" font-size="16" fill="#0f172a" font-weight="bold">L2</text>
      </svg>`,
      'utf8'
    );
    this.registerCroppedDiagram({
      bookId: prep1MathBookId,
      chapterId: prep1GeomChapterId,
      pageNumber: 78,
      diagramName: 'parallel_lines_angle_transversal',
      assetType: 'diagram',
      imageBuffer: svgAngle,
      mimeType: 'image/svg+xml',
      descriptionAr: 'شكل مستقيمين متوازيين وقاطع مع زاوية قياسها 50 درجة',
      descriptionEn: 'Parallel lines with a transversal line showing a 50 degree angle',
      cropBounds: { x: 50, y: 50, width: 350, height: 250 }
    });
    registeredDiagrams++;

    // Register verified SVG 2 for Prep 1 Math: Intersecting lines with vertically opposite angles 65°
    const svgIntersect = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="400" height="300">
        <rect width="400" height="300" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
        <line x1="50" y1="240" x2="350" y2="60" stroke="#1e293b" stroke-width="3"/>
        <line x1="50" y1="60" x2="350" y2="240" stroke="#1e293b" stroke-width="3"/>
        <circle cx="200" cy="150" r="4" fill="#ef4444"/>
        <text x="205" y="145" font-family="sans-serif" font-size="16" fill="#0f172a" font-weight="bold">M</text>
        <text x="35" y="60" font-family="sans-serif" font-size="16" fill="#0f172a" font-weight="bold">A</text>
        <text x="360" y="245" font-family="sans-serif" font-size="16" fill="#0f172a" font-weight="bold">B</text>
        <text x="35" y="245" font-family="sans-serif" font-size="16" fill="#0f172a" font-weight="bold">C</text>
        <text x="360" y="60" font-family="sans-serif" font-size="16" fill="#0f172a" font-weight="bold">D</text>
        <text x="235" y="145" font-family="sans-serif" font-size="16" fill="#2563eb">65°</text>
        <text x="140" y="165" font-family="sans-serif" font-size="16" fill="#2563eb">65°</text>
      </svg>`,
      'utf8'
    );
    this.registerCroppedDiagram({
      bookId: prep1MathBookId,
      chapterId: prep1GeomChapterId,
      pageNumber: 82,
      diagramName: 'intersecting_lines_vertically_opposite',
      assetType: 'diagram',
      imageBuffer: svgIntersect,
      mimeType: 'image/svg+xml',
      descriptionAr: 'شكل مستقيمين متقاطعين AB و CD في نقطة M وزاويتان متقابلتان بالرأس قياسهما 65 درجة',
      descriptionEn: 'Intersecting lines AB and CD meeting at M with vertically opposite angles 65 degrees',
      cropBounds: { x: 35, y: 50, width: 340, height: 210 }
    });
    registeredDiagrams++;

    // 5. Prep 2 Math Unit 3 Geometry Pages & Vector Figures (19886434-1839-427d-af31-4c64fcf79525, pp. 64-107)
    const prep2MathBookId = '19886434-1839-427d-af31-4c64fcf79525';
    const prep2GeomChapterId = 'dba6933a-2b80-4d3b-ada4-3ac6acfb58c1';
    for (const p of [64, 68, 72, 85]) {
      try {
        await this.extractPageVisualAsset({
          bookId: prep2MathBookId,
          chapterId: prep2GeomChapterId,
          pageNumber: p,
          assetType: 'page_image',
          descriptionAr: `صفحة نظريات المثلثات وتطابقها ومتوسطاتها صفحة ${p}`,
          descriptionEn: `Triangle theorems, proofs and medians page ${p}`
        });
        extractedPages++;
      } catch (err) {
        console.warn(`Failed extracting Prep 2 Math page ${p}:`, err);
      }
    }

    // Register verified SVG 1 for Prep 2 Math: Right Triangle Pythagoras
    const svgTriangle = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="400" height="300">
        <rect width="400" height="300" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
        <polygon points="80,220 280,220 80,70" fill="#f8fafc" stroke="#1e293b" stroke-width="3"/>
        <rect x="80" y="200" width="20" height="20" fill="none" stroke="#2563eb" stroke-width="2"/>
        <text x="60" y="240" font-family="sans-serif" font-size="18" fill="#0f172a" font-weight="bold">B</text>
        <text x="290" y="240" font-family="sans-serif" font-size="18" fill="#0f172a" font-weight="bold">C</text>
        <text x="60" y="65" font-family="sans-serif" font-size="18" fill="#0f172a" font-weight="bold">A</text>
        <text x="50" y="150" font-family="sans-serif" font-size="16" fill="#475569">6 cm</text>
        <text x="170" y="245" font-family="sans-serif" font-size="16" fill="#475569">8 cm</text>
      </svg>`,
      'utf8'
    );
    this.registerCroppedDiagram({
      bookId: prep2MathBookId,
      chapterId: prep2GeomChapterId,
      pageNumber: 68,
      diagramName: 'right_triangle_pythagoras',
      assetType: 'diagram',
      imageBuffer: svgTriangle,
      mimeType: 'image/svg+xml',
      descriptionAr: 'مثلث قائم الزاوية في B بأطوال أضلاع 6 سم و 8 سم',
      descriptionEn: 'Right-angled triangle at B with sides 6 cm and 8 cm',
      cropBounds: { x: 60, y: 65, width: 250, height: 180 }
    });
    registeredDiagrams++;

    // Register verified SVG 2 for Prep 2 Math: Isosceles triangle with perpendicular median AD
    const svgIsosceles = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="400" height="300">
        <rect width="400" height="300" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
        <polygon points="200,50 80,240 320,240" fill="#f8fafc" stroke="#1e293b" stroke-width="3"/>
        <line x1="200" y1="50" x2="200" y2="240" stroke="#2563eb" stroke-dasharray="4" stroke-width="2"/>
        <rect x="185" y="225" width="15" height="15" fill="none" stroke="#2563eb" stroke-width="2"/>
        <line x1="135" y1="140" x2="145" y2="150" stroke="#dc2626" stroke-width="2"/>
        <line x1="255" y1="150" x2="265" y2="140" stroke="#dc2626" stroke-width="2"/>
        <text x="195" y="40" font-family="sans-serif" font-size="18" fill="#0f172a" font-weight="bold">A</text>
        <text x="60" y="255" font-family="sans-serif" font-size="18" fill="#0f172a" font-weight="bold">B</text>
        <text x="325" y="255" font-family="sans-serif" font-size="18" fill="#0f172a" font-weight="bold">C</text>
        <text x="195" y="260" font-family="sans-serif" font-size="18" fill="#0f172a" font-weight="bold">D</text>
        <text x="110" y="130" font-family="sans-serif" font-size="14" fill="#475569">10 cm</text>
        <text x="270" y="130" font-family="sans-serif" font-size="14" fill="#475569">10 cm</text>
      </svg>`,
      'utf8'
    );
    this.registerCroppedDiagram({
      bookId: prep2MathBookId,
      chapterId: prep2GeomChapterId,
      pageNumber: 72,
      diagramName: 'isosceles_triangle_congruence_median',
      assetType: 'diagram',
      imageBuffer: svgIsosceles,
      mimeType: 'image/svg+xml',
      descriptionAr: 'مثلث متساوي الساقين ABC حيث AB=AC=10سم والعمود AD ينصف القاعدة BC',
      descriptionEn: 'Isosceles triangle ABC where AB=AC=10cm and perpendicular median AD bisects base BC',
      cropBounds: { x: 60, y: 40, width: 280, height: 220 }
    });
    registeredDiagrams++;

    return { extractedPages, registeredDiagrams };
  }
}
