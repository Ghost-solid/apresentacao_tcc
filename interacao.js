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
  $('#toast').textContent = message;
  $('#toast').classList.add('show');
  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 2500);
}

$('#showPassword').addEventListener('click', () => {
  $('#senha').type = $('#senha').type === 'password' ? 'text' : 'password';
});

$('#loginForm').addEventListener('submit', event => {
  event.preventDefault();
  const username = $('#usuario').value.trim().toLowerCase();
  const user = users[username];
  if (!user || user.password !== $('#senha').value) {
    $('#loginError').textContent = 'Usuário ou senha incorretos.';
    return;
  }
  currentUser = { ...user, username };
  $('#loginError').textContent = '';
  $('#loginPage').classList.add('hidden');
  $('#system').classList.remove('hidden');
  $('#userName').textContent = user.name;
  $('#userRole').textContent = user.role;
  $('#userInitial').textContent = user.role.charAt(0);
  $('#roleWelcome').textContent = `ÁREA DO ${user.role.toUpperCase()}`;
  $$('.director-only').forEach(item => item.classList.toggle('hidden', user.role !== 'Diretor'));
  renderAll();
});

$('#logoutButton').addEventListener('click', () => {
  currentUser = null;
  $('#system').classList.add('hidden');
  $('#loginPage').classList.remove('hidden');
  $('#loginForm').reset();
});

