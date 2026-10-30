// Isolated browser regression: fake API and preview on unused local ports.
// Never sends requests to the real Laravel database or live services.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { today, addDays } from '../public/assets/booking.js';
import { FORMS } from '../public/assets/form-schema.js';
import { walkFields, getPath } from '../public/assets/form-model.js';
import { previewContext, previewTransport } from '../dev/forms-fixtures.mjs';
import { validAnswers } from '../tests/form-helpers.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const probe = createServer();
await new Promise((resolve, reject) => { probe.once('error', reject); probe.listen(0, '127.0.0.1', resolve); });
const previewPort = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const origin = 'http://127.0.0.1:' + previewPort;
let apiOrigin;
const cdp = process.env.BOOKING_CDP_URL || 'http://127.0.0.1:9337';
const output = process.env.BOOKING_SCREENSHOT_DIR || '/private/tmp/inspire-booking-integration-checks';
await mkdir(output, { recursive: true });
const date = addDays(today(), 2);
const slot = { id: '1@' + date + 'T08:30', locationId: 1, location: 'Dar STEM Park', start: date + 'T08:30:00+03:00', end: date + 'T11:00:00+03:00', remaining: 10 };
const source = JSON.parse(await readFile(new URL('../tests/fixtures/programmes.json', import.meta.url), 'utf8'));
const catalogue = source.map(p => ({ ...p, imageUrl: null, programmeUrl: null, allowEnquiry: true, locations: p.mode === 'scheduled' ? [{ id: 1, name: 'Dar STEM Park' }] : [], sessions: p.mode === 'published' ? [{ ...slot, id: '42', title: 'Morning camp' }] : [] }));
let mode = 'pending', submissions = 0, attempts = 0;
const registrationBodies = [];
let registrationQuotes = 0;
const keys = new Map();
const api = createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Idempotency-Key');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Content-Type', 'application/json');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  const send = (data, status = 200) => { res.writeHead(status); res.end(JSON.stringify(data)); };
  if (req.url === '/api/booking/v1/programmes') { send(mode === 'unavailable' ? { message: 'Unavailable' } : { data: mode === 'empty' ? [] : catalogue }, mode === 'unavailable' ? 503 : 200); return; }
  if (req.url.includes('/availability?')) { send({ data: mode === 'full' ? [] : [slot] }); return; }
  if (req.method === 'POST') {
    attempts++;
    let raw = ''; for await (const chunk of req) raw += chunk;
    const data = JSON.parse(raw);
    if (req.url.endsWith('/registration-quotes')) {
      registrationQuotes++;
      const context = previewContext(FORMS[data.formId], apiOrigin);
      context.programme = catalogue.find(p => p.id === data.programmeId);
      const quote = await previewTransport(context).quote({ ...data.selection, camp: { sessionId: data.selection.sessionId } });
      quote.id = 'fake-quote-' + registrationQuotes; quote.expiresAt = new Date(Date.now() + 60000).toISOString();
      send({ data: quote }); return;
    }
    if (req.url.endsWith('/registrations')) registrationBodies.push({ data, key: req.headers['idempotency-key'] });
    if (mode === 'rich-validation') { send({ message: 'Please check the participant.', errors: { 'answers.student.age': ['Check the learner’s age.'] } }, 422); return; }
    if (mode === 'conflict') { send({ message: 'This session is now full.' }, 409); return; }
    if (mode === 'validation') { send({ message: 'Please check your details.', errors: { phone: ['Enter a valid phone number.'] } }, 422); return; }
    if (mode === 'failure') { send({ message: 'SQL secret must never be displayed' }, 500); return; }
    const key = req.headers['idempotency-key'];
    let receipt = keys.get(key);
    if (!receipt) {
      submissions++;
      receipt = { id: crypto.randomUUID(), status: mode === 'confirmed' ? 'confirmed' : 'pending', kind: req.url.endsWith('/enquiries') ? 'enquiry' : 'booking', createdAt: new Date().toISOString(), title: catalogue.find(p => p.id === data.programmeId).title,
        session: req.url.endsWith('/enquiries') ? null : slot, message: mode === 'confirmed' ? 'Your booking is confirmed.' : 'Our team will contact you to confirm.' };
      if (data.formId) Object.assign(receipt, { formId: data.formId, formVersion: data.formVersion, sessions: [] });
      keys.set(key, receipt);
    }
    if (mode === 'lost-rich-response') { send({ message: 'Simulated lost response after saving.' }, 500); return; }
    setTimeout(() => send({ data: receipt }, 201), 150);
    return;
  }
  send({ message: 'Not found' }, 404);
});
await new Promise((resolve, reject) => { api.once('error', reject); api.listen(0, '127.0.0.1', resolve); });
apiOrigin = 'http://127.0.0.1:' + api.address().port;
catalogue.forEach(p => { p.programmeUrl = apiOrigin + '/programmes/main-' + p.id; });
const preview = spawn(process.execPath, ['preview.mjs'], { cwd: root, env: { ...process.env, BOOKING_FORMS_PREVIEW: '1', BOOKING_PREVIEW_PORT: String(previewPort), BOOKING_API_URL: apiOrigin + '/api/booking/v1' }, stdio: ['ignore', 'pipe', 'pipe'] });
let previewLog = ''; preview.stdout.on('data', data => previewLog += data); preview.stderr.on('data', data => previewLog += data);
let socket, target;
const pending = new Map(); let sequence = 0;
const exceptions = [];
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function command(method, params = {}) {
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('Timeout: ' + method)); }, 15000);
    pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const value = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (value.exceptionDetails) throw new Error(value.exceptionDetails.exception?.description || 'Browser exception');
  return value.result.value;
}
async function until(expression) {
  for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await delay(100); }
  throw new Error('Condition not met: ' + expression);
}
async function navigate(path) {
  await evaluate("document.querySelector('#app')?.replaceChildren()");
  await command('Page.navigate', { url: origin + path });
  await until(`location.pathname === ${JSON.stringify(path.split('?')[0])} && !!document.querySelector('.catalogue-intro, .flow-top, #app > section:not([role="status"])')`);
}
async function fill(name, value) {
  await evaluate(`(() => { const e = document.querySelector('[name="${name}"]'); e.value = ${JSON.stringify(value)}; e.dispatchEvent(new Event('input', {bubbles:true})); e.dispatchEvent(new Event('change', {bubbles:true})); })()`);
}
const submit = () => evaluate("document.querySelector('#booking-form').requestSubmit()");
async function ready(p) {
  await navigate('/book/' + p.id + (p.mode === 'published' ? '?session=42' : ''));
  if (p.mode === 'scheduled') { await fill('date', date); await until("document.querySelector('#slotId')?.options.length > 1"); await submit(); }
  else if (p.mode === 'published') { assert.equal(await evaluate("document.querySelector('#sessionId').value"), '42'); await submit(); }
  await fill('name', 'Browser Test Guardian'); await fill('phone', '+255700000001');
  if (p.mode === 'enquiry') {
    await fill('message', 'Test booking');
    if (p.enquiryType === 'school') { await fill('school', 'Test School'); await fill('level', 'Lower primary'); }
    if (p.enquiryType === 'event') { await fill('eventType', 'Birthday'); await fill('preferredDate', date); await fill('venue', 'Dar es Salaam'); await fill('attendance', '10'); }
  } else if (p.audience === 'children' || p.audience === 'youth') {
    await evaluate("document.querySelector('[name=ages]').click()");
  }
  await submit(); await until("!!document.querySelector('[name=consent]')");
  assert.equal(await evaluate("document.querySelector('[type=submit]').textContent.trim()"), 'Submit booking');
  await evaluate("document.querySelector('[name=consent]').click()");
}
async function richField(path, value, type) {
  await evaluate(`(() => {
    const name = ${JSON.stringify('answers.' + path)};
    const value = ${JSON.stringify(value)};
    const controls = [...document.querySelectorAll('[name]')].filter(el => el.name === name);
    if (!controls.length) throw new Error('Missing field: ' + name);
    if (${JSON.stringify(type)} === 'multi') {
      for (const original of controls) {
        const el = [...document.querySelectorAll('[name]')].find(el => el.name === name && el.value === original.value);
        el.checked = value.includes(el.value); el.dispatchEvent(new Event('input', {bubbles:true}));
      }
      document.querySelector('[name="' + name + '"]').dispatchEvent(new Event('change', {bubbles:true}));
    } else {
      const el = controls[0];
      if (el.type === 'file') { const dt = new DataTransfer(); dt.items.add(new File(['Fictional teacher list'], 'teachers.pdf', {type:'application/pdf'})); el.files = dt.files; }
      else if (el.type === 'checkbox') el.checked = value === true;
      else el.value = value;
      el.dispatchEvent(new Event('input', {bubbles:true})); el.dispatchEvent(new Event('change', {bubbles:true}));
    }
  })()`);
}
async function richReady(context, draft, { simulate = '', navigateFirst = true } = {}) {
  if (navigateFirst) await navigate('/__forms?form=' + context.form.id + (simulate ? '&simulate=' + simulate : ''));
  for (let step = 0; step < context.form.sections.length; step++) {
    for (const item of walkFields(context.form, draft, step)) {
      if (item.field.type === 'repeat') {
        const length = getPath(draft, item.path).length;
        for (let i = 1; i < length; i++) await evaluate(`document.querySelector('[data-add="${item.path}"]').click()`);
      } else if (item.field.type === 'policies') {
        for (const policy of context.config.agreements) await richField('policyAcceptances.' + policy.id, true, 'agreement');
      } else if (!['derivedAge', 'derivedGroup'].includes(item.field.type)) {
        const value = getPath(draft, item.path); if (value !== undefined) await richField(item.path, item.field.type === 'file' ? '' : value, item.field.type);
      }
    }
    await evaluate("document.querySelector('#registration-form').requestSubmit()");
    await until(`document.querySelector('.registration-progress')?.textContent.startsWith('Step ${step + 2} ')`);
  }
}
try {
  for (let i = 0; i < 50; i++) { try { if ((await fetch(origin)).ok) break; } catch {} await delay(100); }
  if (preview.exitCode !== null) throw new Error(previewLog);
  target = await fetch(cdp + '/json/new?about:blank', { method: 'PUT' }).then(r => r.json());
  socket = new WebSocket(target.webSocketDebuggerUrl);
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails);
    const item = pending.get(message.id); if (!item) return;
    clearTimeout(item.timer); pending.delete(message.id);
    if (message.error) item.reject(new Error(message.error.message)); else item.resolve(message.result);
  });
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  await command('Page.enable'); await command('Runtime.enable');
  await command('Emulation.setTimezoneOverride', { timezoneId: 'America/Los_Angeles' });
  for (const width of [1440, 820, 390, 320]) {
    await command('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 600 });
    await navigate('/programs');
    assert.equal(await evaluate("document.querySelectorAll('.programme-card').length"), 7);
    assert.equal(await evaluate("[...document.querySelectorAll('.card-action')].every(a => a.textContent.trim() === 'Book now')"), true);
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, 'Mobile overflow');
    await evaluate('Promise.all([...document.images].map(i => { i.loading = "eager"; return i.decode().catch(() => null); }))');
    assert.equal(await evaluate('[...document.images].every(i => i.complete && i.naturalWidth > 0)'), true);
    const shot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    await writeFile(output + '/catalogue-' + width + '.png', Buffer.from(shot.data, 'base64'));
  }
  for (const p of catalogue) {
    console.log('Checking form: ' + p.id);
    mode = p.id === 'daily-private-sessions' ? 'confirmed' : 'pending';
    await ready(p);
    const before = attempts;
    await evaluate("document.querySelector('#booking-form').requestSubmit(); document.querySelector('#booking-form').requestSubmit()");
    await until("!!document.querySelector('.completion')");
    assert.equal(await evaluate("/enquir/i.test(document.body.innerText)"), false);
    assert.equal(attempts, before + 1, 'Duplicate click sent more than once');
    assert.equal(await evaluate("!!document.querySelector('#download-calendar')"), mode === 'confirmed');
  }
  mode = 'pending';
  const camp = catalogue.find(p => p.mode === 'published');
  await navigate('/book/' + camp.id + '?session=42');
  assert.equal(await evaluate("document.querySelector('#sessionId').value"), '42');
  assert.equal(await evaluate("document.querySelector('.programme-return').href"), camp.programmeUrl);
  assert.equal(await evaluate("document.querySelector('.programme-return').target"), '');
  assert.equal(await evaluate("document.querySelector('#sessionId option:checked').textContent.includes('Dar STEM Park')"), true);
  await navigate('/book/' + camp.id + '?session=expired');
  assert.equal(await evaluate("document.querySelector('#sessionId').value"), '');
  assert.equal(await evaluate("document.body.innerText.includes('selected session is no longer available')"), true);
  const savedSessions = camp.sessions;
  camp.sessions = [];
  await navigate('/book/' + camp.id + '?session=42');
  assert.equal(await evaluate("!!document.querySelector('#booking-form')"), false, 'Do not silently replace an unavailable session with an undated booking');
  assert.equal(await evaluate("[...document.querySelectorAll('a')].some(a => new URL(a.href).searchParams.get('booking') === 'request')"), true);
  await navigate('/book/' + camp.id + '?booking=request');
  assert.equal(await evaluate("!!document.querySelector('#message')"), true);
  await navigate('/book/' + camp.id + '?enquiry=1');
  assert.equal(await evaluate("!!document.querySelector('#message') && location.search === '?booking=request'"), true);
  camp.allowEnquiry = false;
  await navigate('/book/' + camp.id);
  assert.equal(await evaluate("document.body.innerText.includes('currently closed')"), true);
  assert.equal(await evaluate("document.querySelector('.programme-return').href"), camp.programmeUrl);
  camp.sessions = savedSessions; camp.allowEnquiry = true;
  for (const width of [390, 320]) {
    await command('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: true });
    await navigate('/book/' + catalogue[0].id + '?enquiry=1');
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, 'Return navigation must fit on phones');
    assert.equal(await evaluate("document.querySelector('.programme-return').getBoundingClientRect().height >= 44"), true);
  }
  mode = 'failure'; await ready(catalogue[0]); await submit();
  await until("!document.querySelector('#submission-error').hidden");
  assert.equal(await evaluate("!!document.querySelector('.completion')"), false);
  assert.equal(await evaluate("document.body.innerText.includes('SQL secret')"), false);
  mode = 'confirmed'; await submit(); await until("!!document.querySelector('.completion')");
  mode = 'validation'; await ready(catalogue[0]); await submit(); await until("!!document.querySelector('#error-phone') && !document.querySelector('#error-phone').hidden");
  assert.equal(await evaluate("document.querySelector('#name').value"), 'Browser Test Guardian');
  mode = 'conflict'; await ready(catalogue[0]); await submit(); await until("!document.querySelector('#submission-error').hidden && !!document.querySelector('#date')");
  mode = 'full'; await navigate('/book/' + catalogue[0].id); await fill('date', date); await until("!document.querySelector('#error-slotId').hidden");
  mode = 'empty'; await navigate('/programs'); assert.equal(await evaluate("document.querySelectorAll('.programme-card').length"), 0);
  mode = 'unavailable'; await navigate('/programs'); assert.equal(await evaluate("document.body.innerText.includes('couldn’t load')"), true);
  mode = 'pending'; await navigate('/book/not-approved'); assert.equal(await evaluate("document.body.innerText.includes('isn’t available')"), true);

  // New specification forms run only in the explicitly enabled, isolated preview.
  const beforePreview = attempts;
  for (const width of [1440, 390, 320]) {
    await command('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 600 });
    for (const form of Object.values(FORMS)) {
      const context = previewContext(form, origin);
      const draft = validAnswers(context, ['saturday', 'holiday-camp'].includes(form.id) ? { children: [{ name: 'Fictional First', photoPermission: 'no' }, { name: 'Fictional Second', photoPermission: 'internal' }] } : {});
      await richReady(context, draft);
      assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, 'Rich form mobile overflow: ' + form.id);
      assert.equal(await evaluate("!!document.querySelector('.review-section')"), true);
      if (draft.children?.length === 2) {
        assert.equal(await evaluate("document.body.innerText.includes('Fictional First') && document.body.innerText.includes('Fictional Second')"), true);
      }
      if (form.id === 'holiday-camp') {
        for (const label of ['Child 1 · Allergies (food, medicine or other) and instructions for our team', 'Child 2 · Foods to avoid or other dietary requirements']) {
          assert.equal(await evaluate('document.body.innerText.includes(' + JSON.stringify(label) + ')'), true);
        }
        await evaluate("document.querySelector('[data-edit=\"1\"]').click()");
        assert.equal(await evaluate("document.querySelector('[name=\"answers.children.0.allergies\"]').value"), draft.children[0].allergies);
        await richField('children.0.hasAllergies', 'no', 'select');
        await richField('children.0.hasDietaryNeeds', 'no', 'select');
        assert.equal(await evaluate("!!document.querySelector('[name=\"answers.children.0.allergies\"]') || !!document.querySelector('[name=\"answers.children.0.dietaryNeeds\"]')"), false);
        assert.equal(await evaluate("document.querySelector('[name=\"answers.children.1.allergies\"]').value"), draft.children[1].allergies);
        assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, 'Camp health questions fit on phones');
        if (width === 390) {
          const healthShot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
          await writeFile(output + '/camp-health-questions.png', Buffer.from(healthShot.data, 'base64'));
        }
        for (let step = 1; step < form.sections.length; step++) {
          await evaluate("document.querySelector('#registration-form').requestSubmit()");
          await until('document.querySelector(\'.registration-progress\')?.textContent.startsWith(\'Step ' + (step + 2) + ' \')');
        }
        assert.equal(await evaluate("document.body.innerText.includes('Child 1 · Allergies (food, medicine or other) and instructions for our team')"), false);
        assert.equal(await evaluate("document.body.innerText.includes('Child 2 · Allergies (food, medicine or other) and instructions for our team')"), true);
      }
      await evaluate("document.querySelector('[data-edit=\"0\"]').click()");
      assert.equal(await evaluate("document.querySelector('[name=\"answers.contact.name\"]').value"), draft.contact.name);
      const shot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
      if (width === 390) await writeFile(output + '/form-' + form.id + '.png', Buffer.from(shot.data, 'base64'));
      console.log('Checked specification form: ' + form.id + ' at ' + width + 'px');
    }
  }
  await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 900, deviceScaleFactor: 1, mobile: true });
  for (const type of ['individual', 'group', 'family', 'coaching', 'department', 'corporate', 'other']) {
    const context = previewContext(FORMS.private, origin);
    await richReady(context, validAnswers(context, { private: { type } }));
    await evaluate("document.querySelector('#registration-form').requestSubmit();document.querySelector('#registration-form').requestSubmit()");
    await until("!!document.querySelector('.completion')");
    assert.equal(await evaluate("document.body.innerText.includes('No booking was saved')"), true);
  }
  const teacherContext = previewContext(FORMS['teacher-training'], origin);
  for (const delivery of ['scheduled', 'custom', 'either']) for (const listMode of ['later', 'manual', 'upload']) {
    await richReady(teacherContext, validAnswers(teacherContext, { training: { registrationType: 'school', delivery, listMode } }));
    await evaluate("document.querySelector('#registration-form').requestSubmit()"); await until("!!document.querySelector('.completion')");
  }
  const campContext = previewContext(FORMS['holiday-camp'], origin);
  await richReady(campContext, validAnswers(campContext), { simulate: 'validation' });
  await evaluate("document.querySelector('#registration-form').requestSubmit()");
  await until("document.querySelector('[name=\"answers.children.0.medical\"]')?.getAttribute('aria-invalid') === 'true'");
  assert.equal(await evaluate("document.activeElement.name"), 'answers.children.0.medical');
  const privateContext = previewContext(FORMS.private, origin);
  await richReady(privateContext, validAnswers(privateContext), { simulate: 'failure' });
  await evaluate("document.querySelector('#registration-form').requestSubmit()");
  await until("document.querySelector('#registration-errors')?.textContent.includes('Simulated connection failure')");
  assert.equal(await evaluate("!!document.querySelector('.completion')"), false);
  assert.equal(attempts, beforePreview, 'Isolated preview must not send requests to the booking API');

  // Unknown/new form URLs cannot enable unsupported integration on normal pages.
  await navigate('/book/daily-private-sessions?form=private');
  assert.equal(await evaluate("document.body.innerText.includes('not available yet')"), true);
  assert.equal(await evaluate("!!document.querySelector('#registration-form')"), false);

  // Exercise the production transport against an explicitly capable fake API.
  const liveContext = previewContext(FORMS.private, apiOrigin);
  liveContext.programme = catalogue[0];
  catalogue[0].bookingForms = [liveContext.config];
  mode = 'failure';
  await navigate('/book/' + catalogue[0].id);
  await richReady(liveContext, validAnswers(liveContext), { navigateFirst: false });
  await evaluate("document.querySelector('#registration-form').requestSubmit()");
  await until("document.querySelector('#registration-errors')?.textContent.includes('temporarily unavailable')");
  assert.equal(await evaluate("!!document.querySelector('.completion')"), false);
  mode = 'pending';
  const richAttempts = attempts;
  await evaluate("document.querySelector('#registration-form').requestSubmit();document.querySelector('#registration-form').requestSubmit()");
  await until("!!document.querySelector('.completion')");
  assert.equal(attempts, richAttempts + 1);
  assert.equal(registrationBodies.at(-1).key, registrationBodies.at(-2).key, 'Identical network retry must retain its key');
  assert.equal(registrationBodies.at(-1).data.formId, 'private');
  assert.equal(registrationBodies.at(-1).data.answers.student.name, 'Fictional example');
  assert.equal(registrationBodies.at(-1).data.message, undefined);
  assert.equal(await evaluate("document.body.innerText.includes('received')"), true);
  mode = 'rich-validation';
  await navigate('/book/' + catalogue[0].id);
  await richReady(liveContext, validAnswers(liveContext), { navigateFirst: false });
  await evaluate("document.querySelector('#registration-form').requestSubmit()");
  await until("document.querySelector('[name=\"answers.student.age\"]')?.getAttribute('aria-invalid') === 'true'");
  assert.equal(await evaluate('document.activeElement.name'), 'answers.student.age');
  delete catalogue[0].bookingForms; mode = 'pending';
  const campConfig = previewContext(FORMS['holiday-camp'], apiOrigin).config;
  camp.bookingForms = [campConfig]; camp.sessions = [];
  await navigate('/book/' + camp.id);
  assert.equal(await evaluate("document.body.innerText.includes('Camp bookings are currently closed')"), true);
  assert.equal(await evaluate("!!document.querySelector('#registration-form')"), false);
  camp.sessions = savedSessions; delete camp.bookingForms;
  const liveCampContext = { ...previewContext(FORMS['holiday-camp'], apiOrigin), programme: camp };
  camp.bookingForms = [liveCampContext.config];
  mode = 'lost-rich-response';
  await navigate('/book/' + camp.id + '?session=42');
  await richReady(liveCampContext, validAnswers(liveCampContext), { navigateFirst: false });
  await evaluate("document.querySelector('#registration-form').requestSubmit()");
  await until("document.querySelector('#registration-errors')?.textContent.includes('temporarily unavailable')");
  const quoteCountBeforeRetry = registrationQuotes, savedCountBeforeRetry = submissions;
  await evaluate("window.TestRealDate = Date; window.Date = class extends window.TestRealDate { constructor(...args) { super(...(args.length ? args : [window.TestRealDate.now() + 120000])); } static now() { return window.TestRealDate.now() + 120000; } };");
  mode = 'pending';
  await evaluate("document.querySelector('#registration-form').requestSubmit()");
  await until("!!document.querySelector('.completion')");
  assert.equal(registrationQuotes, quoteCountBeforeRetry, 'Uncertain retry must not refresh an expired quote');
  assert.equal(submissions, savedCountBeforeRetry, 'Uncertain retry must not create a duplicate booking');
  assert.equal(registrationBodies.at(-1).key, registrationBodies.at(-2).key);
  await evaluate('window.Date = window.TestRealDate; delete window.TestRealDate;');
  delete camp.bookingForms;
  // The preview entrypoint and fixture scripts must be absent on a normal server.
  const guardProbe = createServer();
  await new Promise(resolve => guardProbe.listen(0, '127.0.0.1', resolve));
  const guardPort = guardProbe.address().port;
  await new Promise(resolve => guardProbe.close(resolve));
  const guard = spawn(process.execPath, ['preview.mjs'], { cwd: root, env: { ...process.env, BOOKING_FORMS_PREVIEW: '0', BOOKING_PREVIEW_PORT: String(guardPort), BOOKING_API_URL: apiOrigin + '/api/booking/v1' }, stdio: 'ignore' });
  try {
    let ready = false;
    for (let i = 0; i < 50; i++) { try { ready = (await fetch('http://127.0.0.1:' + guardPort + '/programs')).ok; if (ready) break; } catch {} await delay(100); }
    assert.equal(ready, true);
    for (const path of ['/__forms', '/__forms/app.js', '/__forms/fixtures.js', '/__forms/terms']) assert.equal((await fetch('http://127.0.0.1:' + guardPort + path)).status, 404);
  } finally { guard.kill(); }
  assert.equal(exceptions.length, 0, JSON.stringify(exceptions));
  console.log('Browser checks passed: existing flows, seven specification forms at desktop/mobile widths, private/teacher branches, multi-child data, review/edit, exact errors, files, failure handling and isolated preview. Fake API submissions: ' + submissions);
  console.log('Screenshots: ' + output);
} catch (error) {
  console.error('Browser exceptions:', JSON.stringify(exceptions));
  if (socket?.readyState === WebSocket.OPEN) console.error(await evaluate('document.body.innerText'));
  throw error;
} finally {
  if (target) await fetch(cdp + '/json/close/' + target.id).catch(() => {});
  socket?.close(); preview.kill(); api.close();
}
