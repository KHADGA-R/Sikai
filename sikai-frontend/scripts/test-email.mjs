import assert from 'node:assert/strict';
import { confirmation, emailServer } from '../server/email.mjs';
const input = { bookingId: 'booking-1', studentEmail: 'student@example.com', studentName: 'Student', teacherName: 'Teacher', subject: 'Music', timezone: 'Asia/Kathmandu', start: Date.now()+86400000, end: Date.now()+89100000, meetingUrl: 'https://meet.example.com/room', goals: 'Practice rhythm' };
const message = confirmation(input, 'Sikai <classes@example.com>');
assert.deepEqual(message.to, ['student@example.com']);
for (const detail of ['Teacher', 'Music', 'Asia/Kathmandu', 'https://meet.example.com/room', 'Practice rhythm', 'booking-1']) assert.ok(message.text.includes(detail));
assert.match(confirmation({...input, meetingUrl: ''}, 'sender').text, /not added a meeting link/);
assert.throws(() => confirmation({...input, meetingUrl: 'javascript:alert(1)'}, 'sender'));
assert.throws(() => confirmation({...input, timezone: 'bad-zone'}, 'sender'));
assert.throws(() => confirmation({...input, studentEmail: 'invalid'}, 'sender'));
let sent = [], fail = false;
const server = emailServer({apiKey:'test-key',from:'sender@example.com',deliver:async (url, options) => { sent.push(options); return {ok:!fail,json:async()=>({id:'email-id'})}; }});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const endpoint = `http://127.0.0.1:${server.address().port}/api/live-classes/confirmation`;
const post = (body, origin='http://localhost:4200') => fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify(body)});
try {
  assert.equal((await post(input)).status,200);
  assert.equal(JSON.parse(sent[0].body).to[0],input.studentEmail);
  await post(input);
  assert.equal(sent[0].headers['Idempotency-Key'],sent[1].headers['Idempotency-Key']);
  assert.equal((await post(input,'https://other.example')).status,403);
  assert.equal((await post({...input,meetingUrl:'http://unsafe.example'})).status,400);
  fail=true;
  assert.equal((await post(input)).status,502);
} finally { await new Promise(resolve => server.close(resolve)); }
console.log('Passed: email details, pending links, validation, delivery, duplicate protection, origin checks and provider failure.');
