const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { after, test } = require('node:test');
const bcrypt = require('bcryptjs');

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-legacy-demo-'));
process.env.DEMO_MODE = 'true';
process.env.NODE_ENV = 'development';
process.env.DEMO_DATABASE_PATH = path.join(temporaryRoot, 'database');
process.env.LIBRARIAN_USERNAME = 'biblioteca';
process.env.LIBRARIAN_PASSWORD = 'Biblioteca@123';
process.env.LIBRARIAN_NAME = 'Usuário de demonstração';
process.env.DIRECTOR_USERNAME = '';
process.env.DIRECTOR_PASSWORD = '';

const { pool, initializeDatabase, demoMode } = require('../src/database');

after(async () => {
  await pool.end();
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
});

test('modo de demonstração cria uma conta utilizável sem PostgreSQL externo', async () => {
  assert.equal(demoMode, true);
  await initializeDatabase();
  const { rows } = await pool.query(
    'SELECT username, password_hash, role FROM app_users WHERE username = $1',
    ['biblioteca']
  );
  assert.equal(rows[0].username, 'biblioteca');
  assert.equal(rows[0].role, 'Biblioteca');
  assert.equal(await bcrypt.compare('Biblioteca@123', rows[0].password_hash), true);
});
