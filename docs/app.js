// State
let currentUser = null;
let isAdmin = false;

// ==================== AUTH ====================

async function checkAuth() {
  const res = await fetch('/api/me');
  const data = await res.json();
  if (data.loggedIn) {
    currentUser = data.username;
    isAdmin = data.isAdmin;
    showApp();
  }
}

function showTab(tab) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  if (tab === 'login') {
    document.getElementById('login-form').style.display = 'flex';
    document.getElementById('register-form').style.display = 'none';
    document.querySelectorAll('.tab')[0].classList.add('active');
  } else {
    document.getElementById('login-form').style.display = 'none';
    document.getElementById('register-form').style.display = 'flex';
    document.querySelectorAll('.tab')[1].classList.add('active');
  }
  document.getElementById('auth-error').textContent = '';
}

async function login(e) {
  e.preventDefault();
  const username = document.getElementById('login-user').value;
  const password = document.getElementById('login-pass').value;

  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });

  const data = await res.json();
  if (data.success) {
    currentUser = data.username;
    isAdmin = data.isAdmin;
    showApp();
  } else {
    document.getElementById('auth-error').textContent = data.error;
  }
}

async function register(e) {
  e.preventDefault();
  const username = document.getElementById('reg-user').value;
  const password = document.getElementById('reg-pass').value;

  const res = await fetch('/api/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });

  const data = await res.json();
  if (data.success) {
    currentUser = data.username;
    isAdmin = false;
    showApp();
  } else {
    document.getElementById('auth-error').textContent = data.error;
  }
}

async function logout() {
  await fetch('/api/logout', { method: 'POST' });
  currentUser = null;
  isAdmin = false;
  document.getElementById('auth-section').style.display = 'block';
  document.getElementById('main-section').style.display = 'none';
}

function showApp() {
  document.getElementById('auth-section').style.display = 'none';
  document.getElementById('main-section').style.display = 'block';
  document.getElementById('user-greeting').textContent = `Hola, ${currentUser}`;

  if (isAdmin) {
    document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'inline-block');
  }

  loadStandings();
}

// ==================== NAVIGATION ====================

function navigateTo(view) {
  document.querySelectorAll('.view').forEach(v => v.style.display = 'none');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

  document.getElementById(`view-${view}`).style.display = 'block';
  event.target.classList.add('active');

  switch (view) {
    case 'standings': loadStandings(); break;
    case 'matches': loadMatches(); break;
    case 'predictions': loadPredictions(); break;
    case 'admin': loadAdminMatches(); break;
  }
}

// ==================== STANDINGS ====================

