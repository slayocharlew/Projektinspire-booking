# Booking Forms Implementation Brief

Prepared: 28 October 2026

## Objective

Implement the programme-specific booking forms described in **BOOKING SYSTEM SPECIFICATIONS FOR PROJEKT INSPIRE services.docx**, located in this repository. Read the whole document before implementing. Follow any applicable repository instructions and preserve existing work.

The review on 28 October found wording and navigation updates, but not the detailed forms from the specification. Recheck the current files before starting, since further work may have been saved.

This is a local frontend implementation and backend coordination task. It is not permission to deploy, push changes, change live data, or redesign the main website.

## Project responsibilities

| Project | Location | Responsibility |
| --- | --- | --- |
| Booking frontend | `/Users/lwied894/Documents/GitHub/projektinspire-booking` | Public forms, conditional steps, review screens, validation feedback and API integration |
| Main website | `/Users/lwied894/Documents/GitHub/projektinspire-website` | Shared Laravel backend, database migrations, authentication, availability and booking administration |

Keep using the existing shared backend. Its local database is `projektinspire_local`. Do not create another database, introduce Supabase, or put database credentials in browser code.

You own the booking frontend. Codex working in the main website project will review and implement agreed backend changes. Read that project's integration code when needed, but do not modify its files or database without separate approval.

Useful integration references:

- Main website: `docs/booking-integration.md`
- Main website: `routes/api.php`
- Main website: `app/Http/Controllers/BookingApiController.php`
- Main website: `app/Services/BookingService.php`
- Booking frontend: `public/assets/api.js`
- Booking frontend: `public/assets/app.js`
- Booking frontend: `public/assets/booking.js`
- Booking frontend: `public/assets/programmes.js`

## 1. Implement the actual forms

Build the fields and conditional sections from the specification, not only new labels on the existing short forms.

| Programme or service | Form requirements |
| --- | --- |
| STEM Park Visits — schools | School details, contact person, preferred dates/times, student and teacher numbers, learning preferences and agreements |
| On-Site STEM Clubs | School partnership questionnaire, facilities, programme preferences, goals, budget and follow-up preferences |
| Teacher Training | Separate individual-teacher and school/group branches, training selection and optional teacher-list handling |
| Saturday Sessions | Guardian details, separate information for each child, session/package selection, emergency information and permissions |
| Daily Private Sessions | Conditional questions for individual tutoring, small groups, families, teacher coaching, school departments and corporate teams, subject to scope confirmation |
| Holiday Camps | Published camp selection, separate child details, logistics, permissions, fees and payment preferences |
| STEM-Themed Events — birthdays | Host and birthday-child details, dates, theme, package preferences and agreements |

Preserve suitable routes for non-school park visitors and non-birthday events. Do not force adults, families or other groups into a school form, or every event into a birthday form.

Keep STEM Youth Bootcamp SYBC unavailable for booking until an administrator publishes an eligible booking session. Do not invent a replacement SYBC questionnaire; the document does not specify one.

Career Guidance and Job Shadowing remain information-only unless the user explicitly approves a change.

Teacher Training must not be automatically added to the public catalogue or enabled for booking without approval. Build and test its form locally without bypassing programme approval.

## 2. Make the forms easy to use

- Use short, clearly labelled steps: contact details, programme details, participants/preferences, then review.
- Show conditional questions only when relevant. Do not submit stale answers from a branch the customer has deselected.
- Support adding multiple children without overwriting one child's answers with another's.
- Preserve answers when navigating between steps; do not persist sensitive answers in browser storage.
- Show errors beside the exact field and child. The current API helper collapses nested error names; update that handling when adding nested fields.
- Keep mobile layouts, keyboard navigation, labels and focus handling accessible.
- Distinguish a received request from a confirmed booking. Changing wording must not change the meaning of its saved status.

## 3. Preserve the connection to the main website

Keep existing programme identifiers, booking slugs and links working:

- `/book/{bookingSlug}`
- `?session={sessionId}`
- `?enquiry=1`
- `?booking=request`

Continue loading approved programmes and eligible sessions from the shared API. Do not hardcode a second production catalogue, invent available dates or assume that the public programme slug and booking slug are identical.

Preserve approval, closing-date, capacity, retry and duplicate-submission protections. An expired or unavailable session must never silently become a different booking.

