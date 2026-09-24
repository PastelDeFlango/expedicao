'use strict';

const backup = require('../src/services/backup');

backup.runBackup().then((resultado) => {
  if (resultado.erro) {
    console.error('Backup nao concluido: ' + resultado.erro);
    process.exit(1);
  }

  const c = resultado.conferencia;

  console.log('Arquivo: ' + resultado.arquivo);
  console.log('Tabelas verificadas: ' + c.tabelas);
  console.log('Integridade: ' + c.integridade);

  for (const tabela of Object.keys(c.contagens)) {
    console.log('  ' + tabela + ': ' + c.contagens[tabela] + ' registro(s)');
  }

  process.exit(c.ok ? 0 : 1);
});
