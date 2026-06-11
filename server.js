const express = require('express');
const session = require('express-session');
const initSqlJs = require('sql.js');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'polla.db');

let db;

// Persist database to disk
function saveDb() {
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

// Auto-save every 30 seconds
setInterval(saveDb, 30000);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: 'polla-mundialista-2026-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 } // 7 days
}));

// Auth middleware
function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.userId || !req.session.isAdmin) {
    return res.status(403).json({ error: 'Acceso denegado' });
  }
  next();
}

// Helper: get single row
function getOne(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  let result = null;
  if (stmt.step()) {
    result = stmt.getAsObject();
  }
  stmt.free();
  return result;
}

// Helper: get all rows
function getAll(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

// Helper: run statement
function run(sql, params = []) {
  db.run(sql, params);
  saveDb();
}

// ==================== AUTH ROUTES ====================

app.post('/api/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Usuario y contraseña son requeridos' });
  }
  if (username.length < 3 || password.length < 4) {
    return res.status(400).json({ error: 'Usuario mínimo 3 caracteres, contraseña mínimo 4' });
  }

  const existing = getOne('SELECT id FROM users WHERE username = ?', [username]);
  if (existing) {
    return res.status(400).json({ error: 'El usuario ya existe' });
  }

  const hash = bcrypt.hashSync(password, 10);
  run('INSERT INTO users (username, password) VALUES (?, ?)', [username, hash]);
  const user = getOne('SELECT id FROM users WHERE username = ?', [username]);

  req.session.userId = user.id;
  req.session.username = username;
  req.session.isAdmin = false;
  res.json({ success: true, username });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const user = getOne('SELECT * FROM users WHERE username = ?', [username]);

  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Credenciales incorrectas' });
  }

  req.session.userId = user.id;
  req.session.username = user.username;
  req.session.isAdmin = user.is_admin === 1;
  res.json({ success: true, username: user.username, isAdmin: user.is_admin === 1 });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get('/api/me', (req, res) => {
  if (!req.session.userId) {
    return res.json({ loggedIn: false });
  }
  res.json({
    loggedIn: true,
    username: req.session.username,
    isAdmin: req.session.isAdmin
  });
});

// ==================== MATCHES ROUTES ====================

app.get('/api/matches', requireAuth, (req, res) => {
  const { group, stage } = req.query;
  let query = 'SELECT * FROM matches';
  const params = [];

  if (group) {
    query += ' WHERE group_name = ?';
    params.push(group);
  } else if (stage) {
    query += ' WHERE stage = ?';
    params.push(stage);
  }

  query += ' ORDER BY date, time_et';
  const matches = getAll(query, params);
  res.json(matches);
});

app.get('/api/matches/:id', requireAuth, (req, res) => {
  const match = getOne('SELECT * FROM matches WHERE id = ?', [Number(req.params.id)]);
  if (!match) return res.status(404).json({ error: 'Partido no encontrado' });
  res.json(match);
});

// Admin: update match result
app.put('/api/matches/:id/result', requireAdmin, (req, res) => {
  const { goals_a, goals_b } = req.body;
  if (goals_a == null || goals_b == null || goals_a < 0 || goals_b < 0) {
    return res.status(400).json({ error: 'Goles inválidos' });
  }

  const matchId = Number(req.params.id);
  run('UPDATE matches SET goals_a = ?, goals_b = ?, is_finished = 1 WHERE id = ?',
    [goals_a, goals_b, matchId]);

  // Calculate points for all predictions on this match
  const predictions = getAll('SELECT * FROM predictions WHERE match_id = ?', [matchId]);

  for (const pred of predictions) {
    let points = 0;
    // Exact result: 3 points
    if (pred.goals_a === goals_a && pred.goals_b === goals_b) {
      points = 3;
    }
    // Correct outcome (win/draw): 1 point
    else if (
      (pred.goals_a > pred.goals_b && goals_a > goals_b) ||
      (pred.goals_a < pred.goals_b && goals_a < goals_b) ||
      (pred.goals_a === pred.goals_b && goals_a === goals_b)
    ) {
      points = 1;
    }
    run('UPDATE predictions SET points = ? WHERE id = ?', [points, pred.id]);
  }

  res.json({ success: true });
});

