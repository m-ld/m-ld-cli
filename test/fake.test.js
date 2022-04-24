const yargs = require('yargs/yargs');
const { ChildProcs } = require('../lib/ChildProcs');
const { Readable } = require('stream');
const fake = require('../cmd/repl/fake');
const getStream = require('get-stream');

describe('Fake command', () => {
  async function doFake(args, stdin) {
    let /**@type Proc*/proc;
    const ctx = /**@type {CmdContext}*/{
      childProcs: new ChildProcs,
      cmdId: '1', args, stdin,
      exec: fn => proc = fn()
    };
    yargs(args)
      .exitProcess(false)
      .command(fake(ctx))
      .parseSync();
    // Make sure that done is emitted
    const [, out] = await Promise.all([proc.done, getStream(proc.stdout)]);
    return JSON.parse(out);
  }

  test('generates from argument input', async () => {
    const out = await doFake(['fake', '{"@id":"{{datatype.uuid}}"}']);
    expect(out).toEqual([{
      '@id': expect.stringMatching(/[0-9a-f-]{36}/)
    }]);
  });

  test('generates from stdin input', async () => {
    const out = await doFake(['fake'],
      Readable.from(['{"@id":"{{datatype.uuid}}"}']));
    expect(out).toEqual([{
      '@id': expect.stringMatching(/[0-9a-f-]{36}/)
    }]);
  });
});