#!/usr/bin/env node

/**
 * Load requirements.
 */

//var open = require('open');
//var prompt = require('prompt');

var h5p = require('../lib/h5p.js');
var H5PServer = require('../lib/h5p-server.js');
var H5PCreator = require('../lib/h5p-creator.js');

/* Commands */
const pack = require('../lib/commands/pack');
const statusCmd = require('../lib/commands/status');
const pull = require('../lib/commands/pull');
const init = require('../lib/commands/init');
const checkTranslations = require ('../lib/commands/check-translations');
const buildLibraries = require('../lib/commands/build-libraries');
const checkVersions = require('../lib/commands/check-versions');

var lf = '\u000A';
var cr = '\u000D';
var color = {
  default: '\x1B[0m',
  emphasize: '\x1B[1m',
  green: '\x1B[32m',
  yellow: '\x1B[33m',
  red: '\x1B[31m'
};

var noCr = (process.platform === 'win32');

/**
 * Simple class for displaying a spinner while we're working.
 */
function Spinner(prefix) {
  var interval;

  if (noCr) {
    // Platform does not support carriage return. Use lightweight spinner.

    /**
     * Stop spinning.
     *
     * @public
     * @param {String} result
     */
    this.stop = function (result) {
      clearInterval(interval);
      process.stdout.write(' ' + result);
    };

    // Start spinner
    process.stdout.write(prefix);
    interval = setInterval(function () {
      process.stdout.write('.');
    }, 500);
  }
  else {
    // Create cool spinner using carriage return.

    var parts = ['/','-','\\', '|'];
    var curPos = 0;
    var maxPos = parts.length;

    /**
    * Stop spinning.
    *
    * @public
    * @param {String} result
    */
    this.stop = function (result) {
      clearInterval(interval);
      process.stdout.write(cr + prefix + ' ' + result);
    };

    // Start spinner
    interval = setInterval(function () {
      process.stdout.write(cr + prefix + ' ' + color.emphasize + parts[curPos++] + color.default);
      if (curPos === maxPos) curPos = 0;
    }, 100);
  }
}

/**
 * Recursive cloning of all libraries in the collection.
 * Will print out status messages along the way.
 */
function clone() {
  var name = h5p.clone(function (error) {
    var result;
    if (error === -1) {
      result = color.yellow + 'SKIPPED' + color.default + lf;
    }
    else if (error) {
      result = color.red + 'FAILED' + color.default + lf + error;
    }
    else {
      result = color.green + 'OK' + color.default + lf;
    }

    spinner.stop(result);
    clone();
  });
  if (!name) return; // Nothing to clone.
  var msg = 'Cloning into \'' + color.emphasize + name + color.default + '\'...';
  var spinner = new Spinner(msg);
}

/**
 * Recursive pushing for all repos in collection.
 */
function push(options) {
  var repo = h5p.push(options, function (error, result) {

    if (error === -1) {
      result = color.yellow + 'SKIPPED' + color.default + lf;
    }
    else if (error) {
      result = color.red + 'FAILED' + color.default + lf + error;
    }
    else {
      result = color.green + 'OK' + color.default + ' ' + result + lf;
    }

    spinner.stop(result);
    push(options);
  });
  if (!repo) return; // Nothing to clone.
  var msg = 'Pushing \'' + color.emphasize + repo + color.default + '\'...';
  var spinner = new Spinner(msg);
}

/**
 * Print result after checkout or merge.
 */
function results(error, repos) {
  if (error) return process.stdout.write(error + lf);

  for (var i = 0; i < repos.length; i++) {
    var repo = repos[i];

    process.stdout.write(color.emphasize + repo.name + color.default);

    if (repo.failed) {
      process.stdout.write(' ' + color.red + 'FAILED' + color.default);
    }
    else if (repo.skipped) {
      process.stdout.write(' ' + color.yellow + 'SKIPPED' + color.default);
    }
    else {
      process.stdout.write(' ' + color.green + 'OK' + color.default);
    }

    if (repo.msg) {
      process.stdout.write(' ' + repo.msg);
    }

    process.stdout.write(lf);
  }
}

