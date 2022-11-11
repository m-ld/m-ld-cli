/** @module {ExtensionModule} */

exports['@id'] = 'memory';
exports['@type'] = 'backend';
exports.filename = module.filename;
exports.isDefault = true;

exports.getInstance = () =>
  new (require('memory-level').MemoryLevel)();