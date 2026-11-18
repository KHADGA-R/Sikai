import { test, expect, APIRequestContext } from '@playwright/test';

async function account(request: APIRequestContext, role: string) {
  const response = await request.post('/api/auth/register', {data: {name: `Inbox ${role}`, email: `${role}-${Date.now()}-${Math.random()}@inbox.example`, password: 'InboxTestPassword123!', role}});
  expect(response.status()).toBe(201); return response.json();
}

test('student and teacher receive saved notifications with read controls and account isolation', async ({page, browser, request}, testInfo) => {
  const teacher = await account(request, 'instructor'), student = await account(request, 'student'), other = await account(request, 'student');
  const teacherHeaders = {Authorization: 'Bearer ' + teacher.token}, studentHeaders = {Authorization: 'Bearer ' + student.token};
  const data = {title: 'Nepali notification course', description: 'Learn Nepali with notifications', category: 'Languages', subcategory: 'Nepali', price: 0, level: 'BEGINNER', durationHours: 1, emoji: 'N', accent: 'teal', published: true};
  const courseResponse = await request.post('/api/instructor/courses', {headers: teacherHeaders, data});
  expect(courseResponse.status()).toBe(201); const course = await courseResponse.json();
  const topicResponse = await request.post(`/api/instructor/courses/${course.id}/topics`, {headers: teacherHeaders, data: {title: 'Foundations', position: 0}}); const topic = await topicResponse.json();
  const lessonResponse = await request.post(`/api/instructor/topics/${topic.id}/lessons`, {headers: teacherHeaders, data: {title: 'Greetings', minutes: 10, kind: 'pdf', duration: 0, chapters: [], position: 0}}); const lesson = await lessonResponse.json();
  expect((await request.put(`/api/me/enrollments/${course.id}`, {headers: studentHeaders})).ok()).toBeTruthy();
  await page.addInitScript(token => { if (!sessionStorage.getItem('sikai.api-token')) sessionStorage.setItem('sikai.api-token', token); }, student.token);
  await page.goto('/my-learning');
  const bell = page.getByRole('button', {name: /^Notifications,/});
  await expect(bell).toHaveAccessibleName('Notifications, 1 unread');
  await bell.click(); await expect(page.getByRole('heading', {name: /Notifications/})).toBeVisible();
  await page.getByRole('button', {name: /You're enrolled/}).click();
  await expect(page).toHaveURL(new RegExp(`/learn/${course.id}$`));
  await expect(bell).toHaveAccessibleName('Notifications, 0 unread');
  expect((await request.put(`/api/instructor/courses/${course.id}`, {headers: teacherHeaders, data: {...data, description: 'Updated learning materials and guidance'}})).ok()).toBeTruthy();
  await bell.click(); await expect(page.getByRole('button', {name: /Course updated/})).toBeVisible();
  await page.keyboard.press('Escape'); await expect(page.locator('#notification-panel')).toHaveCount(0); await expect(bell).toBeFocused();

  const teacherContext = await browser.newContext({viewport: {width: 390, height: 844}});
  const teacherPage = await teacherContext.newPage();
  await teacherPage.addInitScript(token => sessionStorage.setItem('sikai.api-token', token), teacher.token);
  try {
    await teacherPage.goto('/instructor');
    const teacherBell = teacherPage.getByRole('button', {name: /^Notifications,/});
    await expect(teacherBell).toHaveAccessibleName('Notifications, 1 unread'); await teacherBell.click();
    await expect(teacherPage.getByRole('button', {name: /New course enrollment/})).toBeVisible();
    const bounds = await teacherPage.locator('#notification-panel').boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
    await teacherPage.screenshot({path: testInfo.outputPath('teacher-notifications-mobile.png')});
    await teacherPage.getByRole('button', {name: 'Mark all as read', exact: true}).click();
    await expect(teacherBell).toHaveAccessibleName('Notifications, 0 unread');
    await teacherPage.reload(); await expect(teacherBell).toHaveAccessibleName('Notifications, 0 unread');

    expect((await request.put(`/api/me/progress/${course.id}/lessons/${lesson.id}`, {headers: studentHeaders})).ok()).toBeTruthy();
    await bell.click(); await expect(page.getByRole('button', {name: /Course completed!/})).toBeVisible();
    await page.getByRole('button', {name: 'Mark all as read', exact: true}).click(); await expect(bell).toHaveAccessibleName('Notifications, 0 unread');
    await teacherPage.reload(); await expect(teacherBell).toHaveAccessibleName('Notifications, 1 unread'); await teacherBell.click();
    await expect(teacherPage.getByRole('button', {name: /A student completed your course/})).toBeVisible();
  } finally { await teacherContext.close(); }

  await page.evaluate(token => sessionStorage.setItem('sikai.api-token', token), other.token);
  await page.reload(); await expect(bell).toHaveAccessibleName('Notifications, 0 unread'); await bell.click();
  await expect(page.getByRole('heading', {name: "You're all caught up"})).toBeVisible();
  await expect(page.getByRole('button', {name: /Course completed!/})).toHaveCount(0);
});

test('notification history loads more and bulk read persists after refresh', async ({page}) => {
  let allRead = false;
  const items = Array.from({length: 25}, (_, index) => ({id: `notice-${index}`, type: 'course_updated', title: `Course update ${index + 1}`, body: 'New learning material is ready.', target: '/my-learning', createdAt: Date.now() - index * 1000, readAt: null as number | null}));
  await page.addInitScript(() => sessionStorage.setItem('sikai.api-token', 'history-token'));
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url()); let body: unknown = [];
    if (url.pathname === '/api/auth/me') body = {id: 'history-student', name: 'History Student', email: 'history@test.example', role: 'student'};
    else if (url.pathname === '/api/me/progress') body = {};
    else if (url.pathname === '/api/me/notifications/read-all') {allRead = true; body = {unreadCount: 0};}
    else if (url.pathname === '/api/me/notifications') {
      const pageNumber = Number(url.searchParams.get('page') ?? 0);
      body = {items: items.slice(pageNumber * 20, (pageNumber + 1) * 20).map(item => ({...item, readAt: allRead ? Date.now() : null})), unreadCount: allRead ? 0 : 25, total: 25, hasMore: pageNumber === 0};
    }
    await route.fulfill({json: body});
  });
  await page.goto('/'); const bell = page.getByRole('button', {name: /^Notifications,/});
  await expect(bell).toHaveAccessibleName('Notifications, 25 unread'); await bell.click();
  await expect(page.locator('.notification-list li')).toHaveCount(20);
  await page.getByRole('button', {name: 'Show more notifications'}).click(); await expect(page.locator('.notification-list li')).toHaveCount(25);
  await page.getByRole('button', {name: 'Mark all as read', exact: true}).click(); await expect(page.locator('.notification-list li.unread')).toHaveCount(0);
  await page.reload(); await expect(bell).toHaveAccessibleName('Notifications, 0 unread');
});

test('notification failures show retry instead of a false empty inbox', async ({page}) => {
  let unavailable = true;
  await page.addInitScript(() => sessionStorage.setItem('sikai.api-token', 'retry-token'));
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/me/notifications') {
      await route.fulfill({status: unavailable ? 503 : 200, json: unavailable ? {message: 'Notifications are temporarily unavailable.'} : {items: [], unreadCount: 0, total: 0, hasMore: false}}); return;
    }
    await route.fulfill({json: path === '/api/auth/me' ? {id: 'retry-teacher', name: 'Teacher', email: 'teacher@test.example', role: 'instructor'} : path === '/api/me/progress' ? {} : []});
  });
  await page.goto('/'); await page.getByRole('button', {name: /^Notifications,/}).click();
  await expect(page.locator('.notification-error')).toContainText('Notifications are temporarily unavailable.');
  await expect(page.getByRole('heading', {name: "You're all caught up"})).toHaveCount(0);
  unavailable = false; await page.getByRole('button', {name: 'Try again', exact: true}).click();
  await expect(page.getByRole('heading', {name: "You're all caught up"})).toBeVisible();
});
