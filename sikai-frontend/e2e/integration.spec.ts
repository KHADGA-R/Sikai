import { test, expect, Page } from '@playwright/test';

const password = 'IntegrationPass123!';

async function register(page: Page, role: 'student' | 'instructor', name: string) {
  const email = `${role}-${Date.now()}-${Math.random().toString(16).slice(2)}@e2e.example`;
  await page.goto('/register');
  await page.getByRole('radio', { name: role === 'instructor' ? 'Teach' : 'Learn', exact: true }).check();
  await page.getByPlaceholder('Full name', { exact: true }).fill(name);
  await page.getByPlaceholder('Email', { exact: true }).fill(email);
  await page.getByPlaceholder('Password', { exact: true }).fill(password);
  await page.getByPlaceholder('Confirm password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page).toHaveURL(role === 'instructor' ? /\/instructor$/ : /\/my-learning$/);
  return email;
}

test('instructor publishes an uploaded course; student enrolls, opens its file and persists progress', async ({ page, browser }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await register(page, 'instructor', 'Course Teacher');
  await page.goto('/instructor/courses');
  await page.getByRole('button', { name: '+ Create course', exact: true }).click();
  await page.getByLabel('Course title', { exact: true }).fill('Integrated Nepali Course');
  await page.getByLabel('Description', { exact: true }).fill('Learn Nepali with a server-backed lesson.');
  await page.getByRole('combobox', { name: 'Main category', exact: true }).selectOption('Languages');
  await page.getByRole('combobox', { name: 'Subcategory', exact: true }).selectOption('Nepali');
  await page.getByRole('button', { name: '+ Add module', exact: true }).click();
  await page.getByLabel('Upload lesson files', { exact: false }).setInputFiles({ name: 'greetings.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\nSikai integration handout\n%%EOF') });
  await page.getByRole('checkbox', { name: 'Offer the primary lesson file as a free preview' }).check();
  await page.getByRole('button', { name: 'Review and publish', exact: true }).click();
  await page.getByRole('button', { name: 'Publish course', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Course published.' })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Integrated Nepali Course', exact: false }).click();
  await expect(page.getByText('greetings.pdf', { exact: false }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Review and publish', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Publish changes', exact: true })).toBeVisible();

  const context = await browser.newContext();
  const student = await context.newPage();
  student.on('pageerror', error => errors.push(error.message));
  try {
    await register(student, 'student', 'Course Student');
    await student.goto('/');
    await student.getByRole('link', { name: 'Integrated Nepali Course', exact: false }).first().click();
    await expect(student).toHaveURL(/\/courses\/\d+$/);
    const courseUrl = student.url();
    await student.getByRole('button', { name: 'Free preview' }).click();
    await expect(student.getByRole('link', { name: 'Open preview PDF' })).toHaveAttribute('href', /\/preview\/\d+$/);
    await student.getByRole('button', { name: 'Add to wishlist', exact: false }).click();
    await expect(student.getByRole('button', { name: 'Saved to wishlist', exact: false })).toBeVisible();
    await student.getByRole('link', { name: 'Enroll for free', exact: true }).click();
    await expect(student).toHaveURL(/\/checkout\/\d+$/);
    await student.getByRole('checkbox', { name: 'I confirm that I want to enroll in this course with the account above.' }).check();
    await student.getByRole('button', { name: 'Complete free enrollment', exact: false }).click();
    await student.getByRole('link', { name: 'Start learning', exact: false }).click();
    await expect(student.getByRole('link', { name: 'Open PDF', exact: true })).toHaveAttribute('href', /^blob:/);
    await student.getByRole('button', { name: 'Mark lesson complete', exact: false }).click();
    await expect(student.getByRole('button', { name: 'Completed — mark incomplete', exact: false })).toBeVisible();
    await student.reload();
    await expect(student.getByRole('button', { name: 'Completed — mark incomplete', exact: false })).toBeVisible();
    await student.getByRole('link', { name: 'Get your certificate' }).click();
    await student.getByRole('button', { name: 'Generate certificate' }).click();
    await expect(student.getByRole('heading', { name: 'Certificate of Completion' })).toBeVisible();
    await expect(student.getByRole('heading', { name: 'Course Student' })).toBeVisible();
    await expect(student.getByText('Completed on', { exact: true })).toBeVisible();
    await expect(student.getByRole('link', { name: 'Verify this certificate' })).toHaveCount(0);
    await student.getByRole('button', { name: 'Enable public link' }).click();
    const shareHref = await student.getByRole('link', { name: 'LinkedIn' }).getAttribute('href');
    const publicUrl = new URL(shareHref!).searchParams.get('url')!;
    const qr = student.getByRole('link', { name: 'Verify this certificate' });
    await expect(qr).toHaveAttribute('href', publicUrl);
    await expect(qr.locator('img')).toHaveAttribute('src', /^data:image\/png;base64,/);
    const visitorContext = await browser.newContext();
    try {
      const visitor = await visitorContext.newPage();
      await visitor.goto(publicUrl);
      await expect(visitor.getByText('Verified by Sikai')).toBeVisible();
      await expect(visitor.getByRole('heading', { name: 'Integrated Nepali Course' })).toBeVisible();
      await student.getByRole('button', { name: 'Turn off public link' }).click();
      await expect(student.getByRole('button', { name: 'Enable public link' })).toBeVisible();
      await visitor.reload();
      await expect(visitor.getByRole('alert')).toHaveText('This certificate link is unavailable.');
    } finally {
      await visitorContext.close();
    }
    await student.getByRole('link', { name: 'Back to My Achievements' }).click();
    await expect(student.getByRole('link', { name: 'Integrated Nepali Course certificate' })).toBeVisible();
    const finisher = student.locator('.achievement').filter({ has: student.getByRole('heading', { name: 'Course Finisher' }) });
    await expect(finisher.getByRole('link', { name: 'Share on X' })).toHaveAttribute('href', /Course\+Finisher/);
    await expect(student.locator('.achievement').filter({ has: student.getByRole('heading', { name: 'Curious Mind' }) })
      .getByRole('link', { name: 'Share on X' })).toHaveCount(0);
    await student.goto('/my-progress');
    await expect(student.getByText('100% complete', { exact: false }).first()).toBeVisible();
    await student.goto('/wishlist');
    await expect(student.getByRole('link', { name: 'Integrated Nepali Course', exact: false }).first()).toBeVisible();
    await student.goto('/admin');
    await expect(student).toHaveURL(/\/$/);
    await student.goto(courseUrl);
    await expect(student.getByRole('link', { name: 'Continue learning', exact: false })).toBeVisible();
    await student.getByRole('button', { name: 'Log out', exact: true }).click();
    await student.goto('/my-learning');
    await expect(student).toHaveURL(/\/login\?returnUrl=/);
  } finally { await context.close(); }
  expect(errors).toEqual([]);
});

