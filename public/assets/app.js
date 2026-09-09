import { programmes, getProgramme, HELP_URL, isBookable, publishedSessions } from './programmes.js';
import { today, addDays, dateError, timeSlots, validateSchedule, validateDetails, completeDemo, scheduledSession, formatDate, formatTime } from './booking.js';
import { calendarFile, googleCalendarUrl } from './calendar.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const icons = {
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>', back: '<path d="M19 12H5m5-5-5 5 5 5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  users: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 4v2"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18m-13 5h2m4 0h2"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  check: '<path d="m5 12 4 4L19 6"/>', help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 8.5a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4M12 16h.01"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.arrow}</svg>`;
const app = document.querySelector('#app');
const slug = decodeURIComponent(location.pathname).replace(/\/index\.html$/, '').replace(/\/$/, '').split('/')[2];
const programme = getProgramme(slug);
function photo(p, lazy = true) {
  return `<img src="/assets/images/${p.image}.webp" alt="${escape(p.imageAlt)}" width="800" height="530" ${lazy ? 'loading="lazy"' : 'fetchpriority="high"'} decoding="async">`;
}
function catalogue() {
  document.title = 'Book a STEM experience | Projekt Inspire';
  app.innerHTML = `<section class="catalogue-intro" aria-labelledby="page-title"><div><p class="eyebrow">A little curiosity. Endless possibilities.</p><h1 id="page-title">Book a STEM <span>experience.</span></h1><p class="intro-copy">Choose your programme. We’ll take it from there.</p></div><div class="catalogue-count"><span class="count-dots" aria-hidden="true"><i></i><i></i><i></i></span>7 ways to explore</div></section>
  <section class="programme-grid" aria-label="Our programmes">${programmes.map((p, i) => {
    const bookable = isBookable(p);
    return `<article class="programme-card tone-${p.tone}${i === 6 ? ' card-wide' : ''}"><a class="card-photo" href="/book/${p.id}" tabindex="-1" aria-hidden="true">${photo(p, i > 2)}<span class="category">${p.category}</span></a><div class="card-content"><h2><a href="/book/${p.id}">${p.title}</a></h2><p class="card-description">${p.summary}</p><div class="card-facts"><span>${icon('users')}${p.facts[0]}</span><span>${icon('clock')}${p.facts[1]}</span></div></div><div class="card-footer"><span class="schedule-label">${p.mode === 'published' && bookable ? 'Dates available' : p.scheduleLabel}</span><a class="card-action" href="/book/${p.id}" aria-label="${bookable && p.mode === 'published' ? 'Book' : p.action}: ${p.title}">${bookable && p.mode === 'published' ? 'Book' : p.action}${icon('arrow')}</a></div></article>`;
  }).join('')}</section><div class="catalogue-help"><span>Not sure where to start?</span><a href="${HELP_URL}" target="_blank" rel="noopener">Let’s find your programme ${icon('arrow')}</a></div>`;
}

let step = 0, result, blobUrl;
const bookable = programme && isBookable(programme);
const draft = { location: programme?.locations?.length === 1 ? programme.locations[0] : '', date: '', time: '', sessionId: '', name: '', phone: '', email: '', count: '1', ages: [], topic: '', message: '', school: '', level: '', eventType: '', preferredDate: '', venue: '', attendance: '' };
let errors = {};
function errorMarkup(name) { return `<p id="error-${name}" class="field-error" ${errors[name] ? '' : 'hidden'}>${escape(errors[name])}</p>`; }
function input(name, label, { type = 'text', optional = false, ...attributes } = {}) {
  const attrs = Object.entries(attributes).map(([key, value]) => `${key}="${escape(value)}"`).join(' ');
  return `<div class="field"><label for="${name}">${label}${optional ? ' <span class="optional">(optional)</span>' : ''}</label><input id="${name}" name="${name}" type="${type}" value="${escape(draft[name])}" ${optional ? '' : 'required'} aria-describedby="error-${name}" ${errors[name] ? 'aria-invalid="true"' : ''} ${attrs}>${errorMarkup(name)}</div>`;
}
function select(name, label, values, placeholder = 'Choose an option') {
  return `<div class="field"><label for="${name}">${label}</label><select id="${name}" name="${name}" required aria-describedby="error-${name}" ${errors[name] ? 'aria-invalid="true"' : ''}><option value="">${placeholder}</option>${values.map(value => {
    const [key, text] = Array.isArray(value) ? value : [value, value];
    return `<option value="${escape(key)}" ${draft[name] === key ? 'selected' : ''}>${escape(text)}</option>`;
  }).join('')}</select>${errorMarkup(name)}</div>`;
}
function contactFields() {
  return `<div class="field-grid">${input('name', 'Your name', { autocomplete: 'name', maxlength: 100 })}${input('phone', 'Phone number', { type: 'tel', autocomplete: 'tel', placeholder: '+255 …', maxlength: 30 })}<div class="full-width">${input('email', 'Email address', { type: 'email', optional: true, autocomplete: 'email', maxlength: 254 })}</div></div>`;
}
function scheduleFields() {
  if (programme.mode === 'published') return select('sessionId', 'Choose a session', publishedSessions(programme).map(s => [s.id, `${formatDate(s.start)} · ${formatTime(s.start)}–${formatTime(s.end)} · ${s.location}`]));
  return `${programme.locations.length > 1 ? select('location', 'Choose your STEM Park', programme.locations, 'Choose a city') : `<div class="location-note">${icon('pin')} STEM Park · ${escape(draft.location)}</div>`}<div class="field-grid">${input('date', programme.schedule === 'saturday' ? 'Choose a Saturday' : 'Choose a date', { type: 'date', min: today(), max: addDays(today(), 90) })}<div id="time-field">${timeField()}</div></div><p class="field-hint">${programme.schedule === 'saturday' ? 'Saturdays, 10:00 a.m.–12:30 p.m.' : 'Monday–Friday, 8:30 a.m.–5:00 p.m.'} All times are East Africa Time (UTC+3).</p><div class="session-note">${icon('clock')}<div><strong>2½ hours of discovery</strong><span>Includes a 30-minute break.</span></div></div>`;
}
function timeField() {
  return select('time', 'Start time', timeSlots(programme, draft.date).map(time => [time, `${time}–${formatTime(new Date(new Date(`${draft.date}T${time}:00+03:00`).getTime() + programme.duration * 60000))}`]), draft.date ? 'Choose a time' : 'Choose a date first');
}
function participantFields() {
  const ages = programme.audience === 'children' ? ['4–6', '7–14'] : programme.audience === 'youth' ? ['O-Level', 'A-Level', 'College', 'University'] : [];
  return `<hr><h3>Who’s joining?</h3>${programme.singleLearner ? '<p class="field-hint">A private session is for one learner.</p>' : input('count', 'Number of participants', { type: 'number', min: 1, step: 1, inputmode: 'numeric' })}${ages.length ? `<fieldset class="age-field" aria-describedby="error-ages"><legend>${programme.audience === 'youth' ? 'Education level' : 'Age group'}${programme.singleLearner ? '' : ' <span class="optional">(select all that apply)</span>'}</legend><div class="choice-row">${ages.map(age => `<label class="choice"><input type="${programme.singleLearner ? 'radio' : 'checkbox'}" name="ages" value="${age}" ${draft.ages.includes(age) ? 'checked' : ''} aria-describedby="error-ages"><span>${programme.audience === 'children' ? `Ages ${age}` : age}</span></label>`).join('')}</div>${errorMarkup('ages')}</fieldset>` : ''}${programme.singleLearner ? input('topic', 'What would you like to explore?', { optional: true, placeholder: 'e.g. robotics, coding, science', maxlength: 300 }) : ''}`;
}
function enquiryFields() {
  return `${contactFields()}<hr>${programme.enquiryType === 'school' ? `<div class="field-grid">${input('school', 'School name', { maxlength: 160 })}${select('level', 'Student level', ['Lower primary', 'Upper primary', 'Secondary', 'Multiple levels'])}</div>` : ''}${programme.enquiryType === 'event' ? `<div class="field-grid">${select('eventType', 'Event type', ['Birthday', 'Family day', 'School fair', 'Competition', 'Team-building', 'Other'])}${input('preferredDate', 'Preferred date', { type: 'date', min: today() })}${input('venue', 'Preferred venue or city', { maxlength: 200 })}${input('attendance', 'Estimated attendance', { type: 'number', min: 1, step: 1, inputmode: 'numeric' })}</div>` : ''}<div class="field"><label for="message">${programme.mode === 'published' ? 'Tell us about your interest' : 'How can we help?'}</label><textarea id="message" name="message" rows="4" required maxlength="2000" aria-describedby="error-message" ${errors.message ? 'aria-invalid="true"' : ''} placeholder="A few details are all we need.">${escape(draft.message)}</textarea>${errorMarkup('message')}</div>`;
}
function review() {
  const session = bookable ? scheduledSession(programme, draft) : null;
  const rows = [['Programme', programme.title], ...(session ? [['Where', `STEM Park · ${session.location}`], ['When', formatDate(session.start)], ['Time', `${formatTime(session.start)}–${formatTime(session.end)} · EAT`]] : []), ['Name', draft.name], ['Phone', draft.phone], ...(draft.email ? [['Email', draft.email]] : []), ...(bookable ? [['Participants', draft.count], ...(draft.ages.length ? [['Age group / level', draft.ages.join(', ')]] : []), ...(draft.topic ? [['Topics', draft.topic]] : [])] : [...(draft.school ? [['School', draft.school], ['Student level', draft.level]] : []), ...(draft.eventType ? [['Event', draft.eventType], ['Preferred date', formatDate(draft.preferredDate)], ['Venue', draft.venue], ['Estimated attendance', draft.attendance]] : []), ['Your request', draft.message]])];
  return `<dl class="review-list">${rows.map(([label, value]) => `<div><dt>${label}</dt><dd>${escape(value)}</dd></div>`).join('')}</dl><p class="demo-note">${icon('help')}This is a preview. ${bookable ? 'No place will be reserved.' : 'Your enquiry will not be sent.'}</p>`;
}
function sidebar() {
  return `<aside class="booking-summary tone-${programme.tone}" aria-label="Programme details"><div class="summary-photo">${photo(programme, false)}<span class="category">${programme.category}</span></div><div class="summary-body"><h2>${programme.title}</h2><p>${programme.summary}</p><div class="summary-facts"><span>${icon('users')}${programme.facts[0]}</span><span>${icon('clock')}${programme.facts[1]}</span><span>${icon('calendar')}${programme.mode === 'published' && bookable ? 'Published sessions' : programme.scheduleLabel}</span></div><details><summary>Good to know</summary><ul>${programme.details.map(detail => `<li>${detail}</li>`).join('')}</ul></details></div></aside>`;
}
function completion() {
  const session = result.session;
  if (session && !blobUrl) blobUrl = URL.createObjectURL(new Blob([calendarFile(result)], { type: 'text/calendar;charset=utf-8' }));
  return `<section class="completion"><div class="complete-icon">${icon('check')}</div><p class="eyebrow">${session ? 'Your next discovery' : 'Let’s make it happen'}</p><h2 id="step-title" tabindex="-1">${session ? 'Your demo booking is ready.' : 'Your enquiry preview is ready.'}</h2><p>${session ? 'Try saving your session to your calendar.' : 'Your details are ready for review. Nothing has been sent.'}</p>${session ? `<div class="event-ticket"><strong>${programme.title}</strong><span>${icon('calendar')}${formatDate(session.start)}</span><span>${icon('clock')}${formatTime(session.start)}–${formatTime(session.end)} · EAT (UTC+3)</span><span>${icon('pin')}STEM Park · ${escape(session.location)}</span></div><details class="calendar-options"><summary class="button">${icon('calendar')}Add to calendar</summary><div class="calendar-menu"><a class="button button-secondary" id="google-calendar" href="${escape(googleCalendarUrl(result))}" target="_blank" rel="noopener noreferrer">Google Calendar ${icon('arrow')}</a><a class="button button-secondary" id="download-calendar" href="${blobUrl}" download="projekt-inspire-demo.ics">Apple / Other calendar (.ics) ${icon('arrow')}</a></div></details><p class="calendar-hint">Save the event in your calendar and check your alerts. The calendar file requests reminders 1 day and 1 hour before; Google Calendar uses your settings.</p><button class="text-button" type="button" id="copy-details">Copy event details</button><div id="copy-fallback"></div><p id="calendar-status" class="status-message" role="status"></p>` : '<div class="enquiry-summary">' + review() + '</div>'}${session ? '<p class="demo-note">Preview only. No place reserved. Calendar events are marked DEMO.</p>' : ''}<a class="back-link completion-back" href="/programs">${icon('back')}Back to programmes</a></section>`;
}
function renderFlow(focus = false) {
  document.title = `${programme.title} | Projekt Inspire`;
  const steps = bookable ? ['Date & time', 'Your details', 'Review'] : ['Your request', 'Review'];
  const reviewing = step === steps.length - 1;
  app.innerHTML = `<div class="flow-top"><a class="back-link" href="/programs">${icon('back')}All programmes</a><span class="preview-badge">Booking preview</span></div><div class="flow-heading"><p class="eyebrow">${bookable ? 'Make room for discovery' : 'Start a conversation'}</p><h1>${programme.title}</h1></div><div class="booking-layout">${sidebar()}<div class="booking-panel">${result ? completion() : `<ol class="steps" aria-label="${bookable ? 'Booking' : 'Enquiry'} steps">${steps.map((label, i) => `<li class="${i === step ? 'current' : i < step ? 'complete' : ''}" ${i === step ? 'aria-current="step"' : ''}><span>${i < step ? icon('check') : i + 1}</span>${label}</li>`).join('')}</ol><form id="booking-form" novalidate><div class="step-heading"><h2 id="step-title" tabindex="-1">${reviewing ? 'Everything look right?' : bookable && step === 0 ? 'Pick your session' : bookable ? 'A little about you' : 'Tell us what you have in mind'}</h2><p>${reviewing ? 'Check your details before finishing the preview.' : bookable && step === 0 ? 'Choose a date and time that work for you.' : bookable ? 'We’ll use these details for your booking.' : programme.mode === 'published' ? 'Dates are coming soon. Share your interest with us.' : 'We’ll help shape the right experience for you.'}</p></div>${reviewing ? review() : bookable ? step === 0 ? scheduleFields() : contactFields() + participantFields() : enquiryFields()}<div class="form-actions">${step > 0 ? `<button type="button" class="button button-secondary" data-back>${icon('back')}Back</button>` : '<span></span>'}<button class="button" type="submit">${reviewing ? bookable ? 'Finish demo booking' : 'Finish enquiry preview' : 'Continue'}${icon('arrow')}</button></div>${reviewing ? '' : '<p class="preview-caption">Preview only · No booking or enquiry will be sent.</p>'}</form>`}</div></div>`;
  const form = document.querySelector('#booking-form');
  if (form) {
    form.addEventListener('input', () => capture(form));
    form.addEventListener('change', event => {
      capture(form);
      if (['date', 'location'].includes(event.target.name) && programme.mode !== 'published') {
        const slots = timeSlots(programme, draft.date);
        draft.time = slots.length === 1 ? slots[0] : '';
        document.querySelector('#time-field').innerHTML = timeField();
        if (event.target.name === 'date') { errors.date = dateError(programme, draft.date) || (slots.length ? '' : 'No session times remain. Choose another date.'); showErrors(); }
      }
    });
    form.addEventListener('submit', event => {
      event.preventDefault(); capture(form);
      if (reviewing) {
        const completed = completeDemo(programme, draft, { bookable });
        if (completed.errors) {
          errors = completed.errors;
          step = bookable && Object.keys(errors).some(key => ['date', 'time', 'location', 'sessionId'].includes(key)) ? 0 : bookable ? 1 : 0;
          renderFlow(); focusError(); return;
        }
        result = completed;
      } else {
        errors = bookable && step === 0 ? validateSchedule(programme, draft) : validateDetails(programme, draft, bookable);
        if (Object.keys(errors).length) { showErrors(); focusError(); return; }
        step++;
      }
      renderFlow(true);
    });
    form.querySelector('[data-back]')?.addEventListener('click', () => { capture(form); step--; errors = {}; renderFlow(true); });
  }
  if (result?.session) {
    document.querySelector('#download-calendar').addEventListener('click', () => { document.querySelector('#calendar-status').textContent = 'Calendar download started. Open the file to save your event.'; });
    document.querySelector('#google-calendar').addEventListener('click', () => { document.querySelector('#calendar-status').textContent = 'Finish saving in Google Calendar and check your reminders.'; });
    document.querySelector('#copy-details').addEventListener('click', async () => {
      const s = result.session;
      const text = `DEMO — ${programme.title}\n${formatDate(s.start)}, ${formatTime(s.start)}–${formatTime(s.end)} EAT (UTC+3)\nProjekt Inspire STEM Park, ${s.location}\nPreview only. No place reserved.`;
      try { await navigator.clipboard.writeText(text); document.querySelector('#calendar-status').textContent = 'Event details copied.'; }
      catch { document.querySelector('#copy-fallback').innerHTML = `<label for="event-copy">Select and copy these details</label><textarea id="event-copy" readonly rows="5">${escape(text)}</textarea>`; document.querySelector('#event-copy').select(); }
    });
  }
  if (focus) document.querySelector('#step-title').focus();
}
function capture(form) {
  const values = new FormData(form);
  for (const [key, value] of values) if (key !== 'ages') draft[key] = String(value).trim();
  if (form.querySelector('[name="ages"]')) draft.ages = values.getAll('ages');
}
function showErrors() {
  document.querySelectorAll('.field-error').forEach(element => {
    const name = element.id.slice(6);
    element.textContent = errors[name] || ''; element.hidden = !errors[name];
    document.querySelectorAll(`[name="${name}"]`).forEach(input => input.setAttribute('aria-invalid', errors[name] ? 'true' : 'false'));
  });
}
function focusError() {
  const key = Object.keys(errors).find(key => errors[key]);
  if (key) document.querySelector(`[name="${key}"]`)?.focus();
}
window.addEventListener('pagehide', () => { if (blobUrl) { URL.revokeObjectURL(blobUrl); blobUrl = null; } });
window.addEventListener('pageshow', event => { if (event.persisted && result) renderFlow(); });
if (programme) renderFlow(); else catalogue();
