// Estado compartilhado dos dados recebidos da API.
export const appState = {
  usuarioAtual: null,
  leitores: [],
  livros: [],
  emprestimos: [],
  reservas: [],
  dadosImportacaoArquivo: null
};

// Comunicação entre a API, a sessão e a composição das telas.
export const eventos = new EventTarget();
export function solicitarRenderizacao() {
  eventos.dispatchEvent(new Event('dados-atualizados'));
}
