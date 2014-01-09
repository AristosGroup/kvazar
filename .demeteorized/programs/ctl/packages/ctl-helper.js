(function () {

/* Imports */
var Meteor = Package.meteor.Meteor;
var _ = Package.underscore._;
var DDP = Package.livedata.DDP;
var DDPServer = Package.livedata.DDPServer;
var MongoInternals = Package['mongo-livedata'].MongoInternals;
var Follower = Package['follower-livedata'].Follower;

/* Package-scope variables */
var Ctl;

(function () {

////////////////////////////////////////////////////////////////////////////////////////
//                                                                                    //
// packages/ctl-helper/ctl-helper.js                                                  //
//                                                                                    //
////////////////////////////////////////////////////////////////////////////////////////
                                                                                      //
var optimist = Npm.require('optimist');                                               // 1
var Future = Npm.require('fibers/future');                                            // 2
                                                                                      // 3
Ctl = {};                                                                             // 4
                                                                                      // 5
var connection;                                                                       // 6
var checkConnection;                                                                  // 7
                                                                                      // 8
_.extend(Ctl, {                                                                       // 9
  Commands: [],                                                                       // 10
                                                                                      // 11
  main: function (argv) {                                                             // 12
    var opt = optimist(argv)                                                          // 13
          .alias('h', 'help')                                                         // 14
          .boolean('help');                                                           // 15
    argv = opt.argv;                                                                  // 16
                                                                                      // 17
    if (argv.help) {                                                                  // 18
      argv._.splice(0, 0, "help");                                                    // 19
      delete argv.help;                                                               // 20
    }                                                                                 // 21
                                                                                      // 22
    var cmdName = 'help';                                                             // 23
    if (argv._.length)                                                                // 24
      cmdName = argv._.splice(0,1)[0];                                                // 25
                                                                                      // 26
    Ctl.findCommand(cmdName).func(argv);                                              // 27
    Ctl.disconnect();                                                                 // 28
    return 0;                                                                         // 29
  },                                                                                  // 30
                                                                                      // 31
  startServerlikeProgramIfNotPresent: function (program, tags, admin) {               // 32
    var numServers = Ctl.getJobsByApp(                                                // 33
      Ctl.myAppName(), {program: program, done: false}).count();                      // 34
    if (numServers === 0) {                                                           // 35
      Ctl.startServerlikeProgram(program, tags, admin);                               // 36
    } else {                                                                          // 37
      console.log(program, "already running.");                                       // 38
    }                                                                                 // 39
  },                                                                                  // 40
                                                                                      // 41
  startServerlikeProgram: function (program, tags, admin) {                           // 42
    var appConfig = Ctl.prettyCall(                                                   // 43
      Ctl.findGalaxy(), 'getAppConfiguration', [Ctl.myAppName()]);                    // 44
    if (typeof admin == 'undefined')                                                  // 45
      admin = appConfig.admin;                                                        // 46
                                                                                      // 47
    var proxyConfig;                                                                  // 48
    var bindPathPrefix = "";                                                          // 49
    if (admin) {                                                                      // 50
      bindPathPrefix = "/" + encodeURIComponent(Ctl.myAppName()).replace(/\./g, '_'); // 51
    }                                                                                 // 52
                                                                                      // 53
    // Allow appConfig settings to be objects or strings. We need to stringify        // 54
    // them to pass them to the app in the env var.                                   // 55
    // Backwards compat with old app config format.                                   // 56
    _.each(["settings", "METEOR_SETTINGS"], function (settingsKey) {                  // 57
      if (appConfig[settingsKey] && typeof appConfig[settingsKey] === "object")       // 58
        appConfig[settingsKey] = JSON.stringify(appConfig[settingsKey]);              // 59
    });                                                                               // 60
                                                                                      // 61
    // XXX args? env?                                                                 // 62
    Ctl.prettyCall(Ctl.findGalaxy(), 'run', [Ctl.myAppName(), program, {              // 63
      exitPolicy: 'restart',                                                          // 64
      env: {                                                                          // 65
        ROOT_URL: "https://" + appConfig.sitename + bindPathPrefix,                   // 66
        METEOR_SETTINGS: appConfig.settings || appConfig.METEOR_SETTINGS,             // 67
        ADMIN_APP: admin                                                              // 68
      },                                                                              // 69
      ports: {                                                                        // 70
        "main": {                                                                     // 71
          bindEnv: "PORT",                                                            // 72
          routeEnv: "ROUTE"//,                                                        // 73
          //bindIpEnv: "BIND_IP" // Later, we can teach Satellite to do               // 74
          //something like recommend the process bind to a particular IP here.        // 75
          //For now, we don't have a way of setting this, so Satellite binds          // 76
          //to 0.0.0.0                                                                // 77
        }                                                                             // 78
      },                                                                              // 79
      tags: tags                                                                      // 80
    }]);                                                                              // 81
    console.log("Started", program);                                                  // 82
  },                                                                                  // 83
                                                                                      // 84
  findCommand: function (name) {                                                      // 85
    var cmd = _.where(Ctl.Commands, { name: name })[0];                               // 86
    if (! cmd) {                                                                      // 87
      console.log("'" + name + "' is not a ctl command. See 'ctl --help'.");          // 88
      process.exit(1);                                                                // 89
    }                                                                                 // 90
                                                                                      // 91
    return cmd;                                                                       // 92
  },                                                                                  // 93
                                                                                      // 94
  hasProgram: function (name) {                                                       // 95
    Ctl.subscribeToAppJobs(Ctl.myAppName());                                          // 96
    var myJob = Ctl.jobsCollection().findOne(Ctl.myJobId());                          // 97
    var manifest = Ctl.prettyCall(Ctl.findGalaxy(), 'getStarManifest', [myJob.star]); // 98
    if (!manifest)                                                                    // 99
      return false;                                                                   // 100
    var found = false;                                                                // 101
    return _.find(manifest.programs, function (prog) { return prog.name === name; }); // 102
  },                                                                                  // 103
                                                                                      // 104
  findGalaxy: _.once(function () {                                                    // 105
    if (!('GALAXY' in process.env)) {                                                 // 106
      console.log(                                                                    // 107
        "GALAXY environment variable must be set. See 'galaxy --help'.");             // 108
      process.exit(1);                                                                // 109
    }                                                                                 // 110
                                                                                      // 111
    connection = Follower.connect(process.env['ULTRAWORLD_DDP_ENDPOINT']);            // 112
    checkConnection = Meteor.setInterval(function () {                                // 113
      if (Ctl.findGalaxy().status().status !== "connected" &&                         // 114
          Ctl.findGalaxy().status().retryCount > 2) {                                 // 115
        console.log("Cannot connect to galaxy; exiting");                             // 116
        process.exit(3);                                                              // 117
      }                                                                               // 118
    }, 2*1000);                                                                       // 119
    return connection;                                                                // 120
  }),                                                                                 // 121
                                                                                      // 122
  disconnect: function () {                                                           // 123
    if (connection) {                                                                 // 124
      connection.disconnect();                                                        // 125
    }                                                                                 // 126
    if (checkConnection) {                                                            // 127
      Meteor.clearInterval(checkConnection);                                          // 128
      checkConnection = null;                                                         // 129
    }                                                                                 // 130
  },                                                                                  // 131
                                                                                      // 132
  jobsCollection: _.once(function () {                                                // 133
    return new Meteor.Collection("jobs", {manager: Ctl.findGalaxy()});                // 134
  }),                                                                                 // 135
                                                                                      // 136
  // use _.memoize so that this is called only once per app.                          // 137
  subscribeToAppJobs: _.memoize(function (appName) {                                  // 138
    Ctl.findGalaxy()._subscribeAndWait("jobsByApp", [appName]);                       // 139
  }),                                                                                 // 140
                                                                                      // 141
  // XXX this never unsubs...                                                         // 142
  getJobsByApp: function (appName, restOfSelector) {                                  // 143
    var galaxy = Ctl.findGalaxy();                                                    // 144
    Ctl.subscribeToAppJobs(appName);                                                  // 145
    var selector = {app: appName};                                                    // 146
    if (restOfSelector)                                                               // 147
      _.extend(selector, restOfSelector);                                             // 148
    return Ctl.jobsCollection().find(selector);                                       // 149
  },                                                                                  // 150
                                                                                      // 151
  myAppName: _.once(function () {                                                     // 152
    if (!('GALAXY_APP' in process.env)) {                                             // 153
      console.log("GALAXY_APP environment variable must be set.");                    // 154
      process.exit(1);                                                                // 155
    }                                                                                 // 156
    return process.env.GALAXY_APP;                                                    // 157
  }),                                                                                 // 158
                                                                                      // 159
  myJobId: _.once(function () {                                                       // 160
    if (!('GALAXY_JOB' in process.env)) {                                             // 161
      console.log("GALAXY_JOB environment variable must be set.");                    // 162
      process.exit(1);                                                                // 163
    }                                                                                 // 164
    return process.env.GALAXY_JOB;                                                    // 165
  }),                                                                                 // 166
                                                                                      // 167
  usage: function() {                                                                 // 168
    process.stdout.write(                                                             // 169
      "Usage: ctl [--help] <command> [<args>]\n" +                                    // 170
        "\n" +                                                                        // 171
        "For now, the GALAXY environment variable must be set to the location of\n" + // 172
        "your Galaxy management server (Ultraworld.) This string is in the same\n" +  // 173
        "format as the argument to DDP.connect().\n" +                                // 174
        "\n" +                                                                        // 175
        "Commands:\n");                                                               // 176
    _.each(Ctl.Commands, function (cmd) {                                             // 177
      if (cmd.help && ! cmd.hidden) {                                                 // 178
        var name = cmd.name + "                ".substr(cmd.name.length);             // 179
        process.stdout.write("   " + name + cmd.help + "\n");                         // 180
      }                                                                               // 181
    });                                                                               // 182
    process.stdout.write("\n");                                                       // 183
    process.stdout.write(                                                             // 184
      "See 'ctl help <command>' for details on a command.\n");                        // 185
    process.exit(1);                                                                  // 186
  },                                                                                  // 187
                                                                                      // 188
  // XXX copied to meteor/tools/deploy-galaxy.js                                      // 189
  exitWithError: function (error, messages) {                                         // 190
    messages = messages || {};                                                        // 191
                                                                                      // 192
    if (! (error instanceof Meteor.Error))                                            // 193
      throw error; // get a stack                                                     // 194
                                                                                      // 195
    var msg = messages[error.error];                                                  // 196
    if (msg)                                                                          // 197
      process.stderr.write(msg + "\n");                                               // 198
    else if (error instanceof Meteor.Error)                                           // 199
      process.stderr.write("Denied: " + error.message + "\n");                        // 200
                                                                                      // 201
    process.exit(1);                                                                  // 202
  },                                                                                  // 203
                                                                                      // 204
  // XXX copied to meteor/tools/deploy-galaxy.js                                      // 205
  prettyCall: function (galaxy, name, args, messages) {                               // 206
    try {                                                                             // 207
      var ret = galaxy.apply(name, args);                                             // 208
    } catch (e) {                                                                     // 209
      Ctl.exitWithError(e, messages);                                                 // 210
    }                                                                                 // 211
    return ret;                                                                       // 212
  },                                                                                  // 213
                                                                                      // 214
  kill: function (programName, jobId) {                                               // 215
  console.log("Killing %s (%s)", programName, jobId);                                 // 216
  Ctl.prettyCall(Ctl.findGalaxy(), 'kill', [jobId]);                                  // 217
  }                                                                                   // 218
});                                                                                   // 219
                                                                                      // 220
////////////////////////////////////////////////////////////////////////////////////////

}).call(this);


/* Exports */
if (typeof Package === 'undefined') Package = {};
Package['ctl-helper'] = {
  Ctl: Ctl
};

})();
