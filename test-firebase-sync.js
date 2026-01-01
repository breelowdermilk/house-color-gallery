const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const errors = [];
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('permission') || text.includes('Permission') || text.includes('FirebaseError')) {
      errors.push(text);
    }
  });

  console.log('Loading page...');
  await page.goto('http://localhost:8080');
  await page.waitForTimeout(2000);

  if (await page.locator('#name-modal').isVisible()) {
    console.log('Selecting user Bree...');
    await page.click('text=Bree');
    await page.waitForTimeout(2000);
  }

  await page.waitForSelector('#image-grid', { timeout: 5000 });
  await page.waitForTimeout(3000);

  if (errors.length > 0) {
    console.log('\n❌ Firebase ERRORS found:');
    errors.slice(0, 5).forEach(e => console.log('  ', e.substring(0, 100)));
  } else {
    console.log('\n✅ No Firebase permission errors - sync is working!');
  }

  // Check for any rating summaries that show other users
  const summaries = await page.locator('[data-rating-summary]').all();
  let foundRatings = [];
  for (const s of summaries.slice(0, 10)) {
    const text = await s.textContent();
    if (text && text.trim().length > 0 && text.indexOf('No votes') === -1) {
      foundRatings.push(text.trim());
    }
  }

  if (foundRatings.length > 0) {
    console.log('\n✅ Found ratings from users:');
    foundRatings.forEach(r => console.log('  ', r));
  } else {
    console.log('\nNo existing ratings visible (Riley may need to rate some images first)');
  }

  await browser.close();
})();
