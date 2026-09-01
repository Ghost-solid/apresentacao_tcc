const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  parseLegacyTables,
  mapLegacyBooks,
  normalizeIsbn,
  normalizeYear
} = require('../scripts/import-legacy-books');

test('importador interpreta registros MySQL e relaciona os dados do livro', () => {
  const sql = `
    INSERT INTO \`autores\` (\`aut_id\`, \`aut_nome\`, \`aut_foto\`, \`aut_estado\`) VALUES
      (1, 'Machado de Assis', NULL, 1);
    INSERT INTO \`editoras\` (\`edi_id\`, \`edi_nome\`, \`edi_estado\`) VALUES
      (2, 'Editora D''Água', 1);
    INSERT INTO \`classificacoes\` (\`cla_id\`, \`cla_cdd\`, \`cla_titulo\`, \`cla_estado\`) VALUES
      (3, NULL, 'Literatura, brasileira', 1);
    INSERT INTO \`livros\` (\`liv_id\`, \`liv_titulo\`, \`liv_idioma\`, \`liv_autor\`, \`liv_editora\`, \`liv_classificacao\`, \`liv_paginas\`, \`liv_ano\`, \`liv_edicao\`, \`liv_local\`, \`liv_isbn\`, \`liv_tradutor\`, \`liv_tipo_material\`, \`liv_quantidade\`, \`liv_capa\`, \`liv_resumo\`, \`liv_estante\`, \`liv_chamada\`, \`liv_tombo\`, \`liv_estado\`) VALUES
      (10, 'Dom Casmurro', 'Português', 1, 2, 3, '200', '8/18/20', '1', 'SP', '978-85-359-0277-8', NULL, 'livro', 2, NULL, 'Linha 1\\nLinha 2', 'A', '869.3', '123', 1);
  `;
  const tables = parseLegacyTables(sql);
  const books = mapLegacyBooks(tables);
  assert.equal(books.length, 1);
  assert.deepEqual(
    {
      title: books[0].title,
      author: books[0].author,
      publisher: books[0].publisher,
      category: books[0].category,
      year: books[0].year,
      isbn: books[0].isbn,
      quantity: books[0].quantity,
      location: books[0].location
    },
    {
      title: 'Dom Casmurro',
      author: 'Machado de Assis',
      publisher: "Editora D'Água",
      category: 'Literatura, brasileira',
      year: '2020',
      isbn: '9788535902778',
      quantity: 2,
      location: 'Estante A - Chamada 869.3 - Tombo 123'
    }
  );
});

test('importador aceita apenas ISBN valido e normaliza anos antigos', () => {
  assert.equal(normalizeIsbn('978-85-359-0277-8'), '9788535902778');
  assert.equal(normalizeIsbn('978-852541'), '');
  assert.equal(normalizeIsbn('0000000000000'), '');
  assert.equal(normalizeYear('8/18/87'), '1987');
  assert.equal(normalizeYear('2021'), '2021');
});
