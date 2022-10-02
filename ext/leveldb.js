/** @module {ExtensionModule} */

exports['@id'] = 'leveldb';
exports['@type'] = 'backend';
exports.filename = module.filename;

/** @param {string} dataDir */
exports.check = ({ dataDir }) => {
  if (dataDir == null)
    throw new Error('leveldown backend must have a dataDir');
}

/** @param {string} dataDir */
exports.getInstance = ({ dataDir }) =>
  new (require('classic-level').ClassicLevel)(dataDir);