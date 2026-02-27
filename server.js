const fs = require('fs');
const path = require('path');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const multer = require('multer');
const SQLiteStore = require('connect-sqlite3')(session);

const {
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
} = require('./src/db');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const SESSION_SECRET = process.env.SESSION_SECRET || 'change-this-in-production';
const dataDir = path.join(__dirname, 'data');
const imagesDir =
  process.env.IMAGES_DIR ||
  (process.env.NODE_ENV === 'production' ? '/images' : path.join(__dirname, 'data', 'images'));
const allowedImageExts = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg']);

function ensureImagesDir() {
  if (fs.existsSync(imagesDir)) {
    return;
  }
  fs.mkdirSync(imagesDir, { recursive: true });
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

function listUploadedImages() {
  if (!fs.existsSync(imagesDir)) {
    return [];
  }

  const files = fs
    .readdirSync(imagesDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => allowedImageExts.has(path.extname(name).toLowerCase()));

  return files
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

function getImageFileNameFromUrl(url) {
  const value = String(url || '').trim();
  if (!value.startsWith('/images/')) {
    return null;
  }
  const filename = decodeURIComponent(value.slice('/images/'.length));
  if (!filename || filename.includes('/') || filename.includes('\\')) {
    return null;
  }
  return filename;
}

function imageUrlExists(url) {
  const filename = getImageFileNameFromUrl(url);
  if (!filename) {
    return false;
  }
  return fs.existsSync(path.join(imagesDir, filename));
}

function findLatestImageByPrefix(prefix) {
  const normalizedPrefix = `${String(prefix || '').toLowerCase()}`;
  const matches = listUploadedImages().filter((asset) => {
    const lower = asset.name.toLowerCase();
    return lower.startsWith(`${normalizedPrefix}-`) || lower.startsWith(`${normalizedPrefix}.`);
  });
  return matches.length ? matches[0] : null;
}

async function resolveThemeAssets(baseTheme) {
  const theme = { ...(baseTheme || {}) };
  const patch = {};

  if (!imageUrlExists(theme.logo_url)) {
    const latestLogo = findLatestImageByPrefix('logo');
    if (latestLogo) {
      theme.logo_url = latestLogo.url;
      patch.logo_url = latestLogo.url;
    }
  }

  if (!imageUrlExists(theme.mascot_url)) {
    const latestAurora = findLatestImageByPrefix('aurora');
    if (latestAurora) {
      theme.mascot_url = latestAurora.url;
      patch.mascot_url = latestAurora.url;
    }
  }

  if (Object.keys(patch).length) {
    await updateSettings(patch);
  }

  return theme;
}

function buildUploadFileName(target, customName, originalName) {
  const originalExt = path.extname(originalName || '').toLowerCase();
  const extension = allowedImageExts.has(originalExt) ? originalExt : '';
  const safeExt = extension || '.png';

  if (target === 'logo') {
    return `logo${safeExt}`;
  }

  if (target === 'aurora') {
    return `aurora${safeExt}`;
  }

  const stemFromCustom = sanitizeBaseName(customName);
  const stemFromFile = sanitizeBaseName(path.basename(originalName || '', originalExt));
  const stem = stemFromCustom || stemFromFile || 'imagem';
  return `${stem}-${Date.now()}${safeExt}`;
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
      const target = String(req.body.upload_target || 'custom').toLowerCase();
      const customName = req.body.custom_name || '';
      cb(null, buildUploadFileName(target, customName, file.originalname));
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

app.use(async (req, res, next) => {
  try {
    const userId = req.session.userId;

    if (!userId) {
      res.locals.currentUser = null;
      res.locals.theme = await resolveThemeAssets(await getSettings());
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
    res.locals.theme = await resolveThemeAssets(await getSettings());
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

function parseIds(raw) {
  const values = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return values
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item > 0);
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

  res.render('login', {
    flash: getFlash(req),
    title: 'Login'
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
    setFlash(req, 'success', `Bem-vindo, ${user.username}.`);
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

    res.render('dashboard', {
      title: 'Ecossistema Omega',
      flash: getFlash(req),
      systems
    });
  } catch (error) {
    next(error);
  }
});

app.get('/admin', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const users = await listUsers();
    const systems = await listSystems({ includeInactive: true });

    res.render('admin', {
      title: 'Administracao',
      flash: getFlash(req),
      users,
      usersBasic: await listUsersBasic(),
      systems,
      settings: await resolveThemeAssets(await getSettings()),
      uploadedImages: listUploadedImages(),
      imagesDir
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

    if (!username || !password) {
      setFlash(req, 'error', 'Usuario e senha sao obrigatorios.');
      return res.redirect('/admin');
    }

    if (password.length < 6) {
      setFlash(req, 'error', 'A senha precisa ter no minimo 6 caracteres.');
      return res.redirect('/admin');
    }

    try {
      await createUser({ username, password, isAdmin, systemIds });
      setFlash(req, 'success', `Usuario ${username} criado com sucesso.`);
    } catch (error) {
      if (error && String(error.message || '').toUpperCase().includes('UNIQUE')) {
        setFlash(req, 'error', 'Nome de usuario ja existe.');
      } else {
        setFlash(req, 'error', 'Falha ao criar usuario.');
      }
    }

    res.redirect('/admin');
  } catch (error) {
    next(error);
  }
});

app.post('/admin/users/:id/access', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const userId = Number(req.params.id);
    const systemIds = parseIds(req.body.system_ids);

    if (!Number.isInteger(userId) || userId <= 0) {
      setFlash(req, 'error', 'Usuario invalido.');
      return res.redirect('/admin');
    }

    const user = await findUserById(userId);
    if (!user) {
      setFlash(req, 'error', 'Usuario nao encontrado.');
      return res.redirect('/admin');
    }

    if (user.is_admin) {
      setFlash(req, 'error', 'Permissoes de administrador sao completas por padrao.');
      return res.redirect('/admin');
    }

    await updateUserSystemAccess(userId, systemIds);
    setFlash(req, 'success', `Permissoes de ${user.username} atualizadas.`);
    res.redirect('/admin');
  } catch (error) {
    next(error);
  }
});

app.post('/admin/systems', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim();
    const url = String(req.body.url || '').trim();
    const description = String(req.body.description || '').trim();
    const allowedUserIds = parseIds(req.body.user_ids);

    if (!name || !url) {
      setFlash(req, 'error', 'Nome e link do sistema sao obrigatorios.');
      return res.redirect('/admin');
    }

    if (!/^https?:\/\//i.test(url)) {
      setFlash(req, 'error', 'Informe uma URL valida com http:// ou https://');
      return res.redirect('/admin');
    }

    try {
      await createSystem({ name, url, description, allowedUserIds });
      setFlash(req, 'success', `Sistema ${name} criado com sucesso.`);
    } catch (error) {
      setFlash(req, 'error', 'Falha ao criar sistema.');
    }

    res.redirect('/admin');
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

    if (!Number.isInteger(systemId) || systemId <= 0) {
      setFlash(req, 'error', 'Sistema invalido.');
      return res.redirect('/admin');
    }

    if (!name || !url) {
      setFlash(req, 'error', 'Nome e link do sistema sao obrigatorios.');
      return res.redirect('/admin');
    }

    if (!/^https?:\/\//i.test(url)) {
      setFlash(req, 'error', 'Informe uma URL valida com http:// ou https://');
      return res.redirect('/admin');
    }

    const updated = await updateSystem(systemId, { name, url, description });
    if (!updated) {
      setFlash(req, 'error', 'Sistema nao encontrado.');
      return res.redirect('/admin');
    }

    setFlash(req, 'success', `Sistema ${name} atualizado com sucesso.`);
    res.redirect('/admin');
  } catch (error) {
    next(error);
  }
});

app.post('/admin/assets/upload', requireAuth, requireAdmin, (req, res, next) => {
  imageUpload.single('image_file')(req, res, async (error) => {
    if (error) {
      setFlash(req, 'error', error.message || 'Falha no upload da imagem.');
      return res.redirect('/admin');
    }

    try {
      if (!req.file) {
        setFlash(req, 'error', 'Selecione um arquivo de imagem.');
        return res.redirect('/admin');
      }

      const target = String(req.body.upload_target || 'custom').toLowerCase();
      const fileUrl = `/images/${encodeURIComponent(req.file.filename)}`;

      if (target === 'logo') {
        await updateSettings({ logo_url: fileUrl });
      } else if (target === 'aurora') {
        await updateSettings({ mascot_url: fileUrl });
      } else {
        const normalizedCustom = sanitizeBaseName(req.body.custom_name || '');
        if (normalizedCustom === 'logo') {
          await updateSettings({ logo_url: fileUrl });
        }
        if (normalizedCustom === 'aurora') {
          await updateSettings({ mascot_url: fileUrl });
        }
      }

      setFlash(req, 'success', `Imagem enviada com sucesso: ${req.file.filename}`);
      res.redirect('/admin');
    } catch (routeError) {
      next(routeError);
    }
  });
});

app.post('/admin/assets/use', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const target = String(req.body.target || '').toLowerCase();
    const imageUrl = String(req.body.image_url || '').trim();

    if (!['logo', 'aurora'].includes(target)) {
      setFlash(req, 'error', 'Destino de imagem invalido.');
      return res.redirect('/admin');
    }

    if (!imageUrlExists(imageUrl)) {
      setFlash(req, 'error', 'Imagem nao encontrada no volume.');
      return res.redirect('/admin');
    }

    if (target === 'logo') {
      await updateSettings({ logo_url: imageUrl });
    } else {
      await updateSettings({ mascot_url: imageUrl });
    }

    setFlash(req, 'success', `Imagem aplicada como ${target}.`);
    res.redirect('/admin');
  } catch (error) {
    next(error);
  }
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

  res.status(500).render('error', {
    title: 'Erro interno',
    flash: { type: 'error', message: 'Ocorreu um erro interno no servidor.' }
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
