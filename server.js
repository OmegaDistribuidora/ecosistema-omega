const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const SQLiteStore = require('connect-sqlite3')(session);

const {
  initializeDatabase,
  findUserByUsername,
  findUserById,
  listUsers,
  listUsersBasic,
  listAllUserSystemLinks,
  createUser,
  updateUser,
  listSystems,
  createSystem,
  updateSystem,
  getUserAccessibleSystems,
  findUserSystemLink,
  registerHistoryEntry,
  listHistory,
  getSettings,
  getDatabaseEngineLabel
} = require('./src/db');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const SESSION_SECRET = process.env.SESSION_SECRET || 'change-this-in-production';
const dataDir = path.join(__dirname, 'data');
const imagesDir =
  process.env.IMAGES_DIR ||
  (process.env.NODE_ENV === 'production' ? '/images' : path.join(__dirname, 'data', 'images'));
const allowedImageExts = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg']);

const FIXED_LOGO_URL = '/images/logo.png';
const FIXED_MASCOT_URL = '/images/aurora.png';
const STATUS_TTL_MS = Math.max(5000, Number(process.env.SYSTEM_STATUS_TTL_MS || 60000));
const STATUS_TIMEOUT_MS = Math.max(1000, Number(process.env.SYSTEM_STATUS_TIMEOUT_MS || 4000));
const systemStatusCache = new Map();

function ensureImagesDir() {
  if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true });
  }
}

function sanitizeBaseName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .toLowerCase();
}

function getImageFileNameFromUrl(url) {
  const value = String(url || '').trim();
  if (!value.startsWith('/images/')) {
    return null;
  }

  const fileName = decodeURIComponent(value.slice('/images/'.length));
  if (!fileName || fileName.includes('/') || fileName.includes('\\')) {
    return null;
  }

  return fileName;
}

function imageUrlExists(url) {
  const fileName = getImageFileNameFromUrl(url);
  if (!fileName) {
    return false;
  }
  return fs.existsSync(path.join(imagesDir, fileName));
}

function normalizePreviewImageUrl(rawUrl) {
  const value = String(rawUrl || '').trim();
  if (!value) {
    return null;
  }
  return imageUrlExists(value) ? value : null;
}

function listUploadedImages() {
  if (!fs.existsSync(imagesDir)) {
    return [];
  }

  return fs
    .readdirSync(imagesDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => allowedImageExts.has(path.extname(name).toLowerCase()))
    .map((name) => {
      const fullPath = path.join(imagesDir, name);
      const stats = fs.statSync(fullPath);
      return {
        name,
        sizeKb: Math.max(1, Math.round(stats.size / 1024)),
        updatedAt: stats.mtime.toISOString(),
        url: `/images/${encodeURIComponent(name)}`
      };
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function buildUploadFileName(customName, originalName) {
  const originalExt = path.extname(originalName || '').toLowerCase();
  const extension = allowedImageExts.has(originalExt) ? originalExt : '.png';

  const stemFromCustom = sanitizeBaseName(customName);
  const stemFromFile = sanitizeBaseName(path.basename(originalName || '', originalExt));
  const stem = stemFromCustom || stemFromFile || 'imagem';

  // Mantem nomes fixos para os assets principais usados pelo layout.
  if (stem === 'logo' || stem === 'aurora') {
    return `${stem}.png`;
  }

  return `${stem}-${Date.now()}${extension}`;
}

const imageUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      try {
        ensureImagesDir();
        cb(null, imagesDir);
      } catch (error) {
        cb(error);
      }
    },
    filename: (req, file, cb) => {
      cb(null, buildUploadFileName(req.body.custom_name, file.originalname));
    }
  }),
  limits: {
    fileSize: 8 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    const extension = path.extname(file.originalname || '').toLowerCase();
    if (!allowedImageExts.has(extension)) {
      cb(new Error('Tipo de arquivo nao permitido. Use PNG, JPG, JPEG, WEBP, GIF ou SVG.'));
      return;
    }
    cb(null, true);
  }
});

