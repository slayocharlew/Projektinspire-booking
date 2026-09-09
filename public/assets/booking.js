import { TIME_ZONE, isBookable, publishedSessions } from './programmes.js';

export function today(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
export function addDays(date, days) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
export function validDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return false;
  const parsed = new Date(`${date}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}
export function dateError(programme, date, now = new Date()) {
  if (!validDate(date)) return 'Choose a valid date.';
  if (date < today(now)) return 'Choose today or a future date.';
  if (date > addDays(today(now), 90)) return 'Choose a date within the next 90 days.';
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  if (programme.schedule === 'saturday' && day !== 6) return 'Choose a Saturday.';
  if (programme.schedule === 'weekday' && (day === 0 || day === 6)) return 'Choose a weekday, Monday–Friday.';
  return '';
}
export function timeSlots(programme, date, now = new Date()) {
  if (dateError(programme, date, now)) return [];
  const minutes = programme.schedule === 'saturday' ? [600] : Array.from({ length: 13 }, (_, i) => 510 + i * 30);
  return minutes.map(value => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`)
    .filter(time => new Date(`${date}T${time}:00+03:00`) > now);
}
export function scheduledSession(programme, draft, now = new Date()) {
  if (programme.mode === 'published') return publishedSessions(programme, now).find(session => session.id === draft.sessionId);
  if (!programme.locations.includes(draft.location) || !timeSlots(programme, draft.date, now).includes(draft.time)) return undefined;
  const start = new Date(`${draft.date}T${draft.time}:00+03:00`);
  return { location: draft.location, start: start.toISOString(), end: new Date(start.getTime() + programme.duration * 60000).toISOString() };
}
export function validateSchedule(programme, draft, now = new Date()) {
  if (programme.mode === 'published') return scheduledSession(programme, draft, now) ? {} : { sessionId: 'Choose an upcoming session.' };
  const errors = {};
  if (!programme.locations.includes(draft.location)) errors.location = 'Choose a STEM Park.';
  const error = dateError(programme, draft.date, now);
  if (error) errors.date = error;
  else if (!timeSlots(programme, draft.date, now).length) errors.date = 'No session times remain. Choose another date.';
  else if (!timeSlots(programme, draft.date, now).includes(draft.time)) errors.time = 'Choose an available start time.';
  return errors;
}
export function validateDetails(programme, draft, bookable = isBookable(programme), now = new Date()) {
  const errors = {};
  if (!draft.name?.trim()) errors.name = 'Enter your name.';
  const phone = (draft.phone || '').replace(/[\s().-]/g, '');
  if (!/^\+?\d{7,15}$/.test(phone)) errors.phone = 'Enter a valid phone number, including the country code.';
  if (draft.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email)) errors.email = 'Enter a valid email address or leave it blank.';
  if (bookable) {
    if (!Number.isInteger(Number(draft.count)) || Number(draft.count) < 1 || (programme.singleLearner && Number(draft.count) !== 1)) errors.count = 'Enter a valid number of participants.';
    const allowed = programme.audience === 'children' ? ['4–6', '7–14'] : programme.audience === 'youth' ? ['O-Level', 'A-Level', 'College', 'University'] : [];
    if (allowed.length && (!draft.ages?.length || draft.ages.some(age => !allowed.includes(age)))) errors.ages = 'Select the participant age group or level.';
    if (programme.singleLearner && draft.ages?.length !== 1) errors.ages = 'Choose one age group for your learner.';
  } else {
    if (!draft.message?.trim()) errors.message = 'Tell us a little about your request.';
    if (programme.enquiryType === 'school') {
      if (!draft.school?.trim()) errors.school = 'Enter your school name.';
      if (!['Lower primary', 'Upper primary', 'Secondary', 'Multiple levels'].includes(draft.level)) errors.level = 'Choose a student level.';
    }
    if (programme.enquiryType === 'event') {
      if (!['Birthday', 'Family day', 'School fair', 'Competition', 'Team-building', 'Other'].includes(draft.eventType)) errors.eventType = 'Choose an event type.';
      if (!validDate(draft.preferredDate) || draft.preferredDate < today(now)) errors.preferredDate = 'Choose today or a future date.';
      if (!draft.venue?.trim()) errors.venue = 'Enter your preferred venue or city.';
      if (!Number.isInteger(Number(draft.attendance)) || Number(draft.attendance) < 1) errors.attendance = 'Enter the estimated attendance.';
    }
  }
  return errors;
}

// This is the only submission boundary. Replace with a server adapter later.
// No contact details are persisted or transmitted by the demo.
export function completeDemo(programme, draft, { now = new Date(), id = crypto.randomUUID(), bookable = isBookable(programme, now) } = {}) {
  const errors = { ...validateDetails(programme, draft, bookable, now), ...(bookable ? validateSchedule(programme, draft, now) : {}) };
  if (Object.keys(errors).length) return { errors };
  return { status: 'demo', id, createdAt: now.toISOString(), programmeId: programme.id, title: programme.title,
    session: bookable ? scheduledSession(programme, draft, now) : null };
}
export function formatDate(date) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(date.length === 10 ? `${date}T12:00:00+03:00` : date));
}
export const formatTime = date => new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(date));
