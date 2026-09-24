'use strict';

const os = require('os');
const config = require('./config');
const app = require('./app');
const backup = require('./services/backup');

app.listen(config.port, () => {
  const addresses = Object.values(os.networkInterfaces())
    .flat()
    .filter((item) => item && item.family === 'IPv4' && !item.internal)
    .map((item) => item.address);

  console.log('');
  console.log('  Expedicao Control 2.0');
  console.log('  ----------------------------------------');
  console.log('  Local: http://localhost:' + config.port);

  for (const address of addresses) {
    console.log('  Rede:  http://' + address + ':' + config.port);
  }

  console.log('  Banco: ' + config.databaseFile);
  console.log('');
});

backup.scheduleDaily();
