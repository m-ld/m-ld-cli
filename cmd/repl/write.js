const { Writable } = require('stream');
const { JsonSinkProc } = require('../../lib/Proc');

/**
 * @typedef {import('yargs')} yargs
 * @typedef {{ jrql: string|null, '@id': string, path: string }} WriteOpts
 */

/**
 * @param {CmdContext} ctx
 * @returns {yargs.CommandModule<{}, WriteOpts>}
 */
module.exports = (ctx) => ({
  command: 'write [jrql]',
  describe: 'Write to a clone using json-rql',
  builder: yargs => yargs
    .positional('jrql', {
      describe: 'Update in json-rql (TIP: use single quotes)',
      demandOption: ctx.stdin == null
    })
    .option('@id', ctx.childProcs.childIdOption('write'))
    .option('path', {
      default: '$',
      describe: 'JSONPath to pick out data from the input.\n' +
        'For example, to transact each item of an array, use \'*\''
    }),
  /** @param {WriteOpts} argv */
  handler: argv => ctx.exec( () => new JsonSinkProc(new CloneWriter(
    ctx.cmdId, ctx.childProcs.get(argv['@id'])), argv.path, ctx.stdin, argv.jrql))
});

class CloneWriter extends Writable {
  /**
   * @param {string} cmdId
   * @param {ChildProcess} clone
   */
  constructor(cmdId, clone) {
    super({ objectMode: true });
    this.clone = clone;
    let subId = 0;
    this.nextCmdId = () => `${cmdId}-${subId++}`;
  }

  /**
   * @param {object} jrql
   * @param encoding
   * @param callback
   * @private
   */
  _write(jrql, encoding, callback) {
    const cmdId = this.nextCmdId();
    this.clone.send({ id: cmdId, '@type': 'write', jrql });
    const handleMessage = msg => {
      if (msg.cmdId === cmdId) {
        this.clone.off('message', handleMessage);
        switch (msg['@type']) {
          case 'complete':
            return callback();
          case 'error':
            return callback(msg.err);
        }
      }
    };
    this.clone.on('message', handleMessage);
  }
}