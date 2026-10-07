const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRRi96oVY8-Twrumm6lMime9N3gG7ZKKBEq5N9i1PCCfl81TDmLQuCHrkLU1F_Fsw/pub?output=csv';
const ROSTER_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRRi96oVY8-Twrumm6lMime9N3gG7ZKKBEq5N9i1PCCfl81TDmLQuCHrkLU1F_Fsw/pub?gid=1691210710&single=true&output=csv';
const INDIVIDUAL_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRRi96oVY8-Twrumm6lMime9N3gG7ZKKBEq5N9i1PCCfl81TDmLQuCHrkLU1F_Fsw/pub?gid=684979261&single=true&output=csv';
const APP_SETTINGS_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRRi96oVY8-Twrumm6lMime9N3gG7ZKKBEq5N9i1PCCfl81TDmLQuCHrkLU1F_Fsw/pub?gid=658832579&single=true&output=csv';
const FORM_URLS = { group: 'https://forms.cloud.microsoft/Pages/ResponsePage.aspx?id=LIJNcIo1hEeaFkniC3X5QZtYqDnv6RxMvor0K6KnZCtUQU43Tk9QTlo1NjVWTE9IWkxQQVVTWFlCMS4u', individual: '' };
const REFRESH_INTERVAL = 60_000;
const DELIBERATION_HEADERS = ['Facilitator','Session','Table Number','Candidate','Scenario 1','Scenario 2','Scenario 3','Opinion','Green Flag','Red Flag','Neutral','Additional Notes'];
const state = { records: [], roster: [], individual: [], activeCandidate: '', query: '', rosterQuery: '', redFlagQuery: '', greenFlagQuery: '', interviewFilter: 'all', flagFilter: 'all', updatedAt: null, rosterUpdatedAt: null, started: false };
const $ = (selector) => document.querySelector(selector);
let loadingDismissed = false;

function parseCSV(source) {
  const rows = []; let row = []; let field = ''; let quoted = false;
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
  return rows.filter((cells) => cells.some((cell) => cell.trim()));
}

function recordsFromCSV(source) {
  const [headers = [], ...rows] = parseCSV(source);
  return rows.map((cells) => Object.fromEntries(headers.map((header, index) => [header.trim(), (cells[index] || '').trim()])));
}
function deliberationRecords(source) {
  const rows = recordsFromCSV(source);
  return rows.map((row) => Object.fromEntries(DELIBERATION_HEADERS.map((header) => [header, row[header] || '']))).filter((row) => row.Candidate);
}
function clean(value) { return String(value || '').trim(); }
function normalize(value) { return clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
function firstNameAliases(value) { value = clean(value); return [value, ...Array.from(value.matchAll(/\(([^)]+)\)/g), (match) => match[1]), value.replace(/\([^)]*\)/g, '')].map(clean).filter(Boolean); }
function rosterName(record) { return [record['Student First Name'], record['Student Last Name']].map(clean).filter(Boolean).join(' '); }
function rosterMatchesName(record, candidateName) {
  const last = normalize(record['Student Last Name']);
  const candidateTokens = normalize(candidateName).split(' ');
  const rosterFirstVariants = firstNameAliases(record['Student First Name']).map(normalize);
  const candidateLast = candidateTokens.at(-1);
  const candidateFirst = candidateTokens[0];
  return normalize(rosterName(record)) === normalize(candidateName) || (last && last === candidateLast && rosterFirstVariants.includes(candidateFirst));
}
function groupRecordsFor(name) { return state.records.filter((record) => state.roster.some((person) => rosterName(person) === name && rosterMatchesName(person, record.Candidate)) || normalize(record.Candidate) === normalize(name)); }
function rosterForGroup(name) { return state.roster.find((person) => rosterMatchesName(person, name)); }
function individualCandidateName(row) {
  const candidateField = Object.keys(row).find((key) => /candidate|student name|full name/i.test(key));
  if (candidateField && clean(row[candidateField])) return clean(row[candidateField]);
  const first = Object.keys(row).find((key) => /first name/i.test(key));
  const last = Object.keys(row).find((key) => /last name/i.test(key));
  return [first && row[first], last && row[last]].map(clean).filter(Boolean).join(' ');
}
function individualFor(name) {
  const person = state.roster.find((row) => rosterName(row) === name);
  return state.individual.filter((row) => {
    const candidate = individualCandidateName(row);
    return candidate && (normalize(candidate) === normalize(name) || (person && rosterMatchesName(person, candidate)));
  });
}
function hasFlag(value) { return clean(value) && !['—','-','none','n/a'].includes(clean(value).toLowerCase()); }
function groupedCandidates() {
  const grouped = new Map();
  for (const record of state.records) {
    const person = rosterForGroup(record.Candidate);
    const name = person ? rosterName(person) : record.Candidate.trim();
    const current = grouped.get(name) || { name, interviews: [], roster: person || null };
    current.interviews.push(record); grouped.set(name, current);
  }
  return [...grouped.values()].sort((a, b) => a.name.localeCompare(b.name));
}
function directoryCandidates() {
  const byName = new Map(state.roster.filter((row) => rosterName(row)).map((row) => [rosterName(row), { name: rosterName(row), roster: row, interviews: groupRecordsFor(rosterName(row)) }]));
  for (const item of groupedCandidates()) {
    if (!byName.has(item.name)) byName.set(item.name, item);
    else byName.get(item.name).interviews = item.interviews;
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}
function initials(name) { return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase(); }
function esc(value) { return String(value ?? '').replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char])); }
function formatTime(date) { return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date); }
function toast(message) { const element = $('#toast'); element.textContent = message; element.classList.add('show'); window.setTimeout(() => element.classList.remove('show'), 2600); }

