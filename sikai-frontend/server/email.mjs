import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export function confirmation(input, from) {
  if (!input || typeof input !== 'object') throw new Error('Invalid class details');
  for (const key of ['bookingId', 'studentEmail', 'studentName', 'teacherName', 'subject', 'timezone', 'meetingUrl', 'goals']) {
    if (typeof input[key] !== 'string' || input[key].length > 2000 || /[\r\n]/.test(input[key]) && key !== 'goals') throw new Error('Invalid class details');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.studentEmail) || !/^[\w-]{1,100}$/.test(input.bookingId)
    || !Number.isFinite(input.start) || !Number.isFinite(input.end) || input.end <= input.start) throw new Error('Invalid class details');
  if (input.meetingUrl) {
    const url = new URL(input.meetingUrl);
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Invalid meeting link');
  }
  const date = new Intl.DateTimeFormat('en', { timeZone: input.timezone, dateStyle: 'full', timeStyle: 'long' });
  const text = [`Hello ${input.studentName},`, '', 'Your live class is confirmed.',
    `Subject: ${input.subject}`, `Teacher: ${input.teacherName}`, `Starts: ${date.format(input.start)}`,
    `Ends: ${date.format(input.end)}`, `Timezone: ${input.timezone}`, `Duration: ${(input.end-input.start)/60000} minutes`,
    `Booking reference: ${input.bookingId}`, '', input.meetingUrl ? `Join your online class: ${input.meetingUrl}` : 'Your teacher has not added a meeting link yet. An updated confirmation will be emailed when they add it.',
    '', input.goals ? `Learning goals: ${input.goals}` : '', '', 'You can view or manage this class in My bookings on Sikai.'].join('\n');
  return { from, to: [input.studentEmail], subject: `Sikai: ${input.subject} class with ${input.teacherName}`, text };
}

// Local demo companion only: bookings and identity still live in browser storage.
export function emailServer({ apiKey = process.env.RESEND_API_KEY, from = process.env.EMAIL_FROM,
  origin = process.env.APP_ORIGIN || 'http://localhost:4200', deliver = fetch } = {}) {
  let count = 0, reset = Date.now() + 60000;
  return createServer(async (req, res) => {
    const reply = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
    if (req.url !== '/api/live-classes/confirmation' || req.method !== 'POST') return reply(404, { error: 'Not found' });
    if (req.headers.origin !== origin || !req.headers['content-type']?.startsWith('application/json')) return reply(403, { error: 'Request denied' });
    if (!apiKey || !from) return reply(503, { error: 'Email delivery is not configured' });
    if (Date.now() > reset) { count = 0; reset = Date.now() + 60000; }
    if (++count > 20) return reply(429, { error: 'Try again later' });
    let input, message;
    try {
      let body = '';
      for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body) > 16000) { reply(413, { error: 'Request too large' }); return; } }
      input = JSON.parse(body);
      message = confirmation(input, from);
    } catch { return reply(400, { error: 'Invalid class details' }); }
    try {
      const key = createHash('sha256').update(JSON.stringify(message)).digest('hex');
      const response = await deliver('https://api.resend.com/emails', {
        method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': key },
        body: JSON.stringify(message), signal: AbortSignal.timeout(10000)
      });
      if (!response.ok || !(await response.json()).id) throw new Error('Delivery failed');
      reply(200, { sent: true });
    } catch { reply(502, { error: 'Unable to send confirmation' }); }
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  emailServer().listen(8080, '127.0.0.1', () => console.log('Local email API listening on http://127.0.0.1:8080'));
}
