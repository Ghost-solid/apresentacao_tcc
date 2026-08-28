const { pool, withTransaction } = require('./database');

class AppError extends Error {
  constructor(status, message, code = 'APPLICATION_ERROR') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function text(value, maxLength, fallback = '') {
  return String(value ?? fallback).trim().slice(0, maxLength);
}

function positiveId(value, field = 'ID') {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new AppError(400, `${field} inválido.`);
  return parsed;
}

function integer(value, field, { min = 0, max = 1_000_000 } = {}) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new AppError(400, `${field} deve ser um número inteiro entre ${min} e ${max}.`);
  }
  return parsed;
}

function date(value, field, optional = false) {
  if ((value === null || value === undefined || value === '') && optional) return null;
  const result = String(value ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result)) throw new AppError(400, `${field} inválida.`);
  const parsed = new Date(`${result}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== result) {
    throw new AppError(400, `${field} inválida.`);
  }
  return result;
}

function normalize(value) {
  return text(value, 200)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR');
}

function readerPrefix(type) {
  const normalized = normalize(type);
  if (normalized === 'aluno') return 'ALU';
  if (normalized === 'professor') return 'PROF';
  if (normalized === 'funcionario') return 'FUNC';
  return 'LEI';
}

function mapReader(row) {
  return {
    id: Number(row.id),
    matricula: row.registration_code,
    nome: row.name,
    tipo: row.reader_type,
    turma: row.class_sector
  };
}

function mapBook(row) {
  return {
    id: Number(row.id),
    code: row.code,
    isbn: row.isbn,
    title: row.title,
    author: row.author,
    publisher: row.publisher,
    year: row.publication_year,
    category: row.category,
    location: row.location,
    quantity: row.quantity,
    available: row.available,
    condition: row.book_condition,
    lostCopies: row.lost_copies
  };
}

function mapLoan(row) {
  return {
    id: Number(row.id),
    readerId: Number(row.reader_id),
    bookId: Number(row.book_id),
    loanDate: row.loan_date,
    dueDate: row.due_date,
    returnDate: row.return_date,
    penaltyUntil: row.penalty_until,
    responsible: row.responsible,
    returnCondition: row.return_condition,
    returnNote: row.return_note,
    warning: row.warning,
    bookLost: row.book_lost,
    renewals: Array.isArray(row.renewals) ? row.renewals : []
  };
}

function mapReservation(row) {
  return {
    id: Number(row.id),
    bookId: Number(row.book_id),
    readerId: Number(row.reader_id),
    date: row.reservation_date,
    status: row.status
  };
}

async function loadState(connection = pool) {
  const [readerResult, bookResult, loanResult, reservationResult] = await Promise.all([
    connection.query(
      `SELECT id::TEXT, registration_code, name, reader_type, class_sector
       FROM readers WHERE deleted_at IS NULL ORDER BY id`
    ),
    connection.query(
      `SELECT id::TEXT, code, isbn, title, author, publisher, publication_year,
              category, location, quantity, available, book_condition, lost_copies
       FROM books WHERE deleted_at IS NULL ORDER BY id`
    ),
    connection.query(
      `SELECT id::TEXT, reader_id::TEXT, book_id::TEXT,
              loan_date::TEXT, due_date::TEXT, return_date::TEXT, penalty_until::TEXT,
              responsible, return_condition, return_note, warning, book_lost, renewals
       FROM loans ORDER BY id DESC`
    ),
    connection.query(
      `SELECT id::TEXT, book_id::TEXT, reader_id::TEXT, reservation_date::TEXT, status
       FROM reservations ORDER BY id`
    )
  ]);

  return {
    readers: readerResult.rows.map(mapReader),
    books: bookResult.rows.map(mapBook),
    loans: loanResult.rows.map(mapLoan),
    reservations: reservationResult.rows.map(mapReservation)
  };
}

async function nextReaderCode(client, type) {
  const prefix = readerPrefix(type);
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`reader-code:${prefix}`]);
  const { rows } = await client.query(
    `SELECT registration_code FROM readers
     WHERE registration_code ~* $1`,
    [`^${prefix}-[0-9]+$`]
  );
  const greatest = rows.reduce((current, row) => {
    const found = row.registration_code.match(/-(\d+)$/);
    return Math.max(current, found ? Number(found[1]) : 0);
  }, 0);
  return `${prefix}-${String(greatest + 1).padStart(4, '0')}`;
}

async function nextBookCode(client) {
  await client.query("SELECT pg_advisory_xact_lock(hashtext('book-code:LIV'))");
  const { rows } = await client.query(`SELECT code FROM books WHERE code ~* '^LIV-[0-9]+$'`);
  const greatest = rows.reduce((current, row) => {
    const found = row.code.match(/-(\d+)$/);
    return Math.max(current, found ? Number(found[1]) : 0);
  }, 0);
  return `LIV-${String(greatest + 1).padStart(4, '0')}`;
}

function readerInput(body = {}) {
  return {
    name: text(body.nome ?? body.name, 200),
    type: text(body.tipo ?? body.type, 100, 'Aluno') || 'Aluno',
    classSector: text(body.turma ?? body.classSector, 120)
  };
}

function bookInput(body = {}) {
  return {
    isbn: text(body.isbn, 40),
    title: text(body.title, 260),
    author: text(body.author, 220),
    publisher: text(body.publisher, 180),
    publicationYear: text(body.year ?? body.publicationYear, 12),
    category: text(body.category, 100),
    location: text(body.location, 160),
    quantity: integer(body.quantity ?? 1, 'Quantidade', { min: 1, max: 100_000 }),
    condition: text(body.condition, 100)
  };
}

async function createReader(body) {
  const input = readerInput(body);
  return withTransaction(async client => {
    const registrationCode = await nextReaderCode(client, input.type);
    const { rows } = await client.query(
      `INSERT INTO readers (registration_code, name, reader_type, class_sector)
       VALUES ($1, $2, $3, $4)
       RETURNING id::TEXT, registration_code, name, reader_type, class_sector`,
      [registrationCode, input.name, input.type, input.classSector]
    );
    return mapReader(rows[0]);
  });
}

async function updateReader(idValue, body) {
  const id = positiveId(idValue, 'Leitor');
  const input = readerInput(body);
  return withTransaction(async client => {
    const currentResult = await client.query(
      `SELECT id::TEXT, registration_code, name, reader_type, class_sector
       FROM readers WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
      [id]
    );
    if (!currentResult.rowCount) throw new AppError(404, 'Leitor não encontrado.');
    const current = currentResult.rows[0];
    let registrationCode = current.registration_code;
    const automatic = registrationCode.match(/^(ALU|PROF|FUNC|LEI)-(\d+)$/i);
    const prefix = readerPrefix(input.type);
    if (automatic && automatic[1].toUpperCase() !== prefix) {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`reader-code:${prefix}`]);
      const candidate = `${prefix}-${automatic[2].padStart(4, '0')}`;
      const candidateResult = await client.query(
        `SELECT 1 FROM readers
         WHERE id <> $1 AND LOWER(registration_code) = LOWER($2)`,
        [id, candidate]
      );
      registrationCode = candidateResult.rowCount ? await nextReaderCode(client, input.type) : candidate;
    }
    const { rows } = await client.query(
      `UPDATE readers
       SET registration_code = $2, name = $3, reader_type = $4, class_sector = $5, updated_at = NOW()
       WHERE id = $1
       RETURNING id::TEXT, registration_code, name, reader_type, class_sector`,
      [id, registrationCode, input.name, input.type, input.classSector]
    );
    return mapReader(rows[0]);
  });
}

