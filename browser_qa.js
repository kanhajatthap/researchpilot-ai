const { chromium } = require('playwright');

async function runBrowserQA() {
  console.log('=== STARTING AUTOMATED BROWSER QA ===');
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  console.log('1. Navigating to http://localhost:3000...');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });

  // Verify page title
  const title = await page.title();
  console.log('✓ Page Title:', title);

  // Check document badge
  const docBadge = page.locator('text=tsla-20241231-gen').first();
  const docVisible = await docBadge.isVisible().catch(() => false);
  console.log('✓ Document "tsla-20241231-gen" visible:', docVisible);

  // Select document scope
  const scopeButton = page.locator('button:has-text("tsla-20241231-gen")').first();
  if (await scopeButton.isVisible()) {
    console.log('✓ Selecting document scope...');
    await scopeButton.click();
    await page.waitForTimeout(500);
  }

  // Type question in Chat Composer
  const question = "What was Tesla's total automotive revenue in 2024?";
  console.log('2. Submitting question:', question);
  const textarea = page.locator('textarea[aria-label="Message"]');
  await textarea.fill(question);

  // Click Send
  const sendBtn = page.locator('button[aria-label="Send message"]');
  await sendBtn.click();

  console.log('3. Waiting for agent execution and streamed answer in browser UI (up to 120s)...');

  // Wait for the assistant's .prose container to contain actual text (> 20 characters)
  await page.waitForFunction(() => {
    const proses = document.querySelectorAll('.prose');
    if (proses.length === 0) return false;
    const last = proses[proses.length - 1];
    return last && last.innerText && last.innerText.trim().length > 20;
  }, undefined, { timeout: 120000 });

  console.log('✓ Assistant response text detected in UI!');

  // Wait until the Thinking indicator is gone
  await page.waitForSelector('text=Thinking', { state: 'detached', timeout: 30000 }).catch(() => {});
  
  // Wait 2s for all tokens and citations to settle
  await page.waitForTimeout(2000);

  // Extract the text content from the rendered prose container
  const assistantResponseText = await page.evaluate(() => {
    const proseEls = document.querySelectorAll('.prose');
    if (proseEls.length > 0) {
      return proseEls[proseEls.length - 1].innerText;
    }
    return '';
  });

  console.log('\n================ RENDERED UI RESPONSE ================');
  console.log(assistantResponseText.trim());
  console.log('======================================================\n');

  // Extract citations from the UI
  const citationBadges = await page.evaluate(() => {
    const badges = [];
    document.querySelectorAll('button').forEach((b) => {
      const text = b.innerText || '';
      if (text.includes('tsla-20241231-gen') || (text.includes('p.') && text.includes('tsla'))) {
        badges.push(text.trim());
      }
    });
    return badges;
  });
  console.log('✓ Citations rendered in UI:', citationBadges.length, citationBadges.slice(0, 5));

  // Assertions
  const hasRevenueData =
    assistantResponseText.includes('77,070') ||
    assistantResponseText.includes('77.07') ||
    assistantResponseText.includes('72,480');
  const hasEmptyError =
    assistantResponseText.includes('The assistant returned an empty response');

  console.log('\n=== BROWSER QA VERIFICATION RESULTS ===');
  console.log('1. Answer contains accurate revenue ($77,070M / $77.07B):', hasRevenueData ? 'PASSED ✅' : 'FAILED ❌');
  console.log('2. No empty response error:', !hasEmptyError ? 'PASSED ✅' : 'FAILED ❌');
  console.log('3. Citations rendered to user:', citationBadges.length > 0 ? 'PASSED ✅' : 'FAILED ❌');

  // Save full-page screenshot
  const screenshotPath = 'qa_verified_browser.png';
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log('✓ Proof screenshot saved to:', screenshotPath);

  await browser.close();
  console.log('=== BROWSER QA TEST FINISHED ===');

  if (!hasRevenueData || hasEmptyError) {
    process.exit(1);
  }
}

runBrowserQA().catch((err) => {
  console.error('Browser QA test failed:', err);
  process.exit(1);
});
