import { createSign } from 'node:crypto';

export function jsonResponse(statusCode, payload) {
  return new Response(JSON.stringify(payload), {
    status: statusCode,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });
}

export function isAuthorized(event) {
  const expectedUser = process.env.ADMIN_USER || '';
  const expectedPassword = process.env.ADMIN_PASSWORD || '';
  if (!expectedUser || !expectedPassword) return false;
  const authorization = typeof event.headers?.get === 'function'
    ? event.headers.get('authorization') || ''
    : event.headers?.authorization || event.headers?.Authorization || '';
  if (!authorization.startsWith('Basic ')) return false;
  let supplied;
  try { supplied = Buffer.from(authorization.slice(6), 'base64').toString('utf8'); } catch { return false; }
  const splitAt = supplied.indexOf(':');
  return splitAt >= 0 && supplied.slice(0, splitAt) === expectedUser && supplied.slice(splitAt + 1) === expectedPassword;
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
