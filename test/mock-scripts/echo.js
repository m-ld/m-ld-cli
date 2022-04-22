const readline = require('readline');

// Echo every line from stdin
readline.createInterface({ input: process.stdin })
  .on('line', line => console.log(line)); // To stdout

// Echo every message from the host
process.on('message', msg => {
  process.send(msg);
  // Respect a stop message
  if (msg['@type'] === 'stop')
    process.exit();
});

// Tell the host we have started
process.send({
  cmdId: 'start',
  '@type': 'started',
  '@id': 'echo1',
  // Echo the args we were started with as an environment variable
  env: { 'ARGS': process.argv.slice(2).join(' ') }
});