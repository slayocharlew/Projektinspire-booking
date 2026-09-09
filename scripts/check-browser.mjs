// Dependency-free Chrome DevTools smoke test. Requires Node 22+ and an isolated
// Chrome instance with remote debugging enabled. Never saves to a real calendar.
import assert from 'node:assert/strict';
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { programmes } from '../public/assets/programmes.js';
import { today, addDays } from '../public/assets/booking.js';

const origin = process.env.BOOKING_TEST_URL || 'http://127.0.0.1:8011';
const cdp = process.env.BOOKING_CDP_URL || 'http://127.0.0.1:9337';
const output = process.env.BOOKING_SCREENSHOT_DIR || '/private/tmp/inspire-booking-checks';
await mkdir(output, { recursive: true });
const target = await fetch(`${cdp}/json/new?about:blank`, { method: 'PUT' }).then(r => r.json());
const socket = new WebSocket(target.webSocketDebuggerUrl);
const pending = new Map();
const exceptions = [], badRequests = [];
const downloads = [], completedDownloads = new Set();
let sequence = 0;
socket.addEventListener('message', ({ data }) => {
  const message = JSON.parse(data);
  if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails);
  if (message.method === 'Browser.downloadWillBegin') downloads.push(message.params);
  if (message.method === 'Browser.downloadProgress' && message.params.state === 'completed') completedDownloads.add(message.params.guid);
  if (message.method === 'Network.requestWillBeSent') {
    const request = message.params.request;
    if (request.method !== 'GET' || !request.url.startsWith(origin) && !request.url.startsWith('data:') && !request.url.startsWith('blob:')) badRequests.push(request.url);
  }
  if (!pending.has(message.id)) return;
  const { resolve, reject, timer } = pending.get(message.id);
  clearTimeout(timer); pending.delete(message.id);
  if (message.error) reject(new Error(message.error.message)); else resolve(message.result);
});
await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
function command(method, params = {}) {
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timed out: ${method}`)); }, 15000);
    pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || 'Browser evaluation failed');
  return result.result.value;
}
async function until(expression) {
  for (let i = 0; i < 70; i++) { if (await evaluate(expression)) return; await new Promise(resolve => setTimeout(resolve, 100)); }
  throw new Error(`Condition not met: ${expression}`);
}
async function navigate(path) {
  await command('Page.navigate', { url: origin + path });
  await until(`location.pathname === ${JSON.stringify(path)} && !!document.querySelector('#app > section, .flow-top')`);
}
async function viewport(width, height = 900) {
  await command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
}
async function screenshot(name) {
  await evaluate('document.fonts.ready');
  const shot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  await writeFile(`${output}/${name}.png`, Buffer.from(shot.data, 'base64'));
}
async function fill(name, value) {
  await evaluate(`(() => { const e = document.querySelector('[name="${name}"]'); e.value = ${JSON.stringify(value)}; e.dispatchEvent(new Event('input', {bubbles:true})); e.dispatchEvent(new Event('change', {bubbles:true})); })()`);
}
async function submit() { await evaluate("document.querySelector('#booking-form').requestSubmit()"); }
function nextDate(day) {
  for (let i = 1; i <= 7; i++) { const date = addDays(today(), i); if (new Date(`${date}T12:00:00Z`).getUTCDay() === day) return date; }
}

try {
  await command('Page.enable'); await command('Runtime.enable'); await command('Network.enable');
  await command('Emulation.setTimezoneOverride', { timezoneId: 'America/Los_Angeles' });
  for (const [path, destination] of Object.entries({ '/lookup': '/programs', '/lookup/index.html': '/programs', '/schedule/': '/programs', '/book/individual-visit': '/book/stem-park-visit', '/book/group-visit': '/book/stem-park-visit', '/book/school-visit': '/book/stem-park-visit', '/book/birthday-visit': '/book/stem-themed-events' })) {
    const response = await fetch(origin + path, { redirect: 'manual' });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), destination);
  }
  assert.equal((await fetch(origin + '/book/not-a-programme')).status, 404);
  assert.equal((await fetch(origin + '/book/daily-private-sessions', { method: 'POST' })).status, 405);
  assert.match((await fetch(origin + '/assets/app.js')).headers.get('content-type'), /javascript/);
  for (const width of [1440, 820, 390, 320]) {
    await viewport(width); await navigate('/programs');
    await evaluate('Promise.all([...document.images].map(i => { i.loading = "eager"; return i.decode().catch(() => null); }))');
    assert.equal(await evaluate("document.querySelectorAll('.programme-card').length"), 7);
    assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'), `Catalogue overflow at ${width}`);
    assert.ok(await evaluate('[...document.images].every(i => i.complete && i.naturalWidth > 0)'), 'Missing image');
    assert.equal(await evaluate("/Track Booking|Track Applications|What People Say/.test(document.body.innerText)"), false);
    await screenshot(`programmes-${width}`);
  }
  await viewport(390);
  for (const p of programmes) {
    await navigate(`/book/${p.id}`);
    assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'), `Form overflow: ${p.id}`);
    await screenshot(`${p.id}-form`);
    await submit();
    assert.ok(await evaluate("document.querySelectorAll('.field-error:not([hidden])').length > 0"));
    assert.ok(await evaluate("document.activeElement.matches('input,select,textarea')"), 'First invalid field should receive focus');
    if (p.mode === 'scheduled') {
      if (p.locations.length > 1) await fill('location', 'Tanga');
      await fill('date', nextDate(p.schedule === 'saturday' ? 6 : 1));
      await fill('time', p.schedule === 'saturday' ? '10:00' : '14:30');
      await submit();
      assert.equal(await evaluate("document.querySelector('#step-title').textContent"), 'A little about you');
      await fill('name', 'Test <Parent>'); await fill('phone', '+255 700 000 001');
      if (p.audience === 'children') await evaluate("document.querySelector('[name=ages]').click()");
      await evaluate("document.querySelector('[data-back]').click()");
      assert.equal(await evaluate("document.querySelector('[name=time]').value"), p.schedule === 'saturday' ? '10:00' : '14:30');
      await submit();
      assert.equal(await evaluate("document.querySelector('[name=name]').value"), 'Test <Parent>');
      await submit();
      assert.ok(await evaluate("document.querySelector('.review-list').innerText.includes('Test <Parent>')"));
      assert.equal(await evaluate("document.querySelectorAll('.review-list parent').length"), 0);
      await submit();
      assert.ok(await evaluate("document.querySelector('.completion').innerText.includes('demo booking is ready')"));
      const href = await evaluate("document.querySelector('#google-calendar').href");
      const eventUrl = new URL(href);
      assert.equal(eventUrl.searchParams.get('stz'), 'Africa/Dar_es_Salaam');
      assert.ok(eventUrl.searchParams.get('text').startsWith('DEMO'));
      await command('Browser.setDownloadBehavior', { behavior: 'allowAndName', downloadPath: output, eventsEnabled: true });
      const previousDownloads = downloads.length;
      await evaluate("document.querySelector('.calendar-options').open = true; document.querySelector('#download-calendar').click()");
      for (let i = 0; i < 50 && (downloads.length === previousDownloads || !completedDownloads.has(downloads.at(-1).guid)); i++) await new Promise(resolve => setTimeout(resolve, 100));
      assert.ok(downloads.length > previousDownloads && completedDownloads.has(downloads.at(-1).guid), 'Calendar file should download');
      const file = await readFile(`${output}/${downloads.at(-1).guid}`, 'utf8');
      assert.match(file, /BEGIN:VCALENDAR/);
      assert.match(file, /TRIGGER:-P1D/);
      assert.match(file, /TRIGGER:-PT1H/);
      assert.ok(file.includes(`DTSTART:${eventUrl.searchParams.get('dates').split('/')[0]}`));
      assert.equal(file.includes('Test <Parent>'), false);
      await screenshot(`${p.id}-complete`);
    } else {
      await fill('name', 'Test Parent'); await fill('phone', '+255 700 000 001'); await fill('message', 'We would like to learn more.');
      if (p.enquiryType === 'school') { await fill('school', 'Test School'); await fill('level', 'Lower primary'); }
      if (p.enquiryType === 'event') { await fill('eventType', 'Birthday'); await fill('preferredDate', nextDate(6)); await fill('venue', 'Dar es Salaam'); await fill('attendance', '12'); }
      await submit(); await submit();
      assert.ok(await evaluate("document.querySelector('.completion').innerText.includes('Nothing has been sent')"));
      assert.equal(await evaluate("document.querySelectorAll('.calendar-options').length"), 0);
    }
  }
  assert.deepEqual(exceptions, [], 'Uncaught JavaScript errors');
  assert.deepEqual(badRequests, [], 'Unexpected network calls');
  console.log(`PASS: seven flows, four screen widths, validation, back navigation, calendar links/downloads, no submissions. Screenshots: ${output}`);
} finally {
  socket.close();
  await fetch(`${cdp}/json/close/${target.id}`).catch(() => {});
}
