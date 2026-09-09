import test from 'node:test';
import assert from 'node:assert/strict';
import { setProgrammes, getProgramme, programmes, isBookable, publishedSessions } from '../public/assets/programmes.js';
import { today, addDays, validDate, timeSlots, validateSchedule, validateDetails, scheduledSession, formatTime } from '../public/assets/booking.js';
import { request, ApiError, submissionData, submissionKey } from '../public/assets/api.js';
import { calendarFile, googleCalendarUrl } from '../public/assets/calendar.js';

const now = new Date('2026-09-09T06:00:00Z');
const slot = { id: '1@2026-09-10T08:30', locationId: 1, location: 'Dar STEM Park', start: '2026-09-10T08:30:00+03:00', end: '2026-09-10T11:00:00+03:00', remaining: 1 };
const p = { id: 'private', title: 'Private sessions', mode: 'scheduled', audience: 'children', singleLearner: true, locations: [{ id: 1, name: 'Dar STEM Park' }], slots: [slot], allowEnquiry: true };
const draft = { name: 'Test Guardian', phone: '+255700000001', email: '', count: '1', ages: ['4–6'], locationId: '1', date: '2026-09-10', slotId: slot.id, consent: true };
const result = { id: 'f40ec531-bf55-41b0-a4cc-bf854ec26567', status: 'confirmed', title: 'STEM session', createdAt: now.toISOString(), session: slot };
const mock = (body, status = 200) => async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

