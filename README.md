# DS Legacy — Biblioteca Escolar

Sistema de gestão de biblioteca escolar desenvolvido para o TCC. Ele reúne leitores, estoque, empréstimos, devoluções, reservas, relatórios e histórico de ações em um banco PostgreSQL.

```text
Navegador → Servidor Node.js / API → PostgreSQL
```

O navegador acessa somente a aplicação. Senhas e acesso ao banco ficam protegidos no servidor.

## O que o sistema faz

- Cadastro e edição de leitores, turmas e setores.
- Cadastro, pesquisa e controle do estoque de livros.
- Empréstimos, devoluções, renovações e reservas.
- Bloqueio automático por atraso e controle de advertências.
- IDs numéricos gerados automaticamente para leitores e livros.
- Criação de contas, login seguro e registro automático de ações pelo usuário conectado.
- Relatórios e histórico de ações para o perfil Diretor.

## Início rápido

### Testar sem PostgreSQL

Use o modo de demonstração no computador de desenvolvimento:

```powershell
npm.cmd install
npm.cmd run demo
```

Abra `http://localhost:8000`.

```text
Usuário: biblioteca
Senha: Biblioteca@123
```

Os dados ficam apenas em `.demo-data`. Esse modo não deve ser usado para hospedar o sistema real.

> O Go Live não funciona com este projeto, pois ele não executa a API nem o banco de dados.

### Usar PostgreSQL

Você precisa de Node.js 20+, PostgreSQL 14+ e um banco vazio.

1. Instale as dependências:

   ```powershell
   npm.cmd install
   ```

2. Crie o arquivo de configuração:

   ```powershell
   Copy-Item .env.example .env
   ```

3. No `.env`, informe principalmente:

   ```dotenv
   DATABASE_URL=postgresql://usuario:senha@localhost:5432/ds_legacy
   DB_SSL=false
   LIBRARIAN_PASSWORD=uma-senha-forte
   DIRECTOR_PASSWORD=outra-senha-forte
   ```

4. Crie as tabelas e contas iniciais:

   ```powershell
   npm.cmd run db:init
   ```

5. Inicie a aplicação:

   ```powershell
   npm.cmd start
   ```

Depois, acesse `http://localhost:8000`.

## Contas e permissões

Na tela de login, use **Criar uma conta** para cadastrar nome, e-mail e senha. A senha precisa ter ao menos 8 caracteres, incluindo letra maiúscula, minúscula e número.

Contas criadas pela tela recebem o perfil **Biblioteca**, que permite operar o sistema. O perfil **Diretor** é configurado pelo `.env` e libera relatórios e histórico de ações.

Todas as ações são registradas automaticamente com a conta conectada. O nome do responsável não é digitado manualmente.

## Hospedagem no computador do trabalho

Para instalar a aplicação e o PostgreSQL juntos com Docker:

```powershell
Copy-Item .env.docker.example .env.docker
notepad .env.docker
docker compose --env-file .env.docker up -d --build
```

Troque as senhas do `.env.docker` antes de iniciar. O passo a passo completo de instalação, atualização, rede e recuperação está em [Implantação no PC de trabalho](docs/IMPLANTACAO_PC_TRABALHO.md).

## Migrar dados antigos

Se a versão anterior guardava dados no navegador, abra a aplicação antiga e use **Exportar dados locais**. Na nova instalação, selecione o arquivo pelo botão **Selecionar backup** na tela de login.

Para importar o acervo MySQL histórico, consulte o arquivo `database/legacy/aliceplinio.sql` e execute:

```powershell
npm.cmd run import:legacy
```

Por padrão, a importação é uma simulação. Use `--apply` somente depois de conferir o relatório.

## Comandos úteis

| Comando | Ação |
|---|---|
| `npm.cmd start` | Inicia a aplicação |
| `npm.cmd run dev` | Inicia com recarregamento automático |
| `npm.cmd run demo` | Inicia a demonstração local |
| `npm.cmd run db:init` | Cria ou atualiza as tabelas e contas do `.env` |
| `npm.cmd run check` | Verifica a sintaxe dos arquivos JavaScript |
| `npm.cmd test` | Executa os testes automatizados |
| `powershell -ExecutionPolicy Bypass -File scripts/backup-docker.ps1` | Cria backup da instalação Docker |

## Estrutura do projeto

```text
apresentacao_tcc/
├── database/  # esquema PostgreSQL e importação legada
├── docs/      # guias de implantação e backup
├── public/    # interface do navegador
├── scripts/   # inicialização, importação e backup
├── src/       # banco de dados e regras de negócio
├── test/      # testes automatizados
└── server.js  # API e servidor web
```

## Segurança e backup

- Senhas são guardadas com hash bcrypt, nunca em texto puro.
- Sessões usam cookies `HttpOnly` e são registradas no PostgreSQL.
- A API valida permissões, dados e disponibilidade dos livros antes de gravar.
- Login e criação de contas possuem limite de tentativas.
- Em produção, use HTTPS, `DB_SSL=true` quando necessário e `COOKIE_SECURE=true`.

Faça backups regularmente. Para a instalação Docker, veja [Backup completo](docs/BACKUP_COMPLETO.md).
