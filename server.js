const path = require('path');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
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
  getUserAccessibleSystems,
  getSettings,
  updateSettings,
  getDatabaseEngineLabel
} = require('./src/db');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const SESSION_SECRET = process.env.SESSION_SECRET || 'change-this-in-production';
const dataDir = path.join(__dirname, 'data');

if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use('/public', express.static(path.join(__dirname, 'public')));

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
      res.locals.theme = await getSettings();
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
      settings: await getSettings()
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

app.post('/admin/theme', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const allowedKeys = [
      'app_name',
      'hero_title',
      'hero_subtitle',
      'logo_url',
      'background_url',
      'primary_color',
      'secondary_color',
      'accent_color',
      'surface_color',
      'text_color'
    ];

    const patch = {};
    for (const key of allowedKeys) {
      patch[key] = String(req.body[key] || '').trim();
    }

    await updateSettings(patch);
    setFlash(req, 'success', 'Tema atualizado com sucesso.');
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
