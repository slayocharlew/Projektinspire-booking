// Served only by explicit BOOKING_FORMS_PREVIEW=1. Never a production fallback.
export function previewContext(form, origin, baseDate = new Date()) {
  const day = new Date(baseDate); day.setUTCDate(day.getUTCDate() + 14);
  while (day.getUTCDay() !== 6) day.setUTCDate(day.getUTCDate() + 1);
  const date = day.toISOString().slice(0, 10);
  const programme = { id: form.programmeIds[0] || 'teacher-training-preview', title: form.title, mode: 'published', audience: 'children', locations: [{ id: '1', name: 'Fictional STEM Park' }], sessions: [{ id: 'preview-session', title: 'Fictional published session', start: date + 'T10:00:00+03:00', end: date + 'T12:30:00+03:00', location: 'Fictional STEM Park', locationId: '1', remaining: 20, shift: 'Morning', theme: 'Example STEM theme', durationLabel: 'One example day' }] };
  const policyLabels = { deposit: 'Preview: I understand the example 50% deposit policy.', terms: 'Preview: I have read the example terms.', payment: form.id === 'saturday' ? 'Preview: payment is due before the first session.' : 'Preview: full payment is due seven days before camp.', lunch: 'Preview: lunch is not included; packed food or approved food orders would be arranged.', cancellation: 'Preview: no refund within one week of camp or during camp.' };
  const config = { id: form.id, version: form.version, enabled: true, contract: 'registrations-v1', policyVersion: 'fictional-preview-v1', readiness: { storage: true, privacy: true, policies: true, scheduling: true, pricing: true }, privacyUrl: origin + '/__forms/terms', privateAttachments: true, allowedSessionTypes: ['individual', 'group', 'family', 'coaching', 'department', 'corporate', 'other'], packages: [{ id: 'single', label: 'Single Saturday (example)', sessionCount: 1, price: 25000 }, { id: 'four', label: '4 sessions (example)', sessionCount: 4, price: 90000 }, { id: 'twelve', label: '12 sessions (example)', sessionCount: 12, price: 276000 }], agreements: form.policyKeys.map(id => ({ id, label: policyLabels[id], ...(id === 'terms' ? { url: origin + '/__forms/terms' } : {}) })) };
  return { form, programme, config };
}
export function previewTransport(context, mode = 'success') {
  return {
    async quote(answers) {
      let subtotal = 0;
      const occurrences = [];
      answers.children.forEach((child, childIndex) => {
        const pack = context.form.id === 'saturday' ? context.config.packages.find(p => p.id === child.packageId) : { price: 150000, sessionCount: 1 };
        subtotal += pack.price;
        for (let i = 0; i < pack.sessionCount; i++) {
          const first = context.form.id === 'saturday' ? child.startDate : context.programme.sessions[0].start.slice(0, 10);
          const day = new Date(first + 'T12:00:00Z'); day.setUTCDate(day.getUTCDate() + i * 7);
          const date = day.toISOString().slice(0, 10);
          occurrences.push({ childIndex, start: date + 'T10:00:00+03:00', end: date + 'T12:30:00+03:00', location: 'Fictional STEM Park', locationId: '1' });
        }
      });
      const discount = context.form.id === 'holiday-camp' && answers.children.length >= 3 ? Math.round(subtotal * 0.1) : 0;
      return { id: 'preview-quote', sessionId: answers.camp?.sessionId, pricingVersion: 'fictional-prices-v1', expiresAt: new Date(Date.now() + 900000).toISOString(), currency: 'TZS', subtotal, discount, total: subtotal - discount, occurrences };
    },
    async submit() {
      await new Promise(resolve => setTimeout(resolve, 100));
      if (mode === 'failure') throw new Error('Simulated connection failure. No booking was saved.');
      if (mode === 'validation') { const error = new Error('Simulated validation feedback.'); error.status = 422; error.errors = { [context.form.id === 'holiday-camp' ? 'answers.children.0.medical' : 'answers.contact.email']: 'Please check this field.' }; throw error; }
      return { id: 'preview-only', formId: context.form.id, formVersion: context.form.version, status: 'pending', createdAt: new Date().toISOString() };
    },
  };
}
