/** @module {ExtensionModule} */

exports['@id'] = 'ably';
exports['@type'] = 'remotes';
exports.filename = module.filename;

/** @param {object} config */
exports.getInstance = async config => {
  // Load WRTC config from Xirsys if available
  if (config.xirsys)
    config.wrtc = await require('@m-ld/io-web-runtime/dist/server/xirsys')
      .loadWrtcConfig(config.xirsys);
  const ablyModule = require('@m-ld/m-ld/ext/ably');
  if (config.wrtc)
    return ablyModule.AblyWrtcRemotes;
  else
    return ablyModule.AblyRemotes;
}