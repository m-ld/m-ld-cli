const { Proc } = require('../../lib/Proc');

/**
 * @typedef {import('yargs')} yargs
 * @typedef {{ '@id': string }} StatusOpts
 */

/**
 * @param {CmdContext} ctx
 * @returns {yargs.CommandModule<{}, StatusOpts>}
 */
module.exports = ctx => ({
  command: 'status [@id]',
  describe: 'Interrogates the status of a clone',
  builder: yargs => yargs
    .option('@id', ctx.childProcs.childIdOption('status')),
  handler: argv => {
    ctx.proc = new StatusCloneProc(ctx, argv['@id']);
  }
});

class StatusCloneProc extends Proc {
  /**
   * @param {CmdContext} ctx
   * @param {string} cloneId
   */
  constructor(ctx, cloneId) {
    const clone = ctx.childProcs.get(cloneId);
    super();
    const messageHandler = msg => {
      if (msg.cmdId === ctx.cmdId && msg['@type'] === 'status') {
        this.emit('message', msg);
        this.setDone();
        // Do not leak message handlers
        clone.off('message', messageHandler);
      }
    };
    clone.on('message', messageHandler);
    clone.send({ id: ctx.cmdId, '@type': 'status' });
  }
}
