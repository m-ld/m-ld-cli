const { execute } = require('../lib/Exec');
const { Proc } = require('../lib/Proc');
const { Readable } = require('stream');
const getStream = require('get-stream');

describe('REPL command line', () => {
  test('Execute nothing', () => {
    expect(execute('', () => null)).toBeNull();
  });

  function executeCmd(args, stdin) {
    switch (args[0]) {
      case 'cmd':
        return new Proc(Readable.from(['out']));
      default:
        return new Proc(stdin); // Just pass the stream through
    }
  }

  test('Execute a command', async () => {
    const spyExecute = jest.fn(executeCmd);
    const proc = execute('cmd arg1', spyExecute);
    expect(spyExecute.mock.calls.length).toBe(1);
    const [args, stdin] = spyExecute.mock.calls[0];
    expect(args).toEqual(['cmd', 'arg1']);
    expect(stdin).toBeUndefined();
    await expect(getStream(proc.stdout)).resolves.toBe('out');
  });

  test('Pipe commands', async () => {
    const proc = execute('cmd > cmd2', executeCmd);
    await expect(getStream(proc.stdout)).resolves.toBe('out');
  });

  test('Pipe multiple commands', async () => {
    const proc = execute('cmd > cmd2 > cmd3', executeCmd);
    await expect(getStream(proc.stdout)).resolves.toBe('out');
  });

  test('Pipe with brackets', async () => {
    const proc = execute('(cmd > cmd2) > cmd3', executeCmd);
    await expect(getStream(proc.stdout)).resolves.toBe('out');
  });

  test('Done when all commands are done', done => {
    const spyExecute = jest.fn(executeCmd);
    const proc = execute('cmd > cmd2', spyExecute);
    let finished = false;
    proc.on('done', () => finished = true);
    const [proc1, proc2] = spyExecute.mock.results.map(r => r.value);
    proc1.on('done', () => {
      expect(finished).toBe(false);
      proc.on('done', done);
      proc2.setDone();
    });
    proc1.setDone();
  });
});