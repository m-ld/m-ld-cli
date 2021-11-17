const { Proc } = require('../../lib/Proc');

/**
 * @typedef {import('yargs')} yargs
 * @typedef {import('index').ReplCmdContext} ReplCmdContext
 * @typedef {{ '@id': string }} StopOpts
 */

/**
 * @param {ReplCmdContext} ctx
 * @returns {yargs.CommandModule<{}, StopOpts>}
 */
module.exports = (ctx) => ({
  command: 'stop [@id]',
  describe: 'Stops a clone',
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
    const messageHandler = msg => {
      switch (msg['@type']) {
        case 'stopped':
          this.emit('message', msg);
      }
    };
    clone.on('message', messageHandler);
    ctx.clones.stop(clone)
      .then(this.setDone, err => this.setDone(err))
      // Prevent event handler leakage
      .then(() => clone.off('message', messageHandler));
  }
}
