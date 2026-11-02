import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, firefox, webkit, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const base = process.env.PREVIEW_URL || 'http://localhost:3100';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Browser tests must target the isolated local preview.');
const output = new URL('../scratch/visual-checks/', import.meta.url);
await mkdir(output, { recursive: true });
const sizes = [320, 390, 768, 1024, 1440, 1920];
const routes = ['/', '/search', '/category/science', '/books/demo-the-monsoon-ledger', '/wishlist', '/books/researching-research-for-ayurveda', '/books/integrative-perspectives', '/cart', '/checkout?book=researching-research-for-ayurveda', '/publish', '/login', '/privacy', '/order/unknown'];
const failures = [];
for (const [name, engine] of Object.entries({ chromium, firefox, webkit })) {
  if (process.env.BROWSERS && !process.env.BROWSERS.split(',').includes(name)) continue;
  const browser = await engine.launch();
  try {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.on('pageerror', error => failures.push(`${name}: ${String(error)} ${error?.stack || ''}`));
    for (const width of sizes) {
      await page.setViewportSize({ width, height: width < 768 ? 800 : 1000 });
      for (const route of routes) {
        const response = await page.goto(base + route, { waitUntil: 'networkidle' });
        assert.equal(response.status(), 200, `${name} ${width} ${route}`);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
        if (overflow) failures.push(`${name}: overflow ${width} ${route}`);
        for (const image of await page.locator('main img:visible').all()) {
          await image.scrollIntoViewIfNeeded();
          await expect.poll(() => image.evaluate(image => image.complete && image.naturalWidth > 0), { timeout: 15000 }).toBeTruthy();
        }
        await page.evaluate(() => scrollTo(0, 0));
        const images = await page.locator('main img:visible').evaluateAll(images => images.filter(image => !image.complete || image.naturalWidth === 0).map(image => image.src));
        if (images.length) failures.push(`${name}: missing images ${width} ${route}: ${images}`);
        if (route === '/') {
          await page.evaluate(() => document.fonts.ready);
          assert.ok(await page.evaluate(() => document.fonts.check('500 32px "Geist Variable"') && document.fonts.check('500 12px "Geist Mono Variable"')), `${name}: local fonts loaded`);
          const hero = await page.locator('.hero-campaign h1').first().boundingBox();
          if (!hero || hero.y >= (width < 768 ? 800 : 1000)) failures.push(`${name}: no first-viewport hero at ${width}`);
          if (!(await page.locator('.hero-campaign .hero-cover').count())) failures.push(`${name}: hero has no covers at ${width}`);
          assert.equal(await page.locator('.hero-controls [aria-label="Pause slides"]').count(), 0, `${name}: reduced motion shows no autoplay control`);
          await page.locator('[data-book-card]').first().hover();
          await page.waitForTimeout(300);
          assert.ok(await page.locator('[data-book-card]').first().evaluate(el => ['none', 'matrix(1, 0, 0, 1, 0, 0)'].includes(getComputedStyle(el).transform)), `${name}: reduced motion respected`);
          const copy = await page.locator('main').evaluate(el => el.innerHTML);
          const { copyViolations } = await import('../src/lib/copy.ts');
          for (const v of copyViolations(copy)) failures.push(`${name}: homepage copy ${v}`);
          await page.mouse.move(0, 0);
        }
        const shots = { '/': 'home', '/books/demo-the-monsoon-ledger': 'book', '/search': 'search' };
        if (name === 'chromium' && shots[route]) {
          await page.screenshot({ path: fileURLToPath(new URL(`${shots[route]}-${width}.png`, output)), fullPage: true });
        }
      }
      console.log(`${name}: ${width}px routes checked`);
    }
    for (const route of ['/', '/search', '/category/science', '/books/demo-the-monsoon-ledger', '/cart', '/wishlist', '/login', '/publish']) {
      await page.goto(base + route, { waitUntil: 'networkidle' });
      const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      for (const violation of result.violations) failures.push(`${name}: accessibility ${route}: ${violation.id}: ${violation.nodes.map(node => node.target).join(',')}`);
    }
    await page.goto(base + '/search?q=nonexistent-title');
    await expect(page.getByRole('heading', { name: 'No add-ons match these filters' })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(base + '/books/researching-research-for-ayurveda');
    await expect(page.getByText('Ordering opens soon.', { exact: false })).toBeVisible();
    await page.getByRole('button', { name: 'Save to bag: Researching Research for Ayurveda' }).click();
    await expect(page.getByRole('dialog', { name: /Your bag/ })).toBeVisible();
    await page.keyboard.press('Escape');
    await page.goto(base + '/cart');
    await expect(page.getByRole('heading', { name: 'Researching Research for Ayurveda', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Checkout unavailable' })).toBeDisabled();
    await expect(page.getByText('Online ordering is currently unavailable.', { exact: false })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Researching Research for Ayurveda', exact: true })).toBeVisible();
    await page.getByRole('button', { name: /Remove Researching/ }).click();
    await expect(page.getByText('Your bag is empty.')).toBeVisible();
    await page.goto(base + '/checkout?book=researching-research-for-ayurveda');
    await expect(page.getByText('Online ordering is currently unavailable.', { exact: false })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Payment unavailable' })).toBeDisabled();
    await expect(page.getByLabel('Full name')).toBeDisabled();
    await expect(page.getByRole('link', { name: 'Continue browsing' })).toBeVisible();
    for (const viewport of [{ width: 844, height: 390 }, { width: 640, height: 480 }]) {
      await page.setViewportSize(viewport);
      await page.goto(base);
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) failures.push(`${name}: landscape overflow`);
    }
    // 200% browser zoom on a 1024x768 screen is a 512x384 CSS viewport (WCAG reflow); media queries respond as they would for a reader.
    await page.setViewportSize({ width: 512, height: 384 });
    await page.goto(base, { waitUntil: 'networkidle' });
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) failures.push(`${name}: 200% zoom overflow`);
    await page.goto(base, { waitUntil: 'networkidle' });
    // The dev server's tools overlay sits first in tab order; production has no overlay.
    await page.evaluate(() => document.querySelectorAll('nextjs-portal').forEach(node => node.remove()));
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#main$/);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.getByRole('combobox', { name: /Search books/ }).fill('monsoon led');
    await expect(page.getByRole('listbox', { name: 'Suggestions' })).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/books\/demo-the-monsoon-ledger$/);
    await page.getByRole('button', { name: /Add The Monsoon Ledger to wishlist/ }).first().click();
    await page.goto(base + '/wishlist');
    await expect(page.getByRole('link', { name: 'The Monsoon Ledger' }).first()).toBeVisible();
    const fixtureContext = await browser.newContext({ javaScriptEnabled: false });
    const fixturePage = await fixtureContext.newPage();
    for (const width of [320, 768, 1440]) {
      await fixturePage.setViewportSize({ width, height: 800 });
      for (const count of [1, 2, 9]) {
        await fixturePage.goto(base + '/search');
        await fixturePage.locator('.grid-books').evaluate((grid, count) => {
          const card = grid.firstElementChild.cloneNode(true);
          grid.replaceChildren();
          for (let index = 0; index < count; index++) {
            const item = card.cloneNode(true);
            item.querySelector('.card-body h3 a').textContent = index % 2 ? 'An unusually long publication title about research methodology, practice, and natural products' : 'PublicationWithAnUnusuallyLongUnbrokenTitleToCheckResponsiveWrapping';
            if (index === 2) item.querySelector('.card-cover img')?.remove();
            grid.append(item);
          }
        }, count);
        if (await fixturePage.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) failures.push(`${name}: ${count}-book long-title fixture overflow at ${width}`);
      }
    }
    await fixtureContext.close();
    const noJs = await browser.newContext({ javaScriptEnabled: false });
    const staticPage = await noJs.newPage();
    await staticPage.goto(base);
    await expect(staticPage.locator('[data-book-card]').first()).toBeVisible();
    await staticPage.goto(base + '/search?q=monsoon');
    await expect(staticPage.getByRole('link', { name: 'The Monsoon Ledger' }).first()).toBeVisible();
    await noJs.close();
    if (name === 'chromium') {
      const moving = await browser.newContext({ reducedMotion: 'no-preference' });
      const live = await moving.newPage();
      await live.goto(base + '/search', { waitUntil: 'networkidle' });
      assert.ok(await live.evaluate(() => typeof document.startViewTransition === 'function'), 'view transitions available in Chromium');
      const add = live.locator('[data-book-card] .card-foot button.card-add:not([disabled])').first();
      if (await add.count()) {
        await add.click();
        await expect.poll(() => live.evaluate(() => [...document.querySelectorAll('body > img[aria-hidden="true"]')].some(i => i.style.position === 'fixed')), { timeout: 2000 }).toBeTruthy();
      }
      await live.keyboard.press('Escape');
      await live.locator('[data-book-card] .card-title a').first().click();
      await live.waitForURL(/\/books\//);
      await expect(live.locator('.product-page .book3d').first()).toBeVisible();
      await moving.close();
    }
    await context.close();
  } finally { await browser.close(); }
}
console.log(failures.join('\n'));
assert.equal(failures.length, 0, 'Visual, accessibility, or browser errors found.');
console.log('All requested browser widths, public routes, image loads, and no-JavaScript catalogue checks passed.');
