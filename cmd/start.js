const { uuid, clone, MeldClone } = require('@m-ld/m-ld');
const { loadWrtcConfig } = require('@m-ld/io-web-runtime/dist/server/xirsys');
const { WrtcPeering } = require('@m-ld/m-ld/dist/wrtc');
const { AblyRemotes } = require('@m-ld/m-ld/dist/ably');
const { IoRemotes } = require('@m-ld/m-ld/dist/socket.io');
const host = require('../lib/host');
const REMOTES = ['ably', 'io'];

/** @typedef { import('@m-ld/m-ld/dist/ably').MeldAblyConfig } MeldAblyConfig */
/** @typedef { import('@m-ld/m-ld/dist/wrtc').MeldWrtcConfig } MeldWrtcConfig */
/** @typedef { import('@m-ld/io-web-runtime/dist/server/xirsys').XirsysConfig } XirsysConfig */
/** @typedef {{
 *    backend?: string,
 *    dataDir?: string,
 *    xirsys?: XirsysConfig,
 *    dryRun: boolean
 *  }} StartConfig */

Object.assign(exports, require('./cmds.json').start);

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
  .option('remotes', {
    describe: 'Remotes (messaging) type to use',
    choices: REMOTES
  })
  .default('logLevel', process.env.LOG)
  .normalize('dataDir')
  .config()
  .env('CLI')
  .demandOption(['@domain', 'backend'])
  .check(argv => {
    if (argv.backend === 'leveldown' && argv.dataDir == null)
      throw new Error('leveldown backend must have a dataDir');
    if (argv[argv.remotes] == null)
      throw new Error(`no configuration specified for ${argv.remotes}`);
    return true;
  });

/**
 * @param {MeldAblyConfig|MeldWrtcConfig|StartConfig} argv
 * @returns {Promise<void>}
 */
exports.handler = async argv => {
  if (argv.dryRun) {
    host.report('start', 'config', argv);
  } else {
    new MeldApp(argv).initialise().catch(e => host.reportError('start', e));
  }
};

class MeldApp {
  constructor(argv) {
    this.config = argv;
    this.meta = { '@id': this.config['@id'] };
  }

  async initialise() {
    // Load WRTC config from Xirsys if available
    let peering;
    if (this.config.xirsys)
      this.config.wrtc = await loadWrtcConfig(this.config.xirsys);
    if (this.config.wrtc)
      peering = new WrtcPeering(this.config);
    // Infer the remotes type from the configuration
    let remotes;
    // Find the first type requested, or for which configuration exists
    const remotesType = REMOTES.find(type => this.config.remotes === type) ||
      REMOTES.find(type => this.config[type] != null);
    if (remotesType === 'ably')
      remotes = new AblyRemotes(this.config, { peering });
    else if (remotesType === 'io')
      remotes = new IoRemotes(this.config);
    // Create the backend
    let backend;
    if (this.config.backend === 'memdown')
      backend = (require('memdown'))();
    else if (this.config.backend === 'leveldown')
      backend = (require('leveldown'))(this.config.dataDir);
    // Start the m-ld clone
    const meld = await clone(backend, remotes, this.config);
    host.report('start', 'started', this.meta);
    // Attach listeners for parent process commands
    process.on('message', msg => this.handleHostMessage(meld, msg));
  }

  /**
   *
   * @param {MeldClone} meld
   * @param {object} msg
   * @returns {Promise<void>}
   */
  async handleHostMessage(meld, msg) {
    try {
      switch (msg['@type']) {
        case 'status':
          host.report(msg.id, 'status', meld.status.value);
          break;
        case 'read':
          meld.read(msg.jrql).subscribe({
            next: subject => host.report(msg.id, 'next', { subject }),
            complete: () => host.report(msg.id, 'complete'),
            error: host.errorHandler(msg)
          });
          break;
        case 'write':
          await meld.write(msg.jrql);
          host.report(msg.id, 'complete');
          break;
        case 'stop':
          await meld.close();
          host.report(msg.id, 'stopped', this.meta);
          process.exit(0);
          break;
        default:
          host.reportError(msg.id, `No handler for ${msg['@type']}`);
      }
    } catch (e) {
      host.reportError(msg.id, e);
    }
  }
}