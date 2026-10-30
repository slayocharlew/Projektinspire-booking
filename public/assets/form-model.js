import { FORMS, optionsFor } from './form-schema.js';
import { today, addDays, validDate } from './booking.js';
import { publishedSessions, sessionOnlyProgramme } from './programmes.js';

export function getPath(object, path) { return path.split('.').reduce((value, key) => value?.[key], object); }
export function setPath(object, path, value) {
  const parts = path.split('.');
  if (parts.some(key => ['__proto__', 'prototype', 'constructor'].includes(key))) throw new Error('Invalid field');
  let target = object;
  for (let i = 0; i < parts.length - 1; i++) target = target[parts[i]] ??= /^\d+$/.test(parts[i + 1]) ? [] : {};
  target[parts.at(-1)] = value;
}
export function visible(field, draft, parent = '') {
  if (!field.when) return true;
  const { path, values } = field.when;
  const relative = path.startsWith('$') || (parent && !path.includes('.'));
  const value = getPath(draft, relative ? parent + path.replace(/^\$/, '') : path);
  return values.some(option => Array.isArray(value) ? value.includes(option) : value === option);
}
export function walkFields(form, draft, step = null) {
  const result = [];
  function walk(fields, parent, stepIndex, labels = []) {
    for (const field of fields) {
      if (!visible(field, draft, parent)) continue;
      const path = parent + field.key;
      if (field.type === 'group') walk(field.fields, parent, stepIndex, labels);
      else if (field.type === 'repeat') {
        result.push({ field, path, step: stepIndex, label: field.label });
        (getPath(draft, path) || []).forEach((item, index) => walk(field.fields, `${path}.${index}.`, stepIndex, [...labels, `${field.label} ${index + 1}`]));
      } else result.push({ field, path, step: stepIndex, label: [...labels, field.label].join(' · ') });
    }
  }
  form.sections.forEach((section, i) => { if (step === null || step === i) walk(section.fields, '', i); });
  return result;
}
export function initialAnswers(form, sessionId = '') {
  const answers = { children: [{}], teachers: [{}] };
  if (sessionId && form.id === 'holiday-camp') setPath(answers, 'camp.sessionId', sessionId);
  if (sessionId && form.id === 'teacher-training') { setPath(answers, 'training.registrationType', 'individual'); setPath(answers, 'training.sessionId', sessionId); }
  return answers;
}
export function fieldOptions(field, context) {
  if (field.type === 'session') return publishedSessions(context.programme).map(s => ({ value: String(s.id), label: `${s.title} · ${s.start.slice(0, 10)} · ${s.location}${s.shift ? ' · ' + s.shift : ''}` }));
  if (field.type === 'location') return (context.programme.locations || []).map(l => ({ value: String(l.id), label: l.name }));
  if (field.source === 'packages') return (context.config.packages || []).map(p => ({ value: p.id, label: p.label }));
  if (field.source === 'privateTypes') return optionsFor(field).filter(o => (context.config.allowedSessionTypes || ['individual']).includes(o.value));
  if (field.key === 'training.listMode') return optionsFor(field).filter(o => o.value !== 'upload' || context.config.privateAttachments === true);
  return optionsFor(field);
}
export function ageAt(birthDate, onDate) {
  if (!validDate(birthDate) || !validDate(onDate) || birthDate > onDate) return null;
  return Number(onDate.slice(0, 4)) - Number(birthDate.slice(0, 4)) - (onDate.slice(5) < birthDate.slice(5) ? 1 : 0);
}
export function fieldValue(item, draft, context) {
  if (!['derivedAge', 'derivedGroup'].includes(item.field.type)) return getPath(draft, item.path);
  const parent = item.path.split('.').slice(0, -1).join('.');
  const start = context.form.id === 'saturday' ? getPath(draft, parent + '.startDate') : (context.programme.sessions || []).find(s => String(s.id) === draft.camp?.sessionId)?.start?.slice(0, 10);
  const age = ageAt(getPath(draft, parent + '.birthDate'), start);
  return item.field.type === 'derivedAge' ? age : age >= 4 && age <= 6 ? '4–6' : age >= 7 && age <= 14 ? '7–14' : '';
}
export function validateForm(form, draft, context, step = null, now = new Date()) {
  const errors = {};
  for (const item of walkFields(form, draft, step)) {
    const { field, path } = item;
    const value = fieldValue(item, draft, context);
    const fail = message => { errors['answers.' + path] = message; };
    if (field.type === 'repeat') { if (!Array.isArray(value) || value.length < field.min || value.length > field.max) fail(`Add between ${field.min} and ${field.max} entries.`); continue; }
    if (field.type === 'policies') {
      for (const policy of context.config.agreements || []) if (draft.policyAcceptances?.[policy.id] !== true) errors[`answers.policyAcceptances.${policy.id}`] = 'Please read and accept this agreement.';
      continue;
    }
    if (value === undefined || value === null || (typeof value === 'string' && !value.trim()) || (Array.isArray(value) && !value.length)) { if (field.required) fail('Please complete this field.'); continue; }
    if (field.type === 'agreement') { if (value !== true) fail('Please accept this agreement.'); continue; }
    if (['derivedAge', 'derivedGroup'].includes(field.type)) { if (field.type === 'derivedAge' && (value < 4 || value > 14)) fail('This programme is for ages 4–6 and 7–14 at the first session.'); continue; }
    if (field.type === 'file') {
      if (!(value instanceof Blob) || !/\.(pdf|docx?|xlsx?)$/i.test(value.name || '') || value.size === 0 || value.size > 5 * 1024 * 1024) fail('Choose a PDF, Word or Excel file, up to 5 MB.');
      continue;
    }
    if (typeof value === 'string' && value.length > field.maxLength) fail(`Use at most ${field.maxLength} characters.`);
    if (['select', 'session', 'location', 'multi'].includes(field.type)) {
      const allowed = fieldOptions(field, context).map(o => o.value);
      const selected = field.type === 'multi' ? value : [value];
      if (!Array.isArray(selected) || selected.some(v => !allowed.includes(v)) || new Set(selected).size !== selected.length) fail('Choose an available option.');
    }
    if (field.type === 'number' && (!Number.isInteger(Number(value)) || Number(value) < field.min || Number(value) > field.max)) fail(`Enter a whole number from ${field.min} to ${field.max}.`);
    if (field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) fail('Enter a valid email address.');
    if (field.type === 'tel' && !/^\+?\d{7,15}$/.test(String(value).replace(/[\s().-]/g, ''))) fail('Enter a valid phone number, including country code.');
    if (field.type === 'date') {
      if (!validDate(value)) fail('Enter a valid date.');
      else if (field.future && value < addDays(today(now), field.leadDays || 0)) fail(field.leadDays ? `Choose a date at least ${field.leadDays} days from today.` : 'Choose today or a future date.');
      else if (field.past && value > today(now)) fail('Date of birth cannot be in the future.');
      else if (field.weekday !== undefined && new Date(value + 'T12:00:00Z').getUTCDay() !== field.weekday) fail('Choose a Saturday. Availability will be checked before booking.');
    }
  }
  const active = new Set(walkFields(form, draft, step).map(i => i.path));
  if (active.has('family.total') && Number(draft.family?.total) !== Number(draft.family?.adults) + Number(draft.family?.children)) errors['answers.family.total'] = 'Total must equal adults plus children.';
  if (active.has('family.ages') && Number(draft.family?.children) > 0 && !draft.family?.ages?.trim()) errors['answers.family.ages'] = 'Enter the children’s ages.';
  if (active.has('teachers') && draft.teachers?.length > Number(draft.training?.teacherCount)) errors['answers.teachers'] = 'The teacher list exceeds the number attending.';
  if (active.has('logistics.transport') && draft.logistics?.transport === 'independent' && draft.children?.some(c => !/^form[1-4]$/.test(c.classLevel))) errors['answers.logistics.transport'] = 'Independent travel is only available to secondary students.';
  if (active.has('party.inclusions') && draft.party?.inclusions?.includes('activities-only') && draft.party.inclusions.some(v => ['all', 'cake', 'snacks'].includes(v))) errors['answers.party.inclusions'] = 'Choose either activities only or the food package options.';
  return errors;
}
export function cleanAnswers(form, draft, context) {
  const answers = {};
  for (const item of walkFields(form, draft)) {
    const { field, path } = item;
    if (['repeat', 'file'].includes(field.type)) continue;
    if (field.type === 'policies') { for (const policy of context.config.agreements || []) setPath(answers, `policyAcceptances.${policy.id}`, draft.policyAcceptances?.[policy.id] === true); continue; }
    let value = fieldValue(item, draft, context);
    if (value === undefined || value === null || value === '') continue;
    if (field.type === 'number') value = Number(value);
    if (typeof value === 'string') value = value.trim();
    setPath(answers, path, value);
  }
  return answers;
}
export function quoteSelection(form, answers) {
  if (form.id === 'holiday-camp') return { sessionId: answers.camp.sessionId, children: answers.children.map(c => ({ ageGroup: c.ageGroup })) };
  if (form.id === 'saturday') return { locationId: answers.locationId, children: answers.children.map(c => ({ packageId: c.packageId, startDate: c.startDate, ageGroup: c.ageGroup })) };
  return null;
}
export function safePolicyUrl(value, origin) {
  try { const url = new URL(value); return url.origin === origin && ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null; } catch { return null; }
}
export function formReady(programme, config, origin) {
  const form = Object.hasOwn(FORMS, config?.id) ? FORMS[config.id] : null;
  if (!form || config.version !== form.version || config.enabled !== true || config.contract !== 'registrations-v1') return false;
  if (config.pricingMode !== undefined && !['staff', 'quote'].includes(config.pricingMode)) return false;
  if (!['storage', 'privacy', 'policies', 'scheduling', 'pricing'].every(key => config.readiness?.[key] === true)) return false;
  if (typeof config.policyVersion !== 'string' || !config.policyVersion.trim() || config.policyVersion.length > 100 || !safePolicyUrl(config.privacyUrl, origin) || !Array.isArray(config.agreements)) return false;
  if (config.agreements.some(a => !a || !/^[a-z][a-zA-Z0-9-]{0,49}$/.test(a.id) || ['constructor', 'prototype', '__proto__'].includes(a.id) || typeof a.label !== 'string' || !a.label.trim() || (a.url && !safePolicyUrl(a.url, origin)))) return false;
  if (new Set(config.agreements.map(a => a.id)).size !== config.agreements.length || !form.policyKeys.every(key => config.agreements.some(a => a.id === key))) return false;
  if (form.policyKeys.includes('terms') && !config.agreements.find(a => a.id === 'terms')?.url) return false;
  if (form.id === 'saturday' && (!programme.locations?.length || !Array.isArray(config.packages) || !config.packages.length || config.packages.some(p => !p || !/^[a-z0-9-]+$/.test(p.id) || typeof p.label !== 'string' || !p.label.trim() || ![1, 4, 12].includes(p.sessionCount)))) return false;
  if (form.id === 'saturday' && new Set(config.packages.map(p => p.id)).size !== config.packages.length) return false;
  if (form.id === 'private' && (!Array.isArray(config.allowedSessionTypes) || !config.allowedSessionTypes.length || config.allowedSessionTypes.some(v => !['individual', 'group', 'family', 'coaching', 'department', 'corporate', 'other'].includes(v)))) return false;
  return true;
}
export function eligibleForms(programme, origin) {
  if (sessionOnlyProgramme(programme) || ['career-guidance', 'job-shadowing'].includes(programme.id)) return [];
  return (Array.isArray(programme.bookingForms) ? programme.bookingForms : []).filter(c => formReady(programme, c, origin));
}

