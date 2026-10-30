# Booking forms: frontend contract and backend handoff

Prepared 29 October 2026. Contract: **registrations-v1**, form version **1**.

This documents implemented frontend code, not implemented Laravel endpoints. The shared backend and database have **not** been modified. The new forms stay inactive on normal booking pages unless an approved programme explicitly advertises the complete capability described below. Old working forms continue to use their existing endpoints. Local `/__forms` previews are isolated, do not call the API, and cannot save bookings or upload documents.

## User clarifications — 29 October 2026

These decisions supersede conflicting earlier proposals in this handoff:

- Keep the shared main-website database (`projektinspire_local` locally), existing records and administrator accounts. Do not create another booking database.
- Accept booking requests without seat reservations, capacity-based rejection, or customer-facing “Full” / “Spaces remaining” notices. Publication and application closing dates still apply. This is an agreed change for the upcoming integration, **not yet implemented** in the current frontend/backend availability checks.
- Use the administrator-set deadline for the launched programme or bootcamp/application, not a universal payment deadline or invented unpaid-booking expiry. Deadline enforcement still needs backend integration; choosing a payment method is not proof of payment.
- The user clarified that camp food questions **should remain**, especially allergies and dietary needs. This replaces the earlier request to remove meal questions. Questions do not promise food provision, inclusion in the fee, an allergy-free environment or automatic accommodation.

Implemented locally in this clarification: holiday camps now ask each child's `hasAllergies` and `hasDietaryNeeds` separately, with `allergies` / `dietaryNeeds` details required only for a “yes”. Neither answer is preselected. The questions apply even when bringing packed food and are independent of other medical conditions. Switching to “no” hides the details and omits them from review/submission without changing another child's answers. Existing lunch preferences remain requests for information or arrangements, not confirmed meal orders.

The backend must validate and save these new allowlisted fields for the correct child, show them only to authorised staff in booking administration, and apply the existing privacy/retention safeguards. Do not include them in quotes, public receipts, calendar exports, logs or notifications. No real database storage, deployment or automatic meal ordering was added by this frontend change. Form version 1 remains a pre-activation contract; do not enable it until backend support and privacy safeguards are ready.

## Ownership and mappings

| Form ID | Existing booking programme ID | Behaviour |
| --- | --- | --- |
| `school-visit` | `stem-park-visit` | School visit preferences, pending staff arrangements. A chooser preserves the existing individual/family/group flow. |
| `stem-club` | `on-site-stem-clubs` | School partnership booking, pending staff arrangements. |
| `teacher-training` | **No automatic mapping** | Individual and school branches built locally. Main-site administrator must approve a real programme, booking slug and publication before advertising this form. `teacher-training-preview` is a fixture only. |
| `saturday` | `saturday-stem-sessions` | Per-child packages and first dates; server quote must enumerate every occurrence. |
| `private` | `daily-private-sessions` | Seven conditional types built; only types explicitly approved in `allowedSessionTypes` can be offered. |
| `holiday-camp` | `holiday-camps` | Published camp/shift selection, per-child data and server quote. |
| `birthday` | `stem-themed-events` | Birthday form with a chooser preserving the existing non-birthday event flow. |

Programme IDs remain the API's booking slug, which may differ from the public programme-page slug. If an administrator changes a booking slug, advertise the capability on the new API record; the form renderer does not require a hardcoded production catalogue. Form IDs above are stable. SYBC uses the existing published-session booking flow only; no undated request or new questionnaire. Career Guidance and Job Shadowing remain information-only. The backend must enforce these restrictions independently of frontend checks and must never export unapproved programmes or sessions.

Routes retained: `/book/{bookingSlug}`, `?session={sessionId}`, `?enquiry=1`, `?booking=request`. Optional `?form={formId}` chooses an advertised ready form. `?form=standard` explicitly chooses the old flow. A requested but unsupported new form shows an unavailable screen; it is never silently posted as a legacy booking. Invalid session selections are retained as invalid and must be corrected, not replaced automatically.

## Capability advertisement — proposed, not yet implemented

Extend each eligible `GET /api/booking/v1/programmes` record with `bookingForms`. Absence means old API compatibility. The following fictional example is the actual shape consumed by `formReady()`:

```json
{
  "id": "saturday-stem-sessions",
  "bookingForms": [{
    "id": "saturday",
    "version": 1,
    "contract": "registrations-v1",
    "enabled": true,
    "readiness": {"storage": true, "privacy": true, "policies": true, "scheduling": true, "pricing": true},
    "policyVersion": "example-policy-v1",
    "privacyUrl": "https://projektinspire.co.tz/example-privacy",
    "agreements": [
      {"id": "terms", "label": "Example approved booking terms acknowledgement", "url": "https://projektinspire.co.tz/example-terms"},
      {"id": "payment", "label": "Example approved payment deadline acknowledgement"}
    ],
    "packages": [
      {"id": "single", "label": "Single Saturday", "sessionCount": 1},
      {"id": "four", "label": "Four sessions", "sessionCount": 4},
      {"id": "twelve", "label": "Twelve sessions", "sessionCount": 12}
    ]
  }]
}
```

These URLs/labels are illustrative, not published policies. `enabled` is an administrator action, separate from programme/session publication. All five readiness flags must be true, exact contract/version must match, `policyVersion` must be nonempty, and privacy/terms URLs must be HTTP(S) URLs on the API website's origin without credentials. Require HTTPS outside local development. Agreement IDs must match `[a-z][a-zA-Z0-9-]{0,49}`, be unique, have nonempty labels, and any agreement URL must pass the same origin check. The `terms` agreement must include a full-terms URL.

Required policy agreement keys per form:

| Form | Required policy keys |
| --- | --- |
| School visit | `deposit` |
| STEM club, teacher training, private | None beyond built-in accurate/contact agreements; approved privacy and policy versions are still required |
| Saturday | `terms`, `payment` |
| Holiday camp | `terms`, `payment`, `lunch`, `cancellation` |
| Birthday | `deposit`, `terms` |

`agreements` may include additional approved acknowledgements; each becomes required and is submitted as `answers.policyAcceptances.{id}: true`. Never include photo or marketing permission here: those are separate choices and refusal is valid. Preserve the accepted text/version on the booking, not just the current settings.

Private form additionally requires `allowedSessionTypes`, a nonempty subset of `individual`, `group`, `family`, `coaching`, `department`, `corporate`, `other`. Expanded types are not approved by their presence in the specification. Teacher training's upload option is hidden unless `privateAttachments: true`; keep false until private upload validation and staff access are implemented. Manual lists and providing the list later remain available.

Saturday additionally requires active `locations` and nonempty packages with safe IDs, labels and `sessionCount` of 1, 4 or 12. No browser price is authoritative. Eligible camp/training sessions use existing `id`, `title`, `start`, `end`, `location`, `locationId`, `remaining` and may additionally provide plain-text `theme`, `durationLabel`, `shift`. Publish each independently bookable shift as its own session; do not invent a second shift in the browser. No fixed camp length is assumed. Session timestamps must include offsets.

## Existing endpoints — retain

Under `/api/booking/v1`: `GET /programmes`, `GET /programmes/{bookingSlug}`, `GET /programmes/{bookingSlug}/availability`, `POST /bookings`, `POST /enquiries`. Existing payloads and receipts remain compatible. Internal legacy endpoint/kind names are retained; customer-facing wording is booking. New answers are never packed into `message` or sent to either legacy POST endpoint.

Nested Laravel validation errors now retain their exact keys. Legacy `ages.0` also gets an `ages` alias for the existing group selector; new `answers.*` paths never collapse to their root.

## New submissions — proposed, not yet implemented

`POST /api/booking/v1/registrations`, anonymous, `Accept: application/json`, no cookies, UUID `Idempotency-Key`, JSON body unless a teacher attachment is included. All normal authentication/authorization is server-side; do not accept browser claims of approval, prices, paid status or capacity.

Envelope:

| Key | Type / rule |
| --- | --- |
| `programmeId` | Existing approved booking slug, string ≤190 |
| `formId` | Exact supported form ID above, must be mapped to this programme |
| `formVersion` | Integer `1` |
| `policyVersion` | Exact current advertised policy version, string ≤100 |
| `answers` | Nested object; only active fields from the tables below. Reject unsupported keys and inactive branch answers. |
| `company` | Hidden spam trap, always empty string; never the organisation name |
| `quoteId` | Required for Saturday/camp, opaque server quote ID, string ≤190 |
| `pricingVersion` | Required with quote; exact server quote version, string ≤100 |
| `attachments` | Empty array, or one manifest for the teacher-upload branch |

Example, using fictional data and an abbreviated club `answers` object for readability (the full field table remains required):

