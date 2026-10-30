import { initialAnswers, walkFields, getPath, setPath, fieldOptions } from '../public/assets/form-model.js';
import { today, addDays } from '../public/assets/booking.js';
export function validAnswers(context, seed = {}) {
  const { form } = context;
  let startDate = context.programme.sessions?.[0]?.start?.slice(0, 10) || addDays(today(), 14);
  if (form.id === 'saturday') while (new Date(startDate + 'T12:00:00Z').getUTCDay() !== 6) startDate = addDays(startDate, 1);
  const draft = { ...initialAnswers(form), ...structuredClone(seed) };
  for (let pass = 0; pass < 8; pass++) {
    for (const { field, path } of walkFields(form, draft)) {
      if (getPath(draft, path) !== undefined || ['derivedAge', 'derivedGroup'].includes(field.type)) continue;
      let value;
      if (field.type === 'repeat') value = [{}];
      else if (field.type === 'policies') value = Object.fromEntries(context.config.agreements.map(a => [a.id, true]));
      else if (field.type === 'agreement') value = true;
      else if (['select', 'session', 'location'].includes(field.type)) value = fieldOptions(field, context)[0]?.value;
      else if (field.type === 'multi') value = [fieldOptions(field, context)[0]?.value];
      else if (field.type === 'date') value = field.past ? startDate.replace(/^\d{4}/, year => Number(year) - 8) : startDate;
      else if (field.type === 'tel') value = '+255700000001';
      else if (field.type === 'email') value = 'fictional@example.test';
      else if (field.type === 'number') value = Math.max(field.min, 2);
      else if (field.type === 'file') value = new File(['Fictional teacher list'], 'teachers.pdf', { type: 'application/pdf' });
      else value = 'Fictional example';
      setPath(draft, path, value);
    }
  }
  if (draft.private?.type === 'family') draft.family.total = Number(draft.family.adults) + Number(draft.family.children);
  return draft;
}
