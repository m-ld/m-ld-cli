const cmds = require('../cmds.json');
const { Repl } = require('../../lib/Repl');

Object.assign(exports, require('../cmds.json').repl);

/**
 * @param {import('yargs/yargs').Argv<GlobalOpts>} yargs
 * @returns {import('yargs/yargs').Argv<GlobalOpts>}
 */
exports.builder = yargs => yargs;

/**
 * @param {GlobalOpts} argv
 */
exports.handler = argv => new class extends Repl {
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
}({
  ext: argv.ext,
  logLevel: argv.logLevel,
  prompt: 'm-ld>'
}).start();
