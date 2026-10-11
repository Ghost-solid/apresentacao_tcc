const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.join(__dirname, '..');

function listarJavaScript(diretorio) {
  return fs.readdirSync(diretorio, { withFileTypes: true }).flatMap(item => {
    const caminho = path.join(diretorio, item.name);
    if (item.isDirectory()) return listarJavaScript(caminho);
    return /\.(?:js|mjs|cjs)$/.test(item.name) ? [caminho] : [];
  });
}

const arquivos = [
  path.join(root, 'server.js'),
  ...['src', 'scripts', 'public/js', 'test']
    .map(pasta => path.join(root, pasta))
    .filter(pasta => fs.existsSync(pasta))
    .flatMap(listarJavaScript)
];

for (const arquivo of arquivos) {
  execFileSync(process.execPath, ['--check', arquivo], { stdio: 'inherit' });
}

console.log(`Sintaxe verificada em ${arquivos.length} arquivos JavaScript.`);
