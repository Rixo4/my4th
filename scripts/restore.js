#!/usr/bin/env node
/**
 * restore.js — Restores SQLite database from a backup snapshot
 *
 * Verifies the integrity of the backup file before replacing the target DB.
 *
 * Usage:
 *   node scripts/restore.js --file data/backup_2026-11-01T...db
 *   node scripts/restore.js --latest
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { config } from '../src/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--file' && argv[i + 1]) args.file = argv[++i];
    else if (argv[i] === '--latest') args.latest = true;
    else if (argv[i] === '--dest' && argv[i + 1]) args.dest = argv[++i];
  }
  return args;
}

const args = parseArgs(process.argv);
const dataDir = path.join(rootDir, 'data');
let backupFile = args.file;

if (!backupFile && args.latest) {
  // Find latest backup file in data/
  const files = fs.readdirSync(dataDir)
    .filter(f => f.startsWith('backup_') && f.endsWith('.db'))
    .map(f => path.join(dataDir, f));

  if (files.length === 0) {
    console.error('❌ No backup files found in data directory.');
    process.exit(1);
  }

  // Sort by mtime descending
  files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  backupFile = files[0];
}

if (!backupFile) {
  console.error('❌ Error: Specify --file <path-to-backup.db> or --latest.');
  process.exit(1);
}

if (!fs.existsSync(backupFile)) {
  console.error(`❌ Error: Backup file "${backupFile}" does not exist.`);
  process.exit(1);
}

const targetDbPath = args.dest || config.dbPath;

console.log(`\n🔄 Restoring SQLite Database...`);
console.log(`Backup Source: ${backupFile}`);
console.log(`Target DB    : ${targetDbPath}`);

try {
  // 1. Verify backup integrity before replacing
  console.log(`Checking backup integrity...`);
  const checkDb = new DatabaseSync(backupFile);
  const integrity = checkDb.prepare('PRAGMA integrity_check').get();
  checkDb.close();

  if (integrity.integrity_check !== 'ok') {
    console.error(`❌ Integrity check failed for backup file: ${JSON.stringify(integrity)}`);
    process.exit(1);
  }
  console.log(`✅ Backup file integrity verified: OK`);

  // 2. Copy verified backup to target destination
  fs.copyFileSync(backupFile, targetDbPath);

  // Remove stale WAL and SHM files for target if present
  const walPath = `${targetDbPath}-wal`;
  const shmPath = `${targetDbPath}-shm`;
  if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
  if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);

  console.log(`✅ Database successfully restored to ${targetDbPath}!\n`);
  process.exit(0);
} catch (err) {
  console.error(`❌ Restore failed:`, err);
  process.exit(1);
}
