import { appState } from './estado.js';
import { $, escaparHtml } from './utilitarios.js';
import { requisitarApi } from './api.js';
import { mostrarAviso, tratarErroOperacao } from './interface.js';

let requisicaoContas = 0;

export function limparContasPendentes() {
  requisicaoContas += 1;
  $('#linhasContasPendentes').innerHTML = '';
  $('#estadoContasPendentes').textContent = '';
  $('#atualizarContasPendentes').disabled = false;
}

export async function carregarContasPendentes() {
  if (appState.usuarioAtual?.perfil !== 'Diretor') return;
  const requisicao = ++requisicaoContas;
  $('#atualizarContasPendentes').disabled = true;
  $('#linhasContasPendentes').innerHTML = '';
  $('#estadoContasPendentes').textContent = 'Carregando solicitações...';
  try {
    const dados = await requisitarApi('/api/users/pending');
    if (requisicao !== requisicaoContas || appState.usuarioAtual?.perfil !== 'Diretor') return;
    $('#linhasContasPendentes').innerHTML = dados.users.map(conta => `<tr>
      <td>${escaparHtml(conta.name)}</td><td>${escaparHtml(conta.email)}</td>
      <td>${escaparHtml(new Date(conta.createdAt).toLocaleString('pt-BR'))}</td>
      <td><button type="button" class="botao-pequeno" data-aprovar-conta="${conta.id}">Aprovar acesso</button></td>
    </tr>`).join('');
    $('#estadoContasPendentes').textContent = dados.users.length
      ? `${dados.users.length} conta(s) aguardando aprovação. Aprove somente pessoas autorizadas pela escola.`
      : 'Nenhuma conta aguardando aprovação.';
  } catch (erro) {
    if (requisicao !== requisicaoContas) return;
    $('#estadoContasPendentes').textContent = erro.message;
    tratarErroOperacao(erro);
  } finally {
    if (requisicao === requisicaoContas) $('#atualizarContasPendentes').disabled = false;
  }
}

export function inicializarContas() {
  $('#atualizarContasPendentes').addEventListener('click', carregarContasPendentes);
  $('#linhasContasPendentes').addEventListener('click', async evento => {
    const botao = evento.target.closest('[data-aprovar-conta]');
    if (!botao || botao.disabled || appState.usuarioAtual?.perfil !== 'Diretor') return;
    const usuarioId = appState.usuarioAtual.id;
    botao.disabled = true;
    try {
      const resultado = await requisitarApi(`/api/users/${botao.dataset.aprovarConta}/approve`, { method: 'POST' });
      if (appState.usuarioAtual?.id !== usuarioId) return;
      await carregarContasPendentes();
      mostrarAviso(resultado.message);
    } catch (erro) {
      if (appState.usuarioAtual?.id === usuarioId) tratarErroOperacao(erro);
    } finally {
      botao.disabled = false;
    }
  });
}
