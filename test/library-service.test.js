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

  const reservedLoan = await library.createLoan({
    readerId: secondReader.id,
    bookId: book.id,
    loanDate: isoDate(),
    dueDate: isoDate(7)
  }, { name: 'Bibliotecária' });
  state = await library.loadState();
  assert.equal(state.reservations.find(item => item.id === reservation.id).status, 'atendida');

  await library.returnLoan(reservedLoan.id, { condition: 'Bom', note: '' });
  await library.deleteBook(book.id);
  await library.deleteReader(firstReader.id);
  state = await library.loadState();
  assert.equal(state.books.length, 0);
  assert.equal(state.readers.length, 1);
  assert.equal(state.loans.length, 2, 'O histórico deve ser preservado após ocultar os cadastros.');

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
