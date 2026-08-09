// Contas de teste. Em um sistema real, os usuários devem ficar em um servidor
// e as senhas devem ser protegidas com criptografia.
const users = {
  testeprofessor: { password: 'Professor@123', name: 'Professor Teste', role: 'Professor' },
  testediretor: { password: 'Diretor@123', name: 'Diretor Teste', role: 'Diretor' }
};

let currentUser = null;
let students = JSON.parse(localStorage.getItem('ds_students') || '[]');
let occurrences = JSON.parse(localStorage.getItem('ds_occurrences') || '[]');
let libraryItems = JSON.parse(localStorage.getItem('ds_library') || '[]');

const $ = selector => document.querySelector(selector);
const $$ = selector => document.querySelectorAll(selector);

function showToast(message) {
  $('#aviso-flutuante').textContent = message;
  $('#aviso-flutuante').classList.add('visivel');
  clearTimeout(window.temporizadorAviso);
  window.temporizadorAviso = setTimeout(() => $('#aviso-flutuante').classList.remove('visivel'), 2500);
}

$('#mostrarSenha').addEventListener('click', () => {
  $('#senha').type = $('#senha').type === 'password' ? 'text' : 'password';
});

$('#formularioLogin').addEventListener('submit', event => {
  event.preventDefault();
  const username = $('#usuario').value.trim().toLowerCase();
  const user = users[username];
  if (!user || user.password !== $('#senha').value) {
    $('#erroLogin').textContent = 'Usuário ou senha incorretos.';
    return;
  }
  currentUser = { ...user, username };
  $('#erroLogin').textContent = '';
  $('#paginaLogin').classList.add('oculto');
  $('#sistema').classList.remove('oculto');
  $('#nomeUsuario').textContent = user.name;
  $('#perfilUsuario').textContent = user.role;
  $('#inicialUsuario').textContent = user.role.charAt(0);
  $('#saudacaoPerfil').textContent = `ÁREA DO ${user.role.toUpperCase()}`;
  $$('.somente-diretor').forEach(item => item.classList.toggle('oculto', user.role !== 'Diretor'));
  renderAll();
});

$('#botaoSair').addEventListener('click', () => {
  currentUser = null;
  $('#sistema').classList.add('oculto');
  $('#paginaLogin').classList.remove('oculto');
  $('#formularioLogin').reset();
});

const paginaNames = { painel: 'Painel principal', alunos: 'Alunos', ocorrencias: 'Ocorrências', biblioteca: 'Biblioteca', relatorios: 'Relatórios' };
function openPage(paginaId) {
  $$('.pagina').forEach(pagina => pagina.classList.remove('ativo'));
  $$('.item-navegacao').forEach(item => item.classList.toggle('ativo', item.dataset.pagina === paginaId));
  $(`#${paginaId}`).classList.add('ativo');
  $('#tituloPagina').textContent = paginaNames[paginaId];
  $('#barra-lateral').classList.remove('aberto');
}

$$('.item-navegacao').forEach(item => item.addEventListener('click', () => openPage(item.dataset.pagina)));
$$('[data-go]').forEach(item => item.addEventListener('click', () => openPage(item.dataset.go)));
$('#menuCelular').addEventListener('click', () => $('#barra-lateral').classList.toggle('aberto'));

$('#abrirAluno').addEventListener('click', () => $('#janelaAluno').showModal());
$('#abrirItemBiblioteca').addEventListener('click', () => $('#janelaBiblioteca').showModal());
$$('.abrir-ocorrencia').forEach(button => button.addEventListener('click', () => {
  if (!students.length) return showToast('Cadastre um aluno primeiro.');
  updateStudentOptions();
  $('#janelaOcorrencia').showModal();
}));

$('#salvarAluno').addEventListener('click', event => {
  event.preventDefault();
  if (!$('#formularioAluno').reportValidity()) return;
  students.push({ id: Date.now(), name: $('#nomeAluno').value.trim(), className: $('#turmaAluno').value.trim() });
  saveData();
  $('#formularioAluno').reset();
  $('#janelaAluno').close();
  renderAll();
  showToast('Aluno cadastrado com sucesso.');
});