```json
{
  "programmeId": "on-site-stem-clubs", "formId": "stem-club", "formVersion": 1,
  "policyVersion": "example-policy-v1", "company": "", "attachments": [],
  "answers": {
    "contact": {"name": "Fictional Coordinator", "position": "Teacher", "phone": "+255700000001", "email": "coordinator@example.test"},
    "school": {"name": "Fictional School", "type": "primary", "address": "Example Road", "region": "Example Region", "phone": "+255700000002", "email": "school@example.test"},
    "agreements": {"accurate": true, "contact": true, "authority": true}
  }
}
```

Successful response: HTTP 201, `{ "data": { "id": "opaque-reference", "formId": "stem-club", "formVersion": 1, "status": "pending", "createdAt": "2026-11-01T10:00:00+03:00", "sessions": [] } }`. Status can be `pending`, `confirmed`, `cancelled`, `declined`, `completed` on a retry of an older booking. Do not return names, contact details, health information, teacher lists or attachment URLs. A response missing the matching form/version/reference/status is an error, never success. `pending` means received, not confirmed or paid. On confirmation, `sessions` may contain confirmed timestamp/location snapshots for calendar export; never include participant information. Calendar files deduplicate identical sessions and are static copies.

Errors: 422 field validation, 404 withdrawn/unapproved programme, 409 changed availability/policy/quote or idempotency conflict, 429 rate limit, 5xx temporary failure. Exact nested example:

```json
{
  "message": "Please check your details.",
  "errors": {
    "answers.children.1.medical": ["Describe the medical support needed."],
    "answers.contact.email": ["Enter a valid email address."],
    "answers.policyAcceptances.payment": ["Accept the current payment terms."]
  }
}
```

The UI returns to the relevant step and focuses the field. Unmapped/general errors remain visible in an alert. Existing answers remain only in page memory on failure. Duplicate clicks are blocked. Identical payload/file contents reuse the same key after network failure; edited data gets a new key. An uncertain submission retains its exact payload/key even after quote expiry: **deduplicate an existing attempt before validating quote expiry**, so a lost response cannot create a second booking. If no booking was saved and the quote expired, return 409 and require a refreshed quote/review. Backend must hash canonical JSON plus actual verified attachment hashes and atomically return the original receipt for a retry. Keep rate limits/CORS and request-size limits. Never log request bodies.

## Package / camp quote — proposed, not yet implemented

`POST /api/booking/v1/registration-quotes` accepts `{programmeId,formId,formVersion,policyVersion,selection}`. Only Saturday and camp call it, before review. Quotes are estimates, not payment or capacity holds. Rate-limit and return no personal details. No names/DOB/medical data are sent to this endpoint.

Saturday's “this Saturday” / “next Saturday” shortcuts fill a visible preferred date; they do not claim availability. Only the resolved `startDate` is submitted, so a relative label cannot change a previously selected booking date. Each child can choose a different package/start date. Saturday selection example:

```json
{"locationId":"1","children":[{"packageId":"four","startDate":"2026-11-14","ageGroup":"7–14"},{"packageId":"single","startDate":"2026-11-21","ageGroup":"4–6"}]}
```

Camp selection example: `{"sessionId":"42","children":[{"ageGroup":"4–6"},{"ageGroup":"7–14"}]}`.

Response `data`: `id` (opaque), `pricingVersion`, `expiresAt` (offset timestamp), `currency: "TZS"`, integer `subtotal`, `discount`, `total` in whole TZS, and `occurrences: [{childIndex:0, start:"2026-11-14T10:00:00+03:00", end:"2026-11-14T12:30:00+03:00", locationId:"1", location:"Example STEM Park"}]`. Camp also returns the exact selected `sessionId`. Saturday must enumerate exactly 1/4/12 dates per child, beginning on that child's requested date, all Saturdays at the selected location. Camp enumerates all dates for every child in the selected session/shift, including multi-day camps. No silent substitute dates. Unavailable requested dates should return 409/422 so the customer explicitly chooses again.

Bind each quote to programme/form/version/policy, exact selection, pricing rules, dates and expiry. Reject negative/inconsistent totals, duplicate or missing occurrences, mismatched selection, expired quotes and stale prices. Recompute ages from DOB at the first booked date and validate the quote's age groups on final submission. Do not trust derived ages/group values. On expired quote the frontend fetches a fresh estimate and requires another review/submit, never silently accepts a changed fee.

In one final transaction, recheck every occurrence's publication, opening/closing dates, active location, blocks, age-specific capacity and package rules. Reserve all occurrences or none. Lock consistently across booking and administrative edits. Private, club, school visit and birthday preferred dates are requests; they do not reserve arbitrary calendar slots or staff. Training published-session capacity must likewise be checked and reserved using one participant for an individual or the actual school teacher count; custom/either arrangements remain pending without invented capacity holds.

## Private teacher-list attachments

Only `answers.training.registrationType=school` and `answers.training.listMode=upload`, with `privateAttachments: true`. One file, nonempty, at most 5 MiB, extensions PDF/Word/Excel (`.pdf`, `.doc`, `.docx`, `.xls`, `.xlsx`). Browser validation is advisory; backend must verify MIME/signature, size, safe parsing/scan, filename sanitization and ownership. Reject executables, macro-enabled alternatives, malicious archives and excess parts. Confirm final file types/limits operationally before advertising support.

Submit multipart fields `payload` (the envelope JSON string) and `teacherList` (file). JSON `attachments` contains one object: `{field:"answers.training.teacherListFile",part:"teacherList",name:"fictional-teachers.pdf",size:123,mime:"application/pdf",sha256:"64-lowercase-hex-characters"}`. Verify hash against bytes; the browser hash is not proof of safety. The file itself is omitted from `answers`. No separate upload endpoint or public media-library operation is used. Validate and persist attachment plus booking atomically, with cleanup on rollback and idempotent retries. Store privately, inaccessible through public URLs; download only through administrator authorization. Do not return the attachment in the public receipt. Manual list is `answers.teachers: [{name,subject}]`, 1–100 entries and no more than teacherCount. Providing the list later is valid.

## Storage, administration and existing data

- Migrations belong exclusively in the main project. Keep the existing booking reference, programme relationship, audit and idempotency foundations. Add form ID/version, policy/pricing snapshots, immutable submitted structured answers, separate quote/price data and payment status. Add participant/occurrence records or equivalent relations for independent child packages and multi-day reservations. Add private attachment records and quote storage with expiry/binding. Avoid treating the current single `starts_at`/`ends_at` and participant count as a complete package reservation.
- Explicitly validate allowlisted answers by form version and active branch. Default string limits, arrays and exact enum values are listed below. Reject unsupported fields; do not silently drop new data. Genuine organisation names use `contact.organisation`, `school.name`, `corporate.organisationName`; `company` stays the spam trap.
- Admin detail views must group answers by form section and child/teacher, show arrangements and every reserved occurrence, display separate photo/marketing choices, actual payment state and private attachments. Existing administrator-only access remains required. Do not expose sensitive details to public catalogue/session/receipt endpoints, general content editors, exports without authorization or logs.
- Add auditable staff confirmation/decline/cancellation/payment actions and controlled rescheduling across every occurrence. Selecting a payment method never sets `paid`. Record payment verification separately; no payment gateway is implemented here. Do not auto-confirm packages merely because one occurrence allows it.
- Store privacy notice, policy text/version, photo/marketing choices and their timestamps as evidence. Set retention/deletion rules for children, health notes, teacher lists, quote records and orphan uploads; support restricted export and deletion. Sensitive collection cannot be enabled until access and retention safeguards are approved. No sensitive browser storage, URL parameters, console logging or analytics are introduced.
- Old bookings retain their old schema and display. Do not rewrite historical consent or interpret missing new fields as rejection/consent. Keep legacy API clients supported through an explicit transition; their simple single-session booking behaviour must remain truthful. Enabling rich forms does not authorize the old endpoint to claim package/medical support. Decide when legacy submissions for a migrated programme should remain accepted versus return an actionable upgrade-required error.

## Business decisions and activation blockers

Already resolved by the user: younger age group is **4–6**, older **7–14**, not the document's 3–6. Frontend derives age/group from DOB at the selected first session. Younger class choices (pre-primary and Standards 1–3), equivalent curricula and birthday budget-as-explicit-amount are proposed UI accommodations; get policy approval before activation.

Still awaiting confirmation:

