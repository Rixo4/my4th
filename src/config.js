import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  dbPath: process.env.DB_PATH || path.join(rootDir, 'data', 'news.db'),
  uploadDir: process.env.UPLOAD_DIR || path.join(rootDir, 'uploads'),
  rootDir,
  sessionSecret: process.env.SESSION_SECRET || 'hisarkiaawaj_secret_session_key_2026',
  defaultAdmin: {
    username: process.env.ADMIN_USERNAME || 'hisarkiawaaz@gmail.com',
    password: process.env.ADMIN_PASSWORD || 'Hisarkiawaaz@09',
    fullName: 'Editor-in-Chief'
  }
};

