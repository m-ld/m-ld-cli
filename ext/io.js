/** @module {ExtensionModule} */

exports['@id'] = 'io';
exports['@type'] = 'remotes';
exports.filename = module.filename;

exports.getInstance = async () => require('@m-ld/m-ld/ext/socket.io').IoRemotes;