const { CommandLine } = require('../lib/CommandLine');
const cmds = require('../cmd/cmds.json');

/**
 * This test suite checks overall system function.
 * - Start & stop socket.io server
 * - Start & stop a clone using socket.io remotes
 * - Check clone status
 * - Read & write clone data
 */
describe('System test with socket.io', () => {
  class IoCommandLine extends CommandLine {
    buildCommands(yargs, ctx) {
      // noinspection JSCheckFunctionSignatures
      return yargs
        .command(require('../cmd/repl/fork')(ctx, cmds.io))
        .command(require('../cmd/repl/fork')(ctx, cmds.start))
        .command(require('../cmd/repl/status')(ctx))
        .command(require('../cmd/repl/read')(ctx))
        .command(require('../cmd/repl/write')(ctx))
        .command(require('../cmd/repl/stop')(ctx));
    }
  }

  let cmdLine;
  let ioStart;

  beforeAll(async () => {
    cmdLine = new IoCommandLine({ prompt: 'TEST' });
    const outLines = jest.fn();
    // Use zero port so OS assigns one
    await cmdLine.execute('io 0', outLines);
    ioStart = outLines.mock.calls.pop()[0];
  });

  afterAll(async () => {
    // Note: stop pops from fork stack, so no need to specify @id
    const outLines = jest.fn();
    await cmdLine.execute('stop', outLines);
    expect(outLines).toHaveBeenLastCalledWith(expect.objectContaining({
      '@id': ioStart['@id'],
      '@type': 'stopped'
    }));
  });

  test('Socket.io server has started', async () => {
    expect(ioStart).toMatchObject({
      '@id': expect.any(String),
      '@type': 'started',
      port: expect.any(Number)
    });
  });

  describe('with genesis clone', () => {
    let mldStart;

    beforeAll(async () => {
      const outLines = jest.fn(), errLines = jest.fn();
      // Use zero port so OS assigns one
      await cmdLine.execute('start test.m-ld.org --genesis --remotes io', outLines, errLines);
      expect(errLines).not.toHaveBeenCalled();
      mldStart = outLines.mock.calls.pop()[0];
    });

    afterAll(async () => {
      // Note: stop pops from fork stack, so no need to specify @id
      const outLines = jest.fn();
      await cmdLine.execute('stop', outLines);
      expect(outLines).toHaveBeenLastCalledWith(expect.objectContaining({
        '@id': mldStart['@id'],
        '@type': 'stopped'
      }));
    });

    test('m-ld started', () => {
      expect(mldStart).toMatchObject({
        '@id': expect.any(String),
        '@type': 'started'
      });
    });

    test('get m-ld status', async () => {
      const outLines = jest.fn();
      await cmdLine.execute('status', outLines);
      expect(outLines).toHaveBeenLastCalledWith(expect.objectContaining({
        '@type': 'status',
        online: expect.any(Boolean), // May not have connected to io yet
        outdated: false, // Genesis
        silo: false, // Genesis
        ticks: 0
      }));
    });

    test('write to m-ld', async () => {
      const outLines = jest.fn();
      const fred = { '@id': 'fred', name: 'Fred' };
      await cmdLine.execute(`write '${JSON.stringify(fred)}'`, outLines);
      // Write does not output anything
      expect(outLines).not.toHaveBeenCalled();
      outLines.mockClear();

      await cmdLine.execute(`read '${JSON.stringify({ '@describe': 'fred' })}'`, outLines);
      // We expect a JSON array, as a string, may be on multiple lines
      const result = outLines.mock.calls.map(args => args[0]).join('\n');
      expect(JSON.parse(result)).toEqual([fred]);
    });
  });
});