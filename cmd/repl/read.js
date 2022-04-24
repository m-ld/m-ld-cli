const { Proc } = require('../../lib/Proc');
const { Readable } = require('stream');
const getStream = require('get-stream');
const stringify = require('json-stringify-pretty-compact');

/**
 * @typedef {import('yargs')} yargs
 * @typedef {{ jrql: string|null, '@id': string }} ReadOpts
 */

/**
 * @param {CmdContext} ctx
 * @returns {yargs.CommandModule<{}, ReadOpts>}
 */
module.exports = (ctx) => ({
  command: 'read [jrql]',
  describe: 'Read from a clone using json-rql',
  builder: yargs => yargs
    .positional('jrql', {
      describe: 'Query in json-rql (TIP: use single quotes)',
      demandOption: ctx.stdin == null
    })
    .option('@id', ctx.childProcs.childIdOption('read')),
  /** @param {ReadOpts} argv */
  handler: argv => ctx.exec( () => new ReadCloneProc(ctx, argv['@id'], argv.jrql))
});

class ReadCloneProc extends Proc {
  /**
   * @param {CmdContext} ctx
   * @param {string} cloneId
   * @param {string} [jrql]
   */
  constructor(ctx, cloneId, jrql) {
    // TODO: Use a dedicated output pipe with backpressure
    super(new Readable({ read: () => {} }));
    const clone = ctx.childProcs.get(cloneId);
    let first = true;
    const messageHandler = msg => {
      if (msg.cmdId === ctx.cmdId) {
        switch (msg['@type']) {
          case 'next':
            // TODO: make pretty-print optional
            const subjectJson = stringify(msg.subject);
            this.stdout.push((first ? '[' : ',\n') + subjectJson);
            first = false;
            break;
          case 'complete':
            if (first)
              this.stdout.push('[]');
            else
              this.stdout.push(']');
            this.stdout.push(null);
            break;
          case 'error':
            this.stdout.destroy(msg.err);
        }
      }
    };
    clone.on('message', messageHandler);
    this.stdout
      .on('close', () => {
        // Prevent event handler leakage
        clone.off('message', messageHandler);
        this.setDone();
      })
      .on('error', err => this.setDone(err));
    this.sendRead(ctx, jrql, clone).catch(this.setDone);
  }

  async sendRead(ctx, jrql, clone) {
    clone.send({
      id: ctx.cmdId,
      '@type': 'read',
      jrql: JSON.parse(jrql || await getStream(ctx.stdin))
    });
  }
}