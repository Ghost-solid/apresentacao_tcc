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

test('formulários usam seletores pesquisáveis únicos e podem ser cancelados vazios', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const source = fs.readFileSync(path.join(__dirname, '..', 'interacao.js'), 'utf8');
  for (const id of ['leitorEmprestimo', 'livroEmprestimo', 'livroReserva', 'leitorReserva']) {
    assert.match(html, new RegExp(`<input id="${id}"[^>]+list="[^"]+"`));
    assert.doesNotMatch(html, new RegExp(`<select id="${id}"`));
  }
  assert.doesNotMatch(source, /pesquisa(Leitor|Livro)(Emprestimo|Reserva)/);
  const botoesDeSaida = html.match(/<button[^>]+data-fechar-dialog[^>]*>/g) || [];
  assert.ok(botoesDeSaida.length > 0);
  assert.ok(botoesDeSaida.every(botao => /type="button"/.test(botao)));
  assert.doesNotMatch(html, /<button[^>]+value="cancel"/);
  assert.match(source, /closest\('dialog'\)\?\.close\(\)/);
});

test('Estoque permite escolher cada campo da pesquisa', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const source = fs.readFileSync(path.join(__dirname, '..', 'interacao.js'), 'utf8');
  assert.match(html, /<select id="campoPesquisaBiblioteca"/);
  for (const campo of ['todos', 'id', 'titulo', 'autor', 'editora', 'categoria', 'isbn', 'ano', 'local', 'total', 'disponiveis', 'perdidos', 'estado']) {
    assert.match(html, new RegExp(`<option value="${campo}">`));
    if (campo !== 'todos') assert.match(source, new RegExp(`${campo}: \\[`));
  }
  assert.match(source, /livroCorrespondePesquisa\(livro, termo, campo\)/);
});

test('login tem animações temáticas com alternativa de movimento reduzido', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const styles = fs.readFileSync(path.join(__dirname, '..', 'apresentacao.css'), 'utf8');
  assert.match(html, /class="biblioteca-animada" aria-hidden="true"/);
  assert.match(styles, /@keyframes flutuar-livro-um/);
  assert.match(styles, /@keyframes revelar-cartao-login/);
  assert.match(styles, /@keyframes respirar-logo-login/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(styles, /animation-duration: 0\.01ms !important/);
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
    await database.query(
      `INSERT INTO readers (registration_code, name, reader_type)
       VALUES ('ALU-0001', 'Leitor antigo', 'Aluno')`
    );
    await database.query(
      `INSERT INTO books (code, title)
       VALUES ('LIV-0001', 'Livro antigo')`
    );
    await database.exec(`
      DROP TRIGGER trg_loans_sync_status ON loans;
      ALTER TABLE loans DROP COLUMN status;
      INSERT INTO loans (reader_id, book_id, loan_date, due_date)
      SELECT readers.id, books.id, CURRENT_DATE - 2, CURRENT_DATE - 1
      FROM readers CROSS JOIN books
      WHERE readers.name = 'Leitor antigo' AND books.title = 'Livro antigo';
    `);
    await database.exec(schema);
    const migratedReader = await database.query('SELECT registration_code FROM readers WHERE name = $1', ['Leitor antigo']);
    const migratedBook = await database.query('SELECT code FROM books WHERE title = $1', ['Livro antigo']);
    const migratedLoan = await database.query('SELECT id, status FROM loans');
    const statusConstraint = await database.query(
      `SELECT pg_get_constraintdef(oid) AS definition
       FROM pg_constraint
       WHERE conrelid = 'loans'::regclass AND conname = 'loans_status_check'`
    );
    assert.equal(migratedReader.rows[0].registration_code, '0001');
    assert.equal(migratedBook.rows[0].code, '0001');
    assert.equal(migratedLoan.rows[0].status, 'atrasado', 'Dados antigos devem receber o status correspondente.');
    assert.match(statusConstraint.rows[0].definition, /ativo.*devolvido.*perdido.*atrasado/);

    let changedLoan = await database.query(
      'UPDATE loans SET return_date = CURRENT_DATE WHERE id = $1 RETURNING status',
      [migratedLoan.rows[0].id]
    );
    assert.equal(changedLoan.rows[0].status, 'devolvido');
    changedLoan = await database.query(
      'UPDATE loans SET book_lost = TRUE WHERE id = $1 RETURNING status',
      [migratedLoan.rows[0].id]
    );
    assert.equal(changedLoan.rows[0].status, 'perdido');
    changedLoan = await database.query(
      "UPDATE loans SET status = 'ativo' WHERE id = $1 RETURNING status",
      [migratedLoan.rows[0].id]
    );
    assert.equal(changedLoan.rows[0].status, 'perdido', 'O trigger deve corrigir alteracoes manuais inconsistentes.');
  } finally {
    await database.close();
  }
});
