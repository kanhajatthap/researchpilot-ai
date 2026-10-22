import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:3000';

async function verifySEO() {
  console.log('🚀 Running Full SEO, Metadata, Sitemap & Robots.txt Verification...');
  const browser = await chromium.launch({
    channel: 'msedge',
    headless: true,
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  const report = [];

  try {
    // 1. Verify /robots.txt
    console.log('1. Fetching /robots.txt...');
    const robotsRes = await page.goto(`${BASE_URL}/robots.txt`);
    const robotsText = await robotsRes.text();
    console.log(`   Robots.txt Content Preview:\n${robotsText.slice(0, 150)}...`);
    if (!robotsText.includes('User-Agent') && !robotsText.includes('user-agent')) {
      throw new Error('Invalid robots.txt content');
    }
    if (!robotsText.includes('sitemap.xml')) {
      throw new Error('robots.txt missing sitemap directive');
    }
    report.push({ check: 'robots.txt Generation', status: 'PASS', details: 'Directives and sitemap linked' });

    // 2. Verify /sitemap.xml
    console.log('2. Fetching /sitemap.xml...');
    const sitemapRes = await page.goto(`${BASE_URL}/sitemap.xml`);
    const sitemapText = await sitemapRes.text();
    console.log(`   Sitemap length: ${sitemapText.length} bytes`);
    if (!sitemapText.includes('<urlset') || !sitemapText.includes('/architecture')) {
      throw new Error('Invalid sitemap.xml format or missing /architecture URL');
    }
    report.push({ check: 'sitemap.xml Generation', status: 'PASS', details: 'Contains full URL index' });

    // 3. Verify /architecture page meta tags
    console.log('3. Verifying /architecture SEO metadata & tags...');
    await page.goto(`${BASE_URL}/architecture`, { waitUntil: 'networkidle' });
    const archTitle = await page.title();
    console.log(`   /architecture Page Title: "${archTitle}"`);
    if (!archTitle.includes('System Architecture & Technical Blueprint')) {
      throw new Error(`Unexpected architecture title: ${archTitle}`);
    }

    const archMetaDesc = await page.getAttribute('meta[name="description"]', 'content');
    console.log(`   Meta Description: "${archMetaDesc?.slice(0, 60)}..."`);
    if (!archMetaDesc || archMetaDesc.length < 20) {
      throw new Error('Missing or short meta description on /architecture');
    }

    const ogTitle = await page.getAttribute('meta[property="og:title"]', 'content');
    if (!ogTitle) throw new Error('Missing Open Graph og:title tag');
    report.push({ check: '/architecture SEO Tags', status: 'PASS', details: archTitle });

    // 4. Verify /login page meta tags
    console.log('4. Verifying /login SEO metadata...');
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    const loginTitle = await page.title();
    console.log(`   /login Page Title: "${loginTitle}"`);
    if (!loginTitle.includes('Sign In to Your Workspace')) {
      throw new Error(`Unexpected login title: ${loginTitle}`);
    }
    report.push({ check: '/login SEO Tags', status: 'PASS', details: loginTitle });

    // 5. Verify JSON-LD Structured Data Schema
    console.log('5. Inspecting JSON-LD Structured Data Schema on /login...');
    const jsonLdScript = await page.locator('script[type="application/ld+json"]').textContent();
    if (!jsonLdScript) throw new Error('Missing application/ld+json structured schema script');
    const parsedSchema = JSON.parse(jsonLdScript);
    console.log(`   Schema Type: "${parsedSchema['@type']}", Name: "${parsedSchema.name}"`);
    if (parsedSchema['@type'] !== 'WebApplication' || parsedSchema.name !== 'ResearchPilot AI') {
      throw new Error('Invalid JSON-LD schema contents');
    }
    report.push({ check: 'JSON-LD Structured Data', status: 'PASS', details: 'schema.org/WebApplication validated' });

    console.log('\n======================================================');
    console.log('🎉 ALL SEO & METADATA VERIFICATION CHECKS PASSED!');
    console.log('======================================================');
    console.table(report);
  } catch (err) {
    console.error('❌ SEO Verification Failed:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

verifySEO();