// ==================== PREDICTIONS ROUTES ====================

app.get('/api/predictions', requireAuth, (req, res) => {
  const predictions = getAll(`
    SELECT p.*, m.team_a, m.team_b, m.date, m.time_et, m.group_name, m.is_finished, m.goals_a as real_goals_a, m.goals_b as real_goals_b
    FROM predictions p
    JOIN matches m ON p.match_id = m.id
    WHERE p.user_id = ?
    ORDER BY m.date, m.time_et
  `, [req.session.userId]);
  res.json(predictions);
});

app.post('/api/predictions', requireAuth, (req, res) => {
  const { match_id, goals_a, goals_b } = req.body;

  if (match_id == null || goals_a == null || goals_b == null || goals_a < 0 || goals_b < 0) {
    return res.status(400).json({ error: 'Datos inválidos' });
  }

  // Check match exists and hasn't started
  const match = getOne('SELECT * FROM matches WHERE id = ?', [match_id]);
  if (!match) return res.status(404).json({ error: 'Partido no encontrado' });

  // Check if match already started
  const matchDateTime = new Date(`${match.date}T${match.time_et}:00-04:00`);
  if (new Date() >= matchDateTime) {
    return res.status(400).json({ error: 'No puedes hacer pronósticos después del inicio del partido' });
  }

  // Upsert prediction
  const existing = getOne('SELECT id FROM predictions WHERE user_id = ? AND match_id = ?',
    [req.session.userId, match_id]);

  if (existing) {
    run('UPDATE predictions SET goals_a = ?, goals_b = ? WHERE id = ?',
      [goals_a, goals_b, existing.id]);
  } else {
    run('INSERT INTO predictions (user_id, match_id, goals_a, goals_b) VALUES (?, ?, ?, ?)',
      [req.session.userId, match_id, goals_a, goals_b]);
  }

  res.json({ success: true });
});

// ==================== STANDINGS ROUTES ====================

app.get('/api/standings', requireAuth, (req, res) => {
  const standings = getAll(`
    SELECT u.username,
           COALESCE(SUM(p.points), 0) as total_points,
           COUNT(p.id) as total_predictions,
           COALESCE(SUM(CASE WHEN p.points = 3 THEN 1 ELSE 0 END), 0) as exact_results,
           COALESCE(SUM(CASE WHEN p.points = 1 THEN 1 ELSE 0 END), 0) as correct_outcomes
    FROM users u
    LEFT JOIN predictions p ON u.id = p.user_id
    WHERE u.is_admin = 0
    GROUP BY u.id
    ORDER BY total_points DESC, exact_results DESC
  `);
  res.json(standings);
});

// Get all predictions for a specific match (only if finished)
app.get('/api/matches/:id/predictions', requireAuth, (req, res) => {
  const matchId = Number(req.params.id);
  const match = getOne('SELECT * FROM matches WHERE id = ?', [matchId]);
  if (!match) return res.status(404).json({ error: 'Partido no encontrado' });

  if (!match.is_finished) {
    return res.status(400).json({ error: 'Los pronósticos se muestran cuando el partido finaliza' });
  }

  const predictions = getAll(`
    SELECT u.username, p.goals_a, p.goals_b, p.points
    FROM predictions p
    JOIN users u ON p.user_id = u.id
    WHERE p.match_id = ?
    ORDER BY p.points DESC, u.username
  `, [matchId]);

  res.json(predictions);
});

// ==================== START SERVER ====================

async function start() {
  const SQL = await initSqlJs();

  // Load or create database
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
    console.log('📂 Base de datos cargada desde archivo');
  } else {
    console.log('🆕 Creando base de datos por primera vez...');
    // Run setup inline
    const { execSync } = require('child_process');
    execSync(`node setup-db.js`, { cwd: __dirname, env: { ...process.env, DB_PATH } });
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
    console.log('✅ Base de datos creada automáticamente');
  }

  // Save on exit
  process.on('SIGINT', () => {
    saveDb();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    saveDb();
    process.exit(0);
  });

  app.listen(PORT, () => {
    console.log(`🏆 Polla Mundialista 2026 corriendo en http://localhost:${PORT}`);
  });
}

start().catch(console.error);
