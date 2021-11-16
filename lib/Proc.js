const { EventEmitter } = require('events');
const { Readable } = require('stream');

/** @event Proc#done when control can be returned to the user or next process */
/** @event Proc#error when something goes wrong ('done' will not be emitted)*/
/** @event Proc#message a message to log on the console */

const NOOP = () => {
};

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

exports.NOOP = NOOP;
exports.Proc = Proc;