function handleChanges(error, changes) {
  if (error) return process.stdout.write(error + lf);

  /**
   * Helps print library name + details
   *
   * @private
   * @param {string} libName
   * @param {string} [detailsColor] Prop for color object
   * @param {string} [details]
   */
  function printLibChanges(libName, detailsColor, details) {
    var detailsOutput = details && detailsColor ? color[detailsColor] + details + color.default : '';
    process.stdout.write(color.emphasize + libName + color.default + ' ' + detailsOutput + lf);
  }

  // Print all libraries with changes
  for (var i = 0; i < changes.length; i++) {
    var lib = changes[i];

    if (lib.skipped) {
      // Repo name + skipped msg
      printLibChanges(lib.name, 'yellow', lib.msg);
    }
    else if (lib.failed && lib.msg && lib.msg.error) {
      printLibChanges(lib.name);

      if (lib.msg.output) {
        process.stdout.write(lib.msg.output + lf);
      }

      process.stdout.write(color['red'] + lib.msg.error + color.default + lf);
    }
    else if (lib.failed) {
      // Repo name + error
      printLibChanges(lib.name, 'red', lib.msg);
    }
    else if (lib.msg && lib.msg.version && lib.msg.changes) {
      // Repo name + details
      printLibChanges(lib.name, 'green', lib.msg.version);

      // Changes
      process.stdout.write(lib.msg.changes + lf);
    }
    else if (lib.msg && lib.msg.changes) {
      // Repo name + details
      printLibChanges(lib.name);

      // Changes
      process.stdout.write(lib.msg.changes + lf);
    }
  }
}

/**
 * Print results after commiting.
 */
function commit(error, results) {
  if (error) return process.stdout.write(error + lf);

  var first = true;
  for (var i = 0; i < results.length; i++) {
    var result = results[i];

    // Skip no outputs
    if (!result.error && !result.changes) continue;

    if (first) {
      // Extra line feed on the first.
      process.stdout.write(lf);
      first = false;
    }

    process.stdout.write(color.emphasize + result.name + color.default);
    if (result.branch && result.commit) {
      process.stdout.write(' (' + result.branch + ' ' + result.commit + ')');
    }
    process.stdout.write(lf);

    if (result.error) {
      process.stdout.write(error + lf);
    }
    else {
      process.stdout.write(result.changes.join(lf) + lf);
    }
    process.stdout.write(lf);
  }
}

/**
 * Extracts options from input.
 *
 * @private
 * @param {String[]} inputs
 * @param {(String|String[]|RegExp|RegExp[])} valids
 */
function filterOptions(inputs, valids) {
  var options = [];

  // Go through input
  for (var i = 0; i < inputs.length; i++) {

    // Check if input is valid option
    for (var j = 0; j < valids.length; j++) {
      if (valids[j] instanceof RegExp && valids[j].test(inputs[i]) ||
          valids[j] === inputs[i]) {
        // Keep track of option
        options.push(inputs[i]);

        // No longer input
        inputs.splice(i, 1);
        i--;
      }
    }
  }

  return options;
}

/**
 * Creates a progress callback for async tasks.
 *
 * @private
 * @param {String} action
 * @returns {Function}
 */
function progress(action) {
  var spinner;
  return function (status, nextRepo) {
    if (status) {
      if (status.failed) {
        spinner.stop(color.red + 'FAILED' + color.default + lf + status.msg);
      }
      else if (status.skipped) {
        spinner.stop(color.yellow + 'SKIPPED' + color.default + lf);
      }
      else {
        spinner.stop(color.green + 'OK' + color.default + (status.msg === undefined ? '' : ' ' + status.msg) + lf);
      }
    }

    if (nextRepo) {
      spinner = new Spinner(action + ' \'' + color.emphasize + nextRepo + color.default + '\'...');
    }
  };
}

