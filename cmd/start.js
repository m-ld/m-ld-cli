const { uuid, clone } = require('@m-ld/m-ld');
const { loadWrtcConfig } = require('@m-ld/io-web-runtime/dist/server/xirsys');
const { AblyRemotes } = require('@m-ld/m-ld/dist/ably');
const { WrtcPeering } = require('@m-ld/m-ld/dist/wrtc');
const host = require('../lib/host');

/** @typedef { import('@m-ld/m-ld/dist/ably').MeldAblyConfig } MeldAblyConfig */
/** @typedef { import('@m-ld/m-ld/dist/wrtc').MeldWrtcConfig } MeldWrtcConfig */
/** @typedef { import('@m-ld/io-web-runtime/dist/server/xirsys').XirsysConfig } XirsysConfig */
/** @typedef {{
 *    backend?: string,
 *    dataDir?: string,
 *    xirsys?: XirsysConfig,
 *    dryRun: boolean
 *  }} StartConfig */

exports.command = 'start';
exports.describe = 'start a clone process';

/**
 * @param {import('yargs/yargs').Argv} yargs
 * @returns {import('yargs/yargs').Argv}
 */
exports.builder = yargs => yargs
  .boolean('dryRun')
  .default('@id', uuid())
  .string('@domain')
  .option('genesis', {
    boolean: true,
    describe: 'Set to indicate that this clone will be \'genesis\'; ' +
      'that is, the first new clone on a new domain'
  })
  .option('backend', {
    // leveldown requires dataDir
    choices: ['leveldown', 'memdown'],
    default: 'memdown'
  })
  .default('logLevel', process.env.LOG)
  .normalize('dataDir')
  .config()
  .env('CLI')
  .demandOption(['@domain', 'backend'])
  .check(argv => {
    if (argv.backend === 'leveldown' && argv.dataDir == null)
      throw new Error('leveldown backend must have a dataDir');
    if (argv.ably == null)
      throw new Error('remotes must be one of [ably]');
    return true;
  });

/**
 * @param {MeldAblyConfig|MeldWrtcConfig|StartConfig} argv
 * @returns {Promise<void>}
 */
exports.handler = async argv => {
  if (argv.dryRun) {
    host.report(argv.$0, 'config', argv);
  } else {
    try {
      // Load WRTC config from Xirsys if available
      let peering;
      if (argv.xirsys)
        argv.wrtc = await loadWrtcConfig(argv.xirsys);
      if (argv.wrtc)
        peering = new WrtcPeering(argv);
      // Infer the remotes type from the configuration
      let remotes;
      if (argv.ably)
        remotes = new AblyRemotes(argv, { peering });
      // Create the backend
      let backend;
      if (argv.backend === 'memdown')
        backend = (require('memdown'))();
      else if (argv.backend === 'leveldown')
        backend = (require('leveldown'))(argv.dataDir);
      // Start the m-ld clone
      const meld = await clone(backend, remotes, argv);
      host.report(argv.$0, 'started', { cloneId: argv['@id'] });
      // Report status messages
      meld.status.subscribe({
        next: status => host.report(argv.$0, 'status', status),
        complete: () => host.report(argv.$0, 'closed'),
        error: err => host.reportError(argv.$0, err)
      });
      // Attach listeners for parent process commands
      process.on('message', async message => {
        try {
          switch (message['@type']) {
            case 'stop':
              await meld.close();
              host.report(message.id, 'stopped');
              break;
            default:
              host.reportError(message.id, `No handler for ${message['@type']}`);
          }
        } catch (e) {
          host.reportError(message.id, e);
        }
      });
    } catch (e) {
      host.reportError(argv.$0, e);
    }
  }
};