if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use('/public', express.static(path.join(__dirname, 'public')));

try {
  ensureImagesDir();
} catch (error) {
  console.warn(`Nao foi possivel preparar o diretorio de imagens (${imagesDir}):`, error.message);
}

if (fs.existsSync(imagesDir)) {
  app.use('/images', express.static(imagesDir, { maxAge: '1h' }));
}
app.use('/images', express.static(path.join(__dirname, 'public', 'assets')));

app.use(
  session({
    store: new SQLiteStore({
      db: 'sessions.sqlite',
      dir: dataDir
    }),
    secret: SESSION_SECRET,
    proxy: process.env.NODE_ENV === 'production',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 1000 * 60 * 60 * 12
    }
  })
);

function getFlash(req) {
  const flash = req.session.flash || null;
  delete req.session.flash;
  return flash;
}

function setFlash(req, type, message) {
  req.session.flash = { type, message };
}

function parseIds(raw) {
  const values = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return values
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item > 0);
}

function normalizeSystemUrl(rawUrl) {
  const value = String(rawUrl || '').trim();
  return /^https?:\/\//i.test(value) ? value : null;
}

function normalizeSsoEnvKey(value) {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
}

function parseUserSystemLinks(body) {
  const links = [];
  for (const [key, rawValue] of Object.entries(body || {})) {
    const match = key.match(/^sso_login_(\d+)$/);
    if (!match) {
      continue;
    }

    const systemId = Number(match[1]);
    const externalLogin = String(rawValue || '').trim();
    if (!Number.isInteger(systemId) || systemId <= 0 || !externalLogin) {
      continue;
    }

    links.push({
      systemId,
      externalLogin
    });
  }
  return links;
}

function getSystemSsoConfig(system) {
  if (!system || !system.sso_enabled || !system.sso_key) {
    return null;
  }

  const envKey = normalizeSsoEnvKey(system.sso_key);
  if (!envKey) {
    return null;
  }

  const secret = String(process.env[`SSO_SECRET_${envKey}`] || '').trim();
  if (!secret) {
    return null;
  }

  const ttlRaw = Number(process.env[`SSO_TTL_${envKey}`] || process.env.SSO_TOKEN_TTL || 45);
  return {
    issuer: String(process.env.SSO_ISSUER || 'ecosistema-omega').trim(),
    audience: String(process.env[`SSO_AUDIENCE_${envKey}`] || system.sso_key).trim(),
    secret,
    ttlSeconds: Number.isFinite(ttlRaw) ? Math.max(15, Math.min(300, ttlRaw)) : 45
  };
}

function buildSsoRedirectUrl(targetUrl, token) {
  const url = new URL(targetUrl);
  url.hash = new URLSearchParams({ sso: token }).toString();
  return url.toString();
}

function buildUserLinksIndex(rows) {
  const index = {};

  for (const row of rows || []) {
    const userId = Number(row.user_id);
    const systemId = Number(row.system_id);
    if (!Number.isInteger(userId) || userId <= 0) {
      continue;
    }
    if (!Number.isInteger(systemId) || systemId <= 0) {
      continue;
    }

    if (!index[userId]) {
      index[userId] = [];
    }

    index[userId].push({
      systemId,
      externalLogin: row.external_login,
      systemName: row.system_name || ''
    });
  }

  return index;
}

