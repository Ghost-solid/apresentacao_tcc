const crypto = require('node:crypto');
const path = require('node:path');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');

const { pool, initializeDatabase, demoMode } = require('./src/database');
const library = require('./src/library-service');

const app = express();
const root = __dirname;
const production = process.env.NODE_ENV === 'production';
const sessionHours = Math.max(1, Math.min(Number(process.env.SESSION_HOURS || 8), 72));
const cookieName = 'ds_legacy_session';
const secureCookie = process.env.COOKIE_SECURE === undefined
  ? production
  : String(process.env.COOKIE_SECURE).toLowerCase() === 'true';

if (production) app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'none'"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      imgSrc: ["'self'", 'data:'],
      objectSrc: ["'none'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"]
    }
  },
  crossOriginResourcePolicy: { policy: 'same-origin' }
}));
app.use(express.json({ limit: '10mb' }));

function asyncRoute(handler) {
  return (request, response, next) => Promise.resolve(handler(request, response, next)).catch(next);
}

function parseCookies(header = '') {
  return header.split(';').reduce((cookies, part) => {
    const separator = part.indexOf('=');
    if (separator < 1) return cookies;
    const key = part.slice(0, separator).trim();
    const rawValue = part.slice(separator + 1).trim();
    try {
      cookies[key] = decodeURIComponent(rawValue);
    } catch {
      cookies[key] = rawValue;
    }
    return cookies;
  }, {});
}

function tokenHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: secureCookie,
    maxAge: sessionHours * 60 * 60 * 1000,
    path: '/'
  };
}

function publicUser(row) {
  return {
    id: Number(row.id),
    username: row.username,
    chave: row.username,
    name: row.name,
    nome: row.name,
    role: row.role,
    perfil: row.role
  };
}

async function createSession(response, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + sessionHours * 60 * 60 * 1000);
  await pool.query(
    'INSERT INTO app_sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)',
    [tokenHash(token), userId, expiresAt]
  );
  response.cookie(cookieName, token, sessionCookieOptions());
}

async function currentSession(request) {
  const token = parseCookies(request.headers.cookie)[cookieName];
  if (!token || token.length > 100) return null;
  const { rows } = await pool.query(
    `SELECT u.id::TEXT, u.username, u.name, u.role
     FROM app_sessions s
     JOIN app_users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > NOW() AND u.active = TRUE`,
    [tokenHash(token)]
  );
  return rows[0] ? { token, user: publicUser(rows[0]) } : null;
}

const requireAuth = asyncRoute(async (request, response, next) => {
  const session = await currentSession(request);
  if (!session) return response.status(401).json({ message: 'Sua sessão expirou. Entre novamente.', code: 'UNAUTHENTICATED' });
  request.sessionToken = session.token;
  request.user = session.user;
  next();
});

function requireSameOrigin(request, response, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return next();
  const origin = request.get('origin');
  if (!origin) return next();
  const expected = `${request.protocol}://${request.get('host')}`;
  if (origin !== expected) return response.status(403).json({ message: 'Origem da requisição não autorizada.' });
  next();
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: 'Muitas tentativas de acesso. Aguarde alguns minutos e tente novamente.' }
});

app.get('/api/health', asyncRoute(async (_request, response) => {
  await pool.query('SELECT 1');
  response.json({ status: 'ok', database: 'connected' });
}));

app.get('/api/config', (_request, response) => {
  response.json({ demoMode });
});

app.post('/api/auth/login', loginLimiter, asyncRoute(async (request, response) => {
  const username = String(request.body?.username ?? '').trim().toLowerCase().slice(0, 80);
  const password = String(request.body?.password ?? '').slice(0, 200);
  if (!username || !password) return response.status(400).json({ message: 'Informe usuário e senha.' });
  const { rows } = await pool.query(
    `SELECT id::TEXT, username, password_hash, name, role
     FROM app_users WHERE username = $1 AND active = TRUE`,
    [username]
  );
  const user = rows[0];
  const valid = user ? await bcrypt.compare(password, user.password_hash) : false;
  if (!valid) return response.status(401).json({ message: 'Usuário ou senha incorretos.' });
  await pool.query('DELETE FROM app_sessions WHERE expires_at <= NOW()');
  await createSession(response, Number(user.id));
  response.json({ user: publicUser(user) });
}));

app.get('/api/auth/session', requireAuth, (request, response) => {
  response.json({ user: request.user });
});

app.post('/api/auth/logout', requireAuth, requireSameOrigin, asyncRoute(async (request, response) => {
  await pool.query('DELETE FROM app_sessions WHERE token_hash = $1', [tokenHash(request.sessionToken)]);
  response.clearCookie(cookieName, { ...sessionCookieOptions(), maxAge: undefined });
  response.status(204).end();
}));

app.post('/api/auth/verify-password', requireAuth, requireSameOrigin, asyncRoute(async (request, response) => {
  const password = String(request.body?.password ?? '').slice(0, 200);
  const { rows } = await pool.query('SELECT password_hash FROM app_users WHERE id = $1 AND active = TRUE', [request.user.id]);
  const valid = rows[0] ? await bcrypt.compare(password, rows[0].password_hash) : false;
  if (!valid) return response.status(401).json({ message: 'Senha incorreta. Digite a senha da conta que está conectada.' });
  response.json({ valid: true });
}));

app.use('/api', requireAuth, requireSameOrigin);

