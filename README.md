# CrewX

Crew rotation tracker for offshore / maritime work — a Progressive Web App (installable on phone and desktop) backed by Firebase.

## Features

- **Rotation calendar** — log left/arrived home, Brazil entry/exit, ship sign-on/sign-off and training periods; stats for days away, days in Brazil (tax), sea time, training and travel days, filterable by year.
- **Payroll** — day-rate periods, payroll windows from the 21st to the 20th, training paid at its own rate, travel expenses, and a "received in bank" check against the calculated total.
- **Certificates** — expiry tracking with 90/30-day warnings, AI scanning of certificate images/PDFs, and daily email alerts (configurable thresholds).
- **Travel expenses** — AI extraction of items and currencies from Word documents, converted to USD and assigned to a payroll period.
- **Admin panel** — invite-only user management and email notification settings.

## How payroll counts days

- *Days away* = trip days (left home → arrived home) **plus training days**.
- Trip days are paid at the day rate valid on that date; training days are paid at the rate entered for that training period.
- Rate periods cannot overlap.

## Project structure

| File | Purpose |
|------|---------|
| `index.html` | App shell and all pages/modals |
| `app.js` | Application logic (auth, Firestore sync, calendar, payroll, certificates, expenses, admin) |
| `style.css` | Styles, including light/dark theme |
| `sw.js` | Service worker (offline app shell) |
| `manifest.json`, `icons/` | PWA manifest and icons |
| `offline.html` | Fallback page when offline |

## Backend

Firebase project `crewx-17f23`:

- **Auth** — email/password, accounts created by the admin.
- **Firestore** — user data in `users/{uid}/appData/crewx`; admin settings in `adminSettings/emailNotifications`.
- **Cloud Functions** — `adminManageUsers`, `scanCert`, `scanExpense`, `sendTestCertEmail`, plus a scheduled certificate-alert job (SendGrid). Their source and the Firestore security rules are not in this repository.

## Releasing a change

When `app.js` or `style.css` changes, bump the `?v=` number in `index.html` **and** the matching entry in `sw.js`, and bump `CACHE_VERSION` in `sw.js`, so installed apps pick up the new files.
