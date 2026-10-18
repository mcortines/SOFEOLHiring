const loginPanel = document.querySelector('#admin-login');
const workspace = document.querySelector('#admin-workspace');
const loginForm = document.querySelector('#admin-login-form');
const loginError = document.querySelector('#admin-login-error');
const passwordInput = document.querySelector('#admin-password');
const passwordToggle = document.querySelector('#toggle-admin-password');
const scoreSelect = document.querySelector('#score-candidate');
const scoreDetail = document.querySelector('#score-detail');
const leaderboardDetail = document.querySelector('#leaderboard-detail');
let authorization = '';
let scoreRows = [];

function esc(value) { return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char])); }
function basicAuth(username, password) {
  const bytes = new TextEncoder().encode(`${username}:${password}`);
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return `Basic ${btoa(binary)}`;
}
async function api(path) {
  const response = await fetch(`/.netlify/functions/admin-data${path}`, { headers: { authorization }, cache: 'no-store' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status}).`);
  return payload;
}
function candidateName(row) { return row['Candidate Name'] || row.Candidate || row.CandidateName || 'Candidate not named'; }
function renderScores() {
  const row = scoreRows[Number(scoreSelect.value)];
  if (!row) { scoreDetail.innerHTML = '<div class="empty-admin">No Pro Staff score records were found.</div>'; return; }
  const fields = Object.entries(row).filter(([key, value]) => /\|\s*scored/i.test(key) && !/overall score/i.test(key) && String(value).trim());
  const total = Object.entries(row).find(([key]) => /overall score\s*\|\s*scored/i.test(key));
  scoreDetail.innerHTML = `<div class="score-card-name"><div><h2>${esc(candidateName(row))}</h2><p class="admin-meta">${esc(row.ProStaffName || row['ProStaff Name'] || '')}</p></div><span>PRO STAFF EVALUATION</span></div>${fields.length ? `<table class="score-table"><thead><tr><th>Scored area</th><th>Score</th></tr></thead><tbody>${fields.map(([key, value]) => `<tr><td>${esc(key.replace(/\s*\|\s*Scored/i, ''))}</td><td>${esc(value)}</td></tr>`).join('')}${total ? `<tr class="score-total"><td>Overall score</td><td>${esc(total[1])}</td></tr>` : ''}</tbody></table>` : '<div class="empty-admin">This record has no scored fields.</div>'}`;
}
function renderLeaderboard(payload) {
  if (!payload.configured) { leaderboardDetail.innerHTML = '<div class="empty-admin">The leaderboard sheet is not configured yet. Set LEADERBOARD_RANGE in Netlify after adding the leaderboard tab.</div>'; return; }
  const rows = payload.rows || [];
  if (!rows.length) { leaderboardDetail.innerHTML = '<div class="empty-admin">No leaderboard rows were found.</div>'; return; }
  const headers = Object.keys(rows[0]);
  leaderboardDetail.innerHTML = `<h2>Leaderboard</h2><p class="admin-meta">Loaded from the configured private sheet range.</p><table class="leaderboard-table"><thead><tr>${headers.map((header) => `<th>${esc(header)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${headers.map((header) => `<td>${esc(row[header])}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}
loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = loginForm.querySelector('button[type="submit"]');
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = 'Signing in…';
  loginError.hidden = true;
  const form = new FormData(loginForm);
  authorization = basicAuth(String(form.get('username') || ''), String(form.get('password') || ''));
  try {
    const payload = await api('?kind=scores');
    scoreRows = payload.rows || [];
    scoreSelect.innerHTML = scoreRows.map((row, index) => `<option value="${index}">${esc(candidateName(row))}</option>`).join('');
    loginPanel.hidden = true;
    loginForm.reset();
    passwordInput.type = 'password';
    passwordToggle.textContent = 'Show';
    passwordToggle.setAttribute('aria-pressed', 'false');
    workspace.hidden = false;
    renderScores();
    try { renderLeaderboard(await api('?kind=leaderboard')); }
    catch (error) { leaderboardDetail.innerHTML = `<div class="empty-admin">${esc(error.message)}</div>`; }
  } catch (error) {
    authorization = '';
    loginError.textContent = error.message === 'Sign in failed.'
      ? 'The deployed admin function returned a generic sign-in error. Redeploy the latest admin function to see the specific reason.'
      : error.message;
    loginError.hidden = false;
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
});
passwordToggle.addEventListener('click', () => {
  const showing = passwordInput.type === 'password';
  passwordInput.type = showing ? 'text' : 'password';
  passwordToggle.textContent = showing ? 'Hide' : 'Show';
  passwordToggle.setAttribute('aria-pressed', String(showing));
});
scoreSelect.addEventListener('change', renderScores);
document.querySelectorAll('[data-admin-tab]').forEach((button) => button.addEventListener('click', () => {
  document.querySelectorAll('[data-admin-tab]').forEach((tab) => tab.classList.toggle('active', tab === button));
  document.querySelector('#admin-scores').hidden = button.dataset.adminTab !== 'scores';
  document.querySelector('#admin-leaderboard').hidden = button.dataset.adminTab !== 'leaderboard';
}));
document.querySelector('#admin-logout').addEventListener('click', () => {
  authorization = '';
  scoreRows = [];
  scoreSelect.replaceChildren();
  scoreDetail.replaceChildren();
  leaderboardDetail.replaceChildren();
  workspace.hidden = true;
  loginPanel.hidden = false;
  loginForm.reset();
});
