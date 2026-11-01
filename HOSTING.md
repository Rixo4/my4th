# HisarKiAawaj: Hosting & Operational Constraints

## 1. Hosting Architecture
HisarKiAawaj uses Node.js ES Modules with embedded SQLite (`node:sqlite`).

### Mandatory Operational Constraints
Per [SQLite WAL Documentation](https://www.sqlite.org/wal.html):
1. **Single Application Host**:
   - The application must run on a single host machine or container instance.
   - Do NOT run horizontally scaled writer containers against the same SQLite database file.
2. **Persistent POSIX Local Disk**:
   - The database directory (`data/`) must be stored on a local, POSIX-compliant persistent disk.
   - **Do NOT mount the database over network filesystems** (NFS, SMB, CIFS, AWS EFS). Network filesystems break SQLite Write-Ahead Logging (WAL) shared-memory (`.shm`) synchronization primitives, which can lead to silent database corruption.
3. **Single-Writer Concurrency**:
   - SQLite serializes write transactions. For a single-owner news website with read-heavy visitor traffic, this provides microsecond query access while keeping infrastructure overhead at zero.
4. **Runtime Pinning**:
   - Target runtime: **Node.js 22 LTS or Node.js 24**.
   - Note: Native `node:sqlite` (`DatabaseSync`) was introduced in Node.js 22 as experimental and is a release candidate in Node.js 24 ([Node.js SQLite Docs](https://nodejs.org/api/sqlite.html)).
   - If compiling native binaries without experimental flags is desired, `better-sqlite3` is the standard drop-in alternative.

## 2. Backup Strategy (WAL-Safe)
- Never use simple file copy (`cp news.db backup.db`) while the database is actively in WAL mode.
- Backups must use SQLite's native `VACUUM INTO 'backup.db'` or the SQLite Online Backup API.
- Backups must archive both the consistent database snapshot and the `uploads/` directory.

## 3. Recommended Deployment Targets
- Single VPS (Hetzner Cloud, DigitalOcean Droplet, Linode) with Caddy / Nginx reverse proxy for automated HTTPS and SSL certificates.
- Container PaaS with dedicated persistent volume (Railway with Volume, Render Web Service with Persistent Disk, Fly.io with Mount).