1. Expanded private services versus current one-to-one offer. All branches are testable locally; `allowedSessionTypes` controls publication. Document also includes adult/A-level tutoring class options, while current one-to-one age validation is 4–14; decide whether those classes/types should be offered and change validation with an explicit contract revision if needed.
2. Camp durations (four vs eight weeks), actual dates, shift mapping and approved camp fees. No date, duration or shift is fabricated in production.
3. Camp food questions are approved (see the clarification above); meal provision and any meal charges are not. Frontend records packed-food / food-order interest and each child's allergies/dietary needs without promising provision or charging for meals. The quoted camp subtotal covers the camp package only. Any later meal offering or price needs explicit approval.
4. Invalid evening `7:00 PM–19:00 PM` omitted. Confirm any evening hours before adding them. Private first-date preference currently follows the document's seven-day lead; “within a week” is a requested urgency, not a guaranteed appointment.
5. Final package prices, discounts, currency rules, payment instructions/deadlines, deposit percentages, full terms and cancellation policy. Example Saturday 25,000/90,000/276,000 and camp 150,000 with 10% for 3+ children exist **only in dev fixtures**. No bank/mobile-payment account from the DOCX is published. Birthday's malformed upper budget range is replaced by an explicit budget amount, subject to approval.
6. Saturday date rules: consecutive available Saturdays or calendar-month/term rules, closures, missed sessions, make-ups, differing starts per child, partial cancellations, and capacity by age/shift. Browser requests package + first date per child; only server-approved complete date sets can be reviewed and submitted.
7. Whether unpaid bookings hold places, duration/expiry, release/refund rules and staff actions. Legacy pending bookings currently hold capacity without automatic expiry; this is not silently changed. New rich booking hold behaviour must be agreed and enforced server-side.
8. Teacher Training programme placement and publishing authority. It is not automatically added or enabled.
9. Booking support/notification inbox. `marketing@projektinspire.co.tz` for the main contact form does not settle this. No new recipient or automated message is implemented.
10. Follow-up response times/reminders: staff tasks versus approved automation. UI requests preferred timing but does not promise 24/48-hour responses, automatic emails/SMS/WhatsApp or payment reminders. Confirmed calendar exports remain user-initiated, static copies.
11. Final privacy notice, consent wording, retention, attachment access/scan policy and practical maxima (10 children, 100 teachers). These frontend limits bound implementation, not approved business capacity.

Readiness sequence: agree decisions → main-site Codex implements/validates backend storage, quote/registration endpoints and admin/privacy controls → test backend and frontend together with isolated data → administrator approves programme/form/session/policy settings → compatible backend deploys first → enable forms. This change authorizes no deployment, push, live data changes or main-website edits.

## Local verification and preview

`BOOKING_FORMS_PREVIEW=1 npm start`, then `http://127.0.0.1:8010/__forms`. It is loopback-only and the preview route returns 404 without that environment flag. Preview assets live in `dev/`, outside the deployable `public/` tree. Query `?form=holiday-camp&simulate=validation` or `?form=private&simulate=failure` demonstrates exact errors/failure without network calls. No fallback activates these fixtures on a failed real API request.

`npm test` validates required/conditional fields, all private and teacher branches, multiple children, opt-outs, age calculations, readiness gates, quote structure, nested errors, attachment hashing and stale-field exclusion. `npm run test:browser` uses an isolated fake API and local preview with Chrome CDP; checks old flows plus new forms at 1440/390/320 px, review/back navigation, branches, uploads in memory, exact error focus, failures and absence of preview API writes. Screenshots are written under `/private/tmp/inspire-booking-integration-checks`.

These are frontend/mock tests, not proof of actual Laravel persistence, migrations, transactional capacity, attachment security, payment operations, delivery of notifications or production readiness. Those remain main-site integration work.

Verification on 29 October 2026: **49/49 unit tests passed**, browser suite passed at desktop and phone widths (1440/390/320 px for detailed forms), and `git diff --check` passed. The browser run also exercised the actual frontend registration transport against a fake capable API, nested server errors, duplicate clicks, a lost saved-response retry after quote expiry, closed camps, and 404 responses for all preview routes when disabled. Ten fake API submissions were held in the test process only; there were no real database submissions. Main-site working files were unchanged.

Follow-up verification after the camp allergy/dietary clarification: **53/53 unit tests passed**, including independent child answers, explicit yes/no choices, required/length-limited details, whitespace rejection, stale-detail omission, lunch preferences and health-data exclusion from quote requests. The isolated browser suite also passed at 1440/390/320 px, including reviewing/editing the new questions, hiding details after “no”, preserving the second child's answers and checking mobile layout. The main-site handoff was updated; Laravel code and both real databases remain untouched. Capacity/deadline changes described above are still pending, not proven by these tests.

## Exact field reference

The following tables are generated from `public/assets/form-schema.js` by `node scripts/document-form-contract.mjs`. All paths are beneath **`answers`** unless stated otherwise. Types: text/email/tel/textarea/date/select are strings, number/derivedAge are integers, multi is a distinct array of enum strings, agreement is boolean true, repeat is an array of objects, derivedGroup is `4–6` or `7–14`. Empty optional strings are omitted. Optional choice arrays may be empty. Required multi choices need at least one selection; maximum is the number of listed options. Unknown/inactive fields are omitted by the frontend and must be rejected by the backend. Conditions on repeated children refer to that same child, never another child. Dates are `YYYY-MM-DD`; date preferences must be today or later unless a longer lead is specified. DOB cannot be in the future. Phone normalization accepts + and 7–15 digits with common spaces/punctuation; validate emails server-side. Derived age/group fields must be recomputed server-side. Per-child names/health/permissions are separate fields, not the general message.

<!-- GENERATED FIELDS -->

### school-visit — version 1


**School & contact**

| Path | Type / limits | Required / condition | Allowed values / source |
| --- | --- | --- | --- |
| `school.name` | text; ≤160 characters | Yes |  |
| `school.type` | select | Yes | primary (Primary); secondary (Secondary); both (Primary and secondary) |
| `school.region` | text; ≤160 characters | Yes |  |
| `school.phone` | tel; ≤30 characters | Yes |  |
| `school.email` | email; ≤254 characters | Optional |  |
| `contact.name` | text; ≤160 characters | Yes |  |
| `contact.position` | text; ≤160 characters | Yes |  |
| `contact.phone` | tel; ≤30 characters | Yes |  |
| `contact.whatsapp` | tel; ≤30 characters | Optional |  |
| `contact.email` | email; ≤254 characters | Yes |  |

**Visit details**

| Path | Type / limits | Required / condition | Allowed values / source |
| --- | --- | --- | --- |
| `visit.firstDate` | date; today + 0 days or later | Yes |  |
| `visit.secondDate` | date; today + 0 days or later | Optional |  |
| `visit.students` | number; 1–10000 | Yes |  |
| `visit.classLevel` | select | Yes | preschool (Pre-primary); std1 (Standard 1); std2 (Standard 2); std3 (Standard 3); std4 (Standard 4); std5 (Standard 5); std6 (Standard 6); std7 (Standard 7); form1 (Form 1); form2 (Form 2); form3 (Form 3); form4 (Form 4); equivalent (Other / equivalent class); mixed (Mixed levels) |
| `visit.classLevelOther` | text; ≤160 characters | Yes; visible only if visit.classLevel includes/is equivalent |  |
| `visit.time` | select | Yes | morning (Morning · 10:00–12:30); afternoon (Afternoon · 14:00–16:30) |
| `visit.teachers` | number; 0–10000 | Yes |  |

**Preferences**

| Path | Type / limits | Required / condition | Allowed values / source |
| --- | --- | --- | --- |
| `preferences.topics` | textarea; ≤2000 characters | Optional |  |
| `preferences.supportNeeds` | textarea; ≤2000 characters | Optional |  |
| `referral.source` | select | Yes | social (Social media); referral (Friend / family / colleague recommendation); school (School recommendation); website (Website / Google); workshop (Teacher workshop); event (Education event); previous (Previous programme / partnership); park (STEM Park visit); whatsapp (WhatsApp / SMS); email (Email); flyer (Poster / flyer); media (Radio / newspaper); corporate (Corporate network); other (Other) |
| `referral.details` | text; ≤160 characters | Optional; visible only if referral.source includes/is referral or school or other |  |
| `comments` | textarea; ≤2000 characters | Optional |  |

**Agreements**

| Path | Type / limits | Required / condition | Allowed values / source |
| --- | --- | --- | --- |
| `agreements.authority` | agreement | Yes |  |
| `agreements.accurate` | agreement | Yes |  |
| `agreements.contact` | agreement | Yes |  |
| `policyAcceptances` | policies | Yes | Object: config.agreements[].id → true |

### stem-club — version 1


**School & contact**

