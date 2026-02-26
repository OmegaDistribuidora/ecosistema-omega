const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const Database = require('better-sqlite3');
const { Pool } = require('pg');

const isPostgres = Boolean(process.env.DATABASE_URL);

const defaultSettings = {
  app_name: 'Ecossistema Omega',
  hero_title: 'Central de Sistemas',
  hero_subtitle: 'Acesse todos os sistemas em um unico lugar.',
  logo_url: '/images/logo.png',
  mascot_url: '/images/aurora.png',
  background_url: '',
  primary_color: '#03a9f4',
  secondary_color: '#0d1b2a',
  accent_color: '#35d0a0',
  surface_color: '#111827',
  text_color: '#f8fafc'
};

const defaultSystems = [
  {
    name: 'Controle de Ponto',
    url: 'https://controle-ponto.up.railway.app/',
    description: 'Registro de ponto e jornada'
  },
  {
    name: 'Lancamento Omega',
    url: 'https://lancamento-omega.up.railway.app/',
    description: 'Lancamentos operacionais'
  },
  {
    name: 'Despesas Omega',
    url: 'https://despesas-omega.up.railway.app/',
    description: 'Controle de despesas'
  },
  {
    name: 'Forms Omega',
    url: 'https://forms-omega.up.railway.app/admin/login/',
    description: 'Formularios e administracao'
  }
];

let sqliteDb = null;
let pgPool = null;

function normalizeIdArray(rawIds) {
  const ids = Array.isArray(rawIds) ? rawIds : [];
  return [...new Set(ids.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))];
}

function buildPgSsl() {
  if (process.env.DATABASE_SSL === 'false') {
    return false;
  }

  if (process.env.NODE_ENV === 'production') {
    return { rejectUnauthorized: false };
  }

  return false;
}

async function initializePostgres() {
  pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: buildPgSsl()
  });

  await pgPool.query('SELECT 1');

  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      is_admin BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS systems (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      description TEXT,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS user_system_access (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      system_id INTEGER NOT NULL REFERENCES systems(id) ON DELETE CASCADE,
      PRIMARY KEY (user_id, system_id)
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  for (const [key, value] of Object.entries(defaultSettings)) {
    await pgPool.query(
      'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING',
      [key, value]
    );
  }

  const userCountResult = await pgPool.query('SELECT COUNT(*)::int AS count FROM users');
  if (userCountResult.rows[0].count === 0) {
    const hash = bcrypt.hashSync('Omega@123', 12);
    await pgPool.query(
      'INSERT INTO users (username, password_hash, is_admin) VALUES ($1, $2, TRUE)',
      ['admin', hash]
    );
  }

  const systemCountResult = await pgPool.query('SELECT COUNT(*)::int AS count FROM systems');
  if (systemCountResult.rows[0].count === 0) {
    for (const system of defaultSystems) {
      await pgPool.query(
        'INSERT INTO systems (name, url, description, is_active) VALUES ($1, $2, $3, TRUE)',
        [system.name, system.url, system.description]
      );
    }
  }

  const adminResult = await pgPool.query('SELECT id FROM users WHERE username = $1 LIMIT 1', ['admin']);
  if (adminResult.rows.length > 0) {
    const adminId = adminResult.rows[0].id;
    await pgPool.query(
      `INSERT INTO user_system_access (user_id, system_id)
       SELECT $1, s.id
       FROM systems s
       ON CONFLICT (user_id, system_id) DO NOTHING`,
      [adminId]
    );
  }
}

function initializeSqlite() {
  const dataDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const dbPath = path.join(dataDir, 'ecosistema.sqlite');
  sqliteDb = new Database(dbPath);
  sqliteDb.pragma('foreign_keys = ON');

  sqliteDb.exec(`
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

  const insertSetting = sqliteDb.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  for (const [key, value] of Object.entries(defaultSettings)) {
    insertSetting.run(key, value);
  }

  const userCount = sqliteDb.prepare('SELECT COUNT(*) AS count FROM users').get().count;
  if (userCount === 0) {
    const hash = bcrypt.hashSync('Omega@123', 12);
    sqliteDb
      .prepare('INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, 1)')
      .run('admin', hash);
  }

  const systemCount = sqliteDb.prepare('SELECT COUNT(*) AS count FROM systems').get().count;
  if (systemCount === 0) {
    const insertSystem = sqliteDb.prepare(
      'INSERT INTO systems (name, url, description, is_active) VALUES (?, ?, ?, 1)'
    );
    for (const system of defaultSystems) {
      insertSystem.run(system.name, system.url, system.description);
    }
  }

  const admin = sqliteDb.prepare('SELECT id FROM users WHERE username = ?').get('admin');
  if (admin) {
    const systems = sqliteDb.prepare('SELECT id FROM systems').all();
    const grant = sqliteDb.prepare(
      'INSERT OR IGNORE INTO user_system_access (user_id, system_id) VALUES (?, ?)'
    );
    for (const system of systems) {
      grant.run(admin.id, system.id);
    }
  }
}

async function initializeDatabase() {
  if (isPostgres) {
    await initializePostgres();
    return;
  }
  initializeSqlite();
}

async function getSettings() {
  const protectedDefaults = new Set(['logo_url', 'mascot_url']);

  if (isPostgres) {
    const result = await pgPool.query('SELECT key, value FROM settings');
    const settings = { ...defaultSettings };
    for (const row of result.rows) {
      if (protectedDefaults.has(row.key) && !String(row.value || '').trim()) {
        continue;
      }
      settings[row.key] = row.value;
    }
    return settings;
  }

  const rows = sqliteDb.prepare('SELECT key, value FROM settings').all();
  const settings = { ...defaultSettings };
  for (const row of rows) {
    if (protectedDefaults.has(row.key) && !String(row.value || '').trim()) {
      continue;
    }
    settings[row.key] = row.value;
  }
  return settings;
}

async function updateSettings(settingsPatch) {
  const entries = Object.entries(settingsPatch || {});
  if (!entries.length) {
    return;
  }

  if (isPostgres) {
    for (const [key, value] of entries) {
      await pgPool.query(
        `INSERT INTO settings (key, value)
         VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [key, String(value ?? '')]
      );
    }
    return;
  }

  const upsert = sqliteDb.prepare(`
    INSERT INTO settings (key, value)
    VALUES (@key, @value)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `);

  const tx = sqliteDb.transaction((items) => {
    for (const [key, value] of items) {
      upsert.run({ key, value: String(value ?? '') });
    }
  });

  tx(entries);
}

