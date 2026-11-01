/**
 * verify-phase3.js — Phase 3 Content Lifecycle, Soft-Delete, Expiry, Content Security Verification
 *
 * Runs full integration checks against the HTTP server.
 * Run with: node scripts/verify-phase3.js
 */
import http from 'node:http';
import '../src/server.js';
import { findAdminByUsername, createAdminUser } from '../src/db/auth.js';

const PORT = 3000;

// Allow server to initialize
await new Promise(r => setTimeout(r, 800));

// Ensure test admin exists
let testAdmin = findAdminByUsername('phase3admin');
if (!testAdmin) {
  testAdmin = createAdminUser({
    username: 'phase3admin',
    password: 'Password123!@#',
    fullName: 'Phase 3 Tester'
  });
}

function doReq(method, path, { body, headers = {}, cookie } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const reqHeaders = {
      'Content-Type': 'application/json',
      ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...headers
    };
    const opts = {
      hostname: 'localhost',
      port: PORT,
      path,
      method,
      headers: reqHeaders
    };
    const r = http.request(opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        let json;
        try { json = JSON.parse(data); } catch { json = data; }
        resolve({ status: res.statusCode, headers: res.headers, body: json });
      });
    });
    r.on('error', reject);
    if (payload) r.write(payload);
    r.end();
  });
}

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

console.log('\n=== Phase 3 Verification ===\n');

// 1. Admin login to acquire session cookie
console.log('Step 1: Admin Authentication for Tests');
const loginRes = await doReq('POST', '/api/auth/login', {
  body: { username: 'phase3admin', password: 'Password123!@#' }
});
assert('Admin login successful', loginRes.status === 200);

const setCookieHeader = loginRes.headers['set-cookie'];
const sessionCookie = Array.isArray(setCookieHeader)
  ? setCookieHeader[0].split(';')[0]
  : (setCookieHeader ? setCookieHeader.split(';')[0] : '');

assert('Session cookie received', Boolean(sessionCookie && sessionCookie.startsWith('hisar_session=')));

const adminHeaders = {
  'X-Requested-With': 'XMLHttpRequest'
};

// 2. Content Sanitization & Cache-Control
console.log('\nStep 2: Content Security & Cache-Control');
const xssSlug = `test-xss-${Date.now()}`;
const createXssRes = await doReq('POST', '/api/admin/articles', {
  cookie: sessionCookie,
  headers: adminHeaders,
  body: {
    title: 'Test XSS Article',
    slug: xssSlug,
    content: '<p>Safe content</p><script>alert("xss")</script><a href="javascript:steal()">Click</a>',
    status: 'published',
    language: 'hi'
  }
});
assert('Article created', createXssRes.status === 201);
const xssId = createXssRes.body.id;

const publicArtRes = await doReq('GET', `/api/articles/${xssSlug}`);
assert('Public article returns 200', publicArtRes.status === 200);
assert('Script tags stripped from content', !publicArtRes.body.content.includes('<script>'));
assert('Javascript: URLs stripped from href', !publicArtRes.body.content.includes('javascript:'));
assert('Public route sets Cache-Control no-cache, no-store',
  (publicArtRes.headers['cache-control'] || '').includes('no-cache') &&
  (publicArtRes.headers['cache-control'] || '').includes('no-store'));

// 3. Soft-Delete (Move to Trash) & Public Feed Invalidation
console.log('\nStep 3: Soft-Delete (Trash) & Public Feed Hiding');
const deleteRes = await doReq('DELETE', `/api/admin/articles/${xssId}`, {
  cookie: sessionCookie,
  headers: adminHeaders
});
assert('Delete article returns 200', deleteRes.status === 200);

// Check public direct URL
const publicAfterTrash = await doReq('GET', `/api/articles/${xssSlug}`);
assert('Trashed article returns 404 on direct public URL', publicAfterTrash.status === 404);

// Check public articles list
const publicListRes = await doReq('GET', '/api/articles');
const foundInPublic = Array.isArray(publicListRes.body) && publicListRes.body.some(a => a.id === xssId);
assert('Trashed article not present in public article feed', !foundInPublic);

// Check admin trash list
const trashListRes = await doReq('GET', '/api/admin/articles/trash', {
  cookie: sessionCookie,
  headers: adminHeaders
});
const foundInTrash = Array.isArray(trashListRes.body) && trashListRes.body.some(a => a.id === xssId);
assert('Trashed article present in admin trash list', foundInTrash);

// 4. Restore from Trash
console.log('\nStep 4: Restore Article from Trash');
const restoreRes = await doReq('POST', `/api/admin/articles/${xssId}/restore`, {
  cookie: sessionCookie,
  headers: adminHeaders
});
assert('Restore returns 200', restoreRes.status === 200);

const publicAfterRestore = await doReq('GET', `/api/articles/${xssSlug}`);
assert('Restored article visible again on public URL (200)', publicAfterRestore.status === 200);

// 5. Permanent Purge
console.log('\nStep 5: Permanent Purge');
// Trash again first
await doReq('DELETE', `/api/admin/articles/${xssId}`, {
  cookie: sessionCookie,
  headers: adminHeaders
});
const purgeRes = await doReq('DELETE', `/api/admin/articles/${xssId}/purge`, {
  cookie: sessionCookie,
  headers: adminHeaders
});
assert('Purge returns 200', purgeRes.status === 200);

