# Backup automatico completo

O servico `backup` do Docker Compose usa `pg_dump` em formato customizado do PostgreSQL 17. Inclui todas as tabelas do banco: cadastros ativos e arquivados, movimentacoes, contas (com hashes de senha), sessoes, auditoria da importacao, indices, sequencias e funcoes. Nao inclui arquivos do projeto, configuracao `.env.docker` nem papeis globais do PostgreSQL.

## Funcionamento

Inicie ou atualize o servico na pasta do projeto:

```powershell
docker compose --env-file .env.docker up -d backup
```

Uma copia e feita ao iniciar e depois a cada 24 horas enquanto Docker e o computador estiverem ligados. Ao reiniciar, uma nova copia e criada. Por padrao sao mantidas as 14 ultimas copias bem-sucedidas, em `backups/automatic` no computador, fora do volume do banco. Reinicializacoes frequentes tambem contam para essa retencao.

Configure no `.env.docker`, se necessario:

```dotenv
BACKUP_INTERVAL_SECONDS=86400
BACKUP_KEEP=14
```

O intervalo minimo e 60 segundos e a retencao minima e 1 copia. Apos alterar, execute o comando de inicializacao novamente. O servico verifica o indice do arquivo antes de publicar a copia e so remove backups antigos apos sucesso. Falhas sao registradas e uma nova tentativa ocorre em 60 segundos. O estado de saude detecta backups vencidos; nao envia notificacoes externas.

```powershell
docker compose --env-file .env.docker logs --tail 30 backup
docker compose --env-file .env.docker ps
```

Esses arquivos incluem dados pessoais e hashes de senha. Guarde-os com acesso restrito e mantenha outra copia em disco externo ou armazenamento protegido: uma copia no mesmo computador nao protege contra perda desse computador. A pasta automatica esta ignorada pelo Git e pelo build Docker.

## Testar uma restauracao sem alterar o sistema

O comando abaixo escolhe o backup automatico mais recente, cria um PostgreSQL temporario sem rede nem portas publicadas, restaura o arquivo e consulta as tabelas, incluindo contagens de registros arquivados. O container e seu volume temporario sao removidos ao final, inclusive em caso de erro. O banco original nao e utilizado pelo teste.

```powershell
powershell -ExecutionPolicy Bypass -File scripts/test-restore-docker.ps1
```

Para conferir uma copia especifica:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/test-restore-docker.ps1 -BackupFile "C:\Backups\copia.backup"
```

Repita periodicamente e antes de depender de uma copia para recuperacao. A verificacao de indice automatica nao substitui este teste de restauracao real.

## Recuperar em outra instalacao

O arquivo `.backup` e completo e nao deve ser selecionado na tela de login. O botao da interface continua gerando JSON para a importacao simplificada.

Em uma instalacao Docker nova, configure o `.env.docker` com as credenciais de destino. Inicie somente o banco, copie o arquivo e restaure no banco vazio ANTES de iniciar a aplicacao:

```powershell
docker compose --env-file .env.docker up -d postgres
docker compose --env-file .env.docker cp "C:\Backups\copia.backup" postgres:/tmp/restore.backup
docker compose --env-file .env.docker exec -T postgres pg_restore -U ds_legacy -d ds_legacy --no-owner --no-privileges --exit-on-error --single-transaction /tmp/restore.backup
docker compose --env-file .env.docker up -d app backup
```

Substitua `ds_legacy` nos argumentos `-U` e `-d` pelo usuario e banco configurados no destino. Espere o PostgreSQL ficar saudavel antes de restaurar. So inicie a aplicacao se a restauracao terminar sem erro. Os comandos nao apagam tabelas existentes; use um banco vazio. Na inicializacao, as contas administrativas sao sincronizadas com as credenciais do `.env.docker` do destino. Sessoes antigas estao no backup; mantenha a instalacao de recuperacao isolada ate revisar o acesso.
