/**
 * verify-phase5.js — Phase 5 Production Hardening & Backup / Restore Verification
 *
 * Tests:
 * 1. Online VACUUM INTO backup snapshot creation.
 * 2. SQLite PRAGMA integrity_check on the snapshot.
 * 3. Restoration from the snapshot into a temporary test database.
 * 4. Content and table schema validation on the restored database.
 *
 * Run: node scripts/verify-phase5.js
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { execSync } from 'node:child_process';
import { config } from '../src/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

let passed = 0;
let failed = 0;

function assert(label, condition, detail = '') {
  if (condition) {
    console.log(`  ✅ PASS: ${label}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${label}${detail ? ' — ' + detail : ''}`);
    failed++;
  }
}

console.log('\n=== Phase 5 Backup & Restore Verification ===\n');

const testBackupFile = path.join(rootDir, 'data', `test_backup_${Date.now()}.db`);
const testRestoreFile = path.join(rootDir, 'data', `test_restored_${Date.now()}.db`);

try {
  // 1. Run backup
  console.log('Step 1: Execute Online VACUUM INTO Backup');
  execSync(`node scripts/backup.js --out "${testBackupFile}"`, {
    cwd: rootDir,
    stdio: 'inherit'
  });

  assert('Backup file exists on disk', fs.existsSync(testBackupFile));
  const stat = fs.statSync(testBackupFile);
  assert('Backup file size > 0 bytes', stat.size > 0);

  // 2. Verify snapshot integrity
  console.log('\nStep 2: SQLite PRAGMA integrity_check on snapshot');
  const snapDb = new DatabaseSync(testBackupFile);
  const snapCheck = snapDb.prepare('PRAGMA integrity_check').get();
  assert('Snapshot passes PRAGMA integrity_check', snapCheck.integrity_check === 'ok');

  // Verify articles table and rows in snapshot
  const artCount = snapDb.prepare('SELECT COUNT(*) as count FROM articles').get();
  assert('Snapshot contains valid articles table', Number(artCount.count) >= 0);

  // Verify sessions table in snapshot
  const sessTable = snapDb.prepare("SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name='sessions'").get();
  assert('Snapshot contains sessions table', Number(sessTable.count) === 1);
  snapDb.close();

  // 3. Test Restore script
  console.log('\nStep 3: Execute Restore Script into target location');
  execSync(`node scripts/restore.js --file "${testBackupFile}" --dest "${testRestoreFile}"`, {
    cwd: rootDir,
    stdio: 'inherit'
  });

  assert('Restored database file exists', fs.existsSync(testRestoreFile));

  // 4. Verify restored DB
  console.log('\nStep 4: Verify Restored DB schema and data');
  const restoredDb = new DatabaseSync(testRestoreFile);
  const restoreCheck = restoredDb.prepare('PRAGMA integrity_check').get();
  assert('Restored database passes integrity_check', restoreCheck.integrity_check === 'ok');

  const restoredArticles = restoredDb.prepare('SELECT COUNT(*) as count FROM articles').get();
  assert('Restored articles count matches snapshot', Number(restoredArticles.count) === Number(artCount.count));
  restoredDb.close();

} finally {
  // Clean up test files
  if (fs.existsSync(testBackupFile)) fs.unlinkSync(testBackupFile);
  if (fs.existsSync(testRestoreFile)) fs.unlinkSync(testRestoreFile);
}

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);

