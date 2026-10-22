import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:3000';

async function testStrictAuthProxy() {
  console.log('🚀 Testing Strict Authentication Barrier & Edge Proxy...');
  const browser = await chromium.launch({
    channel: 'msedge',
    headless: true,
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  const report = [];

  try {
    // 1. Unauthenticated access to / -> MUST redirect to /login
    console.log('1. Attempting unauthenticated access to / (Dashboard)...');
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
    const urlAfterRoot = page.url();
    console.log(`   Resulting URL: ${urlAfterRoot}`);
    if (!urlAfterRoot.includes('/login')) {
      throw new Error(`Expected redirect to /login but landed on: ${urlAfterRoot}`);
    }
    report.push({ test: 'Unauthenticated / Redirect', status: 'PASS', details: 'Redirected to /login' });

    // 2. Unauthenticated access to /documents -> MUST redirect to /login?from=%2Fdocuments
    console.log('2. Attempting unauthenticated access to /documents...');
    await page.goto(`${BASE_URL}/documents`, { waitUntil: 'networkidle' });
    const urlAfterDocs = page.url();
    console.log(`   Resulting URL: ${urlAfterDocs}`);
    if (!urlAfterDocs.includes('/login')) {
      throw new Error(`Expected redirect to /login but landed on: ${urlAfterDocs}`);
    }
    report.push({ test: 'Unauthenticated /documents Redirect', status: 'PASS', details: 'Redirected to /login' });

    // 3. Unauthenticated access to /settings -> MUST redirect to /login?from=%2Fsettings
    console.log('3. Attempting unauthenticated access to /settings...');
    await page.goto(`${BASE_URL}/settings`, { waitUntil: 'networkidle' });
    const urlAfterSettings = page.url();
    console.log(`   Resulting URL: ${urlAfterSettings}`);
    if (!urlAfterSettings.includes('/login')) {
      throw new Error(`Expected redirect to /login but landed on: ${urlAfterSettings}`);
    }
    report.push({ test: 'Unauthenticated /settings Redirect', status: 'PASS', details: 'Redirected to /login' });

    // 4. Public access to /architecture -> MUST be allowed
    console.log('4. Visiting public /architecture blueprint...');
    const archRes = await page.goto(`${BASE_URL}/architecture`, { waitUntil: 'networkidle' });
    const archUrl = page.url();
    if (!archUrl.includes('/architecture')) {
      throw new Error(`Expected /architecture to be public but redirected to: ${archUrl}`);
    }
    const headers = archRes.headers();
    if (headers['x-frame-options'] !== 'DENY') throw new Error('Missing security headers');
    report.push({ test: 'Public Blueprint Access (/architecture)', status: 'PASS', details: 'Loaded with security headers' });

    // 5. Public access to /login -> MUST load login form
    console.log('5. Visiting /login form as guest...');
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    const loginTitle = await page.textContent('h1');
    if (!loginTitle?.includes('Welcome back')) throw new Error('Login page title mismatch');
    report.push({ test: 'Public /login Access', status: 'PASS', details: loginTitle });

    // 6. Simulate Login by adding session cookie
    console.log('6. Adding authentication session cookie (rp_session)...');
    await context.addCookies([
      {
        name: 'rp_session',
        value: 'qa_verified_session_token',
        domain: 'localhost',
        path: '/',
      },
    ]);

    // 7. Authenticated user visiting / -> MUST NOT be redirected to /login
    console.log('7. Visiting / with active session...');
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
    const authedRootUrl = page.url();
    console.log(`   Authenticated / URL: ${authedRootUrl}`);
    if (authedRootUrl !== `${BASE_URL}/`) {
      throw new Error(`Expected to stay on / but got: ${authedRootUrl}`);
    }
    report.push({ test: 'Authenticated Platform Access (/)', status: 'PASS', details: 'Full workspace access granted' });

    // 8. Authenticated user visiting /login -> MUST redirect away to /
    console.log('8. Authenticated user attempting to visit /login...');
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    const authedLoginRedirect = page.url();
    console.log(`   Redirected from /login to: ${authedLoginRedirect}`);
    if (authedLoginRedirect !== `${BASE_URL}/`) {
      throw new Error(`Expected redirect to / but got: ${authedLoginRedirect}`);
    }
    report.push({ test: 'Authenticated /login Intercept', status: 'PASS', details: 'Redirected to /' });

    console.log('\n======================================================');
    console.log('🎉 ALL STRICT AUTHENTICATION BARRIER CHECKS PASSED!');
    console.log('======================================================');
    console.table(report);
  } catch (err) {
    console.error('❌ Strict Auth Test Failed:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

testStrictAuthProxy();
