import { createSign, timingSafeEqual } from 'node:crypto';

const APP_SETTINGS_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRRi96oVY8-Twrumm6lMime9N3gG7ZKKBEq5N9i1PCCfl81TDmLQuCHrkLU1F_Fsw/pub?gid=658832579&single=true&output=csv';

export function jsonResponse(statusCode, payload) {
  return new Response(JSON.stringify(payload), {
    status: statusCode,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });
}

export async function isAuthorized(event) {
  const authorization = typeof event.headers?.get === 'function'
    ? event.headers.get('authorization') || ''
    : event.headers?.authorization || event.headers?.Authorization || '';
  if (!authorization.startsWith('Basic ')) return false;
  let supplied;
  try { supplied = Buffer.from(authorization.slice(6), 'base64').toString('utf8'); } catch { return false; }
  const splitAt = supplied.indexOf(':');
  if (splitAt < 0) return false;

  const response = await fetch(APP_SETTINGS_CSV_URL, { cache: 'no-store' });
  if (!response.ok) throw new Error('Could not read the published App Settings sheet.');
  const [headers = [], ...records] = parseCsv(await response.text());
  const settingIndex = headers.findIndex((header) => header.trim().toUpperCase() === 'SETTING');
  const valueIndex = headers.findIndex((header) => header.trim().toUpperCase() === 'VALUE');
  if (settingIndex < 0 || valueIndex < 0) throw new Error('The App Settings sheet needs Setting and Value columns.');
  const normalizeSetting = (value) => String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  const settings = new Map(records.map((row) => [normalizeSetting(row[settingIndex]), String(row[valueIndex] || '').trim()]));
  const firstSetting = (...names) => names.map(normalizeSetting).map((name) => settings.get(name)).find(Boolean) || '';
  const expectedUser = firstSetting('ADMIN_USER', 'ADMIN_USER_ID', 'ADMIN_ID', 'ADMIN_NAME');
  const expectedPassword = firstSetting('ADMIN_PASSWORD', 'ADMIN_PASS');
  if (!expectedUser || !expectedPassword) {
    const missing = [!expectedUser && 'ADMIN_USER', !expectedPassword && 'ADMIN_PASSWORD'].filter(Boolean);
    throw new Error(`Admin sign-in is not configured: missing ${missing.join(' and ')} row${missing.length > 1 ? 's' : ''} in App Settings.`);
  }
  const suppliedUser = supplied.slice(0, splitAt);
  const suppliedPassword = supplied.slice(splitAt + 1);
  const matches = (actual, expected) => {
    const actualBytes = Buffer.from(actual);
    const expectedBytes = Buffer.from(expected);
    return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
  };
  return matches(suppliedUser, expectedUser) && matches(suppliedPassword, expectedPassword);
}

function parseCsv(source) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') { field += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; }
    else field += char;
  }
  if (field.length || row.length) { row.push(field.replace(/\r$/, '')); rows.push(row); }
  return rows;
}

async function googleAccessToken() {
  const rawCredentials = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!rawCredentials) throw new Error('Google Sheets access is not configured.');
  const credentials = JSON.parse(rawCredentials);
  const now = Math.floor(Date.now() / 1000);
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({ iss: credentials.client_email, scope: 'https://www.googleapis.com/auth/spreadsheets.readonly', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })}`;
  const signer = createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  const assertion = `${unsigned}.${signer.sign(credentials.private_key.replace(/\\n/g, '\n'), 'base64url')}`;
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion })
  });
  const token = await response.json();
  if (!response.ok || !token.access_token) throw new Error('Could not authenticate with Google Sheets.');
  return token.access_token;
}

export async function sheetRows(range) {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  if (!spreadsheetId) throw new Error('Google Sheets access is not configured.');
  const accessToken = await googleAccessToken();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`;
  const response = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` } });
  const payload = await response.json();
  if (!response.ok) throw new Error('Could not read the configured Google Sheet.');
  const [headers = [], ...rows] = payload.values || [];
  return rows.map((cells) => Object.fromEntries(headers.map((header, index) => [String(header).trim(), String(cells[index] ?? '').trim()]))).filter((row) => Object.values(row).some(Boolean));
}

export function errorResponse(error) {
  const message = error instanceof Error ? error.message : 'Request failed.';
  const configurationError = /not configured/i.test(message);
  return jsonResponse(configurationError ? 503 : 502, { error: message });
}
