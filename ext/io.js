/** @module {ExtensionModule} */

exports['@id'] = 'io';
exports['@type'] = 'remotes';

exports.getInstance = async () => require('@m-ld/m-ld/dist/socket.io').IoRemotes;