/** @module {ExtensionModule} */

exports['@id'] = 'memdown';
exports['@type'] = 'backend';
exports.isDefault = true;

exports.getInstance = () =>
  new (require('@m-ld/m-ld/dist/memdown')).MeldMemDown();