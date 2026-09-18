const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { after, before, test } = require('node:test');
const { PGlite } = require('@electric-sql/pglite');
const bcrypt = require('bcryptjs');

let postgres;

const connection = {
  async query(sql, parameters = []) {
    const result = await postgres.query(sql, parameters);
    return {
      ...result,
      rowCount: Array.isArray(result.rows) ? result.rows.length : (result.affectedRows ?? 0)
    };
  }
};

async function withTransaction(callback) {
  await connection.query('BEGIN');
  try {
    const result = await callback(connection);
    await connection.query('COMMIT');
    return result;
  } catch (error) {
    await connection.query('ROLLBACK');
    throw error;
  }
}

const databaseModule = require.resolve('../src/database');
require.cache[databaseModule] = {
  id: databaseModule,
  filename: databaseModule,
  loaded: true,
  exports: { pool: connection, withTransaction }
};

const library = require('../src/library-service');
const app = require('../server');

let server;
let baseUrl;

before(async () => {
  postgres = new PGlite();
  const schema = fs.readFileSync(path.join(__dirname, '..', 'database', 'schema.sql'), 'utf8');
  await postgres.exec(schema);
  await connection.query(
    `INSERT INTO app_users (username, password_hash, name, role)
     VALUES ($1, $2, $3, $4)`,
    ['biblioteca', await bcrypt.hash('SenhaSegura@123', 4), 'Bibliotecária', 'Biblioteca']
  );
  await new Promise(resolve => {
    server = app.listen(0, '127.0.0.1', () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
});

after(async () => {
  await new Promise(resolve => server.close(resolve));
  await postgres.close();
});

function isoDate(offset = 0) {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
}

test('API exige sessão e autentica com senha protegida no banco', async () => {
  const unauthorized = await fetch(`${baseUrl}/api/state`);
  assert.equal(unauthorized.status, 401);

  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'biblioteca', password: 'SenhaSegura@123' })
  });
  assert.equal(login.status, 200);
  const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
  assert.match(cookie, /^ds_legacy_session=/);

  const state = await fetch(`${baseUrl}/api/state`, { headers: { Cookie: cookie } });
  assert.equal(state.status, 200);
  assert.deepEqual((await state.json()).books, []);
});

test('regras de leitores, livros, empréstimos, reservas, renovação e devolução', async () => {
  const firstReader = await library.createReader({ nome: 'aNA mÁrIA', tipo: 'Aluno', turma: '1º A' });
  assert.equal(firstReader.matricula, '0001');
  assert.equal(firstReader.nome, 'Ana Mária');

  const updatedReader = await library.updateReader(firstReader.id, { nome: 'aNA mÁrIA', tipo: 'Professor', turma: 'Docentes' });
  assert.equal(updatedReader.matricula, '0001', 'O ID original deve permanecer fixo após editar o tipo.');
  assert.equal(updatedReader.nome, 'Ana Mária');
  await assert.rejects(
    library.createReader({ nome: 'Ana 123', tipo: 'Aluno' }),
    /apenas letras e espaços/
  );
  const secondReader = await library.createReader({ nome: 'Bruno', tipo: 'Professor', turma: 'Docentes' });
  assert.equal(secondReader.matricula, '0002');

  const book = await library.createBook({ title: 'Livro de teste', author: 'Autora', quantity: 1, condition: 'Bom' });
  assert.equal(book.code, '0001');
  assert.equal(book.available, 1);

  const loan = await library.createLoan({
    readerId: firstReader.id,
    bookId: book.id,
    loanDate: isoDate(),
    dueDate: isoDate(7)
  }, { name: 'Bibliotecária' });
  assert.equal(loan.status, 'ativo');

  let state = await library.loadState();
  assert.equal(state.books[0].available, 0);
  await library.renewLoan(loan.id, { newDueDate: isoDate(10) }, { name: 'Bibliotecária' });
  state = await library.loadState();
  assert.equal(state.loans[0].renewals.length, 1);
  const reservation = await library.createReservation({ bookId: book.id, readerId: secondReader.id });

  await assert.rejects(
    library.renewLoan(loan.id, { newDueDate: isoDate(14) }, { name: 'Bibliotecária' }),
    /reserva ativa/
  );

  await assert.rejects(
    library.deleteBook(book.id),
    /empréstimo ativo/
  );

  await library.returnLoan(loan.id, { condition: 'Bom', note: '' });
  state = await library.loadState();
  assert.equal(state.books[0].available, 1);
  assert.equal(state.loans.find(item => item.id === loan.id).status, 'devolvido');

  const reservedLoan = await library.createLoan({
    readerId: secondReader.id,
    bookId: book.id,
    loanDate: isoDate(),
    dueDate: isoDate(7)
  }, { name: 'Bibliotecária' });
  state = await library.loadState();
  assert.equal(state.reservations.find(item => item.id === reservation.id).status, 'atendida');

  await library.returnLoan(reservedLoan.id, { condition: 'Bom', note: '' });
  const lostLoan = await library.createLoan({
    readerId: firstReader.id,
    bookId: book.id,
    loanDate: isoDate(),
    dueDate: isoDate(7)
  }, { name: 'Bibliotecária' });
  const lostReturn = await library.returnLoan(lostLoan.id, {
    condition: 'Livro perdido',
    note: 'Exemplar informado como perdido pelo leitor.'
  });
  assert.equal(lostReturn.status, 'perdido');
  await library.deleteBook(book.id);
  await library.deleteReader(firstReader.id);
  state = await library.loadState();
  assert.equal(state.books.length, 0);
  assert.equal(state.readers.length, 1);
  assert.equal(state.loans.length, 3, 'O histórico deve ser preservado após ocultar os cadastros.');

  const archivedBook = await connection.query(
    'SELECT code, title, deleted_at IS NOT NULL AS archived FROM books WHERE id = $1',
    [book.id]
  );
  const archivedReader = await connection.query(
    'SELECT registration_code, name, deleted_at IS NOT NULL AS archived FROM readers WHERE id = $1',
    [firstReader.id]
  );
  assert.deepEqual(archivedBook.rows[0], { code: '0001', title: 'Livro de teste', archived: true });
  assert.deepEqual(archivedReader.rows[0], { registration_code: '0001', name: 'Ana Mária', archived: true });
});