async function fetchWithTimeout(url, method = 'HEAD') {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), STATUS_TIMEOUT_MS);
  try {
    return await fetch(url, {
      method,
      redirect: 'follow',
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}

async function probeSystemStatus(url) {
  const checkedAt = new Date().toISOString();
  const normalizedUrl = normalizeSystemUrl(url);
  if (!normalizedUrl) {
    return { online: false, statusCode: null, checkedAt };
  }

  for (const method of ['HEAD', 'GET']) {
    try {
      const response = await fetchWithTimeout(normalizedUrl, method);
      if (response) {
        const online = response.status >= 100 && response.status < 500;
        return { online, statusCode: response.status, checkedAt };
      }
    } catch (error) {
      // tenta o metodo seguinte antes de marcar indisponivel
    }
  }

  return { online: false, statusCode: null, checkedAt };
}

async function getCachedSystemStatus(url) {
  const normalizedUrl = normalizeSystemUrl(url);
  const checkedAt = new Date().toISOString();
  if (!normalizedUrl) {
    return { online: false, statusCode: null, checkedAt };
  }

  const now = Date.now();
  const cached = systemStatusCache.get(normalizedUrl);
  if (cached && now - cached.cachedAt < STATUS_TTL_MS) {
    return cached.value;
  }

  const value = await probeSystemStatus(normalizedUrl);
  systemStatusCache.set(normalizedUrl, { cachedAt: now, value });

  if (systemStatusCache.size > 300) {
    const oldestKey = systemStatusCache.keys().next().value;
    if (oldestKey) {
      systemStatusCache.delete(oldestKey);
    }
  }

  return value;
}

async function buildSystemsStatusMap(systems) {
  const result = {};
  await Promise.all(
    (systems || []).map(async (system) => {
      result[system.id] = await getCachedSystemStatus(system.url);
    })
  );
  return result;
}

app.use(async (req, res, next) => {
  try {
    const userId = req.session.userId;

    if (!userId) {
      res.locals.currentUser = null;
      res.locals.theme = await getSettings();
      res.locals.fixedLogoUrl = FIXED_LOGO_URL;
      res.locals.fixedMascotUrl = FIXED_MASCOT_URL;
      return next();
    }

    const user = await findUserById(userId);
    if (!user) {
      req.session.destroy(() => {
        res.redirect('/login');
      });
      return;
    }

    res.locals.currentUser = user;
    res.locals.theme = await getSettings();
    res.locals.fixedLogoUrl = FIXED_LOGO_URL;
    res.locals.fixedMascotUrl = FIXED_MASCOT_URL;
    next();
  } catch (error) {
    next(error);
  }
});

function requireAuth(req, res, next) {
  if (!res.locals.currentUser) {
    return res.redirect('/login');
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!res.locals.currentUser || !res.locals.currentUser.is_admin) {
    return res.status(403).render('error', {
      flash: { type: 'error', message: 'Acesso restrito ao administrador.' },
      title: 'Acesso negado'
    });
  }
  next();
}

app.get('/', (req, res) => {
  if (res.locals.currentUser) {
    return res.redirect('/dashboard');
  }
  res.redirect('/login');
});

app.get('/login', (req, res) => {
  if (res.locals.currentUser) {
    return res.redirect('/dashboard');
  }

  const appName = (res.locals.theme && res.locals.theme.app_name) || 'Ecossistema Omega';
  res.render('login', {
    flash: getFlash(req),
    title: `${appName} | Login`
  });
});

app.post('/login', async (req, res, next) => {
  try {
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');

    if (!username || !password) {
      setFlash(req, 'error', 'Informe usuario e senha.');
      return res.redirect('/login');
    }

    const user = await findUserByUsername(username);
    if (!user) {
      setFlash(req, 'error', 'Credenciais invalidas.');
      return res.redirect('/login');
    }

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      setFlash(req, 'error', 'Credenciais invalidas.');
      return res.redirect('/login');
    }

    req.session.userId = user.id;
    res.redirect('/dashboard');
  } catch (error) {
    next(error);
  }
});

app.post('/logout', requireAuth, (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

app.get('/dashboard', requireAuth, async (req, res, next) => {
  try {
    const user = res.locals.currentUser;
    const systems = await getUserAccessibleSystems(user.id, Boolean(user.is_admin));
    const systemStatuses = await buildSystemsStatusMap(systems);
    try {
      await registerHistoryEntry({ userId: user.id, systemId: null });
    } catch (historyError) {
      console.warn('Falha ao registrar historico de acesso ao ecossistema:', historyError.message);
    }
    const todayLabel = new Intl.DateTimeFormat('pt-BR', {
      weekday: 'long',
      day: '2-digit',
      month: 'long'
    }).format(new Date());
    const appName = (res.locals.theme && res.locals.theme.app_name) || 'Ecossistema Omega';

    res.render('dashboard', {
      title: appName,
      flash: getFlash(req),
      systems,
      systemStatuses,
      todayLabel
    });
  } catch (error) {
    next(error);
  }
});

app.get('/go/:systemId', requireAuth, async (req, res, next) => {
  try {
    const user = res.locals.currentUser;
    const systemId = Number(req.params.systemId);

    if (!Number.isInteger(systemId) || systemId <= 0) {
      setFlash(req, 'error', 'Sistema invalido.');
      return res.redirect('/dashboard');
    }

    const systems = await getUserAccessibleSystems(user.id, Boolean(user.is_admin));
    const selectedSystem = systems.find((system) => Number(system.id) === systemId);

    if (!selectedSystem) {
      setFlash(req, 'error', 'Sistema nao disponivel para seu usuario.');
      return res.redirect('/dashboard');
    }

    try {
      await registerHistoryEntry({ userId: user.id, systemId });
    } catch (historyError) {
      console.warn('Falha ao registrar historico de acesso:', historyError.message);
    }

    const ssoConfig = getSystemSsoConfig(selectedSystem);
    if (!ssoConfig) {
      return res.redirect(selectedSystem.url);
    }

    const systemLink = await findUserSystemLink(user.id, systemId);
    if (!systemLink || !String(systemLink.external_login || '').trim()) {
      return res.redirect(selectedSystem.url);
    }

    const handoffToken = jwt.sign(
      {
        ecosystemUserId: Number(user.id),
        ecosystemUsername: user.username,
        targetLogin: systemLink.external_login,
        systemId
      },
      ssoConfig.secret,
      {
        algorithm: 'HS256',
        audience: ssoConfig.audience,
        issuer: ssoConfig.issuer,
        subject: String(user.id),
        jwtid: crypto.randomUUID(),
        expiresIn: `${ssoConfig.ttlSeconds}s`
      }
    );

    return res.redirect(buildSsoRedirectUrl(selectedSystem.url, handoffToken));
  } catch (error) {
    next(error);
  }
});

app.get('/admin', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const users = await listUsers();
    const systems = await listSystems({ includeInactive: true });
    const images = listUploadedImages();

    res.render('admin-home', {
      title: 'Menu Administrativo',
      flash: getFlash(req),
      usersCount: users.length,
      systemsCount: systems.length,
      imagesCount: images.length
    });
  } catch (error) {
    next(error);
  }
});

app.get('/admin/users', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const users = await listUsers();
    const userLinksIndex = buildUserLinksIndex(await listAllUserSystemLinks());
    res.render('admin-users', {
      title: 'Gerenciar Usuarios',
      flash: getFlash(req),
      users: users.map((user) => ({
        ...user,
        ssoMappings: userLinksIndex[Number(user.id)] || []
      })),
      systems: await listSystems({ includeInactive: true })
    });
  } catch (error) {
    next(error);
  }
});

