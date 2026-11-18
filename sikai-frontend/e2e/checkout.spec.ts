import { test, expect, Page } from '@playwright/test';

async function checkoutFixture(page: Page, free = false, enabled = true) {
  let enrolled = false;
  let verified = false;
  let checks = 0;
  const course = { id: 99, title: 'Conversational Nepali', description: 'Learn Nepali at your own pace.', instructor: 'Sikai Teacher', category: 'Languages', subcategory: 'Nepali', price: free ? 0 : 10, isFree: free, level: 'BEGINNER', rating: 0, durationHours: 2, lessons: 4, emoji: 'N', accent: 'teal', published: true };
  await page.addInitScript(() => sessionStorage.setItem('sikai.api-token', 'checkout-test'));
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown = [];
    if (path === '/api/auth/me') body = { id: 'buyer', name: 'Checkout Learner', email: 'buyer@example.com', role: 'student' };
    else if (path === '/api/courses') body = [course];
    else if (path === '/api/courses/99') body = course;
    else if (path === '/api/checkout/courses/99') body = { courseId: 99, amount: free ? 0 : 1000, currency: 'NPR', originalAmount: course.price, originalCurrency: 'USD', exchangeRate: 100, activeAttempt: null, paymentAvailable: enabled, configurationMessage: 'Online payments are unavailable until configured.', providers: [{ id: 'esewa', label: 'eSewa', available: enabled, amount: free ? 0 : 1000, currency: 'NPR' }, { id: 'khalti', label: 'Khalti', available: enabled, amount: free ? 0 : 1000, currency: 'NPR' }, { id: 'paypal', label: 'PayPal', available: enabled, amount: course.price, currency: 'USD' }] };
    else if (path === '/api/checkout/orders') body = { id: 'order-1' };
    else if (path === '/api/checkout/orders/order-1/complete') { enrolled = true; body = { status: 'completed' }; }
    else if (path === '/api/checkout/orders/order-1/payments') {
      const request = route.request().postDataJSON();
      if (request.provider === 'paypal') {
        expect(request).toEqual({ provider: 'paypal', expectedAmount: 10, expectedCurrency: 'USD' });
        await route.fulfill({ json: { id: 'paypal-attempt', courseId: 99, provider: 'paypal', status: 'pending', redirect: { method: 'GET', url: 'https://www.sandbox.paypal.com/checkoutnow?token=TEST', fields: {} } } });
        return;
      }
      expect(request).toEqual({ provider: 'esewa', expectedAmount: 1000, expectedCurrency: 'NPR' });
      body = { id: 'attempt-1', status: 'pending', provider: 'esewa', redirect: { method: 'GET', url: 'https://rc-epay.esewa.com.np/epay?bookingId=test-session', fields: {} } };
    } else if (path === '/api/checkout/payments/attempt-1/verify') {
      checks++; if (checks > 1) { verified = true; enrolled = true; }
      body = { id: 'attempt-1', courseId: 99, provider: 'esewa', status: verified ? 'completed' : 'pending' };
    } else if (path === '/api/me/enrollments') body = enrolled ? [course] : [];
    else if (path === '/api/me/notifications') body = {items: [], unreadCount: 0, total: 0, hasMore: false};
    else if (path === '/api/me/progress') body = {};
    await route.fulfill({ json: body });
  });
}

test('free checkout confirms enrollment and opens learning', async ({ page }) => {
  await checkoutFixture(page, true);
  await page.goto('/checkout/99');
  const complete = page.getByRole('button', { name: /Complete free enrollment/ });
  await expect(complete).toBeDisabled();
  await page.getByRole('checkbox').check();
  await complete.click();
  await expect(page.getByRole('heading', { name: 'You’re ready to learn!' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Start learning/ })).toHaveAttribute('href', '/learn/99');
});

test('paid checkout opens saved eSewa session and shows both wallets on mobile', async ({ page }) => {
  await checkoutFixture(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/checkout/99');
  await expect(page.getByRole('radio', { name: /eSewa/ })).toBeChecked();
  await expect(page.getByRole('radio', { name: /Khalti/ })).toBeEnabled();
  await page.getByRole('checkbox').check();
  await page.route('https://rc-epay.esewa.com.np/**', route => route.fulfill({ contentType: 'text/html', body: '<h1>Wallet checkout</h1>' }));
  const request = page.waitForRequest('https://rc-epay.esewa.com.np/**');
  await page.getByRole('button', { name: 'Pay with eSewa' }).click();
  const payment = await request;
  expect(payment.method()).toBe('GET');
  expect(new URL(payment.url()).searchParams.get('bookingId')).toBe('test-session');
});

test('payment return stays pending until backend confirms settlement', async ({ page }) => {
  await checkoutFixture(page);
  await page.goto('/checkout/99/payment/attempt-1?status=Completed');
  await expect(page.getByText('Payment in progress', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /Start learning/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Check payment status' }).click();
  await expect(page.getByRole('link', { name: /Start learning/ })).toBeVisible();
});

test('unconfigured providers cannot start paid checkout', async ({ page }) => {
  await checkoutFixture(page, false, false);
  await page.goto('/checkout/99');
  await expect(page.getByRole('radio', { name: /eSewa/ })).toBeDisabled();
  await page.getByRole('checkbox').check();
  await expect(page.getByRole('button', { name: 'Pay with your payment provider' })).toBeDisabled();
});

test('PayPal selection reviews USD instead of NPR and opens sandbox approval', async ({ page }) => {
  await checkoutFixture(page);
  await page.goto('/checkout/99');
  await page.getByRole('checkbox').check();
  await page.getByRole('radio', { name: /PayPal/ }).check();
  await expect(page.getByRole('checkbox')).not.toBeChecked();
  await expect(page.locator('.order-total')).toContainText('USD');
  await expect(page.locator('.order-total')).toContainText('10.00');
  await page.getByRole('checkbox').check();
  await page.route('https://www.sandbox.paypal.com/**', route => route.fulfill({ contentType: 'text/html', body: '<h1>PayPal approval</h1>' }));
  await page.getByRole('button', { name: 'Pay with PayPal' }).click();
  await expect(page).toHaveURL('https://www.sandbox.paypal.com/checkoutnow?token=TEST');
});
