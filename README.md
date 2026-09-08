# Projekt Inspire Booking

This is a local design starting point recovered from the public booking website on 8 September 2026. It is **not a clone of the original Next.js source project** or a working booking backend.

The live address is https://booking.projektinspire.co.tz/, hosted on Netlify at `pibookingsystem.netlify.app`. Its public browser code references Supabase. The checked cPanel booking folder contains hosting configuration, not the application source.

## Preview locally

With Node.js installed, run:

```sh
npm start
```

Open http://127.0.0.1:8010. There are no packages to install. If that port is occupied, use `BOOKING_PREVIEW_PORT=8011 npm start`.

## Files

- `public/`: editable HTML copies, downloaded styles, fonts, and artwork for the public screens.
- `preview.mjs`: a local preview server. Form submissions, original app scripts, and database connections are disabled.
- `recovered-site/`: original publicly served HTML and compiled browser assets, kept locally and excluded from Git.
- `browser-captures/`: browser-rendered copies of the public pages, also excluded from Git.
- `recovery-manifest.json`: origins, sizes, and checksums of downloaded public files.

The captured screens are `/programs`, `/schedule`, `/lookup`, `/admin/login`, and the six publicly linked booking forms (Saturday sessions, park, group, individual, birthday, and school visits). Calendar values and any programme details are snapshots from the capture, not live availability. Multi-step actions, sign-in, booking searches, and submissions are not functional in this reference.

## Planned cPanel version

The editable React components, server routes, original Git history, Supabase database, and private configuration were not recovered. The public HTML and styles can guide a new Laravel application with a local MySQL database, then deployment to the booking subdomain on cPanel. That backend has not been created here.

No GitHub repository was created, and no live booking or database settings were changed.
