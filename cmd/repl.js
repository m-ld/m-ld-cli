const readline = require('readline');
const shell = require('shell-quote');
const yargs = require('yargs/yargs');
const fs = require('fs');
const { Readable, pipeline } = require('stream');
const { EventEmitter } = require('events');
const { fork, ChildProcess } = require('child_process');
const { join } = require('path');
const getStream = require('get-stream');
const mergeStream = require('merge-stream');

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
      if (typeof err == 'string')
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
    let proc = /**@type {Proc|null}*/null;
    yargs(args)
      .scriptName(PROMPT)
      .exitProcess(false)
      .default('cmdId', this.nextCmdId)
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
      .command('start [@domain]', 'Start a clone process',
        // Help is provided by the child process (../cmd/start.js)
        yargs => yargs.help(false),
        () => {
          proc = new StartCloneProc(args, stdin).on('done', () => {
            this.clones.set(proc.cloneId, proc.child);
            proc.child.on('exit', () => this.clones.delete(proc.cloneId));
          });
        })
      .command('read [jrql]', 'Read from a clone using json-rql',
        yargs => yargs
          .positional('jrql', {
            describe: 'Query in json-rql (TIP: use single quotes)',
            coerce: JSON.parse,
            demandOption: stdin == null
          })
          .option('@id', this.cloneIdOption('read')),
        argv => {
          proc = new ReadCloneProc(argv.cmdId, this.clones.get(argv['@id']), argv.jrql, stdin);
        })
      .command('stop [@id]', 'Stops a clone process',
        yargs => yargs.option('@id', this.cloneIdOption('stop')),
        argv => {
          proc = new StopCloneProc(this.clones.get(argv['@id']));
        })
      .command('exit', 'Exit this REPL', yargs => yargs, () => {
        this.close().catch(console.error);
      })
      .parse();
    return proc;
  }

  cloneIdOption(verb) {
    const option = /**@type {yargs.Options}*/{
      describe: 'The @id of the clone to ' + verb,
      coerce: cloneId => {
        if (!this.clones.has(cloneId))
          throw new Error(`Clone ${cloneId} not found`);
        return cloneId;
      }
    };
    if (this.clones.size === 1)
      option.default = this.clones.keys().next().value;
    else
      option.demandOption = true;
    return option;
  }

  streamLines(input, handler) {
    const sl = readline.createInterface({ input, crlfDelay: Infinity });
    sl.on('line', handler);
    return sl.close.bind(sl);
  }

  async close() {
    for (let child of this.clones.values())
      await stop(child);
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
   * @param {Repl} repl
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

/** @event Proc#done when control can be returned to the user or next process */
/** @event Proc#error when something goes wrong ('done' will not be emitted)*/
/** @event Proc#message a message to log on the console */

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
    this.setDone = err => {
      this.setDone = NOOP;
      if (err)
        this.emit('error', err);
      else
        this.emit('done', 0);
    };
  }

  get done() {
    return new Promise((resolve, reject) => {
      this.on('done', resolve);
      this.on('error', reject);
    });
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

class ReadFileProc extends Proc {
  /**
   * @param {string} filePath
   */
  constructor(filePath) {
    super(fs.createReadStream(filePath));
    this.stdout
      .on('close', () => this.setDone())
      .on('error', err => this.setDone(err));
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
    pipeline(stdin, fileOut, err => err && this.setDone(err));
  }
}

class StartCloneProc extends Proc {
  /**
   * @param {string[]} args
   * @param {Readable} [stdin]
   */
  constructor(args, stdin) {
    const clone = fork(join(__dirname, '..', 'index.js'), args, { stdio: [stdin, null, null, 'ipc'] });
    super(clone.stdout, clone.stderr);
    // We hope that 'started' will arrive before 'exit'
    clone.once('exit', () => this.setDone());
    clone.once('error', err => this.setDone(err));
    clone.once('message', msg => {
      switch (msg['@type']) {
        case 'started':
          this.emit('message', msg);
          this.cloneId = msg['@id'];
          this.setDone();
          break;
        case 'error':
          this.setDone(msg.err);
          break;
        default:
          this.emit('message', msg);
      }
    });
    this.child = clone;
  }
}

/** @param {ChildProcess} clone */
function stop(clone) {
  return new Promise((resolve, reject) => {
    clone.send({ id: 'stop', '@type': 'stop' });
    clone.once('exit', resolve);
    clone.once('error', reject);
  });
}

class StopCloneProc extends Proc {
  /**
   * @param {ChildProcess} clone
   */
  constructor(clone) {
    super(clone.stdout, clone.stderr);
    stop(clone).then(this.setDone, err => this.setDone(err));
    clone.on('message', msg => {
      switch (msg['@type']) {
        case 'stopped':
          this.emit('message', msg);
      }
    });
  }
}

class ReadCloneProc extends Proc {
  /**
   * @param {string} cmdId
   * @param {ChildProcess} clone
   * @param {string} [jrql]
   * @param {Readable} [stdin]
   */
  constructor(cmdId, clone, jrql, stdin) {
    super(new Readable({ read: () => {} }));
    clone.on('message', msg => {
      if (msg.cmdId === cmdId) {
        switch (msg['@type']) {
          case 'next':
            this.stdout.push(JSON.stringify(msg.subject));
            break;
          case 'complete':
            this.stdout.push(null);
            break;
          case 'error':
            this.stdout.destroy(msg.err);
        }
      }
    });
    this.stdout
      .on('close', () => this.setDone())
      .on('error', err => this.setDone(err));
    (async () => {
      clone.send({
        id: cmdId,
        '@type': 'read',
        jrql: jrql || await getStream(stdin)
      });
    })().catch(this.setDone);
  }
}
