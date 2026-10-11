import { appState } from './estado.js';
import { $, $$, escaparHtml, formatarNomeProprio, nomeLeitorParaExibicao, tituloLivroParaExibicao, lerData, formatarData } from './utilitarios.js';
import { mostrarAviso, tratarErroOperacao, valorComOutro, limparCamposOutro, definirOpcaoOuOutro } from './interface.js';
import { requisitarApi, atualizarDepoisDaOperacao } from './api.js';
import { leitorCorrespondePesquisa, obterBloqueio, contarAdvertencias, contarAtrasos, situacaoEmprestimo } from './regras.js';
import { abrirConfirmacaoExclusao } from './exclusao.js';
import { prepararEmprestimo } from './circulacao.js';

let paginaLeitores = 1;
const leitoresPorPagina = 25;
let leitorEmEdicao = null;

function abrirFormularioLeitor(leitorId = null) {
  $('#formularioLeitor').reset();
  limparCamposOutro($('#formularioLeitor'));
  leitorEmEdicao = leitorId === null ? null : appState.leitores.find(leitor => leitor.id === Number(leitorId));
  $('#tituloFormularioLeitor').textContent = leitorEmEdicao ? 'Editar leitor' : 'Cadastrar leitor';
  $('#explicacaoFormularioLeitor').textContent = leitorEmEdicao
    ? 'Corrija os dados ou atualize a turma/setor.'
    : 'Preencha somente os dados que desejar.';
  $('#salvarLeitor').textContent = leitorEmEdicao ? 'Atualizar leitor' : 'Salvar leitor';
  if (leitorEmEdicao) {
    $('#nomeLeitor').value = formatarNomeProprio(leitorEmEdicao.nome || '');
    definirOpcaoOuOutro('tipoLeitor', leitorEmEdicao.tipo);
    definirOpcaoOuOutro('turmaLeitor', leitorEmEdicao.turma);
  }
  $('#janelaLeitor').showModal();
}

function renderizarLeitores(lista = appState.leitores) {
  const totalPaginas = Math.max(1, Math.ceil(lista.length / leitoresPorPagina));
  paginaLeitores = Math.max(1, Math.min(paginaLeitores, totalPaginas));
  const inicio = (paginaLeitores - 1) * leitoresPorPagina;
  const leitoresDaPagina = lista.slice(inicio, inicio + leitoresPorPagina);
  $('#resumoPaginacaoLeitores').textContent = lista.length
    ? `Mostrando ${inicio + 1} a ${inicio + leitoresDaPagina.length} de ${lista.length} leitores`
    : 'Nenhum leitor para exibir';
  $('#paginaAtualLeitores').textContent = `Página ${paginaLeitores} de ${totalPaginas}`;
  $('#paginaAnteriorLeitores').disabled = paginaLeitores === 1;
  $('#proximaPaginaLeitores').disabled = paginaLeitores === totalPaginas;
  const leitoresVazios = $('#leitoresVazios');
  const filtroAtivo = Boolean($('#pesquisaLeitor').value.trim() || $('#filtroSituacaoLeitor').value);
  leitoresVazios.querySelector('b').textContent = appState.leitores.length && filtroAtivo ? 'Nenhum leitor encontrado' : 'Nenhum leitor cadastrado';
  leitoresVazios.querySelector('span').textContent = appState.leitores.length && filtroAtivo ? 'Tente alterar a pesquisa ou o filtro de situação.' : 'Cadastre o primeiro leitor da biblioteca.';
  leitoresVazios.style.display = lista.length ? 'none' : 'flex';
  $('#tabelaLeitores').style.display = lista.length ? 'table' : 'none';
  $('#tabelaLeitores tbody').innerHTML = leitoresDaPagina.map(leitor => {
    const bloqueio = obterBloqueio(leitor.id);
    const advertencias = contarAdvertencias(leitor.id);
    return `<tr><td>${escaparHtml(leitor.nome || 'Sem nome')}</td><td>${escaparHtml(leitor.matricula)}</td><td>${escaparHtml(leitor.tipo || 'Não informado')}</td><td>${escaparHtml(leitor.turma || 'Não informada')}</td><td><span class="contador-advertencias ${advertencias ? 'possui' : ''}">${advertencias}</span></td><td><span class="situacao ${bloqueio.bloqueado ? 'atrasado' : ''}">${bloqueio.bloqueado ? 'Bloqueado' : 'Liberado'}</span></td><td><div class="acoes-emprestimo"><button class="botao-pequeno editar-leitor" data-id="${leitor.id}">Editar</button><button class="botao-pequeno ver-historico-leitor" data-id="${leitor.id}">Histórico</button><button class="botao-pequeno emprestar-leitor" data-id="${leitor.id}" ${bloqueio.bloqueado ? 'disabled' : ''}>Emprestar</button><button class="botao-pequeno botao-excluir excluir-leitor" data-id="${leitor.id}">Ocultar</button></div></td></tr>`;
  }).join('');
  $$('.editar-leitor').forEach(botao => botao.addEventListener('click', () => abrirFormularioLeitor(botao.dataset.id)));
  $$('.emprestar-leitor').forEach(botao => botao.addEventListener('click', () => prepararEmprestimo(botao.dataset.id)));
  $$('.ver-historico-leitor').forEach(botao => botao.addEventListener('click', () => abrirHistoricoLeitor(Number(botao.dataset.id))));
  $$('.excluir-leitor').forEach(botao => botao.addEventListener('click', () => abrirConfirmacaoExclusao('leitor', botao.dataset.id)));
}