function renderList() {
  const candidates = directoryCandidates();
  const filtered = candidates.filter(({ name, roster, interviews }) => {
    const haystack = name.toLowerCase();
    const attended = normalize(roster?.['Did the attend the group interview?']) === 'yes';
    const hasNotes = interviews.length > 0;
    const hasRed = interviews.some((row) => hasFlag(row['Red Flag']));
    const hasGreen = interviews.some((row) => hasFlag(row['Green Flag']));
    const interviewMatches = state.interviewFilter === 'all' || (state.interviewFilter === 'attended' && attended) || (state.interviewFilter === 'missed' && roster && !attended) || (state.interviewFilter === 'reviewed' && hasNotes);
    const flagMatches = state.flagFilter === 'all' || (state.flagFilter === 'red' && hasRed) || (state.flagFilter === 'green' && hasGreen) || (state.flagFilter === 'none' && !hasRed && !hasGreen);
    return haystack.includes(state.query.toLowerCase()) && interviewMatches && flagMatches;
  });
  $('#candidate-count').textContent = state.roster.length || candidates.length;
  $('#stat-candidates').textContent = state.roster.length || candidates.length;
  const attendeeCount = candidates.filter(({ roster }) => normalize(roster?.['Did the attend the group interview?']) === 'yes').length;
  $('#interview-filter option[value="attended"]').textContent = `Attended group interview (${attendeeCount})`;
  $('#result-count').textContent = filtered.length;
  $('#empty-results').hidden = filtered.length > 0;
  $('#candidate-list').innerHTML = filtered.slice(0, 250).map(({ name, interviews, roster }) => {
    const interview = interviews[0]; const meta = interview ? `${interview.Session || 'Group interview'} · Table ${interview['Table Number'] || '—'}` : `Group interview: ${roster?.['Did the attend the group interview?'] || 'No record'}`;
    return `<button class="candidate-row${name === state.activeCandidate ? ' selected' : ''}" type="button" data-candidate="${esc(name)}"><span class="avatar">${esc(initials(name))}</span><span class="candidate-name">${esc(name)}<span class="candidate-meta">${esc(meta)}</span></span><span class="row-arrow">›</span></button>`;
  }).join('');
  $('#candidate-list').querySelectorAll('[data-candidate]').forEach((button) => button.addEventListener('click', () => selectCandidate(button.dataset.candidate)));
}

