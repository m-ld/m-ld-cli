#!/usr/bin/env node
require('dotenv').config();

const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');

// noinspection JSCheckFunctionSignatures
yargs(hideBin(process.argv))
  .command(require('./cmd/repl'))
  .command(require('./cmd/start'))
  .help()
  .parse();