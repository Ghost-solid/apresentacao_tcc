const { initializeDatabase, pool } = require('../src/database');

initializeDatabase()
  .then(() => console.log('Banco PostgreSQL preparado e contas administrativas sincronizadas.'))
  .catch(error => {
    console.error(`Falha ao preparar o banco: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