async function findUserByUsername(username) {
  if (isPostgres) {
    const result = await pgPool.query('SELECT * FROM users WHERE username = $1 LIMIT 1', [username]);
    return result.rows[0] || null;
  }

  return sqliteDb.prepare('SELECT * FROM users WHERE username = ?').get(username) || null;
}

async function findUserById(id) {
  if (isPostgres) {
    const result = await pgPool.query('SELECT * FROM users WHERE id = $1 LIMIT 1', [id]);
    return result.rows[0] || null;
  }

  return sqliteDb.prepare('SELECT * FROM users WHERE id = ?').get(id) || null;
}

async function listUsers() {
  if (isPostgres) {
    const result = await pgPool.query(`
      SELECT
        u.id,
        u.username,
        u.is_admin,
        u.created_at,
        COALESCE(string_agg(usa.system_id::text, ',' ORDER BY usa.system_id), '') AS system_ids,
        COALESCE(string_agg(s.name, ', ' ORDER BY s.name), '') AS system_names
      FROM users u
      LEFT JOIN user_system_access usa ON usa.user_id = u.id
      LEFT JOIN systems s ON s.id = usa.system_id
      GROUP BY u.id
      ORDER BY u.is_admin DESC, u.username ASC
    `);
    return result.rows;
  }

  return sqliteDb
    .prepare(`
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
    `)
    .all();
}

async function listUsersBasic() {
  if (isPostgres) {
    const result = await pgPool.query('SELECT id, username, is_admin FROM users ORDER BY username ASC');
    return result.rows;
  }

  return sqliteDb
    .prepare('SELECT id, username, is_admin FROM users ORDER BY username ASC')
    .all();
}

