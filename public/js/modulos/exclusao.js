import { appState } from './estado.js';
import { $, nomeLeitorParaExibicao, tituloLivroParaExibicao } from './utilitarios.js';
import { mostrarAviso, tratarErroOperacao } from './interface.js';
import { requisitarApi, atualizarDepoisDaOperacao } from './api.js';
import { emprestimoEstaAberto } from './regras.js';

let exclusaoPendente = null;

function impedimentoExclusao(tipo, id) {
  if (tipo === 'leitor') {
    if (appState.emprestimos.some(item => item.readerId === id && emprestimoEstaAberto(item))) return 'Este leitor possui um empréstimo ativo. Registre a devolução antes de ocultá-lo.';
    if (appState.reservas.some(item => item.readerId === id && item.status === 'ativa')) return 'Este leitor possui uma reserva ativa. Cancele ou atenda a reserva antes de ocultá-lo.';
    return '';
  }
  if (appState.emprestimos.some(item => item.bookId === id && emprestimoEstaAberto(item))) return 'Este livro possui um empréstimo ativo. Registre a devolução antes de ocultá-lo.';
  if (appState.reservas.some(item => item.bookId === id && item.status === 'ativa')) return 'Este livro possui uma reserva ativa. Cancele ou atenda a reserva antes de ocultá-lo.';
  return '';
}

export function abrirConfirmacaoExclusao(tipo, id) {
  const registro = tipo === 'leitor'
    ? appState.leitores.find(leitor => leitor.id === Number(id))
    : appState.livros.find(livro => livro.id === Number(id));
  if (!registro) return mostrarAviso(tipo === 'leitor' ? 'Leitor não encontrado.' : 'Livro não encontrado.');
  const impedimento = impedimentoExclusao(tipo, registro.id);
  if (impedimento) return mostrarAviso(impedimento);
  exclusaoPendente = { tipo, id: registro.id };
  $('#formularioExclusao').reset();
  $('#erroExclusao').textContent = '';
  const nome = tipo === 'leitor' ? nomeLeitorParaExibicao(registro) : tituloLivroParaExibicao(registro);
  const identificador = tipo === 'leitor' ? registro.matricula : registro.code;
  $('#tituloExclusao').textContent = tipo === 'leitor' ? 'Ocultar leitor' : 'Ocultar livro';
  $('#mensagemExclusao').textContent = `Você está prestes a ocultar ${tipo === 'leitor' ? 'o leitor' : 'o livro'} “${nome}” (${identificador}). O cadastro deixará de aparecer nas listas, mas seus dados essenciais e históricos permanecerão salvos.`;
  $('#janelaExclusao').showModal();
  $('#senhaExclusao').focus();
}

export function inicializarExclusao() {
  $('#formularioExclusao').addEventListener('submit', async evento => {
    evento.preventDefault();
    if (!$('#formularioExclusao').reportValidity() || !exclusaoPendente) return;
    const { tipo, id } = exclusaoPendente;
    const impedimento = impedimentoExclusao(tipo, id);
    if (impedimento) {
      $('#erroExclusao').textContent = impedimento;
      return;
    }
    const existe = tipo === 'leitor'
      ? appState.leitores.some(leitor => leitor.id === id)
      : appState.livros.some(livro => livro.id === id);
    if (!existe) {
      $('#erroExclusao').textContent = tipo === 'leitor' ? 'Este leitor já foi ocultado.' : 'Este livro já foi ocultado.';
      return;
    }
    const botao = $('#confirmarExclusao');
    botao.disabled = true;
    $('#erroExclusao').textContent = '';
    try {
      const recurso = tipo === 'leitor' ? 'readers' : 'books';
      await requisitarApi(`/api/${recurso}/${id}/delete`, {
        method: 'POST',
        body: JSON.stringify({ password: $('#senhaExclusao').value })
      });
      await atualizarDepoisDaOperacao();
      $('#janelaExclusao').close();
      mostrarAviso(tipo === 'leitor' ? 'Leitor ocultado; histórico preservado.' : 'Livro ocultado; histórico preservado.');
    } catch (erro) {
      tratarErroOperacao(erro, $('#erroExclusao'));
      if (erro.status === 401) $('#senhaExclusao').select();
    } finally {
      botao.disabled = false;
    }
  });

  $('#janelaExclusao').addEventListener('close', () => {
    exclusaoPendente = null;
    $('#formularioExclusao').reset();
    $('#erroExclusao').textContent = '';
  });
}
