const fs = require('node:fs');
const path = require('node:path');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

function asBoolean(value, fallback = false) {
  if (value === undefined) return fallback;
  return String(value).toLowerCase() === 'true';
}

function createPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL não foi configurada. Copie .env.example para .env e informe o PostgreSQL.');
  }

  const sslEnabled = asBoolean(process.env.DB_SSL, false);
  return new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: sslEnabled
      ? { rejectUnauthorized: asBoolean(process.env.DB_SSL_REJECT_UNAUTHORIZED, true) }
      : undefined,
    max: Number(process.env.DB_POOL_MAX || 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000
  });
}

const pool = createPool();

async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function seedUser(client, { username, password, name, role }) {
  if (!username || !password || !name) return;
  if (password.length < 8) throw new Error(`A senha configurada para ${username} precisa ter pelo menos 8 caracteres.`);
  const passwordHash = await bcrypt.hash(password, 12);
  await client.query(
    `INSERT INTO app_users (username, password_hash, name, role)
     VALUES (LOWER($1), $2, $3, $4)
     ON CONFLICT (username) DO UPDATE
       SET password_hash = EXCLUDED.password_hash,
           name = EXCLUDED.name,
           role = EXCLUDED.role,
           active = TRUE,
           updated_at = NOW()`,
    [username.trim(), passwordHash, name.trim(), role]
  );
}

async function initializeDatabase({ seed = true } = {}) {
  const schemaPath = path.join(__dirname, '..', 'database', 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');
  await withTransaction(async client => {
    await client.query(schema);
    if (!seed) return;

    const development = process.env.NODE_ENV !== 'production';
    const librarianPassword = process.env.LIBRARIAN_PASSWORD || (development ? 'Biblioteca@123' : '');
    const directorPassword = process.env.DIRECTOR_PASSWORD || (development ? 'Diretor@123' : '');
    await seedUser(client, {
      username: process.env.LIBRARIAN_USERNAME || (development ? 'testebiblioteca' : ''),
      password: librarianPassword,
      name: process.env.LIBRARIAN_NAME || 'Responsável da Biblioteca',
      role: 'Biblioteca'
    });
    await seedUser(client, {
      username: process.env.DIRECTOR_USERNAME || (development ? 'testediretor' : ''),
      password: directorPassword,
      name: process.env.DIRECTOR_NAME || 'Diretor',
      role: 'Diretor'
    });

    const { rows } = await client.query('SELECT COUNT(*)::INTEGER AS total FROM app_users WHERE active = TRUE');
    if (rows[0].total === 0) {
      throw new Error('Nenhuma conta foi configurada. Defina as credenciais no .env e execute npm run db:init.');
    }
  });
}

module.exports = { pool, withTransaction, initializeDatabase };
