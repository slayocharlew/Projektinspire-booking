export const TIME_ZONE = 'Africa/Dar_es_Salaam';
export const HELP_URL = 'https://projektinspire.co.tz/contact';
export const programmes = [];
export function setProgrammes(items) {
  if (!Array.isArray(items)) throw new Error('The programme list is unavailable.');
  programmes.splice(0, programmes.length, ...items.map(p => ({
    ...p, tone: ['blue', 'orange', 'green'].includes(p.tone) ? p.tone : 'blue',
    facts: Array.isArray(p.facts) ? p.facts : ['All ages', 'Ask our team'],
    details: Array.isArray(p.details) ? p.details : [], locations: p.locations || [], sessions: p.sessions || [], slots: [],
    image: ['private','saturday','camps','clubs','park','events','bootcamp'].includes(p.image) ? p.image : 'park',
  })));
}
export const getProgramme = id => programmes.find(p => p.id === id);
export function publishedSessions(programme, now = new Date()) {
  return (programme.sessions || []).filter(s => s.id && s.location && s.remaining > 0 &&
    /(?:Z|[+-]\d{2}:\d{2})$/.test(s.start || '') && /(?:Z|[+-]\d{2}:\d{2})$/.test(s.end || '') &&
    new Date(s.start) > now && new Date(s.end) > new Date(s.start));
}
export const isBookable = (p, now = new Date()) => p.mode === 'scheduled' && p.locations.length > 0 || publishedSessions(p, now).length > 0;

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
