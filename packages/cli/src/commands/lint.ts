import { Dictionary } from '@stoplight/types';
import { isPlainObject } from '@stoplight/json';
import { difference, noop, pick } from 'lodash';
import { ReadStream } from 'tty';
import type { CommandModule } from 'yargs';
import { getDiagnosticSeverity, IRuleResult } from '@stoplight/spectral-core';

import { lint } from '../services/linter';
import { formatOutput, writeOutput } from '../services/output';
import { FailSeverity, ILintConfig, OutputFormat } from '../services/config';

const formatOptions = Object.values(OutputFormat);

const lintCommand: CommandModule = {
  describe: 'lint JSON/YAML documents from files or URLs',
  command: 'lint [documents..]',
  builder: yargs =>
    yargs
      .strict()
      .positional('documents', {
        description:
          'Location of JSON/YAML documents. Can be either a file, a glob or fetchable resource(s) on the web.',
        coerce(values) {
          if (Array.isArray(values) && values.length > 0) {
            return values as unknown[];
          }

          // https://stackoverflow.com/questions/39801643/detect-if-node-receives-stdin
          // https://twitter.com/MylesBorins/status/782009479382626304
          // https://nodejs.org/dist/latest/docs/api/tty.html#tty_readstream_istty
          if (process.stdin.isTTY) {
            return [];
          }

          return [(process.stdin as ReadStream & { fd: 0 }).fd];
        },
      })
      .middleware((argv: Dictionary<unknown>) => {
        const formats = argv.format as string[] & { 0: string };
        if (argv.output === void 0) {
          argv.output = { [formats[0]]: '<stdout>' };
        } else if (typeof argv.output === 'string') {
          argv.output = { [formats[0]]: argv.output };
        } else {
          const output = argv.output as Dictionary<unknown>;
          if (Object.keys(output).length + 1 >= formats.length) {
            return;
          }

          const firstMissingFormat = formats.find(f => !(f in output));
          if (firstMissingFormat !== void 0) {
            output[firstMissingFormat] = '<stdout>';
          }
        }
      })
      .check((argv: Dictionary<unknown>) => {
        if (!Array.isArray(argv.documents) || argv.documents.length === 0) {
          throw new TypeError('No documents provided.');
        }

        const format = argv.format as string[] & { 0: string };
        const output = argv.output as Dictionary<unknown> | undefined;

        if (format.length === 1) {
          if (output === void 0 || Object.keys(output).length === 1) {
            return true;
          }

          throw new TypeError('Output must be either string or unspecified when a single format is specified');
        }

        if (!isPlainObject(output)) {
          throw new TypeError('Multiple outputs have to be provided when more than a single format is specified');
        }

        const keys = Object.keys(output);
        if (format.length !== keys.length) {
          throw new TypeError('The number of outputs must match the number of formats');
        }

        const diff = difference(format, keys);
        if (diff.length !== 0) {
          throw new TypeError(`Missing outputs for the following formats: ${diff.join(', ')}`);
        }

        return true;
      })
      .options({
        encoding: {
          alias: 'e',
          description: 'text encoding to use',
          type: 'string',
          default: 'utf8',
          choices: ['utf8', 'ascii', 'utf-8', 'utf16le', 'ucs2', 'ucs-2', 'base64', 'latin1'],
        },
        format: {
          alias: 'f',
          description: 'formatters to use for outputting results, more than one can be given joining them with a comma',
          choices: formatOptions,
          default: OutputFormat.STYLISH,
          type: 'string',
          coerce(values: string | string[]) {
            return Array.isArray(values) ? values : [values];
          },
        },
        output: {
          alias: 'o',
          description: `where to output results, can be a single file name, multiple "output.<format>" or missing to print to stdout`,
          type: 'string',
        },
        'stdin-filepath': {
          description: 'path to a file to pretend that stdin comes from',
          type: 'string',
        },
        resolver: {
          description: 'path to custom json-ref-resolver instance',
          type: 'string',
        },
        ruleset: {
          alias: 'r',
          description: 'path/URL to a ruleset file',
          type: 'string',
        },
        'fail-severity': {
          alias: 'F',
          description: 'results of this level or above will trigger a failure exit code',
          choices: ['error', 'warn', 'info', 'hint'],
          default: 'error',
          type: 'string',
        },
        'display-only-failures': {
          alias: 'D',
          description: 'only output results equal to or greater than --fail-severity',
          type: 'boolean',
          default: false,
        },
        'ignore-unknown-format': {
          description: 'do not warn about unmatched formats',
          type: 'boolean',
          default: false,
        },
        'fail-on-unmatched-globs': {
          description: 'fail on unmatched glob patterns',
          type: 'boolean',
          default: false,
        },
        verbose: {
          alias: 'v',
          description: 'increase verbosity',
          type: 'boolean',
        },
        quiet: {
          alias: 'q',
          description: 'no logging - output only',
          type: 'boolean',
        },
      }),

  handler: args => {
    const {
      documents,
      failSeverity,
      displayOnlyFailures,
      ruleset,
      stdinFilepath,
      format,
      output,
      encoding,
      ignoreUnknownFormat,
      failOnUnmatchedGlobs,
      ...config
    } = args as unknown as ILintConfig & {
      documents: Array<number | string>;
      failSeverity: FailSeverity;
      displayOnlyFailures: boolean;
    };

    return lint(documents, {
      format,
      output,
      encoding,
      ignoreUnknownFormat,
      failOnUnmatchedGlobs,
      ruleset,
      stdinFilepath,
      ...pick<Partial<ILintConfig>, keyof ILintConfig>(config, ['verbose', 'quiet', 'resolver']),
    })
      .then(results => {
        if (displayOnlyFailures) {
          return filterResultsBySeverity(results, failSeverity);
        }
        return results;
      })
      .then(results => {
        if (results.length > 0) {
          process.exitCode = severeEnoughToFail(results, failSeverity) ? 1 : 0;
        } else if (config.quiet !== true) {
          console.log(`No results with a severity of '${failSeverity}' or higher found!`);
        }

        return Promise.all(
          format.map(f => {
            const formattedOutput = formatOutput(results, f, { failSeverity: getDiagnosticSeverity(failSeverity) });
            return writeOutput(formattedOutput, output?.[f] ?? '<stdout>');
          }),
        ).then(noop);
      })
      .catch(fail);
  },
};

const fail = ({ message }: Error): void => {
  console.error(message);
  process.exitCode = 2;
};

const filterResultsBySeverity = (results: IRuleResult[], failSeverity: FailSeverity): IRuleResult[] => {
  const diagnosticSeverity = getDiagnosticSeverity(failSeverity);
  return results.filter(r => r.severity <= diagnosticSeverity);
};

export const severeEnoughToFail = (results: IRuleResult[], failSeverity: FailSeverity): boolean => {
  const diagnosticSeverity = getDiagnosticSeverity(failSeverity);
  return results.some(r => r.severity <= diagnosticSeverity);
};

export default lintCommand;