function abrirHistoricoLeitor(leitorId) {
  const leitor = appState.leitores.find(item => item.id === leitorId);
  if (!leitor) return;
  const historico = appState.emprestimos.filter(item => item.readerId === leitorId).sort((a, b) => lerData(b.loanDate) - lerData(a.loanDate));
  const bloqueio = obterBloqueio(leitorId);
  const renovacoes = historico.reduce((total, item) => total + (item.renewals?.length || 0), 0);
  $('#nomeHistoricoLeitor').textContent = nomeLeitorParaExibicao(leitor);
  $('#dadosHistoricoLeitor').textContent = `${leitor.tipo || 'Tipo não informado'} • ${leitor.matricula} • ${leitor.turma || 'Turma/setor não informado'}`;
  $('#situacaoHistoricoLeitor').textContent = bloqueio.bloqueado ? 'Bloqueado' : 'Liberado';
  $('#situacaoHistoricoLeitor').className = `situacao ${bloqueio.bloqueado ? 'atrasado' : ''}`;
  $('#bloqueioHistoricoLeitor').textContent = bloqueio.mensagem;
  $('#bloqueioHistoricoLeitor').classList.toggle('oculto', !bloqueio.bloqueado);
  $('#historicoTotalEmprestimos').textContent = historico.length;
  $('#historicoTotalAtrasos').textContent = contarAtrasos(leitorId);
  $('#historicoTotalAdvertencias').textContent = contarAdvertencias(leitorId);
  $('#historicoTotalRenovacoes').textContent = renovacoes;
  $('#historicoLeitorVazio').style.display = historico.length ? 'none' : 'flex';
  $('#tabelaHistoricoLeitor').style.display = historico.length ? 'table' : 'none';
  $('#tabelaHistoricoLeitor tbody').innerHTML = historico.map(item => {
    const livro = appState.livros.find(valor => valor.id === item.bookId);
    const situacao = situacaoEmprestimo(item);
    const detalhes = [];
    if (item.renewals?.length) detalhes.push(`${item.renewals.length} renovação(ões)`);
    if (item.warning) detalhes.push(`Advertência: ${item.returnCondition}`);
    if (item.returnNote) detalhes.push(item.returnNote);
    if (item.penaltyUntil) detalhes.push(`Bloqueio até ${formatarData(item.penaltyUntil)}`);
    return `<tr><td>${escaparHtml(tituloLivroParaExibicao(livro))}</td><td>${formatarData(item.loanDate)}</td><td>${formatarData(item.dueDate)}</td><td>${formatarData(item.returnDate)}</td><td><span class="situacao ${situacao.classe}">${situacao.texto}</span></td><td>${escaparHtml(detalhes.join(' • ') || 'Sem observações')}</td></tr>`;
  }).join('');
  $('#janelaHistoricoLeitor').showModal();
}

