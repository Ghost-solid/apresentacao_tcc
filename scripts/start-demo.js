process.env.DEMO_MODE = 'true';
process.env.NODE_ENV = 'development';
process.env.COOKIE_SECURE = 'false';
process.env.LIBRARIAN_USERNAME = 'biblioteca';
process.env.LIBRARIAN_PASSWORD = 'Biblioteca@123';
process.env.LIBRARIAN_NAME = 'Usuário de demonstração';
process.env.DIRECTOR_USERNAME = 'diretor';
process.env.DIRECTOR_PASSWORD = 'Diretor@123';
process.env.DIRECTOR_NAME = 'Direção de demonstração';

const { start } = require('../server');

start().catch(error => {
  console.error(`Falha ao iniciar demonstração: ${error.message}`);
  process.exit(1);
});