| Path | Type / limits | Required / condition | Allowed values / source |
| --- | --- | --- | --- |
| `school.name` | text; ≤160 characters | Yes |  |
| `school.type` | select | Yes | primary (Primary); secondary (Secondary); both (Primary and secondary) |
| `school.address` | text; ≤160 characters | Yes |  |
| `school.region` | text; ≤160 characters | Yes |  |
| `school.phone` | tel; ≤30 characters | Yes |  |
| `school.email` | email; ≤254 characters | Yes |  |
| `contact.name` | text; ≤160 characters | Yes |  |
| `contact.position` | text; ≤160 characters | Yes |  |
| `contact.phone` | tel; ≤30 characters | Yes |  |
| `contact.whatsapp` | tel; ≤30 characters | Optional |  |
| `contact.email` | email; ≤254 characters | Yes |  |

**Programme**

| Path | Type / limits | Required / condition | Allowed values / source |
| --- | --- | --- | --- |
| `club.levels` | multi | Yes | preschool (Pre-primary); std1 (Standard 1); std2 (Standard 2); std3 (Standard 3); std4 (Standard 4); std5 (Standard 5); std6 (Standard 6); std7 (Standard 7); form1 (Form 1); form2 (Form 2); form3 (Form 3); form4 (Form 4); equivalent (Other / equivalent class) |
| `club.students` | number; 1–10000 | Yes |  |
| `club.days` | multi | Yes | mon (Monday); tue (Tuesday); wed (Wednesday); thu (Thursday); fri (Friday); sat (Saturday) |
| `club.time` | select | Yes | before (Before school · 07:00–08:00); lunch (Lunch break); after (After school · 15:00–17:00); saturday (Saturday · 09:00–12:00); flexible (Flexible) |
| `club.frequency` | select | Yes | weekly (Once a week); twice-weekly (Twice a week); fortnightly (Every two weeks); monthly (Monthly); unsure (Please recommend) |
| `club.start` | select | Yes | two-weeks (Within two weeks); next-term (Next term); three-months (Within three months); exploring (Exploring options) |

**Facilities & goals**

| Path | Type / limits | Required / condition | Allowed values / source |
| --- | --- | --- | --- |
| `facilities.lab` | select | Yes | equipped (Fully equipped); basic (Basic equipment); none (No laboratory) |
| `facilities.space` | select | Yes | dedicated (Dedicated room); classroom (Classroom); hall (Multipurpose hall); limited (Limited space); none (No suitable space) |
| `club.focus` | multi | Optional | science (Science); technology (Technology); engineering (Engineering); maths (Mathematics); general (General STEM); environment (Environment); robotics (Robotics / innovation); other (Other) |
| `club.focusOther` | text; ≤160 characters | Yes; visible only if club.focus includes/is other |  |
| `background.previousClub` | select | Yes | current (Currently running); past (In the past); no (No) |
| `background.experience` | textarea; ≤2000 characters | Optional; visible only if background.previousClub includes/is current or past |  |
| `preferences.goals` | textarea; ≤2000 characters | Yes |  |
| `preferences.success` | textarea; ≤2000 characters | Optional |  |
| `preferences.questions` | textarea; ≤2000 characters | Optional |  |

**Budget & follow-up**

| Path | Type / limits | Required / condition | Allowed values / source |
| --- | --- | --- | --- |
| `decision.maker` | select | Yes | self (I do); management (Management); board (Board / governors); pta (Parent–teacher association); multiple (Multiple stakeholders); unsure (Not sure) |
| `decision.funding` | multi | Yes | school (School budget); parents (Parents); donor (Donor / sponsor); government (Government); ngo (NGO); undecided (Not determined); other (Other) |
| `decision.fundingOther` | text; ≤160 characters | Yes; visible only if decision.funding includes/is other |  |
| `decision.budget` | select | Yes | under500k (Under TZS 500,000); 500k-1m (TZS 500,000–1,000,000); 1m-2m (TZS 1,000,000–2,000,000); 2m+ (TZS 2,000,000+); quote (Need pricing first); flexible (Flexible); grant (Seeking donor/grant funding) |
| `decision.proposal` | select | Yes | management (For management); board (For board / governors); donor (For donors); no (No); unsure (Not sure) |
| `followUp.urgency` | select | Yes | 24h (Within 24 hours); 2-3days (2–3 business days); week (Within a week); two-weeks (Within two weeks); flexible (Flexible) |
| `followUp.callTime` | select | Yes | morning (Weekday morning · 08:00–11:00); afternoon (Weekday afternoon · 14:00–17:00); evening (Weekday after 17:00); saturday (Saturday morning); any (Any time); whatsapp (WhatsApp first) |
| `followUp.visit` | select | Optional | yes (Yes); maybe (After a phone call); no (Phone / WhatsApp is enough); later (Not yet) |
| `referral.source` | select | Yes | social (Social media); referral (Friend / family / colleague recommendation); school (School recommendation); website (Website / Google); workshop (Teacher workshop); event (Education event); previous (Previous programme / partnership); park (STEM Park visit); whatsapp (WhatsApp / SMS); email (Email); flyer (Poster / flyer); media (Radio / newspaper); corporate (Corporate network); other (Other) |
| `referral.details` | text; ≤160 characters | Optional; visible only if referral.source includes/is referral or school or other |  |
| `comments` | textarea; ≤2000 characters | Optional |  |

**Agreements**

| Path | Type / limits | Required / condition | Allowed values / source |
| --- | --- | --- | --- |
| `agreements.authority` | agreement | Yes |  |
| `agreements.accurate` | agreement | Yes |  |
| `agreements.contact` | agreement | Yes |  |
| `policyAcceptances` | policies | Yes | Object: config.agreements[].id → true |

### teacher-training — version 1


**Contact details**

| Path | Type / limits | Required / condition | Allowed values / source |
| --- | --- | --- | --- |
| `training.registrationType` | select | Yes | individual (Individual teacher); school (School / organisation) |
| `contact.name` | text; ≤160 characters | Yes |  |
| `contact.position` | text; ≤160 characters | Yes |  |
| `contact.phone` | tel; ≤30 characters | Yes |  |
| `contact.whatsapp` | tel; ≤30 characters | Optional |  |
| `contact.email` | email; ≤254 characters | Yes |  |
| `teacher.school` | text; ≤160 characters | Yes; visible only if training.registrationType includes/is individual |  |
| `teacher.location` | text; ≤160 characters | Yes; visible only if training.registrationType includes/is individual |  |
| `school.name` | text; ≤160 characters | Yes; visible only if training.registrationType includes/is school |  |
| `school.type` | select | Yes; visible only if training.registrationType includes/is school | primary (Primary); secondary (Secondary); both (Primary and secondary); college (Teacher training college); other (Other) |
| `school.address` | text; ≤160 characters | Yes; visible only if training.registrationType includes/is school |  |
| `school.region` | text; ≤160 characters | Yes; visible only if training.registrationType includes/is school |  |
| `school.phone` | tel; ≤30 characters | Yes; visible only if training.registrationType includes/is school |  |
| `school.email` | email; ≤254 characters | Optional; visible only if training.registrationType includes/is school |  |

**Training details**

| Path | Type / limits | Required / condition | Allowed values / source |
| --- | --- | --- | --- |
| `teacher.subjects` | multi | Yes; visible only if training.registrationType includes/is individual | science (General Science); ict (ICT); maths (Mathematics); other (Other) |
| `teacher.subjectsOther` | text; ≤160 characters | Yes; visible only if training.registrationType includes/is individual AND teacher.subjects includes/is other |  |
| `teacher.levels` | multi | Yes; visible only if training.registrationType includes/is individual | primary (Primary); form1-2 (Form 1–2); form3-4 (Form 3–4); form5-6 (Form 5–6) |
| `teacher.experience` | select | Yes; visible only if training.registrationType includes/is individual | 0-2 (0–2 years); 3-5 (3–5 years); 6-10 (6–10 years); 11-15 (11–15 years); 16-20 (16–20 years); 20+ (More than 20 years) |
| `teacher.previousDevelopment` | select | Yes; visible only if training.registrationType includes/is individual | yes (Yes); no (No) |
| `training.sessionId` | session | Yes; visible only if training.registrationType includes/is individual | Eligible published programme.sessions[].id |
| `teacher.inGroup` | select | Yes; visible only if training.registrationType includes/is individual | yes (Yes); no (No) |
| `teacher.groupContact` | text; ≤160 characters | Yes; visible only if training.registrationType includes/is individual AND teacher.inGroup includes/is yes |  |
| `training.teacherCount` | number; 1–100 | Yes; visible only if training.registrationType includes/is school |  |
| `training.delivery` | select | Yes; visible only if training.registrationType includes/is school | scheduled (Published training); custom (Custom training at school); either (Open to either) |
| `training.sessionId` | session | Yes; visible only if training.registrationType includes/is school AND training.delivery includes/is scheduled | Eligible published programme.sessions[].id |
| `training.preferredDate` | date; today + 0 days or later | Optional; visible only if training.registrationType includes/is school AND training.delivery includes/is custom or either |  |
| `training.levels` | multi | Yes; visible only if training.registrationType includes/is school | primary (Primary); form1-2 (Form 1–2); form3-4 (Form 3–4); form5-6 (Form 5–6) |
| `training.subjects` | multi | Yes; visible only if training.registrationType includes/is school | chemistry (Chemistry); physics (Physics); biology (Biology); science (General Science); maths (Mathematics); ict (ICT); integrated (Integrated STEM); other (Other) |
| `training.subjectsOther` | text; ≤160 characters | Yes; visible only if training.registrationType includes/is school AND training.subjects includes/is other |  |
| `training.previousDevelopment` | select | Yes; visible only if training.registrationType includes/is school | none (None); few (A few (1–2)); some (Some (3–5)); most (Most (6+)); all (All); unsure (Not sure) |
| `training.lab` | select | Yes; visible only if training.registrationType includes/is school | yes (Yes); no (No); basic (Basic setup) |

