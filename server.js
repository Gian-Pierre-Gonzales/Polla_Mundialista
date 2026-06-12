require('dotenv').config();
const express = require('express');
const session = require('express-session');
const { createClient } = require('@libsql/client');
const bcrypt = require('bcryptjs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Database connection
const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'polla-mundialista-2026-secret',
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

// ==================== AUTH ROUTES ====================

app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Usuario y contraseña son requeridos' });
    }
    if (username.length < 3 || password.length < 4) {
      return res.status(400).json({ error: 'Usuario mínimo 3 caracteres, contraseña mínimo 4' });
    }

    const existing = await db.execute({ sql: 'SELECT id FROM users WHERE username = ?', args: [username] });
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'El usuario ya existe' });
    }

    const hash = bcrypt.hashSync(password, 10);
    const result = await db.execute({
      sql: 'INSERT INTO users (username, password) VALUES (?, ?)',
      args: [username, hash]
    });

    req.session.userId = Number(result.lastInsertRowid);
    req.session.username = username;
    req.session.isAdmin = false;
    res.json({ success: true, username });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const result = await db.execute({ sql: 'SELECT * FROM users WHERE username = ?', args: [username] });

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    const user = result.rows[0];
    if (!bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    req.session.userId = Number(user.id);
    req.session.username = user.username;
    req.session.isAdmin = user.is_admin === 1;
    res.json({ success: true, username: user.username, isAdmin: user.is_admin === 1 });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
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

app.get('/api/matches', requireAuth, async (req, res) => {
  try {
    const { group, stage } = req.query;
    let query = 'SELECT * FROM matches';
    const args = [];

    if (group) {
      query += ' WHERE group_name = ?';
      args.push(group);
    } else if (stage) {
      query += ' WHERE stage = ?';
      args.push(stage);
    }

    query += ' ORDER BY date, time_et';
    const result = await db.execute({ sql: query, args });
    res.json(result.rows);
  } catch (err) {
    console.error('Matches error:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

app.get('/api/matches/:id', requireAuth, async (req, res) => {
  try {
    const result = await db.execute({ sql: 'SELECT * FROM matches WHERE id = ?', args: [Number(req.params.id)] });
    if (result.rows.length === 0) return res.status(404).json({ error: 'Partido no encontrado' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Admin: update match result
app.put('/api/matches/:id/result', requireAdmin, async (req, res) => {
  try {
    const { goals_a, goals_b } = req.body;
    if (goals_a == null || goals_b == null || goals_a < 0 || goals_b < 0) {
      return res.status(400).json({ error: 'Goles inválidos' });
    }

    const matchId = Number(req.params.id);
    await db.execute({
      sql: 'UPDATE matches SET goals_a = ?, goals_b = ?, is_finished = 1 WHERE id = ?',
      args: [goals_a, goals_b, matchId]
    });

    // Calculate points for all predictions on this match
    const predResult = await db.execute({ sql: 'SELECT * FROM predictions WHERE match_id = ?', args: [matchId] });

    for (const pred of predResult.rows) {
      let points = 0;
      if (pred.goals_a === goals_a && pred.goals_b === goals_b) {
        points = 3;
      } else if (
        (pred.goals_a > pred.goals_b && goals_a > goals_b) ||
        (pred.goals_a < pred.goals_b && goals_a < goals_b) ||
        (pred.goals_a === pred.goals_b && goals_a === goals_b)
      ) {
        points = 1;
      }
      await db.execute({ sql: 'UPDATE predictions SET points = ? WHERE id = ?', args: [points, pred.id] });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Result error:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ==================== PREDICTIONS ROUTES ====================

app.get('/api/predictions', requireAuth, async (req, res) => {
  try {
    const result = await db.execute({
      sql: `SELECT p.*, m.team_a, m.team_b, m.date, m.time_et, m.group_name, m.is_finished, m.goals_a as real_goals_a, m.goals_b as real_goals_b
            FROM predictions p
            JOIN matches m ON p.match_id = m.id
            WHERE p.user_id = ?
            ORDER BY m.date, m.time_et`,
      args: [req.session.userId]
    });
    res.json(result.rows);
  } catch (err) {
    console.error('Predictions error:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

app.post('/api/predictions', requireAuth, async (req, res) => {
  try {
    const { match_id, goals_a, goals_b } = req.body;

    if (match_id == null || goals_a == null || goals_b == null || goals_a < 0 || goals_b < 0) {
      return res.status(400).json({ error: 'Datos inválidos' });
    }

    const matchResult = await db.execute({ sql: 'SELECT * FROM matches WHERE id = ?', args: [match_id] });
    if (matchResult.rows.length === 0) return res.status(404).json({ error: 'Partido no encontrado' });

    const match = matchResult.rows[0];
    const matchDateTime = new Date(`${match.date}T${match.time_et}:00-04:00`);
    if (new Date() >= matchDateTime) {
      return res.status(400).json({ error: 'No puedes hacer pronósticos después del inicio del partido' });
    }

    // Upsert prediction
    const existing = await db.execute({
      sql: 'SELECT id FROM predictions WHERE user_id = ? AND match_id = ?',
      args: [req.session.userId, match_id]
    });

    if (existing.rows.length > 0) {
      await db.execute({
        sql: 'UPDATE predictions SET goals_a = ?, goals_b = ? WHERE id = ?',
        args: [goals_a, goals_b, existing.rows[0].id]
      });
    } else {
      await db.execute({
        sql: 'INSERT INTO predictions (user_id, match_id, goals_a, goals_b) VALUES (?, ?, ?, ?)',
        args: [req.session.userId, match_id, goals_a, goals_b]
      });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Prediction save error:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ==================== STANDINGS ROUTES ====================

app.get('/api/standings', requireAuth, async (req, res) => {
  try {
    const result = await db.execute(`
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
    res.json(result.rows);
  } catch (err) {
    console.error('Standings error:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Get all predictions for a specific match (only if finished)
app.get('/api/matches/:id/predictions', requireAuth, async (req, res) => {
  try {
    const matchId = Number(req.params.id);
    const matchResult = await db.execute({ sql: 'SELECT * FROM matches WHERE id = ?', args: [matchId] });
    if (matchResult.rows.length === 0) return res.status(404).json({ error: 'Partido no encontrado' });

    const match = matchResult.rows[0];
    if (!match.is_finished) {
      return res.status(400).json({ error: 'Los pronósticos se muestran cuando el partido finaliza' });
    }

    const result = await db.execute({
      sql: `SELECT u.username, p.goals_a, p.goals_b, p.points
            FROM predictions p
            JOIN users u ON p.user_id = u.id
            WHERE p.match_id = ?
            ORDER BY p.points DESC, u.username`,
      args: [matchId]
    });

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ==================== START SERVER ====================

app.listen(PORT, () => {
  console.log(`🏆 Polla Mundialista 2026 corriendo en http://localhost:${PORT}`);
});
