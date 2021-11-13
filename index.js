#!/usr/bin/env node
require('dotenv').config();

const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const { uuid, clone } = require('@m-ld/m-ld');
const { loadWrtcConfig } = require('@m-ld/io-web-runtime/dist/server/xirsys');
const LOG = require('loglevel');
const { AblyRemotes } = require('@m-ld/m-ld/dist/ably');
const { WrtcPeering } = require('@m-ld/m-ld/dist/wrtc');

/** @typedef { import('@m-ld/m-ld/dist/ably').MeldAblyConfig } MeldAblyConfig */
/** @typedef { import('@m-ld/m-ld/dist/wrtc').MeldWrtcConfig } MeldWrtcConfig */
/** @typedef { import('@m-ld/io-web-runtime/dist/server/xirsys').XirsysConfig } XirsysConfig */
/** @typedef {{
 *    backend?: string, dataDir?: string, xirsys?: XirsysConfig, 'dry-run': boolean
 *  }} CliConfig */

const argv = /**@type {MeldAblyConfig|MeldWrtcConfig|CliConfig}*/
  yargs(hideBin(process.argv))
    .command('$0', 'start a clone process')
    .boolean('dry-run')
    .default('@id', uuid())
    .string('@domain')
    .option('genesis', {
      boolean: true,
      describe: 'Set to `true` to indicate that this clone will be' +
        '\'genesis\'; that is, the first new clone on a new domain'
    })
    .option('backend', {
      // leveldown requires dataDir
      choices: ['leveldown', 'memdown'],
      default: 'memdown'
    })
    .normalize('dataDir')
    .config()
    .env('CLI')
    .default('logLevel', process.env.LOG)
    .demandOption(['@domain', 'backend'])
    .check(argv => {
      if (argv.backend === 'leveldown' && argv.dataDir == null)
        throw new Error('leveldown backend must have a dataDir');
      if (argv.ably == null)
        throw new Error('remotes must be one of [ably]');
      return true;
    })
    .parse();

if (argv['dry-run']) {
  console.log(argv);
} else {
  try {
    LOG.setLevel(argv.logLevel);
    (async function startCloneProcess() {
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
      meld.follow(update => LOG.info('Received', JSON.stringify(update)));
      await meld.status.becomes({ outdated: false });
      LOG.info('Up to date!');
    })();
  } catch (e) {
    LOG.error(e);
  }
}
