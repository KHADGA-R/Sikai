import { test, expect } from '@playwright/test';

// Deterministic API fixtures isolate the shared layout from real account/course data.
for (const width of [1440, 900, 390]) {
  test(`student header contains its navigation while scrolling every tab at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.addInitScript(() => sessionStorage.setItem('sikai.api-token', 'layout-test-token'));
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      const body = path === '/api/auth/me'
        ? { id: 'layout-student', name: 'Layout Student', email: 'layout@example.com', role: 'student' }
        : path === '/api/me/progress' ? {} : [];
      await route.fulfill({ json: body });
    });

    for (const path of ['/', '/wishlist', '/my-learning', '/live-classes', '/my-progress', '/completed-courses', '/my-achievements']) {
      await page.goto(path);
      await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
      await page.addStyleTag({ content: 'main { min-height: 2000px; }' });
      await page.evaluate(() => window.scrollTo(0, 450));
      await expect.poll(() => page.evaluate(() => {
        const header = document.querySelector<HTMLElement>('.site-header')!;
        const nav = header.querySelector('nav')!;
        const headerRect = header.getBoundingClientRect();
        const navRect = nav.getBoundingClientRect();
        return {
          sticky: Math.abs(headerRect.top) <= 1,
          containsNavigation: navRect.bottom <= headerRect.bottom + 1 && navRect.top >= headerRect.top,
          opaque: getComputedStyle(header).backgroundColor === 'rgb(255, 255, 255)',
          measured: Math.abs(parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--site-header-height')) - headerRect.height) <= 1
        };
      })).toEqual({ sticky: true, containsNavigation: true, opaque: true, measured: true });
    }

    await page.goto('/live-classes');
    if (width > 740) {
      await expect.poll(() => page.locator('.availability-panel').evaluate(panel => {
        const headerHeight = document.querySelector('.site-header')!.getBoundingClientRect().height;
        return parseFloat(getComputedStyle(panel).top) - headerHeight;
      })).toBeGreaterThanOrEqual(19);
    }
  });
}
