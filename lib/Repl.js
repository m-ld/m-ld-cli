const { CommandLine } = require('./CommandLine');
const readline = require('readline');

/**
 * Default options for a REPL control the terminal process
 */
const defaultOpts = {
  input: process.stdin,
  output: process.stdout,
  console: console,
  cb: () => process.exit(0)
};

/** @abstract */
class Repl extends CommandLine {
  /**
   * @param {GlobalOpts} opts
   * @param {string} opts.prompt
   */
  constructor(opts) {
    super(opts);
    this.prompt = opts.prompt;
  }

  /**
   * @param {object} [opts]
   * @param {import('stream').Readable} [opts.input]
   * @param {import('stream').Writable} [opts.output]
   * @param {import('console').Console} [opts.console]
   * @param {() => void} [opts.cb] called back on close
   */
  start(opts) {
    const { input, output, console, cb } = { ...defaultOpts, ...opts };
    this.rl = readline.createInterface({
      input, output, prompt: `${this.prompt} `
    }).on('line', line => {
      this.rl.pause();
      this.execute(line, console.log, console.error)
        .catch(console.log)
        // We always re-prompt even if there was an error
        .finally(() => this.rl.prompt());
    }).on('close', cb);
    this.rl.prompt();
  }

  async close() {
    await super.close();
    this.rl.close();
  }
}

exports.Repl = Repl;