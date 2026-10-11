// Entrada da aplicação: registra os eventos e coordena a atualização das telas.
import { eventos } from './modulos/estado.js';
import { inicializarDadosLocais } from './modulos/api.js';
import { inicializarInterface } from './modulos/interface.js';
import { inicializarNavegacao } from './modulos/navegacao.js';
import { inicializarAutenticacao, iniciarSessao, encerrarSessaoVisual } from './modulos/autenticacao.js';
import { inicializarLeitores, filtrarLeitores } from './modulos/leitores.js';
import { inicializarEstoque, filtrarBiblioteca } from './modulos/estoque.js';
import { inicializarCirculacao, renderizarEmprestimos, renderizarReservas } from './modulos/circulacao.js';
import { inicializarExclusao } from './modulos/exclusao.js';
import { inicializarBackup } from './modulos/backup.js';
import { inicializarHistorico } from './modulos/historico.js';
import { inicializarPainel, renderizarPainel, renderizarRelatorio } from './modulos/painel.js';

function renderizarTudo() {
  filtrarBiblioteca();
  filtrarLeitores();
  renderizarEmprestimos();
  renderizarReservas();
  renderizarPainel();
  renderizarRelatorio();
}

function iniciarAplicacao() {
  eventos.addEventListener('dados-atualizados', renderizarTudo);
  eventos.addEventListener('sessao-expirada', encerrarSessaoVisual);
  inicializarDadosLocais();
  inicializarInterface();
  inicializarNavegacao();
  inicializarAutenticacao();
  inicializarLeitores();
  inicializarEstoque();
  inicializarCirculacao();
  inicializarExclusao();
  inicializarBackup();
  inicializarHistorico();
  inicializarPainel();
  return iniciarSessao();
}

iniciarAplicacao();
