export const TIME_ZONE = 'Africa/Dar_es_Salaam';
export const HELP_URL = 'https://projektinspire.co.tz/contact';

// Older API content may still use the previous terminology. Normalize public
// copy only; submitted details and backend identifiers must remain unchanged.
export function bookingCopy(value) {
  return String(value ?? '').replace(/\ban enquiry\b/gi, match => match[0] === 'A' ? 'A booking' : 'a booking')
    .replace(/\b(enquiries|enquiry|enquire)\b/gi, match => {
      const replacement = { enquiries: 'bookings', enquiry: 'booking', enquire: 'book' }[match.toLowerCase()];
      return match[0] === match[0].toUpperCase() ? replacement[0].toUpperCase() + replacement.slice(1) : replacement;
    });
}

export function bookingPageUrl(id, { request = false, session } = {}) {
  const query = new URLSearchParams();
  if (request) query.set('booking', 'request');
  else if (session) query.set('session', String(session));
  return `/book/${encodeURIComponent(id)}${query.size ? '?' + query : ''}`;
}

export function bookingRequestRequested(search) {
  const query = new URLSearchParams(search);
  return query.get('booking') === 'request' || query.get('enquiry') === '1';
}

export const programmes = [];
const informationOnlyIds = ['career-guidance', 'job-shadowing'];
export const sessionOnlyProgramme = p => ['annual-stem-youth-bootcamp', 'youth-bootcamps', 'sybc'].includes(p.id) || p.bookingPolicy === 'published-session-only';
export function setProgrammes(items) {
  if (!Array.isArray(items)) throw new Error('The programme list is unavailable.');
  programmes.splice(0, programmes.length, ...items.filter(p => !informationOnlyIds.includes(p.id) && p.mode !== 'information_only').map(p => ({
    ...p, tone: ['blue', 'orange', 'green'].includes(p.tone) ? p.tone : 'blue',
    allowEnquiry: sessionOnlyProgramme(p) ? false : p.allowEnquiry,
    title: bookingCopy(p.title), summary: bookingCopy(p.summary), category: bookingCopy(p.category),
    scheduleLabel: bookingCopy(p.scheduleLabel), imageAlt: bookingCopy(p.imageAlt),
    facts: (Array.isArray(p.facts) ? p.facts : ['All ages', 'Ask our team']).map(bookingCopy),
    details: (Array.isArray(p.details) ? p.details : []).map(bookingCopy), locations: p.locations || [], sessions: p.sessions || [], slots: [],
    image: ['private','saturday','camps','clubs','park','events','bootcamp'].includes(p.image) ? p.image : 'park',
  })));
}
export const getProgramme = id => programmes.find(p => p.id === id);
export function publishedSessions(programme, now = new Date()) {
  return (programme.sessions || []).filter(s => s.id && s.location && (s.capacityLimited === false || s.remaining === undefined || s.remaining > 0) &&
    /(?:Z|[+-]\d{2}:\d{2})$/.test(s.start || '') && /(?:Z|[+-]\d{2}:\d{2})$/.test(s.end || '') &&
    new Date(s.start) > now && new Date(s.end) > new Date(s.start));
}
export const isBookable = (p, now = new Date()) => p.registrationFormsManaged
  ? (p.bookingForms || []).some(form => form.id !== 'holiday-camp' || publishedSessions(p, now).length > 0)
  : (!sessionOnlyProgramme(p) && p.mode === 'scheduled' && p.locations.length > 0) || (p.mode === 'published' && publishedSessions(p, now).length > 0);

// Accept only canonical programme pages on this booking API's own website.
export function programmeInformationUrl(programme, websiteOrigin) {
  try {
    const url = new URL(programme?.programmeUrl);
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== new URL(websiteOrigin).origin ||
        url.username || url.password || url.search || url.hash || !/^\/programmes\/[^/]+\/?$/.test(url.pathname)) return null;
    return url.href;
  } catch { return null; }
}

export function selectedSession(programme, id, now = new Date()) {
  return programme?.mode === 'published' ? publishedSessions(programme, now).find(s => String(s.id) === String(id)) : undefined;
}
