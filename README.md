# Projekt Inspire booking frontend

The updated booking design now connects to the main website's Laravel API. It does not contain a separate backend, authentication system, MySQL connection or Supabase client.

## Run locally

Start the main Laravel project on http://127.0.0.1:8000, then run:

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
- School clubs and custom events use enquiry forms.
- Programmes without dates offer enquiries only if the administrator permits it.
- New programme IDs work without editing frontend routes.
- Main-site deep links can use `/book/{bookingSlug}?session={sessionId}`.
- `/book/{bookingSlug}?enquiry=1` opens an enquiry when permitted.
- `/admin`, `/admin/login` and `/login` redirect to the main Laravel login. There is no second sign-in system.

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

## Tests

```sh
npm test
npm run test:browser
```

Browser tests require an isolated Chrome CDP instance on http://127.0.0.1:9337 (override with `BOOKING_CDP_URL`). They create their own fake API and preview on unused local ports, without interrupting existing servers. They do not submit to the local MySQL database or live services. Screenshots are saved in `/private/tmp/inspire-booking-integration-checks`.

## Deployment boundary

This change is local only. Do not push/deploy, change DNS/cPanel, remove Supabase data or change other websites without separate approval. Future hosting uses `public/` as the booking document root and the main Laravel API as the backend. Public API URLs are configuration, not credentials.

The recovered original bundles remain local reference material only; they are not an active application and should not be deployed.
