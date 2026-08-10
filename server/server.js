'use strict';

const { config, assertValidConfig } = require('./config');
const { createApp } = require('./app');

assertValidConfig();

const app = createApp();

app.listen(config.port, () => {
  console.log(`[server] Amrix Forde donations server listening on port ${config.port} (${config.env})`);
});