**Goals & logistics**

| Path | Type / limits | Required / condition | Allowed values / source |
| --- | --- | --- | --- |
| `teacher.goals` | textarea; ≤2000 characters | Yes; visible only if training.registrationType includes/is individual |  |
| `teacher.challenges` | textarea; ≤2000 characters | Yes; visible only if training.registrationType includes/is individual |  |
| `teacher.handsOn` | select | Yes; visible only if training.registrationType includes/is individual | regularly (Regularly); sometimes (Sometimes); rarely (Rarely); never (Never) |
| `teacher.barriers` | multi | Yes; visible only if training.registrationType includes/is individual | materials (Materials); training (Training); time (Time); class-size (Class size); space (Lab space); knowledge (Not sure how); other (Other) |
| `teacher.barriersOther` | text; ≤160 characters | Yes; visible only if training.registrationType includes/is individual AND teacher.barriers includes/is other |  |
| `training.handsOn` | select | Yes; visible only if training.registrationType includes/is school | regularly (Regularly); sometimes (Sometimes); rarely (Rarely); never (Never); varies (Varies by teacher) |
| `training.goals` | multi | Yes; visible only if training.registrationType includes/is school | methods (Improve methods); engagement (Engage students); exams (Exam practicals); club (STEM club); confidence (Teacher confidence); materials (Use local materials); other (Other) |
| `training.goalsOther` | text; ≤160 characters | Yes; visible only if training.registrationType includes/is school AND training.goals includes/is other |  |
| `training.challenges` | textarea; ≤2000 characters | Yes; visible only if training.registrationType includes/is school |  |
| `training.success` | textarea; ≤2000 characters | Yes; visible only if training.registrationType includes/is school |  |
| `training.accommodation` | select | Yes; visible only if training.registrationType includes/is school | yes (Yes); no (No); some (Some teachers); na (Not applicable) |
| `training.format` | select | Yes; visible only if training.registrationType includes/is school | full-day (Full day (6–8 hours)); half-day (Half day (3–4 hours)); short-series (Multiple shorter sessions); flexible (Please recommend) |
| `payment.contactName` | text; ≤160 characters | Yes; visible only if training.registrationType includes/is school |  |
| `payment.phone` | tel; ≤30 characters | Yes; visible only if training.registrationType includes/is school |  |
| `payment.email` | email; ≤254 characters | Yes; visible only if training.registrationType includes/is school |  |
| `payment.budget` | select | Yes; visible only if training.registrationType includes/is school | under500k (Under TZS 500,000); 500k-1m (TZS 500,000–1,000,000); 1m-2m (TZS 1,000,000–2,000,000); 2m+ (TZS 2,000,000+); quote (Need pricing first); flexible (Flexible); grant (Seeking donor/grant funding) |
| `payment.proposal` | select | Yes; visible only if training.registrationType includes/is school | yes (Yes); no (No) |
| `payment.quoteRecipient` | text; ≤160 characters | Yes; visible only if training.registrationType includes/is school AND payment.proposal includes/is yes |  |
| `training.support` | multi | Yes; visible only if training.registrationType includes/is school | coaching (Observation / coaching); whatsapp (WhatsApp support); refresher (Refresher sessions); kits (Kit recommendations); none (Not needed); more (Tell me more) |
| `referral.source` | select | Yes | social (Social media); referral (Friend / family / colleague recommendation); school (School recommendation); website (Website / Google); workshop (Teacher workshop); event (Education event); previous (Previous programme / partnership); park (STEM Park visit); whatsapp (WhatsApp / SMS); email (Email); flyer (Poster / flyer); media (Radio / newspaper); corporate (Corporate network); other (Other) |
| `referral.details` | text; ≤160 characters | Optional; visible only if referral.source includes/is referral or school or other |  |
| `comments` | textarea; ≤2000 characters | Optional |  |

**Teacher list & agreements**

| Path | Type / limits | Required / condition | Allowed values / source |
| --- | --- | --- | --- |
| `training.listMode` | select | Optional; visible only if training.registrationType includes/is school | later (Provide later); manual (Enter names and subjects); upload (Private document upload) |
| `teachers` | repeat; 1–100 | Yes; visible only if training.registrationType includes/is school AND training.listMode includes/is manual |  |
| `teachers.*.name` | text; ≤160 characters | Yes; visible only if training.registrationType includes/is school AND training.listMode includes/is manual |  |
| `teachers.*.subject` | text; ≤160 characters | Yes; visible only if training.registrationType includes/is school AND training.listMode includes/is manual |  |
| `training.teacherListFile` | file; 1 file, 1 byte–5 MiB; manifest + multipart teacherList | Yes; visible only if training.registrationType includes/is school AND training.listMode includes/is upload | .pdf; .doc; .docx; .xls; .xlsx. Only with privateAttachments=true |
| `agreements.accurate` | agreement | Yes |  |
| `agreements.contact` | agreement | Yes |  |
| `policyAcceptances` | policies | Yes | Object: config.agreements[].id → true |

### saturday — version 1


**Guardian details**

| Path | Type / limits | Required / condition | Allowed values / source |
| --- | --- | --- | --- |
| `contact.name` | text; ≤160 characters | Yes |  |
| `contact.phone` | tel; ≤30 characters | Yes |  |
| `contact.whatsapp` | tel; ≤30 characters | Optional |  |
| `contact.email` | email; ≤254 characters | Yes |  |
| `emergency.name` | text; ≤160 characters | Yes |  |
| `emergency.phone` | tel; ≤30 characters | Yes |  |
| `contact.address` | text; ≤160 characters | Optional |  |

**Children & sessions**

| Path | Type / limits | Required / condition | Allowed values / source |
| --- | --- | --- | --- |
| `locationId` | location | Yes | Active programme.locations[].id (string) |
| `children` | repeat; 1–10 | Yes |  |
| `children.*.name` | text; ≤160 characters | Yes |  |
| `children.*.birthDate` | date; not future | Yes |  |
| `children.*.age` | derivedAge | Yes | 4–14; recompute from DOB at first session |
| `children.*.ageGroup` | derivedGroup | Yes | 4–6; 7–14 (derived from DOB at first session) |
| `children.*.gender` | select | Yes | male (Male); female (Female); undisclosed (Prefer not to say) |
| `children.*.school` | text; ≤160 characters | Optional |  |
| `children.*.classLevel` | select | Yes | preschool (Pre-primary); std1 (Standard 1); std2 (Standard 2); std3 (Standard 3); std4 (Standard 4); std5 (Standard 5); std6 (Standard 6); std7 (Standard 7); form1 (Form 1); form2 (Form 2); form3 (Form 3); form4 (Form 4); equivalent (Other / equivalent class) |
| `children.*.classLevelOther` | text; ≤160 characters | Yes; visible only if children.*.classLevel includes/is equivalent |  |
| `children.*.packageId` | select | Yes | config.packages[].id |
| `children.*.startDate` | date; today + 0 days or later; Saturdays only | Yes |  |
| `children.*.previousAttendance` | select | Yes | yes (Yes); no (No) |
| `children.*.interests` | multi | Optional | science (Science experiments); physics (How things work); nature (Nature and biology); engineering (Engineering); coding (Coding / technology); robotics (Robotics); environment (Environmental science); maths (Mathematics); arts (Arts and crafts); all (All STEM); unsure (Not sure yet) |
| `children.*.medical` | textarea; ≤2000 characters | Yes |  |
| `children.*.learningNeeds` | textarea; ≤2000 characters | Optional |  |
| `children.*.photoPermission` | select | Yes | marketing (Yes, including marketing and social media); internal (Internal records only); no (No photos or videos) |

**Preferences**