async function loadStandings() {
  const res = await fetch('/api/standings');
  const standings = await res.json();

  const tbody = document.getElementById('standings-body');

  if (standings.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No hay jugadores registrados aún</td></tr>';
    return;
  }

  tbody.innerHTML = standings.map((s, i) => {
    const rankClass = i < 3 ? `rank-${i + 1}` : '';
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`;
    return `
      <tr class="${rankClass}">
        <td>${medal}</td>
        <td><strong>${escapeHtml(s.username)}</strong></td>
        <td><strong>${s.total_points}</strong></td>
        <td>${s.exact_results}</td>
        <td>${s.correct_outcomes}</td>
        <td>${s.total_predictions}</td>
      </tr>
    `;
  }).join('');
}

// ==================== MATCHES ====================

async function loadMatches() {
  const group = document.getElementById('group-select').value;
  const url = group ? `/api/matches?group=${group}` : '/api/matches';
  const res = await fetch(url);
  const matches = await res.json();

  const container = document.getElementById('matches-list');

  if (matches.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>No hay partidos disponibles</p></div>';
    return;
  }

  // Load user predictions
  const predRes = await fetch('/api/predictions');
  const predictions = await predRes.json();
  const predMap = {};
  predictions.forEach(p => { predMap[p.match_id] = p; });

  container.innerHTML = matches.map(m => {
    const pred = predMap[m.id];
    const matchDate = formatDate(m.date);
    const canPredict = !m.is_finished && new Date() < new Date(`${m.date}T${m.time_et}:00-04:00`);

    let resultHtml = '';
    if (m.is_finished) {
      resultHtml = `
        <div class="match-score">
          <span class="score">${m.goals_a}</span>
          <span>-</span>
          <span class="score">${m.goals_b}</span>
        </div>
      `;
    }

    let predictionHtml = '';
    if (canPredict) {
      const ga = pred ? pred.goals_a : '';
      const gb = pred ? pred.goals_b : '';
      predictionHtml = `
        <div class="prediction-form">
          <input type="number" min="0" max="20" id="pred-a-${m.id}" value="${ga}" placeholder="0">
          <span>-</span>
          <input type="number" min="0" max="20" id="pred-b-${m.id}" value="${gb}" placeholder="0">
          <button class="btn primary" onclick="savePrediction(${m.id})">Guardar</button>
        </div>
        <div id="pred-msg-${m.id}" class="prediction-saved"></div>
      `;
    } else if (pred && m.is_finished) {
      const pointsClass = `points-${pred.points}`;
      predictionHtml = `
        <div class="prediction-saved">
          Tu pronóstico: ${pred.goals_a} - ${pred.goals_b}
          <span class="points-badge ${pointsClass}">${pred.points} pts</span>
        </div>
      `;
    } else if (pred) {
      predictionHtml = `<div class="prediction-saved">Tu pronóstico: ${pred.goals_a} - ${pred.goals_b} ✓</div>`;
    }

    return `
      <div class="match-card ${m.is_finished ? 'finished' : ''}">
        <div class="match-header">
          <span class="match-group">Grupo ${m.group_name}</span>
          <span>${matchDate} • ${m.time_et} ET</span>
        </div>
        <div class="match-teams">
          <span class="team">${escapeHtml(m.team_a)}</span>
          <span class="vs">vs</span>
          <span class="team">${escapeHtml(m.team_b)}</span>
        </div>
        ${resultHtml}
        ${predictionHtml}
      </div>
    `;
  }).join('');
}

async function savePrediction(matchId) {
  const goalsA = parseInt(document.getElementById(`pred-a-${matchId}`).value);
  const goalsB = parseInt(document.getElementById(`pred-b-${matchId}`).value);

  if (isNaN(goalsA) || isNaN(goalsB) || goalsA < 0 || goalsB < 0) {
    document.getElementById(`pred-msg-${matchId}`).textContent = '❌ Ingresa goles válidos';
    return;
  }

  const res = await fetch('/api/predictions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ match_id: matchId, goals_a: goalsA, goals_b: goalsB })
  });

  const data = await res.json();
  const msgEl = document.getElementById(`pred-msg-${matchId}`);

  if (data.success) {
    msgEl.textContent = '✅ Pronóstico guardado';
    msgEl.style.color = '#4caf50';
  } else {
    msgEl.textContent = `❌ ${data.error}`;
    msgEl.style.color = '#f44336';
  }
}

// ==================== PREDICTIONS ====================

async function loadPredictions() {
  const res = await fetch('/api/predictions');
  const predictions = await res.json();

  const container = document.getElementById('predictions-list');

  if (predictions.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>No has hecho pronósticos aún</p><p>Ve a la sección de Partidos para hacer tus pronósticos</p></div>';
    return;
  }

  container.innerHTML = predictions.map(p => {
    let statusHtml = '';
    if (p.is_finished) {
      const pointsClass = `points-${p.points}`;
      statusHtml = `
        <div class="match-score">
          <span>Resultado: <strong>${p.real_goals_a} - ${p.real_goals_b}</strong></span>
          <span class="points-badge ${pointsClass}">${p.points} pts</span>
        </div>
      `;
    } else {
      statusHtml = '<div class="prediction-saved">⏳ Pendiente</div>';
    }

    return `
      <div class="match-card ${p.is_finished ? 'finished' : ''}">
        <div class="match-header">
          <span class="match-group">Grupo ${p.group_name}</span>
          <span>${formatDate(p.date)}</span>
        </div>
        <div class="match-teams">
          <span class="team">${escapeHtml(p.team_a)}</span>
          <span class="vs">${p.goals_a} - ${p.goals_b}</span>
          <span class="team">${escapeHtml(p.team_b)}</span>
        </div>
        ${statusHtml}
      </div>
    `;
  }).join('');
}

// ==================== ADMIN ====================

async function loadAdminMatches() {
  const group = document.getElementById('admin-group-select').value;
  const url = group ? `/api/matches?group=${group}` : '/api/matches';
  const res = await fetch(url);
  const matches = await res.json();

  const container = document.getElementById('admin-matches-list');

  container.innerHTML = matches.map(m => {
    let formHtml = '';
    if (m.is_finished) {
      formHtml = `<div class="prediction-saved">✅ Resultado: ${m.goals_a} - ${m.goals_b}</div>`;
    } else {
      formHtml = `
        <div class="admin-result-form">
          <input type="number" min="0" max="20" id="admin-a-${m.id}" placeholder="0">
          <span>-</span>
          <input type="number" min="0" max="20" id="admin-b-${m.id}" placeholder="0">
          <button class="btn" onclick="saveResult(${m.id})">Cargar Resultado</button>
        </div>
        <div id="admin-msg-${m.id}" class="prediction-saved"></div>
      `;
    }

    return `
      <div class="match-card ${m.is_finished ? 'finished' : ''}">
        <div class="match-header">
          <span class="match-group">Grupo ${m.group_name}</span>
          <span>${formatDate(m.date)} • ${m.time_et} ET</span>
        </div>
        <div class="match-teams">
          <span class="team">${escapeHtml(m.team_a)}</span>
          <span class="vs">vs</span>
          <span class="team">${escapeHtml(m.team_b)}</span>
        </div>
        ${formHtml}
      </div>
    `;
  }).join('');
}

async function saveResult(matchId) {
  const goalsA = parseInt(document.getElementById(`admin-a-${matchId}`).value);
  const goalsB = parseInt(document.getElementById(`admin-b-${matchId}`).value);

  if (isNaN(goalsA) || isNaN(goalsB) || goalsA < 0 || goalsB < 0) {
    document.getElementById(`admin-msg-${matchId}`).textContent = '❌ Ingresa goles válidos';
    return;
  }

  const res = await fetch(`/api/matches/${matchId}/result`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ goals_a: goalsA, goals_b: goalsB })
  });

  const data = await res.json();
  const msgEl = document.getElementById(`admin-msg-${matchId}`);

  if (data.success) {
    msgEl.textContent = '✅ Resultado guardado y puntos calculados';
    msgEl.style.color = '#4caf50';
    setTimeout(() => loadAdminMatches(), 1000);
  } else {
    msgEl.textContent = `❌ ${data.error}`;
    msgEl.style.color = '#f44336';
  }
}

// ==================== UTILS ====================

function formatDate(dateStr) {
  const date = new Date(dateStr + 'T12:00:00');
  return date.toLocaleDateString('es-ES', {
    weekday: 'short',
    day: 'numeric',
    month: 'short'
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Init
checkAuth();
