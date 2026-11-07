import { db } from '../db/db.js';
import { v4 as uuidv4 } from 'uuid';

export const ALLOWED_DEVICE_LIMITS = [1, 2, 3, 5] as const;
export type AllowedDeviceLimit = (typeof ALLOWED_DEVICE_LIMITS)[number];
export const DEFAULT_DEVICE_LIMIT: AllowedDeviceLimit = 2;

/**
 * Keyed In-Process Async Mutex to prevent race conditions during concurrent device registration.
 * Ensures that simultaneous device registration requests for the same user execute serially.
 */
class UserRegistrationLock {
  private activeLocks = new Map<string, Promise<void>>();

  public async runWithLock<T>(userId: string, task: () => Promise<T>): Promise<T> {
    while (this.activeLocks.has(userId)) {
      await this.activeLocks.get(userId);
    }

    let releaseLock!: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    this.activeLocks.set(userId, lockPromise);

    try {
      return await task();
    } finally {
      this.activeLocks.delete(userId);
      releaseLock();
    }
  }
}

const userLock = new UserRegistrationLock();

// In-memory cache for global device limit to avoid unnecessary DB queries on high throughput
let cachedGlobalLimit: { value: number; timestamp: number } | null = null;
const CACHE_TTL_MS = 10_000; // 10 seconds

export class DeviceLimitService {
  /**
   * Validate whether a given value is a permitted device limit (1, 2, 3, or 5).
   */
  public static isValidLimit(value: any): value is AllowedDeviceLimit {
    if (typeof value !== 'number' && typeof value !== 'string') return false;
    const num = Number(value);
    if (!Number.isInteger(num)) return false;
    return ALLOWED_DEVICE_LIMITS.includes(num as any);
  }

  /**
   * Invalidate local memory cache.
   */
  public static clearCache(): void {
    cachedGlobalLimit = null;
  }

  /**
   * Retrieve the global device limit stored in platform_settings.
   * Falls back to DEFAULT_DEVICE_LIMIT (2) if not configured.
   */
  public static async getGlobalDeviceLimit(): Promise<AllowedDeviceLimit> {
    const now = Date.now();
    if (cachedGlobalLimit && (now - cachedGlobalLimit.timestamp < CACHE_TTL_MS)) {
      return cachedGlobalLimit.value as AllowedDeviceLimit;
    }

    try {
      const res = await db.query(
        `SELECT setting_value FROM platform_settings WHERE setting_key = 'max_devices_per_user' LIMIT 1`
      );

      if (res.rows.length > 0) {
        const val = parseInt(String(res.rows[0].setting_value), 10);
        if (DeviceLimitService.isValidLimit(val)) {
          cachedGlobalLimit = { value: val, timestamp: now };
          return val;
        }
      }
    } catch (err) {
      console.warn('⚠️ Could not query max_devices_per_user from platform_settings, using default:', err);
    }

    cachedGlobalLimit = { value: DEFAULT_DEVICE_LIMIT, timestamp: now };
    return DEFAULT_DEVICE_LIMIT;
  }

  /**
   * Update the global device limit in platform_settings and synchronize existing student profiles.
   * Only values in [1, 2, 3, 5] are accepted.
   */
  public static async setGlobalDeviceLimit(limitInput: any, updatedBy: string): Promise<AllowedDeviceLimit> {
    if (!DeviceLimitService.isValidLimit(limitInput)) {
      throw new Error('الحد الأقصى للأجهزة يجب أن يكون رقماً صحيحاً من بين: 1، 2، 3، أو 5 فقط.');
    }

    const validatedLimit = Number(limitInput) as AllowedDeviceLimit;
    const now = new Date().toISOString();

    // 1. Persist into platform_settings
    try {
      await db.query(
        `INSERT INTO platform_settings (setting_key, setting_value, updated_at, updated_by)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (setting_key) DO UPDATE SET setting_value = $2, updated_at = $3, updated_by = $4`,
        ['max_devices_per_user', String(validatedLimit), now, updatedBy]
      );
    } catch (_) {
      // MySQL / TiDB REPLACE INTO fallback
      await db.query(
        `REPLACE INTO platform_settings (setting_key, setting_value, updated_at, updated_by)
         VALUES ($1, $2, $3, $4)`,
        ['max_devices_per_user', String(validatedLimit), now, updatedBy]
      );
    }

    // 2. Synchronize existing student profiles to reflect the new global limit
    try {
      await db.query(`UPDATE student_profiles SET max_devices = $1`, [validatedLimit]);
    } catch (err) {
      console.warn('⚠️ Error synchronizing student_profiles max_devices:', err);
    }

    DeviceLimitService.clearCache();
    return validatedLimit;
  }

