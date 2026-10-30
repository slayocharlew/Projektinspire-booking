import { readFile, writeFile } from 'node:fs/promises';
import { FORMS, optionsFor } from '../public/assets/form-schema.js';
const url = new URL('../BOOKING-BACKEND-HANDOFF.md', import.meta.url);
const marker = '<!-- GENERATED FIELDS -->';
const original = await readFile(url, 'utf8');
const escape = value => String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
let out = '';
for (const form of Object.values(FORMS)) {
  out += `\n### ${form.id} — version ${form.version}\n\n`;
  for (const section of form.sections) {
    out += `\n**${section.title}**\n\n| Path | Type / limits | Required / condition | Allowed values / source |\n| --- | --- | --- | --- |\n`;
    const walk = (fields, prefix = '', conditions = []) => {
      for (const field of fields) {
        const conditionsHere = [...conditions, ...(field.when ? [`${field.when.path.startsWith('$') ? prefix + field.when.path.slice(1) : prefix && !field.when.path.includes('.') ? prefix + field.when.path : field.when.path} includes/is ${field.when.values.join(' or ')}`] : [])];
        if (field.type === 'group') { walk(field.fields, prefix, conditionsHere); continue; }
        const path = prefix + field.key;
        const limits = field.type === 'number' || field.type === 'repeat' ? `${field.min}–${field.max}` : ['text', 'textarea', 'email', 'tel'].includes(field.type) ? `≤${field.maxLength} characters` : field.type === 'file' ? '1 file, 1 byte–5 MiB; manifest + multipart teacherList' : field.type === 'date' ? `${field.past ? 'not future' : 'today + ' + (field.leadDays || 0) + ' days or later'}${field.weekday === 6 ? '; Saturdays only' : ''}` : '';
        let source = optionsFor(field).map(o => `${o.value} (${o.label})`).join('; ');
        if (field.source) source = field.source === 'packages' ? 'config.packages[].id' : 'config.allowedSessionTypes intersected with ' + source;
        if (field.type === 'session') source = 'Eligible published programme.sessions[].id';
        if (field.type === 'location') source = 'Active programme.locations[].id (string)';
        if (field.type === 'derivedGroup') source = '4–6; 7–14 (derived from DOB at first session)';
        if (field.type === 'derivedAge') source = '4–14; recompute from DOB at first session';
        if (field.type === 'policies') source = 'Object: config.agreements[].id → true';
        if (field.type === 'file') source = '.pdf; .doc; .docx; .xls; .xlsx. Only with privateAttachments=true';
        out += `| \`${path}\` | ${escape(field.type + (limits ? '; ' + limits : ''))} | ${field.required ? 'Yes' : 'Optional'}${conditionsHere.length ? '; visible only if ' + escape(conditionsHere.join(' AND ')) : ''} | ${escape(source)} |\n`;
        if (field.type === 'repeat') walk(field.fields, path + '.*.', conditionsHere);
      }
    };
    walk(section.fields);
  }
}
await writeFile(url, original.split(marker)[0] + marker + '\n' + out);
