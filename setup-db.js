const initSqlJs = require('sql.js');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

async function setup() {
  const SQL = await initSqlJs();
  const db = new SQL.Database();

  // Create tables
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      is_admin INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_name TEXT NOT NULL,
      team_a TEXT NOT NULL,
      team_b TEXT NOT NULL,
      date TEXT NOT NULL,
      time_et TEXT NOT NULL,
      venue TEXT NOT NULL,
      stage TEXT DEFAULT 'group',
      goals_a INTEGER,
      goals_b INTEGER,
      is_finished INTEGER DEFAULT 0
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS predictions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      match_id INTEGER NOT NULL,
      goals_a INTEGER NOT NULL,
      goals_b INTEGER NOT NULL,
      points INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (match_id) REFERENCES matches(id),
      UNIQUE(user_id, match_id)
    )
  `);

  // Create admin user (password: admin123)
  const adminPassword = bcrypt.hashSync('admin123', 10);
  db.run('INSERT OR IGNORE INTO users (username, password, is_admin) VALUES (?, ?, ?)',
    ['admin', adminPassword, 1]);

  // Insert all group stage matches - World Cup 2026
  const matches = [
    // Matchday 1
    ['A', 'México', 'Sudáfrica', '2026-06-11', '15:00', 'Estadio Azteca, Ciudad de México'],
    ['A', 'Corea del Sur', 'Chequia', '2026-06-11', '22:00', 'Estadio Akron, Guadalajara'],
    ['B', 'Canadá', 'Bosnia y Herzegovina', '2026-06-12', '15:00', 'BMO Field, Toronto'],
    ['D', 'Estados Unidos', 'Paraguay', '2026-06-12', '21:00', 'SoFi Stadium, Los Ángeles'],
    ['B', 'Qatar', 'Suiza', '2026-06-13', '15:00', "Levi's Stadium, San Francisco"],
    ['C', 'Brasil', 'Marruecos', '2026-06-13', '18:00', 'MetLife Stadium, Nueva York'],
    ['C', 'Haití', 'Escocia', '2026-06-13', '21:00', 'Gillette Stadium, Boston'],
    ['D', 'Australia', 'Turquía', '2026-06-14', '00:00', 'BC Place, Vancouver'],
    ['E', 'Alemania', 'Curazao', '2026-06-14', '13:00', 'NRG Stadium, Houston'],
    ['F', 'Países Bajos', 'Japón', '2026-06-14', '16:00', 'AT&T Stadium, Dallas'],
    ['E', 'Costa de Marfil', 'Ecuador', '2026-06-14', '19:00', 'Lincoln Financial Field, Filadelfia'],
    ['F', 'Suecia', 'Túnez', '2026-06-14', '22:00', 'Estadio BBVA, Monterrey'],
    ['H', 'España', 'Cabo Verde', '2026-06-15', '12:00', 'Mercedes-Benz Stadium, Atlanta'],
    ['G', 'Bélgica', 'Egipto', '2026-06-15', '15:00', 'Lumen Field, Seattle'],
    ['H', 'Arabia Saudita', 'Uruguay', '2026-06-15', '18:00', 'Hard Rock Stadium, Miami'],
    ['G', 'Irán', 'Nueva Zelanda', '2026-06-15', '21:00', 'SoFi Stadium, Los Ángeles'],
    ['I', 'Francia', 'Senegal', '2026-06-16', '15:00', 'MetLife Stadium, Nueva York'],
    ['I', 'Irak', 'Noruega', '2026-06-16', '18:00', 'Gillette Stadium, Boston'],
    ['J', 'Argentina', 'Argelia', '2026-06-16', '21:00', 'Arrowhead Stadium, Kansas City'],
    ['J', 'Austria', 'Jordania', '2026-06-17', '00:00', "Levi's Stadium, San Francisco"],
    ['K', 'Portugal', 'R.D. Congo', '2026-06-17', '13:00', 'NRG Stadium, Houston'],
    ['L', 'Inglaterra', 'Croacia', '2026-06-17', '16:00', 'AT&T Stadium, Dallas'],
    ['L', 'Ghana', 'Panamá', '2026-06-17', '19:00', 'BMO Field, Toronto'],
    ['K', 'Uzbekistán', 'Colombia', '2026-06-17', '22:00', 'Estadio Azteca, Ciudad de México'],

    // Matchday 2
    ['A', 'Chequia', 'Sudáfrica', '2026-06-18', '12:00', 'Mercedes-Benz Stadium, Atlanta'],
    ['B', 'Suiza', 'Bosnia y Herzegovina', '2026-06-18', '15:00', 'SoFi Stadium, Los Ángeles'],
    ['B', 'Canadá', 'Qatar', '2026-06-18', '18:00', 'BC Place, Vancouver'],
    ['A', 'México', 'Corea del Sur', '2026-06-18', '21:00', 'Estadio Akron, Guadalajara'],
    ['D', 'Turquía', 'Paraguay', '2026-06-19', '00:00', "Levi's Stadium, San Francisco"],
    ['D', 'Estados Unidos', 'Australia', '2026-06-19', '15:00', 'Lumen Field, Seattle'],
    ['C', 'Escocia', 'Marruecos', '2026-06-19', '18:00', 'Gillette Stadium, Boston'],
    ['C', 'Brasil', 'Haití', '2026-06-19', '20:30', 'Lincoln Financial Field, Filadelfia'],
    ['F', 'Países Bajos', 'Suecia', '2026-06-20', '13:00', 'NRG Stadium, Houston'],
    ['E', 'Alemania', 'Costa de Marfil', '2026-06-20', '16:00', 'BMO Field, Toronto'],
    ['E', 'Ecuador', 'Curazao', '2026-06-20', '20:00', 'Arrowhead Stadium, Kansas City'],
    ['F', 'Túnez', 'Japón', '2026-06-21', '00:00', 'Estadio BBVA, Monterrey'],
    ['H', 'España', 'Arabia Saudita', '2026-06-21', '12:00', 'Mercedes-Benz Stadium, Atlanta'],
    ['G', 'Bélgica', 'Irán', '2026-06-21', '15:00', 'SoFi Stadium, Los Ángeles'],
    ['H', 'Uruguay', 'Cabo Verde', '2026-06-21', '18:00', 'Hard Rock Stadium, Miami'],
    ['G', 'Nueva Zelanda', 'Egipto', '2026-06-21', '21:00', 'BC Place, Vancouver'],
    ['J', 'Argentina', 'Austria', '2026-06-22', '13:00', 'AT&T Stadium, Dallas'],
    ['I', 'Francia', 'Irak', '2026-06-22', '17:00', 'Lincoln Financial Field, Filadelfia'],
    ['I', 'Noruega', 'Senegal', '2026-06-22', '20:00', 'MetLife Stadium, Nueva York'],
    ['J', 'Jordania', 'Argelia', '2026-06-22', '23:00', "Levi's Stadium, San Francisco"],
    ['K', 'Portugal', 'Uzbekistán', '2026-06-23', '13:00', 'NRG Stadium, Houston'],
    ['L', 'Inglaterra', 'Ghana', '2026-06-23', '16:00', 'Gillette Stadium, Boston'],
    ['L', 'Panamá', 'Croacia', '2026-06-23', '19:00', 'BMO Field, Toronto'],
    ['K', 'Colombia', 'R.D. Congo', '2026-06-23', '22:00', 'Estadio Akron, Guadalajara'],

    // Matchday 3
    ['B', 'Suiza', 'Canadá', '2026-06-24', '15:00', 'BC Place, Vancouver'],
    ['B', 'Bosnia y Herzegovina', 'Qatar', '2026-06-24', '15:00', 'Lumen Field, Seattle'],
    ['C', 'Escocia', 'Brasil', '2026-06-24', '18:00', 'Hard Rock Stadium, Miami'],
    ['C', 'Marruecos', 'Haití', '2026-06-24', '18:00', 'Mercedes-Benz Stadium, Atlanta'],
    ['A', 'Chequia', 'México', '2026-06-24', '21:00', 'Estadio Azteca, Ciudad de México'],
    ['A', 'Sudáfrica', 'Corea del Sur', '2026-06-24', '21:00', 'Estadio BBVA, Monterrey'],
    ['E', 'Curazao', 'Costa de Marfil', '2026-06-25', '16:00', 'Lincoln Financial Field, Filadelfia'],
    ['E', 'Ecuador', 'Alemania', '2026-06-25', '16:00', 'MetLife Stadium, Nueva York'],
    ['F', 'Japón', 'Suecia', '2026-06-25', '19:00', 'AT&T Stadium, Dallas'],
    ['F', 'Túnez', 'Países Bajos', '2026-06-25', '19:00', 'Arrowhead Stadium, Kansas City'],
    ['D', 'Turquía', 'Estados Unidos', '2026-06-25', '22:00', 'SoFi Stadium, Los Ángeles'],
    ['D', 'Paraguay', 'Australia', '2026-06-25', '22:00', "Levi's Stadium, San Francisco"],
    ['I', 'Noruega', 'Francia', '2026-06-26', '15:00', 'Gillette Stadium, Boston'],
    ['I', 'Senegal', 'Irak', '2026-06-26', '15:00', 'BMO Field, Toronto'],
    ['H', 'Cabo Verde', 'Arabia Saudita', '2026-06-26', '20:00', 'NRG Stadium, Houston'],
    ['H', 'Uruguay', 'España', '2026-06-26', '20:00', 'Estadio Akron, Guadalajara'],
    ['G', 'Egipto', 'Irán', '2026-06-26', '23:00', 'Lumen Field, Seattle'],
    ['G', 'Nueva Zelanda', 'Bélgica', '2026-06-26', '23:00', 'BC Place, Vancouver'],
    ['L', 'Panamá', 'Inglaterra', '2026-06-27', '17:00', 'MetLife Stadium, Nueva York'],
    ['L', 'Croacia', 'Ghana', '2026-06-27', '17:00', 'Lincoln Financial Field, Filadelfia'],
    ['K', 'Colombia', 'Portugal', '2026-06-27', '19:30', 'Hard Rock Stadium, Miami'],
    ['K', 'R.D. Congo', 'Uzbekistán', '2026-06-27', '19:30', 'Mercedes-Benz Stadium, Atlanta'],
    ['J', 'Argelia', 'Austria', '2026-06-27', '22:00', 'Arrowhead Stadium, Kansas City'],
    ['J', 'Jordania', 'Argentina', '2026-06-27', '22:00', 'AT&T Stadium, Dallas'],
  ];

  const stmt = db.prepare('INSERT INTO matches (group_name, team_a, team_b, date, time_et, venue, stage) VALUES (?, ?, ?, ?, ?, ?, ?)');
  for (const m of matches) {
    stmt.run([...m, 'group']);
  }
  stmt.free();

  // Save to file
  const dbPath = process.env.DB_PATH || path.join(__dirname, 'polla.db');
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbPath, buffer);

  db.close();

  console.log('✅ Base de datos creada exitosamente');
  console.log(`   - ${matches.length} partidos de fase de grupos insertados`);
  console.log('   - Usuario admin creado (usuario: admin, contraseña: admin123)');
  console.log('\nPara iniciar el servidor ejecuta: npm start');
}

setup().catch(console.error);
