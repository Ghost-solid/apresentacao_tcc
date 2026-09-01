function lerListaLocal(chave) {
  try {
    const valor = JSON.parse(localStorage.getItem(chave) || '[]');
    return Array.isArray(valor) ? valor : [];
  } catch {
    return [];
  }
}

const dadosAntigosLeitores = lerListaLocal('ds_students');
const dadosLocaisLegados = {
  readers: lerListaLocal('ds_readers').length
    ? lerListaLocal('ds_readers')
    : dadosAntigosLeitores.map(item => ({
      id: item.id, nome: item.name, matricula: item.registration || '', tipo: 'Aluno', turma: item.className || ''
    })),
  books: lerListaLocal('ds_library'),
  loans: lerListaLocal('ds_loans'),
  reservations: lerListaLocal('ds_reservations')
};

let usuarioAtual = null;
let leitores = [];
let livros = [];
let emprestimos = [];
let reservas = [];
let dadosImportacaoArquivo = null;
let filtroAtual = 'ativos';
let emprestimoEmDevolucao = null;
let leitorEmEdicao = null;
let livroEmEdicao = null;
let emprestimoEmRenovacao = null;
let exclusaoPendente = null;

const $ = seletor => document.querySelector(seletor);
const $$ = seletor => document.querySelectorAll(seletor);

$$('[data-fechar-dialog]').forEach(botao => {
  botao.addEventListener('click', () => botao.closest('dialog')?.close());
});

function mostrarAviso(mensagem) {
  $('#aviso-flutuante').textContent = mensagem;
  $('#aviso-flutuante').classList.add('visivel');
  clearTimeout(window.temporizadorAviso);
  window.temporizadorAviso = setTimeout(() => $('#aviso-flutuante').classList.remove('visivel'), 2800);
}

function escaparHtml(texto) {
  const elemento = document.createElement('div');
  elemento.textContent = texto ?? '';
  return elemento.innerHTML;
}

function formatarNomeProprio(valor) {
  const somenteLetras = String(valor ?? '')
    .replace(/[^\p{L}\s]/gu, '')
    .replace(/\s{2,}/g, ' ');

  return somenteLetras.replace(/\p{L}+/gu, palavra =>
    palavra.charAt(0).toLocaleUpperCase('pt-BR')
    + palavra.slice(1).toLocaleLowerCase('pt-BR'));
}

const campoNomeLeitor = $('#nomeLeitor');
campoNomeLeitor.addEventListener('input', () => {
  campoNomeLeitor.value = formatarNomeProprio(campoNomeLeitor.value);
});
campoNomeLeitor.addEventListener('blur', () => {
  campoNomeLeitor.value = formatarNomeProprio(campoNomeLeitor.value).trim();
});

function nomeLeitorParaExibicao(leitor) {
  return leitor ? (leitor.nome || 'Sem nome') : 'Leitor removido';
}

function tituloLivroParaExibicao(livro) {
  return livro ? (livro.title || 'Sem título') : 'Livro removido';
}