function reiniciarPaginacaoLeitores() {
  paginaLeitores = 1;
  filtrarLeitores();
}

function leitorCorrespondeAoFiltro(leitor, filtro) {
  if (!filtro) return true;
  const bloqueado = obterBloqueio(leitor.id).bloqueado;
  const possuiAdvertencia = contarAdvertencias(leitor.id) > 0;
  if (filtro === 'atencao') return bloqueado || possuiAdvertencia;
  if (filtro === 'bloqueados') return bloqueado;
  if (filtro === 'advertencias') return possuiAdvertencia;
  return !bloqueado && !possuiAdvertencia;
}

export function filtrarLeitores() {
  const termo = $('#pesquisaLeitor').value;
  const filtro = $('#filtroSituacaoLeitor').value;
  renderizarLeitores(appState.leitores.filter(leitor => leitorCorrespondePesquisa(leitor, termo) && leitorCorrespondeAoFiltro(leitor, filtro)));
}

export function reiniciarLeitores() {
  paginaLeitores = 1;
  leitorEmEdicao = null;
}

export function inicializarLeitores() {
  const campoNomeLeitor = $('#nomeLeitor');
  campoNomeLeitor.addEventListener('input', () => {
    campoNomeLeitor.value = formatarNomeProprio(campoNomeLeitor.value);
  });
  campoNomeLeitor.addEventListener('blur', () => {
    campoNomeLeitor.value = formatarNomeProprio(campoNomeLeitor.value).trim();
  });

  $('#abrirLeitor').addEventListener('click', () => abrirFormularioLeitor());

  $('#salvarLeitor').addEventListener('click', async evento => {
    evento.preventDefault();
    if (!$('#formularioLeitor').reportValidity()) return;
    const editando = Boolean(leitorEmEdicao);
    const tipo = valorComOutro('tipoLeitor');
    const dadosLeitor = {
      nome: formatarNomeProprio($('#nomeLeitor').value).trim(),
      tipo,
      turma: valorComOutro('turmaLeitor')
    };
    const botao = $('#salvarLeitor');
    botao.disabled = true;
    try {
      const resultado = await requisitarApi(editando ? `/api/readers/${leitorEmEdicao.id}` : '/api/readers', {
        method: editando ? 'PUT' : 'POST',
        body: JSON.stringify(dadosLeitor)
      });
      await atualizarDepoisDaOperacao();
      $('#formularioLeitor').reset();
      limparCamposOutro($('#formularioLeitor'));
      $('#janelaLeitor').close();
      mostrarAviso(editando ? 'Informações do leitor atualizadas.' : 'Leitor cadastrado com sucesso.');
      leitorEmEdicao = null;
    } catch (erro) {
      tratarErroOperacao(erro);
    } finally {
      botao.disabled = false;
    }
  });

  $('#paginaAnteriorLeitores').addEventListener('click', () => {
    paginaLeitores -= 1;
    filtrarLeitores();
  });
  $('#proximaPaginaLeitores').addEventListener('click', () => {
    paginaLeitores += 1;
    filtrarLeitores();
  });
  $('#pesquisaLeitor').addEventListener('input', reiniciarPaginacaoLeitores);
  $('#filtroSituacaoLeitor').addEventListener('change', reiniciarPaginacaoLeitores);
}
