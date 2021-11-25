const yargs = require('yargs/yargs');
const file = require('../cmd/repl/file');
const { ChildProcs } = require('../lib/ChildProcs');
const { Readable } = require('stream');
const { writeFileSync, readFileSync, rmSync } = require('fs');
const { tmpNameSync } = require('tmp');
const getStream = require('get-stream');

describe('File command', () => {
  let tmpFileName;

  beforeEach(() => {
    tmpFileName = tmpNameSync({});
  });

  afterEach(() => {
    rmSync(tmpFileName);
  });

  test('Writes to a file', done => {
    const ctx = /**@type {CmdContext}*/{
      childProcs: new ChildProcs,
      cmdId: '1',
      args: [tmpFileName],
      proc: null,
      stdin: Readable.from(['data to write'])
    };
    yargs(tmpFileName)
      .exitProcess(false)
      .command(file(ctx))
      .parseSync();
    ctx.proc.on('done', () => {
      // File is open, but not written until exit
      ctx.proc.on('exit', () => {
        expect(readFileSync(tmpFileName, 'utf-8')).toBe('data to write');
        done();
      });
    });
  });

  test('Reads from a file', async () => {
    const ctx = /**@type {CmdContext}*/{
      childProcs: new ChildProcs,
      cmdId: '1',
      args: [tmpFileName],
      proc: null
    };
    writeFileSync(tmpFileName, 'data to read', 'utf-8');
    yargs(tmpFileName)
      .exitProcess(false)
      .command(file(ctx))
      .parseSync();
    const [, data] = await Promise.all([ctx.proc.done, getStream(ctx.proc.stdout)]);
    expect(data).toBe('data to read');
  });
});