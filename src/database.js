const fs = require('node:fs');
const path = require('node:path');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

function asBoolean(value, fallback = false) {
  if (value === undefined) return fallback;
  return String(value).toLowerCase() === 'true';
}

const demoMode = asBoolean(process.env.DEMO_MODE, false);

function createDemoPool() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('DEMO_MODE não pode ser usado em produção. Configure um servidor PostgreSQL real.');
  }

  const { PGlite } = require('@electric-sql/pglite');
  const databasePath = path.resolve(
    __dirname,
    '..',
    process.env.DEMO_DATABASE_PATH || '.demo-data'
  );
  const database = new PGlite(databasePath);

  return {
    async query(sql, parameters = []) {
      const multipleStatements = parameters.length === 0 && /;\s*\S/.test(sql);
      if (multipleStatements) {
        await database.exec(sql);
        return { rows: [], rowCount: 0 };
      }
      const result = await database.query(sql, parameters);
      return {
        ...result,
        rowCount: Number.isInteger(result.rowCount)
          ? result.rowCount
          : (Array.isArray(result.rows) ? result.rows.length : (result.affectedRows ?? 0))
      };
    },
    end() {
      return database.close();
    }
  };
}

function createPool() {
  if (demoMode) return createDemoPool();

  const connectionString = process.env.DATABASE_URL?.trim();
  const host = process.env.DB_HOST?.trim();
  if (!connectionString && !host) {
    throw new Error(
      'O PostgreSQL não foi configurado. Informe DATABASE_URL ou DB_HOST, DB_NAME, DB_USER e DB_PASSWORD.'
    );
  }

  const sslEnabled = asBoolean(process.env.DB_SSL, false);
  const connection = connectionString
    ? { connectionString }
    : {
        host,
        port: Number(process.env.DB_PORT || 5432),
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD
      };

  if (!connectionString && (!connection.database || !connection.user || !connection.password)) {
    throw new Error('DB_NAME, DB_USER e DB_PASSWORD são obrigatórios quando DATABASE_URL não é usada.');
  }

  return new Pool({
    ...connection,
    ssl: sslEnabled
      ? { rejectUnauthorized: asBoolean(process.env.DB_SSL_REJECT_UNAUTHORIZED, true) }
      : undefined,
    max: Number(process.env.DB_POOL_MAX || 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000
  });
}

const pool = createPool();
let demoTransactionQueue = Promise.resolve();

async function runTransaction(client, callback) {
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function withTransaction(callback) {
  if (demoMode) {
    const operation = demoTransactionQueue.then(() => runTransaction(pool, callback));
    demoTransactionQueue = operation.catch(() => undefined);
    return operation;
  }

  const client = await pool.connect();
  try {
    return await runTransaction(client, callback);
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

module.exports = { pool, withTransaction, initializeDatabase, demoMode };
