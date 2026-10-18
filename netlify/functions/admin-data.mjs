import { errorResponse, isAuthorized, jsonResponse, sheetRows } from './google-sheets.mjs';

export default async function handler(request) {
  if (request.method !== 'GET') return jsonResponse(405, { error: 'Method not allowed.' });
  try {
    if (!await isAuthorized({ headers: request.headers })) return jsonResponse(401, { error: 'Incorrect username or password.' });
    const kind = new URL(request.url).searchParams.get('kind') || 'scores';
    if (kind === 'leaderboard') {
      const range = process.env.LEADERBOARD_RANGE;
      if (!range) return jsonResponse(200, { configured: false, rows: [] });
      return jsonResponse(200, { configured: true, rows: await sheetRows(range) });
    }
    return jsonResponse(200, { rows: await sheetRows("'Pro Staff Individual Interview'!A:Z") });
  } catch (error) {
    return errorResponse(error);
  }
}
