import { appState, solicitarRenderizacao } from './estado.js';
import { $, $$, formatarNomeProprio } from './utilitarios.js';
import { mostrarAviso, tratarErroOperacao } from './interface.js';
import { requisitarApi, carregarDadosServidor } from './api.js';
import { limparHistoricoAcoes } from './historico.js';
import { abrirPagina } from './navegacao.js';
import { reiniciarLeitores } from './leitores.js';
import { reiniciarEstoque } from './estoque.js';

async function configurarAcessoDemonstracao() {
  try {
    const configuracao = await requisitarApi('/api/config');
    $('#acessoDemonstracao').classList.toggle('oculto', !configuracao.demoMode);
  } catch {
    // A mensagem principal de conexão é exibida por restaurarSessao ou pelo envio do formulário.
  }
}

function preencherUsuario(usuario) {
  appState.usuarioAtual = usuario;
  $('#nomeUsuario').textContent = usuario.nome;
  $('#perfilUsuario').textContent = usuario.perfil;
  $('#inicialUsuario').textContent = usuario.perfil.charAt(0);
  $$('.somente-diretor').forEach(item => item.classList.toggle('oculto', usuario.perfil !== 'Diretor'));
}

function exibirSistema(usuario) {
  preencherUsuario(usuario);
  $('#paginaLogin').classList.add('oculto');
  $('#sistema').classList.remove('oculto');
  solicitarRenderizacao();
}

export function encerrarSessaoVisual() {
  appState.usuarioAtual = null;
  limparHistoricoAcoes();
  abrirPagina('painel');
  reiniciarLeitores();
  reiniciarEstoque();
  appState.leitores = [];
  appState.livros = [];
  appState.emprestimos = [];
  appState.reservas = [];
  $('#sistema').classList.add('oculto');
  $('#paginaLogin').classList.remove('oculto');
  $('#formularioLogin').reset();
}

function validarSenhaCadastro() {
  const senha = $('#senhaCadastroConta');
  const confirmacao = $('#confirmacaoSenhaCadastroConta');
  const forte = senha.value.length >= 8 && /[a-z]/.test(senha.value) && /[A-Z]/.test(senha.value) && /\d/.test(senha.value);
  senha.setCustomValidity(forte || !senha.value ? '' : 'Use ao menos 8 caracteres, com letra maiúscula, minúscula e número.');
  confirmacao.setCustomValidity(confirmacao.value && confirmacao.value !== senha.value ? 'As senhas não coincidem.' : '');
}

async function restaurarSessao() {
  try {
    const resultado = await requisitarApi('/api/auth/session');
    await carregarDadosServidor({ migrarLocais: true });
    exibirSistema(resultado.user);
  } catch (erro) {
    if (erro.status !== 401) $('#erroLogin').textContent = erro.message;
  }
}

export function inicializarAutenticacao() {
  $('#mostrarSenha').addEventListener('click', () => {
    $('#senha').type = $('#senha').type === 'password' ? 'text' : 'password';
  });

  $('#formularioLogin').addEventListener('submit', async evento => {
    evento.preventDefault();
    const botao = $('#formularioLogin .botao-principal');
    const textoOriginal = botao.textContent;
    botao.disabled = true;
    botao.textContent = 'Conectando...';
    $('#erroLogin').textContent = '';
    try {
      const resultado = await requisitarApi('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          username: $('#usuario').value.trim(),
          password: $('#senha').value
        })
      });
      await carregarDadosServidor({ migrarLocais: true });
      exibirSistema(resultado.user);
    } catch (erro) {
      tratarErroOperacao(erro, $('#erroLogin'));
    } finally {
      botao.disabled = false;
      botao.textContent = textoOriginal;
    }
  });

  $('#abrirCadastroConta').addEventListener('click', () => {
    $('#formularioCadastroConta').reset();
    $('#erroCadastroConta').textContent = '';
    validarSenhaCadastro();
    $('#janelaCadastroConta').showModal();
    $('#nomeCadastroConta').focus();
  });

  $('#nomeCadastroConta').addEventListener('input', evento => {
    evento.target.value = formatarNomeProprio(evento.target.value);
  });
  $('#senhaCadastroConta').addEventListener('input', validarSenhaCadastro);
  $('#confirmacaoSenhaCadastroConta').addEventListener('input', validarSenhaCadastro);

  $('#formularioCadastroConta').addEventListener('submit', async evento => {
    evento.preventDefault();
    validarSenhaCadastro();
    if (!$('#formularioCadastroConta').reportValidity()) return;
    const botao = $('#salvarCadastroConta');
    const textoOriginal = botao.textContent;
    botao.disabled = true;
    botao.textContent = 'Criando conta...';
    $('#erroCadastroConta').textContent = '';
    try {
      const resultado = await requisitarApi('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          name: $('#nomeCadastroConta').value.trim(),
          email: $('#emailCadastroConta').value.trim(),
          password: $('#senhaCadastroConta').value
        })
      });
      await carregarDadosServidor({ migrarLocais: true });
      $('#janelaCadastroConta').close();
      exibirSistema(resultado.user);
      mostrarAviso('Conta criada com sucesso.');
    } catch (erro) {
      tratarErroOperacao(erro, $('#erroCadastroConta'));
    } finally {
      botao.disabled = false;
      botao.textContent = textoOriginal;
    }
  });

  $('#botaoSair').addEventListener('click', async () => {
    try {
      await requisitarApi('/api/auth/logout', { method: 'POST' });
    } catch (erro) {
      if (erro.status !== 401) mostrarAviso(erro.message);
    } finally {
      encerrarSessaoVisual();
    }
  });
}

export function iniciarSessao() {
  configurarAcessoDemonstracao();
  return restaurarSessao();
}
