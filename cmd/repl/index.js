const readline = require('readline');
const cmds = require('../cmds.json');
const { CommandLine } = require('../../lib/CommandLine');

exports.command = ['$0', 'repl'];
exports.describe = 'start a m-ld REPL';

const PROMPT = 'm-ld>';

/**
 * @typedef {{ logLevel:string }} ReplOpts
 * @param {yargs.Argv<ReplOpts>} yargs
 * @returns {yargs.Argv<ReplOpts>}
 */
exports.builder = yargs => yargs
  .default('logLevel', process.env.LOG);

exports.handler = () => {
  new Repl(process.stdin, process.stdout, console,
    () => process.exit(0));
};

class Repl extends CommandLine {
  /**
   * @param {import('stream').Readable} input
   * @param {import('stream').Writable} output
   * @param {import('console').Console} console
   * @param {() => void} cb called back on close
   */
  constructor(input, output, console, cb) {
    super(PROMPT);
    this.rl = readline.createInterface({
      input, output, prompt: `${PROMPT} `
    }).on('line', line => {
      this.rl.pause();
      this.execute(line, console.log, console.error)
        .catch(console.log)
        // We always re-prompt even if there was an error
        .finally(() => this.rl.prompt());
    })
      .on('close', cb);
    this.rl.prompt();
  }

  buildCommands(yargs, ctx) {
    // noinspection JSCheckFunctionSignatures
    return yargs
      .command(require('./file')(ctx))
      .command(require('./fork')(ctx, cmds.io))
      .command(require('./fork')(ctx, cmds.start))
      .command(require('./status')(ctx))
      .command(require('./read')(ctx))
      .command(require('./write')(ctx))
      .command(require('./stop')(ctx))
      .command(require('./fake')(ctx));
  }

  async close() {
    await super.close();
    this.rl.close();
  }
}