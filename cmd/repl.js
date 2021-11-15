const readline = require('readline');
const shell = require('shell-quote');
const yargs = require('yargs/yargs');
const fs = require('fs');
const { Readable, pipeline } = require('stream');
const { EventEmitter } = require('events');

exports.command = ['$0', 'repl'];
exports.describe = 'start a m-ld REPL';

const PROMPT = 'm-ld>';
const NOOP = () => {
};

/** @typedef {{ logLevel:string }} ReplOpts */

/**
 * @param {yargs.Argv<ReplOpts>} yargs
 * @returns {yargs.Argv<ReplOpts>}
 */
exports.builder = yargs => yargs
  .default('logLevel', process.env.LOG);

/**
 * @returns {Promise<void>}
 */
exports.handler = async () => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `${PROMPT} `
  });
  rl.prompt();
  rl.on('line', line => {
    let next = () => {
      next = NOOP;
      rl.prompt();
    };
    try {
      const cmd = shell.parse(line);
      let root = new Exec(null), current = root;
      for (let entry of cmd)
        current = current.push(entry);
      const proc = current.exec(rl);
      if (proc != null) {
        // Root output (if any) is written to the console
        const out = readline.createInterface({
          input: proc.stdout,
          crlfDelay: Infinity
        });
        out.on('line', line => console.log(line));
        proc.on('error', err => {
          console.trace(err);
          out.close();
          next();
        });
        proc.on('exit', next);
      } else {
        next();
      }
    } catch (err) {
      console.trace(err);
      next();
    }
  }).on('close', () => {
    process.exit(0);
  });
};

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
        case '<':
        case '>':
        case '&':
        case '&&':
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
   * @returns {Proc|null}
   * @param {readline.Interface} rl
   * @param {Readable} [stdin]
   */
  exec(rl, stdin) {
    let proc = /**@type {Proc|null}*/null;
    if (this.args != null) {
      yargs(this.args, __dirname)
        .scriptName(PROMPT)
        .exitProcess(false)
        .command('$0 [file]', 'Read or write a file',
          yargs => yargs.positional('file', {
            string: true,
            describe: 'File path to read or write',
            normalize: true
          }),
          ({ file }) => {
          if (stdin == null)
            proc = new ReadFileProc(file);
          else
            proc = new WriteFileProc(file, stdin);
          })
        .command('start', 'Start a clone process', yargs => yargs, argv => {
          // TODO Start a clone child process
          console.log(argv);
        })
        .command('exit', 'Exit this REPL', yargs => yargs, () => {
          rl.close();
        })
        .parse();
    }
    return proc;
  }

  toString() {
    return this.op ? `(${this.left} ${this.op} ${this.right})` : `${this.args}`;
  }
}

/** @event Proc#exit */
/** @event Proc#error */
class Proc extends EventEmitter {
  /**
   * @param {Readable} [stdout]
   */
  constructor(stdout) {
    super();
    this.stdout = stdout || Readable.from([]);
    // Make sure exit is called only once
    /**
     * @fires Proc#exit if no error is passed
     * @fires Proc#error if an error is passed
     * @param err if truthy, an error
     */
    this.exit = err => {
      this.exit = NOOP;
      if (err)
        this.emit('error', err);
      else
        this.emit('exit', 0);
    };
  }
}

class ReadFileProc extends Proc {
  /**
   * @param {string} filePath
   */
  constructor(filePath) {
    super(fs.createReadStream(filePath));
    this.stdout
      .on('close', () => this.exit())
      .on('error', err => this.exit(err));
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
    fileOut.on('open', () => this.exit());
    pipeline(stdin, fileOut, err => err && this.exit(err));
  }
}