| Path | Type / limits | Required / condition | Allowed values / source |
| --- | --- | --- | --- |
| `preferences.goals` | multi | Yes | understanding (Understand science); hands-on (Hands-on learning); confidence (Build confidence); friends (Make friends); competitions (Prepare for competitions); careers (Explore STEM careers); productive (Productive free time); grades (Improve school grades); thinking (Critical thinking); fun (Have fun); independence (Life skills and independence); other (Other) |
| `preferences.goalsOther` | text; ≤160 characters | Yes; visible only if preferences.goals includes/is other |  |
| `preferences.topics` | textarea; ≤2000 characters | Optional |  |
| `logistics.transport` | select | Yes | parent (Parent / guardian); family (Other family member); organised (School / organised transport); independent (Independent travel (secondary students only)); different (Different arrangements for each child) |
| `logistics.transportDetails` | textarea; ≤2000 characters | Yes; visible only if logistics.transport includes/is different or assistance |  |
| `logistics.pickupNames` | textarea; ≤2000 characters | Yes |  |
| `referral.source` | select | Yes | social (Social media); referral (Friend / family / colleague recommendation); school (School recommendation); website (Website / Google); workshop (Teacher workshop); event (Education event); previous (Previous programme / partnership); park (STEM Park visit); whatsapp (WhatsApp / SMS); email (Email); flyer (Poster / flyer); media (Radio / newspaper); corporate (Corporate network); other (Other) |
| `referral.details` | text; ≤160 characters | Optional; visible only if referral.source includes/is referral or school or other |  |
| `comments` | textarea; ≤2000 characters | Optional |  |
| `permissions.marketing` | select | Yes | both (Email and WhatsApp); whatsapp (WhatsApp only); email (Email only); no (No thanks) |

**Agreements**

| Path | Type / limits | Required / condition | Allowed values / source |
| --- | --- | --- | --- |
| `agreements.pickup` | agreement | Yes |  |
| `agreements.accurate` | agreement | Yes |  |
| `agreements.contact` | agreement | Yes |  |
| `policyAcceptances` | policies | Yes | Object: config.agreements[].id → true |

### private — version 1


**Contact & session type**

| Path | Type / limits | Required / condition | Allowed values / source |
| --- | --- | --- | --- |
| `contact.name` | text; ≤160 characters | Yes |  |
| `contact.phone` | tel; ≤30 characters | Yes |  |
| `contact.whatsapp` | tel; ≤30 characters | Optional |  |
| `contact.email` | email; ≤254 characters | Yes |  |
| `contact.organisation` | text; ≤160 characters | Optional |  |
| `private.type` | select | Yes | config.allowedSessionTypes intersected with individual (Individual student tutoring); group (Small group (2–8 learners)); family (Family STEM session); coaching (Individual teacher coaching); department (School department training); corporate (Corporate / organisation team); other (Other) |

**Participants & goals**

| Path | Type / limits | Required / condition | Allowed values / source |
| --- | --- | --- | --- |
| `student.name` | text; ≤160 characters | Yes; visible only if private.type includes/is individual |  |
| `student.age` | number; 4–14 | Yes; visible only if private.type includes/is individual |  |
| `student.classLevel` | select | Yes; visible only if private.type includes/is individual | preschool (Pre-primary); std1 (Standard 1); std2 (Standard 2); std3 (Standard 3); std4 (Standard 4); std5 (Standard 5); std6 (Standard 6); std7 (Standard 7); form1 (Form 1); form2 (Form 2); form3 (Form 3); form4 (Form 4); equivalent (Other / equivalent class); form5 (Form 5); form6 (Form 6); adult (Out of school / adult) |
| `student.classLevelOther` | text; ≤160 characters | Yes; visible only if private.type includes/is individual AND student.classLevel includes/is equivalent |  |
| `student.topics` | multi | Yes; visible only if private.type includes/is individual | engineering (Engineering); science (General Science); maths (Mathematics); ict (ICT / Computer Science); all (All STEM); other (Other) |
| `student.topicsOther` | text; ≤160 characters | Yes; visible only if private.type includes/is individual AND student.topics includes/is other |  |
| `student.goals` | textarea; ≤2000 characters | Yes; visible only if private.type includes/is individual |  |
| `student.challenges` | textarea; ≤2000 characters | Optional; visible only if private.type includes/is individual |  |
| `student.sessions` | select | Yes; visible only if private.type includes/is individual | single (Single session); four (4 sessions); eight (8 sessions); twelve (12 sessions); weekly (Weekly ongoing); unsure (Please recommend) |
| `group.count` | number; 2–8 | Yes; visible only if private.type includes/is group |  |
| `group.relationship` | select | Yes; visible only if private.type includes/is group | siblings (Siblings); classmates (Classmates / friends); homeschool (Homeschool co-op); study (Study group); mixed (Mixed / other) |
| `group.ages` | text; ≤160 characters | Yes; visible only if private.type includes/is group |  |
| `group.classes` | text; ≤160 characters | Yes; visible only if private.type includes/is group |  |
| `group.topics` | textarea; ≤2000 characters | Yes; visible only if private.type includes/is group |  |
| `group.goals` | textarea; ≤2000 characters | Yes; visible only if private.type includes/is group |  |
| `group.sessions` | select | Yes; visible only if private.type includes/is group | single (Single); four (4 sessions); eight (8 sessions); ongoing (Ongoing); unsure (Please recommend) |
| `family.total` | number; 1–10000 | Yes; visible only if private.type includes/is family |  |
| `family.adults` | number; 1–10000 | Yes; visible only if private.type includes/is family |  |
| `family.children` | number; 0–10000 | Yes; visible only if private.type includes/is family |  |
| `family.ages` | text; ≤160 characters | Optional; visible only if private.type includes/is family |  |
| `family.interests` | multi | Yes; visible only if private.type includes/is family | bonding (Science and family bonding); engineering (Engineering challenge); birthday (Birthday alternative); outing (Educational outing); occasion (Special occasion); monthly (Monthly family STEM); other (Other) |
| `family.interestsOther` | text; ≤160 characters | Yes; visible only if private.type includes/is family AND family.interests includes/is other or occasion |  |
| `family.goals` | textarea; ≤2000 characters | Yes; visible only if private.type includes/is family |  |
| `family.themes` | textarea; ≤2000 characters | Optional; visible only if private.type includes/is family |  |
| `coaching.experience` | select | Yes; visible only if private.type includes/is coaching | 0-2 (0–2 years); 3-5 (3–5 years); 6-10 (6–10 years); 11-15 (11–15 years); 16-20 (16–20 years); 20+ (More than 20 years) |
| `coaching.subjects` | multi | Yes; visible only if private.type includes/is coaching | chemistry (Chemistry); physics (Physics); biology (Biology); science (General Science); maths (Mathematics); ict (ICT); integrated (Integrated STEM); other (Other) |
| `coaching.subjectsOther` | text; ≤160 characters | Yes; visible only if private.type includes/is coaching AND coaching.subjects includes/is other |  |
| `coaching.levels` | multi | Yes; visible only if private.type includes/is coaching | lower-primary (Standard 1–4); upper-primary (Standard 5–7); form1-2 (Form 1–2); form3-4 (Form 3–4); form5-6 (Form 5–6) |
| `coaching.skills` | multi | Yes; visible only if private.type includes/is coaching | hands-on (Hands-on teaching); materials (Local materials); management (Classroom management); concepts (Explain abstract concepts); assessment (Practical assessment); engagement (Engage learners); exams (Practical exams); clubs (Club facilitation); other (Other) |
| `coaching.skillsOther` | text; ≤160 characters | Yes; visible only if private.type includes/is coaching AND coaching.skills includes/is other |  |
| `coaching.challenges` | textarea; ≤2000 characters | Yes; visible only if private.type includes/is coaching |  |
| `coaching.success` | textarea; ≤2000 characters | Yes; visible only if private.type includes/is coaching |  |
| `coaching.sessions` | select | Yes; visible only if private.type includes/is coaching | single (Single 2-hour session); four (4 sessions over a month); eight (8 sessions over two months); full-day (Full day); unsure (Please recommend) |
| `department.school` | text; ≤160 characters | Yes; visible only if private.type includes/is department |  |
| `department.count` | number; 1–10000 | Yes; visible only if private.type includes/is department |  |
| `department.subjects` | multi | Yes; visible only if private.type includes/is department | chemistry (Chemistry); physics (Physics); biology (Biology); science (General Science); maths (Mathematics); ict (ICT); integrated (Integrated STEM); other (Other) |
| `department.subjectsOther` | text; ≤160 characters | Yes; visible only if private.type includes/is department AND department.subjects includes/is other |  |
| `department.levels` | multi | Yes; visible only if private.type includes/is department | primary (Primary); form1-2 (Form 1–2); form3-4 (Form 3–4); form5-6 (Form 5–6) |
| `department.goals` | multi | Yes; visible only if private.type includes/is department | methods (Teaching methods); cohesion (Consistent teaching approach); inspection (Inspection / accreditation); curriculum (Practical curriculum); exams (Practical exams); club (STEM club); team (Team building); other (Other) |
| `department.goalsOther` | text; ≤160 characters | Yes; visible only if private.type includes/is department AND department.goals includes/is other |  |
| `department.challenges` | textarea; ≤2000 characters | Yes; visible only if private.type includes/is department |  |
| `department.success` | textarea; ≤2000 characters | Yes; visible only if private.type includes/is department |  |
| `department.format` | select | Yes; visible only if private.type includes/is department | full-day (Full day (6–8 hours)); half-day (Half day (3–4 hours)); short-series (Multiple shorter sessions); flexible (Please recommend) |
| `department.proposal` | select | Yes; visible only if private.type includes/is department | management (For management); board (For board / governors); no (Informal quote); unsure (Not sure) |
| `corporate.organisationName` | text; ≤160 characters | Yes; visible only if private.type includes/is corporate |  |
| `corporate.industry` | select | Yes; visible only if private.type includes/is corporate | technology (Technology / IT); finance (Finance); education (Education); health (Healthcare); manufacturing (Manufacturing); ngo (NGO / development); government (Government); retail (Retail / hospitality); other (Other) |
| `corporate.industryOther` | text; ≤160 characters | Yes; visible only if private.type includes/is corporate AND corporate.industry includes/is other |  |
| `corporate.count` | number; 1–10000 | Yes; visible only if private.type includes/is corporate |  |
| `corporate.roles` | multi | Yes; visible only if private.type includes/is corporate | executive (Executives); management (Management); leaders (Team leaders); staff (Staff); mixed (Mixed levels); department (Specific department) |
| `corporate.goals` | multi | Yes; visible only if private.type includes/is corporate | communication (Communication / collaboration); creativity (Creative problem-solving); trust (Trust); silos (Connect departments); motivation (Motivation); innovation (Innovation); fun (Fun); other (Other) |
| `corporate.goalsOther` | text; ≤160 characters | Yes; visible only if private.type includes/is corporate AND corporate.goals includes/is other |  |
| `corporate.challenges` | textarea; ≤2000 characters | Yes; visible only if private.type includes/is corporate |  |
| `corporate.activities` | multi | Yes; visible only if private.type includes/is corporate | engineering (Engineering challenges); competition (Problem-solving competition); innovation (Innovation workshop); experiments (Collaborative experiments); coding (Technology / coding); surprise (Please design for us) |
| `corporate.catering` | select | Yes; visible only if private.type includes/is corporate | meal (Full meal); snacks (Snacks); no (We will arrange); unsure (Provide options) |
| `corporate.proposal` | select | Yes; visible only if private.type includes/is corporate | detailed (Detailed proposal); simple (Simple quote); no (Informal discussion) |
| `private.other` | textarea; ≤2000 characters | Yes; visible only if private.type includes/is other |  |