app.get('/admin/systems', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const users = await listUsers();
    res.render('admin-systems', {
      title: 'Gerenciar Sistemas',
      flash: getFlash(req),
      systems: await listSystems({ includeInactive: true }),
      usersBasic: await listUsersBasic(),
      users,
      uploadedImages: listUploadedImages(),
      imagesDir
    });
  } catch (error) {
    next(error);
  }
});

app.get('/admin/history', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    res.render('admin-history', {
      title: 'Historico de Acessos',
      flash: getFlash(req),
      historyRows: await listHistory({ limit: 500 })
    });
  } catch (error) {
    next(error);
  }
});

app.post('/admin/users', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');
    const isAdmin = req.body.is_admin === 'on';
    const systemIds = parseIds(req.body.system_ids);
    const systemLinks = parseUserSystemLinks(req.body);

    if (!username || !password) {
      setFlash(req, 'error', 'Usuario e senha sao obrigatorios.');
      return res.redirect('/admin/users');
    }

    if (password.length < 6) {
      setFlash(req, 'error', 'A senha precisa ter no minimo 6 caracteres.');
      return res.redirect('/admin/users');
    }

    try {
      await createUser({ username, password, isAdmin, systemIds, systemLinks });
      setFlash(req, 'success', `Usuario ${username} criado com sucesso.`);
    } catch (error) {
      if (String(error.message || '').toUpperCase().includes('UNIQUE')) {
        setFlash(req, 'error', 'Nome de usuario ja existe.');
      } else {
        setFlash(req, 'error', 'Falha ao criar usuario.');
      }
    }

    res.redirect('/admin/users');
  } catch (error) {
    next(error);
  }
});