const pageNames = { dashboard: 'Painel principal', alunos: 'Alunos', ocorrencias: 'Ocorrências', biblioteca: 'Biblioteca', relatorios: 'Relatórios' };
function openPage(pageId) {
  $$('.page').forEach(page => page.classList.remove('active'));
  $$('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.page === pageId));
  $(`#${pageId}`).classList.add('active');
  $('#pageTitle').textContent = pageNames[pageId];
  $('#sidebar').classList.remove('open');
}

$$('.nav-item').forEach(item => item.addEventListener('click', () => openPage(item.dataset.page)));
$$('[data-go]').forEach(item => item.addEventListener('click', () => openPage(item.dataset.go)));
$('#menuMobile').addEventListener('click', () => $('#sidebar').classList.toggle('open'));

$('#openStudent').addEventListener('click', () => $('#studentDialog').showModal());
$('#openLibraryItem').addEventListener('click', () => $('#libraryDialog').showModal());
$$('.open-occurrence').forEach(button => button.addEventListener('click', () => {
  if (!students.length) return showToast('Cadastre um aluno primeiro.');
  updateStudentOptions();
  $('#occurrenceDialog').showModal();
}));

$('#saveStudent').addEventListener('click', event => {
  event.preventDefault();
  if (!$('#studentForm').reportValidity()) return;
  students.push({ id: Date.now(), name: $('#studentName').value.trim(), className: $('#studentClass').value.trim() });
  saveData();
  $('#studentForm').reset();
  $('#studentDialog').close();
  renderAll();
  showToast('Aluno cadastrado com sucesso.');
});

$('#saveOccurrence').addEventListener('click', event => {
  event.preventDefault();
  if (!$('#occurrenceForm').reportValidity()) return;
  const studentId = Number($('#occurrenceStudent').value);
  occurrences.unshift({ id: Date.now(), studentId, type: $('#occurrenceType').value, description: $('#occurrenceDescription').value.trim(), date: new Date().toLocaleDateString('pt-BR'), responsible: currentUser.name });
  saveData();
  $('#occurrenceForm').reset();
  $('#occurrenceDialog').close();
  renderAll();
  const total = countOccurrences(studentId);
  showToast(total === 5 ? 'ALERTA: o aluno atingiu 5 ocorrências!' : 'Ocorrência registrada.');
});

$('#saveLibraryItem').addEventListener('click', event => {
  event.preventDefault();
  if (!$('#libraryForm').reportValidity()) return;
  const quantity = Number($('#bookQuantity').value);
  const available = Number($('#bookAvailable').value);
  if (available > quantity) return showToast('A quantidade disponível não pode ser maior que o total.');
  const code = $('#bookCode').value.trim();
  if (libraryItems.some(item => item.code.toLowerCase() === code.toLowerCase())) return showToast('Já existe um item com esse código.');
  libraryItems.push({ id: Date.now(), code, title: $('#bookTitle').value.trim(), author: $('#bookAuthor').value.trim(), category: $('#bookCategory').value, quantity, available, condition: $('#bookCondition').value });
  saveData();
  $('#libraryForm').reset();
  $('#bookQuantity').value = 1;
  $('#bookAvailable').value = 1;
  $('#libraryDialog').close();
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
  $('#occurrenceStudent').innerHTML = '<option value="">Selecione um aluno</option>' + students.map(student => `<option value="${student.id}">${escapeHtml(student.name)} - ${escapeHtml(student.className)}</option>`).join('');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function renderAll() {
  const alerts = students.filter(student => countOccurrences(student.id) >= 5);
  $('#studentTotal').textContent = students.length;
  $('#occurrenceTotal').textContent = occurrences.length;
  $('#alertTotal').textContent = alerts.length;
  $('#noticeCount').textContent = alerts.length;
  $('#monthTotal').textContent = occurrences.length;
  renderStudents(students);
  renderOccurrences();
  renderMonitoring();
  renderReport();
  renderLibrary();
}

function renderLibrary(list = libraryItems) {
  $('#libraryTitles').textContent = libraryItems.length;
  $('#libraryCopies').textContent = libraryItems.reduce((total, item) => total + item.quantity, 0);
  $('#libraryAvailable').textContent = libraryItems.reduce((total, item) => total + item.available, 0);
  $('#libraryLow').textContent = libraryItems.filter(item => item.available <= 1).length;
  $('#libraryEmpty').style.display = list.length ? 'none' : 'flex';
  $('#libraryTable').style.display = list.length ? 'table' : 'none';
  $('#libraryTable tbody').innerHTML = list.map(item => `<tr><td>${escapeHtml(item.code)}</td><td>${escapeHtml(item.title)}</td><td>${escapeHtml(item.author)}</td><td>${escapeHtml(item.category)}</td><td>${item.quantity}</td><td><b class="${item.available <= 1 ? 'low-stock' : ''}">${item.available}</b></td><td>${escapeHtml(item.condition)}</td><td><button class="small-button library-change" data-id="${item.id}" data-change="-1">Emprestar</button> <button class="small-button library-change" data-id="${item.id}" data-change="1">Devolver</button></td></tr>`).join('');
  $$('.library-change').forEach(button => button.addEventListener('click', () => changeAvailability(Number(button.dataset.id), Number(button.dataset.change))));
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
  const term = $('#librarySearch').value.toLowerCase();
  const category = $('#libraryCategoryFilter').value;
  renderLibrary(libraryItems.filter(item => `${item.code} ${item.title} ${item.author}`.toLowerCase().includes(term) && (!category || item.category === category)));
}

function renderStudents(list) {
  $('#studentsEmpty').style.display = list.length ? 'none' : 'flex';
  $('#studentsTable').style.display = list.length ? 'table' : 'none';
  $('#studentsTable tbody').innerHTML = list.map(student => {
    const total = countOccurrences(student.id);
    return `<tr><td>${escapeHtml(student.name)}</td><td>${escapeHtml(student.className)}</td><td>${total}</td><td><span class="status ${total >= 5 ? 'alert' : ''}">${total >= 5 ? 'Alerta' : 'Regular'}</span></td><td><button class="small-button add-occurrence" data-id="${student.id}">Registrar</button></td></tr>`;
  }).join('');
  $$('.add-occurrence').forEach(button => button.addEventListener('click', () => {
    updateStudentOptions();
    $('#occurrenceStudent').value = button.dataset.id;
    $('#occurrenceDialog').showModal();
  }));
}

function renderOccurrences() {
  $('#occurrencesEmpty').style.display = occurrences.length ? 'none' : 'flex';
  $('#occurrencesTable').style.display = occurrences.length ? 'table' : 'none';
  $('#occurrencesTable tbody').innerHTML = occurrences.map(item => {
    const student = students.find(s => s.id === item.studentId);
    return `<tr><td>${item.date}</td><td>${student ? escapeHtml(student.name) : 'Aluno removido'}</td><td>${escapeHtml(item.type)}</td><td>${escapeHtml(item.responsible)}</td><td>${escapeHtml(item.description)}</td></tr>`;
  }).join('');
  $('#recentEmpty').style.display = occurrences.length ? 'none' : 'flex';
  $('#recentList').innerHTML = occurrences.slice(0, 4).map(item => {
    const student = students.find(s => s.id === item.studentId);
    return `<div class="recent-row"><div><h3>${student ? escapeHtml(student.name) : 'Aluno removido'}</h3><p>${escapeHtml(item.type)} • ${item.date}</p></div></div>`;
  }).join('');
}

function renderMonitoring() {
  const monitored = students.filter(student => countOccurrences(student.id) > 0).sort((a, b) => countOccurrences(b.id) - countOccurrences(a.id));
  $('#monitoringEmpty').style.display = monitored.length ? 'none' : 'flex';
  $('#monitoringList').innerHTML = monitored.slice(0, 5).map(student => {
    const total = countOccurrences(student.id);
    return `<div class="student-row"><div><h3>${escapeHtml(student.name)}</h3><p>${escapeHtml(student.className)} • ${total >= 5 ? 'Direção deve ser notificada' : `Faltam ${5 - total} para o alerta`}</p></div><span class="counter ${total >= 5 ? 'alert' : ''}">${total}/5</span></div>`;
  }).join('');
}

function renderReport() {
  $('#reportSummary').textContent = students.length ? `${students.length} aluno(s), ${occurrences.length} ocorrência(s) e ${students.filter(s => countOccurrences(s.id) >= 5).length} alerta(s) ativo(s).` : 'Nenhum dado disponível para gerar o relatório.';
  $('#reportList').innerHTML = students.map(student => `<div class="student-row"><div><h3>${escapeHtml(student.name)}</h3><p>${escapeHtml(student.className)}</p></div><b>${countOccurrences(student.id)} ocorrência(s)</b></div>`).join('');
}

$('#studentSearch').addEventListener('input', event => {
  const term = event.target.value.toLowerCase();
  renderStudents(students.filter(student => `${student.name} ${student.className}`.toLowerCase().includes(term)));
});
$('#librarySearch').addEventListener('input', filterLibrary);
$('#libraryCategoryFilter').addEventListener('change', filterLibrary);

$('#noticeButton').addEventListener('click', () => showToast($('#alertTotal').textContent === '0' ? 'Nenhum alerta ativo.' : `${$('#alertTotal').textContent} aluno(s) atingiram 5 ocorrências.`));
$('#printReport').addEventListener('click', () => window.print());
$('#todayText').textContent = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
