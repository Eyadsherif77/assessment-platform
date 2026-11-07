import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDisposableTestDb, assertDatabaseIsDisposable } from './test_isolation_helper.mjs';
import { v4 as uuidv4 } from 'uuid';

test('FARABI AI — Admin Device Limit Selector, Persistence, and Server-Side Enforcement', async (t) => {
  const { tempDir, dbPath } = setupDisposableTestDb('device_limit');
  const dbModule = await import('../dist/db/db.js');
  const db = dbModule.db || dbModule.default || dbModule;
  await db.init();
  assertDatabaseIsDisposable(db, dbPath);

  const { DeviceLimitService, ALLOWED_DEVICE_LIMITS } = await import('../dist/services/deviceLimitService.js');

  t.after(() => {
    try {
      db.close?.();
    } catch (_) {}
  });

  // Setup Admin and Student Users
  const adminId = uuidv4();
  const studentId = uuidv4();
  await db.query(
    `INSERT INTO users (id, email, username, password_hash, role, full_name, is_active)
     VALUES ($1, 'admin@farabi.edu', 'admin_main', 'hash', 'ADMIN', 'Super Admin', 1)`,
    [adminId]
  );
  await db.query(
    `INSERT INTO users (id, email, username, password_hash, role, full_name, is_active)
     VALUES ($1, 'student@farabi.edu', 'student_1', 'hash', 'STUDENT', 'Test Student', 1)`,
    [studentId]
  );
  const gradeRes = await db.query('SELECT id, stage_id FROM grades LIMIT 1');
  const stageId = gradeRes.rows[0]?.stage_id || 'stage-1';
  const gradeId = gradeRes.rows[0]?.id || 'grade-1';

  await db.query(
    `INSERT INTO student_profiles (user_id, full_name, school_name, academic_stage_id, grade_id, school_type, student_code, max_devices)
     VALUES ($1, 'Test Student', 'Farabi School', $2, $3, 'عربي', 'ST-100', 2)`,
    [studentId, stageId, gradeId]
  );

  // =========================================================================
  // SUITE A: Selector and Persistence Tests
  // =========================================================================
  await t.test('A1. Validates supported limits (1, 2, 3, 5) and rejects invalid inputs', () => {
    assert.deepEqual([...ALLOWED_DEVICE_LIMITS], [1, 2, 3, 5]);

    // Valid inputs
    assert.equal(DeviceLimitService.isValidLimit(1), true);
    assert.equal(DeviceLimitService.isValidLimit(2), true);
    assert.equal(DeviceLimitService.isValidLimit(3), true);
    assert.equal(DeviceLimitService.isValidLimit(5), true);
    assert.equal(DeviceLimitService.isValidLimit('1'), true);
    assert.equal(DeviceLimitService.isValidLimit('5'), true);

    // Invalid inputs
    assert.equal(DeviceLimitService.isValidLimit(0), false);
    assert.equal(DeviceLimitService.isValidLimit(-1), false);
    assert.equal(DeviceLimitService.isValidLimit(4), false);
    assert.equal(DeviceLimitService.isValidLimit(6), false);
    assert.equal(DeviceLimitService.isValidLimit(2.5), false);
    assert.equal(DeviceLimitService.isValidLimit('abc'), false);
    assert.equal(DeviceLimitService.isValidLimit(null), false);
    assert.equal(DeviceLimitService.isValidLimit(undefined), false);
  });

  await t.test('A2. Selecting and saving 1, 2, 3, or 5 persists correctly in platform_settings', async () => {
    for (const limit of [1, 2, 3, 5]) {
      const saved = await DeviceLimitService.setGlobalDeviceLimit(limit, 'admin@farabi.edu');
      assert.equal(saved, limit);

      const loaded = await DeviceLimitService.getGlobalDeviceLimit();
      assert.equal(loaded, limit, `Loaded setting matches configured limit ${limit}`);

      // Verify row in database
      const row = await db.query(
        `SELECT setting_value FROM platform_settings WHERE setting_key = 'max_devices_per_user'`
      );
      assert.equal(row.rows[0].setting_value, String(limit));
    }
  });

  await t.test('A3. Rejects invalid limit inputs with descriptive error', async () => {
    await assert.rejects(
      async () => {
        await DeviceLimitService.setGlobalDeviceLimit(4, 'admin@farabi.edu');
      },
      /الحد الأقصى للأجهزة يجب أن يكون رقماً صحيحاً من بين: 1، 2، 3، أو 5 فقط/
    );

    await assert.rejects(
      async () => {
        await DeviceLimitService.setGlobalDeviceLimit('invalid', 'admin@farabi.edu');
      },
      /الحد الأقصى للأجهزة يجب أن يكون رقماً صحيحاً من بين: 1، 2، 3، أو 5 فقط/
    );
  });

  await t.test('A4. Preserves saved setting across re-instantiations and simulates admin logout/login', async () => {
    await DeviceLimitService.setGlobalDeviceLimit(3, 'admin@farabi.edu');
    DeviceLimitService.clearCache();

    // Simulating fresh session retrieval
    const currentLimit = await DeviceLimitService.getGlobalDeviceLimit();
    assert.equal(currentLimit, 3, 'Persisted setting 3 remains intact without reverting to 2');
  });

  // =========================================================================
  // SUITE B: Backend Enforcement Tests for Each Limit (1, 2, 3, 5)
  // =========================================================================
  for (const testLimit of [1, 2, 3, 5]) {
    await t.test(`B. Enforces exact limit of ${testLimit} devices`, async () => {
      // Set global limit and reset user active devices
      await DeviceLimitService.setGlobalDeviceLimit(testLimit, 'admin@farabi.edu');
      await db.query(`DELETE FROM user_active_devices WHERE user_id = $1`, [studentId]);

      // Register devices up to the limit
      for (let i = 1; i <= testLimit; i++) {
        const res = await DeviceLimitService.registerOrValidateDevice({
          userId: studentId,
          deviceId: `device_test_${testLimit}_${i}`,
          deviceName: `Device #${i}`,
          clientIp: `192.168.1.${i}`
        });
        assert.equal(res.success, true, `Device #${i} within limit ${testLimit} registered successfully`);
        assert.equal(res.allowedMax, testLimit);
      }

      // Next device exceeding limit MUST be rejected
      const overflowRes = await DeviceLimitService.registerOrValidateDevice({
        userId: studentId,
        deviceId: `device_test_${testLimit}_OVERFLOW`,
        deviceName: `Device Overflow`,
        clientIp: `192.168.1.99`
      });

      assert.equal(overflowRes.success, false, `Device #${testLimit + 1} must be rejected`);
      assert.match(overflowRes.error, /تم بلوغ الحد الأقصى للأجهزة/);
      assert.equal(overflowRes.currentDevicesCount, testLimit);

      // Verify DB count strictly equals testLimit
      const dbCount = await db.query(
        `SELECT COUNT(*) as cnt FROM user_active_devices WHERE user_id = $1`,
        [studentId]
      );
      assert.equal(Number(dbCount.rows[0].cnt), testLimit);
    });
  }

  // =========================================================================
  // SUITE C: Device Reuse, Revocation, and Logout Tests
  // =========================================================================
  await t.test('C1. Recognized device re-authenticating reuses registration without consuming slot', async () => {
    await DeviceLimitService.setGlobalDeviceLimit(2, 'admin@farabi.edu');
    await db.query(`DELETE FROM user_active_devices WHERE user_id = $1`, [studentId]);

    // Register Device A
    await DeviceLimitService.registerOrValidateDevice({
      userId: studentId,
      deviceId: 'device_A',
      deviceName: 'Laptop A',
      clientIp: '10.0.0.1'
    });

    // Device A logs in again
    const reuseRes = await DeviceLimitService.registerOrValidateDevice({
      userId: studentId,
      deviceId: 'device_A',
      deviceName: 'Laptop A (Renamed)',
      clientIp: '10.0.0.2'
    });

    assert.equal(reuseRes.success, true);
    assert.equal(reuseRes.isExisting, true);

    const devCount = await db.query(
      `SELECT COUNT(*) as cnt FROM user_active_devices WHERE user_id = $1`,
      [studentId]
    );
    assert.equal(Number(devCount.rows[0].cnt), 1, 'Device count remains 1 upon reuse');
  });

  await t.test('C2. Revoking device immediately frees slot and invalidates old device access', async () => {
    await DeviceLimitService.setGlobalDeviceLimit(2, 'admin@farabi.edu');
    await db.query(`DELETE FROM user_active_devices WHERE user_id = $1`, [studentId]);

    // Fill both slots
    await DeviceLimitService.registerOrValidateDevice({ userId: studentId, deviceId: 'dev_1', clientIp: '1.1.1.1' });
    await DeviceLimitService.registerOrValidateDevice({ userId: studentId, deviceId: 'dev_2', clientIp: '1.1.1.2' });

    // 3rd device fails
    const rejectedBefore = await DeviceLimitService.registerOrValidateDevice({ userId: studentId, deviceId: 'dev_3', clientIp: '1.1.1.3' });
    assert.equal(rejectedBefore.success, false);

    // Admin revokes dev_1
    const revoked = await DeviceLimitService.revokeDevice(studentId, 'dev_1');
    assert.equal(revoked, true);

    // Old token for dev_1 is now recognized as inactive
    const isDev1Active = await DeviceLimitService.isDeviceActive(studentId, 'dev_1');
    assert.equal(isDev1Active, false, 'dev_1 is no longer active');

    // dev_2 is still active (unrelated devices not affected)
    const isDev2Active = await DeviceLimitService.isDeviceActive(studentId, 'dev_2');
    assert.equal(isDev2Active, true, 'dev_2 remains active');

    // Now dev_3 registration succeeds into the freed slot
    const acceptedAfter = await DeviceLimitService.registerOrValidateDevice({ userId: studentId, deviceId: 'dev_3', clientIp: '1.1.1.3' });
    assert.equal(acceptedAfter.success, true, 'Slot freed by revocation allows dev_3 to register');
  });

  await t.test('C3. Lowering device limit preserves existing devices and blocks further additions', async () => {
    // Start with limit 3 and register 3 devices
    await DeviceLimitService.setGlobalDeviceLimit(3, 'admin@farabi.edu');
    await db.query(`DELETE FROM user_active_devices WHERE user_id = $1`, [studentId]);

    await DeviceLimitService.registerOrValidateDevice({ userId: studentId, deviceId: 'd_1', clientIp: '1.1.1.1' });
    await DeviceLimitService.registerOrValidateDevice({ userId: studentId, deviceId: 'd_2', clientIp: '1.1.1.2' });
    await DeviceLimitService.registerOrValidateDevice({ userId: studentId, deviceId: 'd_3', clientIp: '1.1.1.3' });

    // Administrator lowers limit to 1
    await DeviceLimitService.setGlobalDeviceLimit(1, 'admin@farabi.edu');

    // Policy check: existing 3 devices MUST NOT be deleted
    const countAfterLowering = await db.query(
      `SELECT COUNT(*) as cnt FROM user_active_devices WHERE user_id = $1`,
      [studentId]
    );
    assert.equal(Number(countAfterLowering.rows[0].cnt), 3, 'Existing sessions preserved upon lowering limit');

    // Existing device d_2 can still re-authenticate
    const reuseCheck = await DeviceLimitService.registerOrValidateDevice({ userId: studentId, deviceId: 'd_2', clientIp: '1.1.1.2' });
    assert.equal(reuseCheck.success, true);
    assert.equal(reuseCheck.isExisting, true);

    // New device d_4 must be rejected
    const newAttempt = await DeviceLimitService.registerOrValidateDevice({ userId: studentId, deviceId: 'd_4', clientIp: '1.1.1.4' });
    assert.equal(newAttempt.success, false, 'New device rejected because active count (3) >= new limit (1)');

    // Log out d_1 -> count is 2 (still >= 1)
    await DeviceLimitService.revokeDevice(studentId, 'd_1');
    const attempt2 = await DeviceLimitService.registerOrValidateDevice({ userId: studentId, deviceId: 'd_4', clientIp: '1.1.1.4' });
    assert.equal(attempt2.success, false, 'Still rejected with 2 devices >= 1');

    // Log out d_2 -> count is 1 (still >= 1)
    await DeviceLimitService.revokeDevice(studentId, 'd_2');
    const attempt3 = await DeviceLimitService.registerOrValidateDevice({ userId: studentId, deviceId: 'd_4', clientIp: '1.1.1.4' });
    assert.equal(attempt3.success, false, 'Still rejected with 1 device >= 1');

    // Log out d_3 -> count is 0 (< 1)
    await DeviceLimitService.revokeDevice(studentId, 'd_3');
    const attempt4 = await DeviceLimitService.registerOrValidateDevice({ userId: studentId, deviceId: 'd_4', clientIp: '1.1.1.4' });
    assert.equal(attempt4.success, true, 'Registration succeeds now that active count fell below limit 1');
  });

  // =========================================================================
  // SUITE D: Concurrency Tests (Simultaneous Registration Requests)
  // =========================================================================
  await t.test('D1. Concurrency: Exactly 1 device succeeds when 1 slot remains (Limit = 2, Current = 1)', async () => {
    await DeviceLimitService.setGlobalDeviceLimit(2, 'admin@farabi.edu');
    await db.query(`DELETE FROM user_active_devices WHERE user_id = $1`, [studentId]);

    // Register 1 device (1 slot remaining)
    await DeviceLimitService.registerOrValidateDevice({ userId: studentId, deviceId: 'base_device', clientIp: '1.1.1.1' });

    // Send 5 simultaneous registration requests
    const simultaneousAttempts = [1, 2, 3, 4, 5].map((i) =>
      DeviceLimitService.registerOrValidateDevice({
        userId: studentId,
        deviceId: `concurrent_device_${i}`,
        deviceName: `Concurrent Device #${i}`,
        clientIp: `192.168.10.${i}`
      })
    );

    const results = await Promise.all(simultaneousAttempts);

    const succeeded = results.filter((r) => r.success);
    const rejected = results.filter((r) => !r.success);

    assert.equal(succeeded.length, 1, 'Exactly 1 concurrent request succeeded for the last slot');
    assert.equal(rejected.length, 4, 'All other concurrent requests were rejected');

    // Confirm final active device count never exceeds 2
    const finalCount = await db.query(
      `SELECT COUNT(*) as cnt FROM user_active_devices WHERE user_id = $1`,
      [studentId]
    );
    assert.equal(Number(finalCount.rows[0].cnt), 2, 'Final active device count strictly equals limit 2');
  });

  await t.test('D2. Concurrency: Exactly 1 device succeeds when limit = 1 and 0 devices registered', async () => {
    await DeviceLimitService.setGlobalDeviceLimit(1, 'admin@farabi.edu');
    await db.query(`DELETE FROM user_active_devices WHERE user_id = $1`, [studentId]);

    // Send 6 simultaneous registration requests
    const simultaneousAttempts = [1, 2, 3, 4, 5, 6].map((i) =>
      DeviceLimitService.registerOrValidateDevice({
        userId: studentId,
        deviceId: `burst_limit1_${i}`,
        deviceName: `Burst #${i}`,
        clientIp: `10.20.30.${i}`
      })
    );

    const results = await Promise.all(simultaneousAttempts);

    const succeeded = results.filter((r) => r.success);
    const rejected = results.filter((r) => !r.success);

    assert.equal(succeeded.length, 1, 'Exactly 1 burst request succeeded for single-device limit');
    assert.equal(rejected.length, 5, 'All other burst requests rejected');

    const finalCount = await db.query(
      `SELECT COUNT(*) as cnt FROM user_active_devices WHERE user_id = $1`,
      [studentId]
    );
    assert.equal(Number(finalCount.rows[0].cnt), 1, 'Final count strictly equals 1');
  });

  await t.test('D3. Concurrency: Exactly 1 device succeeds when limit = 3 and 2 devices registered', async () => {
    await DeviceLimitService.setGlobalDeviceLimit(3, 'admin@farabi.edu');
    await db.query(`DELETE FROM user_active_devices WHERE user_id = $1`, [studentId]);

    // Register 2 devices (1 slot remaining)
    await DeviceLimitService.registerOrValidateDevice({ userId: studentId, deviceId: 'dev_slot1', clientIp: '1.1.1.1' });
    await DeviceLimitService.registerOrValidateDevice({ userId: studentId, deviceId: 'dev_slot2', clientIp: '1.1.1.2' });

    // Send 5 simultaneous registration requests
    const simultaneousAttempts = [1, 2, 3, 4, 5].map((i) =>
      DeviceLimitService.registerOrValidateDevice({
        userId: studentId,
        deviceId: `burst_limit3_${i}`,
        deviceName: `Burst #${i}`,
        clientIp: `10.20.30.${i}`
      })
    );

    const results = await Promise.all(simultaneousAttempts);

    const succeeded = results.filter((r) => r.success);
    const rejected = results.filter((r) => !r.success);

    assert.equal(succeeded.length, 1, 'Exactly 1 burst request succeeded for limit 3');
    assert.equal(rejected.length, 4, 'All other burst requests rejected');

    const finalCount = await db.query(
      `SELECT COUNT(*) as cnt FROM user_active_devices WHERE user_id = $1`,
      [studentId]
    );
    assert.equal(Number(finalCount.rows[0].cnt), 3, 'Final count strictly equals 3');
  });

  // =========================================================================
  // SUITE E: Security, Role-Based Access Control & Revoked Token Invalidation
  // =========================================================================
  await t.test('E1. Revoked device session immediately rejects old token on subsequent requests', async () => {
    const { generateToken, authenticateToken } = await import('../dist/middleware/auth.js');
    await db.query(`DELETE FROM user_active_devices WHERE user_id = $1`, [studentId]);

    // Register active device for student
    const devId = 'token_test_device_1';
    await DeviceLimitService.registerOrValidateDevice({
      userId: studentId,
      deviceId: devId,
      deviceName: 'Valid Session Device',
      clientIp: '127.0.0.1'
    });

    const studentToken = generateToken({
      id: studentId,
      email: 'student@farabi.edu',
      role: 'STUDENT',
      fullName: 'Test Student',
      deviceId: devId
    });

    // Verify token passes authentication while active
    let authReq = { headers: { authorization: `Bearer ${studentToken}` }, query: {} };
    let firstStatus = null;
    let firstBody = null;
    let authRes = {
      status: (c) => {
        firstStatus = c;
        return {
          json: (d) => { firstBody = d; return { status: c, ...d }; }
        };
      }
    };
    let nextCalled = false;
    await authenticateToken(authReq, authRes, () => { nextCalled = true; });
    if (!nextCalled) {
      console.log('authenticateToken failed with status:', firstStatus, 'body:', firstBody);
    }
    assert.equal(nextCalled, true, 'Token valid while device is active');

    // Revoke device session
    await DeviceLimitService.revokeDevice(studentId, devId);

    // Verify token is now REJECTED
    let rejectedStatus = null;
    let rejectedBody = null;
    let nextCalledAfterRevoke = false;
    const mockRes = {
      status: (code) => {
        rejectedStatus = code;
        return {
          json: (body) => { rejectedBody = body; }
        };
      }
    };

    await authenticateToken(authReq, mockRes, () => { nextCalledAfterRevoke = true; });
    assert.equal(nextCalledAfterRevoke, false, 'Next must not be called for revoked token');
    assert.equal(rejectedStatus, 401, 'Status 401 returned for revoked device token');
    assert.equal(rejectedBody.code, 'DEVICE_REVOKED');
  });
});
