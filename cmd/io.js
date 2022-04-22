const socket = require('socket.io');
const { IoRemotesService } = require('@m-ld/m-ld/dist/socket.io-server');
const host = require('../lib/host');
const { uuid } = require('@m-ld/m-ld');

/**
 * @typedef {GlobalOpts} IoConfig
 * @property {number} [port]
 */

Object.assign(exports, require('./cmds.json').io);

/**
 * @param {import('yargs/yargs').Argv} yargs
 * @returns {import('yargs/yargs').Argv<IoConfig>}
 */
exports.builder = yargs => yargs
  .positional('port', {
    describe: 'Port for server',
    default: 0,
    type: 'number'
  });

/**
 * @param {IoConfig} argv
 */
exports.handler = argv => {
  const meta = { '@id': uuid() };
  // Create and run an HTTP server for Express and Socket.io
  const httpServer = require('http').createServer();
  httpServer.listen(argv.port, () => {
    const port = httpServer.address().port;
    host.report('start', 'started', {
      ...meta, port, env: { CLI_IO__URI: `http://localhost:${port}` }
    });
  });

  // Start the Socket.io server, and attach the m-ld message-passing service
  const io = new socket.Server(httpServer);
  new IoRemotesService(io.sockets)
    // The m-ld service provides some debugging information
    .on('error', console.error)
    .on('debug', console.debug);

  // Listen for stop messages
  process.on('message', msg => {
    if (msg['@type'] === 'stop')
      httpServer.close(err => {
        if (err)
          host.reportError(msg.cmdId, err);
        else
          host.report(msg.id, 'stopped', meta);
        process.exit();
      });
  });
};