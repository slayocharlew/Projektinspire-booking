# Projekt Inspire booking frontend

The updated booking design now connects to the main website's Laravel API. It does not contain a separate backend, authentication system, MySQL connection or Supabase client.

## Run locally

Start the main Laravel project on http://127.0.0.1:8000, then run:

Use Node.js 22 or later (the browser checks use its built-in WebSocket client).

```sh
npm start
```

Open http://127.0.0.1:8010/programs. Restart any older preview process after updating these files; the previous demo server cannot serve the API adapter.

Optional settings:

```sh
BOOKING_PREVIEW_PORT=8010 BOOKING_API_URL=http://127.0.0.1:8000/api/booking/v1 npm start
```

The local server injects that public API URL into the page. No password or private key belongs in this project. In production the page points to https://projektinspire.co.tz/api/booking/v1; do not deploy it until the backend is deployed and its CORS origin is configured.

## Where content comes from

The main admin controls programmes, images, dated sessions and recurring availability. Only active programmes with **Show on booking website** appear. Dated sessions additionally need their own booking switch enabled and must be published, within the booking period, and have capacity.

The initial catalogue import prepares the existing seven programmes for admin review without enabling booking. An empty catalogue after setup is intentional until an administrator approves programmes. News, announcements, homepage placements and unrelated admin content do not appear here.

- Regular appointments use server-provided dates/times, not browser-generated availability.
- Camps and bootcamps show published sessions under one programme card.
- School clubs and custom events use booking forms, with arrangements confirmed by staff.
- Programmes without dates accept booking requests only if the administrator permits it.
- New programme IDs work without editing frontend routes.
- Main-site deep links can use `/book/{bookingSlug}?session={sessionId}`.
- `/book/{bookingSlug}?booking=request` opens a booking request when permitted.
- `/admin`, `/admin/login` and `/login` redirect to the main Laravel login. There is no second sign-in system.

## Links for the main website

Use `https://booking.projektinspire.co.tz` followed by the relevant path for each **Book now** button. These open the programme's own form directly. No catalogue selection is required.

| Programme | Booking path |
| --- | --- |
| Daily Private Sessions | `/book/daily-private-sessions` |
| Saturday Sessions | `/book/saturday-stem-sessions` |
| Holiday Camps | `/book/holiday-camps` |
| On-Site STEM Clubs | `/book/on-site-stem-clubs` |
| STEM Park Visits | `/book/stem-park-visit` |
| STEM-Themed Events | `/book/stem-themed-events` |
| Annual STEM Youth Bootcamp | `/book/annual-stem-youth-bootcamp` |

These are the initial catalogue's booking slugs; use the admin-configured booking slug if it changes. Additional programmes, including teacher training, use their own enabled booking slug. A public programme page and its booking form can have different slugs. Programmes must be enabled by an administrator before their booking links are available.

For a specific published camp or workshop, append `?session={sessionId}`. Unavailable sessions are clearly reported and never silently booked as another session. For arrangements that need staff input, append `?booking=request`. Previously shared `?enquiry=1` links still open the same form and are normalized to the current booking URL. Legacy visit redirects preserve query parameters.

The frontend uses booking terminology throughout. Legacy API endpoint and field names remain compatible with the existing Laravel backend; both scheduled bookings and requests are saved in its bookings table. Existing administrative workflows are unchanged. This update does not deploy or modify the main website's buttons.

## Submissions

The server returns a saved reference and confirmation status. **Pending is not confirmed.** Approval is required by default; administrators may choose automatic confirmation per session/schedule. Pending bookings reserve participant spaces until staff makes a decision.

Double clicks are blocked and retries with identical data reuse an idempotency key. No network failure produces fake success. Entered details remain in page memory after recoverable errors, but refreshing clears them; contact details are not saved in browser storage.

Calendar export is available only for confirmed scheduled bookings. It is a static copy, not a synchronized feed. Automatic emails, SMS and payments are not implemented; staff contact applicants using the details in the main admin.

## Files

- `public/programs/index.html`: page shell and public production API URL.
- `public/assets/app.js`: existing responsive catalogue and booking flows.
- `public/assets/api.js`: API adapter and retry handling.
- `public/assets/programmes.js`: in-memory server catalogue; no hardcoded public programme data.
- `public/assets/booking.js`: form validation and server-slot selection.
- `public/assets/calendar.js`: confirmed-booking calendar exports.
- `public/assets/styles.css`, `public/assets/images/`: preserved visual assets.
- `public/.htaccess`: future Apache routing/security configuration; not deployed.
- `tests/fixtures/programmes.json`: test-only examples, never a fallback in the public application.

The authoritative API contract and backend setup are documented in the sibling main project at `../projektinspire-website/docs/booking-integration.md`. All database migrations belong there.

## Specification forms and isolated preview

The seven detailed specification forms are implemented in `form-schema.js`, `form-model.js`, `form-ui.js` and `form-api.js`. They include conditional branches, separate children/teachers, review/edit, exact nested errors and per-child permissions. They **do not yet have a compatible shared backend**. Normal booking pages keep the current working flows until the API explicitly advertises the versioned readiness capability. No new answers are posted to the old endpoints.

To review every form locally with fictional data:

```sh
npm run preview:forms
```

Open http://127.0.0.1:8010/__forms. This preview is served only with the explicit environment flag, binds to localhost, and makes no booking API calls. Its example prices, policies and dates are not production settings. It never saves bookings, uploads teacher files, takes payment or sends messages. It also includes Teacher Training without adding it to the public catalogue. Use `?form=private&simulate=failure` or `?form=holiday-camp&simulate=validation` to inspect failure handling.

The complete actual contract, pending business decisions and main-site implementation requirements are in [BOOKING-BACKEND-HANDOFF.md](BOOKING-BACKEND-HANDOFF.md). Regenerate its field tables after schema edits with `node scripts/document-form-contract.mjs`. No shared backend/database edits or deployment are included in this frontend change.

## Tests

```sh
npm test
npm run test:browser
```

Browser tests require an isolated Chrome CDP instance on http://127.0.0.1:9337 (override with `BOOKING_CDP_URL`). They create their own fake API and preview on unused local ports, without interrupting existing servers. They do not submit to the local MySQL database or live services. Screenshots are saved in `/private/tmp/inspire-booking-integration-checks`.

## Deployment boundary

This change is local only. Do not push/deploy, change DNS/cPanel, remove Supabase data or change other websites without separate approval. Future hosting uses `public/` as the booking document root and the main Laravel API as the backend. Public API URLs are configuration, not credentials.

The recovered original bundles remain local reference material only; they are not an active application and should not be deployed.
