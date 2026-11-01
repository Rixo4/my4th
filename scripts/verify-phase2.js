/**
 * verify-phase2.js — Phase 2 authentication hardening verification
 *
 * Starts the server (via import), tests all auth-hardening features,
 * reports results, then exits.
 *
 * Run: node scripts/verify-phase2.js
 */
import http from 'node:http';

// Import server module — this starts it on config.port (3000)
import '../src/server.js';

const PORT = 3000;

// Allow server to initialize
await new Promise(r => setTimeout(r, 800));

// ── helpers ────────────────────────────────────────────────────────────────
function doReq(method, path, { body, headers = {}, cookie } = {}) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'localhost',
      port: PORT,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(cookie ? { Cookie: cookie } : {}),
        ...headers
      }
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
    if (body) r.write(JSON.stringify(body));
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

// ── Tests ──────────────────────────────────────────────────────────────────
console.log('\n=== Phase 2 Verification ===\n');

// Test 1: Auth routes exempt from CSRF (no X-Requested-With required)
console.log('Test 1: Auth routes exempt from CSRF check');
{
  const loginNoCSRF = await doReq('POST', '/api/auth/login', {
    body: { username: 'nobody', password: 'wrongpassword123' }
    // NO X-Requested-With header
  });
  assert('POST /api/auth/login without CSRF header returns 401 (not 403)', loginNoCSRF.status === 401,
    `Got ${loginNoCSRF.status}`);

  const logoutNoCSRF = await doReq('POST', '/api/auth/logout');
  assert('POST /api/auth/logout without CSRF header returns 200 (not 403)', logoutNoCSRF.status === 200,
    `Got ${logoutNoCSRF.status}`);
}

// Test 2: CSRF check blocks admin POST without X-Requested-With
console.log('\nTest 2: CSRF protection on admin routes');
{
  const r = await doReq('POST', '/api/admin/articles', {
    body: { title: 'Test', content: 'Test content' },
    cookie: 'hisar_session=fakefakefake'
    // NO X-Requested-With header
  });
  assert('POST /api/admin/articles without X-Requested-With → 403', r.status === 403,
    `Got ${r.status}`);

  const r2 = await doReq('DELETE', '/api/admin/articles/1', {
    cookie: 'hisar_session=fakefakefake'
    // NO X-Requested-With header
  });
  assert('DELETE /api/admin/articles/1 without X-Requested-With → 403', r2.status === 403,
    `Got ${r2.status}`);
}

// Test 3: Expired/nonexistent session returns 401
console.log('\nTest 3: Invalid session returns 401');
{
  const r = await doReq('GET', '/api/auth/me', {
    cookie: 'hisar_session=0000000000000000000000000000000000000000000000000000000000000000'
  });
  assert('Nonexistent session → 401', r.status === 401, `Got ${r.status}`);
}

// Test 4: CSRF-compliant request with invalid session returns 401 (not 403)
console.log('\nTest 4: CSRF-ok but invalid session → 401 on admin route');
{
  const r = await doReq('POST', '/api/admin/articles', {
    body: { title: 'Test', content: 'Content here' },
    cookie: 'hisar_session=fakefakefakefakefake',
    headers: { 'X-Requested-With': 'XMLHttpRequest' }
  });
  assert('POST with CSRF header but bad session → 401', r.status === 401,
    `Got ${r.status}`);
}

// Test 5: Brute-force lockout
console.log('\nTest 5: Brute-force lockout after 5 failed logins from same IP');
{
  const fakeIp = `10.99.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
  for (let i = 0; i < 5; i++) {
    await doReq('POST', '/api/auth/login', {
      body: { username: 'hacker', password: 'wrongpassword123' },
      headers: { 'X-Forwarded-For': fakeIp }
    });
  }
  const r6 = await doReq('POST', '/api/auth/login', {
    body: { username: 'hacker', password: 'wrongpassword123' },
    headers: { 'X-Forwarded-For': fakeIp }
  });
  assert('6th login attempt from same IP → 429', r6.status === 429,
    `Got ${r6.status}, body: ${JSON.stringify(r6.body)}`);
}

// Test 6: GET /api/auth/me with no cookie → 401
console.log('\nTest 6: No session cookie → 401 on /api/auth/me');
{
  const r = await doReq('GET', '/api/auth/me');
  assert('/api/auth/me without session → 401', r.status === 401, `Got ${r.status}`);
}

// ── Summary ───────────────────────────────────────────────────────────────
console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
