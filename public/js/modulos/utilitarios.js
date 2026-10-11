export const $ = seletor => document.querySelector(seletor);
export const $$ = seletor => document.querySelectorAll(seletor);

export function escaparHtml(texto) {
  const elemento = document.createElement('div');
  elemento.textContent = texto ?? '';
  return elemento.innerHTML;
}

export function formatarNomeProprio(valor) {
  const somenteLetras = String(valor ?? '')
    .replace(/[^\p{L}\s]/gu, '')
    .replace(/\s{2,}/g, ' ');

  return somenteLetras.replace(/\p{L}+/gu, palavra =>
    palavra.charAt(0).toLocaleUpperCase('pt-BR')
    + palavra.slice(1).toLocaleLowerCase('pt-BR'));
}

export function nomeLeitorParaExibicao(leitor) {
  return leitor ? (leitor.nome || 'Sem nome') : 'Leitor removido';
}

export function tituloLivroParaExibicao(livro) {
  return livro ? (livro.title || 'Sem título') : 'Livro removido';
}

export function normalizarPesquisa(valor) {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function correspondePesquisa(termo, ...valores) {
  const consulta = normalizarPesquisa(termo);
  if (!consulta) return true;
  const texto = valores.map(normalizarPesquisa).filter(Boolean).join(' ');
  const partesEncontradas = consulta.split(' ').every(parte => texto.includes(parte));
  if (partesEncontradas) return true;
  return texto.replace(/\s/g, '').includes(consulta.replace(/\s/g, ''));
}

export function dataLocal(data = new Date()) {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

export function lerData(valor) {
  return new Date(`${valor}T00:00:00`);
}

export function formatarData(valor) {
  return valor ? lerData(valor).toLocaleDateString('pt-BR') : '—';
}

export function normalizarCategoria(categoria) {
  return String(categoria ?? '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('pt-BR');
}
