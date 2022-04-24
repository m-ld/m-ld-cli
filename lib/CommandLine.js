const { ChildProcs } = require('./ChildProcs');
const { execute } = require('./Exec');
const { Proc, NOOP } = require('./Proc');
const yargs = require('yargs/yargs');
const readline = require('readline');

/**
 * @typedef {object} CmdContext
 * @property {string} cmdId
 * @property {ChildProcs} childProcs
 * @property {import('stream').Readable} stdin
 * @property {string[]} args
 * @property {(proc: () => Proc) => void} exec
 * @property {GlobalOpts} opts
 */

/**
 * @abstract
 * Abstract class for executing command lines
 */
class CommandLine {
  /**
   * @param {GlobalOpts} opts
   * @param {string} opts.prompt
   */
  constructor(opts) {
    this.opts = opts;
    // Running child processes
    this.childProcs = new ChildProcs;
    let cmdId = 0;
    this.nextCmdId = () => `${cmdId++}`;
  }

  /**
   * Executes a command line.
   * @param {string} line user input
   * @param {(data: any, ...args: any[]) => void} lineOut a receiver for output lines
   * @param {(data: any, ...args: any[]) => void} [lineErr] a receiver for error lines
   * @return {Promise<void>}
   */
  execute(line, lineOut, lineErr = NOOP) {
    let cleanup = [];
    return new Promise((resolve, reject) => {
      const proc = execute(line, this.cmdExecutor(lineOut, lineErr));
      if (proc != null) {
        // Root output (if any) is written to the console until "done"
        cleanup.push(
          this.toOut(proc.stdout, lineOut),
          this.toOut(proc.stderr, lineErr));
        // Log host messages to console
        // noinspection JSUnresolvedFunction
        proc.on('message', lineOut);
        // noinspection JSUnresolvedFunction
        proc.on('error', reject);
        // noinspection JSUnresolvedFunction
        proc.on('done', resolve);
      } else {
        resolve();
      }
    }).finally(() => {
      cleanup.forEach(close => close());
    });
  }

  /**
   * @returns {CommandExec}
   */
  cmdExecutor(lineOut, lineErr) {
    const ctx = /**@type {CmdContext}*/{
      cmdId: this.nextCmdId(),
      childProcs: this.childProcs,
      opts: this.opts
    };
    return /**@type {CommandExec}*/((args, stdin) => {
      let /**@type Proc | null*/proc = null, errMsg = null;
      // Ensure the context is available for the commands to inspect
      Object.assign(ctx, {
        args, stdin, exec: createProc => {
          if (errMsg != null)
            lineOut(errMsg);
          else
            proc = createProc();
        }
      });
      const argv = yargs(args)
        // Not using strict options, some commands delegate
        .strictCommands(true)
        .scriptName(this.opts.prompt)
        .exitProcess(false);
      // Add custom commands and global commands
      this.buildCommands(argv, ctx)
        .command('exit', 'Exit this REPL',
          yargs => yargs, () => {
            this.close().catch(lineErr);
          })
        .fail((msg, err, yargs) => {
          // Parse failure is a user error, not a process error
          yargs.showHelp(lineOut);
          errMsg = msg;
        })
        .parseSync();
      return proc;
    });
  }

  /**
   * Override to add available commands
   * @param {yargs.Argv} yargs
   * @param {CmdContext} ctx
   */
  buildCommands(yargs, ctx) {
    return yargs;
  }

  toOut(input, lineOut) {
    const sl = readline.createInterface({ input, crlfDelay: Infinity });
    sl.on('line', lineOut);
    // Errors in the proc should be handled by "done"
    sl.on('error', NOOP);
    return sl.close.bind(sl);
  }

  async close() {
    await this.childProcs.close();
  }
}

exports.CommandLine = CommandLine;