**Schedule & location**

| Path | Type / limits | Required / condition | Allowed values / source |
| --- | --- | --- | --- |
| `schedule.duration` | select | Yes | 2h (2 hours); 3h (3 hours); 4h (4 hours); half-day (Half day (4–5 hours)); full-day (Full day (6–8 hours)); multi-day (Multiple days); flexible (Please recommend) |
| `schedule.days` | text; ≤160 characters | Yes; visible only if schedule.duration includes/is multi-day |  |
| `schedule.firstDate` | date; today + 7 days or later | Yes |  |
| `schedule.secondDate` | date; today + 0 days or later | Optional |  |
| `schedule.thirdDate` | date; today + 0 days or later | Optional |  |
| `schedule.time` | select | Yes | morning (Morning · 10:00–12:30); afternoon (Afternoon · 14:00–17:00); flexible (Flexible); specific (Specific time) |
| `schedule.specificTime` | text; ≤160 characters | Yes; visible only if schedule.time includes/is specific |  |
| `schedule.venue` | select | Yes | park (STEM Park); customer (Our location); flexible (Either); unsure (Please recommend) |
| `schedule.address` | textarea; ≤2000 characters | Yes; visible only if schedule.venue includes/is customer |  |
| `schedule.facilities` | textarea; ≤2000 characters | Optional; visible only if schedule.venue includes/is customer |  |

**Budget & preferences**

| Path | Type / limits | Required / condition | Allowed values / source |
| --- | --- | --- | --- |
| `payment.budget` | select | Yes | under500k (Under TZS 500,000); 500k-800k (TZS 500,000–800,000); 800k-1m (TZS 800,000–1,000,000); 1m+ (TZS 1,000,000+); quote (Need a quote); flexible (Flexible) |
| `payment.funding` | select | Optional | personal (Personal / family); school (School); organisation (Organisation); donor (Donor / grant); shared (Shared costs); other (Other) |
| `payment.fundingOther` | text; ≤160 characters | Yes; visible only if payment.funding includes/is other |  |
| `payment.plan` | select | Optional | yes (Installments); no (Pay in full); unsure (Provide options) |
| `preferences.outcomes` | textarea; ≤2000 characters | Yes |  |
| `preferences.success` | textarea; ≤2000 characters | Optional |  |
| `preferences.accommodations` | textarea; ≤2000 characters | Optional |  |
| `referral.source` | select | Yes | social (Social media); referral (Friend / family / colleague recommendation); school (School recommendation); website (Website / Google); workshop (Teacher workshop); event (Education event); previous (Previous programme / partnership); park (STEM Park visit); whatsapp (WhatsApp / SMS); email (Email); flyer (Poster / flyer); media (Radio / newspaper); corporate (Corporate network); other (Other) |
| `referral.details` | text; ≤160 characters | Optional; visible only if referral.source includes/is referral or school or other |  |
| `comments` | textarea; ≤2000 characters | Optional |  |
| `followUp.urgency` | select | Yes | week (Within a week (subject to approval)); 2-3weeks (2–3 weeks); month (Within a month); 2-3months (2–3 months); exploring (Exploring options) |

**Agreements**

| Path | Type / limits | Required / condition | Allowed values / source |
| --- | --- | --- | --- |
| `agreements.pending` | agreement | Yes |  |
| `agreements.quote` | agreement | Yes |  |
| `agreements.authority` | agreement | Yes |  |
| `agreements.accurate` | agreement | Yes |  |
| `agreements.contact` | agreement | Yes |  |
| `policyAcceptances` | policies | Yes | Object: config.agreements[].id → true |

### holiday-camp — version 1


**Guardian details**

| Path | Type / limits | Required / condition | Allowed values / source |
| --- | --- | --- | --- |
| `contact.name` | text; ≤160 characters | Yes |  |
| `contact.phone` | tel; ≤30 characters | Yes |  |
| `contact.whatsapp` | tel; ≤30 characters | Optional |  |
| `contact.email` | email; ≤254 characters | Yes |  |
| `contact.relationship` | select | Yes | mother (Mother); father (Father); guardian (Guardian); grandparent (Grandparent); other (Other) |
| `contact.relationshipOther` | text; ≤160 characters | Yes; visible only if contact.relationship includes/is other |  |
| `contact.address` | textarea; ≤2000 characters | Yes |  |
| `emergency.name` | text; ≤160 characters | Yes |  |
| `emergency.phone` | tel; ≤30 characters | Yes |  |
| `emergency.relationship` | text; ≤160 characters | Yes |  |

**Camp & children**

