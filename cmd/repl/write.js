const { Readable, Writable, pipeline } = require('stream');
const { Proc } = require('../../lib/Proc');
const JSONStream = require('JSONStream');
const getStream = require('get-stream');

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
  handler: argv => {
    ctx.proc = new WriteCloneProc(ctx, argv['@id'], argv.jrql, argv.path);
  }
});

class WriteCloneProc extends Proc {
  /**
   * @param {CmdContext} ctx
   * @param {string} cloneId
   * @param {string} [jrql]
   * @param {string} path JSONPath path into the input stream
   */
  constructor(ctx, cloneId, jrql, path) {
    super();
    const cloneWriter = new CloneWriter(ctx.cmdId, ctx.childProcs.get(cloneId));
    if (path === '$') {
      this.writeOne(ctx, jrql, cloneWriter).catch(this.setDone);
    } else {
      pipeline(
        jrql ? Readable.from([arrayJsonString(jrql)]) : ctx.stdin,
        JSONStream.parse(path),
        cloneWriter,
        err => this.setDone(err));
    }
  }

  async writeOne(ctx, jrql, cloneWriter) {
    const json = JSON.parse(jrql || await getStream(ctx.stdin));
    pipeline(
      Readable.from([json]),
      cloneWriter,
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