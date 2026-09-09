import test from 'node:test';
import assert from 'node:assert/strict';
import { getProgramme, programmes, isBookable, publishedSessions } from '../public/assets/programmes.js';
import { today, addDays, validDate, dateError, timeSlots, validateSchedule, validateDetails, completeDemo, formatTime } from '../public/assets/booking.js';
import { calendarFile, googleCalendarUrl } from '../public/assets/calendar.js';

const now = new Date('2026-09-08T06:15:00Z');
const privateSession = getProgramme('daily-private-sessions');
const saturday = getProgramme('saturday-stem-sessions');
const park = getProgramme('stem-park-visit');
const base = { name: 'Test Parent', phone: '+255 700 000 001', email: 'parent@example.test', count: '1', ages: ['4–6'], date: '2026-09-09', time: '14:30', location: 'Dar es Salaam' };
const finish = (p = privateSession, draft = base) => completeDemo(p, draft, { now, id: 'test-demo-123' });

test('seven programmes use three scheduled and four enquiry paths', () => {
  assert.equal(programmes.length, 7);
  assert.equal(new Set(programmes.map(p => p.id)).size, 7);
  assert.equal(programmes.filter(p => isBookable(p, now)).length, 3);
});
test('calendar dates are based on Tanzania time, including midnight and year rollover', () => {
  assert.equal(today(new Date('2026-12-31T22:00:00Z')), '2027-01-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(validDate('2026-02-30'), false);
  assert.equal(validDate('2028-02-29'), true);
  assert.equal(validDate('2026-2-3'), false);
});
test('weekday sessions obey opening hours and the 90-day horizon', () => {
  const slots = timeSlots(privateSession, '2026-09-09', now);
  assert.equal(slots.length, 13);
  assert.equal(slots[0], '08:30');
  assert.equal(slots.at(-1), '14:30');
  assert.match(dateError(privateSession, '2026-09-12', now), /weekday/);
  assert.match(dateError(privateSession, '2026-09-13', now), /weekday/);
  assert.match(dateError(privateSession, '2026-09-07', now), /future/);
  assert.match(dateError(privateSession, addDays(today(now), 91), now), /90 days/);
  const result = finish();
  assert.equal(result.session.start, '2026-09-09T11:30:00.000Z');
  assert.equal(formatTime(result.session.end), '17:00');
});
test('Saturday sessions book a single Saturday from 10:00 to 12:30', () => {
  assert.deepEqual(timeSlots(saturday, '2026-09-12', now), ['10:00']);
  assert.match(dateError(saturday, '2026-09-11', now), /Saturday/);
  const result = finish(saturday, { ...base, date: '2026-09-12', time: '10:00' });
  assert.equal(formatTime(result.session.end), '12:30');
  assert.equal(new Date(result.session.end) - new Date(result.session.start), 150 * 60000);
});
test('elapsed slots and selections that expire before submission are rejected', () => {
  assert.equal(timeSlots(privateSession, '2026-09-08', now)[0], '09:30');
  assert.equal(timeSlots(saturday, '2026-09-12', new Date('2026-09-12T07:00:00Z')).length, 0);
  assert.ok(completeDemo(privateSession, { ...base, date: '2026-09-08', time: '09:00' }, { now, id: 'expired' }).errors.time);
});
test('only park visits can select Tanga; unsupported times cannot be submitted', () => {
  assert.ok(validateSchedule(privateSession, { ...base, location: 'Tanga' }, now).location);
  assert.deepEqual(validateSchedule(park, { ...base, location: 'Tanga' }, now), {});
  assert.ok(validateSchedule(park, { ...base, time: '15:00' }, now).time);
});
test('contact, age group and participant validation is programme-specific', () => {
  assert.deepEqual(validateDetails(privateSession, { ...base, email: '' }, true, now), {});
  assert.ok(validateDetails(privateSession, { ...base, phone: 'abc' }, true, now).phone);
  assert.ok(validateDetails(privateSession, { ...base, email: 'bad' }, true, now).email);
  assert.ok(validateDetails(privateSession, { ...base, ages: [] }, true, now).ages);
  assert.ok(validateDetails(privateSession, { ...base, ages: ['4–6', '7–14'] }, true, now).ages);
  assert.ok(validateDetails(privateSession, { ...base, count: '2' }, true, now).count);
  assert.ok(validateDetails(park, { ...base, count: '1.5' }, true, now).count);
  assert.deepEqual(validateDetails(park, { ...base, ages: [], count: '20' }, true, now), {});
});
test('school and event enquiries require the right details, but no scheduled session', () => {
  const school = getProgramme('on-site-stem-clubs');
  const event = getProgramme('stem-themed-events');
  const draft = { ...base, message: 'We are interested in a partnership.' };
  assert.ok(validateDetails(school, draft, false, now).school);
  assert.equal(finish(school, { ...draft, school: 'Test School', level: 'Lower primary' }).session, null);
  assert.ok(validateDetails(event, draft, false, now).preferredDate);
  assert.equal(finish(event, { ...draft, eventType: 'Birthday', preferredDate: '2026-09-20', venue: 'Dar es Salaam', attendance: '12' }).session, null);
  assert.ok(validateDetails(event, { ...draft, preferredDate: '2026-09-01' }, false, now).preferredDate);
  for (const id of ['holiday-camps', 'annual-stem-youth-bootcamp']) assert.equal(finish(getProgramme(id), draft).session, null);
});
test('unpublished or incomplete camp dates stay as enquiries; complete future sessions become bookable', () => {
  const camp = getProgramme('holiday-camps');
  assert.equal(isBookable(camp, now), false);
  const scheduled = { ...camp, sessions: [
    { id: 'incomplete', start: '2026-09-15T08:30:00+03:00' },
    { id: 'old', location: 'Dar es Salaam', start: '2025-09-15T08:30:00+03:00', end: '2025-09-15T11:00:00+03:00' },
    { id: 'morning', location: 'Dar es Salaam', start: '2026-09-15T08:30:00+03:00', end: '2026-09-15T11:00:00+03:00' },
  ] };
  assert.equal(isBookable(scheduled, now), true);
  assert.equal(publishedSessions(scheduled, now).length, 1);
  assert.equal(finish(scheduled, { ...base, sessionId: 'morning' }).session.id, 'morning');
  assert.ok(finish(scheduled, { ...base, sessionId: 'missing' }).errors.sessionId);
});
test('completion returns only a demo event and no contact or participant data', () => {
  const result = finish();
  assert.equal(result.status, 'demo');
  for (const secret of [base.name, base.email, base.phone]) assert.equal(JSON.stringify(result).includes(secret), false);
});
test('calendar file uses UTC times, two reminders, stable identifiers and no private contact data', () => {
  const result = finish();
  const file = calendarFile(result);
  assert.equal(file, calendarFile(result));
  assert.match(file, /UID:test-demo-123@booking.projektinspire.co.tz/);
  assert.match(file, /DTSTART:20260909T113000Z/);
  assert.match(file, /DTEND:20260909T140000Z/);
  assert.match(file, /SUMMARY:DEMO/);
  assert.match(file, /TRIGGER:-P1D/);
  assert.match(file, /TRIGGER:-PT1H/);
  assert.equal(file.split('BEGIN:VEVENT').length - 1, 1);
  assert.ok(file.endsWith('END:VCALENDAR\r\n'));
  for (const secret of [base.name, base.email, base.phone]) assert.equal(file.includes(secret), false);
});
test('calendar text is escaped and UTF-8 lines are folded safely', () => {
  const file = calendarFile({ ...finish(), title: 'Science, art; \\ fun\nBEGIN:VEVENT ' + '💡'.repeat(60) });
  assert.match(file, /Science\\, art\\; \\\\ fun\\nBEGIN:VEVENT/);
  assert.equal(file.split('\r\nBEGIN:VEVENT').length - 1, 1);
  assert.ok(file.split('\r\n').every(line => Buffer.byteLength(line) <= 75));
  assert.ok(file.replace(/\r\n /g, '').includes('💡'.repeat(60)));
});
test('Google event link encodes event data and enquiries cannot produce exports', () => {
  const url = new URL(googleCalendarUrl(finish()));
  assert.equal(url.origin, 'https://calendar.google.com');
  assert.equal(url.searchParams.get('dates'), '20260909T113000Z/20260909T140000Z');
  assert.equal(url.searchParams.get('stz'), 'Africa/Dar_es_Salaam');
  assert.equal(url.searchParams.get('etz'), 'Africa/Dar_es_Salaam');
  assert.equal(url.searchParams.get('location'), 'Projekt Inspire STEM Park, Dar es Salaam');
  const enquiry = finish(getProgramme('holiday-camps'), { ...base, message: 'Interested' });
  assert.throws(() => calendarFile(enquiry));
  assert.throws(() => googleCalendarUrl(enquiry));
});
