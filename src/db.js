const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'ecosistema.sqlite');
const db = new Database(dbPath);
db.pragma('foreign_keys = ON');

function runSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      is_admin INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS systems (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      description TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS user_system_access (
      user_id INTEGER NOT NULL,
      system_id INTEGER NOT NULL,
      PRIMARY KEY (user_id, system_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (system_id) REFERENCES systems(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

function ensureDefaultSettings() {
  const defaults = {
    app_name: 'Ecossistema Omega',
    hero_title: 'Central de Sistemas',
    hero_subtitle: 'Acesse todos os sistemas em um unico lugar.',
    logo_url: '',
    background_url: '',
    primary_color: '#03a9f4',
    secondary_color: '#0d1b2a',
    accent_color: '#35d0a0',
    surface_color: '#111827',
    text_color: '#f8fafc'
  };

  const insert = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  for (const [key, value] of Object.entries(defaults)) {
    insert.run(key, value);
  }
}

function seedData() {
  const userCount = db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
  if (userCount === 0) {
    const hash = bcrypt.hashSync('Omega@123', 12);
    db.prepare('INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, 1)').run('admin', hash);
  }

  const systemCount = db.prepare('SELECT COUNT(*) AS count FROM systems').get().count;
  if (systemCount === 0) {
    const insertSystem = db.prepare('INSERT INTO systems (name, url, description, is_active) VALUES (?, ?, ?, 1)');
    insertSystem.run('Controle de Ponto', 'https://controle-ponto.up.railway.app/', 'Registro de ponto e jornada');
    insertSystem.run('Lancamento Omega', 'https://lancamento-omega.up.railway.app/', 'Lancamentos operacionais');
    insertSystem.run('Despesas Omega', 'https://despesas-omega.up.railway.app/', 'Controle de despesas');
    insertSystem.run('Forms Omega', 'https://forms-omega.up.railway.app/admin/login/', 'Formularios e administracao');
  }

  const admin = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
  if (admin) {
    const systems = db.prepare('SELECT id FROM systems').all();
    const grant = db.prepare('INSERT OR IGNORE INTO user_system_access (user_id, system_id) VALUES (?, ?)');
    for (const system of systems) {
      grant.run(admin.id, system.id);
    }
  }
}

runSchema();
ensureDefaultSettings();
seedData();

function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  return rows.reduce((acc, row) => {
    acc[row.key] = row.value;
    return acc;
  }, {});
}

function updateSettings(settingsPatch) {
  const upsert = db.prepare(`
    INSERT INTO settings (key, value)
    VALUES (@key, @value)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `);

  const tx = db.transaction((patch) => {
    for (const [key, value] of Object.entries(patch)) {
      upsert.run({ key, value: String(value ?? '') });
    }
  });

  tx(settingsPatch);
}

function findUserByUsername(username) {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username);
}

function findUserById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

function listUsers() {
  return db.prepare(`
    SELECT
      u.id,
      u.username,
      u.is_admin,
      u.created_at,
      COALESCE(GROUP_CONCAT(usa.system_id), '') AS system_ids,
      COALESCE(GROUP_CONCAT(s.name, ', '), '') AS system_names
    FROM users u
    LEFT JOIN user_system_access usa ON usa.user_id = u.id
    LEFT JOIN systems s ON s.id = usa.system_id
    GROUP BY u.id
    ORDER BY u.is_admin DESC, u.username ASC
  `).all();
}

function listUsersBasic() {
  return db.prepare('SELECT id, username, is_admin FROM users ORDER BY username ASC').all();
}

function createUser({ username, password, isAdmin, systemIds }) {
  const tx = db.transaction((payload) => {
    const passwordHash = bcrypt.hashSync(payload.password, 12);
    const result = db.prepare(
      'INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, ?)'
    ).run(payload.username, passwordHash, payload.isAdmin ? 1 : 0);

    const userId = result.lastInsertRowid;

    const ids = payload.isAdmin
      ? db.prepare('SELECT id FROM systems WHERE is_active = 1').all().map((row) => row.id)
      : payload.systemIds;

    const grant = db.prepare('INSERT OR IGNORE INTO user_system_access (user_id, system_id) VALUES (?, ?)');
    for (const systemId of ids) {
      grant.run(userId, systemId);
    }

    return Number(userId);
  });

  return tx({ username, password, isAdmin, systemIds });
}

function updateUserSystemAccess(userId, systemIds) {
  const tx = db.transaction((uid, ids) => {
    db.prepare('DELETE FROM user_system_access WHERE user_id = ?').run(uid);
    const grant = db.prepare('INSERT OR IGNORE INTO user_system_access (user_id, system_id) VALUES (?, ?)');
    for (const systemId of ids) {
      grant.run(uid, systemId);
    }
  });

  tx(userId, systemIds);
}

function listSystems({ includeInactive = true } = {}) {
  if (includeInactive) {
    return db.prepare('SELECT * FROM systems ORDER BY name ASC').all();
  }
  return db.prepare('SELECT * FROM systems WHERE is_active = 1 ORDER BY name ASC').all();
}

function createSystem({ name, url, description, allowedUserIds }) {
  const tx = db.transaction((payload) => {
    const result = db.prepare(
      'INSERT INTO systems (name, url, description, is_active) VALUES (?, ?, ?, 1)'
    ).run(payload.name, payload.url, payload.description || null);

    const systemId = Number(result.lastInsertRowid);
    const admins = db.prepare('SELECT id FROM users WHERE is_admin = 1').all().map((row) => row.id);
    const userIds = new Set([...(payload.allowedUserIds || []), ...admins]);

    const grant = db.prepare('INSERT OR IGNORE INTO user_system_access (user_id, system_id) VALUES (?, ?)');
    for (const userId of userIds) {
      grant.run(userId, systemId);
    }

    return systemId;
  });

  return tx({ name, url, description, allowedUserIds });
}

function getUserAccessibleSystems(userId, isAdmin) {
  if (isAdmin) {
    return listSystems({ includeInactive: false });
  }

  return db.prepare(`
    SELECT s.*
    FROM systems s
    INNER JOIN user_system_access usa ON usa.system_id = s.id
    WHERE usa.user_id = ?
      AND s.is_active = 1
    ORDER BY s.name ASC
  `).all(userId);
}

module.exports = {
  db,
  findUserByUsername,
  findUserById,
  listUsers,
  listUsersBasic,
  createUser,
  updateUserSystemAccess,
  listSystems,
  createSystem,
  getUserAccessibleSystems,
  getSettings,
  updateSettings
};