const restoreAfterPurge = await doReq('POST', `/api/admin/articles/${xssId}/restore`, {
  cookie: sessionCookie,
  headers: adminHeaders
});
assert('Restoring purged article returns 404', restoreAfterPurge.status === 404);

// 6. Auto-Expiry Lifecycle
console.log('\nStep 6: Auto-Expiry Lifecycle');
const expSlug = `test-expiry-${Date.now()}`;
const pastDate = new Date(Date.now() - 60000).toISOString(); // 1 minute ago (UTC)
const futureDate = new Date(Date.now() + 86400000).toISOString(); // 1 day in future (UTC)

// Create article with past expiry
const expCreateRes = await doReq('POST', '/api/admin/articles', {
  cookie: sessionCookie,
  headers: adminHeaders,
  body: {
    title: 'Expired Test Story',
    slug: expSlug,
    content: '<p>This story has expired</p>',
    status: 'published',
    expires_at: pastDate
  }
});
assert('Created article with past expiry', expCreateRes.status === 201);
const expId = expCreateRes.body.id;

// Public direct URL should be 404
const expPublicRes = await doReq('GET', `/api/articles/${expSlug}`);
assert('Expired article direct URL returns 404 Not Found', expPublicRes.status === 404);

// Public list should not contain it
const expListRes = await doReq('GET', '/api/articles');
const foundExpired = Array.isArray(expListRes.body) && expListRes.body.some(a => a.id === expId);
assert('Expired article excluded from public feeds', !foundExpired);

// Admin should still see it
const adminListRes = await doReq('GET', '/api/admin/articles', {
  cookie: sessionCookie,
  headers: adminHeaders
});
const adminFoundExpired = adminListRes.body?.articles?.some(a => a.id === expId);
assert('Admin article list still includes expired article', adminFoundExpired);

// Extend expiry to future
const extendRes = await doReq('PUT', `/api/admin/articles/${expId}`, {
  cookie: sessionCookie,
  headers: adminHeaders,
  body: {
    expires_at: futureDate
  }
});
assert('Update expiry to future returns 200', extendRes.status === 200);

const futurePublicRes = await doReq('GET', `/api/articles/${expSlug}`);
assert('Article with future expiry is publicly accessible (200)', futurePublicRes.status === 200);

// Clear expiry (set to null)
const clearRes = await doReq('PUT', `/api/admin/articles/${expId}`, {
  cookie: sessionCookie,
  headers: adminHeaders,
  body: {
    expires_at: null
  }
});
assert('Clear expiry to null returns 200', clearRes.status === 200);

const clearedPublicRes = await doReq('GET', `/api/articles/${expSlug}`);
assert('Article with cleared expiry is publicly accessible (200)', clearedPublicRes.status === 200);

// 7. Authorization & Security Checks
console.log('\nStep 7: Authorization Checks on Mutating Routes');
const unauthDelete = await doReq('DELETE', `/api/admin/articles/${expId}`);
assert('Unauthenticated DELETE returns 401/403', unauthDelete.status === 401 || unauthDelete.status === 403);

const unauthRestore = await doReq('POST', `/api/admin/articles/${expId}/restore`);
assert('Unauthenticated restore returns 401/403', unauthRestore.status === 401 || unauthRestore.status === 403);

const unauthPurge = await doReq('DELETE', `/api/admin/articles/${expId}/purge`);
assert('Unauthenticated purge returns 401/403', unauthPurge.status === 401 || unauthPurge.status === 403);

// 8. Media Upload Hardening
console.log('\nStep 8: Media Upload Hardening');
const fakeExtRes = await doReq('POST', '/api/admin/upload', {
  cookie: sessionCookie,
  headers: adminHeaders,
  body: {
    fileName: 'malicious.exe',
    dataBase64: 'data:application/octet-stream;base64,dGVzdA=='
  }
});
assert('Uploading non-image extension returns 400', fakeExtRes.status === 400);

const fakeMagicRes = await doReq('POST', '/api/admin/upload', {
  cookie: sessionCookie,
  headers: adminHeaders,
  body: {
    fileName: 'fake.jpg',
    dataBase64: 'data:image/jpeg;base64,VGhpcyBpcyBub3QgYSByZWFsIGpwZWcgZmlsZQ=='
  }
});
assert('Uploading invalid magic bytes returns 400', fakeMagicRes.status === 400);

// Valid 1x1 JPEG
const validJpegBase64 = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
const validUploadRes = await doReq('POST', '/api/admin/upload', {
  cookie: sessionCookie,
  headers: adminHeaders,
  body: {
    fileName: 'valid_test.jpg',
    dataBase64: validJpegBase64
  }
});
assert('Valid JPEG upload returns 200', validUploadRes.status === 200);
assert('Upload response includes nosniff header',
  validUploadRes.headers['x-content-type-options'] === 'nosniff');

// Clean up test article
await doReq('DELETE', `/api/admin/articles/${expId}/purge`, {
  cookie: sessionCookie,
  headers: adminHeaders
});

// Summary
console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
