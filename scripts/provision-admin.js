#!/usr/bin/env node
/**
 * provision-admin.js — CLI tool to create or reset the admin user.
 * Usage:
 *   node scripts/provision-admin.js --username admin --password securepassword123
 *   node scripts/provision-admin.js --username admin --password newpassword123 --reset
 */
import { hashPassword, findAdminByUsername, createAdminUser } from '../src/db/auth.js';
import { getDb } from '../src/db/index.js';

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--username' && argv[i + 1]) args.username = argv[++i];
    else if (argv[i] === '--password' && argv[i + 1]) args.password = argv[++i];
    else if (argv[i] === '--reset') args.reset = true;
    else if (argv[i] === '--fullname' && argv[i + 1]) args.fullName = argv[++i];
  }
  return args;
}

const args = parseArgs(process.argv);

// Validate
if (!args.username || !args.username.trim()) {
  console.error('❌ Error: --username is required and must be non-empty.');
  process.exit(1);
}

if (!args.password || args.password.length < 12) {
  console.error('❌ Error: --password is required and must be at least 12 characters.');
  process.exit(1);
}

const username = args.username.trim();
const password = args.password;
const fullName = (args.fullName || 'Administrator').trim();

const existing = findAdminByUsername(username);

if (existing) {
  if (!args.reset) {
    console.error(`❌ Error: User "${username}" already exists. Use --reset to update the password.`);
    process.exit(1);
  }
  // Reset: update password hash
  const newHash = hashPassword(password);
  getDb().prepare('UPDATE admin_users SET password_hash = ? WHERE username = ?').run(newHash, username);
  console.log(`✅ Password for admin user "${username}" has been updated successfully.`);
} else {
  // Create new
  const user = createAdminUser({ username, password, fullName });
  console.log(`✅ Admin user "${user.username}" created successfully (id: ${user.id}, role: ${user.role}).`);
}
