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
  return '';
}
export function timeSlots(programme, date, now = new Date()) {
  if (dateError(programme, date, now)) return [];
  return (programme.slots || []).filter(s => s.remaining > 0 && new Date(s.start) > now && s.start.slice(0, 10) === date);
}
export function scheduledSession(programme, draft, now = new Date()) {
  if (programme.mode === 'published') return publishedSessions(programme, now).find(s => s.id === draft.sessionId);
  return timeSlots(programme, draft.date, now).find(s => s.id === draft.slotId && String(s.locationId) === draft.locationId);
}
export function validateSchedule(programme, draft, now = new Date()) {
  if (programme.mode === 'published') return scheduledSession(programme, draft, now) ? {} : { sessionId: 'Choose an available session.' };
  const errors = {};
  if (!programme.locations.some(l => String(l.id) === draft.locationId)) errors.locationId = 'Choose a location.';
  const error = dateError(programme, draft.date, now);
  if (error) errors.date = error;
  else if (!scheduledSession(programme, draft, now)) errors.slotId = 'Choose an available time.';
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

export function formatDate(date) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(date.length === 10 ? `${date}T12:00:00+03:00` : date));
}
export const formatTime = date => new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(date));
