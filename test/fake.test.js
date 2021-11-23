const yargs = require('yargs/yargs');
const { ChildProcs } = require('../lib/ChildProcs');
const { Readable } = require('stream');
const fake = require('../cmd/repl/fake');
const getStream = require('get-stream');

describe('Fake command', () => {
  async function doFake(args, stdin) {
    const ctx = /**@type {ReplCmdContext}*/{
      childProcs: new ChildProcs,
      cmdId: '1', args, stdin, proc: null
    };
    yargs(args)
      .exitProcess(false)
      .command(fake(ctx))
      .parseSync();
    // Make sure that done is emitted
    const [, out] = await Promise.all([ctx.proc.done, getStream(ctx.proc.stdout)]);
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