function normalizarPesquisa(valor) {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function correspondePesquisa(termo, ...valores) {
  const consulta = normalizarPesquisa(termo);
  if (!consulta) return true;
  const texto = valores.map(normalizarPesquisa).filter(Boolean).join(' ');
  const partesEncontradas = consulta.split(' ').every(parte => texto.includes(parte));
  if (partesEncontradas) return true;
  return texto.replace(/\s/g, '').includes(consulta.replace(/\s/g, ''));
}

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

function livroCorrespondePesquisa(livro, termo, campo = 'todos') {
  const valoresPorCampo = valoresPesquisaLivro(livro);
  const valores = campo === 'todos'
    ? Object.values(valoresPorCampo).flat()
    : (valoresPorCampo[campo] || []);
  return correspondePesquisa(termo, ...valores);
}

function leitorCorrespondePesquisa(leitor, termo) {
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

function dataLocal(data = new Date()) {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

function lerData(valor) {
  return new Date(`${valor}T00:00:00`);
}

function formatarData(valor) {
  return valor ? lerData(valor).toLocaleDateString('pt-BR') : '—';
}

async function requisitarApi(caminho, opcoes = {}) {
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

async function configurarAcessoDemonstracao() {
  try {
    const configuracao = await requisitarApi('/api/config');
    $('#acessoDemonstracao').classList.toggle('oculto', !configuracao.demoMode);
  } catch {
    // A mensagem principal de conexão é exibida por restaurarSessao ou pelo envio do formulário.
  }
}

function aplicarEstado(dados = {}) {
  leitores = Array.isArray(dados.readers) ? dados.readers : [];
  livros = Array.isArray(dados.books) ? dados.books : [];
  emprestimos = Array.isArray(dados.loans) ? dados.loans : [];
  reservas = Array.isArray(dados.reservations) ? dados.reservations : [];
}

function possuiDados(estado) {
  return ['readers', 'books', 'loans', 'reservations'].some(chave => estado[chave]?.length);
}

async function carregarDadosServidor({ migrarLocais = false } = {}) {
  let estado = await requisitarApi('/api/state');
  const origemMigracao = dadosImportacaoArquivo || dadosLocaisLegados;
  const migracaoLocalPendente = dadosImportacaoArquivo || !localStorage.getItem('ds_postgres_migrated');
  if (migrarLocais && !possuiDados(estado) && possuiDados(origemMigracao) && migracaoLocalPendente) {
    const migracao = await requisitarApi('/api/migrate-local', {
      method: 'POST',
      body: JSON.stringify(origemMigracao)
    });
    estado = migracao.state;
    if (migracao.migrated) {
      localStorage.setItem('ds_postgres_migrated', new Date().toISOString());
      dadosImportacaoArquivo = null;
      mostrarAviso('Dados salvos anteriormente foram migrados para o PostgreSQL.');
    }
  } else if (migrarLocais && dadosImportacaoArquivo && possuiDados(estado)) {
    $('#estadoMigracaoLogin').textContent = 'O banco já possui registros; o backup não foi importado para evitar sobrescrever os dados existentes.';
  }
  aplicarEstado(estado);
  return estado;
}

async function atualizarDepoisDaOperacao() {
  await carregarDadosServidor();
  renderizarTudo();
}

function tratarErroOperacao(erro, destino = null) {
  if (erro.status === 401 && !destino) {
    encerrarSessaoVisual();
    mostrarAviso('Sua sessão expirou. Entre novamente.');
    return;
  }
  if (destino) destino.textContent = erro.message;
  else mostrarAviso(erro.message);
}

function preencherUsuario(usuario) {
  usuarioAtual = usuario;
  $('#nomeUsuario').textContent = usuario.nome;
  $('#perfilUsuario').textContent = usuario.perfil;
  $('#inicialUsuario').textContent = usuario.perfil.charAt(0);
  $$('.somente-diretor').forEach(item => item.classList.toggle('oculto', usuario.perfil !== 'Diretor'));
}

function exibirSistema(usuario) {
  preencherUsuario(usuario);
  $('#paginaLogin').classList.add('oculto');
  $('#sistema').classList.remove('oculto');
  renderizarTudo();
}

function encerrarSessaoVisual() {
  usuarioAtual = null;
  leitores = [];
  livros = [];
  emprestimos = [];
  reservas = [];
  $('#sistema').classList.add('oculto');
  $('#paginaLogin').classList.remove('oculto');
  $('#formularioLogin').reset();
}

const botaoExportarDados = $('#exportarDadosLocais');
botaoExportarDados.classList.toggle('oculto', !possuiDados(dadosLocaisLegados));
botaoExportarDados.addEventListener('click', () => {
  const conteudo = JSON.stringify({ exportedAt: new Date().toISOString(), ...dadosLocaisLegados }, null, 2);
  const endereco = URL.createObjectURL(new Blob([conteudo], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = endereco;
  link.download = `ds-legacy-backup-${dataLocal()}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(endereco), 1_000);
  $('#estadoMigracaoLogin').textContent = 'Backup criado. Abra a nova aplicação, selecione esse arquivo e depois entre.';
});

$('#arquivoMigracao').addEventListener('change', async evento => {
  const arquivo = evento.target.files[0];
  if (!arquivo) return;
  try {
    const dados = JSON.parse(await arquivo.text());
    if (!dados || typeof dados !== 'object' || !['readers', 'books', 'loans', 'reservations'].every(chave => Array.isArray(dados[chave]))) {
      throw new Error('O arquivo não possui o formato de backup do DS Legacy.');
    }
    dadosImportacaoArquivo = dados;
    $('#estadoMigracaoLogin').textContent = `Backup “${arquivo.name}” selecionado. Entre para importá-lo no banco vazio.`;
  } catch (erro) {
    dadosImportacaoArquivo = null;
    evento.target.value = '';
    $('#estadoMigracaoLogin').textContent = erro.message || 'Não foi possível ler o arquivo selecionado.';
  }
});

// Mostra um campo de texto quando uma opção "Outro" é escolhida.
$$('[data-campo-outro]').forEach(seletor => {
  seletor.addEventListener('change', () => atualizarCampoOutro(seletor));
});

function atualizarCampoOutro(seletor) {
  const campo = $(`#${seletor.dataset.campoOutro}`);
  const mostrar = seletor.value === 'Outro';
  campo.classList.toggle('oculto', !mostrar);
  campo.required = mostrar && seletor.id === 'estadoDevolucao';
  if (!mostrar) campo.value = '';
}

function valorComOutro(idSeletor) {
  const seletor = $(`#${idSeletor}`);
  if (seletor.value !== 'Outro') return seletor.value;
  return $(`#${seletor.dataset.campoOutro}`).value.trim();
}

function limparCamposOutro(formulario) {
  formulario.querySelectorAll('[data-campo-outro]').forEach(seletor => atualizarCampoOutro(seletor));
}

function atualizarPreviaIdLeitor() {
  $('#matriculaLeitor').value = leitorEmEdicao?.matricula || '';
}

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

$('#botaoSair').addEventListener('click', async () => {
  try {
    await requisitarApi('/api/auth/logout', { method: 'POST' });
  } catch (erro) {
    if (erro.status !== 401) mostrarAviso(erro.message);
  } finally {
    encerrarSessaoVisual();
  }
});

const nomesPaginas = { painel: 'Painel', leitores: 'Leitores', biblioteca: 'Estoque', emprestimos: 'Empréstimos', reservas: 'Reservas', relatorios: 'Relatórios' };
function abrirPagina(pagina) {
  $$('.pagina').forEach(item => item.classList.remove('ativo'));
  $$('.item-navegacao').forEach(item => item.classList.toggle('ativo', item.dataset.pagina === pagina));
  $(`#${pagina}`).classList.add('ativo');
  $('#tituloPagina').textContent = nomesPaginas[pagina];
  $('#barra-lateral').classList.remove('aberto');
}

$$('.item-navegacao').forEach(item => item.addEventListener('click', () => abrirPagina(item.dataset.pagina)));
$$('[data-go]').forEach(item => item.addEventListener('click', () => abrirPagina(item.dataset.go)));
$('#menuCelular').addEventListener('click', () => $('#barra-lateral').classList.toggle('aberto'));

$('#abrirLeitor').addEventListener('click', () => abrirFormularioLeitor());
$('#abrirItemBiblioteca').addEventListener('click', () => abrirFormularioLivro());
$('#abrirReserva').addEventListener('click', () => abrirFormularioReserva());

function abrirFormularioLeitor(leitorId = null) {
  $('#formularioLeitor').reset();
  limparCamposOutro($('#formularioLeitor'));
  leitorEmEdicao = leitorId === null ? null : leitores.find(leitor => leitor.id === Number(leitorId));
  $('#tituloFormularioLeitor').textContent = leitorEmEdicao ? 'Editar leitor' : 'Cadastrar leitor';
  $('#explicacaoFormularioLeitor').textContent = leitorEmEdicao
    ? 'Corrija os dados ou atualize a turma/setor. O ID numérico original será mantido.'
    : 'Preencha somente os dados que desejar. O ID numérico é criado automaticamente e não será alterado.';
  $('#salvarLeitor').textContent = leitorEmEdicao ? 'Atualizar leitor' : 'Salvar leitor';
  if (leitorEmEdicao) {
    $('#matriculaLeitor').value = leitorEmEdicao.matricula;
    $('#nomeLeitor').value = formatarNomeProprio(leitorEmEdicao.nome || '');
    definirOpcaoOuOutro('tipoLeitor', leitorEmEdicao.tipo);
    definirOpcaoOuOutro('turmaLeitor', leitorEmEdicao.turma);
  }
  atualizarPreviaIdLeitor();
  $('#janelaLeitor').showModal();
}

function reservasAtivasDoLivro(livroId) {
  return reservas.filter(item => item.bookId === livroId && item.status === 'ativa').sort((a, b) => a.id - b.id);
}

function livroPossuiReservaAtiva(livroId) {
  return reservasAtivasDoLivro(livroId).length > 0;
}

function livroPodeSerReservado(livro) {
  return Number(livro.available) === 0 && emprestimos.some(item => item.bookId === livro.id && !item.returnDate);
}

function rotuloLeitorSelecao(leitor) {
  const detalhes = [leitor.matricula, leitor.tipo, leitor.turma].filter(Boolean).join(' • ');
  return `${nomeLeitorParaExibicao(leitor)}${detalhes ? ` — ${detalhes}` : ''}`;
}

function rotuloLivroSelecao(livro) {
  const autor = livro.author || 'Autor não informado';
  return `${tituloLivroParaExibicao(livro)} — ${autor} • ${livro.code}`;
}

function preencherListaPesquisavel(idLista, lista, criarRotulo) {
  const opcoes = lista.map(item => {
    const opcao = document.createElement('option');
    opcao.value = criarRotulo(item);
    return opcao;
  });
  $(`#${idLista}`).replaceChildren(...opcoes);
}

function itemDoCampoPesquisavel(idCampo, lista, criarRotulo) {
  const valor = normalizarPesquisa($(`#${idCampo}`).value);
  return valor ? lista.find(item => normalizarPesquisa(criarRotulo(item)) === valor) : null;
}

function validarCampoPesquisavel(idCampo, lista, criarRotulo, tipo) {
  const campo = $(`#${idCampo}`);
  const item = itemDoCampoPesquisavel(idCampo, lista, criarRotulo);
  campo.setCustomValidity(campo.value.trim() && !item ? `Selecione um ${tipo} apresentado na lista.` : '');
  return item;
}

function preencherLivrosReserva(lista) {
  preencherListaPesquisavel('opcoesLivrosReserva', lista, rotuloLivroSelecao);
}

function preencherLeitoresReserva(lista) {
  preencherListaPesquisavel('opcoesLeitoresReserva', lista, rotuloLeitorSelecao);
}

function abrirFormularioReserva(livroId = '') {
  const indisponiveis = livros.filter(livroPodeSerReservado);
  if (!indisponiveis.length) return mostrarAviso('Não há livros sem disponibilidade para reservar.');
  if (!leitores.length) return mostrarAviso('Cadastre um leitor primeiro.');
  $('#formularioReserva').reset();
  preencherLivrosReserva(indisponiveis);
  preencherLeitoresReserva(leitores);
  const livroSelecionado = indisponiveis.find(livro => livro.id === Number(livroId));
  $('#livroReserva').value = livroSelecionado ? rotuloLivroSelecao(livroSelecionado) : '';
  $('#janelaReserva').showModal();
}

$('#livroReserva').addEventListener('input', evento => evento.target.setCustomValidity(''));
$('#leitorReserva').addEventListener('input', evento => evento.target.setCustomValidity(''));

$('#salvarReserva').addEventListener('click', async evento => {
  evento.preventDefault();
  const livrosReservaveis = livros.filter(livroPodeSerReservado);
  const livro = validarCampoPesquisavel('livroReserva', livrosReservaveis, rotuloLivroSelecao, 'livro');
  const leitor = validarCampoPesquisavel('leitorReserva', leitores, rotuloLeitorSelecao, 'leitor');
  if (!$('#formularioReserva').reportValidity()) return;
  const bookId = livro.id;
  const readerId = leitor.id;
  if (reservas.some(item => item.bookId === bookId && item.readerId === readerId && item.status === 'ativa')) return mostrarAviso('Este leitor já está na fila desse livro.');
  const botao = $('#salvarReserva');
  botao.disabled = true;
  try {
    await requisitarApi('/api/reservations', {
      method: 'POST',
      body: JSON.stringify({ bookId, readerId })
    });
    await atualizarDepoisDaOperacao();
    $('#janelaReserva').close();
    mostrarAviso(`Reserva adicionada na posição ${reservasAtivasDoLivro(bookId).length} da fila.`);
  } catch (erro) {
    tratarErroOperacao(erro);
  } finally {
    botao.disabled = false;
  }
});

function definirOpcaoOuOutro(idSeletor, valor) {
  const seletor = $(`#${idSeletor}`);
  const valorTexto = String(valor ?? '').trim();
  const normalizar = idSeletor === 'categoriaLivro' ? normalizarCategoria : normalizarPesquisa;
  const opcaoExistente = [...seletor.options].find(opcao => opcao.value !== 'Outro' && normalizar(opcao.value) === normalizar(valorTexto));
  seletor.value = opcaoExistente ? opcaoExistente.value : 'Outro';
  atualizarCampoOutro(seletor);
  if (!opcaoExistente) $(`#${seletor.dataset.campoOutro}`).value = valorTexto;
}

function abrirFormularioLivro(livroId = null) {
  $('#formularioBiblioteca').reset();
  limparCamposOutro($('#formularioBiblioteca'));
  livroEmEdicao = livroId ? livros.find(livro => livro.id === Number(livroId)) : null;
  $('#tituloFormularioLivro').textContent = livroEmEdicao ? 'Editar livro' : 'Cadastrar livro';
  $('#salvarItemBiblioteca').textContent = livroEmEdicao ? 'Atualizar livro' : 'Salvar livro';
  $('#ajudaEstoque').classList.toggle('oculto', !livroEmEdicao);
  if (livroEmEdicao) {
    $('#codigoLivro').value = livroEmEdicao.code;
    $('#isbnLivro').value = livroEmEdicao.isbn || '';
    $('#tituloLivro').value = livroEmEdicao.title;
    $('#autorLivro').value = livroEmEdicao.author;
    $('#editoraLivro').value = livroEmEdicao.publisher || '';
    $('#anoLivro').value = livroEmEdicao.year || '';
    $('#localLivro').value = livroEmEdicao.location || '';
    $('#quantidadeLivro').value = livroEmEdicao.quantity;
    definirOpcaoOuOutro('categoriaLivro', livroEmEdicao.category);
    definirOpcaoOuOutro('estadoLivro', livroEmEdicao.condition);
    const indisponiveis = Number(livroEmEdicao.quantity) - Number(livroEmEdicao.available);
    $('#quantidadeLivro').min = Math.max(1, indisponiveis);
    $('#ajudaEstoque').textContent = `${indisponiveis} exemplar(es) estão emprestados ou perdidos. A quantidade total não pode ser menor que esse número.`;
  } else {
    $('#codigoLivro').value = '';
    $('#quantidadeLivro').min = 1;
    $('#quantidadeLivro').value = 1;
  }
  $('#janelaBiblioteca').showModal();
}

$('#salvarLeitor').addEventListener('click', async evento => {
  evento.preventDefault();
  if (!$('#formularioLeitor').reportValidity()) return;
  const editando = Boolean(leitorEmEdicao);
  const tipo = valorComOutro('tipoLeitor');
  const dadosLeitor = {
    nome: formatarNomeProprio($('#nomeLeitor').value).trim(),
    tipo,
    turma: valorComOutro('turmaLeitor')
  };
  const botao = $('#salvarLeitor');
  botao.disabled = true;
  try {
    const resultado = await requisitarApi(editando ? `/api/readers/${leitorEmEdicao.id}` : '/api/readers', {
      method: editando ? 'PUT' : 'POST',
      body: JSON.stringify(dadosLeitor)
    });
    await atualizarDepoisDaOperacao();
    $('#formularioLeitor').reset();
    limparCamposOutro($('#formularioLeitor'));
    $('#janelaLeitor').close();
    mostrarAviso(editando ? 'Informações do leitor atualizadas.' : `Leitor cadastrado com o ID ${resultado.reader.matricula}.`);
    leitorEmEdicao = null;
  } catch (erro) {
    tratarErroOperacao(erro);
  } finally {
    botao.disabled = false;
  }
});

$('#salvarItemBiblioteca').addEventListener('click', async evento => {
  evento.preventDefault();
  if (!$('#formularioBiblioteca').reportValidity()) return;
  const isbn = $('#isbnLivro').value.trim();
  if (isbn && livros.some(livro => livro.id !== livroEmEdicao?.id && livro.isbn === isbn)) return mostrarAviso('Já existe um livro com esse ISBN.');
  const quantidadeInformada = Number($('#quantidadeLivro').value);
  const quantidadePadrao = livroEmEdicao ? Math.max(1, Number(livroEmEdicao.quantity) || 1) : 1;
  const quantidade = $('#quantidadeLivro').value && Number.isInteger(quantidadeInformada) ? quantidadeInformada : quantidadePadrao;
  const dadosLivro = {
    isbn, title: $('#tituloLivro').value.trim(), author: $('#autorLivro').value.trim(),
    publisher: $('#editoraLivro').value.trim(), year: $('#anoLivro').value, category: valorComOutro('categoriaLivro'),
    location: $('#localLivro').value.trim(), quantity: quantidade, condition: valorComOutro('estadoLivro')
  };
  const editando = Boolean(livroEmEdicao);
  if (editando) {
    const indisponiveis = Number(livroEmEdicao.quantity) - Number(livroEmEdicao.available);
    if (quantidade < indisponiveis) return mostrarAviso(`A quantidade não pode ser menor que ${indisponiveis}.`);
  }
  const botao = $('#salvarItemBiblioteca');
  botao.disabled = true;
  try {
    const resultado = await requisitarApi(editando ? `/api/books/${livroEmEdicao.id}` : '/api/books', {
      method: editando ? 'PUT' : 'POST',
      body: JSON.stringify(dadosLivro)
    });
    await atualizarDepoisDaOperacao();
    $('#formularioBiblioteca').reset();
    limparCamposOutro($('#formularioBiblioteca'));
    $('#quantidadeLivro').value = 1;
    $('#janelaBiblioteca').close();
    mostrarAviso(editando ? 'Livro e estoque atualizados.' : `Livro cadastrado com o ID ${resultado.book.code}.`);
    livroEmEdicao = null;
  } catch (erro) {
    tratarErroOperacao(erro);
  } finally {
    botao.disabled = false;
  }
});

function impedimentoExclusao(tipo, id) {
  if (tipo === 'leitor') {
    if (emprestimos.some(item => item.readerId === id && !item.returnDate)) return 'Este leitor possui um empréstimo ativo. Registre a devolução antes de ocultá-lo.';
    if (reservas.some(item => item.readerId === id && item.status === 'ativa')) return 'Este leitor possui uma reserva ativa. Cancele ou atenda a reserva antes de ocultá-lo.';
    return '';
  }
  if (emprestimos.some(item => item.bookId === id && !item.returnDate)) return 'Este livro possui um empréstimo ativo. Registre a devolução antes de ocultá-lo.';
  if (reservas.some(item => item.bookId === id && item.status === 'ativa')) return 'Este livro possui uma reserva ativa. Cancele ou atenda a reserva antes de ocultá-lo.';
  return '';
}

function abrirConfirmacaoExclusao(tipo, id) {
  const registro = tipo === 'leitor'
    ? leitores.find(leitor => leitor.id === Number(id))
    : livros.find(livro => livro.id === Number(id));
  if (!registro) return mostrarAviso(tipo === 'leitor' ? 'Leitor não encontrado.' : 'Livro não encontrado.');
  const impedimento = impedimentoExclusao(tipo, registro.id);
  if (impedimento) return mostrarAviso(impedimento);
  exclusaoPendente = { tipo, id: registro.id };
  $('#formularioExclusao').reset();
  $('#erroExclusao').textContent = '';
  const nome = tipo === 'leitor' ? nomeLeitorParaExibicao(registro) : tituloLivroParaExibicao(registro);
  const identificador = tipo === 'leitor' ? registro.matricula : registro.code;
  $('#tituloExclusao').textContent = tipo === 'leitor' ? 'Ocultar leitor' : 'Ocultar livro';
  $('#mensagemExclusao').textContent = `Você está prestes a ocultar ${tipo === 'leitor' ? 'o leitor' : 'o livro'} “${nome}” (${identificador}). O cadastro deixará de aparecer nas listas, mas seus dados essenciais e históricos permanecerão salvos.`;
  $('#janelaExclusao').showModal();
  $('#senhaExclusao').focus();
}

$('#formularioExclusao').addEventListener('submit', async evento => {
  evento.preventDefault();
  if (!$('#formularioExclusao').reportValidity() || !exclusaoPendente) return;
  const { tipo, id } = exclusaoPendente;
  const impedimento = impedimentoExclusao(tipo, id);
  if (impedimento) {
    $('#erroExclusao').textContent = impedimento;
    return;
  }
  const existe = tipo === 'leitor'
    ? leitores.some(leitor => leitor.id === id)
    : livros.some(livro => livro.id === id);
  if (!existe) {
    $('#erroExclusao').textContent = tipo === 'leitor' ? 'Este leitor já foi ocultado.' : 'Este livro já foi ocultado.';
    return;
  }
  const botao = $('#confirmarExclusao');
  botao.disabled = true;
  $('#erroExclusao').textContent = '';
  try {
    const recurso = tipo === 'leitor' ? 'readers' : 'books';
    await requisitarApi(`/api/${recurso}/${id}/delete`, {
      method: 'POST',
      body: JSON.stringify({ password: $('#senhaExclusao').value })
    });
    await atualizarDepoisDaOperacao();
    $('#janelaExclusao').close();
    mostrarAviso(tipo === 'leitor' ? 'Leitor ocultado; histórico preservado.' : 'Livro ocultado; histórico preservado.');
  } catch (erro) {
    tratarErroOperacao(erro, $('#erroExclusao'));
    if (erro.status === 401) $('#senhaExclusao').select();
  } finally {
    botao.disabled = false;
  }
});

$('#janelaExclusao').addEventListener('close', () => {
  exclusaoPendente = null;
  $('#formularioExclusao').reset();
  $('#erroExclusao').textContent = '';
});

function obterBloqueio(leitorId) {
  const hoje = lerData(dataLocal());
  const vencidoAberto = emprestimos.find(item => item.readerId === leitorId && !item.returnDate && lerData(item.dueDate) < hoje);
  if (vencidoAberto) return { bloqueado: true, mensagem: `Devolução atrasada desde ${formatarData(vencidoAberto.dueDate)}.` };
  const multas = emprestimos.filter(item => item.readerId === leitorId && item.penaltyUntil && lerData(item.penaltyUntil) >= hoje).sort((a, b) => lerData(b.penaltyUntil) - lerData(a.penaltyUntil));
  if (multas.length) return { bloqueado: true, mensagem: `Bloqueado para novos empréstimos até ${formatarData(multas[0].penaltyUntil)}.` };
  return { bloqueado: false, mensagem: 'Leitor liberado para empréstimos.' };
}

function prepararEmprestimo(leitorSelecionado = '') {
  const disponiveis = livros.filter(livro => Number(livro.available) > 0);
  if (!leitores.length) return mostrarAviso('Cadastre um leitor primeiro.');
  if (!disponiveis.length) return mostrarAviso('Não há livros disponíveis para empréstimo.');
  preencherOpcoesLeitores(leitores, leitorSelecionado);
  preencherOpcoesLivros(disponiveis);
  const hoje = new Date();
  const prazo = new Date();
  prazo.setDate(prazo.getDate() + 7);
  $('#dataEmprestimo').value = dataLocal(hoje);
  $('#dataPrazo').value = dataLocal(prazo);
  verificarLeitorSelecionado();
  $('#janelaEmprestimo').showModal();
}

function preencherOpcoesLeitores(lista, leitorSelecionado = '') {
  preencherListaPesquisavel('opcoesLeitoresEmprestimo', lista, rotuloLeitorSelecao);
  const leitor = lista.find(item => item.id === Number(leitorSelecionado));
  $('#leitorEmprestimo').value = leitor ? rotuloLeitorSelecao(leitor) : '';
  $('#leitorEmprestimo').setCustomValidity('');
}

function preencherOpcoesLivros(lista, livroSelecionado = '') {
  preencherListaPesquisavel('opcoesLivrosEmprestimo', lista, rotuloLivroSelecao);
  const livro = lista.find(item => item.id === Number(livroSelecionado));
  $('#livroEmprestimo').value = livro ? rotuloLivroSelecao(livro) : '';
  $('#livroEmprestimo').setCustomValidity('');
}

$$('.abrir-emprestimo').forEach(botao => botao.addEventListener('click', () => prepararEmprestimo()));

function verificarLeitorSelecionado() {
  const leitor = itemDoCampoPesquisavel('leitorEmprestimo', leitores, rotuloLeitorSelecao);
  const leitorId = leitor?.id;
  const aviso = $('#avisoBloqueio');
  if (!leitorId) {
    aviso.classList.add('oculto');
    $('#salvarEmprestimo').disabled = false;
    return;
  }
  const bloqueio = obterBloqueio(leitorId);
  aviso.textContent = bloqueio.mensagem;
  aviso.classList.remove('oculto');
  aviso.classList.toggle('liberado', !bloqueio.bloqueado);
  $('#salvarEmprestimo').disabled = bloqueio.bloqueado;
}

$('#leitorEmprestimo').addEventListener('input', evento => {
  evento.target.setCustomValidity('');
  verificarLeitorSelecionado();
});

$('#livroEmprestimo').addEventListener('input', evento => evento.target.setCustomValidity(''));

$('#salvarEmprestimo').addEventListener('click', async evento => {
  evento.preventDefault();
  const livrosDisponiveis = livros.filter(livro => Number(livro.available) > 0);
  const leitor = validarCampoPesquisavel('leitorEmprestimo', leitores, rotuloLeitorSelecao, 'leitor');
  const livro = validarCampoPesquisavel('livroEmprestimo', livrosDisponiveis, rotuloLivroSelecao, 'livro');
  if (!$('#formularioEmprestimo').reportValidity()) return;
  const leitorId = leitor.id;
  const livroId = livro.id;
  const bloqueio = obterBloqueio(leitorId);
  if (bloqueio.bloqueado) return mostrarAviso(bloqueio.mensagem);
  const fila = reservasAtivasDoLivro(livroId);
  if (fila.length && fila[0].readerId !== leitorId) {
    const primeiro = leitores.find(item => item.id === fila[0].readerId);
    return mostrarAviso(`Este exemplar está reservado para ${primeiro ? nomeLeitorParaExibicao(primeiro) : 'o primeiro leitor da fila'}.`);
  }
  if (lerData($('#dataPrazo').value) < lerData($('#dataEmprestimo').value)) return mostrarAviso('O prazo deve ser posterior ao empréstimo.');
  if (livro.available < 1) return mostrarAviso('Este livro não está mais disponível.');
  const botao = $('#salvarEmprestimo');
  botao.disabled = true;
  try {
    await requisitarApi('/api/loans', {
      method: 'POST',
      body: JSON.stringify({
        readerId,
        bookId,
        loanDate: $('#dataEmprestimo').value,
        dueDate: $('#dataPrazo').value
      })
    });
    await atualizarDepoisDaOperacao();
    $('#formularioEmprestimo').reset();
    $('#janelaEmprestimo').close();
    mostrarAviso('Empréstimo registrado com sucesso.');
  } catch (erro) {
    tratarErroOperacao(erro);
  } finally {
    botao.disabled = false;
  }
});

function abrirFormularioDevolucao(emprestimoId) {
  const emprestimo = emprestimos.find(item => item.id === emprestimoId);
  if (!emprestimo || emprestimo.returnDate) return;
  const leitor = leitores.find(item => item.id === emprestimo.readerId);
  const livro = livros.find(item => item.id === emprestimo.bookId);
  emprestimoEmDevolucao = emprestimoId;
  $('#formularioDevolucao').reset();
  limparCamposOutro($('#formularioDevolucao'));
  atualizarRegraAdvertencia();
  $('#resumoDevolucao').innerHTML = `<b>${escaparHtml(tituloLivroParaExibicao(livro))}</b><span>Emprestado para ${escaparHtml(nomeLeitorParaExibicao(leitor))}</span><span>Prazo: ${formatarData(emprestimo.dueDate)}</span>`;
  $('#janelaDevolucao').showModal();
}

function atualizarRegraAdvertencia() {
  const geraAdvertencia = $('#estadoDevolucao').value !== 'Bom';
  $('#observacaoDevolucao').required = geraAdvertencia;
  $('#observacaoDevolucao').placeholder = geraAdvertencia ? 'Descreva obrigatoriamente o problema encontrado' : 'Observação opcional para devolução em bom estado';
}

$('#estadoDevolucao').addEventListener('change', atualizarRegraAdvertencia);

$('#confirmarDevolucao').addEventListener('click', async evento => {
  evento.preventDefault();
  atualizarRegraAdvertencia();
  if (!$('#formularioDevolucao').reportValidity()) return;
  const botao = $('#confirmarDevolucao');
  botao.disabled = true;
  try {
    await registrarDevolucao(emprestimoEmDevolucao, valorComOutro('estadoDevolucao'), $('#observacaoDevolucao').value.trim());
    $('#janelaDevolucao').close();
  } catch (erro) {
    tratarErroOperacao(erro);
  } finally {
    botao.disabled = false;
  }
});

async function registrarDevolucao(emprestimoId, estado, observacao) {
  const emprestimo = emprestimos.find(item => item.id === emprestimoId);
  if (!emprestimo || emprestimo.returnDate) return;
  const resultado = await requisitarApi(`/api/loans/${emprestimoId}/return`, {
    method: 'POST',
    body: JSON.stringify({ condition: estado, note: observacao })
  });
  await atualizarDepoisDaOperacao();
  const devolucao = resultado.loan;
  const atrasado = Boolean(devolucao.penaltyUntil);
  if (devolucao.bookLost && atrasado) return mostrarAviso(`Livro perdido e indisponível. Leitor advertido e bloqueado até ${formatarData(devolucao.penaltyUntil)}.`);
  if (devolucao.bookLost) return mostrarAviso('Livro registrado como perdido e indisponível. Advertência adicionada ao leitor.');
  if (devolucao.warning && atrasado) return mostrarAviso(`Advertência registrada e leitor bloqueado até ${formatarData(devolucao.penaltyUntil)}.`);
  if (devolucao.warning) return mostrarAviso('Devolução concluída e advertência registrada para o leitor.');
  mostrarAviso(atrasado ? `Devolução atrasada: leitor bloqueado até ${formatarData(devolucao.penaltyUntil)}.` : 'Devolução registrada em bom estado.');
}

function contarAdvertencias(leitorId) {
  return emprestimos.filter(item => item.readerId === leitorId && item.warning).length;
}

function contarAtrasos(leitorId) {
  return emprestimos.filter(item => item.readerId === leitorId && (item.penaltyUntil || (!item.returnDate && lerData(item.dueDate) < lerData(dataLocal())))).length;
}

function situacaoEmprestimo(item) {
  if (item.returnDate) return { texto: 'Devolvido', classe: 'devolvido' };
  if (lerData(item.dueDate) < lerData(dataLocal())) return { texto: 'Atrasado', classe: 'atrasado' };
  return { texto: 'Em andamento', classe: 'andamento' };
}

function abrirFormularioRenovacao(emprestimoId) {
  const emprestimo = emprestimos.find(item => item.id === emprestimoId);
  if (!emprestimo || emprestimo.returnDate) return;
  if (situacaoEmprestimo(emprestimo).classe === 'atrasado') return mostrarAviso('Empréstimos atrasados não podem ser renovados.');
  if (livroPossuiReservaAtiva(emprestimo.bookId)) return mostrarAviso('Este livro possui uma reserva ativa e não pode ser renovado.');
  const bloqueio = obterBloqueio(emprestimo.readerId);
  if (bloqueio.bloqueado) return mostrarAviso(bloqueio.mensagem);
  const leitor = leitores.find(item => item.id === emprestimo.readerId);
  const livro = livros.find(item => item.id === emprestimo.bookId);
  emprestimoEmRenovacao = emprestimoId;
  $('#resumoRenovacao').innerHTML = `<b>${escaparHtml(tituloLivroParaExibicao(livro))}</b><span>Leitor: ${escaparHtml(nomeLeitorParaExibicao(leitor))}</span><span>Prazo atual: ${formatarData(emprestimo.dueDate)}</span><span>Renovações realizadas: ${emprestimo.renewals?.length || 0}</span>`;
  const prazoSugerido = lerData(emprestimo.dueDate);
  prazoSugerido.setDate(prazoSugerido.getDate() + 7);
  $('#novaDataPrazo').min = dataLocal(new Date(lerData(emprestimo.dueDate).getTime() + 86400000));
  $('#novaDataPrazo').value = dataLocal(prazoSugerido);
  $('#janelaRenovacao').showModal();
}

$('#confirmarRenovacao').addEventListener('click', async evento => {
  evento.preventDefault();
  if (!$('#formularioRenovacao').reportValidity()) return;
  const emprestimo = emprestimos.find(item => item.id === emprestimoEmRenovacao);
  if (!emprestimo || emprestimo.returnDate) return mostrarAviso('Este empréstimo não está mais ativo.');
  if (situacaoEmprestimo(emprestimo).classe === 'atrasado') return mostrarAviso('Empréstimos atrasados não podem ser renovados.');
  if (livroPossuiReservaAtiva(emprestimo.bookId)) return mostrarAviso('Este livro possui uma reserva ativa e não pode ser renovado.');
  const novoPrazo = $('#novaDataPrazo').value;
  if (lerData(novoPrazo) <= lerData(emprestimo.dueDate)) return mostrarAviso('O novo prazo deve ser posterior ao prazo atual.');
  const botao = $('#confirmarRenovacao');
  botao.disabled = true;
  try {
    await requisitarApi(`/api/loans/${emprestimoEmRenovacao}/renew`, {
      method: 'POST',
      body: JSON.stringify({ newDueDate: novoPrazo })
    });
    await atualizarDepoisDaOperacao();
    $('#janelaRenovacao').close();
    emprestimoEmRenovacao = null;
    mostrarAviso(`Empréstimo renovado até ${formatarData(novoPrazo)}.`);
  } catch (erro) {
    tratarErroOperacao(erro);
  } finally {
    botao.disabled = false;
  }
});

function renderizarBiblioteca(lista = livros) {
  $('#titulosBiblioteca').textContent = livros.length;
  $('#exemplaresBiblioteca').textContent = livros.reduce((total, livro) => total + Number(livro.quantity || 0), 0);
  $('#bibliotecaDisponiveis').textContent = livros.reduce((total, livro) => total + Number(livro.available || 0), 0);
  $('#estoqueBaixoBiblioteca').textContent = livros.filter(livro => Number(livro.available) === 0).length;
  const bibliotecaVazia = $('#bibliotecaVazia');
  const filtroAtivo = Boolean($('#pesquisaBiblioteca').value.trim() || $('#filtroCategoriaBiblioteca').value);
  bibliotecaVazia.querySelector('b').textContent = livros.length && filtroAtivo ? 'Nenhum livro encontrado' : 'Nenhum livro cadastrado';
  bibliotecaVazia.querySelector('span').textContent = livros.length && filtroAtivo ? 'Tente pesquisar outro termo ou alterar a categoria.' : 'Cadastre o primeiro livro do Estoque.';
  bibliotecaVazia.style.display = lista.length ? 'none' : 'flex';
  $('#tabelaBiblioteca').style.display = lista.length ? 'table' : 'none';
  $('#tabelaBiblioteca tbody').innerHTML = lista.map(livro => `<tr><td>${escaparHtml(livro.code)}</td><td><b>${escaparHtml(livro.title || 'Sem título')}</b><small class="detalhe-livro">${escaparHtml(livro.publisher || '')} ${livro.year || ''}${Number(livro.lostCopies || 0) ? ` • ${livro.lostCopies} perdido(s)` : ''}</small></td><td>${escaparHtml(livro.author || 'Não informado')}</td><td>${escaparHtml(livro.category || 'Não informada')}</td><td>${escaparHtml(livro.isbn || '—')}</td><td>${escaparHtml(livro.location || 'Não informado')}</td><td>${livro.quantity}</td><td><b class="${Number(livro.available) === 0 ? 'estoque-baixo' : ''}">${livro.available}</b></td><td>${escaparHtml(livro.condition || 'Não informado')}</td><td><div class="acoes-emprestimo"><button class="botao-pequeno editar-livro" data-id="${livro.id}">Editar</button>${livroPodeSerReservado(livro) ? `<button class="botao-pequeno reservar-livro" data-id="${livro.id}">Reservar</button>` : ''}<button class="botao-pequeno botao-excluir excluir-livro" data-id="${livro.id}">Ocultar</button></div></td></tr>`).join('');
  $$('.editar-livro').forEach(botao => botao.addEventListener('click', () => abrirFormularioLivro(botao.dataset.id)));
  $$('.reservar-livro').forEach(botao => botao.addEventListener('click', () => abrirFormularioReserva(botao.dataset.id)));
  $$('.excluir-livro').forEach(botao => botao.addEventListener('click', () => abrirConfirmacaoExclusao('livro', botao.dataset.id)));
}

async function cancelarReserva(reservaId) {
  const reserva = reservas.find(item => item.id === reservaId);
  if (!reserva || reserva.status !== 'ativa') return;
  try {
    await requisitarApi(`/api/reservations/${reservaId}/cancel`, { method: 'POST' });
    await atualizarDepoisDaOperacao();
    mostrarAviso('Reserva cancelada. A fila foi atualizada.');
  } catch (erro) {
    tratarErroOperacao(erro);
  }
}

function emprestarReserva(reservaId) {
  const reserva = reservas.find(item => item.id === reservaId);
  const fila = reserva ? reservasAtivasDoLivro(reserva.bookId) : [];
  const livro = reserva ? livros.find(item => item.id === reserva.bookId) : null;
  if (!reserva || fila[0]?.id !== reserva.id || !livro || Number(livro.available) < 1) return mostrarAviso('Esta reserva ainda não está disponível para retirada.');
  abrirPagina('emprestimos');
  prepararEmprestimo(String(reserva.readerId));
  $('#livroEmprestimo').value = rotuloLivroSelecao(livro);
}

function renderizarReservas() {
  const ativas = reservas.filter(item => item.status === 'ativa').sort((a, b) => a.id - b.id);
  $('#reservasVazias').style.display = ativas.length ? 'none' : 'flex';
  $('#tabelaReservas').style.display = ativas.length ? 'table' : 'none';
  $('#tabelaReservas tbody').innerHTML = ativas.map(reserva => {
    const livro = livros.find(item => item.id === reserva.bookId);
    const leitor = leitores.find(item => item.id === reserva.readerId);
    const fila = reservasAtivasDoLivro(reserva.bookId);
    const posicao = fila.findIndex(item => item.id === reserva.id) + 1;
    const pronta = posicao === 1 && Number(livro?.available || 0) > 0;
    return `<tr><td><b>${posicao}º</b></td><td>${escaparHtml(tituloLivroParaExibicao(livro))}</td><td>${escaparHtml(nomeLeitorParaExibicao(leitor))}</td><td>${formatarData(reserva.date)}</td><td><span class="situacao ${pronta ? 'devolvido' : 'andamento'}">${pronta ? 'Disponível para retirada' : 'Aguardando'}</span></td><td><div class="acoes-emprestimo">${pronta ? `<button class="botao-pequeno emprestar-reserva" data-id="${reserva.id}">Emprestar</button>` : ''}<button class="botao-pequeno cancelar-reserva" data-id="${reserva.id}">Cancelar</button></div></td></tr>`;
  }).join('');
  $$('.cancelar-reserva').forEach(botao => botao.addEventListener('click', () => cancelarReserva(Number(botao.dataset.id))));
  $$('.emprestar-reserva').forEach(botao => botao.addEventListener('click', () => emprestarReserva(Number(botao.dataset.id))));
}

function renderizarLeitores(lista = leitores) {
  const leitoresVazios = $('#leitoresVazios');
  const filtroAtivo = Boolean($('#pesquisaLeitor').value.trim() || $('#filtroSituacaoLeitor').value);
  leitoresVazios.querySelector('b').textContent = leitores.length && filtroAtivo ? 'Nenhum leitor encontrado' : 'Nenhum leitor cadastrado';
  leitoresVazios.querySelector('span').textContent = leitores.length && filtroAtivo ? 'Tente alterar a pesquisa ou o filtro de situação.' : 'Cadastre o primeiro leitor da biblioteca.';
  leitoresVazios.style.display = lista.length ? 'none' : 'flex';
  $('#tabelaLeitores').style.display = lista.length ? 'table' : 'none';
  $('#tabelaLeitores tbody').innerHTML = lista.map(leitor => {
    const bloqueio = obterBloqueio(leitor.id);
    const advertencias = contarAdvertencias(leitor.id);
    return `<tr><td>${escaparHtml(leitor.nome || 'Sem nome')}</td><td>${escaparHtml(leitor.matricula)}</td><td>${escaparHtml(leitor.tipo || 'Não informado')}</td><td>${escaparHtml(leitor.turma || 'Não informada')}</td><td><span class="contador-advertencias ${advertencias ? 'possui' : ''}">${advertencias}</span></td><td><span class="situacao ${bloqueio.bloqueado ? 'atrasado' : ''}">${bloqueio.bloqueado ? 'Bloqueado' : 'Liberado'}</span></td><td><div class="acoes-emprestimo"><button class="botao-pequeno editar-leitor" data-id="${leitor.id}">Editar</button><button class="botao-pequeno ver-historico-leitor" data-id="${leitor.id}">Histórico</button><button class="botao-pequeno emprestar-leitor" data-id="${leitor.id}" ${bloqueio.bloqueado ? 'disabled' : ''}>Emprestar</button><button class="botao-pequeno botao-excluir excluir-leitor" data-id="${leitor.id}">Ocultar</button></div></td></tr>`;
  }).join('');
  $$('.editar-leitor').forEach(botao => botao.addEventListener('click', () => abrirFormularioLeitor(botao.dataset.id)));
  $$('.emprestar-leitor').forEach(botao => botao.addEventListener('click', () => prepararEmprestimo(botao.dataset.id)));
  $$('.ver-historico-leitor').forEach(botao => botao.addEventListener('click', () => abrirHistoricoLeitor(Number(botao.dataset.id))));
  $$('.excluir-leitor').forEach(botao => botao.addEventListener('click', () => abrirConfirmacaoExclusao('leitor', botao.dataset.id)));
}

function abrirHistoricoLeitor(leitorId) {
  const leitor = leitores.find(item => item.id === leitorId);
  if (!leitor) return;
  const historico = emprestimos.filter(item => item.readerId === leitorId).sort((a, b) => lerData(b.loanDate) - lerData(a.loanDate));
  const bloqueio = obterBloqueio(leitorId);
  const renovacoes = historico.reduce((total, item) => total + (item.renewals?.length || 0), 0);
  $('#nomeHistoricoLeitor').textContent = nomeLeitorParaExibicao(leitor);
  $('#dadosHistoricoLeitor').textContent = `${leitor.tipo || 'Tipo não informado'} • ${leitor.matricula} • ${leitor.turma || 'Turma/setor não informado'}`;
  $('#situacaoHistoricoLeitor').textContent = bloqueio.bloqueado ? 'Bloqueado' : 'Liberado';
  $('#situacaoHistoricoLeitor').className = `situacao ${bloqueio.bloqueado ? 'atrasado' : ''}`;
  $('#bloqueioHistoricoLeitor').textContent = bloqueio.mensagem;
  $('#bloqueioHistoricoLeitor').classList.toggle('oculto', !bloqueio.bloqueado);
  $('#historicoTotalEmprestimos').textContent = historico.length;
  $('#historicoTotalAtrasos').textContent = contarAtrasos(leitorId);
  $('#historicoTotalAdvertencias').textContent = contarAdvertencias(leitorId);
  $('#historicoTotalRenovacoes').textContent = renovacoes;
  $('#historicoLeitorVazio').style.display = historico.length ? 'none' : 'flex';
  $('#tabelaHistoricoLeitor').style.display = historico.length ? 'table' : 'none';
  $('#tabelaHistoricoLeitor tbody').innerHTML = historico.map(item => {
    const livro = livros.find(valor => valor.id === item.bookId);
    const situacao = situacaoEmprestimo(item);
    const detalhes = [];
    if (item.renewals?.length) detalhes.push(`${item.renewals.length} renovação(ões)`);
    if (item.warning) detalhes.push(`Advertência: ${item.returnCondition}`);
    if (item.returnNote) detalhes.push(item.returnNote);
    if (item.penaltyUntil) detalhes.push(`Bloqueio até ${formatarData(item.penaltyUntil)}`);
    return `<tr><td>${escaparHtml(tituloLivroParaExibicao(livro))}</td><td>${formatarData(item.loanDate)}</td><td>${formatarData(item.dueDate)}</td><td>${formatarData(item.returnDate)}</td><td><span class="situacao ${situacao.classe}">${situacao.texto}</span></td><td>${escaparHtml(detalhes.join(' • ') || 'Sem observações')}</td></tr>`;
  }).join('');
  $('#janelaHistoricoLeitor').showModal();
}

function listaPorFiltro() {
  return emprestimos.filter(item => {
    const situacao = situacaoEmprestimo(item).classe;
    if (filtroAtual === 'todos') return true;
    if (filtroAtual === 'ativos') return !item.returnDate;
    if (filtroAtual === 'atrasados') return situacao === 'atrasado';
    return situacao === 'devolvido';
  });
}

function renderizarEmprestimos() {
  const lista = listaPorFiltro();
  $('#emprestimosVazios').style.display = lista.length ? 'none' : 'flex';
  $('#tabelaEmprestimos').style.display = lista.length ? 'table' : 'none';
  $('#tabelaEmprestimos tbody').innerHTML = lista.map(item => {
    const leitor = leitores.find(valor => valor.id === item.readerId);
    const livro = livros.find(valor => valor.id === item.bookId);
    const situacao = situacaoEmprestimo(item);
    const possuiReservaAtiva = livroPossuiReservaAtiva(item.bookId);
    const podeRenovar = situacao.classe !== 'atrasado' && !possuiReservaAtiva;
    const motivoBloqueioRenovacao = possuiReservaAtiva ? 'Livro com reserva ativa' : 'Empréstimo atrasado';
    const resultado = item.returnDate ? (item.warning ? `Advertência: ${escaparHtml(item.returnCondition)}` : (item.penaltyUntil ? `Bloqueio até ${formatarData(item.penaltyUntil)}` : 'Concluído')) : `<div class="acoes-emprestimo"><button class="botao-pequeno renovar-emprestimo" data-id="${item.id}" ${podeRenovar ? '' : `disabled title="${motivoBloqueioRenovacao}"`}>Renovar</button><button class="botao-pequeno devolver-livro" data-id="${item.id}">Devolver</button></div>`;
    return `<tr><td>${escaparHtml(nomeLeitorParaExibicao(leitor))}</td><td>${escaparHtml(tituloLivroParaExibicao(livro))}</td><td>${formatarData(item.loanDate)}</td><td>${formatarData(item.dueDate)}</td><td>${formatarData(item.returnDate)}</td><td><span class="situacao ${situacao.classe}">${situacao.texto}</span></td><td>${resultado}</td></tr>`;
  }).join('');
  $$('.devolver-livro').forEach(botao => botao.addEventListener('click', () => abrirFormularioDevolucao(Number(botao.dataset.id))));
  $$('.renovar-emprestimo').forEach(botao => botao.addEventListener('click', () => abrirFormularioRenovacao(Number(botao.dataset.id))));
}

function renderizarPainel() {
  const ativos = emprestimos.filter(item => !item.returnDate);
  const atrasados = ativos.filter(item => situacaoEmprestimo(item).classe === 'atrasado');
  const bloqueados = leitores.filter(leitor => obterBloqueio(leitor.id).bloqueado);
  $('#totalTitulos').textContent = livros.length;
  $('#totalEmprestimos').textContent = ativos.length;
  $('#totalAtrasados').textContent = atrasados.length;
  $('#totalLeitores').textContent = leitores.length;
  $('#quantidadeNotificacoes').textContent = atrasados.length;
  const proximos = [...ativos].sort((a, b) => lerData(a.dueDate) - lerData(b.dueDate)).slice(0, 5);
  $('#proximasVazias').style.display = proximos.length ? 'none' : 'flex';
  $('#listaProximas').innerHTML = proximos.map(item => { const leitor = leitores.find(v => v.id === item.readerId); const livro = livros.find(v => v.id === item.bookId); const status = situacaoEmprestimo(item); return `<div class="linha-aluno"><div><h3>${escaparHtml(tituloLivroParaExibicao(livro))}</h3><p>${escaparHtml(nomeLeitorParaExibicao(leitor))} • prazo ${formatarData(item.dueDate)}</p></div><span class="situacao ${status.classe}">${status.texto}</span></div>`; }).join('');
  $('#bloqueadosVazios').style.display = bloqueados.length ? 'none' : 'flex';
  $('#listaBloqueados').innerHTML = bloqueados.map(leitor => `<div class="linha-aluno"><div><h3>${escaparHtml(nomeLeitorParaExibicao(leitor))}</h3><p>${escaparHtml(obterBloqueio(leitor.id).mensagem)}</p></div><span class="situacao atrasado">Bloqueado</span></div>`).join('');
}

function renderizarRelatorio() {
  const ativos = emprestimos.filter(item => !item.returnDate).length;
  const atrasados = emprestimos.filter(item => situacaoEmprestimo(item).classe === 'atrasado').length;
  const bloqueados = leitores.filter(leitor => obterBloqueio(leitor.id).bloqueado).length;
  const advertencias = emprestimos.filter(item => item.warning).length;
  const perdidos = livros.reduce((total, livro) => total + Number(livro.lostCopies || 0), 0);
  $('#resumoRelatorio').textContent = `${livros.length} título(s), ${leitores.length} leitor(es), ${ativos} empréstimo(s) ativo(s), ${atrasados} atrasado(s), ${bloqueados} leitor(es) bloqueado(s), ${advertencias} advertência(s) e ${perdidos} exemplar(es) perdido(s).`;
  $('#listaRelatorio').innerHTML = `<div class="linha-aluno"><div><h3>Movimentações registradas</h3><p>Total histórico de empréstimos</p></div><b>${emprestimos.length}</b></div><div class="linha-aluno"><div><h3>Advertências por conservação</h3><p>Livros devolvidos fora do estado esperado</p></div><b>${advertencias}</b></div>`;
}

function renderizarTudo() {
  filtrarBiblioteca();
  filtrarLeitores();
  renderizarEmprestimos();
  renderizarReservas();
  renderizarPainel();
  renderizarRelatorio();
}

$('#pesquisaBiblioteca').addEventListener('input', filtrarBiblioteca);
$('#campoPesquisaBiblioteca').addEventListener('change', () => {
  const campo = $('#campoPesquisaBiblioteca');
  const nomeCampo = campo.options[campo.selectedIndex].textContent.toLocaleLowerCase('pt-BR');
  $('#pesquisaBiblioteca').placeholder = campo.value === 'todos'
    ? 'Pesquisar em todos os campos...'
    : `Pesquisar por ${nomeCampo}...`;
  filtrarBiblioteca();
});
$('#filtroCategoriaBiblioteca').addEventListener('change', filtrarBiblioteca);

function normalizarCategoria(categoria) {
  return String(categoria ?? '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('pt-BR');
}

function obterCategoriasPadrao() {
  return new Set([...$('#categoriaLivro').options]
    .map(opcao => opcao.value)
    .filter(valor => valor && valor !== 'Outro')
    .map(normalizarCategoria));
}

function categoriaCorrespondeAoFiltro(categoriaLivro, categoriaFiltro, categoriasPadrao = obterCategoriasPadrao()) {
  if (!categoriaFiltro) return true;
  const categoriaNormalizada = normalizarCategoria(categoriaLivro);
  if (categoriaFiltro !== 'Outro') return categoriaNormalizada === normalizarCategoria(categoriaFiltro);
  if (!categoriaNormalizada) return false;
  return !categoriasPadrao.has(categoriaNormalizada);
}

function filtrarBiblioteca() {
  const termo = $('#pesquisaBiblioteca').value;
  const campo = $('#campoPesquisaBiblioteca').value;
  const categoria = $('#filtroCategoriaBiblioteca').value;
  const categoriasPadrao = obterCategoriasPadrao();
  renderizarBiblioteca(livros.filter(livro => livroCorrespondePesquisa(livro, termo, campo) && categoriaCorrespondeAoFiltro(livro.category, categoria, categoriasPadrao)));
}

$('#pesquisaLeitor').addEventListener('input', filtrarLeitores);
$('#filtroSituacaoLeitor').addEventListener('change', filtrarLeitores);

function leitorCorrespondeAoFiltro(leitor, filtro) {
  if (!filtro) return true;
  const bloqueado = obterBloqueio(leitor.id).bloqueado;
  const possuiAdvertencia = contarAdvertencias(leitor.id) > 0;
  if (filtro === 'atencao') return bloqueado || possuiAdvertencia;
  if (filtro === 'bloqueados') return bloqueado;
  if (filtro === 'advertencias') return possuiAdvertencia;
  return !bloqueado && !possuiAdvertencia;
}

function filtrarLeitores() {
  const termo = $('#pesquisaLeitor').value;
  const filtro = $('#filtroSituacaoLeitor').value;
  renderizarLeitores(leitores.filter(leitor => leitorCorrespondePesquisa(leitor, termo) && leitorCorrespondeAoFiltro(leitor, filtro)));
}

$$('.filtro-emprestimo').forEach(botao => botao.addEventListener('click', () => {
  filtroAtual = botao.dataset.filtro;
  $$('.filtro-emprestimo').forEach(item => item.classList.toggle('ativo', item === botao));
  renderizarEmprestimos();
}));

$('#botaoNotificacao').addEventListener('click', () => {
  const atrasados = emprestimos.filter(item => situacaoEmprestimo(item).classe === 'atrasado').length;
  mostrarAviso(atrasados ? `${atrasados} devolução(ões) atrasada(s).` : 'Nenhuma devolução atrasada.');
});
$('#imprimirRelatorio').addEventListener('click', () => window.print());
$('#textoHoje').textContent = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });

async function restaurarSessao() {
  try {
    const resultado = await requisitarApi('/api/auth/session');
    await carregarDadosServidor({ migrarLocais: true });
    exibirSistema(resultado.user);
  } catch (erro) {
    if (erro.status !== 401) $('#erroLogin').textContent = erro.message;
  }
}

configurarAcessoDemonstracao();
restaurarSessao();
