const readline = require('readline');
const shell = require('shell-quote');
const yargs = require('yargs/yargs');
const fs = require('fs');
const { Readable, pipeline } = require('stream');
const { EventEmitter } = require('events');
const { fork, ChildProcess } = require('child_process');
const { join } = require('path');

exports.command = ['$0', 'repl'];
exports.describe = 'start a m-ld REPL';

const PROMPT = 'm-ld>';
const NOOP = () => {
};

/**
 * @typedef {{ logLevel:string }} ReplOpts
 * @param {yargs.Argv<ReplOpts>} yargs
 * @returns {yargs.Argv<ReplOpts>}
 */
exports.builder = yargs => yargs
  .default('logLevel', process.env.LOG);
exports.handler = () => new Repl().start();

class Repl {
  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: `${PROMPT} `
    });
    // Running clone processes
    /** @type {Map<string, ChildProcess>} */
    this.clones = new Map;
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
      const proc = current.exec(this);
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
      if (typeof err == 'string')
        console.error(err);
      next();
    }
  }

  streamLines(input, handler) {
    const sl = readline.createInterface({ input, crlfDelay: Infinity });
    sl.on('line', handler);
    return sl.close.bind(sl);
  }

  close() {
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
   * @param {Repl} repl
   * @param {Readable} [stdin]
   */
  exec(repl, stdin) {
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
        .command('start', 'Start a clone process',
          // Help is provided by the child process (../cmd/start.js)
          yargs => yargs.help(false),
          () => {
            proc = new StartCloneProc(repl, this.args, stdin);
          })
        .command('stop', 'Stops a clone process',
          yargs => yargs.option('@id', {
            describe: 'The @id of the clone to stop',
            default: repl.clones.keys()[0],
            demandOption: true
          }),
          argv => {
            proc = new StopCloneProc(repl, argv['@id']);
          })
        .command('exit', 'Exit this REPL', yargs => yargs, () => {
          repl.close();
        })
        .parse();
    }
    return proc;
  }

  toString() {
    return this.op ? `(${this.left} ${this.op} ${this.right})` : `${this.args}`;
  }
}

/** @event Proc#done */
/** @event Proc#error */
class Proc extends EventEmitter {
  /**
   * @param {Readable} [stdout]
   * @param {Readable} [stderr]
   */
  constructor(stdout, stderr) {
    super();
    this.stdout = stdout || Readable.from([]);
    this.stderr = stderr || Readable.from([]);
    // Make sure exit is called only once
    /**
     * "done" means return control to the REPL.
     * The process may continue to execute in the background.
     * @fires Proc#done if no error is passed
     * @fires Proc#error if an error is passed
     * @param err if truthy, an error
     */
    this.done = err => {
      this.done = NOOP;
      if (err)
        this.emit('error', err);
      else
        this.emit('done', 0);
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
      .on('close', () => this.done())
      .on('error', err => this.done(err));
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
    fileOut.on('open', () => this.done());
    pipeline(stdin, fileOut, err => err && this.done(err));
  }
}

class StartCloneProc extends Proc {
  /**
   * @param {Repl} repl
   * @param {string[]} args
   * @param {Readable} [stdin]
   */
  constructor(repl, args, stdin) {
    const child = fork(join(__dirname, '..', 'index.js'), args, { stdio: [stdin, null, null, 'ipc'] });
    super(child.stdout, child.stderr);
    // We hope that 'started' will arrive before 'close'
    child.once('close', () => this.done());
    child.once('error', err => this.done(err));
    child.once('message', msg => {
      switch (msg['@type']) {
        case 'started':
          this.emit('message', msg);
          repl.clones.set(msg['@id'], child);
          this.done();
          break;
        case 'error':
          this.done(msg.err);
      }
    });
  }
}

class StopCloneProc extends Proc {
  /**
   * @param {Repl} repl
   * @param {string} cloneId
   */
  constructor(repl, cloneId) {
    const child = repl.clones.get(cloneId);
    if (child != null) {
      super(child.stdout, child.stderr);
      child.send({ id: 'stop', '@type': 'stop' });
      child.once('close', () => this.done());
      child.once('error', err => this.done(err));
      child.on('message', msg => {
        switch (msg['@type']) {
          case 'stopped':
            this.emit('message', msg);
            repl.clones.delete(cloneId);
        }
      });
    } else {
      throw `Clone ${cloneId} not found`;
    }
  }
}
