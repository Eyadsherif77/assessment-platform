import fs from 'fs';
import path from 'path';

export class DurableReplayCache {
  private cacheFilePath: string;
  private consumedJtiMap: Map<string, number>; // jti -> expMs

  constructor(filePath: string) {
    this.cacheFilePath = filePath;
    this.consumedJtiMap = new Map<string, number>();
    this.loadFromDisk();
  }

  private loadFromDisk(): void {
    try {
      const dir = path.dirname(this.cacheFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      if (fs.existsSync(this.cacheFilePath)) {
        const raw = fs.readFileSync(this.cacheFilePath, 'utf8');
        const parsed = JSON.parse(raw);
        const now = Date.now();
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (item.jti && item.expMs && item.expMs > now) {
              this.consumedJtiMap.set(item.jti, item.expMs);
            }
          }
        }
      }
    } catch (err: any) {
      console.warn(`⚠️ [ReplayCache] Notice loading replay cache from ${this.cacheFilePath}:`, err.message);
    }
  }

  private persistToDisk(): void {
    try {
      const now = Date.now();
      const activeEntries: { jti: string; expMs: number }[] = [];
      for (const [jti, expMs] of this.consumedJtiMap.entries()) {
        if (expMs > now) {
          activeEntries.push({ jti, expMs });
        } else {
          this.consumedJtiMap.delete(jti);
        }
      }
      fs.writeFileSync(this.cacheFilePath, JSON.stringify(activeEntries, null, 2), 'utf8');
    } catch (err: any) {
      console.warn(`⚠️ [ReplayCache] Notice writing replay cache:`, err.message);
    }
  }

  /**
   * Check if a jti has already been consumed
   */
  public isConsumed(jti: string): boolean {
    const expMs = this.consumedJtiMap.get(jti);
    if (!expMs) return false;
    if (expMs < Date.now()) {
      this.consumedJtiMap.delete(jti);
      return false;
    }
    return true;
  }

  /**
   * Mark a jti as consumed until its expiration timestamp
   */
  public consume(jti: string, expSeconds: number): void {
    const expMs = expSeconds * 1000;
    this.consumedJtiMap.set(jti, expMs);
    this.persistToDisk();
  }

  /**
   * For tests and cleanup
   */
  public clear(): void {
    this.consumedJtiMap.clear();
    try {
      if (fs.existsSync(this.cacheFilePath)) {
        fs.unlinkSync(this.cacheFilePath);
      }
    } catch (_) {}
  }
}

