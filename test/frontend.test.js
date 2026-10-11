const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { before, test } = require('node:test');

const diretorio = path.join(__dirname, '..', 'public', 'js', 'modulos');
const modulos = {};

before(async () => {
  // Importações reais detectam exports ausentes, sem executar a inicialização da página.
  for (const nome of fs.readdirSync(diretorio).filter(nome => nome.endsWith('.js'))) {
    modulos[nome] = await import(pathToFileURL(path.join(diretorio, nome)).href);
  }
});

test('módulos da interface não possuem dependências circulares', () => {
  const visitados = new Set();
  function visitar(nome, caminho = []) {
    assert.ok(!caminho.includes(nome), `Dependência circular: ${[...caminho, nome].join(' -> ')}`);
    if (visitados.has(nome)) return;
    const codigo = fs.readFileSync(path.join(diretorio, nome), 'utf8');
    for (const [, importacao] of codigo.matchAll(/from\s+['"]\.\/([^'"]+)['"]/g)) {
      visitar(importacao, [...caminho, nome]);
    }
    visitados.add(nome);
  }
  Object.keys(modulos).forEach(nome => visitar(nome));
  assert.equal(visitados.size, Object.keys(modulos).length);
});

test('pesquisas, nomes e categorias mantêm as regras após a separação', () => {
  const { formatarNomeProprio, normalizarCategoria, correspondePesquisa } = modulos['utilitarios.js'];
  const { livroCorrespondePesquisa, categoriaCorrespondeAoFiltro } = modulos['regras.js'];
  assert.equal(formatarNomeProprio('joÃO  da SILVA123'), 'João Da Silva');
  assert.equal(correspondePesquisa('joao silva', 'João Da Silva'), true);
  const livro = { code: '0011', title: 'Ação e Memória', author: 'Maria Silva', category: 'Romance' };
  assert.equal(livroCorrespondePesquisa(livro, 'acao memoria', 'titulo'), true);
  assert.equal(livroCorrespondePesquisa(livro, 'maria', 'titulo'), false);
  assert.equal(livroCorrespondePesquisa(livro, '0011', 'id'), true);
  const categorias = new Set(['Romance', 'Didático'].map(normalizarCategoria));
  assert.equal(categoriaCorrespondeAoFiltro('DIDÁTICO', 'Didático', categorias), true);
  assert.equal(categoriaCorrespondeAoFiltro('Categoria digitada errada', 'Outro', categorias), true);
  assert.equal(categoriaCorrespondeAoFiltro('Romance', 'Outro', categorias), false);
});

