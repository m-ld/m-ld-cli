const { once, EventEmitter } = require('events');
const { Readable, pipeline } = require('stream');
const JSONStream = require('JSONStream');
const getStream = require('get-stream');

/** @event Proc#done when control can be returned to the user or next process */
/** @event Proc#error when something goes wrong ('done' will not be emitted)*/
/** @event Proc#message a message to log on the console */

const NOOP = () => {
};

/**
 * A base-class for operating system-like processes, with output and error
 * streams and a concept of "done", which may be unrelated to process exit.
 */
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
    // noinspection JSCheckFunctionSignatures
    /** Convenience for consumers to await "done" */
    this.done = once(this, 'done').then(NOOP); // Scrub any params
    this.done.catch(NOOP); // Prevents unhandled rejection
  }
}

/**
 * A process which is 'done' when the output stream completes
 */
class SyncProc extends Proc {
  constructor(stdout, stderr) {
    super(stdout, stderr);
    this.stdout
      .on('close', () => this.setDone())
      .on('error', err => this.setDone(err));
  }
}

class JsonSinkProc extends Proc {
  /**
   * @param {import('stream').Writable} sink
   * @param {string} path JSONPath path into the input stream
   * @param {import('stream').Readable} stdin
   * @param {string} [json] literal data (overrides stdin)
   */
  constructor(sink, path, stdin, json) {
    super();
    if (path === '$') {
      this.writeOne(stdin, json, sink).catch(this.setDone);
    } else {
      pipeline(
        json ? Readable.from([arrayJsonString(json)]) : stdin,
        JSONStream.parse(path),
        sink,
        err => this.setDone(err));
    }
  }

  /**
   * @param {import('stream').Readable} stdin
   * @param {string} [json] literal data (overrides stdin)
   * @param {import('stream').Writable} sink
   * @returns {Promise<void>}
   */
  async writeOne(stdin, json, sink) {
    const data = JSON.parse(json || await getStream(stdin));
    pipeline(
      Readable.from([data]),
      sink,
      err => this.setDone(err));
  }
}

/**
 *
 * @param {string} jrql
 * @returns {string}
 */
function arrayJsonString(jrql) {
  jrql = jrql.trim();
  return jrql.startsWith('[') ? jrql : `[${jrql}]`;
}

exports.NOOP = NOOP;
exports.Proc = Proc;
exports.SyncProc = SyncProc;
exports.JsonSinkProc = JsonSinkProc;