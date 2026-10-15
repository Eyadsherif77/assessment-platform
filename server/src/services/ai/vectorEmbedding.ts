// In-memory embedding cache for sub-millisecond retrieval of repeated queries
const embeddingCache = new Map<string, number[]>();

export async function generateEmbedding(text: string): Promise<number[]> {
  const cacheKey = text.trim().slice(0, 500);
  if (embeddingCache.has(cacheKey)) {
    return embeddingCache.get(cacheKey)!;
  }

  const geminiKey = process.env.GEMINI_API_KEY;

  if (geminiKey) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'models/gemini-embedding-001',
            content: { parts: [{ text: text.slice(0, 2048) }] }
          })
        }
      );
      if (response.ok) {
        const data = await response.json();
        if (data.embedding?.values) {
          embeddingCache.set(cacheKey, data.embedding.values);
          return data.embedding.values;
        }
      }
    } catch (e) {
      console.warn('⚠️ Gemini embedding failed, falling back to local semantic vectorizer:', e);
    }
  }

  // Robust educational vectorizer (768 dimensions)
  const fallbackVec = createSemanticVector(text, 768);
  embeddingCache.set(cacheKey, fallbackVec);
  return fallbackVec;
}

// Normalized 768-dim semantic hash vectorizer
export function createSemanticVector(text: string, dimensions = 768): number[] {
  const vec = new Array(dimensions).fill(0);
  const normalized = text.toLowerCase().trim();
  const words = normalized.split(/\s+/);

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    let hash = 0;
    for (let j = 0; j < word.length; j++) {
      hash = (hash << 5) - hash + word.charCodeAt(j);
      hash |= 0;
    }
    const idx = Math.abs(hash) % dimensions;
    const weight = 1.0 + (word.length > 4 ? 0.5 : 0);
    vec[idx] += weight;

    // Bi-gram pairing for contextual semantic continuity
    if (i > 0) {
      const pairHash = Math.abs(hash ^ (words[i - 1].length * 31)) % dimensions;
      vec[pairHash] += 0.75;
    }
  }

  // Cosine normalization
  let norm = 0;
  for (let i = 0; i < dimensions; i++) {
    norm += vec[i] * vec[i];
  }
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < dimensions; i++) {
      vec[i] = Number((vec[i] / norm).toFixed(6));
    }
  } else {
    vec[0] = 1.0;
  }

  return vec;
}

export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length || vecA.length === 0) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

export interface VectorValidationResult {
  valid: boolean;
  vector?: number[];
  error?: string;
}

export function validateEmbeddingVector(
  raw: any,
  expectedDim = 768,
  expectedModel?: string
): VectorValidationResult {
  if (raw === null || raw === undefined) {
    return { valid: false, error: 'Vector is null or empty' };
  }

  let vectorArray: any[] = raw;

  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) {
      return { valid: false, error: 'Vector is null or empty' };
    }
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object') {
        if (parsed.model && expectedModel && parsed.model !== expectedModel) {
          return {
            valid: false,
            error: `Model mismatch: expected ${expectedModel}, got ${parsed.model}`
          };
        }
        if (Array.isArray(parsed.values)) {
          vectorArray = parsed.values;
        } else if (Array.isArray(parsed)) {
          vectorArray = parsed;
        } else {
          return { valid: false, error: 'Invalid vector format: missing vector values array' };
        }
      } else {
        return { valid: false, error: 'Invalid vector JSON structure' };
      }
    } catch {
      return { valid: false, error: 'Failed to parse vector JSON string' };
    }
  }

  if (!Array.isArray(vectorArray) || vectorArray.length === 0) {
    return { valid: false, error: 'Vector is null or empty' };
  }

  if (vectorArray.length !== expectedDim) {
    return {
      valid: false,
      error: `Dimension mismatch: expected ${expectedDim}, got ${vectorArray.length}`
    };
  }

  for (let i = 0; i < vectorArray.length; i++) {
    const val = vectorArray[i];
    if (typeof val !== 'number' || isNaN(val) || !isFinite(val)) {
      return {
        valid: false,
        error: `Invalid numeric value at index ${i}: ${val}`
      };
    }
  }

  return { valid: true, vector: vectorArray };
}

function normalizeArabicBM25(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/ـ+/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function computeEducationalBM25Score(query: string, document: string): number {
  if (!query || !document) return 0;

  const normQuery = normalizeArabicBM25(query);
  const normDoc = normalizeArabicBM25(document);

  if (!normQuery || !normDoc) return 0;

  const queryTerms = normQuery.split(/\s+/).filter(t => t.length > 1);
  if (queryTerms.length === 0) return 0;

  const docWords = normDoc.split(/\s+/);
  if (docWords.length === 0) return 0;

  const docFreq = new Map<string, number>();
  for (const w of docWords) {
    docFreq.set(w, (docFreq.get(w) || 0) + 1);
    if (w.startsWith('ال') && w.length > 3) {
      const stripped = w.slice(2);
      docFreq.set(stripped, (docFreq.get(stripped) || 0) + 1);
    }
  }

  const k1 = 1.2;
  const b = 0.75;
  const avgDocLength = 50;
  const docLength = docWords.length;

  let score = 0;
  let matches = 0;

  for (const term of queryTerms) {
    let tf = docFreq.get(term) || 0;
    if (tf === 0 && term.startsWith('ال') && term.length > 3) {
      tf = docFreq.get(term.slice(2)) || 0;
    }
    if (tf === 0) {
      tf = docFreq.get('ال' + term) || 0;
    }

    if (tf > 0) {
      matches++;
      const num = tf * (k1 + 1);
      const denom = tf + k1 * (1 - b + b * (docLength / avgDocLength));
      score += num / denom;
    }
  }

  if (matches === 0) return 0;

  const queryCoverage = matches / queryTerms.length;
  const finalScore = Number((0.4 * queryCoverage + 0.6 * Math.min(1.0, score / queryTerms.length)).toFixed(4));
  return finalScore;
}

