import {test, expect} from '@playwright/test';

test('admin creates coupons; student reviews discounts, removes a code and enrolls with a fully covered total', async ({page, request}, testInfo) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  const login = await request.post('/api/auth/login', {data: {email: 'admin@e2e.example', password: 'E2eAdminPassword123!'}});
  expect(login.ok()).toBeTruthy(); const admin = await login.json();
  await page.addInitScript(token => {if (!sessionStorage.getItem('sikai.api-token')) sessionStorage.setItem('sikai.api-token', token);}, admin.token);
  await page.goto('/admin/coupons');
  const code = 'LEARN_' + Date.now();
  await page.getByLabel('Promo code', {exact: true}).fill(code);
  await page.getByLabel('Discount value', {exact: true}).fill('25');
  await page.getByRole('button', {name: 'Create coupon', exact: true}).click();
  await expect(page.getByRole('status')).toContainText(code + ' is ready to use.');
  await expect(page.getByRole('row').filter({hasText: code})).toContainText('25%');
  await page.screenshot({path: testInfo.outputPath('admin-coupons.png'), fullPage: true});
  const fullCode = 'FULL_' + Date.now();
  expect((await request.post('/api/admin/coupons', {headers: {Authorization: 'Bearer ' + admin.token}, data: {code: fullCode, discountType: 'percent', discountValue: 100, minimumSubtotal: 0, active: true, perUserLimit: 1}})).status()).toBe(201);
  const register = async (role: string) => {
    const response = await request.post('/api/auth/register', {data: {name: 'Coupon ' + role, email: `${role}-${Date.now()}-${Math.random()}@coupon.example`, password: 'CouponTestPass123!', role}});
    expect(response.status()).toBe(201); return response.json();
  };
  const teacher = await register('instructor'), student = await register('student');
  const ids: number[] = [];
  for (const title of ['Coupon Nepali', 'Coupon Music']) {
    const response = await request.post('/api/instructor/courses', {headers: {Authorization: 'Bearer ' + teacher.token}, data: {title, description: 'Coupon integration course', category: 'Languages', subcategory: 'Nepali', price: 10, level: 'BEGINNER', durationHours: 1, emoji: 'N', accent: 'teal', published: true}});
    expect(response.status()).toBe(201); ids.push((await response.json()).id);
  }
  await page.evaluate(token => sessionStorage.setItem('sikai.api-token', token), student.token);
  // Applying from the single-course page switches to the durable order checkout.
  await page.goto('/checkout/' + ids[0]);
  await page.getByLabel('Have a promo code?').fill(code.toLowerCase());
  await page.getByRole('button', {name: 'Apply', exact: true}).click();
  await expect(page).toHaveURL(/\/checkout\/orders\//);
  await expect(page.locator('.discount-row')).toContainText('$2.50');
  await page.getByRole('button', {name: 'Remove promo code'}).click();
  await expect(page.locator('.discount-row')).toHaveCount(0);
  await page.getByLabel('Have a promo code?').fill('INVALID_CODE');
  await page.getByRole('button', {name: 'Apply', exact: true}).click();
  await expect(page.getByRole('alert')).toContainText('invalid or unavailable');
  const order = await request.post('/api/checkout/orders', {headers: {Authorization: 'Bearer ' + student.token}, data: {courseIds: ids}});
  expect(order.ok()).toBeTruthy(); const basket = await order.json();
  await page.goto('/checkout/orders/' + basket.id);
  await page.getByLabel('Have a promo code?').fill(fullCode);
  await page.getByRole('button', {name: 'Apply', exact: true}).click();
  await expect(page.locator('.discount-row')).toContainText('$20.00');
  await expect(page.locator('.order-total')).toContainText('0.00');
  await expect(page.getByText('Your total is covered', {exact: true})).toBeVisible();
  await page.reload(); await expect(page.locator('.discount-row')).toContainText(fullCode);
  await page.screenshot({path: testInfo.outputPath('discounted-checkout.png'), fullPage: true});
  await page.getByRole('checkbox', {name: 'I have reviewed all courses, the total, and the payment currency.'}).check();
  await page.getByRole('button', {name: 'Complete enrollment', exact: true}).click();
  await expect(page.getByRole('heading', {name: 'Your courses are ready!'})).toBeVisible();
  const enrollments = await request.get('/api/me/enrollments', {headers: {Authorization: 'Bearer ' + student.token}});
  expect(await enrollments.json()).toHaveLength(2);
  expect(errors).toEqual([]);
});
