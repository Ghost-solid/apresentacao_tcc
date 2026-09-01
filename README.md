# DS Legacy — Biblioteca Escolar

O **DS Legacy** é um sistema de gestão de biblioteca escolar desenvolvido como projeto de TCC. A aplicação centraliza leitores, livros, estoque, empréstimos, devoluções, renovações, reservas e relatórios em um banco **PostgreSQL**, permitindo que os mesmos dados sejam acessados por computadores diferentes.

## Arquitetura

```text
Navegador ──HTTPS──> Servidor Node.js / API ──SSL──> PostgreSQL
```

O navegador nunca recebe a senha ou o endereço do banco. A interface chama a API do servidor, e o servidor executa consultas parametrizadas e transações no PostgreSQL. Para acessar de qualquer lugar, a aplicação e o banco precisam estar hospedados; os usuários acessam somente a URL HTTPS da aplicação.

## Funcionalidades preservadas

### Painel e relatórios

- Indicadores de títulos, leitores, empréstimos e devoluções atrasadas.
- Lista de prazos próximos e leitores bloqueados.
- Relatório de movimentações, advertências e perdas.
- Impressão pelo navegador e área de relatórios restrita ao diretor.

### Leitores

- Cadastro, edição, histórico e ocultação com confirmação por senha.
- Identificadores numéricos automáticos e permanentes, como `0001`; mudanças de tipo, turma ou setor não alteram o ID.
- Turmas e setores predefinidos, com opção personalizada.
- Pesquisa tolerante a acentos, espaços, pontuação e letras maiúsculas.
- Filtros de bloqueio, advertência e necessidade de atenção.

### Livros e estoque

- Cadastro, edição e ocultação segura de livros.
- Identificadores numéricos automáticos e permanentes, no formato `0001`.
- Quantidade total, exemplares disponíveis e livros perdidos.
- Pesquisa geral ou direcionada por ID, título, autor, ISBN, editora, categoria, ano, localização, quantidades e conservação.
- Categorias predefinidas e agrupamento de categorias personalizadas em **Outras categorias**.

### Circulação do acervo

- Empréstimos apenas para leitores liberados e exemplares disponíveis.
- Devolução com estado de conservação, observação, advertência e penalidade por atraso.
- Renovação com histórico de prazos.
- Bloqueio de renovação para empréstimo atrasado, leitor bloqueado ou livro reservado.
- Reserva de títulos indisponíveis, fila de espera e atendimento do primeiro leitor.
- Atualizações de estoque feitas em transações para evitar dois empréstimos do mesmo exemplar.

## Tecnologias

- HTML5, CSS3 e JavaScript no navegador.
- Node.js 20 ou superior e Express 5.
- PostgreSQL e driver `pg`.
- Sessões armazenadas no banco com cookie `HttpOnly`.
- Senhas protegidas com hash bcrypt.
- Helmet, política CSP e limite de tentativas de login.
- Docker e Compose opcionais para implantação.

## Executar localmente

### Demonstração sem instalar PostgreSQL

Para testar neste computador antes de configurar o servidor do trabalho, use o banco PostgreSQL embutido de demonstração:

```powershell
npm.cmd install
npm.cmd run demo
```

Acesse `http://localhost:8000` e entre com:

```text
Usuário: biblioteca
Senha: Biblioteca@123
```

Os dados desse modo ficam somente na pasta local `.demo-data`, ignorada pelo Git. Não use o modo de demonstração para a hospedagem real. O Go Live publica apenas arquivos estáticos e não consegue realizar o login.

### Requisitos

- Node.js 20 ou superior.
- PostgreSQL 14 ou superior.
- Um banco vazio chamado, por exemplo, `ds_legacy`.

### 1. Instalar os pacotes

```bash
npm install
```

### 2. Configurar o ambiente

No PowerShell:

```powershell
Copy-Item .env.example .env
```

No Linux ou macOS:

```bash
cp .env.example .env
```

Edite o `.env` e configure principalmente:

```dotenv
DATABASE_URL=postgresql://usuario:senha@localhost:5432/ds_legacy
DB_SSL=false
LIBRARIAN_PASSWORD=uma-senha-forte
DIRECTOR_PASSWORD=outra-senha-forte
```

O arquivo `.env` contém segredos e está ignorado pelo Git. Ele nunca deve ser enviado ao repositório.