$('#salvarOcorrencia').addEventListener('click', event => {
  event.preventDefault();
  if (!$('#formularioOcorrencia').reportValidity()) return;
  const studentId = Number($('#alunoOcorrencia').value);
  occurrences.unshift({ id: Date.now(), studentId, type: $('#tipoOcorrencia').value, description: $('#descricaoOcorrencia').value.trim(), date: new Date().toLocaleDateString('pt-BR'), responsible: currentUser.name });
  saveData();
  $('#formularioOcorrencia').reset();
  $('#janelaOcorrencia').close();
  renderAll();
  const total = countOccurrences(studentId);
  showToast(total === 5 ? 'ALERTA: o aluno atingiu 5 ocorrências!' : 'Ocorrência registrada.');
});

$('#salvarItemBiblioteca').addEventListener('click', event => {
  event.preventDefault();
  if (!$('#formularioBiblioteca').reportValidity()) return;
  const quantity = Number($('#quantidadeLivro').value);
  const available = Number($('#disponiveisLivro').value);
  if (available > quantity) return showToast('A quantidade disponível não pode ser maior que o total.');
  const code = $('#codigoLivro').value.trim();
  if (libraryItems.some(item => item.code.toLowerCase() === code.toLowerCase())) return showToast('Já existe um item com esse código.');
  libraryItems.push({ id: Date.now(), code, title: $('#tituloLivro').value.trim(), author: $('#autorLivro').value.trim(), category: $('#categoriaLivro').value, quantity, available, condition: $('#estadoLivro').value });
  saveData();
  $('#formularioBiblioteca').reset();
  $('#quantidadeLivro').value = 1;
  $('#disponiveisLivro').value = 1;
  $('#janelaBiblioteca').close();
  renderLibrary();
  showToast('Item cadastrado no inventário.');
});

function saveData() {
  localStorage.setItem('ds_students', JSON.stringify(students));
  localStorage.setItem('ds_occurrences', JSON.stringify(occurrences));
  localStorage.setItem('ds_library', JSON.stringify(libraryItems));
}

function countOccurrences(studentId) {
  return occurrences.filter(item => item.studentId === studentId).length;
}

