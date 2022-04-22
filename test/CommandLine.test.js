const { CommandLine } = require('../lib/CommandLine');
const { Proc, SyncProc } = require('../lib/Proc');
const { EventEmitter } = require('events');
const { Readable } = require('stream');

describe('Command line executor', () => {
  const testOpts = /**@type GlobalOpts*/{
    prompt: 'TEST',
    logLevel: 'DEBUG',
    ext: ['ext1', 'ext2']
  };
  
  test('rejects undeclared command', async () => {
    const cmdLine = new (class extends CommandLine {})(testOpts);
    const outLines = jest.fn(), errLines = jest.fn();
    await cmdLine.execute('bunkum', outLines, errLines);
    // Unknown command is a user error, not a process error
    expect(errLines.mock.calls.length).toBe(0);
    expect(outLines.mock.calls).toEqual([
      ['Unknown command: bunkum'],
      [expect.stringMatching(/TEST[\S\s]*Commands:[\S\s]*Options:/)]
    ]);
  });

  test('allows undeclared option', async () => {
    let argv = { yes: false };
    const cmdLine = new (class extends CommandLine {
      buildCommands(yargs, ctx) {
        expect(ctx.opts.logLevel).toBe('DEBUG');
        expect(ctx.opts.ext).toEqual(['ext1', 'ext2']);
        return yargs.command('bunkum', 'Bunkum!',
          yargs => yargs, args => { argv = args; });
      }
    })(testOpts);
    const outLines = jest.fn(), errLines = jest.fn();
    await cmdLine.execute('bunkum --yes', outLines, errLines);
    // Unknown command is a user error, not a process error
    expect(errLines.mock.calls.length).toBe(0);
    expect(outLines.mock.calls.length).toBe(0);
    expect(argv.yes).toBe(true);
  });

  test('fails if command throws', async () => {
    const cmdLine = new (class extends CommandLine {
      buildCommands(yargs, ctx) {
        return yargs.command('bunkum', 'Bunkum!',
          yargs => yargs, () => { throw 'error'; });
      }
    })(testOpts);
    await expect(cmdLine.execute('bunkum', jest.fn(), jest.fn()))
      .rejects.toBe('error');
  });

  test('fails if proc errors', async () => {
    const cmdLine = new (class extends CommandLine {
      buildCommands(yargs, ctx) {
        return yargs.command('bunkum', 'Bunkum!',
          yargs => yargs, () => {
          ctx.proc = new Proc();
          setImmediate(() => ctx.proc.setDone('error'));
        });
      }
    })(testOpts);
    await expect(cmdLine.execute('bunkum', jest.fn(), jest.fn()))
      .rejects.toBe('error');
  });

  test('waits for proc to be done', async () => {
    const trigger = new EventEmitter();
    const cmdLine = new (class extends CommandLine {
      buildCommands(yargs, ctx) {
        return yargs.command('bunkum', 'Bunkum!',
          yargs => yargs,
          () => {
            ctx.proc = new Proc();
            trigger.on('pull', () => ctx.proc.setDone());
          });
      }
    })(testOpts);
    const exec = cmdLine.execute('bunkum', jest.fn(), jest.fn());
    await expect(Promise.race([exec, 'not done']))
      .resolves.toBe('not done');
    trigger.emit('pull');
    await exec;
  });

  test('captures proc output', async () => {
    const cmdLine = new (class extends CommandLine {
      buildCommands(yargs, ctx) {
        return yargs.command('bunkum', 'Bunkum!',
          yargs => yargs, () => {
            ctx.proc = new SyncProc(Readable.from(['I am a fish']));
          });
      }
    })(testOpts);
    const outLines = jest.fn();
    await cmdLine.execute('bunkum', outLines, jest.fn());
    expect(outLines.mock.calls).toEqual([['I am a fish']]);
  });

  test('captures proc messages', async () => {
    const cmdLine = new (class extends CommandLine {
      buildCommands(yargs, ctx) {
        return yargs.command('bunkum', 'Bunkum!',
          yargs => yargs, () => {
            ctx.proc = new Proc();
            setImmediate(() => {
              ctx.proc.emit('message', 'I am a tree');
              ctx.proc.setDone();
            })
          });
      }
    })(testOpts);
    const outLines = jest.fn();
    await cmdLine.execute('bunkum', outLines, jest.fn());
    expect(outLines.mock.calls).toEqual([['I am a tree']]);
  });
});