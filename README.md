# NSO Deliberation Hub

The hub has a static public site and Netlify Functions for private Pro Staff scores.

## Run locally

Serve the folder with a static file server for the public pages:

```sh
python3 -m http.server 8000
```

The Netlify Functions for Pro Staff comments and `/admin/` require Netlify's function runtime and configured environment variables.

## Data sources

- Group Interview CSV: `SHEET_CSV_URL` in `app.js`
- Candidate Roster CSV: `ROSTER_CSV_URL` in `app.js`
- Student Staff Individual Interview CSV: `STUDENT_INDIVIDUAL_CSV_URL` in `app.js`
- Pro Staff Individual Interview tab: read server-side by Netlify Functions. Candidate profiles receive only an explicit allowlist of written response fields; scored fields are excluded.
- Schedule tab: `SCHEDULE_CSV_URL` in `app.js`
- Group, Student Staff, and Pro Staff form links: `FORM_URLS` in `app.js`

The candidate profiles show responses from both Student Staff and Pro Staff interviews. The Pro Staff comments endpoint filters to written response fields and never returns score columns.

## Configure private admin access

Keep the Pro Staff and future leaderboard tabs unpublished. In Netlify, set these environment variables:

- `ADMIN_USER` and `ADMIN_PASSWORD`: admin sign-in credentials.
- `GOOGLE_SHEET_ID`: spreadsheet ID from its normal `/spreadsheets/d/.../edit` URL.
- `GOOGLE_SERVICE_ACCOUNT_JSON`: service account JSON with read access to the workbook. Enable the Google Sheets API and share the private workbook with the service account email as a Viewer.
- `LEADERBOARD_RANGE` (optional until the leaderboard tab exists), for example `'Leaderboard'!A:Z`.

Deploy the site and functions together, then visit `/admin/`. The leaderboard shows a setup message until `LEADERBOARD_RANGE` points to a tab with data.

## Privacy

Published sheets can be read by anyone with their links. The Pro Staff tab must be removed from the published workbook before scores are considered private. The existing sign-in screen is a convenience gate only. Hiding email and phone fields in the site does not remove them from the published roster CSV.
