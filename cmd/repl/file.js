const fs = require('fs');
const { pipeline } = require('stream');
const { Proc, SyncProc } = require('../../lib/Proc');

/**
 * @typedef {import('yargs')} yargs
 * @typedef {{ file: string }} FileOpts
 */

/**
 * @param {CmdContext} ctx
 * @returns {yargs.CommandModule<{}, FileOpts>}
 */
module.exports = (ctx) => ({
  command: '$0 [file]',
  describe: 'Read or write a file',
  builder: yargs => yargs
    .positional('file', {
      string: true,
      describe: 'File path to read or write',
      normalize: true
    }),
  handler: argv => {
    if (ctx.stdin == null)
      ctx.proc = new ReadFileProc(argv.file);
    else
      ctx.proc = new WriteFileProc(argv.file, ctx.stdin);
  }
});

class ReadFileProc extends SyncProc {
  /**
   * @param {string} filePath
   */
  constructor(filePath) {
    super(fs.createReadStream(filePath));
  }
}

class WriteFileProc extends Proc {
  /**
   * @param {string} filePath
   * @param {Readable} stdin
   */
  constructor(filePath, stdin) {
    super();
    const fileOut = fs.createWriteStream(filePath);
    // As soon as the stream is open, we are done
    fileOut.on('open', () => this.setDone());
    pipeline(stdin, fileOut, err => {
      err && this.setDone(err);
      this.emit('exit', 0);
    });
  }
}
