import crypto from 'node:crypto';
import { getDb } from './index.js';

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, storedPasswordHash) {
  if (!storedPasswordHash || !storedPasswordHash.includes(':')) return false;
  const [salt, key] = storedPasswordHash.split(':');
  const keyBuffer = Buffer.from(key, 'hex');
  const derivedBuffer = crypto.scryptSync(password, salt, 64);
  return crypto.timingSafeEqual(keyBuffer, derivedBuffer);
}

export function verifyPasswordAsync(password, storedPasswordHash) {
  return new Promise((resolve, reject) => {
    if (!storedPasswordHash || !storedPasswordHash.includes(':')) return resolve(false);
    const [salt, key] = storedPasswordHash.split(':');
    const keyBuffer = Buffer.from(key, 'hex');
    crypto.scrypt(password, salt, 64, (err, derivedBuffer) => {
      if (err) return reject(err);
      try {
        resolve(crypto.timingSafeEqual(keyBuffer, derivedBuffer));
      } catch {
        resolve(false);
      }
    });
  });
}

export function findAdminByUsername(username) {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM admin_users WHERE username = ?');
  return stmt.get(username);
}

export function createAdminUser({ username, password, fullName = 'Administrator', role = 'admin' }) {
  const db = getDb();
  const passwordHash = hashPassword(password);
  const stmt = db.prepare(`
    INSERT INTO admin_users (username, password_hash, full_name, role)
    VALUES (?, ?, ?, ?)
  `);
  const result = stmt.run(username, passwordHash, fullName, role);
  return { id: Number(result.lastInsertRowid), username, fullName, role };
}

