'use strict';

const readline = require('readline');
const users = require('../src/services/users');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function ask(question, hidden) {
  return new Promise((resolve) => {
    if (!hidden) { rl.question(question, (answer) => resolve(answer.trim())); return; }

    process.stdout.write(question);
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    stdin.setRawMode(true);
    stdin.resume();

    let entry = '';
    const onData = (chunk) => {
      const text = chunk.toString('utf8');

      if (text === '\r' || text === '\n') {
        stdin.removeListener('data', onData);
        stdin.setRawMode(Boolean(wasRaw));
        process.stdout.write(String.fromCharCode(10));
        resolve(entry);
        return;
      }

      if (text === '\u0003') process.exit(0);
      if (text === '\u007f') entry = entry.slice(0, -1);
      else entry += text;
    };

    stdin.on('data', onData);
  });
}

(async () => {
  console.log('Cadastro de usuario - Expedicao Control');

  const name = await ask('Nome completo: ');
  const username = await ask('Usuario: ');
  const password = await ask('Senha (minimo 8 caracteres): ', true);
  const roleAnswer = await ask('Perfil [operator/admin]: ');
  const role = roleAnswer === 'admin' ? 'admin' : 'operator';
  const shift = await ask('Turno (ex.: Turno 1): ');

  if (!name || !username || !shift || password.length < 8) {
    console.error('Dados invalidos. A senha precisa de pelo menos 8 caracteres.');
    rl.close();
    process.exit(1);
  }

  try {
    const created = users.create({ username, password, name, role, shift });
    console.log('Usuario criado: ' + created.name + ' (' + created.username + ') - ' + created.shift);
  } catch (error) {
    console.error('Nao foi possivel criar: nome de usuario ja existente.');
    rl.close();
    process.exit(1);
  }

  rl.close();
  process.exit(0);
})();
