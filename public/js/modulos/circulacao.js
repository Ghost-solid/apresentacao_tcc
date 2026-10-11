import { appState } from './estado.js';
import { $, $$, escaparHtml, nomeLeitorParaExibicao, tituloLivroParaExibicao, dataLocal, lerData, formatarData } from './utilitarios.js';
import { mostrarAviso, tratarErroOperacao, valorComOutro, limparCamposOutro, rotuloLeitorSelecao, rotuloLivroSelecao, preencherListaPesquisavel, itemDoCampoPesquisavel, validarCampoPesquisavel } from './interface.js';
import { requisitarApi, atualizarDepoisDaOperacao } from './api.js';
import { abrirPagina } from './navegacao.js';
import { reservasAtivasDoLivro, livroPossuiReservaAtiva, emprestimoEstaAberto, livroPodeSerReservado, obterBloqueio, situacaoEmprestimo } from './regras.js';

let filtroAtual = 'ativos';
let emprestimoEmDevolucao = null;
let emprestimoEmRenovacao = null;

function preencherLivrosReserva(lista) {
  preencherListaPesquisavel('opcoesLivrosReserva', lista, rotuloLivroSelecao);
}

function preencherLeitoresReserva(lista) {
  preencherListaPesquisavel('opcoesLeitoresReserva', lista, rotuloLeitorSelecao);
}

export function abrirFormularioReserva(livroId = '') {
  const indisponiveis = appState.livros.filter(livroPodeSerReservado);
  if (!indisponiveis.length) return mostrarAviso('Não há livros sem disponibilidade para reservar.');
  if (!appState.leitores.length) return mostrarAviso('Cadastre um leitor primeiro.');
  $('#formularioReserva').reset();
  preencherLivrosReserva(indisponiveis);
  preencherLeitoresReserva(appState.leitores);
  const livroSelecionado = indisponiveis.find(livro => livro.id === Number(livroId));
  $('#livroReserva').value = livroSelecionado ? rotuloLivroSelecao(livroSelecionado) : '';
  $('#janelaReserva').showModal();
}

export function prepararEmprestimo(leitorSelecionado = '') {
  const disponiveis = appState.livros.filter(livro => Number(livro.available) > 0);
  if (!appState.leitores.length) return mostrarAviso('Cadastre um leitor primeiro.');
  if (!disponiveis.length) return mostrarAviso('Não há livros disponíveis para empréstimo.');
  preencherOpcoesLeitores(appState.leitores, leitorSelecionado);
  preencherOpcoesLivros(disponiveis);
  const hoje = new Date();
  const prazo = new Date();
  prazo.setDate(prazo.getDate() + 7);
  $('#dataEmprestimo').value = dataLocal(hoje);
  $('#dataPrazo').value = dataLocal(prazo);
  verificarLeitorSelecionado();
  $('#janelaEmprestimo').showModal();
}

function preencherOpcoesLeitores(lista, leitorSelecionado = '') {
  preencherListaPesquisavel('opcoesLeitoresEmprestimo', lista, rotuloLeitorSelecao);
  const leitor = lista.find(item => item.id === Number(leitorSelecionado));
  $('#leitorEmprestimo').value = leitor ? rotuloLeitorSelecao(leitor) : '';
  $('#leitorEmprestimo').setCustomValidity('');
}

function preencherOpcoesLivros(lista, livroSelecionado = '') {
  preencherListaPesquisavel('opcoesLivrosEmprestimo', lista, rotuloLivroSelecao);
  const livro = lista.find(item => item.id === Number(livroSelecionado));
  $('#livroEmprestimo').value = livro ? rotuloLivroSelecao(livro) : '';
  $('#livroEmprestimo').setCustomValidity('');
}

function verificarLeitorSelecionado() {
  const leitor = itemDoCampoPesquisavel('leitorEmprestimo', appState.leitores, rotuloLeitorSelecao);
  const leitorId = leitor?.id;
  const aviso = $('#avisoBloqueio');
  if (!leitorId) {
    aviso.classList.add('oculto');
    $('#salvarEmprestimo').disabled = false;
    return;
  }
  const bloqueio = obterBloqueio(leitorId);
  aviso.textContent = bloqueio.mensagem;
  aviso.classList.remove('oculto');
  aviso.classList.toggle('liberado', !bloqueio.bloqueado);
  $('#salvarEmprestimo').disabled = bloqueio.bloqueado;
}

