const bcrypt = require('bcryptjs');
const { pool, withTransaction } = require('./database');
const { AppError, recordAudit } = require('./library-service');

function normalizeRegistrationName(value) {
  const name = String(value ?? '').trim().replace(/\s+/g, ' ');
  if (name.length < 3 || name.length > 160 || !/^[\p{L}][\p{L}\s'-]*$/u.test(name)) return null;
  return name.replace(/\p{L}+/gu, word => word.charAt(0).toLocaleUpperCase('pt-BR') + word.slice(1).toLocaleLowerCase('pt-BR'));
}

function normalizeEmail(value) {
  const email = String(value ?? '').trim().toLowerCase();
  if (email.length < 5 || email.length > 80 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

function validRegistrationPassword(value) {
  const password = String(value ?? '');
  return password.length >= 8 && password.length <= 200
    && /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password);
}

async function registerAccount(data = {}) {
  const name = normalizeRegistrationName(data?.name);
  const email = normalizeEmail(data?.email);
  const password = String(data?.password ?? '');
  if (!name) throw new AppError(400, 'Informe seu nome completo usando apenas letras, espaços, apóstrofos ou hífens.');
  if (!email) throw new AppError(400, 'Informe um e-mail válido com até 80 caracteres.');
  if (!validRegistrationPassword(password)) {
    throw new AppError(400, 'A senha deve ter pelo menos 8 caracteres, incluindo letra maiúscula, minúscula e número.');
  }
  const passwordHash = await bcrypt.hash(password, 12);
  try {
    // Perfil e acesso são definidos pelo servidor, nunca pelo corpo da requisição.
    await pool.query(
      `INSERT INTO app_users (username, email, password_hash, name, role, active, approval_pending)
       VALUES ($1, $2, $3, $4, 'Biblioteca', FALSE, TRUE)`,
      [email, email, passwordHash, name]
    );
  } catch (error) {
    if (error?.code === '23505') throw new AppError(409, 'Já existe uma conta cadastrada com este e-mail.');
    throw error;
  }
  return { status: 'pending', message: 'Cadastro recebido. Aguarde a aprovação da direção para entrar no sistema.' };
}

function requireDirector(user) {
  if (user?.role !== 'Diretor') throw new AppError(403, 'Somente a direção pode aprovar contas.');
}

async function listPendingAccounts(user) {
  requireDirector(user);
  const { rows } = await pool.query(
    `SELECT id::TEXT, name, email, created_at
     FROM app_users WHERE approval_pending = TRUE AND active = FALSE AND role = 'Biblioteca'
     ORDER BY created_at, id`
  );
  return rows.map(row => ({ id: Number(row.id), name: row.name, email: row.email, createdAt: row.created_at }));
}

async function approveAccount(value, user) {
  requireDirector(user);
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new AppError(400, 'ID da conta inválido.');
  return withTransaction(async client => {
    const { rows } = await client.query(
      'SELECT id, name, email, role, active, approval_pending FROM app_users WHERE id = $1 FOR UPDATE', [id]
    );
    const account = rows[0];
    if (!account) throw new AppError(404, 'Conta não encontrada.');
    if (account.active || !account.approval_pending || account.role !== 'Biblioteca') {
      throw new AppError(409, 'Esta conta não possui uma solicitação de aprovação pendente.');
    }
    await client.query(
      'UPDATE app_users SET active = TRUE, approval_pending = FALSE, updated_at = NOW() WHERE id = $1', [id]
    );
    await recordAudit(client, user, 'aprovar', 'conta', id, `Aprovou o acesso de ${account.name} (${account.email}).`);
    return { message: 'Conta aprovada. O usuário já pode entrar com seu e-mail e senha.' };
  });
}

module.exports = { registerAccount, listPendingAccounts, approveAccount };
