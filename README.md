# DS Legacy — Biblioteca Escolar

O **DS Legacy** é um protótipo de sistema para gerenciamento de biblioteca escolar, desenvolvido como projeto de TCC. A aplicação permite controlar leitores, livros, empréstimos, devoluções, renovações, reservas e relatórios por meio de uma interface responsiva executada diretamente no navegador.

## Funcionalidades

### Painel

- Resumo da quantidade de títulos, leitores e empréstimos ativos.
- Indicadores de devoluções atrasadas.
- Lista de devoluções próximas.
- Identificação rápida de leitores bloqueados.
- Notificações sobre atrasos.

### Leitores

- Cadastro e edição de alunos, professores e funcionários sem perder o histórico.
- Geração automática de identificadores conforme o tipo: `ALU-0001`, `PROF-0001`, `FUNC-0001` ou `LEI-0001`.
- Campos opcionais para facilitar o cadastro.
- Seleção predefinida de turmas do ensino fundamental, ensino médio e setores da escola, com opção personalizada.
- Exclusão de leitores mediante confirmação com a senha da conta conectada.
- Pesquisa por nome, ID, tipo, turma, situação ou quantidade de advertências.
- Filtros para leitores bloqueados, advertidos, sem restrições ou que requerem atenção.
- Histórico individual de empréstimos, atrasos, advertências e renovações.
- Bloqueio automático quando existe devolução atrasada ou penalidade ativa.

### Livros e estoque

- Cadastro e edição de livros.
- Exclusão de livros mediante confirmação com a senha da conta conectada.
- Geração automática de identificadores no formato `LIV-0001`.
- Controle da quantidade total e dos exemplares disponíveis.
- Registro de exemplares perdidos.
- Categorias predefinidas e possibilidade de cadastrar outras categorias.
- Filtro que agrupa automaticamente todas as categorias personalizadas em **Outras categorias**.
- Pesquisa por qualquer informação do livro, incluindo título, autor, ID, ISBN, editora, categoria, ano, localização e estado de conservação.

### Empréstimos e devoluções

- Empréstimo apenas de exemplares disponíveis.
- Definição automática da data inicial e sugestão de prazo de sete dias.
- Validação para impedir empréstimos a leitores bloqueados.
- Registro da condição do livro durante a devolução.
- Advertência quando o livro é devolvido em condição diferente de **Bom**.
- Registro de livro perdido sem devolver o exemplar ao estoque disponível.
- Penalidade de um mês quando a devolução ocorre com atraso.

### Renovações

- Renovação com registro do prazo anterior e do novo prazo.
- Impedimento de renovação para empréstimos atrasados.
- Impedimento de renovação para leitores bloqueados.
- Impedimento de renovação quando o livro possui uma reserva ativa.

### Reservas

- Reserva de títulos sem exemplares disponíveis e com empréstimo ativo.
- Organização automática da fila por ordem de solicitação.
- Uma reserva ativa por leitor para cada título.
- Cancelamento de reservas.
- Indicação quando o livro está disponível para o primeiro leitor da fila.
- Atendimento automático da reserva quando o empréstimo é registrado para o primeiro leitor.

### Relatórios

- Resumo de títulos, leitores, empréstimos, atrasos, bloqueios, advertências e perdas.
- Impressão do relatório pelo navegador.
- Área disponível somente para o perfil de diretor.

## Tecnologias utilizadas

- HTML5
- CSS3
- JavaScript puro
- API `localStorage` do navegador

O projeto não utiliza framework, gerenciador de pacotes ou etapa de compilação.

## Como executar

### Opção 1: abrir diretamente

Abra o arquivo `index.html` em um navegador moderno.

### Opção 2: servidor local

Na pasta do projeto, execute:

```bash
python -m http.server 8000
```

Depois acesse:

```text
http://localhost:8000/index.html
```

Usar um servidor local é recomendado porque mantém uma origem estável para os dados do `localStorage`.

## Contas de demonstração

| Perfil | Usuário | Senha |
|---|---|---|
| Biblioteca | `testebiblioteca` | `Biblioteca@123` |
| Diretor | `testediretor` | `Diretor@123` |

Essas contas existem apenas para apresentação do protótipo. Em uma aplicação de produção, autenticação, usuários e senhas devem ser processados com segurança no servidor.

## Armazenamento dos dados

Os dados são salvos localmente no navegador nas seguintes chaves:

| Chave | Conteúdo |
|---|---|
| `ds_readers` | Leitores cadastrados |
| `ds_library` | Livros e estoque |
| `ds_loans` | Empréstimos e devoluções |
| `ds_reservations` | Reservas e filas de espera |

Por utilizar `localStorage`:

- os dados permanecem após atualizar ou fechar a página;
- cada navegador e endereço possui seu próprio conjunto de dados;
- os dados não são compartilhados entre computadores;
- limpar os dados do navegador remove os registros da aplicação.

### Limpar todos os dados

Abra as ferramentas do desenvolvedor do navegador (`F12`), acesse a aba **Console** e execute:

```javascript
localStorage.clear();
location.reload();
```

## Regras importantes

- IDs de leitores e livros são gerados automaticamente e não precisam ser digitados.
- Pesquisas ignoram diferenças de acentuação, letras maiúsculas, espaços e pontuação.
- Um livro com reserva ativa não pode ser renovado.
- Uma reserva cancelada ou atendida deixa de bloquear a renovação.
- Um leitor bloqueado não pode realizar novos empréstimos.
- Alterações no estoque respeitam exemplares emprestados ou registrados como perdidos.

## Estrutura do projeto

```text
Apresentacao_tcc/
├── index.html          # Estrutura das páginas, tabelas e formulários
├── interacao.js        # Regras de negócio, filtros e persistência local
├── estilo.css          # Estilos gerais da aplicação
├── apresentacao.css    # Identidade visual e apresentação
├── biblioteca.css      # Estilos das funcionalidades da biblioteca
├── aliceplinio.sql     # Dump de banco de dados usado como referência
├── images/             # Imagens utilizadas pela interface
└── README.md           # Documentação do projeto
```

## Banco de dados

O arquivo `aliceplinio.sql` contém uma estrutura e dados de referência em MySQL, incluindo tabelas de alunos, livros e empréstimos. Nesta versão do protótipo, a interface não está conectada ao banco: os dados utilizados pela aplicação são armazenados exclusivamente no `localStorage`.

Para uma versão com múltiplos usuários, será necessário criar uma API no servidor e integrar a interface ao banco de dados.

## Limitações atuais

- Autenticação demonstrativa implementada no JavaScript do navegador.
- Dados armazenados apenas no dispositivo local.
- Ausência de sincronização entre usuários ou computadores.
- Ausência de API e integração ativa com o arquivo SQL.
- Ausência de controle de permissões no servidor.
- Ausência de backup automático dos registros.

## Próximas melhorias sugeridas

- Criar um backend com autenticação segura.
- Integrar a aplicação ao banco de dados MySQL.
- Adicionar exportação de relatórios em PDF ou planilha.
- Implementar backup e restauração dos dados.
- Adicionar testes automatizados permanentes.
- Registrar auditoria das operações realizadas pelos usuários.