function abrirFormularioDevolucao(emprestimoId) {
  const emprestimo = appState.emprestimos.find(item => item.id === emprestimoId);
  if (!emprestimo || !emprestimoEstaAberto(emprestimo)) return;
  const leitor = appState.leitores.find(item => item.id === emprestimo.readerId);
  const livro = appState.livros.find(item => item.id === emprestimo.bookId);
  emprestimoEmDevolucao = emprestimoId;
  $('#formularioDevolucao').reset();
  limparCamposOutro($('#formularioDevolucao'));
  atualizarRegraAdvertencia();
  $('#resumoDevolucao').innerHTML = `<b>${escaparHtml(tituloLivroParaExibicao(livro))}</b><span>Emprestado para ${escaparHtml(nomeLeitorParaExibicao(leitor))}</span><span>Prazo: ${formatarData(emprestimo.dueDate)}</span>`;
  $('#janelaDevolucao').showModal();
}

function atualizarRegraAdvertencia() {
  const geraAdvertencia = $('#estadoDevolucao').value !== 'Bom';
  $('#observacaoDevolucao').required = geraAdvertencia;
  $('#observacaoDevolucao').placeholder = geraAdvertencia ? 'Descreva obrigatoriamente o problema encontrado' : 'Observação opcional para devolução em bom estado';
}

async function registrarDevolucao(emprestimoId, estado, observacao) {
  const emprestimo = appState.emprestimos.find(item => item.id === emprestimoId);
  if (!emprestimo || !emprestimoEstaAberto(emprestimo)) return;
  const resultado = await requisitarApi(`/api/loans/${emprestimoId}/return`, {
    method: 'POST',
    body: JSON.stringify({ condition: estado, note: observacao })
  });
  await atualizarDepoisDaOperacao();
  const devolucao = resultado.loan;
  const atrasado = Boolean(devolucao.penaltyUntil);
  if (devolucao.bookLost && atrasado) return mostrarAviso(`Livro perdido e indisponível. Leitor advertido e bloqueado até ${formatarData(devolucao.penaltyUntil)}.`);
  if (devolucao.bookLost) return mostrarAviso('Livro registrado como perdido e indisponível. Advertência adicionada ao leitor.');
  if (devolucao.warning && atrasado) return mostrarAviso(`Advertência registrada e leitor bloqueado até ${formatarData(devolucao.penaltyUntil)}.`);
  if (devolucao.warning) return mostrarAviso('Devolução concluída e advertência registrada para o leitor.');
  mostrarAviso(atrasado ? `Devolução atrasada: leitor bloqueado até ${formatarData(devolucao.penaltyUntil)}.` : 'Devolução registrada em bom estado.');
}

function abrirFormularioRenovacao(emprestimoId) {
  const emprestimo = appState.emprestimos.find(item => item.id === emprestimoId);
  if (!emprestimo || !emprestimoEstaAberto(emprestimo)) return;
  if (emprestimo.status === 'atrasado') return mostrarAviso('Empréstimos atrasados não podem ser renovados.');
  if (livroPossuiReservaAtiva(emprestimo.bookId)) return mostrarAviso('Este livro possui uma reserva ativa e não pode ser renovado.');
  const bloqueio = obterBloqueio(emprestimo.readerId);
  if (bloqueio.bloqueado) return mostrarAviso(bloqueio.mensagem);
  const leitor = appState.leitores.find(item => item.id === emprestimo.readerId);
  const livro = appState.livros.find(item => item.id === emprestimo.bookId);
  emprestimoEmRenovacao = emprestimoId;
  $('#resumoRenovacao').innerHTML = `<b>${escaparHtml(tituloLivroParaExibicao(livro))}</b><span>Leitor: ${escaparHtml(nomeLeitorParaExibicao(leitor))}</span><span>Prazo atual: ${formatarData(emprestimo.dueDate)}</span><span>Renovações realizadas: ${emprestimo.renewals?.length || 0}</span>`;
  const prazoSugerido = lerData(emprestimo.dueDate);
  prazoSugerido.setDate(prazoSugerido.getDate() + 7);
  $('#novaDataPrazo').min = dataLocal(new Date(lerData(emprestimo.dueDate).getTime() + 86400000));
  $('#novaDataPrazo').value = dataLocal(prazoSugerido);
  $('#janelaRenovacao').showModal();
}