test('audit records authenticated actor, restricts access and survives archival', async () => {
  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'biblioteca', password: 'SenhaSegura@123' })
  });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const headers = { Cookie: cookie, 'Content-Type': 'application/json' };
  assert.equal((await fetch(`${baseUrl}/api/audit`)).status, 401);
  assert.equal((await fetch(`${baseUrl}/api/audit`, { headers })).status, 403);
  for (const operatorName of [undefined, '', '   ', 'ab', 'a'.repeat(161), { name: 'fake' }]) {
    const invalid = await fetch(`${baseUrl}/api/readers`, {
      method: 'POST', headers, body: JSON.stringify({ nome: 'Nao Cadastrar', operatorName })
    });
    assert.equal(invalid.status, 400);
    assert.equal((await invalid.json()).code, 'OPERATOR_REQUIRED');
  }
  assert.equal((await connection.query("SELECT COUNT(*)::INTEGER AS total FROM readers WHERE name = 'Nao Cadastrar'")).rows[0].total, 0);
  const response = await fetch(`${baseUrl}/api/readers`, {
    method: 'POST', headers,
    body: JSON.stringify({ nome: 'Leitor Auditoria', operatorName: 'Maria da Biblioteca', username: 'forged', user: { id: 999, name: 'forged' } })
  });
  assert.equal(response.status, 201);
  const { reader } = await response.json();
  const entries = await connection.query('SELECT * FROM audit_logs WHERE entity = $1 AND entity_id = $2', ['leitor', reader.id]);
  assert.equal(entries.rows[0].username, 'biblioteca');
  assert.equal(entries.rows[0].user_name, 'Maria da Biblioteca');
  assert.equal(entries.rows[0].user_id, 1);
  assert.equal(entries.rows[0].action, 'cadastrar');
  assert.ok(entries.rows[0].created_at);
  const removed = await fetch(`${baseUrl}/api/readers/${reader.id}/delete`, {
    method: 'POST', headers, body: JSON.stringify({ password: 'SenhaSegura@123', operatorName: 'Joao da Biblioteca' })
  });
  assert.equal(removed.status, 204);
  const archived = await connection.query('SELECT action, user_name FROM audit_logs WHERE entity = $1 AND entity_id = $2 ORDER BY id', ['leitor', reader.id]);
  assert.deepEqual(archived.rows.map(row => row.action), ['cadastrar', 'excluir']);
  assert.equal(archived.rows[1].user_name, 'Joao da Biblioteca');
  assert.equal((await fetch(`${baseUrl}/api/backup`, { method: 'POST', headers, body: JSON.stringify({ operatorName: 'Maria da Biblioteca' }) })).status, 200);
  // Promote the test user to exercise the actual authorization boundary.
  await connection.query("UPDATE app_users SET role = 'Diretor' WHERE id = 1");
  for (let index = 0; index < 27; index++) {
    await connection.query("INSERT INTO audit_logs (username, user_name, action, entity, description) VALUES ('test', 'Test', 'editar', 'livro', 'Test')");
  }
  const page = await fetch(`${baseUrl}/api/audit?page=1`, { headers });
  assert.equal(page.status, 200);
  const first = await page.json();
  const second = await (await fetch(`${baseUrl}/api/audit?page=2`, { headers })).json();
  assert.equal(first.entries.length, 25);
  assert.ok(second.entries.length > 0);
  assert.ok(!first.entries.some(a => second.entries.some(b => a.id === b.id)));
  assert.equal((await fetch(`${baseUrl}/api/audit?page=-1`, { headers })).status, 400);
  const content = JSON.stringify(await library.listAudit());
  assert.ok(!content.includes('SenhaSegura@123'));
  const actions = await connection.query('SELECT DISTINCT action FROM audit_logs');
  for (const action of ['cadastrar', 'editar', 'excluir', 'emprestar', 'devolver', 'renovar', 'reservar', 'backup']) {
    assert.ok(actions.rows.some(row => row.action === action), action);
  }
});

test('audit failure rolls back the operation and failed operations leave no audit', async () => {
  const before = await connection.query('SELECT COUNT(*)::INTEGER AS total FROM audit_logs');
  await assert.rejects(() => library.updateReader(999999, { nome: 'Inexistente' }));
  assert.equal((await connection.query('SELECT COUNT(*)::INTEGER AS total FROM audit_logs')).rows[0].total, before.rows[0].total);
  await postgres.exec(`CREATE FUNCTION reject_test_audit() RETURNS TRIGGER LANGUAGE plpgsql AS $$
    BEGIN IF NEW.description = 'Falha Auditoria' THEN RAISE EXCEPTION 'audit unavailable'; END IF; RETURN NEW; END; $$;
    CREATE TRIGGER reject_test_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_test_audit();`);
  try {
    await assert.rejects(() => library.createReader({ nome: 'Falha Auditoria' }), /audit unavailable/);
    assert.equal((await connection.query("SELECT COUNT(*)::INTEGER AS total FROM readers WHERE name = 'Falha Auditoria'")).rows[0].total, 0);
  } finally {
    await postgres.exec('DROP TRIGGER reject_test_audit ON audit_logs; DROP FUNCTION reject_test_audit();');
  }
});
