import { appState } from './estado.js';
import { $ } from './utilitarios.js';
import { tratarErroOperacao } from './interface.js';
import { dadosLocaisLegados, requisitarApi, possuiDados } from './api.js';

function baixarArquivoBackup(dados) {
  const conteudo = JSON.stringify({ format: 'ds-legacy', version: 1, exportedAt: new Date().toISOString(), ...dados }, null, 2);
  const endereco = URL.createObjectURL(new Blob([conteudo], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = endereco;
  link.download = `ds-legacy-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(endereco), 60_000);
}

export function inicializarBackup() {
  $('#baixarBackup').addEventListener('click', async () => {
    const botao = $('#baixarBackup');
    const estado = $('#estadoBackup');
    botao.disabled = true;
    botao.textContent = 'Preparando backup...';
    estado.textContent = 'Buscando os dados atualizados no servidor...';
    try {
      const dados = await requisitarApi('/api/backup', { method: 'POST' });
      baixarArquivoBackup(dados);
      estado.textContent = 'Download iniciado. Guarde o arquivo para importar na outra instalação.';
    } catch (erro) {
      estado.textContent = `Não foi possível baixar o backup: ${erro.message}`;
      tratarErroOperacao(erro);
    } finally {
      botao.disabled = false;
      botao.textContent = 'Baixar backup';
    }
  });

  const botaoExportarDados = $('#exportarDadosLocais');
  botaoExportarDados.classList.toggle('oculto', !possuiDados(dadosLocaisLegados));
  botaoExportarDados.addEventListener('click', () => {
    baixarArquivoBackup(dadosLocaisLegados);
    $('#estadoMigracaoLogin').textContent = 'Backup criado. Abra a nova aplicação, selecione esse arquivo e depois entre.';
  });

  $('#arquivoMigracao').addEventListener('change', async evento => {
    const arquivo = evento.target.files[0];
    if (!arquivo) return;
    try {
      const dados = JSON.parse(await arquivo.text());
      if (!dados || typeof dados !== 'object' || !['readers', 'books', 'loans', 'reservations'].every(chave => Array.isArray(dados[chave]))) {
        throw new Error('O arquivo não possui o formato de backup do DS Legacy.');
      }
      appState.dadosImportacaoArquivo = dados;
      $('#estadoMigracaoLogin').textContent = `Backup “${arquivo.name}” selecionado. Entre para importá-lo no banco vazio.`;
    } catch (erro) {
      appState.dadosImportacaoArquivo = null;
      evento.target.value = '';
      $('#estadoMigracaoLogin').textContent = erro.message || 'Não foi possível ler o arquivo selecionado.';
    }
  });
}