async function cancelarReserva(reservaId) {
  const reserva = appState.reservas.find(item => item.id === reservaId);
  if (!reserva || reserva.status !== 'ativa') return;
  try {
    await requisitarApi(`/api/reservations/${reservaId}/cancel`, { method: 'POST' });
    await atualizarDepoisDaOperacao();
    mostrarAviso('Reserva cancelada. A fila foi atualizada.');
  } catch (erro) {
    tratarErroOperacao(erro);
  }
}

function emprestarReserva(reservaId) {
  const reserva = appState.reservas.find(item => item.id === reservaId);
  const fila = reserva ? reservasAtivasDoLivro(reserva.bookId) : [];
  const livro = reserva ? appState.livros.find(item => item.id === reserva.bookId) : null;
  if (!reserva || fila[0]?.id !== reserva.id || !livro || Number(livro.available) < 1) return mostrarAviso('Esta reserva ainda não está disponível para retirada.');
  abrirPagina('emprestimos');
  prepararEmprestimo(String(reserva.readerId));
  $('#livroEmprestimo').value = rotuloLivroSelecao(livro);
}

export function renderizarReservas() {
  const ativas = appState.reservas.filter(item => item.status === 'ativa').sort((a, b) => a.id - b.id);
  $('#reservasVazias').style.display = ativas.length ? 'none' : 'flex';
  $('#tabelaReservas').style.display = ativas.length ? 'table' : 'none';
  $('#tabelaReservas tbody').innerHTML = ativas.map(reserva => {
    const livro = appState.livros.find(item => item.id === reserva.bookId);
    const leitor = appState.leitores.find(item => item.id === reserva.readerId);
    const fila = reservasAtivasDoLivro(reserva.bookId);
    const posicao = fila.findIndex(item => item.id === reserva.id) + 1;
    const pronta = posicao === 1 && Number(livro?.available || 0) > 0;
    return `<tr><td><b>${posicao}º</b></td><td>${escaparHtml(tituloLivroParaExibicao(livro))}</td><td>${escaparHtml(nomeLeitorParaExibicao(leitor))}</td><td>${formatarData(reserva.date)}</td><td><span class="situacao ${pronta ? 'devolvido' : 'andamento'}">${pronta ? 'Disponível para retirada' : 'Aguardando'}</span></td><td><div class="acoes-emprestimo">${pronta ? `<button class="botao-pequeno emprestar-reserva" data-id="${reserva.id}">Emprestar</button>` : ''}<button class="botao-pequeno cancelar-reserva" data-id="${reserva.id}">Cancelar</button></div></td></tr>`;
  }).join('');
  $$('.cancelar-reserva').forEach(botao => botao.addEventListener('click', () => cancelarReserva(Number(botao.dataset.id))));
  $$('.emprestar-reserva').forEach(botao => botao.addEventListener('click', () => emprestarReserva(Number(botao.dataset.id))));
}

function listaPorFiltro() {
  return appState.emprestimos.filter(item => {
    if (filtroAtual === 'todos') return true;
    if (filtroAtual === 'ativos') return item.status === 'ativo';
    if (filtroAtual === 'atrasados') return item.status === 'atrasado';
    if (filtroAtual === 'perdidos') return item.status === 'perdido';
    return item.status === 'devolvido';
  });
}