  /**
   * Retrieve the effective device limit for a specific user.
   * If the user is a student with a custom override in student_profiles, that override is used.
   * Otherwise, the global device limit is used.
   */
  public static async getUserEffectiveLimit(userId: string): Promise<number> {
    try {
      const sp = await db.query(
        `SELECT max_devices FROM student_profiles WHERE user_id = $1 LIMIT 1`,
        [userId]
      );
      if (sp.rows.length > 0 && sp.rows[0].max_devices != null) {
        const customLimit = parseInt(String(sp.rows[0].max_devices), 10);
        if (Number.isInteger(customLimit) && customLimit > 0) {
          return customLimit;
        }
      }
    } catch (_) {}

    return await DeviceLimitService.getGlobalDeviceLimit();
  }

  /**
   * Concurrency-safe Device Registration / Session Validation.
   * Serializes requests per user to ensure that simultaneous logins cannot exceed the allowed limit.
   */
  public static async registerOrValidateDevice(params: {
    userId: string;
    deviceId: string;
    deviceName?: string;
    clientIp: string;
  }): Promise<{
    success: boolean;
    isExisting: boolean;
    allowedMax: number;
    currentDevicesCount: number;
    activeDevices: any[];
    error?: string;
  }> {
    const { userId, deviceId, deviceName = 'متصفح المستخدم', clientIp } = params;

    return await userLock.runWithLock(userId, async () => {
      const allowedMax = await DeviceLimitService.getUserEffectiveLimit(userId);

      // Fetch all currently active devices for this user
      const devicesRes = await db.query(
        `SELECT id, device_id, device_name, ip_address, last_active_at, created_at
         FROM user_active_devices
         WHERE user_id = $1
         ORDER BY last_active_at DESC`,
        [userId]
      );

      const activeDevices = devicesRes.rows || [];
      const existing = activeDevices.find((d: any) => d.device_id === deviceId);

      if (existing) {
        // Device is already recognized: update its last activity timestamp & IP
        try {
          await db.query(
            `UPDATE user_active_devices
             SET last_active_at = datetime('now'), ip_address = $1, device_name = $2
             WHERE user_id = $3 AND device_id = $4`,
            [clientIp, deviceName, userId, deviceId]
          );
        } catch (_) {}

        return {
          success: true,
          isExisting: true,
          allowedMax,
          currentDevicesCount: activeDevices.length,
          activeDevices
        };
      }

      // New device attempting registration: check against configured limit
      if (activeDevices.length >= allowedMax) {
        return {
          success: false,
          isExisting: false,
          allowedMax,
          currentDevicesCount: activeDevices.length,
          activeDevices,
          error: `تم بلوغ الحد الأقصى للأجهزة المصرح بها لهذا الحساب (${allowedMax} أجهزة كحد أقصى). يرجى تسجيل الخروج من أحد أجهزتك السابقة أو مراجعة إدارة المنصة.`
        };
      }

      // Safe slot available: register new device
      const newRecordId = uuidv4();
      await db.query(
        `INSERT INTO user_active_devices (id, user_id, device_id, device_name, ip_address, last_active_at)
         VALUES ($1, $2, $3, $4, $5, datetime('now'))`,
        [newRecordId, userId, deviceId, deviceName, clientIp]
      );

      const updatedDevices = [
        { id: newRecordId, device_id: deviceId, device_name: deviceName, ip_address: clientIp },
        ...activeDevices
      ];

      return {
        success: true,
        isExisting: false,
        allowedMax,
        currentDevicesCount: updatedDevices.length,
        activeDevices: updatedDevices
      };
    });
  }

  /**
   * Revoke a single device for a given user.
   */
  public static async revokeDevice(userId: string, deviceIdentifier: string): Promise<boolean> {
    const res = await db.query(
      `DELETE FROM user_active_devices WHERE user_id = $1 AND (device_id = $2 OR id = $2)`,
      [userId, deviceIdentifier]
    );
    return (res.rowCount || 0) > 0;
  }

  /**
   * Revoke all registered devices for a given user.
   */
  public static async revokeAllDevices(userId: string): Promise<boolean> {
    const res = await db.query(
      `DELETE FROM user_active_devices WHERE user_id = $1`,
      [userId]
    );
    return (res.rowCount || 0) > 0;
  }

  /**
   * Check if a specific device session is currently active.
   */
  public static async isDeviceActive(userId: string, deviceId: string): Promise<boolean> {
    const res = await db.query(
      `SELECT id FROM user_active_devices WHERE user_id = $1 AND device_id = $2 LIMIT 1`,
      [userId, deviceId]
    );
    return res.rows.length > 0;
  }
}

