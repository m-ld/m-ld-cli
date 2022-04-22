const readline = require('readline');
const cmds = require('../cmds.json');
const { CommandLine } = require('../../lib/CommandLine');

Object.assign(exports, require('../cmds.json').repl);

/**
 * @param {import('yargs/yargs').Argv<GlobalOpts>} yargs
 * @returns {import('yargs/yargs').Argv<GlobalOpts>}
 */
exports.builder = yargs => yargs;

/**
 * @param {GlobalOpts} argv
 */
exports.handler = argv => new Repl({
  ext: argv.ext,
  logLevel: argv.logLevel,
  prompt: 'm-ld>',
  input: process.stdin,
  output: process.stdout,
  console: console,
  cb: () => process.exit(0)
});

class Repl extends CommandLine {
  /**
   * @param {GlobalOpts} opts
   * @param {string} opts.prompt
   * @param {import('stream').Readable} opts.input
   * @param {import('stream').Writable} opts.output
   * @param {import('console').Console} opts.console
   * @param {() => void} opts.cb called back on close
   */
  constructor(opts) {
    super(opts);
    const { prompt, input, output, console, cb } = opts;
    this.rl = readline.createInterface({
      input, output, prompt: `${prompt} `
    }).on('line', line => {
      this.rl.pause();
      this.execute(line, console.log, console.error)
        .catch(console.log)
        // We always re-prompt even if there was an error
        .finally(() => this.rl.prompt());
    }).on('close', cb);
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