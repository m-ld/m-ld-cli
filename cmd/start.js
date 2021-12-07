const { uuid, clone } = require('@m-ld/m-ld');
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
    describe: 'Set to indicate that this clone will be "genesis"; ' +
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
    if (argv.remotes != null && argv[argv.remotes] == null)
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
    new MeldChildApp(argv).start()
      .catch(e => host.reportError('start', e));
  }
};

class MeldChildApp {
  constructor(config) {
    this.config = config;
    this.meta = { '@id': this.config['@id'] };
    this.backend = this.createBackend();
    this.remotes = this.createRemotes();
  }

  async createRemotes() {
    // Find the first type requested, or for which configuration exists
    const remotesType = REMOTES.find(type => this.config.remotes === type) ||
      REMOTES.find(type => this.config[type] != null);
    if (remotesType === 'ably')
      return new AblyRemotes(this.config, { peering: await this.createPeering() });
    else if (remotesType === 'io')
      return new IoRemotes(this.config);
    else
      throw new Error('Remotes not specified or not supported');
  }

  async createPeering() {
    // Load WRTC config from Xirsys if available
    if (this.config.xirsys)
      this.config.wrtc = await loadWrtcConfig(this.config.xirsys);
    if (this.config.wrtc)
      return new WrtcPeering(this.config);
    // Otherwise undefined
  }

  createBackend() {
    if (this.config.backend === 'memdown')
      return (require('memdown'))();
    else if (this.config.backend === 'leveldown')
      return (require('leveldown'))(this.config.dataDir);
    else
      throw new Error('Backend not specified or not supported');
  }

  async start() {
    // Start the m-ld clone
    this.meld = await clone(this.backend, await this.remotes, this.config);
    this.meld.status.subscribe({ error: err => host.reportError('start', err) });
    host.report('start', 'started', this.meta);
    // Attach listeners for parent process commands
    process.on('message', msg => this.handleHostMessage(msg));
  }

  /**
   *
   * @param {object} msg
   * @returns {Promise<void>}
   */
  async handleHostMessage(msg) {
    try {
      switch (msg['@type']) {
        case 'status':
          host.report(msg.id, 'status', this.meld.status.value);
          break;
        case 'read':
          this.meld.read(msg.jrql).subscribe({
            next: subject => host.report(msg.id, 'next', { subject }),
            complete: () => host.report(msg.id, 'complete'),
            error: host.errorHandler(msg)
          });
          break;
        case 'write':
          await this.meld.write(msg.jrql);
          host.report(msg.id, 'complete');
          break;
        case 'stop':
          await this.meld.close();
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