const { Proc } = require('../lib/Proc');

describe('Process base', () => {
  test('Emits done when its done', done => {
    const proc = new Proc();
    proc.on('done', done);
    proc.setDone();
  });

  test('Emits error when error', done => {
    const proc = new Proc();
    proc.on('error', () => done());
    proc.setDone('bang');
  });

  test('Resolves done when done', done => {
    const proc = new Proc();
    proc.done.then(() => done());
    proc.setDone();
  });
});