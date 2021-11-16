const { Proc } = require('../../lib/Proc');
const { Readable } = require('stream');
const getStream = require('get-stream');

/**
 * @typedef {import('yargs')} yargs
 * @typedef {import('index').ReplCmdContext} ReplCmdContext
 * @typedef {{ jrql: string, '@id': string }} ReadOpts
 */

/**
 * @param {ReplCmdContext} ctx
 * @returns {yargs.CommandModule<{}, ReadOpts>}
 */
module.exports = (ctx) => ({
  command: 'read [jrql]',
  describe: 'Read from a clone using json-rql',
  builder: yargs => yargs
    .positional('jrql', {
      describe: 'Query in json-rql (TIP: use single quotes)',
      coerce: JSON.parse,
      demandOption: ctx.stdin == null
    })
    .option('@id', ctx.clones.cloneIdOption('read')),
  /** @param {ReadOpts} argv */
  handler: argv => {
    ctx.proc = new ReadCloneProc(ctx, argv['@id'], argv.jrql);
  }
});

class ReadCloneProc extends Proc {
  /**
   * @param {ReplCmdContext} ctx
   * @param {string} cloneId
   * @param {string} [jrql]
   */
  constructor(ctx, cloneId, jrql) {
    const clone = ctx.clones.get(cloneId);
    super(new Readable({ read: () => {} }));
    clone.on('message', msg => {
      if (msg.cmdId === ctx.cmdId) {
        switch (msg['@type']) {
          case 'next':
            this.stdout.push(JSON.stringify(msg.subject));
            break;
          case 'complete':
            this.stdout.push(null);
            break;
          case 'error':
            this.stdout.destroy(msg.err);
        }
      }
    });
    this.stdout
      .on('close', () => this.setDone())
      .on('error', err => this.setDone(err));
    (async () => {
      clone.send({
        id: ctx.cmdId,
        '@type': 'read',
        jrql: jrql || await getStream(ctx.stdin)
      });
    })().catch(this.setDone);
  }
}