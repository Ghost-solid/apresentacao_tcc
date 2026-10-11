import { appState } from './estado.js';
import { $, $$, escaparHtml } from './utilitarios.js';
import { mostrarAviso, tratarErroOperacao, valorComOutro, limparCamposOutro, definirOpcaoOuOutro } from './interface.js';
import { requisitarApi, atualizarDepoisDaOperacao } from './api.js';
import { livroCorrespondePesquisa, livroPodeSerReservado, obterCategoriasPadrao, categoriaCorrespondeAoFiltro } from './regras.js';
import { abrirConfirmacaoExclusao } from './exclusao.js';
import { abrirFormularioReserva } from './circulacao.js';

let paginaBiblioteca = 1;
const livrosPorPagina = 25;
let livroEmEdicao = null;

function abrirFormularioLivro(livroId = null) {
  $('#formularioBiblioteca').reset();
  limparCamposOutro($('#formularioBiblioteca'));
  livroEmEdicao = livroId ? appState.livros.find(livro => livro.id === Number(livroId)) : null;
  $('#tituloFormularioLivro').textContent = livroEmEdicao ? 'Editar livro' : 'Cadastrar livro';
  $('#salvarItemBiblioteca').textContent = livroEmEdicao ? 'Atualizar livro' : 'Salvar livro';
  $('#ajudaEstoque').classList.toggle('oculto', !livroEmEdicao);
  if (livroEmEdicao) {
    $('#isbnLivro').value = livroEmEdicao.isbn || '';
    $('#tituloLivro').value = livroEmEdicao.title;
    $('#autorLivro').value = livroEmEdicao.author;
    $('#editoraLivro').value = livroEmEdicao.publisher || '';
    $('#anoLivro').value = livroEmEdicao.year || '';
    $('#localLivro').value = livroEmEdicao.location || '';
    $('#quantidadeLivro').value = livroEmEdicao.quantity;
    definirOpcaoOuOutro('categoriaLivro', livroEmEdicao.category);
    definirOpcaoOuOutro('estadoLivro', livroEmEdicao.condition);
    const indisponiveis = Number(livroEmEdicao.quantity) - Number(livroEmEdicao.available);
    $('#quantidadeLivro').min = Math.max(1, indisponiveis);
    $('#ajudaEstoque').textContent = `${indisponiveis} exemplar(es) estão emprestados ou perdidos. A quantidade total não pode ser menor que esse número.`;
  } else {
    $('#quantidadeLivro').min = 1;
    $('#quantidadeLivro').value = 1;
  }
  $('#janelaBiblioteca').showModal();
}

const comparadorBiblioteca = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });

function ordenarBiblioteca(lista) {
  const ordenacao = $('#ordenacaoBiblioteca')?.value || 'codigo-asc';
  const porTitulo = ordenacao.startsWith('titulo');
  const direcao = ordenacao.endsWith('desc') ? -1 : 1;
  return [...lista].sort((livroA, livroB) => {
    const valorA = porTitulo ? livroA.title : livroA.code;
    const valorB = porTitulo ? livroB.title : livroB.code;
    const resultado = comparadorBiblioteca.compare(String(valorA || ''), String(valorB || ''));
    return resultado * direcao || Number(livroA.id) - Number(livroB.id);
  });
}