test('formulário de empréstimo valida a seleção e envia os IDs internos corretos', async t => {
  // DOM mínimo deste fluxo: os IDs vêm do HTML real e as chamadas ausentes falham.
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  const elementos = new Map();
  for (const [, id] of html.matchAll(/\bid="([^"]+)"/g)) {
    elementos.set(`#${id}`, {
      value: '', textContent: '', disabled: false, aberto: false, validade: '', filhos: [], eventos: {},
      classList: { add() {}, remove() {}, toggle() {} },
      addEventListener(tipo, callback) { (this.eventos[tipo] ||= []).push(callback); },
      setCustomValidity(mensagem) { this.validade = mensagem; },
      replaceChildren(...filhos) { this.filhos = filhos; },
      showModal() { this.aberto = true; },
      close() { this.aberto = false; },
      reset() {}
    });
  }
  const elemento = seletor => {
    assert.ok(elementos.has(seletor), `Seletor ausente no HTML: ${seletor}`);
    return elementos.get(seletor);
  };
  async function clicar(seletor) {
    const alvo = elemento(seletor);
    assert.ok(alvo.eventos.click?.length, `Botão sem ação: ${seletor}`);
    for (const callback of alvo.eventos.click) await callback({ target: alvo, preventDefault() {} });
  }
  const formulario = elemento('#formularioEmprestimo');
  formulario.reportValidity = () => ['leitorEmprestimo', 'livroEmprestimo', 'dataEmprestimo', 'dataPrazo']
    .every(id => elemento(`#${id}`).value && !elemento(`#${id}`).validade);

  const originais = new Map(['document', 'window', 'localStorage'].map(chave => [chave, globalThis[chave]]));
  globalThis.document = {
    querySelector: elemento, querySelectorAll: () => [], createElement: () => ({ value: '' })
  };
  globalThis.window = {};
  globalThis.localStorage = { getItem: () => null };
  // A mensagem flutuante não precisa esperar para desaparecer neste teste.
  t.mock.method(globalThis, 'setTimeout', () => null);
  t.after(() => {
    for (const [chave, valor] of originais) {
      if (valor === undefined) delete globalThis[chave];
      else globalThis[chave] = valor;
    }
  });

  const leitor = { id: 27, matricula: '0009', nome: 'João Silva', tipo: 'Aluno', turma: '1º A' };
  const livro = { id: 41, code: '0011', title: 'Memória', author: 'Maria Silva', available: 1, quantity: 1 };
  const estadoServidor = { readers: [leitor], books: [livro], loans: [], reservations: [] };
  const { appState, eventos } = modulos['estado.js'];
  Object.assign(appState, { leitores: [leitor], livros: [livro], emprestimos: [], reservas: [] });
  let atualizacoes = 0;
  const contar = () => atualizacoes++;
  eventos.addEventListener('dados-atualizados', contar);
  t.after(() => eventos.removeEventListener('dados-atualizados', contar));
  const pedidos = [];
  t.mock.method(globalThis, 'fetch', async (url, opcoes = {}) => {
    pedidos.push({ url, opcoes });
    if (url === '/api/loans') {
      const dados = JSON.parse(opcoes.body);
      assert.equal(dados.readerId, leitor.id);
      assert.equal(dados.bookId, livro.id);
      const emprestimo = { id: 3, ...dados, status: 'ativo' };
      estadoServidor.loans.push(emprestimo);
      estadoServidor.books = [{ ...livro, available: 0 }];
      return Response.json({ loan: emprestimo }, { status: 201 });
    }
    assert.equal(url, '/api/state');
    return Response.json(estadoServidor);
  });

  const { inicializarCirculacao, prepararEmprestimo } = modulos['circulacao.js'];
  const { rotuloLeitorSelecao, rotuloLivroSelecao } = modulos['interface.js'];
  inicializarCirculacao();
  prepararEmprestimo();
  assert.equal(elemento('#janelaEmprestimo').aberto, true);
  assert.equal(elemento('#opcoesLivrosEmprestimo').filhos[0].value, rotuloLivroSelecao(livro));
  elemento('#leitorEmprestimo').value = rotuloLeitorSelecao(leitor);
  elemento('#livroEmprestimo').value = 'Livro que não existe';
  await clicar('#salvarEmprestimo');
  assert.equal(pedidos.length, 0);
  assert.match(elemento('#livroEmprestimo').validade, /Selecione um livro/);

  elemento('#livroEmprestimo').value = rotuloLivroSelecao(livro);
  await clicar('#salvarEmprestimo');
  assert.equal(pedidos.length, 2);
  assert.equal(pedidos[0].opcoes.credentials, 'same-origin');
  assert.equal(atualizacoes, 1);
  assert.equal(appState.emprestimos.length, 1);
  assert.equal(appState.livros[0].available, 0);
  assert.equal(elemento('#janelaEmprestimo').aberto, false);
  assert.equal(elemento('#salvarEmprestimo').disabled, false);
  assert.match(elemento('#aviso-flutuante').textContent, /registrado com sucesso/);
  appState.reservas = [{ id: 1, bookId: livro.id, readerId: leitor.id, status: 'ativa' }];
  assert.equal(modulos['regras.js'].livroPossuiReservaAtiva(livro.id), true);
});
