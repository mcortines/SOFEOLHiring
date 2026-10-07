# NSO Deliberation Hub

Static front end for the published group interview, candidate roster, and individual interview tabs.

## Run locally

Serve this folder with a static file server. For example:

```sh
python3 -m http.server 8000
```

Open `http://localhost:8000`. The site refreshes the published sheets every minute. Candidate filters include attendance and flag status; the Red Flags and Green Flags tabs provide searchable review lists.

## Data sources

- Group Interview CSV: `SHEET_CSV_URL` in `app.js`
- Candidate Roster CSV: `ROSTER_CSV_URL` in `app.js`
- Individual Interview CSV: `INDIVIDUAL_CSV_URL` in `app.js`
- Schedule tab: `SCHEDULE_CSV_URL` in `app.js` (published tab ID: `904572345`)
- Group Interview form link: `FORM_URLS` in `app.js`

The Group Interview form is connected. The Individual Interview sheet currently has no published rows or form URL.

The sign-in screen checks the ID and password from the published App Settings CSV and keeps the session unlocked in the current browser tab.

## Access and privacy

These sheets are published CSVs, so anyone with their links can read their contents directly. The sign-in screen is a convenience gate, not security: its credentials and the sheet data can be read from the published CSVs. Hiding email and phone fields in the site does not remove them from the published roster CSV. Real access control requires unpublishing the sheets and serving them through an authenticated backend or private hosting.
