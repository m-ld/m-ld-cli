const yargs = require('yargs/yargs');
const { ChildProcs } = require('../lib/ChildProcs');
const fork = require('../cmd/repl/fork');
const readline = require('readline');

describe('Fork command', () => {
  function doFork(testScript, testCtx) {
    const ctx = /**@type {CmdContext}*/{
      childProcs: new ChildProcs,
      cmdId: '1',
      args: [testScript],
      proc: null,
      exec: fn => ctx.proc = fn(),
      opts: { ext: [{ filename: 'testExt' }] },
      ...testCtx
    };
    const modulePath = require.resolve(`./mock-scripts/${testScript}`);
    yargs(`${testScript} --modulePath ${modulePath}`)
      .exitProcess(false)
      .command(fork(ctx, {
        command: testScript,
        describe: testScript
      }))
      .parseSync();
    return ctx;
  }

  test('executes a no-op script', () => {
    return doFork('noop').proc.done;
  });

  test('executes an error script', async () => {
    await expect(doFork('error').proc.done).rejects.toBe('boom');
  });

  test('receives echoes from echo script', async () => {
    // Pipe the stdin so we have a writeable stream to push input
    const ctx = doFork('echo', { stdin: 'pipe' });
    await ctx.proc.done;
    // Process should now be running in the background
    const childProcess = ctx.childProcs.get('echo1');
    expect(childProcess).toBeDefined();
    expect(process.env.ARGS).toBe('echo --ext testExt');
    // Check for message echo
    await new Promise(resolve => {
      const hello = { id: '2', '@type': 'hello' };
      childProcess.send(hello);
      childProcess.once('message', msg => {
        expect(msg).toEqual(hello);
        resolve();
      });
    });
    // Check for stdio echo
    await new Promise(resolve => {
      readline.createInterface({ input: childProcess.stdout })
        .once('line', line => {
          expect(line).toBe('hello');
          resolve();
        });
      childProcess.stdin.write('hello\n');
    });
    await ctx.childProcs.stop(childProcess);
  });
});