// Register command handlers
var commands = [
  {
    name: 'init',
    syntax: '<library>',
    shortDescription: 'Initialize a new h5p library',
    description: `Create a new H5P library with a standard structure
    and the necessary files, in order to get started quickly.`,
    handler: init
  },
  {
    name: 'help',
    syntax: '<command>',
    shortDescription: 'Displays additional information',
    description: 'What don\'t you understand about help?',
    handler: function (command) {
      if (command) {
        command = findCommand(command);
        if (command && command.description) {
          process.stdout.write(command.description + lf);
        }
        else {
          process.stdout.write('Sorry, no help available.' + lf);
        }
      }
      else {
        listCommands();
      }
    }
  },
  {
    name: 'list',
    shortDescription: 'List all H5P libraries',
    handler: function () {
      var spinner = new Spinner('Getting library list...');
      h5p.list(function (error, libraries) {
        var result = (error ? (color.red + 'ERROR: ' + color.default + error) : (color.green + 'DONE' + color.default));
        spinner.stop(result + lf);

        for (var name in libraries) {
          process.stdout.write('  ' + color.emphasize + name + color.default + lf);
        }
      });
    }
  },
  {
    name: 'get',
    syntax: '<library>',
    shortDescription: 'Clone library and all dependencies',
    handler: function () {
      var libraries = Array.prototype.slice.call(arguments);
      if (!libraries.length) {
        process.stdout.write('No library specified.' + lf);
        return;
      }

      var spinner = new Spinner('Looking up dependencies...');
      h5p.get(libraries, function (error) {
        var result = (error ? (color.red + 'ERROR: ' + color.default + error) : (color.green + 'DONE' + color.default));
        spinner.stop(result + lf);
        clone();
      });
    }
  },
  {
    name: 'status',
    syntax: '[-f] [<library>...]',
    shortDescription: 'Show the status for the given or all libraries',
    description: 'The -f handle can be used to display which branch each library is on.',
    handler: statusCmd
  },
  {
    name: 'commit',
    syntax: '<message>',
    shortDescription: 'Commit to all repos with given message',
    handler: function (msg) {
      // TODO: Get commit message from text editor?
      if (!msg) {
        process.stdout.write('No message means no commit.' + lf);
        return;
      }

      if (msg.split(' ', 2).length < 2) {
        process.stdout.write('Commit message to short.' + lf);
        return;
      }

      h5p.commit(msg, commit);
    }
  },
  {
    name: 'pull',
    syntax: '[<library>...]',
    shortDescription: 'Pull the given or all repos',
    handler: pull
  },
  {
    name: 'push',
    syntax: '[<library>...] [--tags]',
    shortDescription: 'Push the given or all repos',
    handler: function () {
      var libraries = Array.prototype.slice.call(arguments);
      var options = filterOptions(libraries, ['--tags']);
      h5p.update(libraries, function (error) {
        if (error) return process.stdout.write(error + lf);
        push(options);
      });
    }
  },
  {
    name: 'checkout',
    syntax: '<branch> [<library>...]',
    shortDescription: 'Change branch',
    handler: function () {
      var libraries = Array.prototype.slice.call(arguments);
      var branch = libraries.shift();
      if (!branch) {
        process.stdout.write('No branch today.' + lf);
        return;
      }

      h5p.checkout(branch, libraries, results);
    }
  },
  {
    name: 'new-branch',
    syntax: '<branch> [<library>...]',
    shortDescription: 'Creates a new branch(local and remote)',
    description: 'The remote is origin.',
    handler: function () {
      var libraries = Array.prototype.slice.call(arguments);
      var branch = libraries.shift();
      if (!branch || branch.substr(0, 4) === 'h5p-') {
        process.stdout.write('That is a strange name for a branch..' + lf);
        return;
      }

      h5p.newBranch(branch, libraries, progress('Branching'));
    }
  },
  {
    name: 'rm-branch',
    syntax: '<branch> [<library>...]',
    shortDescription: 'Removes branch(local and remote)',
    description: 'The remote is origin.',
    handler: function () {
      var libraries = Array.prototype.slice.call(arguments);
      var branch = libraries.shift();
      if (!branch || branch.substr(0, 4) === 'h5p-' || branch === 'master') {
        process.stdout.write('I would think twice about doing that!' + lf);
        return;
      }

      h5p.rmBranch(branch, libraries, progress('De-branching'));
    }
  },
  {
    name: 'diff',
    shortDescription: 'Prints combined diff for alle repos',
    handler: function () {
      h5p.diff(function (error, diff) {
        if (error) return process.stdout.write(color.red + 'ERROR!' + color.default + lf + error);
        process.stdout.write(diff);
      });
    }
  },
  {
    name: 'merge',
    syntax: '<branch> [<library>...]',
    shortDescription: 'Merge in branch',
    handler: function () {
      var libraries = Array.prototype.slice.call(arguments);
      var branch = libraries.shift();
      if (!branch) {
        process.stdout.write('No branch today.' + lf);
        return;
      }

      h5p.merge(branch, libraries, results);
    }
  },
  {
    name: 'pack',
    syntax: '[-r] <library> [<library2>...] [my.h5p]',
    shortDescription: 'Packs the given libraries',
    description:
      'Use -r for recursive packaging, will pack all dependencies as well' + lf +
      lf +
      'You can change the default output package by setting:' + lf +
      'export H5P_DEFAULT_PACK="~/my-libraries.h5p"' + lf +
      lf +
      'You can override which files are ignored by default:' + lf +
      'export H5P_IGNORE_PATTERN="^\\.|~$"' + lf +
      'export H5P_IGNORE_MODIFIERS="ig"' + lf +
      lf +
      'You can also change which files are allowed in the package by overriding:' + lf +
      'export H5P_ALLOWED_FILE_PATTERN="\\.(json|png|jpg|jpeg|gif|bmp|tif|tiff|svg|eot|ttf|woff|otf|webm|mp4|ogg|mp3|txt|pdf|rtf|doc|docx|xls|xlsx|ppt|pptx|odt|ods|odp|xml|csv|diff|patch|swf|md|textile|js|css)$"' + lf +
      'export H5P_ALLOWED_FILE_MODIFIERS=""' + lf +
      lf +
      'Put these in your ~/.bashrc for permanent settings.',
    handler: pack
  },
  {
    name: 'increase-patch-version',
    syntax: '[-f] [<library>...]',
    shortDescription: 'Increases the patch version',
    description: 'The -f handle can be used to force an increase in the patch version even though there are no new changes.',
    handler: function () {
      var force, libraries = Array.prototype.slice.call(arguments);
      if (libraries[0] === '-f') {
        force = true;
        libraries.splice(0, 1);
      }
      h5p.increasePatchVersion(force, libraries, results);
    }
  },
  {
    name: 'tag-version',
    syntax: '[<library>...]',
    shortDescription: 'Create tag from current version number',
    handler: function () {
      var libraries = Array.prototype.slice.call(arguments);
      h5p.tagVersion(libraries, results);
    }
  },
  {
    name: 'tag',
    syntax: '<tag-name> [<library>...]',
    shortDescription: 'Create a tag',
    handler: function () {
      var inputs = Array.prototype.slice.call(arguments);
      var tagName = inputs.splice(0,1);
      var libraries = inputs;
      h5p.tag(tagName, libraries, results);
    }
  },
  {
    name: 'changes-since',
    syntax: '[<num-versions>] [<library>...]',
    shortDescription: 'Show changed files since last version',
    description: 'Number of versions defaults to -1 (last version). Showing only specific libraries is optional.',
    handler: function () {
      var libraries = Array.prototype.slice.call(arguments);
      var versions = 1;
      if (libraries[0] && libraries[0].match(/^-?\d+$/ig)) {
        versions = Math.abs(libraries.splice(0, 1));
      }
      h5p.changesSince(versions, libraries, handleChanges);
    }
  },
  {
    name: 'changes-since-release',
    syntax: '[<library>...]',
    shortDescription: 'Show changed files since last release',
    handler: function () {
      var libraries = Array.prototype.slice.call(arguments);
      h5p.changesSinceRelease(libraries, handleChanges);
    }
  },
  {
    name: 'compare-tags-with-release',
    syntax: '[<library>...]',
    shortDescription: 'Compare tag of release and master branch',
    handler: function () {
      var libraries = Array.prototype.slice.call(arguments);
      h5p.compareTagsRelease(libraries, handleChanges);
    }
  },
  {
    name: 'commits-since',
    syntax: '[<num-versions>] [<library>...]',
    shortDescription: 'Show commits since last version',
    description: 'Number of versions defaults to -1 (last version). Showing only specific libraries is optional.',
    handler: function () {
      var libraries = Array.prototype.slice.call(arguments);
      var versions = 1;
      if (libraries[0] && libraries[0].match(/^-?\d+$/ig)) {
        versions = Math.abs(libraries.splice(0, 1));
      }
      h5p.commitsSince(versions, libraries, handleChanges);
    }
  },
  {
    name: 'create-language-file',
    syntax: '<library> <language-code>',
    shortDescription: 'Creates language file',
    handler: function (library, languageCode) {
      if (!library) {
        process.stdout.write('No library selected.' + lf);
        return;
      }
      if (!languageCode) {
        process.stdout.write('No language selected.' + lf);
        return;
      }

      h5p.createLanguageFile(library, languageCode, results);
    }
  },
  {
    name: 'import-language-files',
    syntax: '<from-dir>',
    shortDescription: 'Get files from dir',
    handler: function (dir) {
      if (!dir) {
        process.stdout.write('No dir selected.' + lf);
        return;
      }
      h5p.importLanguageFiles(dir, results);
    }
  },
  {
    name: 'server',
    syntax: '<config-file>',
    shortDescription: 'Start a local development server',
    handler: function (configFile) {
      var h5pServer = new H5PServer(configFile);
      h5pServer.start();
    }
  },
  /*{
    name: 'create',
    syntax: '',
    shortDescription: 'Create a boilerplate H5P',
    handler: function () {
      var schema = {
        properties: {
          machineName: {
            description: 'machineName',
            message: 'machineName must include a dot, e.g: H5P.MyFantasticNewContent',
            required: true
          },
          author: {
            required: true
          },
          title: {
            required: true
          },
          description: {
            required: true
          }
        }
      };

      // Let's get some info
      prompt.start();
      prompt.get(schema, function (err, result) {
        if (err) {
          return console.error("Sorry - don't have the input I need");
        }

        var h5pCreator = new H5PCreator(result);
        h5pCreator.create(function () {
          // Let's start the server!
          var h5pServer = new H5PServer();
          console.log('About to start server!');
          h5pServer.start(function (url) {
            // Lets' open the browser:
            console.log('Opening your browser');
            open(url);
          });
        });
      });
    }
  }*/
  {
    name: 'add-english-texts',
    syntax: '[-P] <language-code> <library> [<library>...]',
    shortDescription: 'Update translations',
    description: 'Add the english text strings to the given translation with the given language code. Use -P flag to populate with english texts instead of TODOs.',
    handler: function () {
      var libraries = Array.prototype.slice.call(arguments);
      var populateFlag = libraries.splice(0, 1)[0];
      var languageCode;
      var hasPopulateFlag = populateFlag === '-P';

      if (hasPopulateFlag) {
        languageCode = libraries.splice(0, 1)[0];
      }
      else {
        languageCode = populateFlag;
      }

      if (!languageCode) {
        process.stdout.write('No language specified.' + lf);
        return;
      }
      if (!libraries.length) {
        process.stdout.write('No library specified.' + lf);
        return;
      }

      h5p.addOriginalTexts(languageCode, libraries, results, hasPopulateFlag);
    }
  },
  {
    name: 'copy-translation',
    syntax: '<language-code> <language-code> <library> [<library>...]',
    shortDescription: 'Use one to create another',
    handler: function () {
      var libraries = Array.prototype.slice.call(arguments);
      var from = libraries.splice(0, 1)[0];
      var to = libraries.splice(0, 1)[0];

      if (!from) {
        process.stdout.write('No language source specified.' + lf);
        return;
      }
      if (!to) {
        process.stdout.write('No language target specified.' + lf);
        return;
      }
      if (!libraries.length) {
        process.stdout.write('No library specified.' + lf);
        return;
      }

      h5p.copyTranslation(from, to, libraries, results);
    }
  },
  {
    name: 'pack-translation',
    syntax: '<language-code> <library> [<library>...]',
    shortDescription: 'Export translations',
    handler: function () {
      var libraries = Array.prototype.slice.call(arguments);
      var languageCode = libraries.splice(0, 1)[0];

      if (!languageCode) {
        process.stdout.write('No language specified.' + lf);
        return;
      }
      if (!libraries.length) {
        process.stdout.write('No library specified.' + lf);
        return;
      }

      var options = filterOptions(libraries, [/\.zip$/]);
      var file = (options[0] ? options[0] : 'translations.zip');

      h5p.packTranslation(languageCode, libraries, file, function (error,results) {
        if (error) {
          process.stderr.write(error + lf);
        }
        else {
          var num = 0;
          for (var i = 0; i < results.length; i++) {
            if (results[i]) {
              num += 1;
            }
          }
          process.stdout.write('Successfully packed ' + num + ' translations into ' + file + lf);
        }
      });
    }
  },
  {
    name: 'recursive-minor-bump',
    syntax: '<library>',
    shortDescription: 'Bump minor version recursively',
    description: 'Increase minor version of library,' + lf +
      'then recursively increase minor version of all libraries' + lf +
      'that has dependency to the provided library.',
    handler: function () {
      var libraries = Array.prototype.slice.call(arguments);
      h5p.recursiveMinorBump(libraries, results);
    }
  },
  {
    name: 'list-deps',
    syntax: '<library>',
    shortDescription: 'Dependencies to library',
    description: 'List all libraries that has a dependency to given library.',
    handler: function () {
      var libraries = Array.prototype.slice.call(arguments);
      h5p.recursiveMinorBump(libraries, results, true);
    }
  },
  {
    name: 'check-translations',
    syntax: '[-diff] [<language>] [<library>]',
    shortDescription: 'Check that translations matches nb language',
    description: 'Checks that all languages and libraries provided have been correctly' +
    ' translated. When diff flag is supplied shows the differences between the translations',
    handler: checkTranslations
  },
  {
    name: 'build',
    syntax: '<library> [<library>...]',
    shortDescription: 'Installs dependencies, builds libraries and runs tests',
    description: 'This is particularly useful for libraries that has a build' +
    ' step, to make sure that librares has their dependencies, is built properly' +
    ' and tested, so they are properly prepared for production',
    handler: buildLibraries
  },
  {
    name: 'check-versions',
    syntax: '[my.h5p]',
    shortDescription: 'Compare version of libraries with h5p file',
    description: 'Compare version of library or multiple libraries with' + lf +
    'a given H5P file. This let you easily determine which libraries has' + lf +
    'changed since a given H5P file. Will use libraries.h5p if no H5P file' + lf +
    'is specified, or specified file is not found.',
    handler: checkVersions
  }
];

/**
 * Print all commands with a short description.
 *
 * @private
 */
function listCommands() {
  process.stdout.write('Available commands:' + lf);
  for (var i = 0; i < commands.length; i++) {
    var co = commands[i];

    if (co.name) {
      process.stdout.write('  ' + color.emphasize + co.name);
      if (co.syntax) {
        process.stdout.write(' ' + co.syntax);
      }
      process.stdout.write(color.default);
      if (co.shortDescription) {
        process.stdout.write('  ' + co.shortDescription);
      }
      process.stdout.write(lf);
    }
  }
}

/**
 * Look for command registered with given name.
 *
 * @private
 * @param {string} name
 * @returns {object}
 */
function findCommand(name) {
  for (var i = 0; i < commands.length; i++) {
    if (commands[i].name === name) {
      return commands[i];
    }
  }
}

// Shift off unused
process.argv.shift(); // node
process.argv.shift(); // script

// Get command
var command = process.argv.shift();

// List commands
if (command === undefined) {
  listCommands();
  return;
}

// Find command and call handler
var foundCommand = findCommand(command);
if (foundCommand) {
  foundCommand.handler.apply(this, process.argv);
  return;
}

// Unkown
process.stdout.write('Unknown command.' + lf);
