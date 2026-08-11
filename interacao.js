// Contas usadas somente no protótipo. Em produção, o login deve ficar no servidor.
const usuarios = {
  testebiblioteca: { senha: 'Biblioteca@123', nome: 'Responsável da Biblioteca', perfil: 'Biblioteca' },
  testediretor: { senha: 'Diretor@123', nome: 'Diretor Teste', perfil: 'Diretor' }
};

const dadosAntigosLeitores = JSON.parse(localStorage.getItem('ds_students') || '[]');
let usuarioAtual = null;
let leitores = JSON.parse(localStorage.getItem('ds_readers') || 'null') || dadosAntigosLeitores.map(item => ({
  id: item.id, nome: item.name, matricula: item.registration || '', tipo: 'Aluno', turma: item.className || ''
}));
let livros = JSON.parse(localStorage.getItem('ds_library') || '[]');
let emprestimos = JSON.parse(localStorage.getItem('ds_loans') || '[]');
let filtroAtual = 'ativos';
let emprestimoEmDevolucao = null;

const $ = seletor => document.querySelector(seletor);
const $$ = seletor => document.querySelectorAll(seletor);

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

function salvarDados() {
  localStorage.setItem('ds_readers', JSON.stringify(leitores));
  localStorage.setItem('ds_library', JSON.stringify(livros));
  localStorage.setItem('ds_loans', JSON.stringify(emprestimos));
}

// Mostra um campo de texto quando uma opção "Outro" é escolhida.
$$('[data-campo-outro]').forEach(seletor => {
  seletor.addEventListener('change', () => atualizarCampoOutro(seletor));
});

