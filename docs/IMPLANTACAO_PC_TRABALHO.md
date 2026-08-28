# Implantação no computador do trabalho

Este é o roteiro recomendado para transformar o computador do trabalho no servidor do DS Legacy. A aplicação e o PostgreSQL ficam nesse mesmo computador, em contêineres separados. O banco não publica nenhuma porta; somente o site pode ser acessado.

```text
Internet ou rede local
        │
        ▼
Site DS Legacy :8000
        │ rede interna do Docker
        ▼
PostgreSQL (sem porta pública)
```

## 1. Preparar o computador

Instale no computador que ficará ligado:

- Git, caso o projeto seja obtido pelo repositório;
- Docker Desktop com Docker Compose;
- as atualizações do Windows.

No Docker Desktop, habilite a inicialização automática ao entrar no Windows. Também desative a suspensão automática do computador durante o período em que o sistema precisar estar disponível. Os contêineres têm `restart: unless-stopped`, então voltam após reinicializações, desde que o Docker Desktop seja iniciado.

## 2. Levar e configurar o projeto

Abra o PowerShell na pasta `Apresentacao_tcc` e crie o arquivo privado de configuração:

```powershell
Copy-Item .env.docker.example .env.docker
notepad .env.docker
```

Troque obrigatoriamente as três senhas. Cada senha deve ser longa, única e diferente das demais:

- `POSTGRES_PASSWORD` protege o banco;
- `LIBRARIAN_PASSWORD` é a senha da conta da biblioteca;
- `DIRECTOR_PASSWORD` é a senha da direção.

O arquivo `.env.docker` está ignorado pelo Git. Não o envie ao repositório, por mensagem ou por e-mail.

## 3. Iniciar pela primeira vez

```powershell
docker compose --env-file .env.docker up -d --build
docker compose --env-file .env.docker ps
```

Na primeira execução, o sistema cria automaticamente as tabelas e as contas administrativas. Abra:

```text
http://localhost:8000
http://localhost:8000/api/health
```

A verificação de saúde deve responder com `"ok": true`. Para examinar qualquer problema:

```powershell
docker compose --env-file .env.docker logs --tail 100 app postgres
```

## 4. Escolher como acessar

### Somente no computador da apresentação

Mantenha no `.env.docker`:

```dotenv
APP_BIND_ADDRESS=127.0.0.1
COOKIE_SECURE=false
```

Use `http://localhost:8000`. É a opção mais simples para apresentar sem depender da rede externa.

### Outros computadores na rede local

Use apenas em uma rede confiável. Altere:

```dotenv
APP_BIND_ADDRESS=0.0.0.0
COOKIE_SECURE=false
```

Recrie somente o serviço da aplicação:

```powershell
docker compose --env-file .env.docker up -d --force-recreate app
ipconfig
```

Crie no Firewall do Windows uma regra de entrada para TCP `8000`, somente no perfil **Privado**. Nos demais computadores, acesse `http://IP-DO-COMPUTADOR:8000`. Não encaminhe a porta 8000 no roteador.

### Acesso externo com HTTPS

A opção recomendada para este computador é um Cloudflare Tunnel. Ele cria uma conexão de saída entre o computador e a Cloudflare, então não é necessário abrir portas no roteador. É necessário ter um domínio ativo na Cloudflare.

1. Crie um túnel no painel Cloudflare Zero Trust.
2. Instale o conector como serviço do Windows usando o comando e o token apresentados pelo painel.
3. Crie um hostname público, como `biblioteca.seudominio.com`.
4. Aponte o serviço do hostname para `http://localhost:8000`.
5. No `.env.docker`, use:

```dotenv
APP_BIND_ADDRESS=127.0.0.1
COOKIE_SECURE=true
```

6. Recrie a aplicação:

```powershell
docker compose --env-file .env.docker up -d --force-recreate app
```

7. Teste `https://biblioteca.seudominio.com/api/health` e faça login pela URL HTTPS.

Nunca publique a porta `5432` do PostgreSQL. O token do túnel e as senhas também não devem ser salvos no repositório.

> Com `COOKIE_SECURE=true`, faça login pela URL HTTPS. O navegador não envia esse cookie em `http://localhost`.

## 5. Migrar os dados antigos

Se o navegador usado anteriormente ainda contém os cadastros:

1. abra a versão antiga na origem em que ela era utilizada;
2. na tela de login, clique em **Exportar dados locais**;
3. abra a nova versão hospedada;
4. clique em **Selecionar backup** e escolha o JSON exportado;
5. faça login para concluir a importação.

A importação só é aceita quando o banco ainda está vazio, evitando duplicação acidental.

## 6. Fazer backup

Execute regularmente no PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/backup-docker.ps1
```

O arquivo será criado em `backups` com data e hora. Copie esses backups para outro dispositivo ou armazenamento protegido; um backup guardado apenas no mesmo computador não protege contra defeito ou perda da máquina.

Antes de restaurar, pare o uso do sistema e preserve uma cópia do banco atual. A restauração substitui dados e deve ser testada primeiro em outro banco.

## 7. Atualizar o sistema

Depois de conferir que existe um backup recente:

```powershell
git pull
docker compose --env-file .env.docker up -d --build
docker compose --env-file .env.docker ps
```

O volume `ds_legacy_postgres` preserva os dados quando a imagem ou o contêiner é atualizado. Não use `docker compose down -v`, pois a opção `-v` remove o volume do banco.

## 8. Checklist antes da apresentação

- O computador está ligado à energia e a suspensão está desativada.
- Docker Desktop, `app` e `postgres` estão em execução.
- `/api/health` responde com `"ok": true`.
- As contas de biblioteca e direção entram corretamente.
- Livros, leitores, empréstimos e reservas estão visíveis.
- Existe um backup recente fora desse computador.
- Se o acesso for externo, o serviço do túnel está iniciado e a URL HTTPS funciona.
- Há um plano alternativo com `http://localhost:8000` caso a internet falhe.

## Documentação oficial útil

- [Instalar Docker Desktop no Windows](https://docs.docker.com/desktop/setup/install/windows-install/)
- [Configurar um Cloudflare Tunnel](https://developers.cloudflare.com/tunnel/setup/)
- [Executar o conector do túnel como serviço do Windows](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/local-management/as-a-service/windows/)
- [Ordem de inicialização e verificação de saúde no Docker Compose](https://docs.docker.com/compose/how-tos/startup-order/)
- [Backup PostgreSQL com pg_dump](https://www.postgresql.org/docs/17/app-pgdump.html)
