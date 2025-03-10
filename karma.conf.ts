// Karma configuration
// Generated on Tue Jul 02 2019 17:18:30 GMT+0200 (Central European Summer Time)

import type { TransformCallback, TransformContext } from 'karma-typescript';
import type { Config } from 'karma';

module.exports = (config: Config): void => {
  config.set({
    // base path that will be used to resolve all patterns (eg. files, exclude)
    basePath: '',

    // frameworks to use
    // available frameworks: https://npmjs.org/browse/keyword/karma-adapter
    frameworks: ['jasmine', 'karma-typescript'],

    // list of files / patterns to load in the browser
    files: ['./__karma__/jest.ts', 'packages/*/src/**/*.ts'],

    // list of files / patterns to exclude
    exclude: ['packages/cli/**', '**/*.jest.test.ts'],

    // preprocess matching files before serving them to the browser
    // available preprocessors: https://npmjs.org/browse/keyword/karma-preprocessor
    preprocessors: {
      'packages/*/src/**/*.ts': ['karma-typescript'],
      './__karma__/**/*.ts': ['karma-typescript'],
    },

    // @ts-expect-error: non-standard - karmaTypeScriptConfig
    karmaTypescriptConfig: {
      ...require('./tsconfig.json'),
      include: ['**/*.ts'],
      exclude: ['node_modules'],
      bundlerOptions: {
        resolve: {
          alias: {
            '@stoplight/spectral-test-utils': require.resolve('./test-utils/browser/index.js'),
            nimma: require.resolve('./node_modules/nimma/dist/legacy/cjs/index.js'),
            'nimma/fallbacks': require.resolve('./node_modules/nimma/dist/legacy/cjs/fallbacks/index.js'),
            'nimma/legacy': require.resolve('./node_modules/nimma/dist/legacy/cjs/index.js'),
            'node-fetch': require.resolve('./__karma__/fetch'),
            fs: require.resolve('./__karma__/fs'),
            process: require.resolve('./__karma__/process'),
            fsevents: require.resolve('./__karma__/fsevents'),
          },
        },
        acornOptions: {
          ecmaVersion: 11,
        },
        transforms: [
          require('karma-typescript-es6-transform')({
            presets: [
              [
                '@babel/preset-env',
                {
                  targets: {
                    node: 'current',
                  },
                },
              ],
            ],
          }),

          function (context: TransformContext, callback: TransformCallback) {
            // you may ask why on earth do we need this...,
            // so this is to make sure `cjs` extensions are treated as actual scripts and not text files
            // https://github.com/monounity/karma-typescript/blob/master/packages/karma-typescript/src/bundler/bundle-item.ts#L18 does not have cjs extension listed, so our file is not treated as script, and eventually require-ing it leads to a typeerror, since we get a string instead
            // luckily it's an OR with rhs being `this.transformedScript` expression, so all we need to do is to set it to true (which we do below)
            const err: any = void 0; // needed because typings are incorrect and expect Error only
            if (context.module.includes('@stoplight/ordered-object-literal')) {
              // needed to set a flag transformedScript on BundledItem described above, https://github.com/monounity/karma-typescript/blob/master/packages/karma-typescript/src/bundler/transformer.ts#L94
              return callback(err, { dirty: true, transformedScript: true });
            }

            return callback(err, false);
          },
        ],
      },
    },

    // test results reporter to use
    // possible values: 'dots', 'progress'
    // available reporters: https://npmjs.org/browse/keyword/karma-reporter
    reporters: ['progress', 'karma-typescript'],

    // web server port
    port: 9876,

    // enable / disable colors in the output (reporters and logs)
    colors: true,

    // level of logging
    // possible values: config.LOG_DISABLE || config.LOG_ERROR || config.LOG_WARN || config.LOG_INFO || config.LOG_DEBUG
    logLevel: config.LOG_INFO,

    // // enable / disable watching file and executing tests whenever any file changes
    autoWatch: false,

    // start these browsers
    // available browser launchers: https://npmjs.org/browse/keyword/karma-launcher
    browsers: ['ChromeHeadless'],

    // Continuous Integration mode
    // if true, Karma captures browsers, runs the tests and exits
    singleRun: true,

    // Concurrency level
    // how many browser should be started simultaneous
    concurrency: Infinity,
  });
};
