/**
 * @typedef {import('yargs')} yargs
 * @typedef {import('child_process').ChildProcess} ChildProcess
 */

/**
 * Utility class for keeping track of Node child processes.
 */
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

exports.ChildProcs = ChildProcs;