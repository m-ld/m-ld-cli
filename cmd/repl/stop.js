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
  describe: 'Stops a child process',
  builder: yargs => yargs
    .option('@id', ctx.childProcs.childIdOption('stop')),
  handler: argv => {
    ctx.proc = new StopCloneProc(ctx, argv['@id']);
  }
});

class StopCloneProc extends Proc {
  /**
   * @param {ReplCmdContext} ctx
   * @param {string} childId
   */
  constructor(ctx, childId) {
    const childProcess = ctx.childProcs.get(childId);
    super(childProcess.stdout, childProcess.stderr);
    const messageHandler = msg => {
      switch (msg['@type']) {
        case 'stopped':
          this.emit('message', msg);
      }
    };
    childProcess.on('message', messageHandler);
    ctx.childProcs.stop(childProcess)
      .then(this.setDone, err => this.setDone(err))
      // Prevent event handler leakage
      .then(() => childProcess.off('message', messageHandler));
  }
}
