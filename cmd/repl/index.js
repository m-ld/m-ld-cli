const readline = require('readline');
const shell = require('shell-quote');
const yargs = require('yargs/yargs');
const { Readable } = require('stream');
const { ChildProcess } = require('child_process');
const mergeStream = require('merge-stream');
const { Proc, NOOP } = require('../../lib/Proc');

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
exports.handler = () => new Index().start();

/**
 * @typedef {object} ReplCmdContext
 * @property {ChildProcs} childProcs
 * @property {string} cmdId
 * @property {Readable} stdin
 * @property {string[]} args
 * @property {Proc} proc
 */

class Index {
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
      const cmd = shell.parse(line);
      let root = new Exec(null), current = root;
      for (let entry of cmd)
        current = current.push(entry);
      const proc = root.exec(this);
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
   * @param {Readable} [stdin]
   * @returns {Proc|null}
   */
  exec(args, stdin) {
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
        .command(require('./fork')(ctx, 'io'))
        .command(require('./fork')(ctx, 'start'))
        .command(require('./status')(ctx))
        .command(require('./read')(ctx))
        .command(require('./write')(ctx))
        .command(require('./stop')(ctx))
        .command(require('./fake')(ctx))
        .command('exit', 'Exit this REPL', yargs => yargs, () => {
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

class Exec {
  /**
   * @param {Exec|null} parent
   * @param {Exec} [copy]
   */
  constructor(parent, copy) {
    this.parent = parent;
    if (copy != null) {
      const { args, left, op, right } = copy;
      Object.assign(this, { args, left, op, right });
    } else {
      // We either have args...
      this.args = /**@type {string[]}*/[];
      // ... or a binary
      this.left = /**@type {Exec|null}*/null;
      this.op = /**@type {shell.ControlOperator|null}*/null;
      this.right = /**@type {Exec|null}*/null;
    }
  }

  /** @param {shell.ParseEntry} entry */
  push(entry) {
    if (typeof entry == 'string') {
      this.args.push(entry);
      return this;
    } else if ('op' in entry) {
      switch (entry.op) {
        case '(':
          return this;
        case ')':
          return this.parent;
        case '>':
          this.left = new Exec(this, this);
          this.args = [];
          this.op = entry.op;
          return this.right = new Exec(this);
        default:
          throw `Unsupported operator: ${entry.op}`;
      }
    }
  }

  /**
   * @returns {Proc}
   * @param {Index} repl
   * @param {Readable} [stdin]
   */
  exec(repl, stdin) {
    let proc = /**@type {Proc|null}*/null;
    if (this.left == null) {
      proc = repl.exec(this.args, stdin);
    } else {
      switch (this.op) {
        case '>':
          const left = this.left.exec(repl, stdin);
          const right = this.right.exec(repl, left.stdout);
          proc = new BiProc(right.stdout, left, right);
          break;
      }
    }
    return proc;
  }

  toString() {
    return this.op ? `(${this.left} ${this.op} ${this.right})` : `${this.args}`;
  }
}

class BiProc extends Proc {
  /**
   * @param {Readable} [stdout]
   * @param {Proc} left
   * @param {Proc} right
   */
  constructor(stdout, left, right) {
    super(stdout, mergeStream(left.stderr, right.stderr));
    Promise.all([left.done, right.done])
      .then(() => this.setDone(), this.setDone);
    left.on('message', msg => this.emit('message', msg));
    right.on('message', msg => this.emit('message', msg));
  }
}

class ChildProcs {
  constructor() {
    /** @type {Map<string, ChildProcess>} */
    this._children = new Map;
  }

  get(childId) {
    return this._children.get(childId);
  }

  add(childId, childProcess) {
    this._children.set(childId, childProcess);
    childProcess.on('exit', () => this._children.delete(childId));
  }

  childIdOption(verb) {
    // noinspection JSUnusedGlobalSymbols
    const option = /**@type {yargs.Options}*/{
      describe: `The @id of the process to ${verb}`,
      coerce: childId => {
        if (!this._children.has(childId))
          throw new Error(`Process ${childId} not found`);
        return childId;
      }
    };
    if (this._children.size === 0) {
      option.demandOption = true;
    } else {
      for (let childId of this._children.keys())
        option.default = childId;
    }
    return option;
  }

  /** @param {ChildProcess} childProcess */
  stop(childProcess) {
    return new Promise((resolve, reject) => {
      childProcess.send({ id: 'stop', '@type': 'stop' });
      childProcess.once('exit', resolve);
      childProcess.once('error', reject);
    });
  }

  async close() {
    for (let childProcess of this._children.values())
      await this.stop(childProcess);
  }
}