test('live teacher availability, student booking, messaging, meeting link and cancellation cross accounts', async ({ page, browser }) => {
  await register(page, 'instructor', 'Live Teacher');
  await page.goto('/instructor/about');
  await page.getByRole('combobox', { name: 'Teaching subject', exact: true }).selectOption('Music');
  await page.getByLabel('Introduction', { exact: true }).fill('Learn madal and Nepali rhythms.');
  await page.getByLabel('Teaching languages', { exact: true }).fill('Nepali, English');
  await page.getByRole('button', { name: 'Save teacher profile', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Live Teacher', exact: true })).toBeVisible();
  await page.goto('/live-classes?view=teach');
  const future = new Date(Date.now() + 3 * 86400000);
  const local = new Date(future.getTime() - future.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  await page.getByLabel('Start date and time', { exact: true }).fill(local);
  await page.getByLabel('Meeting link (optional)', { exact: true }).fill('https://meet.example.com/sikai-e2e');
  await page.getByRole('button', { name: 'Publish available time', exact: true }).click();
  await expect(page.getByText('Availability published.', { exact: false })).toBeVisible();

  const context = await browser.newContext(); const student = await context.newPage();
  try {
    await register(student, 'student', 'Live Student');
    await student.goto('/live-classes');
    await student.locator('.teacher-card').filter({ has: student.getByRole('heading', { name: 'Live Teacher', exact: true }) }).getByRole('button', { name: 'View available times', exact: true }).click();
    await student.locator('.slot-list button').first().click();
    await student.getByLabel('What would you like to learn?', { exact: true }).fill('Practice rhythm');
    await student.getByRole('button', { name: 'Confirm booking', exact: true }).click();
    await expect(student.getByRole('link', { name: 'Open meeting', exact: true })).toHaveAttribute('href', 'https://meet.example.com/sikai-e2e');
    await student.locator('summary').filter({ hasText: 'Lesson conversation' }).click();
    await student.getByLabel('Message', { exact: true }).fill('Hello teacher, ready to learn!');
    await student.getByRole('button', { name: 'Send message', exact: true }).click();
    await expect(student.getByText('Hello teacher, ready to learn!', { exact: true })).toBeVisible();
    await page.goto('/live-classes');
    await expect(page.getByText('Practice rhythm', { exact: true })).toBeVisible();
    await page.locator('summary').filter({ hasText: 'Lesson conversation' }).click();
    await expect(page.getByText('Hello teacher, ready to learn!', { exact: true })).toBeVisible();
    student.on('dialog', dialog => dialog.accept());
    await student.getByRole('button', { name: 'Cancel class', exact: true }).click();
    await expect(student.locator('.booking-card .subject-label')).toHaveText('Cancelled');
  } finally { await context.close(); }
});

test('admin uses real authorization and server errors are visible', async ({ page }) => {
  await page.goto('/login');
  await page.getByPlaceholder('Email', { exact: true }).fill('admin@e2e.example');
  await page.getByPlaceholder('Password', { exact: true }).fill('WrongPassword123!');
  await page.getByRole('button', { name: 'Log In', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Email or password is incorrect');
  await page.getByPlaceholder('Password', { exact: true }).fill('E2eAdminPassword123!');
  await page.getByRole('button', { name: 'Log In', exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('heading', { name: 'Courses', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '+ Add course', exact: true }).click();
  await page.getByLabel('Course title', { exact: true }).fill('Admin Integration Course');
  await page.getByLabel('Description', { exact: true }).fill('Created through authenticated admin API.');
  await page.getByRole('combobox', { name: 'Status', exact: true }).selectOption({ label: 'Published' });
  await page.getByRole('button', { name: 'Create course', exact: true }).click();
  await expect(page.getByText('Admin Integration Course', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edit Admin Integration Course', exact: true }).click();
  await page.getByLabel('Course title', { exact: true }).fill('Admin Updated Course');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByText('Admin Updated Course', { exact: true })).toBeVisible();
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Admin Updated Course', exact: false }).first()).toBeVisible();
  await page.goto('/admin');
  await page.getByRole('button', { name: 'Delete Admin Updated Course', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete course', exact: true }).click();
  await expect(page.getByText('Course deleted.', { exact: true })).toBeVisible();
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Admin Updated Course', exact: false })).toHaveCount(0);
});

test('revoked sessions return to login and a different account starts with its own learning state', async ({ page }) => {
  await register(page, 'student', 'Expired Session Student');
  const token = await page.evaluate(() => sessionStorage.getItem('sikai.api-token'));
  const revoked = await page.request.post('/api/auth/logout', { headers: { Authorization: `Bearer ${token}` } });
  expect(revoked.ok()).toBeTruthy();
  await page.reload();
  await expect(page).toHaveURL(/\/login\?returnUrl=/);
  expect(await page.evaluate(() => sessionStorage.getItem('sikai.api-token'))).toBeNull();
  await register(page, 'student', 'Another Student');
  await expect(page.getByRole('heading', { name: 'Your learning journey starts here', exact: true })).toBeVisible();
  await page.goto('/wishlist');
  await expect(page.getByRole('heading', { name: 'Nothing saved yet', exact: true })).toBeVisible();
});
