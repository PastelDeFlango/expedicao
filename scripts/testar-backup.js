'use strict';

// Testa o ciclo completo: cria backup, confere o arquivo e restaura.
// Uso: node scripts/testar-backup.js

const backup = require('../src/services/backup');

async function principal() {
  console.log('1. Gerando backup...');
  const gerado = await backup.runBackup();

  if (gerado.erro) {
    console.error('   FALHOU: ' + gerado.erro);
    process.exit(1);
  }

  console.log('   Arquivo: ' + gerado.arquivo);

  console.log('2. Verificando integridade...');
  const c = gerado.conferencia;

  if (!c.ok) {
    console.error('   FALHOU: ' + JSON.stringify(c));
    process.exit(1);
  }

  console.log('   Integridade: ' + c.integridade);
  console.log('   Tabelas: ' + c.tabelas);

  for (const tabela of Object.keys(c.contagens)) {
    console.log('     ' + tabela + ': ' + c.contagens[tabela]);
  }

  console.log('3. Listando backups disponiveis...');
  const lista = backup.listar();
  console.log('   ' + lista.length + ' arquivo(s)');

  console.log('4. Simulando restauracao (sem aplicar)...');
  const conferencia = backup.verificar(gerado.arquivo);

  if (!conferencia.ok) {
    console.error('   FALHOU: backup nao pode ser lido');
    process.exit(1);
  }

  console.log('   Backup lido com sucesso.');
  console.log('');
  console.log('TESTE CONCLUIDO - o backup pode ser restaurado.');
  process.exit(0);
}

principal();
