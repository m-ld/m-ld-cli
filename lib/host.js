/**
 * @param {string} cmdId the command that provoked this report
 * @param {string} type the type of report
 * @param {object} [params] the report details
 */
function report(cmdId, type, params) {
  if (process.send != null) {
    process.send({ cmdId, '@type': type, ...params },
      err => err && console.warn('Child process orphaned from host process', err));
  } else {
    console.log(cmdId, type, JSON.stringify(params));
  }
}

/**
 * @param {string} cmdId the command that provoked this error
 * @param {any} err the error to report
 */
function reportError(cmdId, err) {
  console.error(err);
  return report(cmdId, 'error', { err: `${err}` });
}

/**
 * @param {object} message
 * @returns {function(*=): void}
 */
function errorHandler(message) {
  return err => reportError(message.id, err);
}

exports.report = report;
exports.reportError = reportError;
exports.errorHandler = errorHandler;