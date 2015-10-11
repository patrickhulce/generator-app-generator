'use strict';
var yeoman = require('yeoman-generator');
var chalk = require('chalk');
var yosay = require('yosay');
var fs = require('fs');
var YAML = require('js-yaml');
var _ = require('lodash');
var request = require('request');

var gruntPackageMapping = {
  shell: 'grunt-shell',
  concurrent: 'grunt-concurrent',
  bowermap: 'grunt-bowermap',
  nodemon: 'grunt-nodemon'
};

module.exports = yeoman.generators.Base.extend({
  constructor: function () {
    yeoman.generators.Base.apply(this, arguments);

    this.argument('appConfigFile', {
      type: String,
      required: true
    });

    this.appConfig = YAML.safeLoad(fs.readFileSync(this.appConfigFile, 'utf8'));
  },
  prompting: function () {
    var done = this.async();

    // Have Yeoman greet the user.
    this.log(yosay(
      'Welcome to the top-notch ' + chalk.red('AppGenerator') + ' generator!'
    ));

    var prompts = _.map(this.appConfig.prompts, function (prompt) {
      var isBoolean = prompt.indexOf('?') !== -1;
      var variableName = prompt.replace('?', '');
      return {
        name: variableName,
        type: isBoolean ? 'confirm' : 'input',
        message: 'Value for ' + prompt,
        default: isBoolean ? true : 'foobar'
      }
    });

    this.prompt(prompts, function (props) {
      this.props = props;
      done();
    }.bind(this));
  },

  writing: {
    app: function () {

      var self = this;
      var templateData = _.merge(self.props, {
        slugify: function (name) {
          return name.toLowerCase().replace(/\s+/g, '-');
        }
      });

      var fileCount = function (structure) {
        return _.sum(structure, function (file) {
          return typeof file === 'object' ? fileCount(file) : 1;
        });
      };

      var _done = this.async();
      var done = _.after(fileCount(self.appConfig.structure), _done);

      var buildDirectory = function (structure, path) {
        _.forEach(structure, function (file, name) {
          var destination = path + name;
          if (typeof file === 'object') {
            buildDirectory(file, destination + '/');
          } else if (file.indexOf('repo://') !== -1) {
            var url = self.appConfig.repository + file.substr('repo://'.length);
            var tmpDest = destination.replace(new RegExp('/', 'g'), '_');
            request(url).
              pipe(fs.createWriteStream(self.templatePath('tmp/' + tmpDest))).
              on('finish', function () {
                var binaryExtensions = ['png', 'jpg', 'jpeg'];
                var regexMatch = file.match(/.*\.([^.]+)$/);
                var extension = regexMatch ? regexMatch[1] : file;

                var src = self.templatePath('tmp/' + tmpDest);
                var dest = self.destinationPath(destination);

                if (_.includes(binaryExtensions, extension)) {
                  self.fs.copy(src, dest);
                } else {
                  self.fs.copyTpl(src, dest, templateData);
                }
                done();
              });
          } else {
            self.fs.write(self.destinationPath(destination), file);
            done();
          }
        });
      };

      fs.mkdir(self.templatePath('tmp/'), function () {
        buildDirectory(self.appConfig.structure, '');
      });
    },

    grunt: function () {
      var grunt = this.appConfig.grunt;
      var gruntFile = this.gruntfile;
      var gruntNpmTasks = _.keys(grunt.config).map(function (name) {
        return gruntPackageMapping[name] || 'grunt-contrib-' + name;
      });

      gruntFile.loadNpmTasks(gruntNpmTasks);

      _.forEach(grunt.config, function (config, name) {
        gruntFile.insertConfig(name, JSON.stringify(config));
      });

      _.forEach(grunt.tasks, function (jobs, taskName) {
        gruntFile.registerTask(taskName, jobs);
      });

      this.gruntPackages = gruntNpmTasks.concat(['grunt']);
    }
  },

  install: function () {
    var responses = this.props;
    var bower = _.filter(this.appConfig.bower, function (pkg) {
      var variableName = 'pkg-' + pkg;
      return responses[variableName] === undefined || responses[variableName];
    });
    var npm = this.appConfig.npm.concat(this.gruntPackages);

    this.log("Installing: " + bower);
    this.log("Installing: " + npm);

    this.bowerInstall(bower, {save: true});
    this.npmInstall(npm, {save: true});
  }
});
