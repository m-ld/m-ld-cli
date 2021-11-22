const readline = require('readline');
const yargs = require('yargs/yargs');
const { ChildProcs } = require('../../lib/ChildProcs');
const { Proc, NOOP } = require('../../lib/Proc');
const { execute } = require('../../lib/Exec');
const cmds = require('../cmds.json');

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
exports.handler = () => new Repl().start();

/**
 * @typedef {object} ReplCmdContext
 * @property {ChildProcs} childProcs
 * @property {string} cmdId
 * @property {import('stream').Readable} stdin
 * @property {string[]} args
 * @property {Proc} proc
 */

class Repl {
  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: `${PROMPT} `
    });
    // Running child processes
    this.childProcs = new ChildProcs;
    let cmdId = 0;
    this.nextCmdId = () => `${cmdId++}`;
  }

  start() {
    this.rl
      .on('line', line => this.handle(line))
      .on('close', () => {
        process.exit(0);
      });
    this.rl.prompt();
  }

  handle(line) {
    let cleanup = [];
    let next = () => {
      cleanup.splice(0).forEach(close => close());
      next = NOOP;
      this.rl.prompt();
    };
    try {
      const proc = execute(line, this.executeCmd.bind(this));
      if (proc != null) {
        // Root output (if any) is written to the console
        cleanup.push(this.streamLines(proc.stdout, console.log));
        cleanup.push(this.streamLines(proc.stderr, console.error));
        // Log host messages to console
        proc.on('message', msg => console.log(msg));
        proc.on('error', err => {
          console.trace(err);
          next();
        });
        proc.on('done', next);
      } else {
        next();
      }
    } catch (err) {
      console.error(err);
      next();
    }
  }

  /**
   * @param {string[]} args
   * @param {import('stream').Readable} [stdin]
   * @returns {Proc|null}
   */
  executeCmd(args, stdin) {
    const ctx = /**@type {ReplCmdContext}*/{
      childProcs: this.childProcs,
      cmdId: this.nextCmdId(),
      stdin, args, proc: null
    };
    try {
      // noinspection JSCheckFunctionSignatures
      yargs(args)
        .scriptName(PROMPT)
        .exitProcess(false)
        .command(require('./file')(ctx))
        .command(require('./fork')(ctx, cmds.io))
        .command(require('./fork')(ctx, cmds.start))
        .command(require('./status')(ctx))
        .command(require('./read')(ctx))
        .command(require('./write')(ctx))
        .command(require('./stop')(ctx))
        .command(require('./fake')(ctx))
        .command('exit', 'Exit this REPL',
          yargs => yargs, () => {
            this.close().catch(console.error);
          })
        .fail((msg, err, yargs) => {
          console.log(msg);
          yargs.showHelp();
        })
        .parseSync();
      return ctx.proc;
    } catch (e) {
      console.trace(e);
    }
  }

  streamLines(input, handler) {
    const sl = readline.createInterface({ input, crlfDelay: Infinity });
    sl.on('line', handler);
    return sl.close.bind(sl);
  }

  async close() {
    await this.childProcs.close();
    this.rl.close();
  }
}