### 3. Preparar as tabelas e contas

```bash
npm run db:init
```

Esse comando aplica [database/schema.sql](database/schema.sql) e cria ou atualiza as contas definidas no `.env`.

### 4. Iniciar

```bash
npm start
```

Acesse `http://localhost:8000`. A porta `8000` também preserva a origem recomendada na versão anterior, permitindo que a migração automática encontre os dados locais. Abrir o `index.html` diretamente permite apenas exportar um backup antigo; o restante do sistema depende da API.

## Usar Docker Compose

O arquivo `compose.yaml` inicia a aplicação e um PostgreSQL persistente. As senhas ficam em um arquivo privado, fora do Git:

```powershell
Copy-Item .env.docker.example .env.docker
notepad .env.docker
docker compose --env-file .env.docker up -d --build
```

Troque todas as senhas do `.env.docker` antes de iniciar. Por padrão, o site responde somente neste computador em `http://localhost:8000`, e a porta do PostgreSQL não é publicada.

### Atalho e inicialização automática no Windows

Para que usuários sem conhecimento técnico não precisem executar comandos, crie os atalhos uma única vez:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/criar-atalhos-windows.ps1
```

O instalador cria:

- **Iniciar DS Legacy** na Área de Trabalho: inicia o Docker Desktop quando necessário, garante que aplicação e PostgreSQL estejam ativos e abre o sistema no navegador;
- **DS Legacy - Inicio automatico** na pasta de inicialização do Windows: prepara o servidor automaticamente quando o responsável entra no computador.

Os comandos são idempotentes e podem ser executados novamente sem duplicar os serviços. O computador precisa permanecer ligado e sem suspensão durante o período de uso.

## Hospedar no computador do trabalho

O computador do trabalho pode hospedar o site e o banco juntos com Docker Compose. Há três modos de acesso:

- no próprio computador, por `http://localhost:8000`;
- em outros computadores da rede local, liberando apenas a porta da aplicação;
- pela internet, usando uma URL HTTPS e um túnel, sem expor o PostgreSQL ou abrir portas no roteador.

O procedimento completo para instalar, proteger, migrar, atualizar e fazer backup está em [docs/IMPLANTACAO_PC_TRABALHO.md](docs/IMPLANTACAO_PC_TRABALHO.md).

## Publicar para acesso de qualquer lugar

1. Crie um PostgreSQL gerenciado ou um PostgreSQL em servidor próprio.
2. Crie um serviço Node usando este repositório ou o `Dockerfile`.
3. Cadastre as variáveis do `.env` no painel secreto do serviço, sem enviar um arquivo `.env`.
4. Use `npm ci` para instalar, `npm run db:init` para preparar o banco e `npm start` para iniciar.
5. Ative HTTPS na URL pública.
6. Configure `DB_SSL=true` quando o provedor do PostgreSQL exigir conexão criptografada.
7. Configure `COOKIE_SECURE=true` para que a sessão seja enviada somente por HTTPS.
8. Verifique `https://seu-dominio/api/health`; a resposta deve indicar banco conectado.

Em produção, o PostgreSQL não deve aceitar conexões públicas indiscriminadas. Permita somente o servidor da aplicação, quando o provedor oferecer controle de rede.

## Migração automática dos dados antigos

A versão anterior gravava dados nestas chaves do navegador:

- `ds_readers`
- `ds_library`
- `ds_loans`
- `ds_reservations`

No primeiro login após a atualização, se o PostgreSQL estiver vazio e a aplicação for aberta na mesma origem anterior — por exemplo, `http://localhost:8000` — ela importa automaticamente leitores, livros, empréstimos, renovações e reservas. A importação acontece somente uma vez e não sobrescreve um banco que já possua dados.

Se o protótipo era aberto diretamente como arquivo ou em outro endereço:

1. Abra a aplicação no endereço antigo.
2. Na tela de entrada, clique em **Exportar dados locais**.
3. Abra a nova aplicação conectada ao PostgreSQL.
4. Clique em **Selecionar backup** e escolha o JSON exportado.
5. Entre com uma conta; o backup será importado se o banco ainda estiver vazio.

Os valores antigos não são apagados automaticamente, servindo como cópia temporária até a migração ser conferida. O arquivo `aliceplinio.sql` é uma fonte histórica MySQL usada somente pelo importador administrativo; a aplicação continua operando exclusivamente no PostgreSQL.

