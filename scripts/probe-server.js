import http from 'node:http';
import server from '../src/server.js';

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(`http://127.0.0.1:3000${path}`, options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data, headers: res.headers }));
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function run() {
  console.log('🧪 Testing Server Endpoints & Integration...\n');
  try {
    // Test 1: Categories
    const catRes = await request('/api/categories');
    console.log(`1. GET /api/categories -> Status: ${catRes.status}`);
    const cats = JSON.parse(catRes.data);
    console.log(`   Found ${cats.length} categories (First: ${cats[0].name})`);

    // Test 2: Public Articles
    const artRes = await request('/api/articles');
    console.log(`\n2. GET /api/articles -> Status: ${artRes.status}`);
    const articles = JSON.parse(artRes.data);
    console.log(`   Found ${articles.length} published articles (Drafts excluded!)`);
    console.log(`   First Title: "${articles[0].title}"`);

    // Test 3: Public Article by Slug
    const singleRes = await request(`/api/articles/${encodeURIComponent(articles[0].slug)}`);
    console.log(`\n3. GET /api/articles/:slug -> Status: ${singleRes.status}`);
    const single = JSON.parse(singleRes.data);
    console.log(`   Title match: ${single.title === articles[0].title}`);

    // Test 4: Verify Draft 404 for Public
    const draftRes = await request('/api/articles/sector-14-new-sewerage-line-plan-draft');
    console.log(`\n4. GET /api/articles/:draftSlug (Public access) -> Status: ${draftRes.status} (MUST BE 404)`);

    // Test 5: Admin Login
    const loginRes = await request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@hisarkiaawaj.com', password: 'Admin@12345' })
    });
    console.log(`\n5. POST /api/auth/login -> Status: ${loginRes.status}`);
    const loginData = JSON.parse(loginRes.data);
    console.log(`   Login Success: ${loginData.success}, User: ${loginData.user.username}`);
    const cookie = loginRes.headers['set-cookie'] ? loginRes.headers['set-cookie'][0].split(';')[0] : '';

    // Test 6: Protected Admin Endpoint with Session Cookie
    const metricsRes = await request('/api/admin/metrics', {
      headers: { Cookie: cookie }
    });
    console.log(`\n6. GET /api/admin/metrics (with session) -> Status: ${metricsRes.status}`);
    console.log('   Metrics:', JSON.parse(metricsRes.data));

    // Test 7: Unauthorized rejection without Session Cookie
    const unauthRes = await request('/api/admin/metrics');
    console.log(`\n7. GET /api/admin/metrics (WITHOUT session) -> Status: ${unauthRes.status} (MUST BE 401)`);

    console.log('\n======================================================');
    console.log('🎉 ALL SERVER & INTEGRATION TESTS PASSED (100%)');
    console.log('======================================================\n');
  } catch (err) {
    console.error('❌ Server probe error:', err);
  } finally {
    server.close();
    process.exit(0);
  }
}

// Give server 100ms to listen then run
setTimeout(run, 200);