export function renderizarEmprestimos() {
  const lista = listaPorFiltro();
  $('#emprestimosVazios').style.display = lista.length ? 'none' : 'flex';
  $('#tabelaEmprestimos').style.display = lista.length ? 'table' : 'none';
  $('#tabelaEmprestimos tbody').innerHTML = lista.map(item => {
    const leitor = appState.leitores.find(valor => valor.id === item.readerId);
    const livro = appState.livros.find(valor => valor.id === item.bookId);
    const situacao = situacaoEmprestimo(item);
    const possuiReservaAtiva = livroPossuiReservaAtiva(item.bookId);
    const podeRenovar = item.status === 'ativo' && !possuiReservaAtiva;
    const motivoBloqueioRenovacao = possuiReservaAtiva ? 'Livro com reserva ativa' : 'Empréstimo atrasado';
    const resultado = !emprestimoEstaAberto(item) ? (item.warning ? `Advertência: ${escaparHtml(item.returnCondition)}` : (item.penaltyUntil ? `Bloqueio até ${formatarData(item.penaltyUntil)}` : 'Concluído')) : `<div class="acoes-emprestimo"><button class="botao-pequeno renovar-emprestimo" data-id="${item.id}" ${podeRenovar ? '' : `disabled title="${motivoBloqueioRenovacao}"`}>Renovar</button><button class="botao-pequeno devolver-livro" data-id="${item.id}">Devolver</button></div>`;
    return `<tr><td>${escaparHtml(nomeLeitorParaExibicao(leitor))}</td><td>${escaparHtml(tituloLivroParaExibicao(livro))}</td><td>${formatarData(item.loanDate)}</td><td>${formatarData(item.dueDate)}</td><td>${formatarData(item.returnDate)}</td><td><span class="situacao ${situacao.classe}">${situacao.texto}</span></td><td>${resultado}</td></tr>`;
  }).join('');
  $$('.devolver-livro').forEach(botao => botao.addEventListener('click', () => abrirFormularioDevolucao(Number(botao.dataset.id))));
  $$('.renovar-emprestimo').forEach(botao => botao.addEventListener('click', () => abrirFormularioRenovacao(Number(botao.dataset.id))));
}