async function createUser({ username, password, isAdmin, systemIds }) {
  if (isPostgres) {
    const client = await pgPool.connect();
    try {
      await client.query('BEGIN');
      const passwordHash = bcrypt.hashSync(password, 12);
      const userInsert = await client.query(
        'INSERT INTO users (username, password_hash, is_admin) VALUES ($1, $2, $3) RETURNING id',
        [username, passwordHash, Boolean(isAdmin)]
      );

      const userId = userInsert.rows[0].id;
      let allowedSystemIds = normalizeIdArray(systemIds);

      if (isAdmin) {
        const systems = await client.query('SELECT id FROM systems WHERE is_active = TRUE');
        allowedSystemIds = systems.rows.map((row) => row.id);
      }

      for (const systemId of allowedSystemIds) {
        await client.query(
          'INSERT INTO user_system_access (user_id, system_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [userId, systemId]
        );
      }

      await client.query('COMMIT');
      return Number(userId);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  const tx = sqliteDb.transaction((payload) => {
    const passwordHash = bcrypt.hashSync(payload.password, 12);
    const result = sqliteDb
      .prepare('INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, ?)')
      .run(payload.username, passwordHash, payload.isAdmin ? 1 : 0);

    const userId = Number(result.lastInsertRowid);
    const ids = payload.isAdmin
      ? sqliteDb
          .prepare('SELECT id FROM systems WHERE is_active = 1')
          .all()
          .map((row) => row.id)
      : normalizeIdArray(payload.systemIds);

    const grant = sqliteDb.prepare(
      'INSERT OR IGNORE INTO user_system_access (user_id, system_id) VALUES (?, ?)'
    );
    for (const systemId of ids) {
      grant.run(userId, systemId);
    }

    return userId;
  });

  return tx({ username, password, isAdmin, systemIds });
}

async function updateUserSystemAccess(userId, systemIds) {
  const ids = normalizeIdArray(systemIds);

  if (isPostgres) {
    const client = await pgPool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM user_system_access WHERE user_id = $1', [userId]);
      for (const systemId of ids) {
        await client.query(
          'INSERT INTO user_system_access (user_id, system_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [userId, systemId]
        );
      }
      await client.query('COMMIT');
      return;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  const tx = sqliteDb.transaction((uid, safeIds) => {
    sqliteDb.prepare('DELETE FROM user_system_access WHERE user_id = ?').run(uid);
    const grant = sqliteDb.prepare(
      'INSERT OR IGNORE INTO user_system_access (user_id, system_id) VALUES (?, ?)'
    );
    for (const systemId of safeIds) {
      grant.run(uid, systemId);
    }
  });

  tx(userId, ids);
}

async function listSystems({ includeInactive = true } = {}) {
  if (isPostgres) {
    if (includeInactive) {
      const result = await pgPool.query('SELECT * FROM systems ORDER BY name ASC');
      return result.rows;
    }
    const result = await pgPool.query('SELECT * FROM systems WHERE is_active = TRUE ORDER BY name ASC');
    return result.rows;
  }

  if (includeInactive) {
    return sqliteDb.prepare('SELECT * FROM systems ORDER BY name ASC').all();
  }
  return sqliteDb
    .prepare('SELECT * FROM systems WHERE is_active = 1 ORDER BY name ASC')
    .all();
}

async function createSystem({ name, url, description, allowedUserIds }) {
  const safeUserIds = normalizeIdArray(allowedUserIds);

  if (isPostgres) {
    const client = await pgPool.connect();
    try {
      await client.query('BEGIN');
      const inserted = await client.query(
        'INSERT INTO systems (name, url, description, is_active) VALUES ($1, $2, $3, TRUE) RETURNING id',
        [name, url, description || null]
      );

      const systemId = inserted.rows[0].id;
      const adminsResult = await client.query('SELECT id FROM users WHERE is_admin = TRUE');
      const allAllowedUsers = new Set([
        ...safeUserIds,
        ...adminsResult.rows.map((row) => Number(row.id))
      ]);

      for (const userId of allAllowedUsers) {
        await client.query(
          'INSERT INTO user_system_access (user_id, system_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [userId, systemId]
        );
      }

      await client.query('COMMIT');
      return Number(systemId);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  const tx = sqliteDb.transaction((payload) => {
    const result = sqliteDb
      .prepare('INSERT INTO systems (name, url, description, is_active) VALUES (?, ?, ?, 1)')
      .run(payload.name, payload.url, payload.description || null);

    const systemId = Number(result.lastInsertRowid);
    const admins = sqliteDb
      .prepare('SELECT id FROM users WHERE is_admin = 1')
      .all()
      .map((row) => row.id);
    const userIds = new Set([...normalizeIdArray(payload.allowedUserIds), ...admins]);

    const grant = sqliteDb.prepare(
      'INSERT OR IGNORE INTO user_system_access (user_id, system_id) VALUES (?, ?)'
    );

    for (const userId of userIds) {
      grant.run(userId, systemId);
    }

    return systemId;
  });

  return tx({ name, url, description, allowedUserIds: safeUserIds });
}

async function updateSystem(systemId, { name, url, description }) {
  if (isPostgres) {
    const result = await pgPool.query(
      `UPDATE systems
       SET name = $2,
           url = $3,
           description = $4
       WHERE id = $1`,
      [systemId, name, url, description || null]
    );
    return result.rowCount > 0;
  }

  const result = sqliteDb
    .prepare(
      `UPDATE systems
       SET name = ?,
           url = ?,
           description = ?
       WHERE id = ?`
    )
    .run(name, url, description || null, systemId);
  return result.changes > 0;
}

async function getUserAccessibleSystems(userId, isAdmin) {
  if (isAdmin) {
    return listSystems({ includeInactive: false });
  }

  if (isPostgres) {
    const result = await pgPool.query(
      `SELECT s.*
       FROM systems s
       INNER JOIN user_system_access usa ON usa.system_id = s.id
       WHERE usa.user_id = $1
         AND s.is_active = TRUE
       ORDER BY s.name ASC`,
      [userId]
    );

    return result.rows;
  }

  return sqliteDb
    .prepare(
      `SELECT s.*
       FROM systems s
       INNER JOIN user_system_access usa ON usa.system_id = s.id
       WHERE usa.user_id = ?
         AND s.is_active = 1
       ORDER BY s.name ASC`
    )
    .all(userId);
}

function getDatabaseEngineLabel() {
  return isPostgres ? 'postgres' : 'sqlite';
}

module.exports = {
  initializeDatabase,
  findUserByUsername,
  findUserById,
  listUsers,
  listUsersBasic,
  createUser,
  updateUserSystemAccess,
  listSystems,
  createSystem,
  updateSystem,
  getUserAccessibleSystems,
  getSettings,
  updateSettings,
  getDatabaseEngineLabel
};
