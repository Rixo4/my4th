import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';

console.log('🔍 Running Phase 0 Baseline & Environment Verification...\n');

let failed = false;

// 1. Verify Node.js version
const [major] = process.versions.node.split('.').map(Number);
console.log(`1. Node.js Runtime: v${process.versions.node}`);
if (major < 22) {
  console.error(`   ❌ Node.js 22 or higher required. Current: v${process.versions.node}`);
  failed = true;
} else {
  console.log(`   ✅ Node.js version satisfies engine requirement (>= 22.0.0).`);
}

// 2. Verify Git Repository Initialization
try {
  const gitStatus = execSync('git status --porcelain', { encoding: 'utf8' });
  console.log('2. Git Repository:');
  console.log('   ✅ Git repository is initialized and active.');
} catch (err) {
  console.error('   ❌ Git repository is not initialized:', err.message);
  failed = true;
}

// 3. Verify Local Storage Directories & Write Permissions
const dirs = [
  path.resolve('data'),
  path.resolve('uploads'),
  path.resolve('src')
];

console.log('3. Filesystem Storage & Permissions:');
for (const dir of dirs) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const testFile = path.join(dir, '.write_test');
  try {
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
    console.log(`   ✅ Directory accessible and writable: ${path.relative(process.cwd(), dir)}`);
  } catch (err) {
    console.error(`   ❌ Directory write failed: ${dir}`, err.message);
    failed = true;
  }
}

// 4. Verify SQLite DatabaseSync & WAL Mode Capability
console.log('4. SQLite Engine & WAL Mode:');
try {
  const testDbPath = path.resolve('data', 'baseline_test.db');
  const db = new DatabaseSync(testDbPath);
  db.exec('PRAGMA journal_mode = WAL;');
  const row = db.prepare('PRAGMA journal_mode;').get();
  db.close();
  fs.unlinkSync(testDbPath);
  const shm = testDbPath + '-shm';
  const wal = testDbPath + '-wal';
  if (fs.existsSync(shm)) fs.unlinkSync(shm);
  if (fs.existsSync(wal)) fs.unlinkSync(wal);

  console.log(`   ✅ SQLite journal mode: ${row.journal_mode.toUpperCase()}`);
} catch (err) {
  console.error('   ❌ SQLite DatabaseSync / WAL test failed:', err.message);
  failed = true;
}

if (failed) {
  console.error('\n❌ Phase 0 Baseline Verification FAILED.');
  process.exit(1);
} else {
  console.log('\n🎉 Phase 0 Baseline Verification PASSED (100%). Environment is ready.\n');
}
