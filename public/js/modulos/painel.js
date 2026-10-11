import { appState } from './estado.js';
import { $, escaparHtml, nomeLeitorParaExibicao, tituloLivroParaExibicao, lerData, formatarData } from './utilitarios.js';
import { mostrarAviso } from './interface.js';
import { obterBloqueio, situacaoEmprestimo } from './regras.js';

export function renderizarPainel() {
  const ativos = appState.emprestimos.filter(item => item.status === 'ativo');
  const atrasados = appState.emprestimos.filter(item => item.status === 'atrasado');
  const bloqueados = appState.leitores.filter(leitor => obterBloqueio(leitor.id).bloqueado);
  $('#totalTitulos').textContent = appState.livros.length;
  $('#totalEmprestimos').textContent = ativos.length;
  $('#totalAtrasados').textContent = atrasados.length;
  $('#totalLeitores').textContent = appState.leitores.length;
  $('#quantidadeNotificacoes').textContent = atrasados.length;
  const proximos = [...ativos].sort((a, b) => lerData(a.dueDate) - lerData(b.dueDate)).slice(0, 5);
  $('#proximasVazias').style.display = proximos.length ? 'none' : 'flex';
  $('#listaProximas').innerHTML = proximos.map(item => { const leitor = appState.leitores.find(v => v.id === item.readerId); const livro = appState.livros.find(v => v.id === item.bookId); const status = situacaoEmprestimo(item); return `<div class="linha-aluno"><div><h3>${escaparHtml(tituloLivroParaExibicao(livro))}</h3><p>${escaparHtml(nomeLeitorParaExibicao(leitor))} • prazo ${formatarData(item.dueDate)}</p></div><span class="situacao ${status.classe}">${status.texto}</span></div>`; }).join('');
  $('#bloqueadosVazios').style.display = bloqueados.length ? 'none' : 'flex';
  $('#listaBloqueados').innerHTML = bloqueados.map(leitor => `<div class="linha-aluno"><div><h3>${escaparHtml(nomeLeitorParaExibicao(leitor))}</h3><p>${escaparHtml(obterBloqueio(leitor.id).mensagem)}</p></div><span class="situacao atrasado">Bloqueado</span></div>`).join('');
}

export function renderizarRelatorio() {
  const ativos = appState.emprestimos.filter(item => item.status === 'ativo').length;
  const atrasados = appState.emprestimos.filter(item => item.status === 'atrasado').length;
  const bloqueados = appState.leitores.filter(leitor => obterBloqueio(leitor.id).bloqueado).length;
  const advertencias = appState.emprestimos.filter(item => item.warning).length;
  const perdidos = appState.livros.reduce((total, livro) => total + Number(livro.lostCopies || 0), 0);
  $('#resumoRelatorio').textContent = `${appState.livros.length} título(s), ${appState.leitores.length} leitor(es), ${ativos} empréstimo(s) ativo(s), ${atrasados} atrasado(s), ${bloqueados} leitor(es) bloqueado(s), ${advertencias} advertência(s) e ${perdidos} exemplar(es) perdido(s).`;
  $('#listaRelatorio').innerHTML = `<div class="linha-aluno"><div><h3>Movimentações registradas</h3><p>Total histórico de empréstimos</p></div><b>${appState.emprestimos.length}</b></div><div class="linha-aluno"><div><h3>Advertências por conservação</h3><p>Livros devolvidos fora do estado esperado</p></div><b>${advertencias}</b></div>`;
}

export function inicializarPainel() {
  $('#botaoNotificacao').addEventListener('click', () => {
    const atrasados = appState.emprestimos.filter(item => item.status === 'atrasado').length;
    mostrarAviso(atrasados ? `${atrasados} devolução(ões) atrasada(s).` : 'Nenhuma devolução atrasada.');
  });
  $('#imprimirRelatorio').addEventListener('click', () => window.print());
}