function atualizarCampoOutro(seletor) {
  const campo = $(`#${seletor.dataset.campoOutro}`);
  const mostrar = seletor.value === 'Outro';
  campo.classList.toggle('oculto', !mostrar);
  campo.required = mostrar;
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

$('#mostrarSenha').addEventListener('click', () => {
  $('#senha').type = $('#senha').type === 'password' ? 'text' : 'password';
});

$('#formularioLogin').addEventListener('submit', evento => {
  evento.preventDefault();
  const chave = $('#usuario').value.trim().toLowerCase();
  const usuario = usuarios[chave];
  if (!usuario || usuario.senha !== $('#senha').value) {
    $('#erroLogin').textContent = 'Usuário ou senha incorretos.';
    return;
  }
  usuarioAtual = { ...usuario, chave };
  $('#erroLogin').textContent = '';
  $('#paginaLogin').classList.add('oculto');
  $('#sistema').classList.remove('oculto');
  $('#nomeUsuario').textContent = usuario.nome;
  $('#perfilUsuario').textContent = usuario.perfil;
  $('#inicialUsuario').textContent = usuario.perfil.charAt(0);
  $$('.somente-diretor').forEach(item => item.classList.toggle('oculto', usuario.perfil !== 'Diretor'));
  renderizarTudo();
});

$('#botaoSair').addEventListener('click', () => {
  usuarioAtual = null;
  $('#sistema').classList.add('oculto');
  $('#paginaLogin').classList.remove('oculto');
  $('#formularioLogin').reset();
});

const nomesPaginas = { painel: 'Painel', leitores: 'Leitores', biblioteca: 'Estoque', emprestimos: 'Empréstimos', relatorios: 'Relatórios' };
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

$('#abrirLeitor').addEventListener('click', () => $('#janelaLeitor').showModal());
$('#abrirItemBiblioteca').addEventListener('click', () => $('#janelaBiblioteca').showModal());

$('#salvarLeitor').addEventListener('click', evento => {
  evento.preventDefault();
  if (!$('#formularioLeitor').reportValidity()) return;
  const matricula = $('#matriculaLeitor').value.trim();
  if (leitores.some(leitor => leitor.matricula.toLowerCase() === matricula.toLowerCase())) return mostrarAviso('Já existe um leitor com essa matrícula.');
  leitores.push({ id: Date.now(), nome: $('#nomeLeitor').value.trim(), matricula, tipo: valorComOutro('tipoLeitor'), turma: $('#turmaLeitor').value.trim() });
  salvarDados();
  $('#formularioLeitor').reset();
  limparCamposOutro($('#formularioLeitor'));
  $('#janelaLeitor').close();
  renderizarTudo();
  mostrarAviso('Leitor cadastrado com sucesso.');
});

$('#salvarItemBiblioteca').addEventListener('click', evento => {
  evento.preventDefault();
  if (!$('#formularioBiblioteca').reportValidity()) return;
  const codigo = $('#codigoLivro').value.trim();
  const isbn = $('#isbnLivro').value.trim();
  if (livros.some(livro => livro.code.toLowerCase() === codigo.toLowerCase())) return mostrarAviso('Já existe um livro com esse código.');
  if (isbn && livros.some(livro => livro.isbn === isbn)) return mostrarAviso('Já existe um livro com esse ISBN.');
  const quantidade = Number($('#quantidadeLivro').value);
  livros.push({
    id: Date.now(), code: codigo, isbn, title: $('#tituloLivro').value.trim(), author: $('#autorLivro').value.trim(),
    publisher: $('#editoraLivro').value.trim(), year: $('#anoLivro').value, category: valorComOutro('categoriaLivro'),
    location: $('#localLivro').value.trim(), quantity: quantidade, available: quantidade, condition: valorComOutro('estadoLivro')
  });
  salvarDados();
  $('#formularioBiblioteca').reset();
  limparCamposOutro($('#formularioBiblioteca'));
  $('#quantidadeLivro').value = 1;
  $('#janelaBiblioteca').close();
  renderizarTudo();
  mostrarAviso('Livro cadastrado no Estoque.');
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
  $('#pesquisaLeitorEmprestimo').value = '';
  preencherOpcoesLeitores(leitores, leitorSelecionado);
  $('#pesquisaLivroEmprestimo').value = '';
  preencherOpcoesLivros(disponiveis);
  const hoje = new Date();
  const prazo = new Date();
  prazo.setDate(prazo.getDate() + 7);
  $('#dataEmprestimo').value = dataLocal(hoje);
  $('#dataPrazo').value = dataLocal(prazo);
  $('#leitorEmprestimo').value = leitorSelecionado;
  verificarLeitorSelecionado();
  $('#janelaEmprestimo').showModal();
}

function preencherOpcoesLeitores(lista, leitorSelecionado = '') {
  $('#leitorEmprestimo').innerHTML = '<option value="">Selecione um leitor</option>' + lista.map(leitor => `<option value="${leitor.id}">${escaparHtml(leitor.nome)} - ${escaparHtml(leitor.matricula || 'sem matrícula')}</option>`).join('');
  $('#leitorEmprestimo').value = leitorSelecionado;
}

function preencherOpcoesLivros(lista, livroSelecionado = '') {
  $('#livroEmprestimo').innerHTML = '<option value="">Selecione um livro</option>' + lista.map(livro => `<option value="${livro.id}">${escaparHtml(livro.title)} - ${escaparHtml(livro.author)} (${livro.available} disponível/is)</option>`).join('');
  $('#livroEmprestimo').value = livroSelecionado;
}

$$('.abrir-emprestimo').forEach(botao => botao.addEventListener('click', () => prepararEmprestimo()));

function verificarLeitorSelecionado() {
  const leitorId = Number($('#leitorEmprestimo').value);
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

$('#leitorEmprestimo').addEventListener('change', verificarLeitorSelecionado);
$('#pesquisaLeitorEmprestimo').addEventListener('input', evento => {
  const termo = evento.target.value.trim().toLowerCase();
  const selecionado = $('#leitorEmprestimo').value;
  const encontrados = leitores.filter(leitor => `${leitor.nome} ${leitor.matricula} ${leitor.turma}`.toLowerCase().includes(termo));
  preencherOpcoesLeitores(encontrados, selecionado);
  verificarLeitorSelecionado();
});

$('#pesquisaLivroEmprestimo').addEventListener('input', evento => {
  const termo = evento.target.value.trim().toLowerCase();
  const selecionado = $('#livroEmprestimo').value;
  const encontrados = livros.filter(livro => Number(livro.available) > 0 && `${livro.title} ${livro.author} ${livro.isbn || ''} ${livro.code}`.toLowerCase().includes(termo));
  preencherOpcoesLivros(encontrados, selecionado);
});

$('#salvarEmprestimo').addEventListener('click', evento => {
  evento.preventDefault();
  if (!$('#formularioEmprestimo').reportValidity()) return;
  const leitorId = Number($('#leitorEmprestimo').value);
  const livroId = Number($('#livroEmprestimo').value);
  const bloqueio = obterBloqueio(leitorId);
  if (bloqueio.bloqueado) return mostrarAviso(bloqueio.mensagem);
  if (lerData($('#dataPrazo').value) < lerData($('#dataEmprestimo').value)) return mostrarAviso('O prazo deve ser posterior ao empréstimo.');
  const livro = livros.find(item => item.id === livroId);
  if (!livro || livro.available < 1) return mostrarAviso('Este livro não está mais disponível.');
  livro.available -= 1;
  emprestimos.unshift({ id: Date.now(), readerId: leitorId, bookId: livroId, loanDate: $('#dataEmprestimo').value, dueDate: $('#dataPrazo').value, returnDate: null, penaltyUntil: null, responsible: usuarioAtual.nome });
  salvarDados();
  $('#formularioEmprestimo').reset();
  $('#janelaEmprestimo').close();
  renderizarTudo();
  mostrarAviso('Empréstimo registrado com sucesso.');
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
  $('#resumoDevolucao').innerHTML = `<b>${escaparHtml(livro?.title || 'Livro removido')}</b><span>Emprestado para ${escaparHtml(leitor?.nome || 'Leitor removido')}</span><span>Prazo: ${formatarData(emprestimo.dueDate)}</span>`;
  $('#janelaDevolucao').showModal();
}

function atualizarRegraAdvertencia() {
  const geraAdvertencia = $('#estadoDevolucao').value !== 'Bom';
  $('#observacaoDevolucao').required = geraAdvertencia;
  $('#observacaoDevolucao').placeholder = geraAdvertencia ? 'Descreva obrigatoriamente o problema encontrado' : 'Observação opcional para devolução em bom estado';
}

$('#estadoDevolucao').addEventListener('change', atualizarRegraAdvertencia);

$('#confirmarDevolucao').addEventListener('click', evento => {
  evento.preventDefault();
  atualizarRegraAdvertencia();
  if (!$('#formularioDevolucao').reportValidity()) return;
  registrarDevolucao(emprestimoEmDevolucao, valorComOutro('estadoDevolucao'), $('#observacaoDevolucao').value.trim());
  $('#janelaDevolucao').close();
});

function registrarDevolucao(emprestimoId, estado, observacao) {
  const emprestimo = emprestimos.find(item => item.id === emprestimoId);
  if (!emprestimo || emprestimo.returnDate) return;
  const hoje = dataLocal();
  emprestimo.returnDate = hoje;
  emprestimo.returnCondition = estado;
  emprestimo.returnNote = observacao;
  emprestimo.warning = estado !== 'Bom';
  emprestimo.bookLost = estado === 'Livro perdido';
  const atrasado = lerData(hoje) > lerData(emprestimo.dueDate);
  if (atrasado) {
    const fimMulta = new Date();
    fimMulta.setMonth(fimMulta.getMonth() + 1);
    emprestimo.penaltyUntil = dataLocal(fimMulta);
  }
  const livro = livros.find(item => item.id === emprestimo.bookId);
  if (livro && emprestimo.bookLost) livro.lostCopies = Number(livro.lostCopies || 0) + 1;
  if (livro && !emprestimo.bookLost) livro.available = Math.min(Number(livro.quantity), Number(livro.available) + 1);
  salvarDados();
  renderizarTudo();
  if (emprestimo.bookLost && atrasado) return mostrarAviso(`Livro perdido e indisponível. Leitor advertido e bloqueado até ${formatarData(emprestimo.penaltyUntil)}.`);
  if (emprestimo.bookLost) return mostrarAviso('Livro registrado como perdido e indisponível. Advertência adicionada ao leitor.');
  if (emprestimo.warning && atrasado) return mostrarAviso(`Advertência registrada e leitor bloqueado até ${formatarData(emprestimo.penaltyUntil)}.`);
  if (emprestimo.warning) return mostrarAviso('Devolução concluída e advertência registrada para o leitor.');
  mostrarAviso(atrasado ? `Devolução atrasada: leitor bloqueado até ${formatarData(emprestimo.penaltyUntil)}.` : 'Devolução registrada em bom estado.');
}

function contarAdvertencias(leitorId) {
  return emprestimos.filter(item => item.readerId === leitorId && item.warning).length;
}

function situacaoEmprestimo(item) {
  if (item.returnDate) return { texto: 'Devolvido', classe: 'devolvido' };
  if (lerData(item.dueDate) < lerData(dataLocal())) return { texto: 'Atrasado', classe: 'atrasado' };
  return { texto: 'Em andamento', classe: 'andamento' };
}

function renderizarBiblioteca(lista = livros) {
  $('#titulosBiblioteca').textContent = livros.length;
  $('#exemplaresBiblioteca').textContent = livros.reduce((total, livro) => total + Number(livro.quantity || 0), 0);
  $('#bibliotecaDisponiveis').textContent = livros.reduce((total, livro) => total + Number(livro.available || 0), 0);
  $('#estoqueBaixoBiblioteca').textContent = livros.filter(livro => Number(livro.available) === 0).length;
  $('#bibliotecaVazia').style.display = lista.length ? 'none' : 'flex';
  $('#tabelaBiblioteca').style.display = lista.length ? 'table' : 'none';
  $('#tabelaBiblioteca tbody').innerHTML = lista.map(livro => `<tr><td>${escaparHtml(livro.code)}</td><td><b>${escaparHtml(livro.title)}</b><small class="detalhe-livro">${escaparHtml(livro.publisher || '')} ${livro.year || ''}${Number(livro.lostCopies || 0) ? ` • ${livro.lostCopies} perdido(s)` : ''}</small></td><td>${escaparHtml(livro.author)}</td><td>${escaparHtml(livro.isbn || '—')}</td><td>${escaparHtml(livro.location || 'Não informado')}</td><td>${livro.quantity}</td><td><b class="${Number(livro.available) === 0 ? 'estoque-baixo' : ''}">${livro.available}</b></td><td>${escaparHtml(livro.condition)}</td></tr>`).join('');
}

function renderizarLeitores(lista = leitores) {
  $('#leitoresVazios').style.display = lista.length ? 'none' : 'flex';
  $('#tabelaLeitores').style.display = lista.length ? 'table' : 'none';
  $('#tabelaLeitores tbody').innerHTML = lista.map(leitor => {
    const bloqueio = obterBloqueio(leitor.id);
    const advertencias = contarAdvertencias(leitor.id);
    return `<tr><td>${escaparHtml(leitor.nome)}</td><td>${escaparHtml(leitor.matricula || 'Não informada')}</td><td>${escaparHtml(leitor.tipo)}</td><td>${escaparHtml(leitor.turma)}</td><td><span class="contador-advertencias ${advertencias ? 'possui' : ''}">${advertencias}</span></td><td><span class="situacao ${bloqueio.bloqueado ? 'atrasado' : ''}">${bloqueio.bloqueado ? 'Bloqueado' : 'Liberado'}</span></td><td><button class="botao-pequeno emprestar-leitor" data-id="${leitor.id}" ${bloqueio.bloqueado ? 'disabled' : ''}>Emprestar</button></td></tr>`;
  }).join('');
  $$('.emprestar-leitor').forEach(botao => botao.addEventListener('click', () => prepararEmprestimo(botao.dataset.id)));
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
    const resultado = item.returnDate ? (item.warning ? `Advertência: ${escaparHtml(item.returnCondition)}` : (item.penaltyUntil ? `Bloqueio até ${formatarData(item.penaltyUntil)}` : 'Concluído')) : `<button class="botao-pequeno devolver-livro" data-id="${item.id}">Devolver</button>`;
    return `<tr><td>${escaparHtml(leitor?.nome || 'Leitor removido')}</td><td>${escaparHtml(livro?.title || 'Livro removido')}</td><td>${formatarData(item.loanDate)}</td><td>${formatarData(item.dueDate)}</td><td>${formatarData(item.returnDate)}</td><td><span class="situacao ${situacao.classe}">${situacao.texto}</span></td><td>${resultado}</td></tr>`;
  }).join('');
  $$('.devolver-livro').forEach(botao => botao.addEventListener('click', () => abrirFormularioDevolucao(Number(botao.dataset.id))));
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
  $('#listaProximas').innerHTML = proximos.map(item => { const leitor = leitores.find(v => v.id === item.readerId); const livro = livros.find(v => v.id === item.bookId); const status = situacaoEmprestimo(item); return `<div class="linha-aluno"><div><h3>${escaparHtml(livro?.title || 'Livro')}</h3><p>${escaparHtml(leitor?.nome || 'Leitor')} • prazo ${formatarData(item.dueDate)}</p></div><span class="situacao ${status.classe}">${status.texto}</span></div>`; }).join('');
  $('#bloqueadosVazios').style.display = bloqueados.length ? 'none' : 'flex';
  $('#listaBloqueados').innerHTML = bloqueados.map(leitor => `<div class="linha-aluno"><div><h3>${escaparHtml(leitor.nome)}</h3><p>${escaparHtml(obterBloqueio(leitor.id).mensagem)}</p></div><span class="situacao atrasado">Bloqueado</span></div>`).join('');
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
  renderizarBiblioteca();
  renderizarLeitores();
  renderizarEmprestimos();
  renderizarPainel();
  renderizarRelatorio();
}

$('#pesquisaBiblioteca').addEventListener('input', filtrarBiblioteca);
$('#filtroCategoriaBiblioteca').addEventListener('change', filtrarBiblioteca);
function filtrarBiblioteca() {
  const termo = $('#pesquisaBiblioteca').value.toLowerCase();
  const categoria = $('#filtroCategoriaBiblioteca').value;
  renderizarBiblioteca(livros.filter(livro => `${livro.code} ${livro.title} ${livro.author} ${livro.isbn || ''}`.toLowerCase().includes(termo) && (!categoria || livro.category === categoria)));
}

$('#pesquisaLeitor').addEventListener('input', evento => {
  const termo = evento.target.value.toLowerCase();
  renderizarLeitores(leitores.filter(leitor => `${leitor.nome} ${leitor.matricula} ${leitor.turma}`.toLowerCase().includes(termo)));
});

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
