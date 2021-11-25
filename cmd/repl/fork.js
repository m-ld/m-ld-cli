const { Proc } = require('../../lib/Proc');
const { fork } = require('child_process');

/**
 * @typedef {import('yargs')} yargs
 */

/**
 * @param {CmdContext} ctx
 * @param {{command: string, describe: string}} meta
 * @returns {yargs.CommandModule<{}, {}>}
 */
module.exports = (ctx, meta) => ({
  ...meta,
  builder: yargs => yargs
    .help(false) // Help is provided by the child process
    .option('modulePath', {
      hidden: true, // This is only an option for testing
      default: require.resolve('../../index')
    }),
  handler: ({ modulePath }) => {
    ctx.proc = new ForkProc(modulePath, ctx);
  }
});

class ForkProc extends Proc {
  /**
   * @param {string} modulePath
   * @param {CmdContext} ctx
   */
  constructor(modulePath, ctx) {
    const childProcess = fork(
      modulePath, ctx.args,
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

