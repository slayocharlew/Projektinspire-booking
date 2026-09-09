import { TIME_ZONE } from './programmes.js';

const stamp = value => new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
const escapeText = value => String(value).replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
// RFC 5545 folds lines at 75 octets, without splitting a UTF-8 character.
function fold(line) {
  const encoder = new TextEncoder();
  let output = '', bytes = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    if (bytes + size > 75) { output += '\r\n '; bytes = 1; }
    output += char; bytes += size;
  }
  return output;
}
function event(result) {
  if (result.status !== 'demo' || !result.session || !result.id || !result.createdAt) throw new Error('A completed scheduled demo booking is required.');
  if (!Number.isFinite(new Date(result.session.start).getTime()) || new Date(result.session.end) <= new Date(result.session.start)) throw new Error('Invalid event times.');
  return { title: `DEMO — ${result.title}`, location: `Projekt Inspire STEM Park, ${result.session.location}`,
    description: 'Demo booking only. No place has been reserved. Times are in East Africa Time (UTC+3).',
    start: stamp(result.session.start), end: stamp(result.session.end) };
}
export function calendarFile(result) {
  const item = event(result);
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Projekt Inspire//Booking Demo//EN', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT', `UID:${escapeText(result.id)}@booking.projektinspire.co.tz`, `DTSTAMP:${stamp(result.createdAt)}`,
    `DTSTART:${item.start}`, `DTEND:${item.end}`, `SUMMARY:${escapeText(item.title)}`,
    `LOCATION:${escapeText(item.location)}`, `DESCRIPTION:${escapeText(item.description)}`, 'STATUS:TENTATIVE'];
  for (const reminder of ['-P1D', '-PT1H']) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `TRIGGER:${reminder}`, `DESCRIPTION:${escapeText(item.title)}`, 'END:VALARM');
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
export function googleCalendarUrl(result) {
  const item = event(result);
  const params = new URLSearchParams({ action: 'TEMPLATE', text: item.title, dates: `${item.start}/${item.end}`,
    stz: TIME_ZONE, etz: TIME_ZONE, details: item.description, location: item.location });
  return `https://calendar.google.com/calendar/r/eventedit?${params}`;
}
