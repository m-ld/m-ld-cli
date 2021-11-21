const { Proc } = require('../../lib/Proc');
const { fork } = require('child_process');
const cmds = require('../cmds.json');

/**
 * @typedef {import('yargs')} yargs
 * @typedef {import('index').ReplCmdContext} ReplCmdContext
 */

/**
 * @param {ReplCmdContext} ctx
 * @param {string} command A top-level command from the parent folder
 * @returns {yargs.CommandModule<{}, {}>}
 */
module.exports = (ctx, command) => ({
  ...cmds[command],
  // Help is provided by the child process
  builder: yargs => yargs.help(false),
  handler: () => {
    ctx.proc = new ForkProc(ctx);
  }
});

class ForkProc extends Proc {
  /**
   * @param {ReplCmdContext} ctx
   */
  constructor(ctx) {
    const childProcess = fork(
      require.resolve('../../index'), ctx.args,
      { stdio: [ctx.stdin, null, null, 'ipc'] });
    super(childProcess.stdout, childProcess.stderr);
    // We hope that 'started' will arrive before 'exit'
    childProcess.once('exit', () => this.setDone());
    childProcess.once('error', err => this.setDone(err));
    childProcess.once('message', msg => {
      switch (msg['@type']) {
        case 'started':
          this.emit('message', msg);
          if (msg['@id'] != null)
            ctx.childProcs.add(msg['@id'], childProcess);
          if (typeof msg.env == 'object')
            Object.assign(process.env, msg.env);
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

