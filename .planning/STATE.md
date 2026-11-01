# Project State: News Website Admin & Publishing Backend

## Current Status
- **Milestone**: v1 — Bilingual News Publishing Platform & Private Editorial CMS
- **Phases Completed**: 6 of 6 (Phases 0 through 5)
- **All Acceptance Criteria**: 100% Verified and Passing
- **Last Updated**: 2026-11-01

## Progress Tracker
- [x] Phase 0: Environment & Repository Baseline Verification (`npm run test:baseline` → 100% PASS)
- [x] Phase 1: Public Frontend Sanitization & Admin Concealment (`npm run test:phase1` → 100% PASS)
- [x] Phase 2: Owner Provisioning, Hardened Auth & API Authorization (`npm run test:phase2` → 100% PASS)
- [x] Phase 3: Article Lifecycle — Soft-Delete, Expiry, Bilingual & Security (`npm run test:phase3` → 100% PASS)
- [x] Phase 4: Public Feeds, Cache Freshness & Bilingual Layout (`npm run test:phase4` → 100% PASS)
- [x] Phase 5: Production Hardening, Consistent Backups & End-to-End (`npm run test:phase5` → 100% PASS)

## Architectural & Security Highlights
- **Zero New Dependencies**: Runs exclusively on Node.js standard library and native `node:sqlite`.
- **Public Separation**: Zero admin buttons or entry points on public templates (`index.html`, `article.html`, `category.html`, `search.html`). Private admin is at `/admin/login.html`.
- **Hardened Authentication**: Asynchronous `scrypt`, 30-min idle / 24-hr absolute sessions, SQLite session persistence, session ID rotation upon login, IP-based brute force rate limiting (5 attempts/15 min).
- **CSRF Protection**: All mutating admin routes require `X-Requested-With: XMLHttpRequest`.
- **Content Security**: Server-side HTML sanitization (strips `<script>`, `<iframe>`, `<object>`, `<embed>`, `<form>`, event handlers, `javascript:` URLs). Media upload enforces max 5MB, extension whitelisting, magic byte validation, safe randomized filenames, and `X-Content-Type-Options: nosniff`.
- **Article Lifecycle & Soft-Delete**: Soft-delete sets `deleted_at = datetime('now')`. Trashed stories are excluded from public feeds and 404 on direct URL. Owner can view trash, restore, or permanently purge with confirmation.
- **Auto-Expiry**: Optional UTC ISO 8601 expiry date/time with IST timezone display in admin. When expired, immediately filtered out at SQLite query level (`PUBLIC_WHERE`) and returns 404 publicly.
- **Cache Freshness**: Dynamic API routes set `Cache-Control: no-cache, no-store, must-revalidate` for immediate read-after-write consistency.
- **Safe Backups**: Online atomic snapshotting via `VACUUM INTO` (`npm run backup`) safe for WAL mode, with integrity-verified restore (`npm run restore`).

## How to Run & Verify
```bash
npm start                # Launch production server at http://localhost:3000
npm run admin:provision  # CLI owner provisioning / password reset
npm run backup           # Create atomic SQLite snapshot in data/
npm run restore          # Restore database with integrity check
npm run test:baseline    # Phase 0 verification
npm run test:phase1      # Phase 1 verification
npm run test:phase2      # Phase 2 verification
npm run test:phase3      # Phase 3 verification
npm run test:phase4      # Phase 4 verification
npm run test:phase5      # Phase 5 verification
```
