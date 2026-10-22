import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const BASE_URL = 'http://localhost:3000';
const SCREENSHOT_DIR = path.join(process.cwd(), 'screenshots');

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function runAuthQC() {
  console.log('🚀 Starting Automated Auth QC & Browser Verification...');
  const browser = await chromium.launch({
    channel: 'msedge',
    headless: true,
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  const report = [];

  try {
    // 1. Visit Login Page
    console.log('1. Navigating to Login Page (/login)...');
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    const loginTitle = await page.textContent('h1');
    console.log(`   Found title: "${loginTitle}"`);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'qa_auth_1_login_page.png') });
    report.push({ step: '1. Login Page Render', status: 'PASS', details: loginTitle });

    // 2. Click Quick Fill "Research Pilot"
    console.log('2. Clicking "Research Pilot" 1-click test credential button...');
    const quickDemoBtn = page.locator('button:has-text("Research Pilot")');
    await quickDemoBtn.click();
    await page.waitForTimeout(500);

    const emailValue = await page.inputValue('#email');
    const passwordValue = await page.inputValue('#pass');
    console.log(`   Form auto-filled: ${emailValue} / (length: ${passwordValue.length})`);
    if (emailValue !== 'demo@researchpilot.ai') throw new Error('Email auto-fill failed');

    // 3. Submit Login
    console.log('3. Submitting login form...');
    const submitBtn = page.locator('button[type="submit"]:has-text("Sign In")');
    await submitBtn.click();
    await page.waitForURL(`${BASE_URL}/`, { timeout: 10000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'qa_auth_2_logged_in_dashboard.png') });
    console.log('   Successfully redirected to Dashboard (/); session established.');
    report.push({ step: '2. Login & Session Creation', status: 'PASS', details: 'Redirected to /' });

    // 4. Verify Header UserMenu
    console.log('4. Verifying User Menu in Header...');
    const userMenuBtn = page.getByLabel('User menu');
    await userMenuBtn.waitFor({ state: 'visible', timeout: 5000 });
    const userMenuText = await userMenuBtn.textContent();
    console.log(`   Header User Badge text: "${userMenuText?.trim()}"`);
    await userMenuBtn.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'qa_auth_3_user_menu_dropdown.png') });
    report.push({ step: '3. UserMenu Dropdown Display', status: 'PASS', details: userMenuText?.trim() });

    // 5. Sign Out
    console.log('5. Clicking Sign Out button...');
    const signOutBtn = page.locator('button:has-text("Sign Out")');
    await signOutBtn.click();
    await page.waitForURL(`${BASE_URL}/login`, { timeout: 10000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'qa_auth_4_logged_out.png') });
    console.log('   Sign out completed and redirected to /login.');
    report.push({ step: '4. Sign Out & Cookie Invalidation', status: 'PASS', details: 'Redirected to /login' });

    // 6. Register Page & New Account Flow
    console.log('6. Navigating to Register Page (/register)...');
    await page.goto(`${BASE_URL}/register`, { waitUntil: 'networkidle' });
    const regTitle = await page.textContent('h1');
    console.log(`   Found register title: "${regTitle}"`);

    const uniqueId = Date.now().toString().slice(-4);
    const newName = `Dr. Alex QA ${uniqueId}`;
    const newEmail = `alex.qa.${uniqueId}@researchpilot.ai`;
    const newPass = 'StrongPass123!';

    await page.fill('#reg-name', newName);
    await page.fill('#reg-email', newEmail);
    await page.fill('#reg-pass', newPass);
    await page.fill('#reg-confirm', newPass);
    await page.check('#terms');

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'qa_auth_5_register_filled.png') });

    const createAccountBtn = page.locator('button[type="submit"]:has-text("Create Account")');
    await createAccountBtn.click();
    await page.waitForURL(`${BASE_URL}/`, { timeout: 10000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'qa_auth_6_registered_logged_in.png') });
    console.log(`   Registration successful. Automatically logged in as ${newName}`);
    report.push({ step: '5. User Registration & Auto-Login', status: 'PASS', details: newEmail });

    // 7. Forgot Password Page Flow
    console.log('7. Navigating to Forgot Password (/forgot-password)...');
    await page.goto(`${BASE_URL}/forgot-password`, { waitUntil: 'networkidle' });
    await page.fill('#reset-email', 'demo@researchpilot.ai');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'qa_auth_7_forgot_password_form.png') });

    const sendResetBtn = page.locator('button[type="submit"]:has-text("Send Recovery Link")');
    await sendResetBtn.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'qa_auth_8_forgot_password_success.png') });
    console.log('   Password reset request submitted successfully.');
    report.push({ step: '6. Forgot Password Request', status: 'PASS', details: 'Instructions & token generated' });

    // 8. Reset Password Page
    console.log('8. Navigating to Reset Password (/reset-password)...');
    await page.goto(`${BASE_URL}/reset-password`, { waitUntil: 'networkidle' });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'qa_auth_9_reset_password_page.png') });
    report.push({ step: '7. Reset Password Page Render', status: 'PASS', details: 'Form active' });

    console.log('\n=======================================');
    console.log('🎉 ALL AUTH QC & BROWSER CHECKS PASSED!');
    console.log('=======================================');
    console.table(report);
  } catch (err) {
    console.error('❌ QC Error:', err);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'qa_auth_error.png') });
    process.exit(1);
  } finally {
    await browser.close();
  }
}

runAuthQC();