function resumeLink(value) { const url = clean(value); if (!/^https?:\/\//i.test(url)) return esc(url || '—'); return `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">Open resume ↗</a>`; }
function renderRosterProfile(person) {
  if (!person) return '';
  const fields = [
    ['GPA', person.GPA ? esc(person.GPA) : ''],
    ['Group interview', person['Did the attend the group interview?'] ? `<span class="attendance-pill ${normalize(person['Did the attend the group interview?']) === 'yes' ? 'attended' : ''}">${esc(person['Did the attend the group interview?'])}</span>` : ''],
    ['Reason for absence', person['If not whats the reason?'] ? esc(person['If not whats the reason?']) : ''],
    ['Resume', person.Resume ? resumeLink(person.Resume) : '']
  ].filter(([, value]) => value);
  return `<section class="profile-card"><div class="block-title"><h3>ROSTER DETAILS</h3><span>Candidate Roster</span></div><div class="profile-fields">${fields.map(([label, value]) => `<div class="profile-field"><span class="profile-label">${esc(label)}</span><strong class="profile-value">${value}</strong></div>`).join('')}</div>${person.Notes ? `<div class="roster-notes"><span>ROSTER NOTES</span><p>${esc(person.Notes)}</p></div>` : ''}</section>`;
}
function renderCandidateFormActions() {
  const actions = [
    ['group', 'Group interview form'],
    ['individual', 'Individual interview form']
  ];
  return `<div class="candidate-form-actions">${actions.map(([key, label]) => FORM_URLS[key] ? `<a class="candidate-form-link" href="${esc(FORM_URLS[key])}" target="_blank" rel="noopener noreferrer">${esc(label)} <span>↗</span></a>` : `<span class="candidate-form-link unavailable">${esc(label)} · link needed</span>`).join('')}</div>`;
}
function renderInterview(record, index) {
  const scenarios = [1, 2, 3].map((number) => `<div class="scenario-card"><h4>SCENARIO 0${number}</h4><p>${esc(record[`Scenario ${number}`] || 'No response recorded.')}</p></div>`).join('');
  const flags = [['Green Flag','green'],['Red Flag','red'],['Neutral','']].map(([label, kind]) => `<div class="flag-card ${kind}"><h4>${label.toUpperCase()}</h4><p>${esc(record[label] || '—')}</p></div>`).join('');
  const opinion = record.Opinion ? `<div class="opinion-card"><p class="eyebrow">FACILITATOR IMPRESSION</p><p>${esc(record.Opinion)}</p></div>` : '';
  const notes = record['Additional Notes'] ? `<div class="additional-notes"><div class="block-title"><h3>ADDITIONAL NOTES</h3></div><p class="note-copy">${esc(record['Additional Notes'])}</p></div>` : '';
  return `<section class="detail-session"><p class="detail-session-label">${index ? `SESSION ${index + 1} · ` : ''}${esc(record.Session || 'Session not listed')}</p><div class="interview-block"><div class="block-title"><h3>GROUP INTERVIEW</h3><span>Table ${esc(record['Table Number'] || '—')} · ${esc(record.Facilitator || 'Facilitator not listed')}</span></div><div class="scenario-grid">${scenarios}</div>${opinion}</div><div class="interview-block"><div class="block-title"><h3>DELIBERATION FLAGS</h3></div><div class="flag-grid">${flags}</div>${notes}</div></section>`;
}
function selectCandidate(name) {
  state.activeCandidate = name; renderList();
  const candidate = directoryCandidates().find((item) => item.name === name);
  if (!candidate) return;
  const entries = candidate.interviews.map(renderInterview).join('');
  const individuals = individualFor(name);
  const individualEntries = individuals.map((row) => {
    const values = Object.entries(row).filter(([key, value]) => clean(value) && !/candidate|student name|first name|last name|email|phone/i.test(key));
    return `<section class="individual-card"><div class="block-title"><h3>INDIVIDUAL INTERVIEW</h3><span>${esc(row.Session || row.Date || 'Interview notes')}</span></div><div class="individual-fields">${values.map(([key, value]) => `<div><span>${esc(key)}</span><p>${esc(value)}</p></div>`).join('')}</div></section>`;
  }).join('');
  const groupMessage = candidate.interviews.length ? '' : '<div class="no-interview-note">No group deliberation record found for this candidate yet.</div>';
  const individualMessage = individuals.length ? '' : '<div class="no-interview-note">No individual interview record is currently published for this candidate.</div>';
  $('#candidate-detail').innerHTML = `<header class="detail-header"><div><p class="eyebrow">CANDIDATE PROFILE</p><h2>${esc(candidate.name)}</h2><p class="detail-subtitle">${candidate.interviews.length} group · ${individuals.length} individual interview records</p></div><span class="session-chip">CANDIDATE FILE</span></header>${renderCandidateFormActions()}${renderRosterProfile(candidate.roster)}${groupMessage}${entries}${individualMessage}${individualEntries}`;
}

function renderRosterTable() {
  const query = state.rosterQuery.toLowerCase();
  const filtered = state.roster.filter((person) => `${rosterName(person)} ${person['Did the attend the group interview?'] || ''}`.toLowerCase().includes(query));
  $('#roster-count').textContent = `${filtered.length.toLocaleString()} of ${state.roster.length.toLocaleString()} candidates`;
  $('#roster-empty').hidden = filtered.length > 0;
  $('#roster-table-body').innerHTML = filtered.slice(0, 400).map((person) => `<tr><td><button class="roster-name-button" type="button" data-roster-name="${esc(rosterName(person))}">${esc(rosterName(person))}</button></td><td><span class="attendance-pill ${normalize(person['Did the attend the group interview?']) === 'yes' ? 'attended' : ''}">${esc(person['Did the attend the group interview?'] || 'Not listed')}</span></td><td>${esc(person.GPA || '—')}</td><td><button class="table-open" type="button" data-roster-name="${esc(rosterName(person))}" aria-label="Open ${esc(rosterName(person))}">↗</button></td></tr>`).join('');
  $('#roster-table-body').querySelectorAll('[data-roster-name]').forEach((button) => button.addEventListener('click', () => { selectCandidate(button.dataset.rosterName); location.hash = '#candidates'; showPage('candidates'); }));
}

function renderRedFlags() {
  const flags = state.records.filter((record) => clean(record['Red Flag']) && !['—','-','none','n/a'].includes(clean(record['Red Flag']).toLowerCase())).map((record) => ({ candidate: rosterForGroup(record.Candidate), name: rosterForGroup(record.Candidate) ? rosterName(rosterForGroup(record.Candidate)) : record.Candidate, record }));
  const filtered = flags.filter(({ name, record }) => `${name} ${record['Red Flag']} ${record.Opinion}`.toLowerCase().includes(state.redFlagQuery.toLowerCase()));
  $('#red-flag-count').textContent = `${filtered.length} flagged record${filtered.length === 1 ? '' : 's'}`;
  $('#red-flag-empty').hidden = filtered.length > 0;
  $('#red-flag-list').innerHTML = filtered.map(({ name, record }) => `<article class="red-flag-card"><div class="red-flag-person"><span class="avatar">${esc(initials(name))}</span><div><button type="button" class="red-flag-name" data-flag-name="${esc(name)}">${esc(name)}</button><span>${esc(record.Session || 'Session not listed')} · Table ${esc(record['Table Number'] || '—')}</span></div></div><div class="red-flag-copy"><span class="red-flag-label">RED FLAG · FACILITATOR NOTES</span><p>${esc(record['Red Flag'])}</p>${record.Opinion ? `<details><summary>More facilitator context</summary><p>${esc(record.Opinion)}</p></details>` : ''}</div><button class="flag-view-button" type="button" data-flag-name="${esc(name)}">View candidate ↗</button></article>`).join('');
  $('#red-flag-list').querySelectorAll('[data-flag-name]').forEach((button) => button.addEventListener('click', () => { selectCandidate(button.dataset.flagName); location.hash = '#candidates'; showPage('candidates'); }));
}
function renderGreenFlags() {
  const flags = state.records.filter((record) => hasFlag(record['Green Flag'])).map((record) => ({ name: rosterForGroup(record.Candidate) ? rosterName(rosterForGroup(record.Candidate)) : record.Candidate, record }));
  const filtered = flags.filter(({ name, record }) => `${name} ${record['Green Flag']} ${record.Opinion}`.toLowerCase().includes(state.greenFlagQuery.toLowerCase()));
  $('#green-flag-count').textContent = `${filtered.length} flagged record${filtered.length === 1 ? '' : 's'}`;
  $('#green-flag-empty').hidden = filtered.length > 0;
  $('#green-flag-list').innerHTML = filtered.map(({ name, record }) => `<article class="red-flag-card green-flag-card"><div class="red-flag-person"><span class="avatar">${esc(initials(name))}</span><div><button type="button" class="red-flag-name" data-flag-name="${esc(name)}">${esc(name)}</button><span>${esc(record.Session || 'Session not listed')} · Table ${esc(record['Table Number'] || '—')}</span></div></div><div class="red-flag-copy"><span class="red-flag-label">GREEN FLAG · FACILITATOR NOTES</span><p>${esc(record['Green Flag'])}</p>${record.Opinion ? `<details><summary>More facilitator context</summary><p>${esc(record.Opinion)}</p></details>` : ''}</div><button class="flag-view-button" type="button" data-flag-name="${esc(name)}">View candidate ↗</button></article>`).join('');
  $('#green-flag-list').querySelectorAll('[data-flag-name]').forEach((button) => button.addEventListener('click', () => { selectCandidate(button.dataset.flagName); location.hash = '#candidates'; showPage('candidates'); }));
}

function setSync(id, status, message) { const dot = $(`#${id}-dot`); if (dot) dot.classList.toggle('connected', status === 'live'); const label = $(`#${id}-status`); if (label) label.textContent = message; }
function setGlobalSync(status, message) { const indicator = $('.sync-indicator'); indicator.classList.toggle('live', status === 'live'); indicator.classList.toggle('error', status === 'error'); $('#sync-label').textContent = message; }

async function loadGroup(manual = false) {
  try {
    const response = await fetch(`${SHEET_CSV_URL}&_=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Sheet returned ${response.status}`);
    const records = deliberationRecords(await response.text());
    if (!records.length) throw new Error('No deliberation rows found');
    state.records = records; state.updatedAt = new Date();
    renderList(); renderRedFlags();
    if (state.activeCandidate) selectCandidate(state.activeCandidate);
    $('#last-updated').textContent = formatTime(state.updatedAt);
    setSync('group-source', 'live', `Connected · ${records.length} deliberation rows · ${formatTime(state.updatedAt)}`);
    setGlobalSync('live', `Live · ${formatTime(state.updatedAt)}`);
    if (manual) toast('Deliberation data refreshed.');
  } catch (error) {
    console.error('Could not load deliberation sheet:', error);
    setSync('group-source', 'error', 'Could not connect to the published CSV.');
    if (manual) toast('Could not refresh group deliberation data.');
  }
}

async function loadRoster(manual = false) {
  try {
    const response = await fetch(`${ROSTER_CSV_URL}&_=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Roster returned ${response.status}`);
    const roster = recordsFromCSV(await response.text()).filter((row) => rosterName(row));
    if (!roster.length) throw new Error('No candidate roster rows found');
    state.roster = roster; state.rosterUpdatedAt = new Date();
    renderList(); renderRosterTable(); renderRedFlags();
    if (state.activeCandidate) selectCandidate(state.activeCandidate);
    setSync('roster-source', 'live', `Connected · ${roster.length} candidates · ${formatTime(state.rosterUpdatedAt)}`);
    if (manual) toast('Candidate roster refreshed.');
  } catch (error) {
    console.error('Could not load candidate roster:', error);
    setSync('roster-source', 'error', 'Could not connect to the published CSV.');
    if (manual) toast('Could not refresh the candidate roster.');
  }
}

async function loadIndividual() {
  try {
    const response = await fetch(`${INDIVIDUAL_CSV_URL}&_=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Individual interview sheet returned ${response.status}`);
    const rows = recordsFromCSV(await response.text());
    state.individual = rows.filter((row) => Object.values(row).some((value) => clean(value)));
    if (state.activeCandidate) selectCandidate(state.activeCandidate);
  } catch (error) {
    console.error('Could not load individual interview sheet:', error);
  }
}

function hideLoading() {
  if (loadingDismissed) return;
  loadingDismissed = true;
  const screen = $('#loading-screen');
  $('#loader-status').textContent = state.records.length || state.roster.length ? 'Your deliberation hub is ready' : 'Opening the workspace';
  window.setTimeout(() => { screen.classList.add('loading-done'); window.setTimeout(() => { screen.hidden = true; }, 650); }, 350);
}
async function verifyLogin(event) {
  event.preventDefault();
  const error = $('#login-error'); const button = $('#login-submit');
  error.hidden = true; button.disabled = true; button.textContent = 'Checking…';
  try {
    const response = await fetch(`${APP_SETTINGS_CSV_URL}&_=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error('Could not reach App Settings.');
    const settings = recordsFromCSV(await response.text());
    const values = Object.fromEntries(settings.map((row) => [normalize(row.Setting), clean(row.Value)]));
    if (!values['user id'] || !values.password) throw new Error('The published App Settings tab needs an ID and password.');
    const idMatches = $('#login-id').value.trim() === values['user id'];
    const passwordMatches = $('#login-password').value === values.password;
    if (!idMatches || !passwordMatches) throw new Error('The ID or password is incorrect.');
    sessionStorage.setItem('nso-deliberation-signed-in', 'true');
    $('#login-form').reset();
    startWorkspace();
  } catch (loginError) {
    error.textContent = loginError.message || 'Sign in could not be verified. Try again.';
    error.hidden = false;
  } finally { button.disabled = false; button.innerHTML = 'Continue <span aria-hidden="true">→</span>'; }
}
function startWorkspace() {
  $('#login-screen').hidden = true;
  if (state.started) return;
  state.started = true;
  $('#loading-screen').hidden = false;
  Promise.all([loadGroup(), loadRoster(), loadIndividual()]).finally(hideLoading);
  window.setTimeout(hideLoading, 12_000);
  window.setInterval(() => Promise.all([loadGroup(), loadRoster(), loadIndividual()]), REFRESH_INTERVAL);
}
function showPage(page) {
  const valid = ['home','candidates','forms','roster','red-flags','green-flags'].includes(page) ? page : 'home';
  document.querySelectorAll('.page').forEach((element) => { element.hidden = element.id !== `page-${valid}`; });
  document.querySelectorAll('.nav-link').forEach((link) => link.classList.toggle('active', link.dataset.page === valid));
  if (valid === 'candidates' && !state.activeCandidate && directoryCandidates().length) selectCandidate(directoryCandidates()[0].name);
  if (valid === 'roster') renderRosterTable();
  if (valid === 'red-flags') renderRedFlags();
  if (valid === 'green-flags') renderGreenFlags();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.querySelectorAll('.nav-link').forEach((link) => link.addEventListener('click', () => showPage(link.dataset.page)));
document.querySelectorAll('a[href^="#"]').forEach((link) => link.addEventListener('click', (event) => { const page = link.getAttribute('href').slice(1); if (['home','candidates','forms','roster','red-flags','green-flags'].includes(page)) { event.preventDefault(); history.replaceState(null, '', `#${page}`); showPage(page); } }));
window.addEventListener('hashchange', () => showPage(location.hash.slice(1)));
$('#candidate-search').addEventListener('input', (event) => { state.query = event.target.value.trim(); renderList(); });
$('#roster-search').addEventListener('input', (event) => { state.rosterQuery = event.target.value.trim(); renderRosterTable(); });
$('#red-flag-search').addEventListener('input', (event) => { state.redFlagQuery = event.target.value.trim(); renderRedFlags(); });
$('#green-flag-search').addEventListener('input', (event) => { state.greenFlagQuery = event.target.value.trim(); renderGreenFlags(); });
$('#interview-filter').addEventListener('change', (event) => { state.interviewFilter = event.target.value; renderList(); });
$('#flag-filter').addEventListener('change', (event) => { state.flagFilter = event.target.value; renderList(); });
$('#refresh-button').addEventListener('click', () => Promise.all([loadGroup(true), loadRoster(true)]));
$('#roster-refresh-button').addEventListener('click', () => Promise.all([loadGroup(true), loadRoster(true)]));
document.addEventListener('keydown', (event) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); location.hash = '#candidates'; showPage('candidates'); $('#candidate-search').focus(); } });
document.querySelectorAll('[data-form]').forEach((link) => { const url = FORM_URLS[link.dataset.form]; if (url) { link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.classList.remove('unavailable'); link.textContent = 'Open Google Form ↗'; } });
showPage(location.hash.slice(1));
$('#login-form').addEventListener('submit', verifyLogin);
if (sessionStorage.getItem('nso-deliberation-signed-in') === 'true') startWorkspace();
else $('#login-screen').hidden = false;
