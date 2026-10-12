import { errorResponse, jsonResponse, sheetRows } from './google-sheets.mjs';

const PUBLIC_FIELDS = [
  'Candidate Name',
  'ProStaff Name',
  'Tell us about yourself. What do you do on campus or what do you like to do for fun?',
  'Tell us why you are interested in the Orientation Leader Role.',
  'What are 3 qualities about your personality that you bring to a team?',
  'Describe how you navigate stressful situations and provide an example of a time where you used a strategy that worked in a stressful moment.',
  'Name a work, or academic, accomplishment that makes you proud and what steps did you take to accomplish this?',
  'Describe yourself working within a team setting and what role do you find yourself playing in a team.',
  'Any Questions for us? General Notes:'
];

export default async function handler(request) {
  if (request.method !== 'GET') return jsonResponse(405, { error: 'Method not allowed.' });
  try {
    const rows = await sheetRows("'Pro Staff Individual Interview'!A:Z");
    return jsonResponse(200, rows.map((row) => Object.fromEntries(PUBLIC_FIELDS.filter((field) => field in row).map((field) => [field, row[field]]))));
  } catch (error) {
    return errorResponse(error);
  }
}
