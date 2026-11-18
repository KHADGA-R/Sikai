import { test, expect, APIRequestContext } from '@playwright/test';

async function account(request: APIRequestContext, role: string) {
  const response = await request.post('/api/auth/register', {data: {name: 'Cart ' + role, email: `${role}-${Date.now()}-${Math.random()}@cart.example`, password: 'CartTestPassword123!', role}});
  expect(response.status()).toBe(201); return await response.json();
}
async function course(request: APIRequestContext, token: string, title: string, price: number) {
  const response = await request.post('/api/instructor/courses', {headers: {Authorization: 'Bearer ' + token}, data: {title, description: 'A course for combined checkout.', category: 'Languages', subcategory: 'Nepali', price, level: 'BEGINNER', durationHours: 1, emoji: 'N', accent: 'teal', published: true}});
  expect(response.status()).toBe(201); return await response.json();
}

test('student adds courses, retains the cart, removes items and enrolls in all free courses on mobile', async ({page, request}) => {
  const teacher = await account(request, 'instructor'); const buyer = await account(request, 'student');
  const first = await course(request, teacher.token, 'Nepali pronunciation', 0);
  const second = await course(request, teacher.token, 'Nepali conversation', 0);
  await page.setViewportSize({width: 390, height: 844});
  await page.addInitScript(token => sessionStorage.setItem('sikai.api-token', token), buyer.token);
  for (const c of [first, second]) {
    await page.goto(`/courses/${c.id}`);
    await page.getByRole('button', {name: 'Add to cart', exact: true}).click();
    await expect(page.getByRole('link', {name: 'View cart', exact: true})).toBeVisible();
  }
  await page.getByRole('link', {name: 'View cart', exact: true}).click();
  await expect(page.locator('.cart-course')).toHaveCount(2);
  await page.reload(); await expect(page.locator('.cart-course')).toHaveCount(2);
  await page.getByRole('button', {name: 'Remove ' + first.title, exact: true}).click();
  await expect(page.locator('.cart-course')).toHaveCount(1);
  await page.goto(`/courses/${first.id}`);
  await page.getByRole('button', {name: 'Add to cart', exact: true}).click();
  await page.getByRole('link', {name: 'View cart', exact: true}).click();
  await expect(page.locator('.cart-course')).toHaveCount(2);
  await page.getByRole('button', {name: 'Checkout all courses'}).click();
  await expect(page).toHaveURL(/\/checkout\/orders\/[a-f0-9-]+$/);
  await expect(page.locator('.order-items .order-course')).toHaveCount(2);
  const complete = page.getByRole('button', {name: 'Complete free enrollment'});
  await expect(complete).toBeDisabled();
  await page.getByRole('checkbox').check(); await complete.click();
  await expect(page.getByRole('heading', {name: 'Your courses are ready!'})).toBeVisible();
  await expect(page.locator('.purchased-courses a')).toHaveCount(2);
  const enrollments = await request.get('/api/me/enrollments', {headers: {Authorization: 'Bearer ' + buyer.token}});
  expect((await enrollments.json()).map((c: {id: number}) => c.id).sort()).toEqual([first.id, second.id].sort());
  await page.goto('/cart'); await expect(page.getByRole('heading', {name: 'Your cart is waiting for a little curiosity'})).toBeVisible();
});

test('mixed free and paid courses share one total and leave PayPal disabled', async ({page, request}) => {
  const teacher = await account(request, 'instructor'); const buyer = await account(request, 'student');
  const first = await course(request, teacher.token, 'Free Nepali basics', 0);
  const second = await course(request, teacher.token, 'Paid Nepali fluency', 12.5);
  for (const c of [first, second]) {
    const response = await request.put(`/api/me/cart/${c.id}`, {headers: {Authorization: 'Bearer ' + buyer.token}}); expect(response.ok()).toBeTruthy();
  }
  await page.addInitScript(token => sessionStorage.setItem('sikai.api-token', token), buyer.token);
  await page.goto('/cart'); await expect(page.locator('.cart-total')).toContainText('$12.50');
  await page.getByRole('button', {name: 'Checkout all courses'}).click();
  await expect(page.locator('.order-items .order-course')).toHaveCount(2);
  await expect(page.locator('.order-total')).toContainText('12.50');
  await expect(page.getByRole('radio', {name: /PayPal Available soon/})).toBeDisabled();
  await page.getByRole('checkbox').check();
  await expect(page.getByRole('button', {name: 'Pay with your payment provider'})).toBeDisabled();
  const enrollments = await request.get('/api/me/enrollments', {headers: {Authorization: 'Bearer ' + buyer.token}});
  expect(await enrollments.json()).toEqual([]);
});

