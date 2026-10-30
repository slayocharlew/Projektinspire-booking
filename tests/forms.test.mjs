import test from 'node:test';
import assert from 'node:assert/strict';
import { FORMS } from '../public/assets/form-schema.js';
import { walkFields, cleanAnswers, validateForm, eligibleForms, formReady, ageAt, quoteSelection, validateQuote, getPath, setPath } from '../public/assets/form-model.js';
import { registrationPayload, registrationTransport } from '../public/assets/form-api.js';
import { request, submissionKey } from '../public/assets/api.js';
import { setProgrammes, programmes, isBookable } from '../public/assets/programmes.js';
import { previewContext, previewTransport } from '../dev/forms-fixtures.mjs';
import { validAnswers } from './form-helpers.mjs';
const origin = 'http://127.0.0.1:8010';
const contextFor = id => previewContext(FORMS[id], origin);

for (const id of Object.keys(FORMS)) test(`${id}: required fields, typed payload and versioned readiness`, async () => {
  const context = contextFor(id), draft = validAnswers(context);
  assert.deepEqual(validateForm(context.form, draft, context), {});
  assert.ok(Object.keys(validateForm(context.form, {}, context)).length > 0);
  assert.equal(formReady(context.programme, context.config, origin), true);
  const payload = await registrationPayload(context.form, draft, context);
  assert.equal(payload.data.formId, id); assert.equal(payload.data.formVersion, 1);
  assert.equal(payload.data.company, ''); assert.equal(payload.data.answers.contact.email, 'fictional@example.test');
  assert.equal(Object.hasOwn(payload.data, 'message'), false);
  assert.equal(Object.hasOwn(payload.data.answers, 'status'), false);
  for (const item of walkFields(context.form, draft)) {
    if (!item.field.required || ['repeat', 'policies', 'derivedAge', 'derivedGroup'].includes(item.field.type)) continue;
    const incomplete = structuredClone(draft); setPath(incomplete, item.path, '');
    assert.ok(validateForm(context.form, incomplete, context)['answers.' + item.path], item.path);
  }
});
for (const type of ['individual', 'group', 'family', 'coaching', 'department', 'corporate', 'other']) test(`private branch ${type} validates and omits deselected branches`, async () => {
  const context = contextFor('private');
  const draft = validAnswers(context, { private: { type } });
  assert.deepEqual(validateForm(context.form, draft, context), {});
  const clean = cleanAnswers(context.form, { ...draft, student: type === 'individual' ? draft.student : { name: 'Do not submit' }, corporate: type === 'corporate' ? draft.corporate : { organisationName: 'Do not submit' } }, context);
  if (type !== 'individual') assert.equal(clean.student, undefined);
  if (type !== 'corporate') assert.equal(clean.corporate, undefined);
  if (type === 'corporate') { const payload = await registrationPayload(context.form, draft, context); assert.equal(payload.data.company, ''); assert.ok(payload.data.answers.corporate.organisationName); }
});
for (const delivery of ['scheduled', 'custom', 'either']) for (const listMode of ['later', 'manual', 'upload']) test(`teacher school ${delivery}, list ${listMode}`, async () => {
  const context = contextFor('teacher-training');
  const draft = validAnswers(context, { training: { registrationType: 'school', delivery, listMode } });
  assert.deepEqual(validateForm(context.form, draft, context), {});
  const payload = await registrationPayload(context.form, draft, context);
  assert.equal(payload.files.length, listMode === 'upload' ? 1 : 0);
  assert.equal(payload.data.attachments.length, payload.files.length);
  assert.equal(payload.data.answers.teacher, undefined);
  assert.equal(payload.data.answers.training.sessionId !== undefined, delivery === 'scheduled');
  if (listMode === 'upload') { assert.match(payload.data.attachments[0].sha256, /^[a-f0-9]{64}$/); assert.equal(payload.data.answers.training.teacherListFile, undefined); }
});
test('multiple children retain distinct answers, age groups and permissions', () => {
  const context = contextFor('holiday-camp');
  const draft = validAnswers(context, { children: [{ name: 'Fictional One', photoPermission: 'no', hasMedical: 'no' }, { name: 'Fictional Two', photoPermission: 'internal', hasMedical: 'yes', medical: 'Fictional support note' }] });
  assert.deepEqual(validateForm(context.form, draft, context), {});
  draft.children[0].medical = 'Stale sensitive note';
  const clean = cleanAnswers(context.form, draft, context);
  assert.equal(clean.children.length, 2); assert.equal(clean.children[0].medical, undefined);
  assert.equal(clean.children[1].medical, 'Fictional support note');
  assert.equal(clean.children[0].photoPermission, 'no'); assert.equal(clean.children[1].photoPermission, 'internal');
  draft.children[1].medical = '';
  assert.ok(validateForm(context.form, draft, context)['answers.children.1.medical']);
  assert.equal(ageAt('2020-10-29', '2026-10-28'), 5); assert.equal(ageAt('2020-10-29', '2026-10-29'), 6);
});
test('camp allergies and dietary needs are answered separately for each child', async () => {
  const context = contextFor('holiday-camp');
  const draft = validAnswers(context, { children: [
    { name: 'Fictional One', hasAllergies: 'yes', allergies: 'Fictional allergy instructions', hasDietaryNeeds: 'no', hasMedical: 'no' },
    { name: 'Fictional Two', hasAllergies: 'no', hasDietaryNeeds: 'yes', dietaryNeeds: 'Fictional dietary requirements', hasMedical: 'no' },
  ] });
  assert.deepEqual(validateForm(context.form, draft, context), {});
  const { data } = await registrationPayload(context.form, draft, context);
  assert.equal(data.answers.children[0].allergies, 'Fictional allergy instructions');
  assert.equal(data.answers.children[0].dietaryNeeds, undefined);
  assert.equal(data.answers.children[1].allergies, undefined);
  assert.equal(data.answers.children[1].dietaryNeeds, 'Fictional dietary requirements');
  const reviewFields = walkFields(context.form, draft, 1);
  assert.ok(reviewFields.some(item => item.path === 'children.0.allergies' && item.label.startsWith('Child 1')));
  assert.ok(reviewFields.some(item => item.path === 'children.1.dietaryNeeds' && item.label.startsWith('Child 2')));
  assert.deepEqual(quoteSelection(context.form, data.answers), {
    sessionId: data.answers.camp.sessionId,
    children: data.answers.children.map(child => ({ ageGroup: child.ageGroup })),
  });
});
test('camp health questions require explicit answers and relevant details, including when bringing packed food', () => {
  const context = contextFor('holiday-camp');
  const draft = validAnswers(context, { logistics: { lunch: 'own' } });
  for (const [flag, details] of [['hasAllergies', 'allergies'], ['hasDietaryNeeds', 'dietaryNeeds']]) {
    const unanswered = structuredClone(draft);
    delete unanswered.children[0][flag];
    delete unanswered.children[0][details];
    assert.ok(validateForm(context.form, unanswered, context)['answers.children.0.' + flag]);
    assert.equal(walkFields(context.form, unanswered).some(item => item.path === 'children.0.' + details), false);
    for (const empty of ['', '   ']) {
      const incomplete = structuredClone(draft);
      incomplete.children[0][flag] = 'yes'; incomplete.children[0][details] = empty;
      assert.ok(validateForm(context.form, incomplete, context)['answers.children.0.' + details]);
    }
    const tooLong = structuredClone(draft);
    tooLong.children[0][details] = 'x'.repeat(2001);
    assert.ok(validateForm(context.form, tooLong, context)['answers.children.0.' + details]);
    const noNeeds = structuredClone(draft);
    noNeeds.children[0][flag] = 'no'; delete noNeeds.children[0][details];
    assert.deepEqual(validateForm(context.form, noNeeds, context), {});
  }
});
test('changing camp health answers to no omits stale details without changing another child', () => {
  const context = contextFor('holiday-camp');
  const draft = validAnswers(context, { children: [{}, {}] });
  draft.children[0].hasAllergies = 'no'; draft.children[0].hasDietaryNeeds = 'no';
  const clean = cleanAnswers(context.form, draft, context);
  assert.equal(clean.children[0].hasAllergies, 'no'); assert.equal(clean.children[0].allergies, undefined);
  assert.equal(clean.children[0].hasDietaryNeeds, 'no'); assert.equal(clean.children[0].dietaryNeeds, undefined);
  assert.equal(clean.children[1].allergies, draft.children[1].allergies);
  assert.equal(clean.children[1].dietaryNeeds, draft.children[1].dietaryNeeds);
  assert.deepEqual(validateForm(context.form, draft, context), {});
});
test('camp lunch preferences remain questions and food-order details are conditional', () => {
  const context = contextFor('holiday-camp');
  for (const lunch of ['own', 'all', 'some', 'information']) {
    const draft = validAnswers(context, { logistics: { lunch } });
    assert.deepEqual(validateForm(context.form, draft, context), {});
    assert.equal(cleanAnswers(context.form, draft, context).logistics.lunch, lunch);
  }
  const draft = validAnswers(context, { logistics: { lunch: 'some' } });
  draft.logistics.lunchDetails = '';
  assert.ok(validateForm(context.form, draft, context)['answers.logistics.lunchDetails']);
  draft.logistics.lunchDetails = 'Fictional child'; draft.logistics.lunch = 'own';
  assert.equal(cleanAnswers(context.form, draft, context).logistics.lunchDetails, undefined);
});
test('conditions remove obsolete fields and optional opt-outs are valid', () => {
  const context = contextFor('stem-club');
  const draft = validAnswers(context);
  draft.club.focus = ['other']; draft.club.focusOther = 'Fictional focus';
  assert.equal(cleanAnswers(context.form, draft, context).club.focusOther, 'Fictional focus');
  draft.club.focus = ['science'];
  assert.equal(cleanAnswers(context.form, draft, context).club.focusOther, undefined);
  for (const id of ['saturday', 'holiday-camp']) {
    const c = contextFor(id), a = validAnswers(c); a.permissions.marketing = 'no'; a.children[0].photoPermission = 'no';
    assert.deepEqual(validateForm(c.form, a, c), {});
  }
});
test('nested API errors retain the exact child path', async () => {
  await assert.rejects(request('/registrations', { fetcher: async () => new Response(JSON.stringify({ message: 'Invalid', errors: { 'answers.children.1.medical': ['Add the medical details.'], 'answers.contact.email': ['Invalid email.'] } }), { status: 422 }) }), e => e.errors['answers.children.1.medical'] === 'Add the medical details.' && !e.errors.answers);
});
test('readiness fails closed for old APIs, unapproved policies and unknown contracts', async () => {
  const c = contextFor('saturday');
  assert.deepEqual(eligibleForms(c.programme, origin), []);
  for (const patch of [{ enabled: false }, { version: 2 }, { contract: 'unknown' }, { agreements: [] }, { privacyUrl: 'https://evil.example/privacy' }, { readiness: { storage: true } }, { policyVersion: '' }]) assert.equal(formReady(c.programme, { ...c.config, ...patch }, origin), false);
  await assert.rejects(registrationTransport(c.programme, { ...c.config, enabled: false }, origin).submit({ data: {}, files: [] }, 'test'), /not available/);
  for (const malformed of [null, { id: 'constructor' }, { ...c.config, packages: 'bad' }, { ...c.config, agreements: [null] }]) assert.equal(formReady(c.programme, malformed, origin), false);
  assert.deepEqual(eligibleForms({ ...c.programme, bookingForms: 'bad' }, origin), []);
  assert.deepEqual(FORMS['teacher-training'].programmeIds, []);
});
test('published-only bootcamp and information-only programmes stay restricted', () => {
  const p = contextFor('holiday-camp').programme;
  setProgrammes([{ ...p, id: 'annual-stem-youth-bootcamp', allowEnquiry: true, sessions: [] }, { ...p, id: 'career-guidance' }, { ...p, id: 'job-shadowing' }]);
  assert.equal(programmes.length, 1); assert.equal(programmes[0].allowEnquiry, false); assert.equal(isBookable(programmes[0]), false);
  assert.equal(isBookable({ ...programmes[0], sessions: p.sessions }), true);
});
test('package quotes contain every child/date and invalid or expired totals are rejected', async () => {
  const c = contextFor('saturday');
  const a = validAnswers(c, { children: [{ packageId: 'four' }, { packageId: 'twelve' }] });
  const clean = cleanAnswers(c.form, a, c), selection = quoteSelection(c.form, clean);
  const quote = await previewTransport(c).quote(clean);
  assert.equal(validateQuote(quote, c.form, selection, c.config), quote); assert.equal(quote.occurrences.length, 16);
  for (const patch of [{ total: -1 }, { total: quote.total + 1 }, { expiresAt: '2020-01-01' }, { occurrences: quote.occurrences.slice(1) }, { occurrences: [] }]) assert.throws(() => validateQuote({ ...quote, ...patch }, c.form, selection, c.config));
});
test('camp fee preview uses fictional discounts and never marks payment received', async () => {
  const c = contextFor('holiday-camp'); const draft = validAnswers(c, { children: [{}, {}, {}] });
  const quote = await previewTransport(c).quote(cleanAnswers(c.form, draft, c));
  assert.equal(quote.subtotal, 450000); assert.equal(quote.discount, 45000); assert.equal(quote.total, 405000);
  const payload = await registrationPayload(c.form, draft, c, quote);
  assert.equal(payload.data.answers.payment.method, 'mpesa'); assert.equal(payload.data.paymentStatus, undefined); assert.equal(payload.data.total, undefined);
});
test('staff confirmation mode is explicit and submits no invented fees or quotes', async () => {
  const context = contextFor('holiday-camp'); context.config.pricingMode = 'staff';
  assert.equal(formReady(context.programme, context.config, origin), true);
  const payload = await registrationPayload(context.form, validAnswers(context), context);
  assert.equal(payload.data.quoteId, undefined); assert.equal(payload.data.pricingVersion, undefined);
  assert.equal(payload.data.total, undefined);
  assert.equal(formReady(context.programme, {...context.config, pricingMode:'unknown'}, origin), false);
});
test('unlimited published sessions accept requests without remaining-space counts', () => {
  const context = contextFor('holiday-camp');
  context.programme.registrationFormsManaged = true;
  context.programme.bookingForms = [{...context.config, pricingMode:'staff'}];
  context.programme.sessions.forEach(session => { session.capacityLimited = false; session.remaining = 0; });
  assert.equal(isBookable(context.programme), true);
  assert.equal(formReady(context.programme, context.config, origin), true);
  context.programme.sessions = [];
  assert.equal(isBookable(context.programme), false);
});
test('attachments are private multipart inputs, stale files are omitted, retry keys change with content', async () => {
  const c = contextFor('teacher-training'); const draft = validAnswers(c, { training: { registrationType: 'school', delivery: 'custom', listMode: 'upload' } });
  const first = await registrationPayload(c.form, draft, c); const keys = submissionKey(); const key = keys(first.data);
  assert.equal(keys((await registrationPayload(c.form, draft, c)).data), key);
  draft.training.teacherListFile = new File(['different'], 'teachers.pdf', { type: 'application/pdf' });
  assert.notEqual(keys((await registrationPayload(c.form, draft, c)).data), key);
  draft.training.teacherListFile = new File(['bad'], 'unsafe.exe'); assert.ok(validateForm(c.form, draft, c)['answers.training.teacherListFile']);
  draft.training.listMode = 'later'; assert.equal((await registrationPayload(c.form, draft, c)).files.length, 0);
});