export function validateQuote(quote, form, selection, config, now = new Date()) {
  if (!quote?.id || !quote.pricingVersion || !(new Date(quote.expiresAt) > now) || quote.currency !== 'TZS' || !['subtotal', 'discount', 'total'].every(k => Number.isSafeInteger(quote[k]) && quote[k] >= 0) || quote.subtotal - quote.discount !== quote.total) throw new Error('The fee estimate could not be verified. Please try again.');
  if (!Array.isArray(quote.occurrences) || !quote.occurrences.length || quote.occurrences.some(o => !o || typeof o !== 'object')) throw new Error('The session dates could not be verified.');
  if (form.id === 'holiday-camp' && quote.sessionId !== selection.sessionId) throw new Error('The estimate is for a different camp. Please select your camp again.');
  for (let i = 0; i < selection.children.length; i++) {
    const dates = quote.occurrences.filter(o => o.childIndex === i);
    const expected = form.id === 'saturday' ? config.packages.find(p => p.id === selection.children[i].packageId)?.sessionCount : null;
    if (!dates.length || (expected && dates.length !== expected)) throw new Error('The package does not include all required session dates.');
    if (new Set(dates.map(o => o.start)).size !== dates.length) throw new Error('The package contains duplicate dates.');
    if (form.id === 'saturday' && (dates[0].start.slice(0, 10) !== selection.children[i].startDate || dates.some(o => String(o.locationId) !== selection.locationId || new Date(o.start).getUTCDay() !== 6))) throw new Error('The package dates or location do not match your selection.');
  }
  if (quote.occurrences.some(o => !Number.isInteger(o.childIndex) || o.childIndex < 0 || o.childIndex >= selection.children.length || !o.location || !/(Z|[+-]\d\d:\d\d)$/.test(o.start || '') || !/(Z|[+-]\d\d:\d\d)$/.test(o.end || '') || !(new Date(o.start) > now) || !(new Date(o.end) > new Date(o.start)))) throw new Error('The session dates could not be verified.');
  return quote;
}
