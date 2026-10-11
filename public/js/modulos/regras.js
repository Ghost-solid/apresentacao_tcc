import { appState } from './estado.js';
import { $, normalizarPesquisa, correspondePesquisa, dataLocal, lerData, formatarData, normalizarCategoria } from './utilitarios.js';

function valoresPesquisaLivro(livro) {
  return {
    id: [livro.code],
    titulo: [livro.title || 'Sem título'],
    autor: [livro.author || 'Autor não informado'],
    editora: [livro.publisher || 'Editora não informada'],
    categoria: [livro.category || 'Categoria não informada'],
    isbn: [livro.isbn],
    ano: [livro.year],
    local: [livro.location || 'Local não informado'],
    total: [livro.quantity],
    disponiveis: [livro.available],
    perdidos: [livro.lostCopies],
    estado: [livro.condition || 'Estado não informado']
  };
}

export function livroCorrespondePesquisa(livro, termo, campo = 'todos') {
  const valoresPorCampo = valoresPesquisaLivro(livro);
  const valores = campo === 'todos'
    ? Object.values(valoresPorCampo).flat()
    : (valoresPorCampo[campo] || []);
  return correspondePesquisa(termo, ...valores);
}

export function leitorCorrespondePesquisa(leitor, termo) {
  if (!normalizarPesquisa(termo)) return true;
  const bloqueio = obterBloqueio(leitor.id);
  return correspondePesquisa(termo,
    leitor.nome || 'Sem nome',
    leitor.matricula,
    leitor.tipo || 'Tipo não informado',
    leitor.turma || 'Turma ou setor não informado',
    bloqueio.bloqueado ? 'Bloqueado' : 'Liberado',
    contarAdvertencias(leitor.id)
  );
}

export function reservasAtivasDoLivro(livroId) {
  return appState.reservas.filter(item => item.bookId === livroId && item.status === 'ativa').sort((a, b) => a.id - b.id);
}

export function livroPossuiReservaAtiva(livroId) {
  return reservasAtivasDoLivro(livroId).length > 0;
}

export function emprestimoEstaAberto(item) {
  return item.status === 'ativo' || item.status === 'atrasado';
}

export function livroPodeSerReservado(livro) {
  return Number(livro.available) === 0 && appState.emprestimos.some(item => item.bookId === livro.id && emprestimoEstaAberto(item));
}

export function obterBloqueio(leitorId) {
  const hoje = lerData(dataLocal());
  const vencidoAberto = appState.emprestimos.find(item => item.readerId === leitorId && item.status === 'atrasado');
  if (vencidoAberto) return { bloqueado: true, mensagem: `Devolução atrasada desde ${formatarData(vencidoAberto.dueDate)}.` };
  const multas = appState.emprestimos.filter(item => item.readerId === leitorId && item.penaltyUntil && lerData(item.penaltyUntil) >= hoje).sort((a, b) => lerData(b.penaltyUntil) - lerData(a.penaltyUntil));
  if (multas.length) return { bloqueado: true, mensagem: `Bloqueado para novos empréstimos até ${formatarData(multas[0].penaltyUntil)}.` };
  return { bloqueado: false, mensagem: 'Leitor liberado para empréstimos.' };
}

export function contarAdvertencias(leitorId) {
  return appState.emprestimos.filter(item => item.readerId === leitorId && item.warning).length;
}

export function contarAtrasos(leitorId) {
  return appState.emprestimos.filter(item => item.readerId === leitorId && (item.penaltyUntil || item.status === 'atrasado')).length;
}

export function situacaoEmprestimo(item) {
  const estados = {
    ativo: { texto: 'Em andamento', classe: 'andamento' },
    atrasado: { texto: 'Atrasado', classe: 'atrasado' },
    devolvido: { texto: 'Devolvido', classe: 'devolvido' },
    perdido: { texto: 'Perdido', classe: 'perdido' }
  };
  return estados[item.status] || { texto: item.status || 'Não informado', classe: 'andamento' };
}

export function obterCategoriasPadrao() {
  return new Set([...$('#categoriaLivro').options]
    .map(opcao => opcao.value)
    .filter(valor => valor && valor !== 'Outro')
    .map(normalizarCategoria));
}

export function categoriaCorrespondeAoFiltro(categoriaLivro, categoriaFiltro, categoriasPadrao = obterCategoriasPadrao()) {
  if (!categoriaFiltro) return true;
  const categoriaNormalizada = normalizarCategoria(categoriaLivro);
  if (categoriaFiltro !== 'Outro') return categoriaNormalizada === normalizarCategoria(categoriaFiltro);
  if (!categoriaNormalizada) return false;
  return !categoriasPadrao.has(categoriaNormalizada);
}
