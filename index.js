#!/usr/bin/env node
require('dotenv').config();

const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const { buildGlobalOpts } = require('./lib/opts');

// noinspection JSCheckFunctionSignatures
buildGlobalOpts(yargs(hideBin(process.argv)), [
  // By default, include all extensions as options
  './ext/memory',
  './ext/leveldb',
  './ext/ably',
  './ext/io'
], require)
  .command(require('./cmd/repl'))
  .command(require('./cmd/start'))
  .command(require('./cmd/io'))
  .help()
  .parse();