test('catalogue starts empty and accepts any number of server-approved programmes', () => {
  assert.equal(programmes.length, 0);
  setProgrammes(Array.from({ length: 9 }, (_, i) => ({ ...p, id: 'programme-' + i })));
  assert.equal(programmes.length, 9);
  assert.equal(getProgramme('programme-8').id, 'programme-8');
  assert.equal(getProgramme('unapproved'), undefined);
  setProgrammes([]); assert.equal(programmes.length, 0);
});
test('programme presentation is normalized without arbitrary CSS class injection', () => {
  setProgrammes([{ ...p, tone: 'bad" onclick="alert(1)', image: '../../bad', facts: null, details: null }]);
  assert.equal(programmes[0].tone, 'blue'); assert.equal(programmes[0].image, 'park');
  assert.deepEqual(programmes[0].facts, ['All ages', 'Ask our team']);
});
test('dates and calendar formatting use Tanzania time', () => {
  assert.equal(today(new Date('2026-12-31T22:00:00Z')), '2027-01-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(validDate('2026-02-30'), false); assert.equal(validDate('2028-02-29'), true);
  assert.equal(formatTime(slot.start), '08:30');
});
test('regular appointments use only server-supplied times, never generated availability', () => {
  assert.deepEqual(timeSlots(p, draft.date, now), [slot]);
  assert.deepEqual(timeSlots({ ...p, slots: [] }, draft.date, now), []);
  assert.deepEqual(validateSchedule(p, draft, now), {});
  assert.equal(scheduledSession(p, draft, now).id, slot.id);
  assert.ok(validateSchedule(p, { ...draft, slotId: 'invented' }, now).slotId);
  assert.ok(validateSchedule(p, { ...draft, locationId: '99' }, now).locationId);
  assert.deepEqual(timeSlots(p, '2026-09-11', now), []);
});
test('full and expired slots and sessions cannot be selected', () => {
  assert.deepEqual(timeSlots({ ...p, slots: [{ ...slot, remaining: 0 }] }, draft.date, now), []);
  assert.deepEqual(timeSlots(p, draft.date, new Date('2026-09-10T09:00:00Z')), []);
  const camp = { ...p, mode: 'published', sessions: [{ ...slot, id: '42' }] };
  assert.equal(isBookable(camp, now), true);
  assert.equal(publishedSessions({ ...camp, sessions: [{ ...slot, remaining: 0 }] }, now).length, 0);
  assert.equal(isBookable({ ...camp, sessions: [] }, now), false);
});
test('contact and participant validation remains programme-specific', () => {
  assert.deepEqual(validateDetails(p, draft, true, now), {});
  assert.ok(validateDetails(p, { ...draft, count: 2 }, true, now).count);
  assert.ok(validateDetails(p, { ...draft, ages: ['University'] }, true, now).ages);
  assert.ok(validateDetails(p, { ...draft, phone: 'invalid' }, true, now).phone);
  assert.ok(validateDetails(p, { ...draft, email: 'invalid' }, true, now).email);
});
test('school and event enquiries require the right information', () => {
  assert.ok(validateDetails({ ...p, enquiryType: 'school' }, draft, false, now).school);
  assert.deepEqual(validateDetails({ ...p, enquiryType: 'school' }, { ...draft, school: 'School', level: 'Lower primary', message: 'A weekly club' }, false, now), {});
  assert.ok(validateDetails({ ...p, enquiryType: 'event' }, { ...draft, message: 'Birthday' }, false, now).preferredDate);
});
test('submission sends only relevant fields and never trusts browser prices, capacity or status', () => {
  const data = submissionData(p, { ...draft, status: 'confirmed', remaining: 999, price: 0, sessionId: 'other' }, true);
  for (const field of ['status', 'remaining', 'price', 'sessionId']) assert.equal(Object.hasOwn(data, field), false);
  assert.equal(data.slotId, slot.id); assert.equal(data.consent, true);
  const enquiry = submissionData({ ...p, enquiryType: 'general' }, { ...draft, message: 'Hello' }, false);
  assert.equal(enquiry.message, 'Hello'); assert.equal(Object.hasOwn(enquiry, 'slotId'), false);
});
test('retry key stays the same until submission details change', () => {
  const key = submissionKey(); const data = submissionData(p, draft, true);
  assert.equal(key(data), key(data));
  const first = key(data); assert.notEqual(first, key({ ...data, name: 'Another guardian' }));
});
test('API requests are anonymous and send idempotency keys, not login cookies', async () => {
  let options;
  const receipt = await request('/bookings', { method: 'POST', data: { name: 'Test' }, key: 'abc', fetcher: async (url, args) => { options = args; return new Response(JSON.stringify({ data: result })); } });
  assert.equal(receipt.status, 'confirmed'); assert.equal(options.credentials, 'omit');
  assert.equal(options.headers['Idempotency-Key'], 'abc'); assert.equal(options.cache, 'no-store');
});
test('API failures never create a fake successful booking', async () => {
  await assert.rejects(request('/bookings', { fetcher: async () => { throw new Error('offline'); } }), /could not reach/);
  await assert.rejects(request('/bookings', { fetcher: mock({ message: 'Full' }, 409) }), e => e instanceof ApiError && e.status === 409);
  await assert.rejects(request('/bookings', { fetcher: mock({ message: 'SQL password secret' }, 500) }), e => !e.message.includes('secret'));
  await assert.rejects(request('/bookings', { fetcher: mock({}, 429) }), /wait a minute/);
  await assert.rejects(request('/bookings', { fetcher: mock({ status: 'demo' }) }), /unexpected response/);
});
test('field errors are mapped to visible frontend fields', async () => {
  await assert.rejects(request('/bookings', { fetcher: mock({ message: 'Invalid', errors: { 'ages.0': ['Choose an age group.'] } }, 422) }), e => e.errors.ages === 'Choose an age group.');
});
test('only confirmed bookings can produce calendar exports', () => {
  for (const status of ['pending', 'demo', 'cancelled', 'declined']) {
    assert.throws(() => calendarFile({ ...result, status }));
    assert.throws(() => googleCalendarUrl({ ...result, status }));
  }
  assert.throws(() => calendarFile({ ...result, session: null }));
  const file = calendarFile(result);
  assert.match(file, /STATUS:CONFIRMED/); assert.match(file, /DTSTART:20260910T053000Z/);
  assert.match(file, /TRIGGER:-P1D/); assert.match(file, /TRIGGER:-PT1H/);
  assert.equal(file.includes('DEMO'), false);
  assert.equal(file.includes(draft.phone), false);
});
test('calendar text cannot inject additional events and UTF-8 folding stays valid', () => {
  const file = calendarFile({ ...result, title: 'Science, art; \\ fun\nBEGIN:VEVENT ' + '💡'.repeat(60) });
  assert.equal(file.split('\r\nBEGIN:VEVENT').length - 1, 1);
  assert.ok(file.split('\r\n').every(line => Buffer.byteLength(line) <= 75));
  assert.ok(file.replace(/\r\n /g, '').includes('💡'.repeat(60)));
  const url = new URL(googleCalendarUrl(result));
  assert.equal(url.origin, 'https://calendar.google.com'); assert.equal(url.searchParams.get('stz'), 'Africa/Dar_es_Salaam');
});
