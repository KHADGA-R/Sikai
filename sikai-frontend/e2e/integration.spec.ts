import { test, expect, Page } from '@playwright/test';

if (process.env.LIVEKIT_URL) {
  test.use({ launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] } });
}

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
  test.setTimeout(150_000);
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
  await page.getByRole('button', { name: 'Publish available time', exact: true }).click();
  await expect(page.getByText('Availability published.', { exact: false })).toBeVisible();

  const context = await browser.newContext(); const student = await context.newPage();
  try {
    await register(student, 'student', 'Live Student');
    await student.goto('/live-classes');
    await student.locator('.teacher-card').filter({ has: student.getByRole('heading', { name: 'Live Teacher', exact: true }) }).getByRole('button', { name: 'View available times', exact: true }).click();
    await student.locator('.slot-list button').first().click();
    await student.getByRole('textbox', { name: 'What would you like to learn?', exact: true }).fill('Practice rhythm');
    await student.getByRole('button', { name: 'Confirm booking', exact: true }).click();
    const booking = student.locator('.booking-card').filter({ hasText: 'Live Teacher' });
    await expect(booking.getByText('Waiting for the instructor to set up the classroom.')).toBeVisible();
    await page.getByRole('textbox', { name: 'Meeting link', exact: true }).fill('https://meet.example.com/sikai-e2e');
    await page.getByRole('button', { name: 'Update link', exact: true }).click();
    await expect(page.getByText('Meeting link updated for this class.', { exact: true })).toBeVisible();
    await student.reload();
    await student.getByRole('button', { name: 'My bookings', exact: true }).click();
    const joinLink = booking.getByRole('link', { name: 'Join live class', exact: true });
    await expect(joinLink).toHaveCount(0);
    await student.clock.setFixedTime(new Date(new Date(local).getTime() - 5 * 60_000));
    await expect(joinLink).toHaveAttribute('target', '_blank');
    await expect(booking.getByRole('link', { name: 'Open whiteboard' })).toHaveCount(0);
    await student.locator('summary').filter({ hasText: 'Lesson conversation' }).click();
    await student.getByLabel('Message', { exact: true }).fill('Hello teacher, ready to learn!');
    await student.getByRole('button', { name: 'Send message', exact: true }).click();
    await expect(student.getByText('Hello teacher, ready to learn!', { exact: true })).toBeVisible();
    await page.goto('/live-classes');
    await expect(page.getByText('Practice rhythm', { exact: true })).toBeVisible();
    await page.locator('summary').filter({ hasText: 'Lesson conversation' }).click();
    await expect(page.getByText('Hello teacher, ready to learn!', { exact: true })).toBeVisible();

    await expect(booking.getByRole('link', { name: 'Open whiteboard' })).toHaveCount(0);
    await expect(page.locator('.booking-card').getByRole('link', { name: 'Open whiteboard' })).toHaveCount(0);
    const currentClassTime = new Date(future.getTime() + 60_000);
    await page.clock.setFixedTime(currentClassTime);
    await student.clock.setFixedTime(currentClassTime);
    await page.locator('.booking-card').getByRole('link', { name: 'Open whiteboard' }).click();
    await booking.getByRole('link', { name: 'Open whiteboard' }).click();
    await expect(student.getByRole('heading', { name: 'Class whiteboard' })).toBeVisible();
    await expect(student.getByRole('link', { name: 'Open video call' })).toHaveAttribute('href', 'https://meet.example.com/sikai-e2e');
    await student.getByRole('button', { name: 'Calculator', exact: true }).click();
    const calculator = student.locator('app-whiteboard-calculator');
    await expect(student.locator('.board-sidebar .slides + app-whiteboard-calculator')).toBeVisible();
    await expect(student.locator('.surface app-whiteboard-calculator')).toHaveCount(0);
    const display = calculator.getByLabel('Calculator expression');
    await calculator.getByRole('button', { name: '7', exact: true }).click();
    await calculator.getByRole('button', { name: '×', exact: true }).click();
    await calculator.getByRole('button', { name: '6', exact: true }).click();
    await calculator.getByRole('button', { name: 'Calculate result' }).click();
    await expect(display).toHaveValue('42');
    await calculator.getByLabel('Calculator mode').selectOption('scientific');
    await display.fill('sin(30)+sqrt(9)+2^3');
    await display.press('Enter');
    await expect(display).toHaveValue('11.5');
    const calculatorHandle = calculator.getByRole('button', { name: 'Move calculator' });
    await calculatorHandle.scrollIntoViewIfNeeded();
    const originalPanel = (await calculator.boundingBox())!;
    const grip = (await calculatorHandle.boundingBox())!;
    await student.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
    await student.mouse.down();
    await student.mouse.move(grip.x + grip.width / 2 + 110, grip.y + grip.height / 2 - 20, { steps: 5 });
    await student.mouse.up();
    await expect(calculator).toHaveCSS('position', 'fixed');
    expect((await calculator.boundingBox())!.x).toBeGreaterThan(originalPanel.x + 50);
    await expect(display).toHaveValue('11.5');
    await calculator.getByRole('button', { name: 'Dock calculator' }).click();
    await expect(calculator).toHaveCSS('position', 'static');
    await calculator.getByRole('button', { name: 'Close calculator' }).click();
    await expect(calculator).toHaveCount(0);
    await page.getByRole('button', { name: 'Calculator', exact: true }).click();
    const teacherCalculator = page.locator('app-whiteboard-calculator');
    const teacherDisplay = teacherCalculator.getByLabel('Calculator expression');
    const sharedCalculation = student.getByLabel('Teacher calculation', { exact: true });
    await teacherDisplay.fill('8×9');
    await expect(sharedCalculation).toHaveText('8×9');
    await teacherDisplay.press('Enter');
    await expect(sharedCalculation).toHaveText('72');
    const liveCalculator = student.getByRole('region', { name: 'Teacher’s calculator' });
    await expect(liveCalculator.getByText('8×9 =', { exact: true })).toBeVisible();
    await expect(liveCalculator.getByRole('textbox')).toHaveCount(0);
    await teacherCalculator.getByLabel('Calculator mode').selectOption('scientific');
    await expect(liveCalculator.getByText('Scientific · DEG · Live', { exact: true })).toBeVisible();
    await teacherCalculator.getByRole('button', { name: 'Sharing live' }).click();
    await expect(sharedCalculation).toHaveCount(0);
    await teacherCalculator.getByRole('button', { name: 'Close calculator' }).click();
    await page.getByLabel('Slide title').fill('Rhythm notes');
    await page.locator('input[type=file]').setInputFiles({
      name: 'rhythm.png',
      mimeType: 'image/png',
      buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64'),
    });
    await student.getByRole('button', { name: 'Rhythm notes' }).click();
    await expect(student.getByRole('img', { name: 'Rhythm notes', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Upload slide image' })).toBeEnabled();
    await page.getByRole('button', { name: 'Highlighter' }).click();
    await page.locator('.surface svg').click({ position: { x: 45, y: 40 } });
    await expect(student.locator('.surface [data-tool=highlighter]')).toHaveCount(1);
    await student.getByRole('button', { name: 'Text', exact: true }).click();
    await student.getByLabel('Text to place').fill('Practice here');
    await student.locator('.surface svg').click({ position: { x: 50, y: 65 } });
    await expect(page.locator('.surface text')).toContainText('Practice here');
    await student.getByLabel('Show marks').selectOption({ label: 'Live Teacher (teacher)' });
    await expect(student.locator('.surface text')).toHaveCount(0);
    await expect(student.locator('.surface [data-tool=highlighter]')).toHaveCount(1);
    await student.getByRole('button', { name: 'Undo my mark' }).click();
    await expect(page.locator('.surface text')).toHaveCount(0);
    await student.getByLabel('Show marks').selectOption('all');
    await student.getByRole('combobox', { name: 'Shape', exact: true }).selectOption('rectangle');
    await student.getByRole('button', { name: 'Dotted', exact: true }).click();
    const surface = student.locator('.surface svg');
    await surface.scrollIntoViewIfNeeded();
    const bounds = (await surface.boundingBox())!;
    await student.mouse.move(bounds.x + 100, bounds.y + 45);
    await student.mouse.down();
    await student.mouse.move(bounds.x + 190, bounds.y + 95, { steps: 4 });
    await student.mouse.up();
    await expect(page.locator('.surface [data-tool=rectangle]')).toHaveCount(1);
    await expect(page.locator('.surface [data-tool=rectangle]')).toHaveAttribute('stroke-dasharray', '0.1 9');
    await student.getByRole('button', { name: 'Eraser', exact: true }).click();
    const eraserBounds = (await surface.boundingBox())!;
    await student.mouse.move(eraserBounds.x + 140, eraserBounds.y + 40);
    const eraserCursor = student.locator('.eraser-cursor');
    await expect(eraserCursor).toHaveAttribute('r', '15');
    await student.mouse.wheel(0, 100);
    await expect(eraserCursor).toHaveAttribute('r', '12');
    await student.mouse.wheel(0, -100);
    await expect(eraserCursor).toHaveAttribute('r', '15');
    await student.mouse.wheel(0, -100);
    await expect(eraserCursor).toHaveAttribute('r', '18');
    await student.mouse.down();
    await student.mouse.move(eraserBounds.x + 140, eraserBounds.y + 53, { steps: 3 });
    await student.mouse.up();
    await expect(page.locator('.surface mask .erase-mask')).toHaveCount(1);
    await expect(page.locator('.surface mask .erase-mask')).toHaveAttribute('stroke-width', '36');
    await expect(page.locator('.surface g[mask] [data-tool=rectangle]')).toBeVisible();
    await expect(page.locator('.surface [data-tool=highlighter]')).toHaveCount(1);
    await student.getByRole('button', { name: 'Pen', exact: true }).click();
    await student.getByRole('button', { name: 'Bold', exact: true }).click();
    await surface.click({ position: { x: 85, y: 75 } });
    await expect(page.locator('.surface [data-tool=pen]')).toHaveAttribute('stroke-width', '8');
    await student.getByRole('combobox', { name: 'Shape', exact: true }).selectOption('circle');
    await student.getByRole('button', { name: 'Dashed', exact: true }).click();
    await surface.scrollIntoViewIfNeeded();
    const circleBounds = (await surface.boundingBox())!;
    await student.mouse.move(circleBounds.x + 245, circleBounds.y + 95);
    await student.mouse.down();
    await student.mouse.move(circleBounds.x + 280, circleBounds.y + 95, { steps: 4 });
    await student.mouse.up();
    const sharedCircle = page.locator('.surface [data-tool=circle]');
    await expect(sharedCircle).toHaveAttribute('d', / A /);
    await expect(sharedCircle).toHaveAttribute('stroke-dasharray', '12 8');
    await student.getByRole('combobox', { name: 'Sticky note' }).selectOption('pink');
    const studentNote = student.locator('app-whiteboard-note.pink');
    const sharedNote = page.locator('app-whiteboard-note.pink');
    await studentNote.getByRole('textbox').fill('Practice the second line');
    await expect(sharedNote.getByRole('textbox')).toHaveValue('Practice the second line');
    await expect(sharedNote.getByRole('textbox')).not.toBeEditable();
    await studentNote.getByRole('button', { name: 'Move sticky note' }).scrollIntoViewIfNeeded();
    const handle = (await studentNote.getByRole('button', { name: 'Move sticky note' }).boundingBox())!;
    await student.mouse.move(handle.x + 12, handle.y + 10);
    await student.mouse.down();
    await student.mouse.move(handle.x + 85, handle.y + 50, { steps: 4 });
    await student.mouse.up();
    const left = await studentNote.evaluate(note => note.style.left);
    expect(left).not.toBe('6%');
    await expect.poll(() => sharedNote.evaluate(note => note.style.left)).toBe(left);
    const resizeHandle = studentNote.getByRole('button', { name: 'Resize sticky note' });
    await resizeHandle.scrollIntoViewIfNeeded();
    const resize = (await resizeHandle.boundingBox())!;
    await student.mouse.move(resize.x + 10, resize.y + 8);
    await student.mouse.down();
    await student.mouse.move(resize.x + 100, resize.y + 60, { steps: 4 });
    await student.mouse.up();
    await expect.poll(() => studentNote.evaluate(note => note.style.width)).not.toBe('25%');
    const width = await studentNote.evaluate(note => note.style.width);
    await expect.poll(() => sharedNote.evaluate(note => note.style.width)).toBe(width);
    await page.getByRole('combobox', { name: 'Sticky note' }).selectOption('yellow');
    await expect(student.locator('app-whiteboard-note:not(.pink)')).toHaveCount(1);
    const insert = page.getByLabel('Insert whiteboard object');
    for (const [kind, field, value] of [
      ['Table', 'Row 1, column 1', 'Instrument'],
      ['Bar graph', 'Bar 2 value', '12'],
      ['Flowchart', 'Flowchart step 1', 'Listen to the beat'],
    ]) {
      await insert.click();
      await page.getByRole('button', { name: kind, exact: true }).click();
      const editor = page.getByLabel(field, { exact: true });
      await editor.fill(value);
      const sharedField = student.getByLabel(field, { exact: true });
      if (kind === 'Flowchart') {
        const watching = student.locator('app-whiteboard-note').filter({ has: sharedField });
        await expect(watching.getByRole('button', { name: 'Bold' })).toBeDisabled();
        await expect(watching.getByText('Typing in a box')).toBeVisible();
        await expect(sharedField).toHaveValue(value);
      }
      await editor.press('Tab');
      await expect(sharedField).toHaveValue(value);
      await expect(sharedField).toHaveAttribute('readonly', '');
      if (kind === 'Table') {
        const table = page.locator('app-whiteboard-note').filter({ has: editor });
        await table.getByRole('button', { name: '+ Row', exact: true }).click();
        await table.getByRole('button', { name: '+ Column', exact: true }).click();
        await expect(table.getByLabel('Row 4, column 4')).toBeVisible();
        await table.getByRole('button', { name: 'Remove last row' }).click();
        await table.getByRole('button', { name: 'Rotate clockwise' }).click();
        await expect(student.getByLabel('Row 3, column 4')).toBeVisible();
        await expect(student.getByLabel('Row 4, column 4')).toHaveCount(0);
        await expect(student.getByLabel('Whiteboard table').locator('..')).toHaveCSS('rotate', '90deg');
        await expect(sharedField).toHaveValue(value);
      }
      if (kind === 'Bar graph') {
        await expect(student.getByLabel('Bar 2 label')).toHaveValue('B');
        await expect(student.getByRole('img', { name: 'Value axis from 0 to 20' })).toBeVisible();
        await page.getByRole('button', { name: '+ Bar', exact: true }).click();
        await expect(student.getByLabel('Bar 5 label')).toHaveValue('E');
        await page.getByRole('button', { name: 'Remove last bar' }).click();
        await expect(student.getByLabel('Bar 5 label')).toHaveCount(0);
      }
      if (kind === 'Flowchart') {
        const flowchart = page.locator('app-whiteboard-note').filter({ has: editor });
        const handle = flowchart.getByRole('button', { name: 'Resize flowchart step 1' });
        await expect(handle).toBeEmpty();
        await expect(handle).toHaveCSS('cursor', 'nwse-resize');
        await handle.scrollIntoViewIfNeeded();
        const box = (await handle.boundingBox())!;
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 16, { steps: 4 });
        await page.mouse.up();
        await expect(sharedField.locator('..')).toHaveCSS('height', '48px');
        await expect(student.getByLabel('Flowchart step 2').locator('..')).toHaveCSS('height', '32px');
        const palette = flowchart.getByRole('group', { name: 'Flowchart shapes' });
        const shapes = flowchart.getByRole('button', { name: 'Shapes' });
        await expect(palette).toHaveCount(0);
        await shapes.click();
        await palette.getByRole('button', { name: 'Decision', exact: true }).dragTo(editor);
        await shapes.click();
        await page.getByRole('button', { name: 'Add child to flowchart step 1' }).click();
        const child = page.getByLabel('Flowchart step 4', { exact: true });
        await child.fill('Try another rhythm');
        await child.press('Tab');
        const sharedBranch = student.getByRole('list', { name: 'Branches from step 1' });
        await expect(sharedBranch.getByLabel('Flowchart step 4')).toHaveValue('Try another rhythm');
        await expect(sharedField.locator('..')).toHaveAttribute('data-shape', 'decision');
        await editor.click();
        await flowchart.getByRole('button', { name: 'Bold', exact: true }).click();
        await flowchart.getByRole('button', { name: 'Italic', exact: true }).click();
        await flowchart.getByRole('button', { name: 'Increase font size' }).click();
        await flowchart.getByLabel('Box background color').fill('#fff0ab');
        await flowchart.getByLabel('Font color').fill('#334455');
        await expect(sharedField).toHaveCSS('font-weight', '700');
        await expect(sharedField).toHaveCSS('font-style', 'italic');
        await expect(sharedField).toHaveCSS('font-size', '13px');
        await expect(sharedField).toHaveCSS('color', 'rgb(51, 68, 85)');
        await expect(sharedField.locator('..').locator('svg path')).toHaveCSS('fill', 'rgb(255, 240, 171)');
        await flowchart.getByRole('button', { name: 'Connect', exact: true }).click();
        await flowchart.getByRole('button', { name: 'Connect flowchart step 4' }).click();
        await flowchart.getByRole('button', { name: 'Connect flowchart step 2' }).click();
        const sharedLink = student.locator('.flow-links [data-from="3"][data-to="1"] path');
        await expect(sharedLink).toHaveAttribute('d', /^M.+/);
        const originalRoute = await sharedLink.getAttribute('d');
        await expect(flowchart.getByRole('button', { name: 'Adjust arrows' })).toHaveCount(0);
        const grip = flowchart.locator('[data-from="3"][data-to="1"] .flow-link-grip');
        await grip.hover();
        const linkBounds = (await grip.boundingBox())!;
        const linkPoint = { x: linkBounds.x + linkBounds.width / 2, y: linkBounds.y + linkBounds.height / 2 };
        await page.mouse.move(linkPoint.x, linkPoint.y);
        await page.mouse.down();
        await page.mouse.move(linkPoint.x, linkPoint.y + 20, { steps: 4 });
        await page.mouse.up();
        await expect(sharedLink).not.toHaveAttribute('d', originalRoute!);
        const position = (target: typeof sharedField) => target.locator('..').evaluate((box: HTMLElement) => {
          const { x, y } = box.getBoundingClientRect();
          return [Math.round(x), Math.round(y)];
        });
        const originalPosition = await position(sharedField);
        const left = flowchart.getByRole('button', { name: 'Add box on the left of flowchart step 1' });
        await expect(left).toHaveCSS('opacity', '0');
        await left.hover();
        await expect(left).toHaveCSS('opacity', '1');
        await left.click();
        await flowchart.getByRole('button', { name: 'Add box on the right of flowchart step 1' }).click();
        const leftBox = student.getByLabel('Flowchart step 5');
        const rightBox = student.getByLabel('Flowchart step 6');
        await expect(leftBox).toBeVisible();
        await expect(rightBox).toBeVisible();
        expect((await leftBox.boundingBox())!.x).toBeLessThan((await sharedField.boundingBox())!.x);
        expect((await rightBox.boundingBox())!.x).toBeGreaterThan((await sharedField.boundingBox())!.x);
        await expect.poll(() => position(sharedField)).toEqual(originalPosition);
        await expect(student.locator('.flow-links path')).toHaveCount(6);
        const hoverGrip = flowchart.locator('[data-from="0"][data-to="5"] .flow-link-grip');
        await expect(hoverGrip).toHaveCSS('opacity', '0');
        await hoverGrip.hover();
        await expect(hoverGrip).toHaveCSS('opacity', '1');
        const sideLink = student.locator('.flow-links [data-from="0"][data-to="5"] path');
        const sideRoute = await sideLink.getAttribute('d');
        const beforeMove = await position(rightBox);
        const moveEdge = flowchart.locator('[data-flow-index="5"] .flow-move-edge');
        await moveEdge.hover();
        const moveBounds = (await moveEdge.boundingBox())!;
        const moveX = moveBounds.x + moveBounds.width / 2;
        const moveY = moveBounds.y + moveBounds.height / 2;
        await page.mouse.move(moveX, moveY);
        await page.mouse.down();
        await page.mouse.move(moveX, moveY + 24, { steps: 4 });
        await expect(student.getByText('Moving a box', { exact: true })).toBeVisible();
        await expect.poll(() => position(rightBox)).toEqual([beforeMove[0], beforeMove[1] + 24]);
        await page.mouse.up();
        await expect.poll(() => position(rightBox)).toEqual([beforeMove[0], beforeMove[1] + 24]);
        await expect(sideLink).not.toHaveAttribute('d', sideRoute!);
        await expect.poll(() => position(sharedField)).toEqual(originalPosition);
        await page.getByLabel('Flowchart step 6', { exact: true }).press('Delete');
        await expect(rightBox).toHaveCount(0);
        await expect(student.locator('.flow-links path')).toHaveCount(5);
        await flowchart.getByRole('button', { name: 'Select flowchart for zoom' }).click();
        const canvas = flowchart.getByRole('region', { name: /Flowchart canvas/ });
        await canvas.hover();
        await page.mouse.wheel(0, -120);
        await expect(canvas.locator('.flow-tree')).toHaveCSS('zoom', '1.1');
        await page.mouse.wheel(0, 120);
        await expect(canvas.locator('.flow-tree')).toHaveCSS('zoom', '1');
        await flowchart.getByRole('button', { name: 'Rotate clockwise' }).click();
        await expect(student.locator('.flow.rotatable')).toHaveCSS('rotate', '90deg');
        await expect(sharedField).toHaveValue(value);
      }
    }
    await insert.click();
    await page.getByRole('button', { name: 'Histogram', exact: true }).click();
    await page.getByLabel('Bin width', { exact: true }).fill('5');
    await page.getByLabel('Bin width', { exact: true }).press('Tab');
    await page.getByLabel('Bin 2 frequency').fill('7');
    await page.getByLabel('Bin 2 frequency').press('Tab');
    await expect(student.getByLabel('Bin 2 frequency')).toHaveValue('7');
    await expect(student.getByRole('img', { name: 'Frequency axis from 0 to 8' })).toBeVisible();
    await expect(student.getByText('5 to <10', { exact: true })).toBeVisible();
    await insert.click();
    await page.getByRole('button', { name: 'Pie chart', exact: true }).click();
    await page.getByLabel('Slice 1 label', { exact: true }).fill('Practice');
    await page.getByLabel('Slice 1 size', { exact: true }).fill('3');
    await page.getByLabel('Slice 1 size', { exact: true }).press('Tab');
    const pie = student.getByRole('list', { name: 'Pie chart slices' });
    await expect(pie.getByRole('listitem').first()).toContainText('Practice');
    await expect(pie.getByRole('listitem').first()).toContainText('50%');
    await page.getByRole('button', { name: 'Split slice 1', exact: true }).click();
    await expect(pie.getByRole('listitem')).toHaveCount(5);
    await expect(pie.getByRole('listitem').first()).toContainText('25%');

    await insert.click();
    await page.getByRole('button', { name: 'Countdown timer', exact: true }).click();
    const timer = page.locator('app-whiteboard-activity').filter({ has: page.getByRole('timer') });
    const sharedTimer = student.locator('app-whiteboard-activity').filter({ has: student.getByRole('timer') });
    await timer.getByLabel('Timer duration in seconds').fill('30');
    await timer.getByLabel('Timer duration in seconds').press('Tab');
    await timer.getByRole('button', { name: 'Start', exact: true }).click();
    await expect(sharedTimer.getByText('Running', { exact: true })).toBeVisible();
    const tenSecondsLater = new Date(currentClassTime.getTime() + 10_000);
    await page.clock.setFixedTime(tenSecondsLater);
    await student.clock.setFixedTime(tenSecondsLater);
    await expect(sharedTimer.getByRole('timer')).toHaveText('0:20');
    await timer.getByRole('button', { name: 'Pause', exact: true }).click();
    await expect(sharedTimer.getByText('Paused', { exact: true })).toBeVisible();
    await timer.getByRole('button', { name: 'Resume', exact: true }).click();
    await expect(sharedTimer.getByText('Running', { exact: true })).toBeVisible();
    await timer.getByRole('button', { name: 'Reset', exact: true }).click();
    await expect(sharedTimer.getByRole('timer')).toHaveText('0:30');
    await insert.click();
    await expect(page.getByRole('button', { name: 'Number line', exact: true })).toBeHidden();
    await insert.press('Escape');
    const tools = page.getByLabel('Subject tools');
    const openMaths = async () => {
      await tools.click();
      await page.getByRole('button', { name: 'Maths', exact: true }).click();
    };
    await openMaths();
    await page.getByRole('button', { name: 'Back to subjects' }).click();
    await page.getByRole('button', { name: 'Maths', exact: true }).click();
    await page.getByRole('button', { name: 'Number line', exact: true }).click();
    const step = page.getByLabel('Number line step');
    await step.fill('0.5');
    await step.press('Tab');
    await page.getByRole('button', { name: 'Mark 1.5 on number line', exact: true }).click();
    await expect(student.getByRole('button', { name: 'Mark 1.5 on number line', exact: true })).toHaveAttribute('aria-pressed', 'true');
    const drawOnSurface = async (label: string, startX: number, startY: number, endX: number, endY: number) => {
      const surface = page.getByLabel(label, { exact: true });
      await surface.scrollIntoViewIfNeeded();
      const bounds = (await surface.boundingBox())!;
      await page.mouse.move(bounds.x + bounds.width * startX, bounds.y + bounds.height * startY);
      await page.mouse.down();
      await page.mouse.move(bounds.x + bounds.width * endX, bounds.y + bounds.height * endY, { steps: 4 });
      await page.mouse.up();
    };
    const lineMode = page.getByRole('group', { name: 'Number line mode' });
    await lineMode.getByRole('button', { name: 'Line', exact: true }).click();
    await drawOnSurface('Number line drawing surface', 0.2, 0.25, 0.6, 0.44);
    await expect(student.locator('.number-line-stroke[data-tool="line"]')).toHaveCount(1);
    await lineMode.getByRole('button', { name: 'Undo drawing', exact: true }).click();
    await expect(student.locator('.number-line-stroke')).toHaveCount(0);
    await lineMode.getByRole('button', { name: 'Draw', exact: true }).click();
    await page.getByRole('button', { name: 'Pen', exact: true }).click();
    await drawOnSurface('Number line drawing surface', 0.2, 0.28, 0.45, 0.44);
    await expect(student.locator('.number-line-stroke[data-tool="pen"]')).toHaveCount(1);
    await page.getByLabel('Shape', { exact: true }).selectOption('circle');
    await drawOnSurface('Number line drawing surface', 0.27, 0.4, 0.32, 0.4);
    await expect(student.locator('.number-line-stroke[data-tool="circle"]')).toHaveCount(1);
    await lineMode.getByRole('button', { name: 'Mark values', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Mark 1.5 on number line', exact: true })).toHaveAttribute('aria-pressed', 'true');

    await openMaths();
    await page.getByRole('button', { name: 'Fraction bars', exact: true }).click();
    await page.getByRole('group', { name: 'Fraction bar 1', exact: true }).getByRole('button', { name: 'Shade 2 of 3 parts' }).click();
    await page.getByRole('group', { name: 'Fraction bar 2', exact: true }).getByRole('button', { name: 'Shade 3 of 4 parts' }).click();
    await expect(student.getByText('2/3', { exact: true })).toBeVisible();
    await expect(student.getByText('3/4', { exact: true })).toBeVisible();

    await openMaths();
    await page.getByRole('button', { name: 'Ten-frame', exact: true }).click();
    await page.getByRole('button', { name: 'Counter 4', exact: true }).click();
    await expect(student.getByRole('button', { name: 'Counter 4', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(student.getByText('1 of 10', { exact: true })).toBeVisible();

    await openMaths();
    await page.getByRole('button', { name: 'Coordinate grid', exact: true }).click();
    const plotPoint = page.getByRole('button', { name: 'Point (2, 2)', exact: true });
    await plotPoint.click();
    await expect(student.getByRole('button', { name: 'Point (2, 2)', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(student.getByText('Plotted points (2, 2)', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Pen', exact: true }).click();
    await page.getByRole('group', { name: 'Coordinate grid mode' }).getByRole('button', { name: 'Line', exact: true }).click();
    await drawOnSurface('Coordinate grid drawing surface', 0.28, 0.3, 0.58, 0.5);
    await expect(student.locator('.grid-stroke[data-tool="line"]')).toHaveCount(1);
    await page.getByRole('group', { name: 'Coordinate grid mode' }).getByRole('button', { name: 'Draw', exact: true }).click();
    await page.getByLabel('Shape', { exact: true }).selectOption('rectangle');
    await drawOnSurface('Coordinate grid drawing surface', 0.35, 0.25, 0.7, 0.6);
    await expect(student.locator('.grid-stroke[data-tool="rectangle"]')).toHaveCount(1);
    await page.getByRole('button', { name: 'Pen', exact: true }).click();
    await drawOnSurface('Coordinate grid drawing surface', 0.15, 0.35, 0.48, 0.55);
    await expect(student.locator('.grid-stroke[data-tool="pen"]')).toHaveCount(1);
    await page.getByRole('group', { name: 'Coordinate grid mode' }).getByRole('button', { name: 'Undo drawing', exact: true }).click();
    await expect(student.locator('.grid-stroke[data-tool="pen"]')).toHaveCount(0);
    await page.getByRole('button', { name: 'Plot points', exact: true }).click();
    await expect(plotPoint).toBeEnabled();
    await expect(plotPoint).toHaveAttribute('aria-pressed', 'true');
    await page.getByLabel('Coordinate grid size', { exact: true }).press('ArrowRight');
    await expect(student.getByRole('group', { name: 'Coordinate grid with x and y axes' })).toHaveCSS('width', '240px');
    await expect(student.locator('.grid-stroke[data-tool="line"]')).toHaveCount(1);
    await expect(student.getByRole('button', { name: 'Point (2, 2)', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await student.getByRole('link', { name: 'Back to live classes' }).click();
    await student.route('**/api/live-classes/slots/*/join', route => route.fulfill({
      status: 404, json: { message: 'Endpoint not found' },
    }));
    await context.route('https://meet.example.com/sikai-e2e', route => route.fulfill({ body: 'Local classroom fixture' }));
    const meeting = context.waitForEvent('page');
    await booking.getByRole('link', { name: 'Join live class', exact: true }).click();
    const meetingTab = await meeting;
    await expect(meetingTab).toHaveURL('https://meet.example.com/sikai-e2e');
    await expect(student.getByRole('heading', { name: 'Class whiteboard' })).toBeVisible();
    await meetingTab.close();
    await student.getByRole('link', { name: 'Back to live classes' }).click();
    await student.route('**/api/live-classes/bookings', async route => {
      if (route.request().method() !== 'GET') return route.continue();
      const response = await route.fetch();
      const rows = await response.json();
      const newest = rows[0];
      const older = {
        ...newest,
        id: 'older-booking',
        slotId: 'older-slot',
        goals: 'Older lesson',
        slot: { ...newest.slot, id: 'older-slot', start: newest.slot.start - 86400000, end: newest.slot.end - 86400000 },
      };
      await route.fulfill({ response, json: [...rows, older] });
    });
    await student.clock.setFixedTime(new Date(future.getTime() + 46 * 60_000));
    await student.reload();
    await expect(booking.getByRole('link', { name: 'Open whiteboard' })).toHaveCount(1);
    await expect(student.locator('.booking-card').filter({ hasText: 'Older lesson' }).getByRole('link', { name: 'Open whiteboard' })).toHaveCount(0);
    await student.unroute('**/api/live-classes/bookings');
    await student.clock.setFixedTime(new Date());
    await student.reload();
    student.on('dialog', dialog => dialog.accept());
    await student.getByRole('button', { name: 'Cancel booking', exact: true }).click();
    await expect(student.locator('.booking-card .subject-label')).toHaveText('Cancelled');
    await expect(student.getByRole('link', { name: 'Open whiteboard' })).toHaveCount(0);
  } finally { await context.close(); }
});

test.describe('Sikai Video with a real local media server', () => {
  test.skip(!process.env.LIVEKIT_URL, 'Start LiveKit and configure the local test environment');

  test('teacher and students share media beside the whiteboard', async ({ page, browser, context }) => {
    await context.grantPermissions(['camera', 'microphone']);
    await register(page, 'instructor', 'Video Teacher');
    await page.goto('/instructor/about');
    await page.getByRole('combobox', { name: 'Teaching subject', exact: true }).selectOption('Music');
    await page.getByLabel('Introduction', { exact: true }).fill('Music video classes');
    await page.getByLabel('Teaching languages', { exact: true }).fill('English');
    await page.getByRole('button', { name: 'Save teacher profile' }).click();
    await expect(page.getByRole('heading', { name: 'Video Teacher', exact: true })).toBeVisible();
    await page.goto('/live-classes?view=teach');
    const future = new Date(Date.now() + 4 * 60_000);
    const local = new Date(future.getTime() - future.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
    await page.getByLabel('Start date and time').fill(local);
    await page.getByLabel('Student seats').fill('2');
    await page.getByRole('combobox', { name: 'Classroom', exact: true }).selectOption({ label: 'Sikai Video' });
    await page.getByRole('button', { name: 'Publish available time' }).click();
    await expect(page.getByText('Availability published.', { exact: false })).toBeVisible();

    const learnerContext = await browser.newContext({ permissions: ['camera', 'microphone'] });
    const classmateContext = await browser.newContext();
    try {
      const learner = await learnerContext.newPage();
      const classmate = await classmateContext.newPage();
      for (const [studentPage, name] of [[learner, 'Video Student'], [classmate, 'Video Classmate']] as const) {
        await register(studentPage, 'student', name);
        await studentPage.goto('/live-classes');
        await studentPage.locator('.teacher-card').filter({ hasText: 'Video Teacher' })
          .getByRole('button', { name: 'View available times' }).click();
        await studentPage.locator('.slot-list button').first().click();
        await studentPage.getByRole('button', { name: 'Confirm booking' }).click();
      }

      await page.getByRole('button', { name: 'Start live class', exact: true }).click();
      await learner.locator('.booking-card').getByRole('button', { name: 'Join live class', exact: true }).click();
      await classmate.locator('.booking-card').getByRole('button', { name: 'Join live class', exact: true }).click();
      const teacherRoom = page.getByRole('region', { name: 'Sikai Video' });
      const learnerRoom = learner.getByRole('region', { name: 'Sikai Video' });
      await expect(learner.getByText('The whiteboard opens when the class starts.')).toBeVisible();
      await expect(learner.locator('.surface')).toHaveCount(0);
      await expect(teacherRoom.getByText('Video Student', { exact: true })).toBeVisible();
      await expect(teacherRoom.getByText('Video Classmate', { exact: true })).toBeVisible();
      await expect(teacherRoom.getByRole('button', { name: 'Share screen' })).toBeVisible();
      await expect(learnerRoom.getByRole('button', { name: 'Share screen' })).toHaveCount(0);
      await teacherRoom.getByRole('button', { name: 'Turn on camera' }).click();
      const received = learnerRoom.locator('video[aria-label="Video Teacher camera"]');
      await expect(received).toBeVisible();
      await expect.poll(() => received.evaluate((video: HTMLVideoElement) => video.videoWidth)).toBeGreaterThan(0);
      await teacherRoom.getByRole('button', { name: 'Turn on microphone' }).click();
      await expect(learnerRoom.locator('audio')).toHaveCount(1);
      // Headless Chrome has no system screen picker. Feed a test stream through the SDK's screen-share path.
      await page.evaluate(() => {
        Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', {
          configurable: true, value: () => navigator.mediaDevices.getUserMedia({ video: true }),
        });
      });
      await teacherRoom.getByRole('button', { name: 'Share screen', exact: true }).click();
      const screen = classmate.locator('video[aria-label="Video Teacher screen"]');
      await expect.poll(() => screen.evaluate((video: HTMLVideoElement) => video.videoWidth)).toBeGreaterThan(0);
      await classmate.clock.setFixedTime(new Date(future.getTime() + 60_000));
      const presentation = classmate.getByRole('button', { name: 'Presentation', exact: true });
      await expect(presentation).toHaveAttribute('aria-pressed', 'true');
      await classmate.getByRole('button', { name: 'Fullscreen', exact: true }).click();
      await expect(classmate.getByRole('button', { name: 'Exit fullscreen' })).toBeVisible();
      await classmate.getByRole('button', { name: 'Exit fullscreen' }).click();
      await classmate.getByRole('button', { name: 'Split view' }).click();
      const divider = classmate.getByRole('separator', { name: 'Resize whiteboard and presentation' });
      await divider.focus();
      await classmate.keyboard.press('ArrowRight');
      await expect(divider).toHaveAttribute('aria-valuenow', '55');
      await expect(classmate.locator('.surface')).toBeVisible();
      await expect(screen).toBeVisible();
      const panelOffset = () => classmate.locator('.split-view').evaluate(layout => {
        const board = layout.querySelector('.board-workspace')!.getBoundingClientRect();
        const video = layout.querySelector('.video-panel')!.getBoundingClientRect();
        return Math.abs(board.top - video.top);
      });
      expect(await panelOffset()).toBeLessThan(2);
      await classmate.getByRole('button', { name: 'Show slides' }).click();
      await expect(classmate.getByRole('heading', { name: 'Slides' })).toBeVisible();
      expect(await panelOffset()).toBeLessThan(2);
      await classmate.getByRole('button', { name: 'Whiteboard view' }).click();
      await expect(classmate.locator('.surface')).toBeVisible();
      await expect(screen).toBeHidden();
      await classmate.getByRole('button', { name: 'All participants (3)' }).click();
      await expect(classmate.locator('.video-grid.gallery figure')).toHaveCount(3);
      await classmate.getByRole('button', { name: 'Hide cameras' }).click();
      await expect(classmate.getByRole('button', { name: 'Leave class' })).toBeVisible();
      await teacherRoom.getByRole('button', { name: 'Stop sharing', exact: true }).click();
      await expect(screen).toHaveCount(0);
      await learnerRoom.getByRole('button', { name: 'Leave class' }).click();
      await expect(teacherRoom.getByText('Video Student', { exact: true })).toHaveCount(0);
      await expect(learner.getByRole('heading', { name: 'My bookings' })).toBeVisible();
      await expect(learner.locator('.booking-card').getByRole('button', { name: 'Join live class' })).toBeVisible();
    } finally { await Promise.all([learnerContext.close(), classmateContext.close()]); }
  });
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
