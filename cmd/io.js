const socket = require('socket.io');
const { IoRemotesService } = require('@m-ld/m-ld/dist/socket.io-server');
const host = require('../lib/host');
const { uuid } = require('@m-ld/m-ld');

/** @typedef {import('yargs/yargs').Argv} Argv */
/** @typedef {Argv & {
 *    port?: number
 *  } } IoConfig */

Object.assign(exports, require('./cmds.json').io);

/**
 * @param {Argv} yargs
 * @returns {IoConfig}
 */
exports.builder = yargs => yargs
  .positional('port', {
    describe: 'Port for server',
    default: 3000,
    type: 'number'
  });

exports.handler = argv => {
  const meta = { '@id': uuid() };
  // Create and run an HTTP server for Express and Socket.io
  const httpServer = require('http').createServer();
  httpServer.listen(argv.port, () => {
    host.report('start', 'started', {
      ...meta, env: { CLI_IO__URI: `http://localhost:${argv.port}` }
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