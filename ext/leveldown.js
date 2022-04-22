/** @module {ExtensionModule} */

exports['@id'] = 'leveldown';
exports['@type'] = 'backend';

/** @param {string} dataDir */
exports.check = ({ dataDir }) => {
  if (dataDir == null)
    throw new Error('leveldown backend must have a dataDir');
}

/** @param {string} dataDir */
exports.getInstance = ({ dataDir }) =>
  (require('leveldown'))(dataDir);