app.get('/api/state', asyncRoute(async (_request, response) => {
  response.json(await library.loadState());
}));

app.post('/api/migrate-local', asyncRoute(async (request, response) => {
  const result = await library.importLocalState(request.body || {});
  response.json({ ...result, state: await library.loadState() });
}));

app.post('/api/readers', asyncRoute(async (request, response) => {
  const reader = await library.createReader(request.body);
  response.status(201).json({ reader });
}));

app.put('/api/readers/:id', asyncRoute(async (request, response) => {
  const reader = await library.updateReader(request.params.id, request.body);
  response.json({ reader });
}));

app.post('/api/readers/:id/delete', asyncRoute(async (request, response) => {
  const { rows } = await pool.query('SELECT password_hash FROM app_users WHERE id = $1 AND active = TRUE', [request.user.id]);
  const valid = rows[0] && await bcrypt.compare(String(request.body?.password ?? ''), rows[0].password_hash);
  if (!valid) return response.status(401).json({ message: 'Senha incorreta. Digite a senha da conta que está conectada.' });
  await library.deleteReader(request.params.id);
  response.status(204).end();
}));

app.post('/api/books', asyncRoute(async (request, response) => {
  const book = await library.createBook(request.body);
  response.status(201).json({ book });
}));

app.put('/api/books/:id', asyncRoute(async (request, response) => {
  const book = await library.updateBook(request.params.id, request.body);
  response.json({ book });
}));

app.post('/api/books/:id/delete', asyncRoute(async (request, response) => {
  const { rows } = await pool.query('SELECT password_hash FROM app_users WHERE id = $1 AND active = TRUE', [request.user.id]);
  const valid = rows[0] && await bcrypt.compare(String(request.body?.password ?? ''), rows[0].password_hash);
  if (!valid) return response.status(401).json({ message: 'Senha incorreta. Digite a senha da conta que está conectada.' });
  await library.deleteBook(request.params.id);
  response.status(204).end();
}));

app.post('/api/loans', asyncRoute(async (request, response) => {
  const loan = await library.createLoan(request.body, request.user);
  response.status(201).json({ loan });
}));

app.post('/api/loans/:id/return', asyncRoute(async (request, response) => {
  const loan = await library.returnLoan(request.params.id, request.body);
  response.json({ loan });
}));

app.post('/api/loans/:id/renew', asyncRoute(async (request, response) => {
  const loan = await library.renewLoan(request.params.id, request.body, request.user);
  response.json({ loan });
}));

app.post('/api/reservations', asyncRoute(async (request, response) => {
  const reservation = await library.createReservation(request.body);
  response.status(201).json({ reservation });
}));

app.post('/api/reservations/:id/cancel', asyncRoute(async (request, response) => {
  const reservation = await library.cancelReservation(request.params.id);
  response.json({ reservation });
}));

app.use('/api', (_request, response) => {
  response.status(404).json({ message: 'Rota da API não encontrada.' });
});

function sendFrontendFile(filename) {
  return (_request, response) => {
    response.set('Cache-Control', 'no-cache');
    response.sendFile(path.join(root, filename));
  };
}

app.get(['/', '/index.html'], sendFrontendFile('index.html'));
app.get('/interacao.js', sendFrontendFile('interacao.js'));
app.get('/estilo.css', sendFrontendFile('estilo.css'));
app.get('/biblioteca.css', sendFrontendFile('biblioteca.css'));
app.get('/apresentacao.css', sendFrontendFile('apresentacao.css'));
app.use('/fonts/inter', express.static(path.join(root, 'node_modules', '@fontsource', 'inter', 'files'), {
  index: false,
  dotfiles: 'deny',
  maxAge: production ? '30d' : 0
}));
app.use('/fonts/lato', express.static(path.join(root, 'node_modules', '@fontsource', 'lato', 'files'), {
  index: false,
  dotfiles: 'deny',
  maxAge: production ? '30d' : 0
}));
app.use('/images', express.static(path.join(root, 'images'), {
  index: false,
  dotfiles: 'deny',
  maxAge: production ? '7d' : 0
}));

app.use((error, _request, response, _next) => {
  if (error instanceof library.AppError) {
    return response.status(error.status).json({ message: error.message, code: error.code });
  }
  if (error?.code === '23505') {
    const message = String(error.constraint).includes('isbn')
      ? 'Já existe um livro ativo com esse ISBN.'
      : 'Já existe um cadastro com esse identificador.';
    return response.status(409).json({ message, code: 'DUPLICATE_RECORD' });
  }
  if (error?.type === 'entity.too.large') {
    return response.status(413).json({ message: 'O conjunto de dados enviado é muito grande.' });
  }
  console.error(error);
  response.status(500).json({ message: 'Não foi possível concluir a operação no servidor.' });
});

async function start() {
  await initializeDatabase();
  const port = Number(process.env.PORT || 8000);
  const server = app.listen(port, '0.0.0.0', () => {
    console.log(`DS Legacy disponível em http://localhost:${port}`);
  });
  const shutdown = signal => {
    console.log(`Encerrando servidor (${signal})...`);
    server.close(() => pool.end().finally(() => process.exit(0)));
  };
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

if (require.main === module) {
  start().catch(error => {
    console.error(`Falha ao iniciar: ${error.message}`);
    process.exit(1);
  });
}

module.exports = app;
module.exports.start = start;
