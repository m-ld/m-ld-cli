const { uuid, clone } = require('@m-ld/m-ld');
const host = require('../lib/host');

/** @typedef { import('@m-ld/m-ld/dist/ably').MeldAblyConfig } MeldAblyConfig */
/** @typedef { import('@m-ld/m-ld/dist/wrtc').MeldWrtcConfig } MeldWrtcConfig */
/** @typedef { import('@m-ld/io-web-runtime/dist/server/xirsys').XirsysConfig } XirsysConfig */

/**
 * @typedef {GlobalOpts} StartConfig
 * @property {string} [remotes]
 * @property {string} [backend]
 * @property {string} [dataDir]
 * @property {XirsysConfig} [xirsys]
 * @property {boolean} dryRun
 */

Object.assign(exports, require('./cmds.json').start);

/**
 * @param {import('yargs/yargs').Argv<GlobalOpts>} yargs
 * @returns {import('yargs/yargs').Argv}
 */
exports.builder = yargs => yargs
  .boolean('dryRun')
  .array('ext')
  .default('@id', uuid())
  .string('@domain')
  .option('genesis', {
    boolean: true,
    describe: 'Set to indicate that this clone will be "genesis"; ' +
      'that is, the first new clone on a new domain'
  })
  .describe('backend', 'Backend extension to use')
  .describe('remotes', 'Remotes (messaging) extension to use')
  .normalize('dataDir')
  .config()
  .env('CLI')
  .demandOption('@domain')
  .check(argv => {
    // Check that a selected backend exists and checks out
    const backendExt = backendModule(argv);
    if (backendExt == null)
      new Error('Backend not specified or not supported');
    const backendCheck = 'check' in backendExt ? backendExt.check(argv) : true;
    if (argv.remotes != null && argv[argv.remotes] == null)
      throw new Error(`no configuration specified for ${argv.remotes}`);
    return backendCheck;
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

/**
 * @param {MeldAblyConfig|MeldWrtcConfig|StartConfig} config
 * @returns {module:ExtensionModule}
 */
function backendModule(config) {
  return config.ext.find(ext =>
    ext['@type'] === 'backend' &&
    (config.backend ? ext['@id'] === config.backend : ext.isDefault));
}

class MeldChildApp {
  /**
   * @param {MeldAblyConfig|MeldWrtcConfig|StartConfig} config
   */
  constructor(config) {
    this.config = config;
    this.meta = { '@id': this.config['@id'] };
    this.backend = backendModule(config).getInstance(config);
    this.remotes = this.createRemotes();
  }

  async createRemotes() {
    // Find the first type requested, or for which configuration exists
    const remotesModule =
      this.config.ext.find(ext => this.config.remotes === ext['@type']) ||
      this.config.ext.find(ext => this.config[ext['@type']] != null);
    if (remotesModule != null)
      return remotesModule.getInstance(this.config);
    else
      throw new Error('Remotes not specified or not supported');
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