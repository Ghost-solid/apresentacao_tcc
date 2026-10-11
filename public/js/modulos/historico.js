import { appState } from './estado.js';
import { $, escaparHtml } from './utilitarios.js';
import { tratarErroOperacao } from './interface.js';
import { requisitarApi } from './api.js';

let paginaAcoes = 1;
let requisicaoHistoricoAcoes = 0;
export async function carregarHistoricoAcoes(pagina = 1) {
  const requisicao = ++requisicaoHistoricoAcoes;
  const estado = $('#estadoHistoricoAcoes');
  const anterior = $('#anteriorHistoricoAcoes');
  const proxima = $('#proximaHistoricoAcoes');
  anterior.disabled = true;
  proxima.disabled = true;
  estado.textContent = 'Carregando...';
  $('#linhasHistoricoAcoes').innerHTML = '';
  $('#paginaHistoricoAcoes').textContent = '';
  const acoes = { cadastrar: 'Cadastro', editar: 'Edição', excluir: 'Exclusão', emprestar: 'Empréstimo', devolver: 'Devolução', renovar: 'Renovação', reservar: 'Reserva', cancelar: 'Cancelamento', importar: 'Importação', backup: 'Backup' };
  try {
    const dados = await requisitarApi(`/api/audit?page=${pagina}`);
    if (requisicao !== requisicaoHistoricoAcoes || appState.usuarioAtual?.perfil !== 'Diretor') return;
    paginaAcoes = dados.page;
    $('#linhasHistoricoAcoes').innerHTML = dados.entries.map(item => `<tr><td>${escaparHtml(new Date(item.createdAt).toLocaleString('pt-BR'))}</td><td>${escaparHtml(item.userName)} (${escaparHtml(item.username)})</td><td>${escaparHtml(acoes[item.action] || item.action)}</td><td>${escaparHtml(item.entity)} ${escaparHtml(item.entityId || '')}</td><td>${escaparHtml(item.description)}</td></tr>`).join('');
    estado.textContent = dados.total ? `${dados.total} ações registradas.` : 'Nenhuma ação registrada ainda.';
    $('#paginaHistoricoAcoes').textContent = `Página ${dados.page} de ${dados.pages}`;
    anterior.disabled = dados.page <= 1;
    proxima.disabled = dados.page >= dados.pages;
  } catch (erro) {
    if (requisicao !== requisicaoHistoricoAcoes) return;
    estado.textContent = erro.message;
    tratarErroOperacao(erro);
  }
}

export function limparHistoricoAcoes() {
  requisicaoHistoricoAcoes += 1;
  paginaAcoes = 1;
  $('#linhasHistoricoAcoes').innerHTML = '';
}

export function inicializarHistorico() {
  $('#atualizarHistoricoAcoes').addEventListener('click', () => carregarHistoricoAcoes(1));
  $('#anteriorHistoricoAcoes').addEventListener('click', () => carregarHistoricoAcoes(paginaAcoes - 1));
  $('#proximaHistoricoAcoes').addEventListener('click', () => carregarHistoricoAcoes(paginaAcoes + 1));
}