app.post('/admin/users/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const userId = Number(req.params.id);
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');
    const isAdmin = req.body.is_admin === 'on';
    const systemIds = parseIds(req.body.system_ids);
    const systemLinks = parseUserSystemLinks(req.body);

    if (!Number.isInteger(userId) || userId <= 0) {
      setFlash(req, 'error', 'Usuario invalido.');
      return res.redirect('/admin/users');
    }

    if (!username) {
      setFlash(req, 'error', 'O nome de usuario e obrigatorio.');
      return res.redirect('/admin/users');
    }

    if (password && password.length < 6) {
      setFlash(req, 'error', 'A nova senha precisa ter no minimo 6 caracteres.');
      return res.redirect('/admin/users');
    }

    if (res.locals.currentUser && Number(res.locals.currentUser.id) === userId && !isAdmin) {
      setFlash(req, 'error', 'Voce nao pode remover seu proprio acesso de administrador.');
      return res.redirect('/admin/users');
    }

    try {
      const updated = await updateUser({ userId, username, password, isAdmin, systemIds, systemLinks });
      if (!updated) {
        setFlash(req, 'error', 'Usuario nao encontrado.');
      } else {
        setFlash(req, 'success', `Usuario ${username} atualizado com sucesso.`);
      }
    } catch (error) {
      if (String(error.message || '').toUpperCase().includes('UNIQUE')) {
        setFlash(req, 'error', 'Nome de usuario ja existe.');
      } else {
        setFlash(req, 'error', 'Falha ao atualizar usuario.');
      }
    }

    res.redirect('/admin/users');
  } catch (error) {
    next(error);
  }
});

app.post('/admin/systems', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim();
    const url = String(req.body.url || '').trim();
    const description = String(req.body.description || '').trim();
    const previewImageUrl = normalizePreviewImageUrl(req.body.preview_image_url);
    const allowedUserIds = parseIds(req.body.user_ids);
    const ssoEnabled = req.body.sso_enabled === 'on';
    const ssoKey = String(req.body.sso_key || '').trim();

    if (!name || !url) {
      setFlash(req, 'error', 'Nome e link do sistema sao obrigatorios.');
      return res.redirect('/admin/systems');
    }

    if (!/^https?:\/\//i.test(url)) {
      setFlash(req, 'error', 'Informe uma URL valida com http:// ou https://');
      return res.redirect('/admin/systems');
    }

    if (ssoEnabled && !ssoKey) {
      setFlash(req, 'error', 'Informe a chave SSO ao habilitar login delegado.');
      return res.redirect('/admin/systems');
    }

    if (req.body.preview_image_url && !previewImageUrl) {
      setFlash(req, 'error', 'Imagem de preview invalida ou inexistente no volume.');
      return res.redirect('/admin/systems');
    }

    try {
      await createSystem({
        name,
        url,
        description,
        previewImageUrl,
        allowedUserIds,
        ssoEnabled,
        ssoKey
      });
      setFlash(req, 'success', `Sistema ${name} criado com sucesso.`);
    } catch (error) {
      setFlash(req, 'error', 'Falha ao criar sistema.');
    }

    res.redirect('/admin/systems');
  } catch (error) {
    next(error);
  }
});

