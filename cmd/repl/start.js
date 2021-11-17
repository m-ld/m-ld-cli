const { Proc } = require('../../lib/Proc');
const { fork } = require('child_process');
const { join } = require('path');

/**
 * @typedef {import('yargs')} yargs
 * @typedef {import('index').ReplCmdContext} ReplCmdContext
 */

/**
 * @param {ReplCmdContext} ctx
 * @returns {yargs.CommandModule<{}, {}>}
 */
module.exports = (ctx) => ({
  command: 'start [@domain]',
  describe: 'Start a clone',
  // Help is provided by the child process (../start.js)
  builder: yargs => yargs.help(false),
  handler: () => {
    ctx.proc = new StartCloneProc(ctx);
  }
});

class StartCloneProc extends Proc {
  /**
   * @param {ReplCmdContext} ctx
   */
  constructor(ctx) {
    const clone = fork(
      join(__dirname, '../..', 'index.js'),
      ctx.args,
      { stdio: [ctx.stdin, null, null, 'ipc'] });
    super(clone.stdout, clone.stderr);
    // We hope that 'started' will arrive before 'exit'
    clone.once('exit', () => this.setDone());
    clone.once('error', err => this.setDone(err));
    clone.once('message', msg => {
      switch (msg['@type']) {
        case 'started':
          this.emit('message', msg);
          ctx.clones.add(msg['@id'], clone);
          this.setDone();
          break;
        case 'error':
          this.setDone(msg.err);
          break;
        default:
          this.emit('message', msg);
      }
    });
  }
}
