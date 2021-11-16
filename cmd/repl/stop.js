/**
 * @typedef {import('yargs')} yargs
 * @typedef {import('index').ReplCmdContext} ReplCmdContext
 * @typedef {{ '@id': string }} StopOpts
 */

const { Proc } = require('../../lib/Proc');
/**
 * @param {ReplCmdContext} ctx
 * @returns {yargs.CommandModule<{}, StopOpts>}
 */
module.exports = (ctx) => ({
  command: 'stop [@id]',
  describe: 'Stops a clone process',
  builder: yargs => yargs
    .option('@id', ctx.clones.cloneIdOption('stop')),
  handler: argv => {
    ctx.proc = new StopCloneProc(ctx, argv['@id']);
  }
});

class StopCloneProc extends Proc {
  /**
   * @param {ReplCmdContext} ctx
   * @param {string} cloneId
   */
  constructor(ctx, cloneId) {
    const clone = ctx.clones.get(cloneId);
    super(clone.stdout, clone.stderr);
    ctx.clones.stop(clone).then(this.setDone, err => this.setDone(err));
    clone.on('message', msg => {
      switch (msg['@type']) {
        case 'stopped':
          this.emit('message', msg);
      }
    });
  }
}
