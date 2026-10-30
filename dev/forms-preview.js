import { FORMS } from '/assets/form-schema.js';
import { mountRegistration } from '/assets/form-ui.js';
import { previewContext, previewTransport } from '/__forms/fixtures.js';
const root = document.querySelector('#app');
const query = new URLSearchParams(location.search);
const form = Object.hasOwn(FORMS, query.get('form')) ? FORMS[query.get('form')] : null;
if (form) {
  const context = previewContext(form, location.origin);
  mountRegistration({ root, ...context, preview: true, transport: previewTransport(context, query.get('simulate') || 'success'), returnUrl: '/__forms' });
} else {
  root.innerHTML = '<section class="unavailable-programme"><h1>Booking forms preview</h1><p>Use fictional information only. This isolated preview does not contact the booking API, save registrations, upload files, take payments or send notifications.</p><div class="registration-choices">' + Object.values(FORMS).map(form => `<a class="button button-secondary" href="/__forms?form=${form.id}">${form.title}</a>`).join('') + '</div></section>';
}
