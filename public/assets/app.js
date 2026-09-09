import { programmes, setProgrammes, getProgramme, HELP_URL, isBookable, publishedSessions } from './programmes.js';
import { today, addDays, dateError, timeSlots, validateSchedule, validateDetails, scheduledSession, formatDate, formatTime } from './booking.js';
import { loadProgrammes, loadAvailability, submitRequest, submissionData, submissionKey } from './api.js';
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
app.innerHTML = '<section role="status"><h1>Finding your next experience…</h1></section>';
let catalogueError = '';
try { setProgrammes(await loadProgrammes()); } catch (error) { catalogueError = error.message; }
let programme = getProgramme(slug);
function safeImage(p) {
  try { const url = new URL(p.imageUrl); if (['http:', 'https:'].includes(url.protocol)) return url.href; } catch {}
  return `/assets/images/${p.image}.webp`;
}
function photo(p, lazy = true) {
  return `<img src="${escape(safeImage(p))}" alt="${escape(p.imageAlt)}" width="800" height="530" ${lazy ? 'loading="lazy"' : 'fetchpriority="high"'} decoding="async">`;
}
function catalogue() {
  document.title = 'Book a STEM experience | Projekt Inspire';
  app.innerHTML = `<section class="catalogue-intro" aria-labelledby="page-title"><div><p class="eyebrow">A little curiosity. Endless possibilities.</p><h1 id="page-title">Book a STEM <span>experience.</span></h1><p class="intro-copy">Choose your programme. We’ll take it from there.</p></div><div class="catalogue-count"><span class="count-dots" aria-hidden="true"><i></i><i></i><i></i></span>${programmes.length} ${programmes.length === 1 ? 'way' : 'ways'} to explore</div></section>
  <section class="programme-grid" aria-label="Our programmes">${programmes.map((p, i) => {
    const bookable = isBookable(p);
    return `<article class="programme-card tone-${p.tone}${programmes.length % 2 === 1 && i === programmes.length - 1 ? ' card-wide' : ''}"><a class="card-photo" href="/book/${encodeURIComponent(p.id)}" tabindex="-1" aria-hidden="true">${photo(p, i > 2)}<span class="category">${escape(p.category)}</span></a><div class="card-content"><h2><a href="/book/${encodeURIComponent(p.id)}">${escape(p.title)}</a></h2><p class="card-description">${escape(p.summary)}</p><div class="card-facts"><span>${icon('users')}${escape(p.facts[0])}</span><span>${icon('clock')}${escape(p.facts[1])}</span></div></div><div class="card-footer"><span class="schedule-label">${p.mode === 'published' && bookable ? 'Dates available' : escape(p.scheduleLabel)}</span><a class="card-action" href="/book/${encodeURIComponent(p.id)}" aria-label="${bookable ? 'Book' : p.allowEnquiry ? 'Enquire' : 'View details'}: ${escape(p.title)}">${bookable ? 'Book' : p.allowEnquiry ? 'Enquire' : 'View details'}${icon('arrow')}</a></div></article>`;
  }).join('') || '<p>No programmes are open here yet. Please check back soon or contact our team.</p>'}</section><div class="catalogue-help"><span>Not sure where to start?</span><a href="${HELP_URL}" target="_blank" rel="noopener">Let’s find your programme ${icon('arrow')}</a></div>`;
}

