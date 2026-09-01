const fs = require('node:fs');
const path = require('node:path');

const TARGET_TABLES = new Set(['autores', 'editoras', 'classificacoes', 'livros']);

class DryRunRollback extends Error {
  constructor(report) {
    super('Simulacao concluida; alteracoes revertidas.');
    this.report = report;
  }
}

function findStatementEnd(sql, start) {
  let quoted = false;
  let escaped = false;
  for (let index = start; index < sql.length; index += 1) {
    const character = sql[index];
    if (quoted) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === "'" && sql[index + 1] === "'") {
        index += 1;
      } else if (character === "'") {
        quoted = false;
      }
    } else if (character === "'") {
      quoted = true;
    } else if (character === ';') {
      return index;
    }
  }
  throw new Error('Comando INSERT incompleto no arquivo legado.');
}

function decodeMysqlValue(rawValue) {
  const value = rawValue.trim();
  if (/^NULL$/i.test(value)) return null;
  if (!(value.startsWith("'") && value.endsWith("'"))) return value;
  const body = value.slice(1, -1);
  const replacements = {
    '0': '\0',
    b: '\b',
    n: '\n',
    r: '\r',
    t: '\t',
    Z: '\x1a',
    "'": "'",
    '"': '"',
    '\\': '\\'
  };
  let result = '';
  for (let index = 0; index < body.length; index += 1) {
    const character = body[index];
    if (character === "'" && body[index + 1] === "'") {
      result += "'";
      index += 1;
    } else if (character === '\\' && index + 1 < body.length) {
      const escaped = body[index + 1];
      result += replacements[escaped] ?? escaped;
      index += 1;
    } else {
      result += character;
    }
  }
  return result;
}

function parseTuples(valuesSql) {
  const tuples = [];
  let fields = [];
  let fieldStart = -1;
  let depth = 0;
  let quoted = false;
  let escaped = false;

  for (let index = 0; index < valuesSql.length; index += 1) {
    const character = valuesSql[index];
    if (quoted) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === "'" && valuesSql[index + 1] === "'") {
        index += 1;
      } else if (character === "'") {
        quoted = false;
      }
      continue;
    }

    if (character === "'") {
      quoted = true;
    } else if (character === '(') {
      if (depth === 0) {
        fields = [];
        fieldStart = index + 1;
      }
      depth += 1;
    } else if (character === ',' && depth === 1) {
      fields.push(decodeMysqlValue(valuesSql.slice(fieldStart, index)));
      fieldStart = index + 1;
    } else if (character === ')') {
      depth -= 1;
      if (depth === 0) {
        fields.push(decodeMysqlValue(valuesSql.slice(fieldStart, index)));
        tuples.push(fields);
        fieldStart = -1;
      }
    }
  }
  return tuples;
}

function parseLegacyTables(sql, selectedTables = TARGET_TABLES) {
  const tables = Object.fromEntries([...selectedTables].map(table => [table, []]));
  const insertPattern = /INSERT\s+INTO\s+`([^`]+)`\s*\(([^)]+)\)\s*VALUES\s*/gi;
  let match;
  while ((match = insertPattern.exec(sql)) !== null) {
    const table = match[1].toLowerCase();
    const end = findStatementEnd(sql, insertPattern.lastIndex);
    if (selectedTables.has(table)) {
      const columns = [...match[2].matchAll(/`([^`]+)`/g)].map(item => item[1]);
      for (const values of parseTuples(sql.slice(insertPattern.lastIndex, end))) {
        if (values.length !== columns.length) {
          throw new Error(`Quantidade de campos invalida na tabela ${table}.`);
        }
        tables[table].push(Object.fromEntries(columns.map((column, index) => [column, values[index]])));
      }
    }
    insertPattern.lastIndex = end + 1;
  }
  return tables;
}