### Importação do acervo MySQL legado

O comando `import:legacy` lê autores, editoras, classificações e livros de `aliceplinio.sql`. Por padrão ele executa uma simulação transacional e não grava alterações. No PowerShell, com os contêineres ativos:

```powershell
$arquivoLegado = (Resolve-Path .\aliceplinio.sql).Path
docker compose --env-file .env.docker run --rm --volume "${arquivoLegado}:/imports/aliceplinio.sql:ro" app npm run import:legacy -- /imports/aliceplinio.sql
```

Depois de conferir o relatório, acrescente `--apply` ao final para confirmar. A tabela `legacy_book_imports` registra cada ID de origem, tornando novas execuções idempotentes. ISBNs inválidos ou associados a títulos conflitantes não são usados para mesclagem.

## Estrutura do banco

| Tabela | Conteúdo |
|---|---|
| `app_users` | Contas, perfis e hashes das senhas |
| `app_sessions` | Sessões autenticadas com prazo de expiração |
| `readers` | Alunos, professores e funcionários |
| `books` | Livros, identificação e estoque |
| `legacy_book_imports` | Auditoria e prevenção de duplicatas da importação legada |
| `loans` | Empréstimos, devoluções, bloqueios, renovações e status persistido |
| `reservations` | Reservas, fila e situação do atendimento |

Leitores e livros ocultados permanecem arquivados no banco com seus dados essenciais, mantendo os históricos concluídos íntegros.

Cada empréstimo possui um `status` entre `ativo`, `atrasado`, `devolvido` e `perdido`. Um trigger sincroniza o campo quando prazo, devolução ou perda são alterados. Como a passagem do tempo não dispara triggers no PostgreSQL, a API também executa `refresh_loan_statuses()` antes das consultas para persistir vencimentos automaticamente.

## Segurança

- A `DATABASE_URL` existe somente no servidor.
- Consultas recebem parâmetros, evitando concatenação de valores do usuário no SQL.
- Senhas não são gravadas em texto puro no banco.
- A sessão usa token aleatório, hash no PostgreSQL e cookie `HttpOnly`, `SameSite=Strict` e `Secure` em produção.
- Exclusões verificam novamente a senha e as dependências no servidor.
- Empréstimos, devoluções, renovações e reservas são revalidados dentro de transações.
- Tentativas repetidas de login são limitadas.

## Backup

O acesso remoto centraliza os dados, mas não substitui backup. Ative backups automáticos no provedor ou execute periodicamente:

```bash
pg_dump "$DATABASE_URL" --format=custom --file=ds_legacy.backup
```

Teste também a restauração em um banco separado antes de depender do backup em produção.

Na instalação Docker do computador do trabalho, use o script pronto:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/backup-docker.ps1
```

## Scripts

| Comando | Ação |
|---|---|
| `npm start` | Inicia o servidor |
| `npm run dev` | Inicia com recarregamento durante o desenvolvimento |
| `npm run demo` | Inicia uma demonstração local sem instalar PostgreSQL |
| `npm run db:init` | Cria tabelas e sincroniza contas administrativas |
| `npm run check` | Verifica a sintaxe dos arquivos JavaScript |
| `npm test` | Executa os testes da API, do banco e das regras de negócio |
| `scripts/backup-docker.ps1` | Cria um backup do PostgreSQL da instalação Docker |

## Estrutura do projeto

```text
Apresentacao_tcc/
├── database/schema.sql       # Esquema PostgreSQL
├── docs/IMPLANTACAO_PC_TRABALHO.md # Guia do servidor Windows
├── scripts/backup-docker.ps1 # Backup do PostgreSQL em Docker
├── scripts/init-db.js        # Inicialização do banco e das contas
├── src/database.js           # Pool de conexão e transações
├── src/library-service.js    # Regras de negócio no servidor
├── server.js                 # API, autenticação e arquivos da interface
├── index.html                # Estrutura da interface
├── interacao.js              # Interações e consumo da API
├── estilo.css                # Estilos gerais
├── apresentacao.css          # Identidade visual
├── biblioteca.css            # Estilos do acervo
├── Dockerfile                # Imagem da aplicação
├── compose.yaml              # Aplicação e PostgreSQL local
├── .env.example              # Modelo de configuração
├── .env.docker.example       # Modelo do servidor Docker
└── README.md                 # Documentação
```