| Path | Type / limits | Required / condition | Allowed values / source |
| --- | --- | --- | --- |
| `camp.sessionId` | session | Yes | Eligible published programme.sessions[].id |
| `children` | repeat; 1–10 | Yes |  |
| `children.*.name` | text; ≤160 characters | Yes |  |
| `children.*.birthDate` | date; not future | Yes |  |
| `children.*.age` | derivedAge | Yes | 4–14; recompute from DOB at first session |
| `children.*.ageGroup` | derivedGroup | Yes | 4–6; 7–14 (derived from DOB at first session) |
| `children.*.gender` | select | Yes | male (Male); female (Female) |
| `children.*.school` | text; ≤160 characters | Yes |  |
| `children.*.classLevel` | select | Yes | preschool (Pre-primary); std1 (Standard 1); std2 (Standard 2); std3 (Standard 3); std4 (Standard 4); std5 (Standard 5); std6 (Standard 6); std7 (Standard 7); form1 (Form 1); form2 (Form 2); form3 (Form 3); form4 (Form 4); equivalent (Other / equivalent class); not-enrolled (Completed primary / not enrolled) |
| `children.*.classLevelOther` | text; ≤160 characters | Yes; visible only if children.*.classLevel includes/is equivalent |  |
| `children.*.hasAllergies` | select | Yes | yes (Yes); no (No) |
| `children.*.allergies` | textarea; ≤2000 characters | Yes; visible only if children.*.hasAllergies includes/is yes |  |
| `children.*.hasDietaryNeeds` | select | Yes | yes (Yes); no (No) |
| `children.*.dietaryNeeds` | textarea; ≤2000 characters | Yes; visible only if children.*.hasDietaryNeeds includes/is yes |  |
| `children.*.hasMedical` | select | Yes | yes (Yes); no (No) |
| `children.*.medical` | textarea; ≤2000 characters | Yes; visible only if children.*.hasMedical includes/is yes |  |
| `children.*.hasLearningNeeds` | select | Yes | yes (Yes); no (No) |
| `children.*.learningNeeds` | textarea; ≤2000 characters | Yes; visible only if children.*.hasLearningNeeds includes/is yes |  |
| `children.*.learningStyle` | select | Yes | hands-on (Hands-on); visual (Visual); auditory (Listening); group (Group work); independent (Independent); mixed (Mixed); unsure (Not sure) |
| `children.*.personality` | multi | Yes | outgoing (Outgoing); shy (Reserved at first); curious (Curious); competitive (Competitive); caring (Helpful / caring); energetic (Energetic); calm (Calm / focused); creative (Creative); encouragement (Needs encouragement); independent (Independent) |
| `children.*.interests` | multi | Yes | science (Science experiments); physics (How things work); nature (Nature and biology); engineering (Engineering); coding (Coding / technology); robotics (Robotics); environment (Environmental science); maths (Mathematics); arts (Arts and crafts); all (All STEM); unsure (Not sure yet) |
| `children.*.previousProgramme` | select | Yes | camp (Holiday camp); bootcamp (Bootcamp); saturday (Saturday sessions); club (School club); visit (Park visit); birthday (Birthday); none (First time) |
| `children.*.lastParticipation` | text; ≤160 characters | Optional; visible only if children.*.previousProgramme includes/is camp or bootcamp or saturday or club or visit or birthday |  |
| `children.*.photoPermission` | select | Yes | marketing (Yes, including marketing and social media); internal (Internal records only); no (No photos or videos) |
| `children.*.pickupNames` | textarea; ≤2000 characters | Yes |  |

**Logistics & preferences**

| Path | Type / limits | Required / condition | Allowed values / source |
| --- | --- | --- | --- |
| `logistics.transport` | select | Yes | parent (Parent / guardian); family (Other family member); organised (School / organised transport); assistance (Need transport advice); different (Different arrangements for each child) |
| `logistics.transportDetails` | textarea; ≤2000 characters | Yes; visible only if logistics.transport includes/is different or assistance |  |
| `logistics.lunch` | select | Yes | own (Bring packed food); all (Ask about food orders for all children); some (Ask about food orders for some children); information (Please explain the options) |
| `logistics.lunchDetails` | textarea; ≤2000 characters | Yes; visible only if logistics.lunch includes/is some |  |
| `preferences.goals` | multi | Yes | understanding (Understand science); hands-on (Hands-on learning); confidence (Build confidence); friends (Make friends); competitions (Prepare for competitions); careers (Explore STEM careers); productive (Productive free time); grades (Improve school grades); thinking (Critical thinking); fun (Have fun); independence (Life skills and independence); other (Other) |
| `preferences.goalsOther` | text; ≤160 characters | Yes; visible only if preferences.goals includes/is other |  |
| `preferences.topics` | textarea; ≤2000 characters | Optional |  |
| `preferences.context` | textarea; ≤2000 characters | Yes |  |
| `permissions.updates` | multi | Yes | whatsapp (WhatsApp); sms (SMS); email (Email); emergency-phone (Phone for emergencies) |
| `permissions.whatsappGroup` | select | Optional | yes (Yes); no (No); unsure (Tell me more) |
| `permissions.marketing` | select | Optional | all (All programmes); camps (Holiday camps only); no (No thanks) |
| `referral.source` | select | Yes | social (Social media); referral (Friend / family / colleague recommendation); school (School recommendation); website (Website / Google); workshop (Teacher workshop); event (Education event); previous (Previous programme / partnership); park (STEM Park visit); whatsapp (WhatsApp / SMS); email (Email); flyer (Poster / flyer); media (Radio / newspaper); corporate (Corporate network); other (Other) |
| `referral.details` | text; ≤160 characters | Optional; visible only if referral.source includes/is referral or school or other |  |

**Payment & agreements**

| Path | Type / limits | Required / condition | Allowed values / source |
| --- | --- | --- | --- |
| `payment.method` | select | Yes | mpesa (M-Pesa); bank (Bank transfer); cash (Cash at STEM Park); installments (Installments — contact me); other (Other) |
| `payment.methodOther` | text; ≤160 characters | Yes; visible only if payment.method includes/is other |  |
| `payment.plan` | select | Optional | yes (Yes); no (No); maybe (Please explain options) |
| `agreements.pickup` | agreement | Yes |  |
| `agreements.responsibility` | agreement | Yes |  |
| `agreements.accurate` | agreement | Yes |  |
| `agreements.contact` | agreement | Yes |  |
| `policyAcceptances` | policies | Yes | Object: config.agreements[].id → true |

### birthday — version 1


**Host & child**

| Path | Type / limits | Required / condition | Allowed values / source |
| --- | --- | --- | --- |
| `contact.name` | text; ≤160 characters | Yes |  |
| `contact.phone` | tel; ≤30 characters | Yes |  |
| `contact.whatsapp` | tel; ≤30 characters | Optional |  |
| `contact.email` | email; ≤254 characters | Yes |  |
| `contact.address` | text; ≤160 characters | Optional |  |
| `birthday.childName` | text; ≤160 characters | Yes |  |
| `birthday.ageTurning` | number; 1–100 | Yes |  |
| `birthday.birthDate` | date; not future | Optional |  |
| `birthday.gender` | select | Optional | male (Male); female (Female); undisclosed (Prefer not to say) |

**Party details**

| Path | Type / limits | Required / condition | Allowed values / source |
| --- | --- | --- | --- |
| `party.firstDate` | date; today + 0 days or later | Yes |  |
| `party.secondDate` | date; today + 0 days or later | Optional |  |
| `party.time` | select | Yes | morning (Morning · 10:00–12:30); afternoon (Afternoon · 14:00–17:00) |
| `party.guests` | number; 1–10000 | Yes |  |
| `party.guestAges` | text; ≤160 characters | Yes |  |
| `party.duration` | select | Yes | 2h (2 hours); 3h (3 hours); 4h (4 hours) |
| `party.venue` | select | Yes | park (STEM Park); customer (Our location) |
| `party.address` | textarea; ≤2000 characters | Yes; visible only if party.venue includes/is customer |  |
| `party.theme` | select | Yes | chemistry (Mad scientist chemistry); engineering (Engineering builders); space (Space / astronomy); nature (Nature explorers); robotics (Robotics / technology); mixed (Mix of everything); surprise (Surprise me) |

**Package & preferences**

| Path | Type / limits | Required / condition | Allowed values / source |
| --- | --- | --- | --- |
| `party.inclusions` | multi | Yes | activities (STEM activities); decorations (Decorations); cake (Cake); snacks (Snacks / refreshments); favours (Party favours); photography (Photography); all (All of the above); activities-only (Activities only — we will arrange food) |
| `party.activities` | textarea; ≤2000 characters | Optional |  |
| `party.budget` | select | Yes | under800k (Under TZS 800,000); custom (I have another budget); quote (Need a quote) |
| `party.budgetAmount` | number; 1–100000000 | Yes; visible only if party.budget includes/is custom |  |
| `party.allergies` | textarea; ≤2000 characters | Optional |  |
| `party.specialRequests` | textarea; ≤2000 characters | Optional |  |
| `referral.source` | select | Optional | social (Social media); referral (Friend / family / colleague recommendation); school (School recommendation); website (Website / Google); workshop (Teacher workshop); event (Education event); previous (Previous programme / partnership); park (STEM Park visit); whatsapp (WhatsApp / SMS); email (Email); flyer (Poster / flyer); media (Radio / newspaper); corporate (Corporate network); other (Other) |
| `referral.details` | text; ≤160 characters | Optional; visible only if referral.source includes/is referral or school or other |  |
| `comments` | textarea; ≤2000 characters | Optional |  |

**Agreements**

| Path | Type / limits | Required / condition | Allowed values / source |
| --- | --- | --- | --- |
| `agreements.accurate` | agreement | Yes |  |
| `agreements.contact` | agreement | Yes |  |
| `policyAcceptances` | policies | Yes | Object: config.agreements[].id → true |
