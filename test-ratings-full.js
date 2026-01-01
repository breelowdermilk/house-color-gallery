const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  // Capture all console messages
  const consoleLogs = [];
  page.on('console', msg => {
    const text = msg.text();
    consoleLogs.push(text);
    // Log important messages
    if (text.includes('[Filter]') || text.includes('[Render]') || text.includes('[FilterChange]') ||
        text.includes('Ratings') || text.includes('[setRating]')) {
      console.log('BROWSER:', text);
    }
  });

  const results = [];

  function test(name, passed, details = '') {
    results.push({ name, passed, details });
    console.log(`${passed ? '✅' : '❌'} ${name}${details ? ': ' + details : ''}`);
  }

  try {
    console.log('\n=== HOUSE COLOR GALLERY RATING TESTS ===\n');

    // 1. Load page
    console.log('1. Loading page...');
    await page.goto('http://localhost:8080');
    await page.waitForLoadState('networkidle');
    test('Page loads', true);

    // 2. Select user
    if (await page.locator('#name-modal').isVisible()) {
      console.log('2. Selecting user Bree...');
      await page.click('text=Bree');
      await page.waitForTimeout(1500);
    }

    // Clear localStorage ratings for clean test (keep user)
    await page.evaluate(() => localStorage.removeItem('houseRatings'));
    await page.reload({ timeout: 10000 });
    await page.waitForTimeout(2000);

    // Handle name modal if it appears
    if (await page.locator('#name-modal').isVisible()) {
      await page.click('text=Bree');
      await page.waitForTimeout(1500);
    }

    // 3. Wait for gallery
    await page.waitForSelector('#image-grid [data-image-id]', { timeout: 10000 });
    // Use results-summary to get count (more reliable)
    const summaryTextInitial = await page.locator('#results-summary').textContent();
    const initialCount = parseInt(summaryTextInitial.match(/(\d+)/)?.[1] || '0');
    test('Gallery loads with images', initialCount > 0, `${initialCount} images (from summary)`);

    // 4. Test rating a photo
    console.log('\n--- TEST: Rating a photo ---');
    const firstLikeBtn = page.locator('#image-grid .rating-btn[data-rating="like"]').first();
    const imageId = await firstLikeBtn.getAttribute('data-image-id');
    console.log(`Rating image: ${imageId}`);
    await firstLikeBtn.click();
    // localStorage is written immediately (optimistically)
    await page.waitForTimeout(500);

    let ratings = JSON.parse(await page.evaluate(() => localStorage.getItem('houseRatings')) || '{}');
    test('Rating saves to localStorage', ratings[imageId]?.Bree === 'like', JSON.stringify(ratings));

    // 5. Test filter: My likes
    console.log('\n--- TEST: Filter "My likes" ---');
    await page.selectOption('#rating-filter', 'my-likes');
    // Wait for summary to show "1 photo" (async filter completion)
    try {
      await page.waitForFunction(() => {
        const summary = document.querySelector('#results-summary');
        return summary && summary.textContent.includes('1 photo');
      }, { timeout: 5000 });
    } catch (e) {
      console.log('Warning: Summary did not change to "1 photo" within timeout');
    }
    await page.waitForTimeout(500);

    const summaryText = await page.locator('#results-summary').textContent();
    const myLikesCount = parseInt(summaryText.match(/(\d+)/)?.[1] || '0');
    test('My likes filter shows 1 photo', myLikesCount === 1,
         `Summary: "${summaryText}"`);

    // 6. Test filter: Unrated
    console.log('\n--- TEST: Filter "Unrated" ---');
    await page.selectOption('#rating-filter', 'unrated');
    await page.waitForTimeout(3000);

    const unratedSummary = await page.locator('#results-summary').textContent();
    const unratedCount = parseInt(unratedSummary.match(/(\d+)/)?.[1] || '0');
    test('Unrated filter excludes rated', unratedCount === initialCount - 1,
         `Unrated: ${unratedCount}, Expected: ${initialCount - 1}`);

    // 7. Test toggle off (click same rating again)
    console.log('\n--- TEST: Toggle rating off ---');
    await page.selectOption('#rating-filter', 'all');
    await page.waitForTimeout(1000);

    // Find the liked image's like button and click again to toggle off
    const likedBtn = page.locator(`#image-grid [data-image-id="${imageId}"] .rating-btn[data-rating="like"]`);
    await likedBtn.click();
    await page.waitForTimeout(500);

    ratings = JSON.parse(await page.evaluate(() => localStorage.getItem('houseRatings')) || '{}');
    const isCleared = !ratings[imageId]?.Bree;
    test('Toggle clears rating', isCleared, JSON.stringify(ratings));

    // 8. Test dislike
    console.log('\n--- TEST: Dislike rating ---');
    const dislikeBtn = page.locator('#image-grid .rating-btn[data-rating="dislike"]').first();
    const dislikeImageId = await dislikeBtn.getAttribute('data-image-id');
    await dislikeBtn.click();
    await page.waitForTimeout(500);

    ratings = JSON.parse(await page.evaluate(() => localStorage.getItem('houseRatings')) || '{}');
    test('Dislike saves correctly', ratings[dislikeImageId]?.Bree === 'dislike');

    // 9. Test filter: My dislikes
    console.log('\n--- TEST: Filter "My dislikes" ---');
    await page.selectOption('#rating-filter', 'my-dislikes');
    // Wait for summary to show "1 photo"
    try {
      await page.waitForFunction(() => {
        const summary = document.querySelector('#results-summary');
        return summary && summary.textContent.includes('1 photo');
      }, { timeout: 5000 });
    } catch (e) {
      console.log('Warning: Summary did not change to "1 photo" within timeout');
    }
    await page.waitForTimeout(500);

    const dislikesSummary = await page.locator('#results-summary').textContent();
    const myDislikesCount = parseInt(dislikesSummary.match(/(\d+)/)?.[1] || '0');
    test('My dislikes filter works', myDislikesCount === 1, `Summary: "${dislikesSummary}"`);

    // 10. Test persistence across reload
    console.log('\n--- TEST: Persistence after reload ---');
    await page.selectOption('#rating-filter', 'all');
    await page.waitForTimeout(500);
    await page.reload({ timeout: 10000 });
    await page.waitForTimeout(2000);
    await page.waitForSelector('#image-grid [data-image-id]', { timeout: 10000 });

    ratings = JSON.parse(await page.evaluate(() => localStorage.getItem('houseRatings')) || '{}');
    test('Ratings persist after reload', ratings[dislikeImageId]?.Bree === 'dislike');

    // Summary
    console.log('\n=== TEST SUMMARY ===');
    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;
    console.log(`Passed: ${passed}/${results.length}`);
    if (failed > 0) {
      console.log('\nFailed tests:');
      results.filter(r => !r.passed).forEach(r => {
        console.log(`  ❌ ${r.name}: ${r.details}`);
      });
    }

    await page.screenshot({ path: '/tmp/rating-test-final.png' });
    console.log('\nScreenshot saved to /tmp/rating-test-final.png');

  } catch (error) {
    console.error('Test error:', error);
  }

  await page.waitForTimeout(2000);
  await browser.close();
})();