app.post('/admin/systems/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const systemId = Number(req.params.id);
    const name = String(req.body.name || '').trim();
    const url = String(req.body.url || '').trim();
    const description = String(req.body.description || '').trim();
    const previewImageUrl = normalizePreviewImageUrl(req.body.preview_image_url);
    const ssoEnabled = req.body.sso_enabled === 'on';
    const ssoKey = String(req.body.sso_key || '').trim();

    if (!Number.isInteger(systemId) || systemId <= 0) {
      setFlash(req, 'error', 'Sistema invalido.');
      return res.redirect('/admin/systems');
    }

    if (!name || !url) {
      setFlash(req, 'error', 'Nome e link do sistema sao obrigatorios.');
      return res.redirect('/admin/systems');
    }

    if (!/^https?:\/\//i.test(url)) {
      setFlash(req, 'error', 'Informe uma URL valida com http:// ou https://');
      return res.redirect('/admin/systems');
    }

    if (ssoEnabled && !ssoKey) {
      setFlash(req, 'error', 'Informe a chave SSO ao habilitar login delegado.');
      return res.redirect('/admin/systems');
    }

    if (req.body.preview_image_url && !previewImageUrl) {
      setFlash(req, 'error', 'Imagem de preview invalida ou inexistente no volume.');
      return res.redirect('/admin/systems');
    }

    const updated = await updateSystem(systemId, {
      name,
      url,
      description,
      previewImageUrl,
      ssoEnabled,
      ssoKey
    });
    if (!updated) {
      setFlash(req, 'error', 'Sistema nao encontrado.');
      return res.redirect('/admin/systems');
    }

    setFlash(req, 'success', `Sistema ${name} atualizado com sucesso.`);
    res.redirect('/admin/systems');
  } catch (error) {
    next(error);
  }
});

app.post('/admin/assets/upload', requireAuth, requireAdmin, (req, res, next) => {
  imageUpload.single('image_file')(req, res, (error) => {
    if (error) {
      setFlash(req, 'error', error.message || 'Falha no upload da imagem.');
      return res.redirect('/admin/systems');
    }

    if (!req.file) {
      setFlash(req, 'error', 'Selecione um arquivo de imagem.');
      return res.redirect('/admin/systems');
    }

    setFlash(req, 'success', `Imagem enviada com sucesso: /images/${req.file.filename}`);
    res.redirect('/admin/systems');
  });
});

app.use((req, res) => {
  res.status(404).render('error', {
    title: 'Pagina nao encontrada',
    flash: { type: 'error', message: 'Pagina nao encontrada.' }
  });
});

app.use((error, req, res, next) => {
  console.error('Erro inesperado:', error);
  if (res.headersSent) {
    return next(error);
  }

  const isProduction = process.env.NODE_ENV === 'production';
  const debugMessage =
    !isProduction && error
      ? `${error.message || 'Erro desconhecido.'}${error.stack ? `\n${error.stack}` : ''}`
      : null;

  res.status(500).render('error', {
    title: 'Erro interno',
    flash: {
      type: 'error',
      message: debugMessage || 'Ocorreu um erro interno no servidor.'
    }
  });
});

async function start() {
  await initializeDatabase();
  app.listen(PORT, () => {
    console.log(`Ecossistema Omega rodando na porta ${PORT} usando ${getDatabaseEngineLabel()}`);
  });
}

start().catch((error) => {
  console.error('Falha ao iniciar aplicacao:', error);
  process.exit(1);
});
