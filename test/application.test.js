const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { after, before, test } = require('node:test');
const { PGlite } = require('@electric-sql/pglite');

process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:1/test';
process.env.NODE_ENV = 'test';

const app = require('../server');
const { pool } = require('../src/database');

let server;
let baseUrl;

before(async () => {
  await new Promise(resolve => {
    server = app.listen(0, '127.0.0.1', () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
});

after(async () => {
  await new Promise(resolve => server.close(resolve));
  await pool.end();
});

test('servidor entrega a interface com cabeçalhos de segurança', async () => {
  const response = await fetch(`${baseUrl}/`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-security-policy') || '', /default-src 'self'/);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.match(await response.text(), /DS Legacy/);
});

test('arquivos internos do servidor não ficam públicos', async () => {
  const response = await fetch(`${baseUrl}/server.js`);
  assert.equal(response.status, 404);
});

test('interface usa a API e mantém localStorage apenas para marcar a migração', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'interacao.js'), 'utf8');
  assert.match(source, /requisitarApi\('\/api\/state'/);
  assert.doesNotMatch(source, /localStorage\.setItem\('ds_(readers|library|loans|reservations)'/);
});

test('esquema PostgreSQL é executável e cria todas as entidades centrais', async () => {
  const schema = fs.readFileSync(path.join(__dirname, '..', 'database', 'schema.sql'), 'utf8');
  const database = new PGlite();
  try {
    await database.exec(schema);
    const result = await database.query(
      `SELECT tablename FROM pg_tables
       WHERE schemaname = 'public' ORDER BY tablename`
    );
    const tables = new Set(result.rows.map(row => row.tablename));
    for (const table of ['app_users', 'app_sessions', 'readers', 'books', 'loans', 'reservations']) {
      assert.ok(tables.has(table), `Tabela ausente: ${table}`);
    }
  } finally {
    await database.close();
  }
});
