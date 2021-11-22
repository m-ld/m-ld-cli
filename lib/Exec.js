const { Proc } = require('./Proc');
const mergeStream = require('merge-stream');
const shell = require('shell-quote');

/**
 * @typedef {(args: string[], stdin: Readable) => Proc|null} CommandExec
 *  executes a single command with arguments
 */

/**
 * Executes the given command line and returns a top-level {@link Proc process}.
 * @param {string} line
 * @param {CommandExec} executeCmd
 * @returns {Proc|null}
 */
function execute(line, executeCmd) {
  const cmd = shell.parse(line);
  let root = new Exec(null), current = root;
  for (let entry of cmd)
    current = current.push(entry);
  return root.exec(executeCmd);
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
   * @param {CommandExec} executeCmd
   * @param {Readable} [stdin]
   * @returns {Proc|null}
   */
  exec(executeCmd, stdin) {
    let proc = /**@type {Proc|null}*/null;
    if (this.left == null) {
      proc = executeCmd(this.args, stdin);
    } else {
      switch (this.op) {
        case '>':
          const left = this.left.exec(executeCmd, stdin);
          const right = this.right.exec(executeCmd, left.stdout);
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

exports.execute = execute;