## 4. Prepare the backend handoff

Create **BOOKING-BACKEND-HANDOFF.md** in this repository. This implementation brief is not a substitute for the handoff: document the actual frontend contract you implement.

For every form, include:

- Form identifier and version, mapped to the existing programme identifier.
- Exact submitted field names, data types, allowed values and limits.
- Required fields and conditional validation rules.
- Structure of nested children, teachers, permissions and attachments.
- Proposed API requests, responses and field-error examples using fictional data only.
- Existing endpoints to retain and any proposed additions, clearly marked as not yet implemented.
- Required database storage, migrations and admin display changes for the main-site Codex to implement.
- Package scheduling, prices, discounts, payments, capacity and confirmation requirements.
- Treatment of older bookings and existing API clients.
- Outstanding business decisions and the readiness conditions for enabling each form.

The existing frontend submission function and Laravel backend accept only a limited field list. Do not put all new answers into the general `message` field to bypass that limitation, or assume arbitrary added JSON will be saved.

The existing `company` field is a hidden spam trap that must remain empty. Do not reuse it for a genuine company or organisation name.

## 5. Gate incomplete integration

- Do not submit unsupported forms to the old API as though all their answers will be saved.
- Use explicitly isolated mock responses for local development and tests only. Never fall back to fake success when the real API fails.
- Keep existing working flows available. Keep new unsupported forms disabled outside the explicit local preview until the agreed backend contract is available.
- Demonstrate how backend readiness will be checked; do not silently assume support.
- Have the backend validate prices, discounts, capacity and confirmation. Client-side totals are previews, not authoritative charges.
- Selecting a payment method does not mean payment was received. Do not introduce a payment gateway without approval.
- Do not promise automatic emails, SMS, WhatsApp messages or reminders until those features are implemented and approved.

## 6. Resolve unclear business rules

Record these questions and seek confirmation before activating affected rules. Continue with unambiguous work while decisions are pending.

- Ages **3–6** in the document versus **4–6** on the website, and class options that omit younger learners.
- Whether Daily Private Sessions now includes the expanded family, group, teacher and corporate services.
- Holiday duration, including four versus eight weeks, and morning/afternoon shift selection.
- Lunch questions offering camp-provided meals versus terms saying lunch is not provided.
- The incorrect evening time written as **7:00 PM–19:00 PM**.
- Final package prices, discounts, payment instructions, terms and cancellation rules. Do not treat examples or placeholders as approved production settings.
- How Saturday packages reserve dates, handle different start dates per child, missed sessions and capacity.
- Whether unpaid registrations hold places, for how long, and what releases those places.
- Where Teacher Training should appear and who approves its publication.
- The booking notification and support email. The main website contact form currently routes to `marketing@projektinspire.co.tz`; this does not automatically decide the booking inbox.
- Whether reminders and follow-ups are staff tasks or newly approved automated features.

Do not independently rewrite the main website's programme promises to resolve these differences.

## 7. Protect personal information

- Do not put children's names, health information, contact details or teacher lists in URLs, browser storage, analytics or console logs.
- Treat document uploads as private attachments, not public image-library items. Upload handling requires backend approval, validation, limits and restricted access.
- Keep photo permissions, future-marketing permission and booking agreements separate. Preserve per-child choices where the specification requires them.
- Do not expose personal answers in public API responses.
- Document the staff access, privacy notice, consent records and retention support needed before collecting sensitive information in production.

## 8. Verify and report

Test every form type and conditional branch, multiple-child entries, review/back navigation, nested field errors, existing links, closed sessions, retry behaviour and failed submissions. Include desktop and mobile checks.

Use isolated fixtures and fake API responses for frontend tests. Do not submit test applicants into the live database. Report mocked integration separately from actual backend integration.

Finish with:

1. Forms and fields implemented.
2. Business decisions still pending.
3. The completed `BOOKING-BACKEND-HANDOFF.md` path.
4. Backend features still required before the forms can be enabled.
5. Tests run, their results and what they do not yet verify.

Work locally only. Preserve existing edits. Do not push, deploy, change live data, alter the shared backend or create a second database without approval. Review the frontend and backend together before release; deploy compatible backend support before enabling the new forms.
