const { EventEmitter } = require('events');
const { ChildProcs } = require('../lib/ChildProcs');

describe('Child process tracking', () => {
  let childProcess = new EventEmitter;

  test('Tracks a child process', () => {
    const childProcs = new ChildProcs;
    childProcs.add('1', childProcess);
    expect(childProcs.get('0')).toBeUndefined();
    expect(childProcs.get('1')).toBe(childProcess);
    childProcess.emit('exit', 0);
    expect(childProcs.get('1')).toBeUndefined();
  });

  test('Stops a child process', () => {
    const childProcs = new ChildProcs;
    childProcs.add('1', childProcess);
    childProcess.send = jest.fn(msg => {
      expect(typeof msg.id).toBe('string');
      expect(msg['@type']).toBe('stop');
      setImmediate(() => childProcess.emit('exit', 0));
    });
    return childProcs.stop(childProcess);
  });

  test('Get child option required', () => {
    const childProcs = new ChildProcs;
    const option = childProcs.childIdOption('test');
    expect(option.describe).toBeDefined();
    expect(option.demandOption).toBe(true);
    expect(option.default).toBeUndefined();
  });

  test('Get child option defaults to last added', () => {
    const childProcs = new ChildProcs;
    childProcs.add('1', new EventEmitter);
    childProcs.add('2', new EventEmitter);
    const option = childProcs.childIdOption('test');
    expect(option.demandOption).toBeUndefined();
    expect(option.default).toBe('2');
  });

  test('Get child option checks child', () => {
    const childProcs = new ChildProcs;
    childProcs.add('1', childProcess);
    const option = childProcs.childIdOption('test');
    expect(option.coerce('1')).toBe('1');
    expect(() => option.coerce('2')).toThrowError();
  });
});