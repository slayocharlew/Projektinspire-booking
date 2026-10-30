import { FORMS } from './form-schema.js';
import { getPath, setPath, visible, walkFields, initialAnswers, fieldOptions, fieldValue, validateForm, cleanAnswers, safePolicyUrl } from './form-model.js';
import { registrationPayload, registrationTransport } from './form-api.js';
import { submissionKey, websiteOrigin } from './api.js?v=20261029a';
import { today, addDays, formatDate, formatTime } from './booking.js';
import { calendarFile } from './calendar.js';
import { programmeInformationUrl } from './programmes.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fieldId = path => 'registration-' + path.replaceAll('.', '-');
const money = amount => new Intl.NumberFormat('en-TZ', { style: 'currency', currency: 'TZS', maximumFractionDigits: 0 }).format(amount);

export function mountRegistration({ root, programme, config, preview = false, transport, sessionId = '', returnUrl = '/programs' }) {
  const form = FORMS[config.id];
  const context = { form, programme, config };
  const draft = initialAnswers(form, sessionId);
  transport ||= registrationTransport(programme, config, websiteOrigin);
  let step = 0, errors = {}, message = '', busy = false, receipt, quote, attempt, company = '', calendarUrl;
  const keyFor = submissionKey();
  const reviewStep = form.sections.length;
  const errorFor = path => errors['answers.' + path];
  const errorMarkup = path => `<p class="field-error" id="error-${fieldId(path)}" ${errorFor(path) ? '' : 'hidden'}>${escape(errorFor(path))}</p>`;
  const attributes = (path, required = true) => `id="${fieldId(path)}" name="answers.${escape(path)}" ${required ? 'required' : ''} aria-describedby="error-${fieldId(path)}" ${errorFor(path) ? 'aria-invalid="true"' : ''}`;

  function renderFields(fields, parent = '') {
    return fields.map(field => {
      if (!visible(field, draft, parent)) return '';
      const path = parent + field.key;
      const value = fieldValue({ path, field }, draft, context);
      if (field.type === 'group') return renderFields(field.fields, parent);
      if (field.type === 'repeat') {
        const entries = getPath(draft, path) || [];
        return `<div class="repeat-group" id="${fieldId(path)}"><p class="field-hint">${entries.length} ${field.label.toLowerCase()} ${entries.length === 1 ? 'entry' : 'entries'}</p>${errorMarkup(path)}${entries.map((item, i) => `<fieldset class="repeat-entry"><legend>${escape(field.label)} ${i + 1}</legend>${renderFields(field.fields, `${path}.${i}.`)}${entries.length > field.min ? `<button type="button" class="button button-secondary" data-remove="${path}" data-index="${i}">Remove ${escape(field.label.toLowerCase())} ${i + 1}</button>` : ''}</fieldset>`).join('')}${entries.length < field.max ? `<button type="button" class="button button-secondary" data-add="${path}">Add another ${escape(field.label.toLowerCase())}</button>` : ''}</div>`;
      }
      if (field.type === 'policies') return context.config.agreements.map(policy => `<div class="field"><label class="choice"><input type="checkbox" ${attributes('policyAcceptances.' + policy.id)} ${draft.policyAcceptances?.[policy.id] ? 'checked' : ''}><span>${escape(policy.label)}</span></label>${policy.url ? `<a class="back-link" href="${escape(safePolicyUrl(policy.url, preview ? location.origin : websiteOrigin))}" target="_blank" rel="noopener noreferrer">Read full terms</a>` : ''}${errorMarkup('policyAcceptances.' + policy.id)}</div>`).join('');
      const label = `${escape(field.label)}${field.required ? '' : ' <span class="optional">(optional)</span>'}`;
      if (field.type === 'agreement') return `<div class="field"><label class="choice"><input type="checkbox" ${attributes(path)} ${value === true ? 'checked' : ''}><span>${label}</span></label>${errorMarkup(path)}</div>`;
      if (field.type === 'multi') return `<fieldset class="field multi-field" id="${fieldId(path)}"><legend>${label}</legend><div class="choice-grid">${fieldOptions(field, context).map((o, i) => `<label class="choice"><input type="checkbox" name="answers.${path}" id="${fieldId(path)}-${i}" value="${escape(o.value)}" ${(value || []).includes(o.value) ? 'checked' : ''} aria-describedby="error-${fieldId(path)}"><span>${escape(o.label)}</span></label>`).join('')}</div>${errorMarkup(path)}</fieldset>`;
      let control;
      if (['select', 'session', 'location'].includes(field.type)) control = `<select ${attributes(path, field.required)}><option value="">Choose an option</option>${fieldOptions(field, context).map(o => `<option value="${escape(o.value)}" ${value === o.value ? 'selected' : ''}>${escape(o.label)}</option>`).join('')}</select>`;
      else if (field.type === 'textarea') control = `<textarea ${attributes(path, field.required)} rows="3" maxlength="${field.maxLength}">${escape(value)}</textarea>`;
      else if (field.type === 'file') control = `<input type="file" ${attributes(path, field.required)} accept=".pdf,.doc,.docx,.xls,.xlsx"><p class="field-hint">Private teacher list, up to 5 MB. ${value?.name ? 'Selected: ' + escape(value.name) : 'PDF, Word or Excel.'}</p>`;
      else if (['derivedAge', 'derivedGroup'].includes(field.type)) control = `<input ${attributes(path, false)} value="${escape(value)}" readonly data-derived="true" placeholder="Choose date of birth and first session">`;
      else control = `<input type="${field.type}" ${attributes(path, field.required)} value="${escape(value)}" ${field.type === 'number' ? `min="${field.min}" max="${field.max}" step="1"` : `maxlength="${field.maxLength}"`} ${field.type === 'date' ? field.past ? `max="${today()}"` : `min="${addDays(today(), field.leadDays || 0)}"` : ''} autocomplete="${path === 'contact.name' ? 'name' : path === 'contact.email' ? 'email' : path === 'contact.phone' ? 'tel' : 'off'}">`;
      if (field.type === 'date' && field.weekday === 6) {
        const current = today();
        const first = addDays(current, (6 - new Date(current + 'T12:00:00Z').getUTCDay() + 7) % 7);
        const next = addDays(first, 7);
        control = `<select data-start-date="${path}" aria-label="Quick choice for first Saturday"><option value="">Choose a specific date below</option><option value="${first}" ${value === first ? 'selected' : ''}>This Saturday · ${formatDate(first)}</option><option value="${next}" ${value === next ? 'selected' : ''}>Next Saturday · ${formatDate(next)}</option></select><p class="field-hint">Preferred date only. Availability is checked before booking.</p>` + control;
      }
      let note = '';
      if (field.type === 'session' && value) {
        const selected = context.programme.sessions?.find(s => String(s.id) === value);
        if (selected) note = `<div class="session-note"><div><strong>${escape(selected.title)}</strong><span>${formatDate(selected.start)} – ${formatDate(selected.end)} · ${formatTime(selected.start)}–${formatTime(selected.end)} EAT</span><span>${escape(selected.theme || '')}${selected.durationLabel ? ' · ' + escape(selected.durationLabel) : ''}${selected.shift ? ' · ' + escape(selected.shift) : ''}</span></div></div>`;
      }
      return `<div class="field"><label for="${fieldId(path)}">${label}</label>${control}${errorMarkup(path)}${note}</div>`;
    }).join('');
  }

  function review() {
    return form.sections.map((section, i) => `<section class="review-section"><div class="review-heading"><h3>${escape(section.title)}</h3><button class="text-button" type="button" data-edit="${i}">Edit ${escape(section.title.toLowerCase())}</button></div><dl class="review-list">${walkFields(form, draft, i).filter(item => !['repeat', 'policies'].includes(item.field.type)).map(item => {
      const value = fieldValue(item, draft, context);
      if (value === undefined || value === null || value === '' || (Array.isArray(value) && !value.length)) return '';
      const options = fieldOptions(item.field, context);
      const labelFor = v => options.find(o => o.value === v)?.label || v;
      const display = item.field.type === 'file' ? value.name : value === true ? 'Agreed' : Array.isArray(value) ? value.map(labelFor).join(', ') : labelFor(value);
      return `<div><dt>${escape(item.label)}</dt><dd>${escape(display)}</dd></div>`;
    }).join('')}${section.fields.some(f => f.type === 'policies') ? context.config.agreements.map(a => `<div><dt>${escape(a.label)}</dt><dd>Agreed</dd></div>`).join('') : ''}</dl></section>`).join('') +
      (quote ? `<section class="quote-review"><h3>${preview ? 'Example fees' : 'Fee estimate'}</h3><dl class="review-list"><div><dt>Subtotal</dt><dd>${money(quote.subtotal)}</dd></div><div><dt>Discount</dt><dd>${money(quote.discount)}</dd></div><div><dt>Total</dt><dd><strong>${money(quote.total)}</strong></dd></div></dl><p class="field-hint">Payment has not been received. ${preview ? 'These are fictional preview prices.' : 'Availability and fees are checked again when you submit.'}</p><details><summary>Review all session dates</summary><ul>${quote.occurrences.map(o => `<li>Child ${o.childIndex + 1} · ${formatDate(o.start)} · ${formatTime(o.start)}–${formatTime(o.end)} · ${escape(o.location)}</li>`).join('')}</ul></details></section>` : '') + '<div hidden aria-hidden="true"><label>Company<input name="company" tabindex="-1" autocomplete="off"></label></div>';
  }

  function completion() {
    if (!preview && receipt.status === 'confirmed' && receipt.sessions?.length && !calendarUrl) {
      try {
        const unique = [...new Map(receipt.sessions.map(s => [s.start + s.end + s.location, s])).values()];
        const calendars = unique.map((session, index) => calendarFile({ ...receipt, id: `${receipt.id}-${index}`, title: context.programme.title, session }));
        const events = calendars.map(c => c.slice(c.indexOf('BEGIN:VEVENT'), c.lastIndexOf('END:VEVENT') + 'END:VEVENT'.length)).join('\r\n');
        calendarUrl = URL.createObjectURL(new Blob(['BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Projekt Inspire//Bookings//EN\r\n' + events + '\r\nEND:VCALENDAR\r\n'], { type: 'text/calendar;charset=utf-8' }));
      } catch { /* Invalid server dates must not generate a misleading calendar. */ }
    }
    return `<section class="completion"><h2 tabindex="-1" id="registration-title">${preview ? 'Local preview completed' : receipt.status === 'confirmed' ? 'Your booking is confirmed.' : receipt.status === 'pending' ? 'Your booking has been received.' : 'Booking status: ' + escape(receipt.status)}</h2><p>${preview ? 'No booking was saved. No payment was taken and no messages were sent.' : receipt.status === 'pending' ? 'Our team will contact you to confirm the arrangements. Payment preferences do not count as payment.' : 'Keep your booking reference.'}</p>${preview ? '' : `<p>Reference: <strong>${escape(receipt.id)}</strong></p>`}${calendarUrl ? `<a class="button" href="${calendarUrl}" download="projekt-inspire-booking.ics">Add confirmed sessions to calendar</a><p class="field-hint">This calendar copy will not update if your booking changes.</p>` : ''}<a class="back-link" href="${escape(returnUrl)}">${preview ? 'Back to preview forms' : 'All programmes'}</a></section>`;
  }

  function focusError() {
    const errorKey = Object.keys(errors)[0];
    const element = root.querySelector(`[name="${CSS.escape(errorKey || '')}"]`) || (errorKey ? document.getElementById(fieldId(errorKey.replace(/^answers\./, '')))?.querySelector('input,select,button') : null);
    (element || root.querySelector('#registration-errors')).focus();
  }
  function errorStep() {
    const entries = walkFields(form, draft);
    const match = entries.find(item => Object.keys(errors).some(key => key === 'answers.' + item.path || key.startsWith('answers.' + item.path + '.')));
    return match?.step ?? step;
  }
  function render(focus = false, keepFocus = '') {
    const back = programmeInformationUrl(context.programme, websiteOrigin);
    document.title = form.title + ' | Projekt Inspire';
    root.innerHTML = `<div class="flow-top"><nav class="flow-navigation">${back && !preview ? `<a class="back-link" href="${escape(back)}">Back to programme information</a>` : ''}<a class="back-link" href="${escape(returnUrl)}">${preview ? 'All preview forms' : 'All programmes'}</a></nav></div><div class="flow-heading"><p class="eyebrow">${preview ? 'Isolated local preview · fictional details only' : 'Book your experience'}</p><h1>${escape(form.title)}</h1></div><div class="registration-layout"><div class="booking-panel">${receipt ? completion() : `<p class="registration-progress">Step ${step + 1} of ${reviewStep + 1} · ${escape(step === reviewStep ? 'Review booking' : form.sections[step].title)}</p><form id="registration-form" novalidate><div class="step-heading"><h2 id="registration-title" tabindex="-1">${escape(step === reviewStep ? 'Review your booking' : form.sections[step].title)}</h2></div><div id="registration-errors" tabindex="-1" role="alert" ${message || Object.keys(errors).length ? '' : 'hidden'}>${message ? `<p class="field-error">${escape(message)}</p>` : ''}${Object.keys(errors).length ? `<p class="field-error">Please check the highlighted fields.</p><ul>${Object.entries(errors).map(([path, value]) => `<li><a href="#${fieldId(path.replace(/^answers\./, ''))}">${escape(value)}</a></li>`).join('')}</ul>` : ''}</div>${step === reviewStep ? review() : renderFields(form.sections[step].fields)}<div class="form-actions">${step > 0 ? '<button class="button button-secondary" type="button" data-back>Back</button>' : '<span></span>'}<button class="button" type="submit">${busy ? 'Please wait…' : step === reviewStep ? preview ? 'Complete local preview' : 'Submit booking' : 'Continue'}</button></div></form>`}</div><aside class="registration-note"><p>${preview ? 'Preview only. The example schedules, fees and terms are not approved for customers.' : 'Your answers are used to arrange this booking. A submitted booking may still need staff confirmation.'}</p>${!preview ? `<a class="back-link" href="${escape(config.privacyUrl)}" target="_blank" rel="noopener noreferrer">Privacy notice</a>` : ''}<p>Times shown in East Africa Time. Your answers are held in this page only until submission; refreshing clears them.</p></aside></div>`;
    const element = root.querySelector('#registration-form');
    if (element) {
      if (busy) element.querySelectorAll('input,select,textarea,button').forEach(el => { el.disabled = true; });
      element.addEventListener('input', capture);
      element.addEventListener('change', event => {
        if (event.target.dataset.startDate) {
          const path = event.target.dataset.startDate;
          if (event.target.value) { setPath(draft, path, event.target.value); quote = null; attempt = null; }
          render(false, 'answers.' + path); return;
        }
        capture(event); if (event.target.matches('select,[type=checkbox],[type=date],[type=file]')) render(false, event.target.name);
      });
      element.addEventListener('submit', submit);
      element.querySelector('[data-back]')?.addEventListener('click', () => { step--; errors = {}; message = ''; render(true); });
      element.querySelectorAll('[data-edit]').forEach(button => button.addEventListener('click', () => { step = Number(button.dataset.edit); errors = {}; render(true); }));
      element.querySelectorAll('[data-add]').forEach(button => button.addEventListener('click', () => { const entries = getPath(draft, button.dataset.add) || []; entries.push({}); setPath(draft, button.dataset.add, entries); quote = null; attempt = null; errors = {}; render(); root.querySelectorAll('.repeat-entry input').item(root.querySelectorAll('.repeat-entry input').length - 1)?.focus(); }));
      element.querySelectorAll('[data-remove]').forEach(button => button.addEventListener('click', () => { getPath(draft, button.dataset.remove).splice(Number(button.dataset.index), 1); quote = null; attempt = null; errors = {}; render(true); }));
    }
    if (keepFocus) root.querySelector(`[name="${CSS.escape(keepFocus)}"]`)?.focus();
    else if (focus) root.querySelector('#registration-title')?.focus();
  }
  function capture(event) {
    const el = event.target;
    if (el.name === 'company') { company = el.value; attempt = null; return; }
    if (!el.name?.startsWith('answers.') || el.dataset.derived) return;
    const path = el.name.slice(8);
    const item = walkFields(form, draft).find(i => i.path === path);
    const value = el.type === 'file' ? el.files[0] : el.type === 'checkbox' ? item?.field.type === 'multi' ? [...root.querySelectorAll(`[name="${CSS.escape(el.name)}"]:checked`)].map(e => e.value) : el.checked : el.value;
    setPath(draft, path, value); delete errors[el.name]; quote = null; attempt = null;
    if (path === 'training.listMode' && value === 'manual' && !draft.teachers?.length) draft.teachers = [{}];
  }
  async function submit(event) {
    event.preventDefault(); if (busy) return;
    errors = validateForm(form, draft, context, step === reviewStep ? null : step); message = '';
    if (Object.keys(errors).length) { step = errorStep(); render(); focusError(); return; }
    if (step < reviewStep - 1) { step++; render(true); return; }
    busy = true; render();
    try {
      if (form.quote && config.pricingMode !== 'staff' && !attempt && (!quote || new Date(quote.expiresAt) <= new Date())) {
        quote = await transport.quote(cleanAnswers(form, draft, context));
        step = reviewStep; busy = false; render(true); return;
      }
      if (step < reviewStep) { step++; busy = false; render(true); return; }
      // An uncertain network result may already have saved the booking. Retry
      // that exact attempt even if its quote expired; the server must deduplicate
      // before checking quote expiry. Never create a fresh booking accidentally.
      if (!attempt) {
        const payload = await registrationPayload(form, draft, context, quote, company);
        attempt = { payload, key: keyFor(payload.data) };
      }
      receipt = await transport.submit(attempt.payload, attempt.key);
    } catch (error) {
      message = error.message || 'The booking could not be saved. Please retry.'; errors = error.errors || {};
      if (error.status === 422) { attempt = null; step = errorStep(); }
      if ([404, 409].includes(error.status)) { quote = null; attempt = null; step = form.id === 'teacher-training' ? 1 : Math.min(1, reviewStep - 1); }
    } finally { busy = false; }
    render(!!receipt); if (!receipt) focusError();
  }
  if (sessionId && !fieldOptions({ type: 'session' }, context).some(o => o.value === sessionId)) message = 'The selected session is no longer available. Please choose an available session; your selection has not been replaced.';
  render();
  const cleanup = () => { if (calendarUrl) URL.revokeObjectURL(calendarUrl); calendarUrl = null; };
  window.addEventListener('pagehide', cleanup);
  window.addEventListener('pageshow', event => { if (event.persisted && receipt) render(); });
  return { destroy: cleanup };
}
