import { appState, solicitarRenderizacao } from './estado.js';
import { $ } from './utilitarios.js';
import { mostrarAviso } from './interface.js';

function lerListaLocal(chave) {
  try {
    const valor = JSON.parse(localStorage.getItem(chave) || '[]');
    return Array.isArray(valor) ? valor : [];
  } catch {
    return [];
  }
}

export let dadosLocaisLegados;

export function inicializarDadosLocais() {
  const dadosAntigosLeitores = lerListaLocal('ds_students');
  dadosLocaisLegados = {
    readers: lerListaLocal('ds_readers').length
      ? lerListaLocal('ds_readers')
      : dadosAntigosLeitores.map(item => ({
        id: item.id, nome: item.name, matricula: item.registration || '', tipo: 'Aluno', turma: item.className || ''
      })),
    books: lerListaLocal('ds_library'),
    loans: lerListaLocal('ds_loans'),
    reservations: lerListaLocal('ds_reservations')
  };
}

export async function requisitarApi(caminho, opcoes = {}) {
  let resposta;
  try {
    resposta = await fetch(caminho, {
      credentials: 'same-origin',
      ...opcoes,
      headers: opcoes.body
        ? { 'Content-Type': 'application/json', ...(opcoes.headers || {}) }
        : opcoes.headers
    });
  } catch {
    const mensagem = location.protocol === 'file:'
      ? 'Inicie o projeto com “npm start” e abra o endereço exibido no terminal.'
      : 'Não foi possível acessar o servidor. Verifique sua conexão.';
    const erro = new Error(mensagem);
    erro.status = 0;
    throw erro;
  }
  const tipo = resposta.headers.get('content-type') || '';
  const dados = tipo.includes('application/json') ? await resposta.json() : null;
  if (!resposta.ok) {
    const mensagemServidorIncorreto = caminho.startsWith('/api/') && !tipo.includes('application/json')
      ? 'Este endereço não está executando a API. Use “npm.cmd run demo” e abra http://localhost:8000; o Go Live não realiza login.'
      : 'Não foi possível concluir a operação.';
    const erro = new Error(dados?.message || mensagemServidorIncorreto);
    erro.status = resposta.status;
    erro.code = dados?.code;
    throw erro;
  }
  return dados;
}

export function possuiDados(estado) {
  return ['readers', 'books', 'loans', 'reservations'].some(chave => estado[chave]?.length);
}

export async function carregarDadosServidor({ migrarLocais = false } = {}) {
  let estado = await requisitarApi('/api/state');
  const origemMigracao = appState.dadosImportacaoArquivo || dadosLocaisLegados;
  const migracaoLocalPendente = appState.dadosImportacaoArquivo || !localStorage.getItem('ds_postgres_migrated');
  if (migrarLocais && !possuiDados(estado) && possuiDados(origemMigracao) && migracaoLocalPendente) {
    const migracao = await requisitarApi('/api/migrate-local', {
      method: 'POST',
      body: JSON.stringify(origemMigracao)
    });
    estado = migracao.state;
    if (migracao.migrated) {
      localStorage.setItem('ds_postgres_migrated', new Date().toISOString());
      appState.dadosImportacaoArquivo = null;
      mostrarAviso('Dados salvos anteriormente foram migrados para o PostgreSQL.');
    }
  } else if (migrarLocais && appState.dadosImportacaoArquivo && possuiDados(estado)) {
    $('#estadoMigracaoLogin').textContent = 'O banco já possui registros; o backup não foi importado para evitar sobrescrever os dados existentes.';
  }
  appState.leitores = Array.isArray(estado.readers) ? estado.readers : [];
  appState.livros = Array.isArray(estado.books) ? estado.books : [];
  appState.emprestimos = Array.isArray(estado.loans) ? estado.loans : [];
  appState.reservas = Array.isArray(estado.reservations) ? estado.reservations : [];
  return estado;
}

export async function atualizarDepoisDaOperacao() {
  await carregarDadosServidor();
  solicitarRenderizacao();
}