function renderizarBiblioteca(lista = appState.livros) {
  const listaOrdenada = ordenarBiblioteca(lista);
  const totalPaginas = Math.max(1, Math.ceil(listaOrdenada.length / livrosPorPagina));
  paginaBiblioteca = Math.max(1, Math.min(paginaBiblioteca, totalPaginas));
  const inicio = (paginaBiblioteca - 1) * livrosPorPagina;
  const livrosDaPagina = listaOrdenada.slice(inicio, inicio + livrosPorPagina);
  $('#resumoPaginacaoBiblioteca').textContent = lista.length
    ? `Mostrando ${inicio + 1} a ${inicio + livrosDaPagina.length} de ${lista.length} livros`
    : 'Nenhum livro para exibir';
  $('#paginaAtualBiblioteca').textContent = `Página ${paginaBiblioteca} de ${totalPaginas}`;
  $('#paginaAnteriorBiblioteca').disabled = paginaBiblioteca === 1;
  $('#proximaPaginaBiblioteca').disabled = paginaBiblioteca === totalPaginas;
  $('#titulosBiblioteca').textContent = appState.livros.length;
  $('#exemplaresBiblioteca').textContent = appState.livros.reduce((total, livro) => total + Number(livro.quantity || 0), 0);
  $('#bibliotecaDisponiveis').textContent = appState.livros.reduce((total, livro) => total + Number(livro.available || 0), 0);
  $('#estoqueBaixoBiblioteca').textContent = appState.livros.filter(livro => Number(livro.available) === 0).length;
  const bibliotecaVazia = $('#bibliotecaVazia');
  const filtroAtivo = Boolean($('#pesquisaBiblioteca').value.trim() || $('#filtroCategoriaBiblioteca').value);
  bibliotecaVazia.querySelector('b').textContent = appState.livros.length && filtroAtivo ? 'Nenhum livro encontrado' : 'Nenhum livro cadastrado';
  bibliotecaVazia.querySelector('span').textContent = appState.livros.length && filtroAtivo ? 'Tente pesquisar outro termo ou alterar a categoria.' : 'Cadastre o primeiro livro do Estoque.';
  bibliotecaVazia.style.display = lista.length ? 'none' : 'flex';
  $('#tabelaBiblioteca').style.display = lista.length ? 'table' : 'none';
  $('#tabelaBiblioteca tbody').innerHTML = livrosDaPagina.map(livro => `<tr><td>${escaparHtml(livro.code)}</td><td><b>${escaparHtml(livro.title || 'Sem título')}</b><small class="detalhe-livro">${escaparHtml(livro.publisher || '')} ${livro.year || ''}${Number(livro.lostCopies || 0) ? ` • ${livro.lostCopies} perdido(s)` : ''}</small></td><td>${escaparHtml(livro.author || 'Não informado')}</td><td>${escaparHtml(livro.category || 'Não informada')}</td><td>${escaparHtml(livro.isbn || '—')}</td><td>${escaparHtml(livro.location || 'Não informado')}</td><td>${livro.quantity}</td><td><b class="${Number(livro.available) === 0 ? 'estoque-baixo' : ''}">${livro.available}</b></td><td>${escaparHtml(livro.condition || 'Não informado')}</td><td><div class="acoes-emprestimo"><button class="botao-pequeno editar-livro" data-id="${livro.id}">Editar</button>${livroPodeSerReservado(livro) ? `<button class="botao-pequeno reservar-livro" data-id="${livro.id}">Reservar</button>` : ''}<button class="botao-pequeno botao-excluir excluir-livro" data-id="${livro.id}">Excluir</button></div></td></tr>`).join('');
  $$('.editar-livro').forEach(botao => botao.addEventListener('click', () => abrirFormularioLivro(botao.dataset.id)));
  $$('.reservar-livro').forEach(botao => botao.addEventListener('click', () => abrirFormularioReserva(botao.dataset.id)));
  $$('.excluir-livro').forEach(botao => botao.addEventListener('click', () => abrirConfirmacaoExclusao('livro', botao.dataset.id)));
}

function reiniciarPaginacaoBiblioteca() {
  paginaBiblioteca = 1;
  filtrarBiblioteca();
}

export function filtrarBiblioteca() {
  const termo = $('#pesquisaBiblioteca').value;
  const campo = $('#campoPesquisaBiblioteca').value;
  const categoria = $('#filtroCategoriaBiblioteca').value;
  const categoriasPadrao = obterCategoriasPadrao();
  renderizarBiblioteca(appState.livros.filter(livro => livroCorrespondePesquisa(livro, termo, campo) && categoriaCorrespondeAoFiltro(livro.category, categoria, categoriasPadrao)));
}

