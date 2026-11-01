#!/usr/bin/env node
/**
 * backup.js — Online, consistent SQLite backup using VACUUM INTO
 *
 * Safe for live SQLite databases in WAL mode.
 * Creates an unfragmented, standalone backup database snapshot.
 *
 * Usage:
 *   node scripts/backup.js
 *   node scripts/backup.js --out custom_path.db
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDb } from '../src/db/index.js';
import { config } from '../src/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--out' && argv[i + 1]) args.out = argv[++i];
  }
  return args;
}

const args = parseArgs(process.argv);
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(rootDir, 'data');

if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

const backupPath = args.out || path.join(backupDir, `backup_${timestamp}.db`);

console.log(`\n📦 Starting SQLite Online Backup...`);
console.log(`Source DB  : ${config.dbPath}`);
console.log(`Destination: ${backupPath}`);

try {
  // If destination file already exists, remove it (VACUUM INTO requires target file not exist)
  if (fs.existsSync(backupPath)) {
    fs.unlinkSync(backupPath);
  }

  const db = getDb();

  // SQLite VACUUM INTO safely creates an atomic, consistent point-in-time snapshot
  // even while writers and readers are active in WAL mode.
  // Note: Path must be escaped for SQLite string literal
  const escapedPath = backupPath.replace(/'/g, "''");
  db.exec(`VACUUM INTO '${escapedPath}'`);

  const stat = fs.statSync(backupPath);
  console.log(`✅ Backup successfully created!`);
  console.log(`   File: ${backupPath}`);
  console.log(`   Size: ${(stat.size / 1024).toFixed(2)} KB\n`);

  process.exit(0);
} catch (err) {
  console.error(`❌ Backup failed:`, err);
  process.exit(1);
}