async function createBook(body) {
  const input = bookInput(body);
  return withTransaction(async client => {
    const code = await nextBookCode(client);
    const { rows } = await client.query(
      `INSERT INTO books
        (code, isbn, title, author, publisher, publication_year, category, location,
         quantity, available, book_condition, lost_copies)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9, $10, 0)
       RETURNING id::TEXT, code, isbn, title, author, publisher, publication_year,
                 category, location, quantity, available, book_condition, lost_copies`,
      [code, input.isbn, input.title, input.author, input.publisher, input.publicationYear,
        input.category, input.location, input.quantity, input.condition]
    );
    return mapBook(rows[0]);
  });
}

async function updateBook(idValue, body) {
  const id = positiveId(idValue, 'Livro');
  const input = bookInput(body);
  return withTransaction(async client => {
    const currentResult = await client.query(
      `SELECT id::TEXT, code, quantity, available FROM books
       WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
      [id]
    );
    if (!currentResult.rowCount) throw new AppError(404, 'Livro não encontrado.');
    const current = currentResult.rows[0];
    const unavailable = current.quantity - current.available;
    if (input.quantity < unavailable) {
      throw new AppError(409, `A quantidade não pode ser menor que ${unavailable}, pois há exemplares indisponíveis.`);
    }
    const available = input.quantity - unavailable;
    const { rows } = await client.query(
      `UPDATE books
       SET isbn = $2, title = $3, author = $4, publisher = $5, publication_year = $6,
           category = $7, location = $8, quantity = $9, available = $10,
           book_condition = $11, updated_at = NOW()
       WHERE id = $1
       RETURNING id::TEXT, code, isbn, title, author, publisher, publication_year,
                 category, location, quantity, available, book_condition, lost_copies`,
      [id, input.isbn, input.title, input.author, input.publisher, input.publicationYear,
        input.category, input.location, input.quantity, available, input.condition]
    );
    return mapBook(rows[0]);
  });
}

async function readerBlock(client, readerId) {
  const overdue = await client.query(
    `SELECT due_date::TEXT FROM loans
     WHERE reader_id = $1 AND return_date IS NULL AND due_date < CURRENT_DATE
     ORDER BY due_date LIMIT 1`,
    [readerId]
  );
  if (overdue.rowCount) {
    return { blocked: true, message: `Leitor possui devolução atrasada desde ${overdue.rows[0].due_date}.` };
  }
  const penalty = await client.query(
    `SELECT MAX(penalty_until)::TEXT AS penalty_until FROM loans
     WHERE reader_id = $1 AND penalty_until >= CURRENT_DATE`,
    [readerId]
  );
  if (penalty.rows[0].penalty_until) {
    return { blocked: true, message: `Leitor bloqueado até ${penalty.rows[0].penalty_until}.` };
  }
  return { blocked: false, message: '' };
}

async function createLoan(body, user) {
  const readerId = positiveId(body.readerId, 'Leitor');
  const bookId = positiveId(body.bookId, 'Livro');
  const loanDate = date(body.loanDate, 'Data do empréstimo');
  const dueDate = date(body.dueDate, 'Prazo de devolução');
  if (dueDate < loanDate) throw new AppError(400, 'O prazo deve ser posterior ao empréstimo.');

  return withTransaction(async client => {
    const readerResult = await client.query(
      'SELECT id FROM readers WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
      [readerId]
    );
    if (!readerResult.rowCount) throw new AppError(404, 'Leitor não encontrado.');
    const block = await readerBlock(client, readerId);
    if (block.blocked) throw new AppError(409, block.message, 'READER_BLOCKED');

    const bookResult = await client.query(
      'SELECT id, available FROM books WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
      [bookId]
    );
    if (!bookResult.rowCount) throw new AppError(404, 'Livro não encontrado.');
    if (bookResult.rows[0].available < 1) throw new AppError(409, 'Este livro não está mais disponível.');

    const queue = await client.query(
      `SELECT id::TEXT, reader_id::TEXT FROM reservations
       WHERE book_id = $1 AND status = 'ativa' ORDER BY id FOR UPDATE`,
      [bookId]
    );
    if (queue.rowCount && Number(queue.rows[0].reader_id) !== readerId) {
      throw new AppError(409, 'Este exemplar está reservado para o primeiro leitor da fila.', 'RESERVED_FOR_ANOTHER_READER');
    }

    const { rows } = await client.query(
      `INSERT INTO loans (reader_id, book_id, loan_date, due_date, responsible)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id::TEXT, reader_id::TEXT, book_id::TEXT, loan_date::TEXT, due_date::TEXT,
                 return_date::TEXT, penalty_until::TEXT, responsible, return_condition,
                 return_note, warning, book_lost, renewals`,
      [readerId, bookId, loanDate, dueDate, user.name]
    );
    await client.query('UPDATE books SET available = available - 1, updated_at = NOW() WHERE id = $1', [bookId]);
    if (queue.rowCount) {
      await client.query(
        "UPDATE reservations SET status = 'atendida', updated_at = NOW() WHERE id = $1",
        [Number(queue.rows[0].id)]
      );
    }
    return mapLoan(rows[0]);
  });
}

function addOneMonth(isoDate) {
  const value = new Date(`${isoDate}T12:00:00Z`);
  value.setUTCMonth(value.getUTCMonth() + 1);
  return value.toISOString().slice(0, 10);
}

async function returnLoan(idValue, body) {
  const id = positiveId(idValue, 'Empréstimo');
  const condition = text(body.condition, 100);
  const note = text(body.note, 4_000);
  if (!condition) throw new AppError(400, 'Informe o estado do livro na devolução.');
  const warning = condition !== 'Bom';
  if (warning && !note) throw new AppError(400, 'Descreva o problema encontrado no livro.');

  return withTransaction(async client => {
    const loanResult = await client.query(
      `SELECT id::TEXT, reader_id::TEXT, book_id::TEXT, loan_date::TEXT, due_date::TEXT,
              return_date::TEXT, penalty_until::TEXT, responsible, return_condition,
              return_note, warning, book_lost, renewals
       FROM loans WHERE id = $1 FOR UPDATE`,
      [id]
    );
    if (!loanResult.rowCount) throw new AppError(404, 'Empréstimo não encontrado.');
    if (loanResult.rows[0].return_date) throw new AppError(409, 'Este empréstimo já foi devolvido.');
    const todayResult = await client.query('SELECT CURRENT_DATE::TEXT AS today');
    const today = todayResult.rows[0].today;
    const overdue = loanResult.rows[0].due_date < today;
    const penaltyUntil = overdue ? addOneMonth(today) : null;
    const bookLost = condition === 'Livro perdido';

    const { rows } = await client.query(
      `UPDATE loans
       SET return_date = $2, return_condition = $3, return_note = $4, warning = $5,
           book_lost = $6, penalty_until = $7, updated_at = NOW()
       WHERE id = $1
       RETURNING id::TEXT, reader_id::TEXT, book_id::TEXT, loan_date::TEXT, due_date::TEXT,
                 return_date::TEXT, penalty_until::TEXT, responsible, return_condition,
                 return_note, warning, book_lost, renewals`,
      [id, today, condition, note, warning, bookLost, penaltyUntil]
    );
    if (bookLost) {
      await client.query(
        `UPDATE books SET lost_copies = LEAST(quantity, lost_copies + 1), updated_at = NOW()
         WHERE id = $1`,
        [Number(loanResult.rows[0].book_id)]
      );
    } else {
      await client.query(
        `UPDATE books SET available = LEAST(quantity, available + 1), updated_at = NOW()
         WHERE id = $1`,
        [Number(loanResult.rows[0].book_id)]
      );
    }
    return mapLoan(rows[0]);
  });
}

async function renewLoan(idValue, body, user) {
  const id = positiveId(idValue, 'Empréstimo');
  const newDueDate = date(body.newDueDate, 'Novo prazo');
  return withTransaction(async client => {
    const loanResult = await client.query(
      `SELECT id::TEXT, reader_id::TEXT, book_id::TEXT, loan_date::TEXT, due_date::TEXT,
              return_date::TEXT, penalty_until::TEXT, responsible, return_condition,
              return_note, warning, book_lost, renewals
       FROM loans WHERE id = $1 FOR UPDATE`,
      [id]
    );
    if (!loanResult.rowCount) throw new AppError(404, 'Empréstimo não encontrado.');
    const loan = loanResult.rows[0];
    if (loan.return_date) throw new AppError(409, 'Este empréstimo já foi devolvido.');
    const todayResult = await client.query('SELECT CURRENT_DATE::TEXT AS today');
    const today = todayResult.rows[0].today;
    if (loan.due_date < today) throw new AppError(409, 'Empréstimos atrasados não podem ser renovados.');
    if (newDueDate <= loan.due_date) throw new AppError(400, 'O novo prazo deve ser posterior ao prazo atual.');
    const block = await readerBlock(client, Number(loan.reader_id));
    if (block.blocked) throw new AppError(409, block.message, 'READER_BLOCKED');
    const reservation = await client.query(
      "SELECT 1 FROM reservations WHERE book_id = $1 AND status = 'ativa' LIMIT 1 FOR UPDATE",
      [Number(loan.book_id)]
    );
    if (reservation.rowCount) throw new AppError(409, 'Este livro possui uma reserva ativa e não pode ser renovado.');
    const renewals = Array.isArray(loan.renewals) ? loan.renewals : [];
    renewals.push({ previousDueDate: loan.due_date, newDueDate, date: today, responsible: user.name });
    const { rows } = await client.query(
      `UPDATE loans SET due_date = $2, renewals = $3::JSONB, updated_at = NOW()
       WHERE id = $1
       RETURNING id::TEXT, reader_id::TEXT, book_id::TEXT, loan_date::TEXT, due_date::TEXT,
                 return_date::TEXT, penalty_until::TEXT, responsible, return_condition,
                 return_note, warning, book_lost, renewals`,
      [id, newDueDate, JSON.stringify(renewals)]
    );
    return mapLoan(rows[0]);
  });
}

async function createReservation(body) {
  const bookId = positiveId(body.bookId, 'Livro');
  const readerId = positiveId(body.readerId, 'Leitor');
  return withTransaction(async client => {
    const readerResult = await client.query(
      'SELECT id FROM readers WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
      [readerId]
    );
    if (!readerResult.rowCount) throw new AppError(404, 'Leitor não encontrado.');
    const bookResult = await client.query(
      'SELECT id, available FROM books WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
      [bookId]
    );
    if (!bookResult.rowCount) throw new AppError(404, 'Livro não encontrado.');
    if (bookResult.rows[0].available > 0) throw new AppError(409, 'Este livro possui exemplar disponível e não precisa ser reservado.');
    const activeLoan = await client.query(
      'SELECT 1 FROM loans WHERE book_id = $1 AND return_date IS NULL LIMIT 1',
      [bookId]
    );
    if (!activeLoan.rowCount) throw new AppError(409, 'Este livro não está disponível para reserva.');
    const { rows } = await client.query(
      `INSERT INTO reservations (book_id, reader_id)
       VALUES ($1, $2)
       RETURNING id::TEXT, book_id::TEXT, reader_id::TEXT, reservation_date::TEXT, status`,
      [bookId, readerId]
    );
    return mapReservation(rows[0]);
  });
}

async function cancelReservation(idValue) {
  const id = positiveId(idValue, 'Reserva');
  return withTransaction(async client => {
    const { rows, rowCount } = await client.query(
      `UPDATE reservations SET status = 'cancelada', updated_at = NOW()
       WHERE id = $1 AND status = 'ativa'
       RETURNING id::TEXT, book_id::TEXT, reader_id::TEXT, reservation_date::TEXT, status`,
      [id]
    );
    if (!rowCount) throw new AppError(404, 'Reserva ativa não encontrada.');
    return mapReservation(rows[0]);
  });
}

async function deleteReader(idValue) {
  const id = positiveId(idValue, 'Leitor');
  return withTransaction(async client => {
    const record = await client.query(
      'SELECT id FROM readers WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
      [id]
    );
    if (!record.rowCount) throw new AppError(404, 'Leitor não encontrado.');
    const activeLoan = await client.query(
      'SELECT 1 FROM loans WHERE reader_id = $1 AND return_date IS NULL LIMIT 1',
      [id]
    );
    if (activeLoan.rowCount) throw new AppError(409, 'Este leitor possui um empréstimo ativo. Registre a devolução antes de excluí-lo.');
    const activeReservation = await client.query(
      "SELECT 1 FROM reservations WHERE reader_id = $1 AND status = 'ativa' LIMIT 1",
      [id]
    );
    if (activeReservation.rowCount) throw new AppError(409, 'Este leitor possui uma reserva ativa. Cancele ou atenda a reserva antes de excluí-lo.');
    await client.query('UPDATE readers SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1', [id]);
  });
}

async function deleteBook(idValue) {
  const id = positiveId(idValue, 'Livro');
  return withTransaction(async client => {
    const record = await client.query(
      'SELECT id FROM books WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
      [id]
    );
    if (!record.rowCount) throw new AppError(404, 'Livro não encontrado.');
    const activeLoan = await client.query(
      'SELECT 1 FROM loans WHERE book_id = $1 AND return_date IS NULL LIMIT 1',
      [id]
    );
    if (activeLoan.rowCount) throw new AppError(409, 'Este livro possui um empréstimo ativo. Registre a devolução antes de excluí-lo.');
    const activeReservation = await client.query(
      "SELECT 1 FROM reservations WHERE book_id = $1 AND status = 'ativa' LIMIT 1",
      [id]
    );
    if (activeReservation.rowCount) throw new AppError(409, 'Este livro possui uma reserva ativa. Cancele ou atenda a reserva antes de excluí-lo.');
    await client.query('UPDATE books SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1', [id]);
  });
}

function collection(value, name, max = 100_000) {
  if (!Array.isArray(value)) throw new AppError(400, `${name} precisa ser uma lista.`);
  if (value.length > max) throw new AppError(413, `${name} excede o limite de importação.`);
  return value;
}

async function resetSequence(client, table) {
  await client.query(
    `SELECT setval(pg_get_serial_sequence('${table}', 'id'),
                   GREATEST(COALESCE((SELECT MAX(id) FROM ${table}), 1), 1), TRUE)`
  );
}

async function importLocalState(body) {
  const readers = collection(body.readers, 'Leitores');
  const books = collection(body.books, 'Livros');
  const loans = collection(body.loans, 'Empréstimos');
  const reservations = collection(body.reservations, 'Reservas');

  return withTransaction(async client => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext('ds-legacy-local-import'))");
    const countResult = await client.query(
      `SELECT
         (SELECT COUNT(*) FROM readers) +
         (SELECT COUNT(*) FROM books) +
         (SELECT COUNT(*) FROM loans) +
         (SELECT COUNT(*) FROM reservations) AS total`
    );
    if (Number(countResult.rows[0].total) > 0) return { migrated: false, reason: 'database-not-empty' };

    const readerIds = new Set();
    for (const raw of readers) {
      const id = positiveId(raw.id, 'ID do leitor');
      if (readerIds.has(id)) throw new AppError(400, 'Existem leitores com IDs técnicos repetidos.');
      readerIds.add(id);
      const input = readerInput(raw);
      const code = text(raw.matricula, 64) || await nextReaderCode(client, input.type);
      await client.query(
        `INSERT INTO readers (id, registration_code, name, reader_type, class_sector)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, code, input.name, input.type, input.classSector]
      );
    }

    const bookIds = new Set();
    for (const raw of books) {
      const id = positiveId(raw.id, 'ID do livro');
      if (bookIds.has(id)) throw new AppError(400, 'Existem livros com IDs técnicos repetidos.');
      bookIds.add(id);
      const input = bookInput(raw);
      const code = text(raw.code, 64) || await nextBookCode(client);
      const available = integer(raw.available ?? input.quantity, 'Quantidade disponível', { min: 0, max: input.quantity });
      const lostCopies = integer(raw.lostCopies ?? 0, 'Exemplares perdidos', { min: 0, max: input.quantity });
      await client.query(
        `INSERT INTO books
          (id, code, isbn, title, author, publisher, publication_year, category, location,
           quantity, available, book_condition, lost_copies)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [id, code, input.isbn, input.title, input.author, input.publisher, input.publicationYear,
          input.category, input.location, input.quantity, available, input.condition, lostCopies]
      );
    }

    // Cadastros excluídos no protótipo não existem mais no localStorage, mas seus
    // históricos ainda guardam o ID. Registros arquivados preservam essas relações.
    const referencedReaderIds = new Set([...loans, ...reservations].map(raw => positiveId(raw.readerId, 'Leitor relacionado')));
    for (const id of referencedReaderIds) {
      if (readerIds.has(id)) continue;
      await client.query(
        `INSERT INTO readers (id, registration_code, name, reader_type, class_sector, deleted_at)
         VALUES ($1, $2, '', '', '', NOW())`,
        [id, `REMOVED-READER-${id}`]
      );
      readerIds.add(id);
    }
    const referencedBookIds = new Set([...loans, ...reservations].map(raw => positiveId(raw.bookId, 'Livro relacionado')));
    for (const id of referencedBookIds) {
      if (bookIds.has(id)) continue;
      await client.query(
        `INSERT INTO books
          (id, code, title, author, quantity, available, book_condition, lost_copies, deleted_at)
         VALUES ($1, $2, '', '', 1, 0, '', 0, NOW())`,
        [id, `REMOVED-BOOK-${id}`]
      );
      bookIds.add(id);
    }

    const loanIds = new Set();
    for (const raw of loans) {
      const id = positiveId(raw.id, 'ID do empréstimo');
      const readerId = positiveId(raw.readerId, 'Leitor do empréstimo');
      const bookId = positiveId(raw.bookId, 'Livro do empréstimo');
      if (loanIds.has(id)) throw new AppError(400, 'Existem empréstimos com IDs repetidos.');
      loanIds.add(id);
      const loanDate = date(raw.loanDate, 'Data do empréstimo');
      const dueDate = date(raw.dueDate, 'Prazo do empréstimo');
      const returnDate = date(raw.returnDate, 'Data da devolução', true);
      const penaltyUntil = date(raw.penaltyUntil, 'Fim do bloqueio', true);
      const renewals = Array.isArray(raw.renewals) ? raw.renewals.slice(0, 100) : [];
      await client.query(
        `INSERT INTO loans
          (id, reader_id, book_id, loan_date, due_date, return_date, penalty_until,
           responsible, return_condition, return_note, warning, book_lost, renewals)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::JSONB)`,
        [id, readerId, bookId, loanDate, dueDate, returnDate, penaltyUntil,
          text(raw.responsible, 160), text(raw.returnCondition, 100) || null,
          text(raw.returnNote, 4_000) || null, Boolean(raw.warning), Boolean(raw.bookLost),
          JSON.stringify(renewals)]
      );
    }

    const reservationIds = new Set();
    for (const raw of reservations) {
      const id = positiveId(raw.id, 'ID da reserva');
      const readerId = positiveId(raw.readerId, 'Leitor da reserva');
      const bookId = positiveId(raw.bookId, 'Livro da reserva');
      if (reservationIds.has(id)) throw new AppError(400, 'Existem reservas com IDs repetidos.');
      reservationIds.add(id);
      const status = ['ativa', 'atendida', 'cancelada'].includes(raw.status) ? raw.status : 'ativa';
      await client.query(
        `INSERT INTO reservations (id, book_id, reader_id, reservation_date, status)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, bookId, readerId, date(raw.date, 'Data da reserva'), status]
      );
    }

    await resetSequence(client, 'readers');
    await resetSequence(client, 'books');
    await resetSequence(client, 'loans');
    await resetSequence(client, 'reservations');
    return { migrated: true };
  });
}

module.exports = {
  AppError,
  loadState,
  createReader,
  updateReader,
  deleteReader,
  createBook,
  updateBook,
  deleteBook,
  createLoan,
  returnLoan,
  renewLoan,
  createReservation,
  cancelReservation,
  importLocalState
};
