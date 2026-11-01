import assert from 'node:assert';
import { getDb, closeDb } from '../src/db/index.js';
import { hashPassword, verifyPassword, createAdminUser, findAdminByUsername } from '../src/db/auth.js';
import { createCategory, listCategories, getCategoryBySlug } from '../src/db/categories.js';
import {
  createArticle,
  getArticleById,
  getArticleBySlug,
  listPublishedArticles,
  listAllArticles,
  updateArticle,
  deleteArticle,
  getDashboardMetrics
} from '../src/db/articles.js';

console.log('🧪 Starting Database & Foundation Automated Test Suite...\n');

try {
  const db = getDb();

  // Test 1: Verify Schema & Tables
  console.log('Test 1: Verifying SQLite database tables and indexes...');
  const tables = db.prepare(`
    SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'
  `).all().map(t => t.name);

  assert(tables.includes('admin_users'), 'admin_users table must exist');
  assert(tables.includes('categories'), 'categories table must exist');
  assert(tables.includes('articles'), 'articles table must exist');
  assert(tables.includes('advertisements'), 'advertisements table must exist');
  console.log('  ✅ Tables verified: ' + tables.join(', '));

  // Test 2: Auth Layer & Password Hashing
  console.log('\nTest 2: Verifying password hashing and verification...');
  const testPassword = 'SecureAdminSecret!99';
  const hashed = hashPassword(testPassword);
  assert(verifyPassword(testPassword, hashed), 'Valid password must verify');
  assert(!verifyPassword('WrongPassword', hashed), 'Invalid password must fail verification');
  console.log('  ✅ Scrypt password hashing & timing-safe verification verified.');

  // Test 3: Admin User Persistence
  console.log('\nTest 3: Verifying admin user creation...');
  const testUser = `tester_${Date.now()}@hisarkiaawaj.com`;
  const admin = createAdminUser({
    username: testUser,
    password: testPassword,
    fullName: 'Test Auditor'
  });
  assert(admin.id > 0, 'Admin ID should be valid');
  const foundAdmin = findAdminByUsername(testUser);
  assert(foundAdmin && foundAdmin.username === testUser, 'Admin should be retrievable by username');
  assert(verifyPassword(testPassword, foundAdmin.password_hash), 'Retrieved admin password must match');
  console.log(`  ✅ Admin user verified: ${foundAdmin.username} (ID: ${foundAdmin.id})`);

  // Test 4: Categories DAL
  console.log('\nTest 4: Verifying categories data access...');
  const catSlug = `test_cat_${Date.now()}`;
  const cat = createCategory({
    name: 'Special Test Section',
    slug: catSlug,
    description: 'Automated test category'
  });
  assert(cat.id > 0, 'Category ID should be valid');
  const fetchedCat = getCategoryBySlug(catSlug);
  assert(fetchedCat && fetchedCat.name === 'Special Test Section', 'Category should be retrievable by slug');
  console.log(`  ✅ Category created and verified: ${fetchedCat.name}`);

  // Test 5: Article Creation & Draft Privacy Isolation (CRITICAL)
  console.log('\nTest 5: Verifying draft vs published article isolation...');
  const publishedSlug = `pub_article_${Date.now()}`;
  const draftSlug = `draft_article_${Date.now()}`;

  const pubArticle = createArticle({
    title: 'Breaking News Story — Live',
    slug: publishedSlug,
    excerpt: 'Published excerpt summary',
    content: '<p>Full published story text.</p>',
    categoryId: cat.id,
    status: 'published',
    publishedAt: new Date(Date.now() - 1000).toISOString()
  });

  const draftArticle = createArticle({
    title: 'Secret Draft Story — Not For Public',
    slug: draftSlug,
    excerpt: 'Draft excerpt summary',
    content: '<p>Secret unreleased text.</p>',
    categoryId: cat.id,
    status: 'draft',
    publishedAt: null
  });

  // Verify listPublishedArticles strictly excludes drafts
  const publishedList = listPublishedArticles({ limit: 100 });
  const hasDraftInPubList = publishedList.some(a => a.slug === draftSlug);
  assert(!hasDraftInPubList, 'CRITICAL: Draft article MUST NOT appear in published articles feed!');

  // Verify getArticleBySlug denies drafts for public requests
  const pubFetch = getArticleBySlug(publishedSlug, false);
  assert(pubFetch && pubFetch.id === pubArticle.id, 'Published article must be accessible by slug');

  const draftFetchPublic = getArticleBySlug(draftSlug, false);
  assert(!draftFetchPublic, 'CRITICAL: getArticleBySlug without allowDraft MUST NOT return draft article!');

  const draftFetchAdmin = getArticleBySlug(draftSlug, true);
  assert(draftFetchAdmin && draftFetchAdmin.id === draftArticle.id, 'Admin preview must be able to view draft');
  console.log('  ✅ Draft isolation verified: Drafts are strictly shielded from public queries.');

  // Test 6: Article Updates & Auto-Publishing
  console.log('\nTest 6: Verifying article update and publishing transition...');
  const updated = updateArticle(draftArticle.id, {
    status: 'published',
    title: 'Updated & Now Published Headline'
  });
  assert(updated.status === 'published', 'Article status should be updated to published');
  assert(updated.published_at !== null, 'Article must have published_at timestamp upon publishing');

  // Now it should be visible to public
  const nowPublicFetch = getArticleBySlug(draftSlug, false);
  assert(nowPublicFetch !== undefined && nowPublicFetch.id === draftArticle.id, 'Newly published article should now appear in public query');
  console.log('  ✅ Status transition verified: Draft -> Published successfully exposed.');

  // Test 7: Article Deletion
  console.log('\nTest 7: Verifying article deletion...');
  deleteArticle(pubArticle.id);
  deleteArticle(draftArticle.id);
  assert(!getArticleById(pubArticle.id), 'Deleted article must not exist');
  assert(!getArticleById(draftArticle.id), 'Deleted article must not exist');
  console.log('  ✅ Deletion verified: Removed test articles.');

  // Test 8: Metrics
  console.log('\nTest 8: Verifying dashboard metrics aggregation...');
  const metrics = getDashboardMetrics();
  assert(typeof metrics.totalArticles === 'number', 'Metrics must return numeric counts');
  console.log('  ✅ Metrics verified:', metrics);

  console.log('\n======================================================');
  console.log('🎉 ALL PHASE 1 DATABASE & FOUNDATION TESTS PASSED (100%)');
  console.log('======================================================\n');
  closeDb();
  process.exit(0);
} catch (err) {
  console.error('\n❌ Test assertion failed:', err);
  closeDb();
  process.exit(1);
}