function cleanText(value, maxLength) {
  return String(value ?? '').replace(/\0/g, '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function keyText(value) {
  return cleanText(value, 1_000)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function validIsbn10(value) {
  if (!/^\d{9}[\dX]$/.test(value) || /^0+$/.test(value)) return false;
  const sum = [...value].reduce((total, digit, index) =>
    total + (digit === 'X' ? 10 : Number(digit)) * (10 - index), 0);
  return sum % 11 === 0;
}

function validIsbn13(value) {
  if (!/^(?:978|979)\d{10}$/.test(value)) return false;
  const sum = [...value].slice(0, 12).reduce((total, digit, index) =>
    total + Number(digit) * (index % 2 === 0 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10 === Number(value[12]);
}

function normalizeIsbn(value) {
  const compact = cleanText(value, 80).toUpperCase().replace(/[^\dX]/g, '');
  return validIsbn10(compact) || validIsbn13(compact) ? compact : '';
}

function normalizeYear(value) {
  const raw = cleanText(value, 12);
  const fullYear = raw.match(/(?:^|\D)((?:1[5-9]|20)\d{2})(?:\D|$)/);
  if (fullYear) return fullYear[1];
  const convertedDate = raw.match(/^\d{1,2}\/\d{1,2}\/(\d{2})$/);
  if (convertedDate) {
    const year = Number(convertedDate[1]);
    return String(year <= 30 ? 2000 + year : 1900 + year);
  }
  return raw;
}

function positiveQuantity(value) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, 100_000) : 1;
}

function physicalLocation(row) {
  const parts = [];
  const shelf = cleanText(row.liv_estante, 80);
  const callNumber = cleanText(row.liv_chamada, 80);
  const accession = cleanText(row.liv_tombo, 80);
  if (shelf) parts.push(/^estante\b/i.test(shelf) ? shelf : `Estante ${shelf}`);
  if (callNumber) parts.push(`Chamada ${callNumber}`);
  if (accession) parts.push(`Tombo ${accession}`);
  return parts.join(' - ').slice(0, 160);
}

function makeFingerprint(book) {
  return [book.title, book.author, book.publisher, book.year].map(keyText).join('|');
}

function mapLegacyBooks(tables) {
  const authors = new Map(tables.autores.map(row => [String(row.aut_id), cleanText(row.aut_nome, 220)]));
  const publishers = new Map(tables.editoras.map(row => [String(row.edi_id), cleanText(row.edi_nome, 180)]));
  const categories = new Map(tables.classificacoes.map(row => [String(row.cla_id), cleanText(row.cla_titulo, 100)]));

  return tables.livros.map(row => {
    const rawIsbn = cleanText(row.liv_isbn, 80);
    const book = {
      legacyId: Number(row.liv_id),
      enabled: String(row.liv_estado ?? '') !== '0',
      title: cleanText(row.liv_titulo, 260),
      author: authors.get(String(row.liv_autor)) || '',
      publisher: publishers.get(String(row.liv_editora)) || '',
      year: normalizeYear(row.liv_ano),
      category: categories.get(String(row.liv_classificacao)) || cleanText(row.liv_tipo_material, 100),
      location: physicalLocation(row),
      isbn: normalizeIsbn(rawIsbn),
      invalidIsbn: Boolean(rawIsbn && !normalizeIsbn(rawIsbn)),
      quantity: positiveQuantity(row.liv_quantidade),
      condition: 'Nao informado'
    };
    book.fingerprint = makeFingerprint(book);
    return book;
  });
}

function existingBookMaps(rows) {
  const byIsbn = new Map();
  const byFingerprint = new Map();
  for (const row of rows) {
    const isbn = normalizeIsbn(row.isbn);
    const fingerprint = makeFingerprint({
      title: row.title,
      author: row.author,
      publisher: row.publisher,
      year: row.publication_year
    });
    if (isbn && !byIsbn.has(isbn)) byIsbn.set(isbn, row);
    if (fingerprint && !byFingerprint.has(fingerprint)) byFingerprint.set(fingerprint, row);
  }
  return { byIsbn, byFingerprint };
}

async function importBooks(client, books, { source, apply }) {
  await client.query("SELECT pg_advisory_xact_lock(hashtext('ds-legacy-book-import'))");
  const existingResult = await client.query(
    `SELECT id::TEXT, isbn, title, author, publisher, publication_year,
            category, location, quantity, available, book_condition
     FROM books WHERE deleted_at IS NULL ORDER BY id`
  );
  const importedResult = await client.query(
    'SELECT legacy_book_id::TEXT FROM legacy_book_imports WHERE source = $1',
    [source]
  );
  const importedIds = new Set(importedResult.rows.map(row => row.legacy_book_id));
  const maps = existingBookMaps(existingResult.rows);
  const report = {
    mode: apply ? 'aplicacao' : 'simulacao',
    source,
    parsed: books.length,
    candidates: 0,
    insertedTitles: 0,
    mergedRecords: 0,
    importedCopies: 0,
    alreadyImported: 0,
    skippedInactive: 0,
    skippedWithoutTitle: 0,
    invalidIsbns: 0,
    isbnTitleConflicts: 0,
    isbnConflictExamples: []
  };

  for (const book of books) {
    if (!book.enabled) {
      report.skippedInactive += 1;
      continue;
    }
    if (!book.title || !Number.isSafeInteger(book.legacyId) || book.legacyId <= 0) {
      report.skippedWithoutTitle += 1;
      continue;
    }
    if (importedIds.has(String(book.legacyId))) {
      report.alreadyImported += 1;
      continue;
    }
    report.candidates += 1;
    report.importedCopies += book.quantity;
    if (book.invalidIsbn) report.invalidIsbns += 1;

    let target = null;
    let effectiveIsbn = book.isbn;
    const isbnTarget = book.isbn ? maps.byIsbn.get(book.isbn) : null;
    if (isbnTarget && keyText(isbnTarget.title) === keyText(book.title)) {
      target = isbnTarget;
    } else if (isbnTarget) {
      report.isbnTitleConflicts += 1;
      if (report.isbnConflictExamples.length < 10) {
        report.isbnConflictExamples.push({
          isbn: book.isbn,
          existingTitle: target?.title || isbnTarget.title,
          legacyTitle: book.title
        });
      }
      // O indice do PostgreSQL exige ISBN unico. Em dados conflitantes, preservar
      // os dois titulos sem atribuir o mesmo ISBN e mais seguro que uni-los.
      effectiveIsbn = '';
    }

    if (!target) {
      const fingerprintTarget = maps.byFingerprint.get(book.fingerprint);
      const fingerprintIsbn = normalizeIsbn(fingerprintTarget?.isbn);
      if (!book.isbn || !fingerprintIsbn || fingerprintIsbn === book.isbn) {
        target = fingerprintTarget;
      }
    }

    if (target) {
      const updated = await client.query(
        `UPDATE books
         SET isbn = CASE WHEN isbn = '' THEN $2 ELSE isbn END,
             author = CASE WHEN author = '' THEN $3 ELSE author END,
             publisher = CASE WHEN publisher = '' THEN $4 ELSE publisher END,
             publication_year = CASE WHEN publication_year = '' THEN $5 ELSE publication_year END,
             category = CASE WHEN category = '' THEN $6 ELSE category END,
             location = CASE WHEN location = '' THEN $7 ELSE location END,
             book_condition = CASE WHEN book_condition = '' THEN $8 ELSE book_condition END,
             quantity = quantity + $9,
             available = available + $9,
             updated_at = NOW()
         WHERE id = $1
         RETURNING id::TEXT, isbn, title, author, publisher, publication_year,
                   category, location, quantity, available, book_condition`,
        [Number(target.id), effectiveIsbn, book.author, book.publisher, book.year,
          book.category, book.location, book.condition, book.quantity]
      );
      target = updated.rows[0];
      report.mergedRecords += 1;
    } else {
      const temporaryCode = `LEGACY-${source.slice(0, 24)}-${book.legacyId}-${process.pid}`.slice(0, 64);
      const inserted = await client.query(
        `INSERT INTO books
          (code, isbn, title, author, publisher, publication_year, category, location,
           quantity, available, book_condition)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9, $10)
         RETURNING id::TEXT, isbn, title, author, publisher, publication_year,
                   category, location, quantity, available, book_condition`,
        [temporaryCode, effectiveIsbn, book.title, book.author, book.publisher, book.year,
          book.category, book.location, book.quantity, book.condition]
      );
      target = inserted.rows[0];
      const permanentCode = String(target.id).padStart(4, '0');
      await client.query('UPDATE books SET code = $2 WHERE id = $1', [Number(target.id), permanentCode]);
      report.insertedTitles += 1;
    }

    await client.query(
      `INSERT INTO legacy_book_imports (source, legacy_book_id, book_id, imported_quantity)
       VALUES ($1, $2, $3, $4)`,
      [source, book.legacyId, Number(target.id), book.quantity]
    );
    importedIds.add(String(book.legacyId));
    if (effectiveIsbn) maps.byIsbn.set(effectiveIsbn, target);
    maps.byFingerprint.set(book.fingerprint, target);
  }

  if (!apply) throw new DryRunRollback(report);
  return report;
}

function parseArguments(argumentsList) {
  const apply = argumentsList.includes('--apply');
  const sourceArgument = argumentsList.find(value => value.startsWith('--source='));
  const filename = argumentsList.find(value => !value.startsWith('--')) || 'aliceplinio.sql';
  return {
    apply,
    filename: path.resolve(process.cwd(), filename),
    source: cleanText(sourceArgument?.slice('--source='.length) || 'aliceplinio', 120)
  };
}

function printReport(report) {
  console.log(JSON.stringify(report, null, 2));
  if (report.mode === 'simulacao') {
    console.log('Nenhuma alteracao foi gravada. Use --apply para confirmar a importacao.');
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (!fs.existsSync(options.filename)) throw new Error(`Arquivo nao encontrado: ${options.filename}`);
  const sql = fs.readFileSync(options.filename, 'utf8');
  const tables = parseLegacyTables(sql);
  const books = mapLegacyBooks(tables);
  const { pool, withTransaction, initializeDatabase } = require('../src/database');
  try {
    await initializeDatabase({ seed: false });
    let report;
    try {
      report = await withTransaction(client => importBooks(client, books, options));
    } catch (error) {
      if (!(error instanceof DryRunRollback)) throw error;
      report = error.report;
    }
    printReport(report);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(`Falha na importacao: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  parseLegacyTables,
  mapLegacyBooks,
  normalizeIsbn,
  normalizeYear,
  makeFingerprint
};