export function inicializarCirculacao() {
  $('#abrirReserva').addEventListener('click', () => abrirFormularioReserva());

  $('#livroReserva').addEventListener('input', evento => evento.target.setCustomValidity(''));
  $('#leitorReserva').addEventListener('input', evento => evento.target.setCustomValidity(''));

  $('#salvarReserva').addEventListener('click', async evento => {
    evento.preventDefault();
    const livrosReservaveis = appState.livros.filter(livroPodeSerReservado);
    const livro = validarCampoPesquisavel('livroReserva', livrosReservaveis, rotuloLivroSelecao, 'livro');
    const leitor = validarCampoPesquisavel('leitorReserva', appState.leitores, rotuloLeitorSelecao, 'leitor');
    if (!$('#formularioReserva').reportValidity()) return;
    const bookId = livro.id;
    const readerId = leitor.id;
    if (appState.reservas.some(item => item.bookId === bookId && item.readerId === readerId && item.status === 'ativa')) return mostrarAviso('Este leitor já está na fila desse livro.');
    const botao = $('#salvarReserva');
    botao.disabled = true;
    try {
      await requisitarApi('/api/reservations', {
        method: 'POST',
        body: JSON.stringify({ bookId, readerId })
      });
      await atualizarDepoisDaOperacao();
      $('#janelaReserva').close();
      mostrarAviso(`Reserva adicionada na posição ${reservasAtivasDoLivro(bookId).length} da fila.`);
    } catch (erro) {
      tratarErroOperacao(erro);
    } finally {
      botao.disabled = false;
    }
  });

  $$('.abrir-emprestimo').forEach(botao => botao.addEventListener('click', () => prepararEmprestimo()));

  $('#leitorEmprestimo').addEventListener('input', evento => {
    evento.target.setCustomValidity('');
    verificarLeitorSelecionado();
  });

  $('#livroEmprestimo').addEventListener('input', evento => evento.target.setCustomValidity(''));

  $('#salvarEmprestimo').addEventListener('click', async evento => {
    evento.preventDefault();
    const livrosDisponiveis = appState.livros.filter(livro => Number(livro.available) > 0);
    const leitor = validarCampoPesquisavel('leitorEmprestimo', appState.leitores, rotuloLeitorSelecao, 'leitor');
    const livro = validarCampoPesquisavel('livroEmprestimo', livrosDisponiveis, rotuloLivroSelecao, 'livro');
    if (!$('#formularioEmprestimo').reportValidity()) return;
    const leitorId = leitor.id;
    const livroId = livro.id;
    const bloqueio = obterBloqueio(leitorId);
    if (bloqueio.bloqueado) return mostrarAviso(bloqueio.mensagem);
    const fila = reservasAtivasDoLivro(livroId);
    if (fila.length && fila[0].readerId !== leitorId) {
      const primeiro = appState.leitores.find(item => item.id === fila[0].readerId);
      return mostrarAviso(`Este exemplar está reservado para ${primeiro ? nomeLeitorParaExibicao(primeiro) : 'o primeiro leitor da fila'}.`);
    }
    if (lerData($('#dataPrazo').value) < lerData($('#dataEmprestimo').value)) return mostrarAviso('O prazo deve ser posterior ao empréstimo.');
    if (livro.available < 1) return mostrarAviso('Este livro não está mais disponível.');
    const botao = $('#salvarEmprestimo');
    botao.disabled = true;
    try {
      await requisitarApi('/api/loans', {
        method: 'POST',
        body: JSON.stringify({
          readerId: leitorId,
          bookId: livroId,
          loanDate: $('#dataEmprestimo').value,
          dueDate: $('#dataPrazo').value
        })
      });
      await atualizarDepoisDaOperacao();
      $('#formularioEmprestimo').reset();
      $('#janelaEmprestimo').close();
      mostrarAviso('Empréstimo registrado com sucesso.');
    } catch (erro) {
      tratarErroOperacao(erro);
    } finally {
      botao.disabled = false;
    }
  });

  $('#estadoDevolucao').addEventListener('change', atualizarRegraAdvertencia);

  $('#confirmarDevolucao').addEventListener('click', async evento => {
    evento.preventDefault();
    atualizarRegraAdvertencia();
    if (!$('#formularioDevolucao').reportValidity()) return;
    const botao = $('#confirmarDevolucao');
    botao.disabled = true;
    try {
      await registrarDevolucao(emprestimoEmDevolucao, valorComOutro('estadoDevolucao'), $('#observacaoDevolucao').value.trim());
      $('#janelaDevolucao').close();
    } catch (erro) {
      tratarErroOperacao(erro);
    } finally {
      botao.disabled = false;
    }
  });

  $('#confirmarRenovacao').addEventListener('click', async evento => {
    evento.preventDefault();
    if (!$('#formularioRenovacao').reportValidity()) return;
    const emprestimo = appState.emprestimos.find(item => item.id === emprestimoEmRenovacao);
    if (!emprestimo || !emprestimoEstaAberto(emprestimo)) return mostrarAviso('Este empréstimo não está mais ativo.');
    if (emprestimo.status === 'atrasado') return mostrarAviso('Empréstimos atrasados não podem ser renovados.');
    if (livroPossuiReservaAtiva(emprestimo.bookId)) return mostrarAviso('Este livro possui uma reserva ativa e não pode ser renovado.');
    const novoPrazo = $('#novaDataPrazo').value;
    if (lerData(novoPrazo) <= lerData(emprestimo.dueDate)) return mostrarAviso('O novo prazo deve ser posterior ao prazo atual.');
    const botao = $('#confirmarRenovacao');
    botao.disabled = true;
    try {
      await requisitarApi(`/api/loans/${emprestimoEmRenovacao}/renew`, {
        method: 'POST',
        body: JSON.stringify({ newDueDate: novoPrazo })
      });
      await atualizarDepoisDaOperacao();
      $('#janelaRenovacao').close();
      emprestimoEmRenovacao = null;
      mostrarAviso(`Empréstimo renovado até ${formatarData(novoPrazo)}.`);
    } catch (erro) {
      tratarErroOperacao(erro);
    } finally {
      botao.disabled = false;
    }
  });

  $$('.filtro-emprestimo').forEach(botao => botao.addEventListener('click', () => {
    filtroAtual = botao.dataset.filtro;
    $$('.filtro-emprestimo').forEach(item => item.classList.toggle('ativo', item === botao));
    renderizarEmprestimos();
  }));
}
