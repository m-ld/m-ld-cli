const { Readable, Writable, pipeline } = require('stream');
const { Proc } = require('../../lib/Proc');
const JSONStream = require('JSONStream');

/**
 * @typedef {import('yargs')} yargs
 * @typedef {import('index').ReplCmdContext} ReplCmdContext
 * @typedef {{ jrql: string|null, '@id': string, path: string }} WriteOpts
 */

/**
 * @param {ReplCmdContext} ctx
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
    .option('@id', ctx.clones.cloneIdOption('write'))
    .default('path', '*'),
  /** @param {WriteOpts} argv */
  handler: argv => {
    ctx.proc = new WriteCloneProc(ctx, argv['@id'], argv.jrql, argv.path);
  }
});

class WriteCloneProc extends Proc {
  /**
   * @param {ReplCmdContext} ctx
   * @param {string} cloneId
   * @param {string} [jrql]
   * @param {string} path JSONPath path into the input stream
   */
  constructor(ctx, cloneId, jrql, path) {
    super();
    pipeline(
      jrql ? Readable.from([arrayJsonString(jrql)]) : ctx.stdin,
      JSONStream.parse(path),
      new CloneWriter(ctx.cmdId, ctx.clones.get(cloneId)),
      err => this.setDone(err));
  }
}

/**
 *
 * @param {string} jrql
 * @returns {string}
 */
function arrayJsonString(jrql) {
  jrql = jrql.trim();
  return jrql.startsWith('[') ? jrql : `[${jrql}]`;
}

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
    this.clone.on('message', msg => {
      if (msg.cmdId === cmdId) {
        switch (msg['@type']) {
          case 'complete':
            return callback();
          case 'error':
            return callback(msg.err);
        }
      }
    });
  }
}