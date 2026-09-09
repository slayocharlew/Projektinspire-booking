# Projekt Inspire Booking

A responsive programme catalogue and interactive booking **demo** for Projekt Inspire. This frontend is the starting point for a future Laravel/MySQL application on cPanel.

## Run locally

Requires Node.js 18 or newer. There are no packages to install.

```sh
npm start
```

Open http://127.0.0.1:8010. If that port is occupied:

```sh
BOOKING_PREVIEW_PORT=8011 npm start
```

Run the preview server rather than opening the HTML directly: it provides the programme routes and correct module headers.

## What works

- Seven compact photo cards, using the supplied blue/orange/green palette and locally optimized company photos.
- Daily Private Sessions and Saturday Sessions in Dar es Salaam; STEM Park Visits in Dar es Salaam or Tanga.
- Private sessions and park visits Monday–Friday, 2½ hours, with half-hour starts from 08:30 through 14:30. Saturday sessions book one date, 10:00–12:30.
- Date/time, contact and participant steps, validation, back navigation and review.
- Enquiry previews for school clubs, custom events, Holiday Camps and the Annual STEM Youth Bootcamp. Camps and Bootcamp display “Dates coming soon”.
- Scheduled demo completion with Google Calendar links and downloadable `.ics` events. Exports use Tanzania time and contain no contact/participant data. `.ics` requests one-day and one-hour reminders; calendar apps may use their own alert settings.

All completions and exported events are labelled **DEMO**. No place is reserved and no enquiry, email or SMS is sent. Drafts live only in page memory and reset on refresh. There is no live availability, payment processing, customer account or booking backend. The original admin login remains an inactive reference.

Calendar exports require the user to save the event in their calendar. They are standalone copies, not synchronized subscriptions. Google Calendar uses the user's notification settings. Phone/browser support for `.ics` import varies; Google Calendar and copying event details are alternative options. Device imports still need checking on real iPhone and Android hardware.

## Frontend structure

- `public/programs/index.html`: shared accessible page shell.
- `public/assets/styles.css`: responsive catalogue, forms and completion styling.
- `public/assets/programmes.js`: single catalogue for text, photos, venues and schedule/enquiry modes.
- `public/assets/booking.js`: scheduling, date/time formatting, validation and the `completeDemo` submission boundary.
- `public/assets/calendar.js`: RFC 5545 event generation and Google event links.
- `public/assets/app.js`: programme cards, booking/enquiry steps and calendar interactions.
- `public/assets/images/SOURCES.md`: provenance for the company images.
- `preview.mjs`: local routes, static assets and content security policy. Only the new local modules are served as scripts; network connections and form POSTs are disabled.

The root redirects to `/programs`. Each catalogue ID has a `/book/{id}` route. Existing Saturday and park URLs are preserved. Legacy individual/group/school visits redirect to the park flow; birthdays redirect to STEM-Themed Events. `/lookup` and `/schedule` redirect to the catalogue, including their trailing-slash and `index.html` forms. Unknown programme routes return 404.

The older public HTML files are retained but their routes are replaced by the preview server. `recovered-site/` and `browser-captures/` preserve the original references and remain excluded from Git. This is not the recovered original Next.js source.

## Published camp and bootcamp dates

Keep `sessions: []` until real schedules are available. A programme in `published` mode offers booking only when it has a future session with all of:

```js
{ id, location, start, end }
```

`start` and `end` must be ISO date-times with explicit timezone offsets, and `end` must follow `start`. Each entry represents one independently booked occurrence or shift, not an invented recurring series. Incomplete and expired entries remain unavailable. Adding schedule data does not make the demo a real booking service.

## Verification

```sh
npm test
```

Node's built-in tests cover opening days/hours, expiry, timezone rollover, programme-specific validation, published schedules, event escaping and folding, reminder properties, and contact-data exclusion.

The dependency-free browser checks require Node 22+ and an **isolated** Chrome instance exposing its DevTools endpoint. With the preview running at port 8011 and Chrome debugging at port 9337:

```sh
npm run test:browser
```

Override `BOOKING_TEST_URL`, `BOOKING_CDP_URL` or `BOOKING_SCREENSHOT_DIR` as needed. The check creates and closes its own browser tab, exercises all seven flows, checks widths 320/390/820/1440, tests actual calendar downloads, and writes screenshots into `/private/tmp/inspire-booking-checks` by default. It never opens or saves to an external calendar account.

## Backend handoff

Replace `completeDemo` with a server submission adapter and fetch authoritative availability before offering confirmed bookings. Move final validation, capacity enforcement and reference generation to the backend. Gate real calendar events on a successful scheduled booking response; enquiries without confirmed times must not export events. Replace demo copy only when those backend operations are connected. Authentication, payments, communications, persistent storage and deployment are separate work.

No live website, database or hosting settings were changed by this frontend implementation.
