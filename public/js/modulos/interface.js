import { eventos } from './estado.js';
import { $, $$, nomeLeitorParaExibicao, tituloLivroParaExibicao, normalizarPesquisa, normalizarCategoria } from './utilitarios.js';

const chaveTema = 'ds_theme';

function aplicarTema(tema) {
  const temaValido = tema === 'dark' ? 'dark' : 'light';
  const modoEscuro = temaValido === 'dark';
  document.documentElement.dataset.theme = temaValido;
  $$('[data-theme-toggle]').forEach(botao => {
    botao.setAttribute('aria-pressed', String(modoEscuro));
    botao.setAttribute('aria-label', modoEscuro ? 'Ativar modo claro' : 'Ativar modo escuro');
    botao.querySelector('.icone-tema').textContent = modoEscuro ? '☀' : '☾';
    botao.querySelector('[data-theme-label]').textContent = modoEscuro ? 'Modo claro' : 'Modo escuro';
  });
}

function iniciarTema() {
  let temaSalvo = null;
  try {
    temaSalvo = localStorage.getItem(chaveTema);
  } catch {}
  const temaInicial = temaSalvo === 'dark' || temaSalvo === 'light'
    ? temaSalvo
    : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  aplicarTema(temaInicial);
  $$('[data-theme-toggle]').forEach(botao => botao.addEventListener('click', () => {
    const proximoTema = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    try {
      localStorage.setItem(chaveTema, proximoTema);
    } catch {}
    aplicarTema(proximoTema);
  }));
}

export function mostrarAviso(mensagem) {
  $('#aviso-flutuante').textContent = mensagem;
  $('#aviso-flutuante').classList.add('visivel');
  clearTimeout(window.temporizadorAviso);
  window.temporizadorAviso = setTimeout(() => $('#aviso-flutuante').classList.remove('visivel'), 2800);
}

export function tratarErroOperacao(erro, destino = null) {
  if (erro.status === 401 && !destino) {
    eventos.dispatchEvent(new Event('sessao-expirada'));
    mostrarAviso('Sua sessão expirou. Entre novamente.');
    return;
  }
  if (destino) destino.textContent = erro.message;
  else mostrarAviso(erro.message);
}

function atualizarCampoOutro(seletor) {
  const campo = $(`#${seletor.dataset.campoOutro}`);
  const mostrar = seletor.value === 'Outro';
  campo.classList.toggle('oculto', !mostrar);
  campo.required = mostrar && seletor.id === 'estadoDevolucao';
  if (!mostrar) campo.value = '';
}

export function valorComOutro(idSeletor) {
  const seletor = $(`#${idSeletor}`);
  if (seletor.value !== 'Outro') return seletor.value;
  return $(`#${seletor.dataset.campoOutro}`).value.trim();
}

export function limparCamposOutro(formulario) {
  formulario.querySelectorAll('[data-campo-outro]').forEach(seletor => atualizarCampoOutro(seletor));
}

export function rotuloLeitorSelecao(leitor) {
  const detalhes = [leitor.matricula, leitor.tipo, leitor.turma].filter(Boolean).join(' • ');
  return `${nomeLeitorParaExibicao(leitor)}${detalhes ? ` — ${detalhes}` : ''}`;
}

export function rotuloLivroSelecao(livro) {
  const autor = livro.author || 'Autor não informado';
  return `${tituloLivroParaExibicao(livro)} — ${autor} • ${livro.code}`;
}

export function preencherListaPesquisavel(idLista, lista, criarRotulo) {
  const opcoes = lista.map(item => {
    const opcao = document.createElement('option');
    opcao.value = criarRotulo(item);
    return opcao;
  });
  $(`#${idLista}`).replaceChildren(...opcoes);
}

export function itemDoCampoPesquisavel(idCampo, lista, criarRotulo) {
  const valor = normalizarPesquisa($(`#${idCampo}`).value);
  return valor ? lista.find(item => normalizarPesquisa(criarRotulo(item)) === valor) : null;
}

export function validarCampoPesquisavel(idCampo, lista, criarRotulo, tipo) {
  const campo = $(`#${idCampo}`);
  const item = itemDoCampoPesquisavel(idCampo, lista, criarRotulo);
  campo.setCustomValidity(campo.value.trim() && !item ? `Selecione um ${tipo} apresentado na lista.` : '');
  return item;
}

export function definirOpcaoOuOutro(idSeletor, valor) {
  const seletor = $(`#${idSeletor}`);
  const valorTexto = String(valor ?? '').trim();
  const normalizar = idSeletor === 'categoriaLivro' ? normalizarCategoria : normalizarPesquisa;
  const opcaoExistente = [...seletor.options].find(opcao => opcao.value !== 'Outro' && normalizar(opcao.value) === normalizar(valorTexto));
  seletor.value = opcaoExistente ? opcaoExistente.value : 'Outro';
  atualizarCampoOutro(seletor);
  if (!opcaoExistente) $(`#${seletor.dataset.campoOutro}`).value = valorTexto;
}

export function inicializarInterface() {
  iniciarTema();

  $$('[data-fechar-dialog]').forEach(botao => {
    botao.addEventListener('click', () => botao.closest('dialog')?.close());
  });

  $$('[data-campo-outro]').forEach(seletor => {
    seletor.addEventListener('change', () => atualizarCampoOutro(seletor));
  });
}
