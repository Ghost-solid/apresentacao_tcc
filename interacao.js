const sidebar = document.querySelector('#sidebar');
const mobileMenu = document.querySelector('#mobileMenu');
const toast = document.querySelector('#toast');

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}

mobileMenu.addEventListener('click', () => {
  const isOpen = sidebar.classList.toggle('open');
  mobileMenu.setAttribute('aria-expanded', String(isOpen));
});

document.querySelectorAll('.menu-item').forEach(item => {
  item.addEventListener('click', event => {
    document.querySelectorAll('.menu-item').forEach(link => link.classList.remove('active'));
    item.classList.add('active');
    sidebar.classList.remove('open');
    mobileMenu.setAttribute('aria-expanded', 'false');
    if (item.dataset.section !== 'inicio') {
      event.preventDefault();
      showToast(`${item.textContent.trim().replace(/\d+/g, '')}: área em desenvolvimento.`);
    }
  });
});

document.querySelector('#searchInput').addEventListener('input', event => {
  const term = event.target.value.toLowerCase().trim();
  const lessons = [...document.querySelectorAll('.lesson')];
  lessons.forEach(lesson => lesson.hidden = !lesson.dataset.title.includes(term));
  document.querySelector('#emptyState').style.display = lessons.every(lesson => lesson.hidden) ? 'block' : 'none';
});

document.querySelectorAll('.play, .primary-button').forEach(button => {
  button.addEventListener('click', () => showToast('Aula carregada! Bons estudos 🚀'));
});

document.querySelector('#notificationButton').addEventListener('click', event => {
  event.currentTarget.querySelector('span').style.display = 'none';
  showToast('Você tem 3 atividades próximas do prazo.');
});

document.querySelector('#helpButton').addEventListener('click', () => showToast('Suporte DS Legacy disponível de segunda a sexta.'));
document.querySelector('#calendarButton').addEventListener('click', () => showToast('Calendário acadêmico aberto.'));

document.addEventListener('click', event => {
  if (window.innerWidth <= 760 && sidebar.classList.contains('open') && !sidebar.contains(event.target) && !mobileMenu.contains(event.target)) {
    sidebar.classList.remove('open');
    mobileMenu.setAttribute('aria-expanded', 'false');
  }
});
