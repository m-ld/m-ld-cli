/**
 * @typedef {object} GlobalOpts
 * @property {module:ExtensionModule[]} [ext]
 * @property {string | number} [logLevel]
 */

/**
 * @typedef {object} module:ExtensionModule
 * @property {string} '@id'
 * @property {string} '@type'
 * @property {string} filename
 * @property {boolean} [isDefault]
 * @property {(argv: object) => *} [check]
 * @property {(argv: object) => * | Promise<*>} getInstance
 */

/**
 * @param {import('yargs/yargs').Argv} yargs
 * @param {string[]} extIds default extension module ids
 * @param {(id: string) => module:ExtensionModule} requireExt extension module
 * resolution function – note this is used for any extensions on the command
 * line in addition to the defaults provided
 * @returns {import('yargs/yargs').Argv<GlobalOpts>}
 */
exports.buildGlobalOpts = (yargs, extIds, requireExt) => yargs
  .option('logLevel', {
    global: true,
    default: process.env.LOG
  })
  .option('ext', {
    global: true,
    type: 'array',
    describe: 'Extension CommonJS ids to use',
    default: extIds,
    // Resolve extensions using the given function
    coerce: ids => ids.map(requireExt)
  });

/**
 * @param {GlobalOpts} opts
 * @returns {string[]}
 */
exports.optsArgs = opts => [].concat(
  opts.logLevel != null ? ['--logLevel', opts.logLevel] : [],
  ...(opts.ext ?? []).map(ext => ['--ext', ext.filename]));