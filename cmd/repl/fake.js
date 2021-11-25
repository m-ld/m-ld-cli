const { SyncProc } = require('../../lib/Proc');
const { Readable } = require('stream');
const getStream = require('get-stream');
const faker = require('faker');

/**
 * @typedef {import('yargs')} yargs
 * @typedef {{ input?: string, count: number, seed?: number }} FakerOpts
 */

/**
 * @param {CmdContext} ctx
 * @returns {yargs.CommandModule<{}, FakerOpts>}
 */
module.exports = (ctx) => ({
  command: 'fake [input]',
  describe: 'Generate fake subjects using a template',
  builder: yargs => yargs
    .positional('input', {
      string: true,
      describe: 'Template JSON object for fake subjects'
    })
    .option('count', {
      number: true,
      describe: 'How many fake subjects to generate',
      default: 1
    })
    .number('seed'),
  handler: argv => {
    ctx.proc = new FakerProc(ctx, argv);
  }
});

class FakerProc extends SyncProc {
  constructor(ctx, argv) {
    super(new FakerStream(
      argv.input || getStream(ctx.stdin),
      argv.count, argv.seed));
  }
}

class FakerStream extends Readable {
  /**
   * @param {string|Promise<string>} input template
   * @param {number} count
   * @param {number} [seed]
   */
  constructor(input, count, seed) {
    super();
    if (seed != null)
      faker.seed(seed);
    this._index = -1;
    this._count = count || 1;
    this._input = input;
  }

  async _read() {
    if (this._index === -1) {
      this.push(Buffer.from('['));
      this._index++;
    } else if (this._index === this._count) {
      this.push(null);
    } else {
      this.push(Buffer.from(faker.fake(await this._input)) +
        (++this._index === this._count ? ']' : ','));
    }
  }
}