function updateStudentOptions() {
  $('#alunoOcorrencia').innerHTML = '<option value="">Selecione um aluno</option>' + students.map(student => `<option value="${student.id}">${escapeHtml(student.name)} - ${escapeHtml(student.className)}</option>`).join('');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function renderAll() {
  const alerts = students.filter(student => countOccurrences(student.id) >= 5);
  $('#totalAlunos').textContent = students.length;
  $('#totalOcorrencias').textContent = occurrences.length;
  $('#totalAlertas').textContent = alerts.length;
  $('#quantidadeNotificacoes').textContent = alerts.length;
  $('#totalMes').textContent = occurrences.length;
  renderStudents(students);
  renderOccurrences();
  renderMonitoring();
  renderReport();
  renderLibrary();
}

function renderLibrary(list = libraryItems) {
  $('#titulosBiblioteca').textContent = libraryItems.length;
  $('#exemplaresBiblioteca').textContent = libraryItems.reduce((total, item) => total + item.quantity, 0);
  $('#bibliotecaDisponiveis').textContent = libraryItems.reduce((total, item) => total + item.available, 0);
  $('#estoqueBaixoBiblioteca').textContent = libraryItems.filter(item => item.available <= 1).length;
  $('#bibliotecaVazia').style.display = list.length ? 'none' : 'flex';
  $('#tabelaBiblioteca').style.display = list.length ? 'table' : 'none';
  $('#tabelaBiblioteca tbody').innerHTML = list.map(item => `<tr><td>${escapeHtml(item.code)}</td><td>${escapeHtml(item.title)}</td><td>${escapeHtml(item.author)}</td><td>${escapeHtml(item.category)}</td><td>${item.quantity}</td><td><b class="${item.available <= 1 ? 'estoque-baixo' : ''}">${item.available}</b></td><td>${escapeHtml(item.condition)}</td><td><button class="botao-pequeno alterar-biblioteca" data-id="${item.id}" data-change="-1">Emprestar</button> <button class="botao-pequeno alterar-biblioteca" data-id="${item.id}" data-change="1">Devolver</button></td></tr>`).join('');
  $$('.alterar-biblioteca').forEach(button => button.addEventListener('click', () => changeAvailability(Number(button.dataset.id), Number(button.dataset.change))));
}

function changeAvailability(id, change) {
  const item = libraryItems.find(book => book.id === id);
  if (change < 0 && item.available === 0) return showToast('Não há exemplar disponível.');
  if (change > 0 && item.available === item.quantity) return showToast('Todos os exemplares já estão disponíveis.');
  item.available += change;
  saveData();
  filterLibrary();
  showToast(change < 0 ? 'Empréstimo registrado.' : 'Devolução registrada.');
}

function filterLibrary() {
  const term = $('#pesquisaBiblioteca').value.toLowerCase();
  const category = $('#filtroCategoriaBiblioteca').value;
  renderLibrary(libraryItems.filter(item => `${item.code} ${item.title} ${item.author}`.toLowerCase().includes(term) && (!category || item.category === category)));
}

function renderStudents(list) {
  $('#alunosVazios').style.display = list.length ? 'none' : 'flex';
  $('#tabelaAlunos').style.display = list.length ? 'table' : 'none';
  $('#tabelaAlunos tbody').innerHTML = list.map(student => {
    const total = countOccurrences(student.id);
    return `<tr><td>${escapeHtml(student.name)}</td><td>${escapeHtml(student.className)}</td><td>${total}</td><td><span class="situacao ${total >= 5 ? 'alerta' : ''}">${total >= 5 ? 'Alerta' : 'Regular'}</span></td><td><button class="botao-pequeno adicionar-ocorrencia" data-id="${student.id}">Registrar</button></td></tr>`;
  }).join('');
  $$('.adicionar-ocorrencia').forEach(button => button.addEventListener('click', () => {
    updateStudentOptions();
    $('#alunoOcorrencia').value = button.dataset.id;
    $('#janelaOcorrencia').showModal();
  }));
}

function renderOccurrences() {
  $('#ocorrenciasVazias').style.display = occurrences.length ? 'none' : 'flex';
  $('#tabelaOcorrencias').style.display = occurrences.length ? 'table' : 'none';
  $('#tabelaOcorrencias tbody').innerHTML = occurrences.map(item => {
    const student = students.find(s => s.id === item.studentId);
    return `<tr><td>${item.date}</td><td>${student ? escapeHtml(student.name) : 'Aluno removido'}</td><td>${escapeHtml(item.type)}</td><td>${escapeHtml(item.responsible)}</td><td>${escapeHtml(item.description)}</td></tr>`;
  }).join('');
  $('#recentesVazias').style.display = occurrences.length ? 'none' : 'flex';
  $('#listaRecentes').innerHTML = occurrences.slice(0, 4).map(item => {
    const student = students.find(s => s.id === item.studentId);
    return `<div class="linha-recente"><div><h3>${student ? escapeHtml(student.name) : 'Aluno removido'}</h3><p>${escapeHtml(item.type)} • ${item.date}</p></div></div>`;
  }).join('');
}

function renderMonitoring() {
  const monitorados = students.filter(student => countOccurrences(student.id) > 0).sort((a, b) => countOccurrences(b.id) - countOccurrences(a.id));
  $('#acompanhamentoVazio').style.display = monitorados.length ? 'none' : 'flex';
  $('#listaAcompanhamento').innerHTML = monitorados.slice(0, 5).map(student => {
    const total = countOccurrences(student.id);
    return `<div class="linha-aluno"><div><h3>${escapeHtml(student.name)}</h3><p>${escapeHtml(student.className)} • ${total >= 5 ? 'Direção deve ser notificada' : `Faltam ${5 - total} para o alerta`}</p></div><span class="contador ${total >= 5 ? 'alerta' : ''}">${total}/5</span></div>`;
  }).join('');
}

function renderReport() {
  $('#resumoRelatorio').textContent = students.length ? `${students.length} aluno(s), ${occurrences.length} ocorrência(s) e ${students.filter(s => countOccurrences(s.id) >= 5).length} alerta(s) ativo(s).` : 'Nenhum dado disponível para gerar o relatório.';
  $('#listaRelatorio').innerHTML = students.map(student => `<div class="linha-aluno"><div><h3>${escapeHtml(student.name)}</h3><p>${escapeHtml(student.className)}</p></div><b>${countOccurrences(student.id)} ocorrência(s)</b></div>`).join('');
}

$('#pesquisaAluno').addEventListener('input', event => {
  const term = event.target.value.toLowerCase();
  renderStudents(students.filter(student => `${student.name} ${student.className}`.toLowerCase().includes(term)));
});
$('#pesquisaBiblioteca').addEventListener('input', filterLibrary);
$('#filtroCategoriaBiblioteca').addEventListener('change', filterLibrary);

$('#botaoNotificacao').addEventListener('click', () => showToast($('#totalAlertas').textContent === '0' ? 'Nenhum alerta ativo.' : `${$('#totalAlertas').textContent} aluno(s) atingiram 5 ocorrências.`));
$('#imprimirRelatorio').addEventListener('click', () => window.print());
$('#textoHoje').textContent = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