let step = 0, result, blobUrl, sending = false, availabilityBusy = false, availabilityController, availabilityVersion = 0, submissionError = '';
const keyFor = submissionKey();
const bookable = programme && isBookable(programme) && new URLSearchParams(location.search).get('enquiry') !== '1';
const draft = { locationId: programme?.locations?.length === 1 ? String(programme.locations[0].id) : '', date: '', slotId: '', consent: false, company: '', sessionId: new URLSearchParams(location.search).get('session') || '', name: '', phone: '', email: '', count: '1', ages: [], topic: '', message: '', school: '', level: '', eventType: '', preferredDate: '', venue: '', attendance: '' };
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
  if (programme.mode === 'published') return select('sessionId', 'Choose a session', publishedSessions(programme).map(s => [s.id, `${s.title} · ${formatDate(s.start)} · ${formatTime(s.start)}–${formatTime(s.end)} · ${s.location} · ${s.remaining} spaces`]));
  return `${select('locationId', 'Choose your location', programme.locations.map(l => [String(l.id), l.name]))}<div class="field-grid">${input('date', 'Choose a date', { type: 'date', min: today(), max: addDays(today(), 90) })}<div id="time-field">${timeField()}</div></div><p class="field-hint">Only times made available by our team are offered. All times are East Africa Time (UTC+3).</p>${programme.allowEnquiry ? `<a class="back-link" href="/book/${encodeURIComponent(programme.id)}?enquiry=1">Can’t find a time? Send an enquiry</a>` : ''}`;
}
function timeField() {
  const slots = timeSlots(programme, draft.date);
  return select('slotId', 'Available time', slots.map(s => [s.id, `${formatTime(s.start)}–${formatTime(s.end)} · ${s.remaining} spaces`]),
    availabilityBusy ? 'Checking availability…' : draft.date && draft.locationId ? (slots.length ? 'Choose a time' : 'No times available — choose another date') : 'Choose a date and location first');
}
async function refreshAvailability() {
  availabilityController?.abort();
  const version = ++availabilityVersion;
  programme.slots = []; draft.slotId = '';
  const error = dateError(programme, draft.date);
  if (error || !draft.locationId) {
    availabilityBusy = false;
    if (draft.date && error) errors.date = error;
    document.querySelector('#time-field').innerHTML = timeField(); showErrors(); return;
  }
  availabilityController = new AbortController(); availabilityBusy = true;
  document.querySelector('#time-field').innerHTML = timeField();
  try {
    const slots = await loadAvailability(programme.id, draft.date, draft.locationId, availabilityController.signal);
    if (version !== availabilityVersion) return;
    if (!Array.isArray(slots)) throw new Error('Availability could not be checked. Please try again.');
    programme.slots = slots;
    const available = timeSlots(programme, draft.date);
    draft.slotId = available.length === 1 ? available[0].id : '';
    errors.date = ''; errors.slotId = available.length ? '' : 'No times are available on this date.';
  } catch (error) {
    if (version !== availabilityVersion || error.name === 'AbortError') return;
    errors.slotId = error.message;
  } finally {
    if (version === availabilityVersion) { availabilityBusy = false; const field = document.querySelector('#time-field'); if (field) field.innerHTML = timeField(); showErrors(); }
  }
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
  const rows = [['Programme', programme.title], ...(session ? [['Where', session.location], ['When', formatDate(session.start)], ['Time', `${formatTime(session.start)}–${formatTime(session.end)} · EAT`]] : []), ['Name', draft.name], ['Phone', draft.phone], ...(draft.email ? [['Email', draft.email]] : []), ...(bookable ? [['Participants', draft.count], ...(draft.ages.length ? [['Age group / level', draft.ages.join(', ')]] : []), ...(draft.topic ? [['Topics', draft.topic]] : [])] : [...(draft.school ? [['School', draft.school], ['Student level', draft.level]] : []), ...(draft.eventType ? [['Event', draft.eventType], ['Preferred date', formatDate(draft.preferredDate)], ['Venue', draft.venue], ['Estimated attendance', draft.attendance]] : []), ['Your request', draft.message]])];
  return `<dl class="review-list">${rows.map(([label, value]) => `<div><dt>${label}</dt><dd>${escape(value)}</dd></div>`).join('')}</dl><label class="choice"><input type="checkbox" name="consent" ${draft.consent ? 'checked' : ''} required><span>I agree that Projekt Inspire may use these details to manage and contact me about this request. I am an adult or the participant’s parent/guardian.</span></label>${errorMarkup('consent')}<p class="field-hint">Please do not include children’s full names or sensitive personal information. Email is optional; our team can contact you by phone.</p><div hidden aria-hidden="true"><label>Company<input name="company" tabindex="-1" autocomplete="off"></label></div>`;
}
function sidebar() {
  return `<aside class="booking-summary tone-${programme.tone}" aria-label="Programme details"><div class="summary-photo">${photo(programme, false)}<span class="category">${escape(programme.category)}</span></div><div class="summary-body"><h2>${escape(programme.title)}</h2><p>${escape(programme.summary)}</p><div class="summary-facts"><span>${icon('users')}${escape(programme.facts[0])}</span><span>${icon('clock')}${escape(programme.facts[1])}</span><span>${icon('calendar')}${programme.mode === 'published' && bookable ? 'Published sessions' : escape(programme.scheduleLabel)}</span></div><details><summary>Good to know</summary><ul>${programme.details.map(detail => `<li>${escape(detail)}</li>`).join('')}</ul></details></div></aside>`;
}
function completion() {
  const session = result.session;
  const confirmed = result.status === 'confirmed' && session;
  if (confirmed && !blobUrl) blobUrl = URL.createObjectURL(new Blob([calendarFile(result)], { type: 'text/calendar;charset=utf-8' }));
  return `<section class="completion"><div class="complete-icon">${icon('check')}</div><p class="eyebrow">Request saved</p><h2 id="step-title" tabindex="-1">${confirmed ? 'Your booking is confirmed.' : result.status === 'pending' ? 'We’ve received your request.' : 'Request status: ' + escape(result.status)}</h2><p>${escape(result.message)}</p><p><strong>Your reference:</strong> ${escape(result.id)}</p>${session ? `<div class="event-ticket"><strong>${escape(result.title)}</strong><span>${icon('calendar')}${formatDate(session.start)}</span><span>${icon('clock')}${formatTime(session.start)}–${formatTime(session.end)} · EAT</span><span>${icon('pin')}${escape(session.location)}</span></div>` : ''}${confirmed ? `<details class="calendar-options"><summary class="button">${icon('calendar')}Add to calendar</summary><div class="calendar-menu"><a class="button button-secondary" id="google-calendar" href="${escape(googleCalendarUrl(result))}" target="_blank" rel="noopener noreferrer">Google Calendar</a><a class="button button-secondary" id="download-calendar" href="${blobUrl}" download="projekt-inspire-booking.ics">Apple / Other calendar (.ics)</a></div></details><p class="calendar-hint">This calendar copy does not update automatically if your arrangements change. Keep your booking reference.</p>` : '<p class="field-hint">Please wait for our team to confirm before making travel arrangements.</p>'}<a class="back-link completion-back" href="/programs">${icon('back')}Back to programmes</a></section>`;
}
function renderFlow(focus = false) {
  document.title = `${programme.title} | Projekt Inspire`;
  const steps = bookable ? ['Date & time', 'Your details', 'Review'] : ['Your request', 'Review'];
  const reviewing = step === steps.length - 1;
  app.innerHTML = `<div class="flow-top"><a class="back-link" href="/programs">${icon('back')}All programmes</a><span class="preview-badge">Book with us</span></div><div class="flow-heading"><p class="eyebrow">${bookable ? 'Make room for discovery' : 'Start a conversation'}</p><h1>${escape(programme.title)}</h1></div><div class="booking-layout">${sidebar()}<div class="booking-panel">${result ? completion() : `<ol class="steps" aria-label="${bookable ? 'Booking' : 'Enquiry'} steps">${steps.map((label, i) => `<li class="${i === step ? 'current' : i < step ? 'complete' : ''}" ${i === step ? 'aria-current="step"' : ''}><span>${i < step ? icon('check') : i + 1}</span>${label}</li>`).join('')}</ol><form id="booking-form" novalidate><div class="step-heading"><h2 id="step-title" tabindex="-1">${reviewing ? 'Everything look right?' : bookable && step === 0 ? 'Pick your session' : bookable ? 'A little about you' : 'Tell us what you have in mind'}</h2><p>${reviewing ? 'Check your details before sending your request.' : bookable && step === 0 ? 'Choose a date and time that work for you.' : bookable ? 'We’ll use these details for your booking.' : programme.mode === 'published' ? 'Dates are coming soon. Share your interest with us.' : 'We’ll help shape the right experience for you.'}</p></div><p class="field-error" id="submission-error" role="alert" ${submissionError ? '' : 'hidden'}>${escape(submissionError)}</p>${reviewing ? review() : bookable ? step === 0 ? scheduleFields() : contactFields() + participantFields() : enquiryFields()}<div class="form-actions">${step > 0 ? `<button type="button" class="button button-secondary" data-back>${icon('back')}Back</button>` : '<span></span>'}<button class="button" type="submit">${reviewing ? bookable ? 'Submit booking' : 'Send enquiry' : 'Continue'}${icon('arrow')}</button></div>${reviewing ? '' : '<p class="preview-caption">Your details are used to manage this request.</p>'}</form>`}</div></div>`;
  const form = document.querySelector('#booking-form');
  if (form) {
    form.addEventListener('input', () => capture(form));
    form.addEventListener('change', event => {
      capture(form);
      if (['date', 'locationId'].includes(event.target.name) && programme.mode === 'scheduled') refreshAvailability();
    });
    form.addEventListener('submit', async event => {
      event.preventDefault(); if (sending || availabilityBusy) return; capture(form); submissionError = '';
      if (reviewing) {
        if (!draft.consent) { errors.consent = 'Please agree before sending your request.'; showErrors(); return; }
        errors = { ...validateDetails(programme, draft, bookable), ...(bookable ? validateSchedule(programme, draft) : {}) };
        if (Object.keys(errors).length) {
          step = bookable && Object.keys(errors).some(key => ['date','slotId','locationId','sessionId'].includes(key)) ? 0 : bookable ? 1 : 0;
          renderFlow(); focusError(); return;
        }
        sending = true;
        form.querySelectorAll('button').forEach(button => { button.disabled = true; });
        form.querySelector('[type="submit"]').textContent = 'Sending…';
        try {
          result = await submitRequest(programme, draft, bookable, keyFor(submissionData(programme, draft, bookable)));
        } catch (error) {
          submissionError = error.message; errors = error.errors || {};
          if (error.status === 409 || error.status === 404) {
            if (bookable) {
              draft.sessionId = ''; draft.slotId = ''; programme.slots = []; step = 0;
              try {
                const fresh = await loadProgrammes(); setProgrammes(fresh);
                programme = getProgramme(slug) || { ...programme, sessions: [], locations: [] };
              } catch {}
            }
          } else if (error.status === 422 && !errors.consent) {
            step = bookable && Object.keys(errors).some(key => ['date','slotId','locationId','sessionId'].includes(key)) ? 0 : bookable ? 1 : 0;
          }
          renderFlow(); focusError(); return;
        } finally { sending = false; }
      } else {
        errors = bookable && step === 0 ? validateSchedule(programme, draft) : validateDetails(programme, draft, bookable);
        if (Object.keys(errors).length) { showErrors(); focusError(); return; }
        step++;
      }
      renderFlow(true);
    });
    form.querySelector('[data-back]')?.addEventListener('click', () => { capture(form); step--; errors = {}; renderFlow(true); });
  }
  if (focus) document.querySelector('#step-title').focus();
}
function capture(form) {
  const values = new FormData(form);
  if (form.querySelector('[name="consent"]')) draft.consent = values.has('consent');
  for (const [key, value] of values) if (!['ages', 'consent'].includes(key)) draft[key] = String(value).trim();
  if (form.querySelector('[name="ages"]')) draft.ages = values.getAll('ages');
}
function showErrors() {
  document.querySelectorAll('.field-error[id^="error-"]').forEach(element => {
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
if (catalogueError) app.innerHTML = `<section><h1>We couldn’t load the programmes.</h1><p role="alert">${escape(catalogueError)}</p><a class="button" href="${escape(location.pathname)}">Try again</a> <a href="${HELP_URL}">Contact our team</a></section>`;
else if (slug && !programme) app.innerHTML = `<section><h1>This programme isn’t available for booking.</h1><a class="button" href="/programs">View available programmes</a></section>`;
else if (programme && !bookable && !programme.allowEnquiry) app.innerHTML = `<section><h1>${escape(programme.title)}</h1><p>Bookings and enquiries are currently closed.</p><a class="button" href="/programs">View other programmes</a></section>`;
else if (programme) renderFlow(); else catalogue();