test('combined payment return unlocks every item only after backend confirmation', async ({page}) => {
  let checks = 0;
  const courses = [501, 502].map(id => ({id, title: `Nepali course ${id}`, description: 'Learn Nepali', instructor: 'Teacher', category: 'Languages', price: 10, isFree: false, level: 'BEGINNER', rating: 0, durationHours: 1, lessons: 0, emoji: 'N', accent: 'teal', published: true}));
  await page.addInitScript(() => sessionStorage.setItem('sikai.api-token', 'cart-return-test'));
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown = [];
    if (path === '/api/auth/me') body = {id: 'buyer', name: 'Cart Buyer', email: 'buyer@cart.example', role: 'student'};
    else if (path === '/api/courses') body = courses;
    else if (path === '/api/me/notifications') body = {items: [], unreadCount: 0, total: 0, hasMore: false};
    else if (path === '/api/me/progress') body = {};
    else if (path === '/api/me/enrollments') body = checks > 1 ? courses : [];
    else if (path === '/api/checkout/orders/mock-order/quote') body = {orderId: 'mock-order', status: 'pending', amount: 2000, currency: 'NPR', originalAmount: 20, activeAttempt: 'mock-attempt', activeProvider: 'esewa', paymentAvailable: true, items: courses.map(c => ({courseId: c.id, title: c.title, amount: c.price})), providers: [{id: 'esewa', label: 'eSewa', amount: 2000, currency: 'NPR', available: true}, {id: 'paypal', label: 'PayPal', amount: 20, currency: 'USD', available: false}]};
    else if (path === '/api/checkout/payments/mock-attempt/verify') {
      checks++; body = {id: 'mock-attempt', orderId: 'mock-order', provider: 'esewa', courseIds: [501, 502], status: checks > 1 ? 'completed' : 'pending'};
    }
    await route.fulfill({json: body});
  });
  await page.goto('/checkout/orders/mock-order/payment/mock-attempt?status=COMPLETE');
  await expect(page.getByText('Payment in progress', {exact: true})).toBeVisible();
  await expect(page.locator('.purchased-courses a')).toHaveCount(0);
  await page.getByRole('button', {name: 'Check payment status'}).click();
  await expect(page.getByRole('heading', {name: 'Your courses are ready!'})).toBeVisible();
  await expect(page.locator('.purchased-courses a')).toHaveCount(2);
});

for (const outcome of ['pending', 'failed']) {
  test(`eSewa resume ${outcome === 'pending' ? 'reopens the saved session' : 'offers a fresh checkout after confirmed expiry'}`, async ({page}) => {
    let expired = false; let starts = 0; let resumes = 0;
    const quote = () => ({orderId: 'resume-order', status: 'pending', amount: 1000, currency: 'NPR', originalAmount: 10, activeAttempt: expired ? null : 'old-attempt', activeProvider: 'esewa', paymentAvailable: true, items: [{courseId: 501, title: 'Nepali learning', amount: 10}], providers: [{id: 'esewa', label: 'eSewa', amount: 1000, currency: 'NPR', available: true}]});
    await page.addInitScript(() => sessionStorage.setItem('sikai.api-token', 'resume-test'));
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname; let body: unknown = [];
      if (path === '/api/auth/me') body = {id: 'buyer', name: 'Buyer', email: 'buyer@test.example', role: 'student'};
      else if (path === '/api/me/notifications') body = {items: [], unreadCount: 0, total: 0, hasMore: false};
    else if (path === '/api/me/progress') body = {};
      else if (path === '/api/checkout/orders/resume-order/quote') body = quote();
      else if (path === '/api/checkout/payments/old-attempt/verify') body = {id: 'old-attempt', orderId: 'resume-order', provider: 'esewa', status: 'pending'};
      else if (path === '/api/checkout/payments/old-attempt/resume') {
        expect(route.request().method()).toBe('POST'); resumes++; expired = outcome === 'failed';
        body = {id: 'old-attempt', orderId: 'resume-order', provider: 'esewa', status: outcome, redirect: {method: 'GET', url: 'https://rc-epay.esewa.com.np/epay?bookingId=original-session', fields: {}}};
      } else if (path === '/api/checkout/orders/resume-order/payments') {
        starts++; expect(expired).toBe(true);
        body = {id: 'new-attempt', orderId: 'resume-order', provider: 'esewa', amount: 1000, currency: 'NPR', status: 'pending', redirect: {method: 'GET', url: 'https://rc-epay.esewa.com.np/epay?bookingId=new-session', fields: {}}};
      }
      await route.fulfill({json: body});
    });
    await page.route('https://rc-epay.esewa.com.np/**', route => {expect(route.request().method()).toBe('GET'); return route.fulfill({contentType: 'text/html', body: '<h1>eSewa sandbox</h1>'});});
    await page.goto('/checkout/orders/resume-order');
    await page.getByRole('button', {name: 'Continue payment'}).click();
    if (outcome === 'failed') {
      await expect(page.getByText('The previous payment session expired or was cancelled. Review your total to start a fresh payment.')).toBeVisible();
      await expect(page.getByRole('button', {name: 'Pay with eSewa'})).toBeDisabled();
      await page.getByRole('checkbox').check(); await page.getByRole('button', {name: 'Pay with eSewa'}).click();
    }
    await expect(page).toHaveURL(`https://rc-epay.esewa.com.np/epay?bookingId=${outcome === 'failed' ? 'new-session' : 'original-session'}`);
    expect(resumes).toBe(1); expect(starts).toBe(outcome === 'failed' ? 1 : 0);
  });
}
