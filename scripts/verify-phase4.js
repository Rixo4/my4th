/**
 * verify-phase4.js — Phase 4 Public Feeds, Cache Freshness & Reader Verification
 *
 * Runs verification across all public feeds:
 * - /api/articles (homepage, ticker, category, search)
 * - /api/articles/:slug (article detail)
 * - Freshness guarantee (instant read-after-write, no stale cache)
 * - Strict exclusion of drafts, scheduled, trashed, and expired content
 *
 * Run: node scripts/verify-phase4.js
 */
import http from 'node:http';
import '../src/server.js';
import { findAdminByUsername, createAdminUser } from '../src/db/auth.js';

const PORT = 3000;
await new Promise(r => setTimeout(r, 800));

// Ensure test admin
let admin = findAdminByUsername('phase4admin');
if (!admin) {
  admin = createAdminUser({
    username: 'phase4admin',
    password: 'PasswordPhase4!@#',
    fullName: 'Phase 4 Tester'
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

console.log('\n=== Phase 4 Public Feeds & Freshness Verification ===\n');

// 1. Authenticate to create test data
const loginRes = await doReq('POST', '/api/auth/login', {
  body: { username: 'phase4admin', password: 'PasswordPhase4!@#' }
});
const cookie = loginRes.headers['set-cookie'][0].split(';')[0];
const adminHeaders = { 'X-Requested-With': 'XMLHttpRequest' };

// Create articles with various statuses
const stamp = Date.now();
const articlesToCreate = [
  {
    title: `Published Hindi ${stamp}`,
    slug: `pub-hi-${stamp}`,
    content: '<p>हिन्दी समाचार सामग्री</p>',
    status: 'published',
    language: 'hi',
    is_featured: 1
  },
  {
    title: `Published English ${stamp}`,
    slug: `pub-en-${stamp}`,
    content: '<p>English news content</p>',
    status: 'published',
    language: 'en',
    is_featured: 0
  },
  {
    title: `Draft Story ${stamp}`,
    slug: `draft-${stamp}`,
    content: '<p>Draft content</p>',
    status: 'draft',
    language: 'hi'
  },
  {
    title: `Future Scheduled Story ${stamp}`,
    slug: `future-${stamp}`,
    content: '<p>Scheduled content</p>',
    status: 'published',
    published_at: new Date(Date.now() + 3600000).toISOString() // 1 hour in future
  },
  {
    title: `Expired Story ${stamp}`,
    slug: `expired-${stamp}`,
    content: '<p>Expired content</p>',
    status: 'published',
    expires_at: new Date(Date.now() - 3600000).toISOString() // 1 hour in past
  }
];

const createdMap = {};
for (const art of articlesToCreate) {
  const res = await doReq('POST', '/api/admin/articles', {
    cookie,
    headers: adminHeaders,
    body: art
  });
  assert(`Created ${art.slug}`, res.status === 201);
  createdMap[art.slug] = res.body;
}

// Soft-delete one article
const trashedSlug = `trashed-${stamp}`;
const trashCreate = await doReq('POST', '/api/admin/articles', {
  cookie,
  headers: adminHeaders,
  body: {
    title: `Trashed Story ${stamp}`,
    slug: trashedSlug,
    content: '<p>To be trashed</p>',
    status: 'published'
  }
});
const trashedId = trashCreate.body.id;
await doReq('DELETE', `/api/admin/articles/${trashedId}`, {
  cookie,
  headers: adminHeaders
});

console.log('\n--- Test 1: Public List Feed (GET /api/articles) ---');
const publicFeed = await doReq('GET', '/api/articles?limit=50');
assert('Feed returns 200', publicFeed.status === 200);
assert('Feed includes Cache-Control no-cache, no-store',
  (publicFeed.headers['cache-control'] || '').includes('no-cache') &&
  (publicFeed.headers['cache-control'] || '').includes('no-store'));

const feedSlugs = publicFeed.body.map(a => a.slug);

assert('Published Hindi story is in public feed', feedSlugs.includes(`pub-hi-${stamp}`));
assert('Published English story is in public feed', feedSlugs.includes(`pub-en-${stamp}`));
assert('Draft story is NOT in public feed', !feedSlugs.includes(`draft-${stamp}`));
assert('Future scheduled story is NOT in public feed', !feedSlugs.includes(`future-${stamp}`));
assert('Expired story is NOT in public feed', !feedSlugs.includes(`expired-${stamp}`));
assert('Trashed story is NOT in public feed', !feedSlugs.includes(trashedSlug));

console.log('\n--- Test 2: Featured Article Feed (GET /api/articles?featured=true) ---');
const featuredFeed = await doReq('GET', '/api/articles?featured=true');
assert('Featured feed returns 200', featuredFeed.status === 200);
const featSlugs = featuredFeed.body.map(a => a.slug);
assert('Featured story is present in featured feed', featSlugs.includes(`pub-hi-${stamp}`));
assert('Non-featured story is NOT present in featured feed', !featSlugs.includes(`pub-en-${stamp}`));

console.log('\n--- Test 3: Direct Article URLs (GET /api/articles/:slug) ---');
// 1. Published story -> 200
const pubRes = await doReq('GET', `/api/articles/pub-hi-${stamp}`);
assert('Direct URL of published story returns 200', pubRes.status === 200);
assert('Direct URL sets Cache-Control no-cache', (pubRes.headers['cache-control'] || '').includes('no-cache'));
assert('Published story has correct language property', pubRes.body.language === 'hi');

// 2. Draft story -> 404
const draftRes = await doReq('GET', `/api/articles/draft-${stamp}`);
assert('Direct URL of draft story returns 404', draftRes.status === 404);

// 3. Future scheduled story -> 404
const futureRes = await doReq('GET', `/api/articles/future-${stamp}`);
assert('Direct URL of future scheduled story returns 404', futureRes.status === 404);

// 4. Expired story -> 404
const expRes = await doReq('GET', `/api/articles/expired-${stamp}`);
assert('Direct URL of expired story returns 404', expRes.status === 404);

// 5. Trashed story -> 404
const trashRes = await doReq('GET', `/api/articles/${trashedSlug}`);
assert('Direct URL of trashed story returns 404', trashRes.status === 404);

console.log('\n--- Test 4: Immediate Freshness Guarantee ---');
// Publish a new article and check it appears in the very next request
const freshSlug = `fresh-${Date.now()}`;
const createFresh = await doReq('POST', '/api/admin/articles', {
  cookie,
  headers: adminHeaders,
  body: {
    title: 'Instant Fresh Story',
    slug: freshSlug,
    content: '<p>Immediate visibility</p>',
    status: 'published'
  }
});
const freshId = createFresh.body.id;

// Immediately read without delay
const immediatePublic = await doReq('GET', `/api/articles/${freshSlug}`);
assert('Newly published story is immediately visible (read-after-write)', immediatePublic.status === 200);

// Unpublish it immediately
await doReq('PATCH', `/api/admin/articles/${freshId}`, {
  cookie,
  headers: adminHeaders,
  body: { status: 'draft' }
});

// Immediately read without delay
const immediateUnpub = await doReq('GET', `/api/articles/${freshSlug}`);
assert('Unpublished story immediately disappears (returns 404)', immediateUnpub.status === 404);

// Clean up created test records
for (const slug of Object.keys(createdMap)) {
  await doReq('DELETE', `/api/admin/articles/${createdMap[slug].id}/purge`, { cookie, headers: adminHeaders });
}
await doReq('DELETE', `/api/admin/articles/${trashedId}/purge`, { cookie, headers: adminHeaders });
await doReq('DELETE', `/api/admin/articles/${freshId}/purge`, { cookie, headers: adminHeaders });

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);