export function reiniciarEstoque() {
  paginaBiblioteca = 1;
  livroEmEdicao = null;
}

export function inicializarEstoque() {
  $('#abrirItemBiblioteca').addEventListener('click', () => abrirFormularioLivro());

  $('#salvarItemBiblioteca').addEventListener('click', async evento => {
    evento.preventDefault();
    if (!$('#formularioBiblioteca').reportValidity()) return;
    const isbn = $('#isbnLivro').value.trim();
    if (isbn && appState.livros.some(livro => livro.id !== livroEmEdicao?.id && livro.isbn === isbn)) return mostrarAviso('Já existe um livro com esse ISBN.');
    const quantidadeInformada = Number($('#quantidadeLivro').value);
    const quantidadePadrao = livroEmEdicao ? Math.max(1, Number(livroEmEdicao.quantity) || 1) : 1;
    const quantidade = $('#quantidadeLivro').value && Number.isInteger(quantidadeInformada) ? quantidadeInformada : quantidadePadrao;
    const dadosLivro = {
      isbn, title: $('#tituloLivro').value.trim(), author: $('#autorLivro').value.trim(),
      publisher: $('#editoraLivro').value.trim(), year: $('#anoLivro').value, category: valorComOutro('categoriaLivro'),
      location: $('#localLivro').value.trim(), quantity: quantidade, condition: valorComOutro('estadoLivro')
    };
    const editando = Boolean(livroEmEdicao);
    if (editando) {
      const indisponiveis = Number(livroEmEdicao.quantity) - Number(livroEmEdicao.available);
      if (quantidade < indisponiveis) return mostrarAviso(`A quantidade não pode ser menor que ${indisponiveis}.`);
    }
    const botao = $('#salvarItemBiblioteca');
    botao.disabled = true;
    try {
      const resultado = await requisitarApi(editando ? `/api/books/${livroEmEdicao.id}` : '/api/books', {
        method: editando ? 'PUT' : 'POST',
        body: JSON.stringify(dadosLivro)
      });
      await atualizarDepoisDaOperacao();
      $('#formularioBiblioteca').reset();
      limparCamposOutro($('#formularioBiblioteca'));
      $('#quantidadeLivro').value = 1;
      $('#janelaBiblioteca').close();
      mostrarAviso(editando ? 'Livro e estoque atualizados.' : `Livro cadastrado com o ID ${resultado.book.code}.`);
      livroEmEdicao = null;
    } catch (erro) {
      tratarErroOperacao(erro);
    } finally {
      botao.disabled = false;
    }
  });

  $('#paginaAnteriorBiblioteca').addEventListener('click', () => {
    paginaBiblioteca -= 1;
    filtrarBiblioteca();
  });
  $('#proximaPaginaBiblioteca').addEventListener('click', () => {
    paginaBiblioteca += 1;
    filtrarBiblioteca();
  });
  $('#pesquisaBiblioteca').addEventListener('input', reiniciarPaginacaoBiblioteca);
  $('#campoPesquisaBiblioteca').addEventListener('change', () => {
    const campo = $('#campoPesquisaBiblioteca');
    const nomeCampo = campo.options[campo.selectedIndex].textContent.toLocaleLowerCase('pt-BR');
    $('#pesquisaBiblioteca').placeholder = campo.value === 'todos'
      ? 'Pesquisar em todos os campos...'
      : `Pesquisar por ${nomeCampo}...`;
    reiniciarPaginacaoBiblioteca();
  });
  $('#filtroCategoriaBiblioteca').addEventListener('change', reiniciarPaginacaoBiblioteca);
  $('#ordenacaoBiblioteca').addEventListener('change', reiniciarPaginacaoBiblioteca);
}
