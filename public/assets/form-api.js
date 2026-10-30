import { request, ApiError } from './api.js?v=20261029a';
import { FORMS } from './form-schema.js';
import { cleanAnswers, walkFields, getPath, formReady, quoteSelection, validateQuote } from './form-model.js';

export async function registrationPayload(form, draft, context, quote = null, company = '') {
  const answers = cleanAnswers(form, draft, context);
  const attachments = [], files = [];
  for (const item of walkFields(form, draft)) {
    if (item.field.type !== 'file') continue;
    const file = getPath(draft, item.path);
    if (!(file instanceof Blob)) continue;
    const hash = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    attachments.push({ field: 'answers.' + item.path, part: 'teacherList', name: file.name, size: file.size, mime: file.type || 'application/octet-stream', sha256: [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('') });
    files.push(file);
  }
  return { data: { programmeId: context.programme.id, formId: form.id, formVersion: form.version, policyVersion: context.config.policyVersion, answers, company, ...(quote ? { quoteId: quote.id, pricingVersion: quote.pricingVersion } : {}), attachments }, files };
}

// Fixed endpoints and explicit capability check: never send rich answers to v1's
// legacy bookings/enquiries endpoint or accept arbitrary endpoint URLs from content.
export function registrationTransport(programme, config, origin) {
  const form = FORMS[config.id];
  const check = () => { if (!formReady(programme, config, origin)) throw new ApiError('This booking form is not available yet.'); };
  return {
    async quote(answers) {
      check();
      const selection = quoteSelection(form, answers);
      const quote = await request('/registration-quotes', { method: 'POST', data: { programmeId: programme.id, formId: form.id, formVersion: form.version, policyVersion: config.policyVersion, selection } });
      return validateQuote(quote, form, selection, config);
    },
    async submit(payload, key) {
      check();
      let formData;
      if (payload.files.length) {
        if (config.privateAttachments !== true) throw new ApiError('Private document upload is not available.');
        formData = new FormData(); formData.append('payload', JSON.stringify(payload.data)); formData.append('teacherList', payload.files[0]);
      }
      const receipt = await request('/registrations', { method: 'POST', data: payload.data, formData, key });
      if (!receipt?.id || receipt.formId !== form.id || receipt.formVersion !== form.version || !receipt.createdAt || !['pending', 'confirmed', 'cancelled', 'declined', 'completed'].includes(receipt.status)) throw new ApiError('We could not verify the saved booking. Retry with the same details or contact our team.');
      return receipt;
    },
  };
}
