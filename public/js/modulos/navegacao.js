import { appState } from './estado.js';
import { $, $$ } from './utilitarios.js';
import { carregarHistoricoAcoes } from './historico.js';
import { carregarContasPendentes } from './contas.js';

const nomesPaginas = { painel: 'Painel', leitores: 'Leitores', biblioteca: 'Estoque', emprestimos: 'Empréstimos', reservas: 'Reservas', relatorios: 'Relatórios', backup: 'Backup', historicoAcoes: 'Histórico de ações', contas: 'Contas pendentes' };
export function abrirPagina(pagina) {
  if (pagina === 'historicoAcoes' || pagina === 'contas') {
    if (appState.usuarioAtual?.perfil !== 'Diretor') return;
    if (pagina === 'historicoAcoes') carregarHistoricoAcoes(1);
    else carregarContasPendentes();
  }
  $$('.pagina').forEach(item => item.classList.remove('ativo'));
  $$('.item-navegacao').forEach(item => item.classList.toggle('ativo', item.dataset.pagina === pagina));
  $(`#${pagina}`).classList.add('ativo');
  $('#tituloPagina').textContent = nomesPaginas[pagina];
  $('#barra-lateral').classList.remove('aberto');
}

export function inicializarNavegacao() {
  $$('.item-navegacao').forEach(item => item.addEventListener('click', () => abrirPagina(item.dataset.pagina)));
  $$('[data-go]').forEach(item => item.addEventListener('click', () => abrirPagina(item.dataset.go)));
  $('#menuCelular').addEventListener('click', () => $('#barra-lateral').classList.toggle('aberto'));

  $('#textoHoje').textContent = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
}
