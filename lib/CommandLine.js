const { ChildProcs } = require('./ChildProcs');
const { execute } = require('./Exec');
const { Proc, NOOP } = require('./Proc');
const createYargs = require('yargs/yargs');
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
      let /**@type Proc | null*/proc = null, errors = [];
      // Ensure the context is available for the commands to inspect
      Object.assign(ctx, {
        args, stdin, exec: createProc => {
          if (errors.length > 0) {
            // Parse failure is a user error, not a process error
            yargs.showHelp(lineOut);
            for (let err of errors)
              lineOut(err);
          } else {
            proc = createProc();
          }
        }
      });
      const yargs = createYargs(args)
        // Not using strict options, some commands delegate
        .strictCommands(true)
        .scriptName(this.opts.prompt)
        .version(false)
        .exitProcess(false);
      // Add custom commands and global commands
      this.buildCommands(yargs, ctx)
        .command('exit', 'Exit this REPL',
          yargs => yargs, () => {
            this.close().catch(lineErr);
          })
        .middleware(argv => {
          if (argv['help'])
            yargs.showHelp(lineOut);
        }, true)
        .fail(msg => {
          errors.push(msg);
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