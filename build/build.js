'use strict';

/* global require, exports */
var utils = require('utils');

exports.execute = function(options) {
  utils.copyToStage(options);
  var sharedPath = utils.getFile(options.APP_DIR, 'shared').path;
  var paths = [
    [sharedPath, 'blobview', 'blobview.js'],
    [options.APP_DIR, 'js', 'metadata', 'formats.js'],
    [options.APP_DIR, 'js', 'metadata', 'core.js']
  ];
  var targetPath = utils.joinPath(options.STAGE_APP_DIR, 'js',
    'metadata_scripts.js');
  utils.concatenatedScripts(paths, targetPath);
};
