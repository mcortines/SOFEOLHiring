import { errorResponse, isAuthorized, jsonResponse, sheetRows } from './google-sheets.mjs';

export default async function handler(event) {
  if (event.httpMethod !== 'GET') return jsonResponse(405, { error: 'Method not allowed.' });
  if (!isAuthorized(event)) return jsonResponse(401, { error: 'Sign in failed.' });
  try {
    const kind = event.queryStringParameters?.kind || 'scores';
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
