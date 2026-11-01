import fs from 'node:fs';
import path from 'node:path';

console.log('🔍 Running Phase 1 Public Sanitization Verification...\n');

let failed = false;

const publicFiles = [
  'index.html',
  'article.html',
  'category.html',
  'search.html'
];

const forbiddenPatterns = [
  { pattern: /admin\/login\.html/i, label: 'Link to admin/login.html' },
  { pattern: /admin\/dashboard\.html/i, label: 'Link to admin/dashboard.html' },
  { pattern: /btn-signin-pill/i, label: 'Admin sign-in pill class' },
  { pattern: /btn-ad-manager-pill/i, label: 'Admin CMS manager pill' },
  { pattern: /id=["']floatingAdToolBtn["']/i, label: 'Floating ad inspector button' },
  { pattern: /id=["']adManagerModal["']/i, label: 'Ad manager modal' },
  { pattern: /व्यवस्थापक लॉगिन/i, label: 'Hindi admin login text' }
];

console.log('1. Checking Public HTML Templates for Admin Traces:');
for (const relFile of publicFiles) {
  const filePath = path.resolve(relFile);
  if (!fs.existsSync(filePath)) {
    console.error(`   ❌ File missing: ${relFile}`);
    failed = true;
    continue;
  }
  const content = fs.readFileSync(filePath, 'utf8');
  let fileHasLeaks = false;

  for (const { pattern, label } of forbiddenPatterns) {
    if (pattern.test(content)) {
      console.error(`   ❌ Leak in ${relFile}: Found "${label}"`);
      fileHasLeaks = true;
      failed = true;
    }
  }

  if (!fileHasLeaks) {
    console.log(`   ✅ Clean: ${relFile} (zero admin entrance links or controls)`);
  }
}

console.log('\n2. Verifying Private Admin Surfaces Remain Intact:');
const adminFiles = [
  'admin/login.html',
  'admin/dashboard.html',
  'admin/admin.js',
  'admin/admin.css'
];

for (const relFile of adminFiles) {
  const filePath = path.resolve(relFile);
  if (!fs.existsSync(filePath)) {
    console.error(`   ❌ Required admin file missing: ${relFile}`);
    failed = true;
  } else {
    console.log(`   ✅ Admin file present: ${relFile}`);
  }
}

// 3. Verify Login Form Accessibility
const loginHtmlPath = path.resolve('admin/login.html');
const loginHtml = fs.readFileSync(loginHtmlPath, 'utf8');
const hasEmail = loginHtml.includes('type="email"') || loginHtml.includes('id="adminEmail"');
const hasPassword = loginHtml.includes('type="password"') || loginHtml.includes('id="adminPassword"');
const hasSubmit = loginHtml.includes('type="submit"') || loginHtml.includes('btnAdminLogin');

console.log('\n3. Verifying Private Admin Login Form:');
if (hasEmail && hasPassword && hasSubmit) {
  console.log('   ✅ Private login interface has email, password, and submission fields.');
} else {
  console.error('   ❌ Login form missing critical input fields.');
  failed = true;
}

if (failed) {
  console.error('\n❌ Phase 1 Verification FAILED.');
  process.exit(1);
} else {
  console.log('\n🎉 Phase 1 Public Sanitization PASSED (100%). Public frontend is clean and admin is private.\n');
}
