module.exports = function(config) {
    config.set({
        reporters: ['tfs'],
        basePath: '../',
        frameworks: ['mocha', 'chai', 'sinon-chai'],
        files: [
            './node_modules/jquery/dist/jquery.min.js',
            './node_modules/jquery-textcomplete/dist/jquery.textcomplete.min.js',
            './node_modules/bluebird/js/browser/bluebird.min.js',
            './node_modules/jbox/dist/jBox.min.js',
            './src/js/serial.js',
            './src/js/data_storage.js',
            './src/js/localization.js',
            './src/js/fc.js',
            './src/js/gui.js',
            './src/js/CliAutoComplete.js',
            './src/js/tabs/cli.js',
            './test/**/*.js'
        ],
        logLevel: config.LOG_DEBUG,
        browsers: ['ChromeHeadlessNoSandbox'],
        customLaunchers: {
            ChromeHeadlessNoSandbox: {
                base: 'ChromeHeadless',
                flags: ['--no-sandbox']
            }
        },
        tfsReporter: {
            outputDir: 'testresults',
            outputFile: 'test_results.xml',
        },
        singleRun: true,
    });
};
