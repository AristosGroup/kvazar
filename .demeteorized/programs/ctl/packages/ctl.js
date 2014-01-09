(function () {

/* Imports */
var Meteor = Package.meteor.Meteor;
var _ = Package.underscore._;
var DDP = Package.livedata.DDP;
var DDPServer = Package.livedata.DDPServer;
var MongoInternals = Package['mongo-livedata'].MongoInternals;
var Ctl = Package['ctl-helper'].Ctl;

/* Package-scope variables */
var main;

(function () {

///////////////////////////////////////////////////////////////////////////////////
//                                                                               //
// packages/ctl/ctl.js                                                           //
//                                                                               //
///////////////////////////////////////////////////////////////////////////////////
                                                                                 //
Ctl.Commands.push({                                                              // 1
  name: "help",                                                                  // 2
  func: function (argv) {                                                        // 3
    if (!argv._.length || argv.help)                                             // 4
      Ctl.usage();                                                               // 5
    var cmd = argv._.splice(0,1)[0];                                             // 6
    argv.help = true;                                                            // 7
                                                                                 // 8
    Ctl.findCommand(cmd).func(argv);                                             // 9
  }                                                                              // 10
});                                                                              // 11
                                                                                 // 12
var mergeObjects = function (obj1, obj2) {                                       // 13
  var result = _.clone(obj1);                                                    // 14
  _.each(obj2, function (v, k) {                                                 // 15
    // If both objects have an object at this key, then merge those objects.     // 16
    // Otherwise, choose obj2's value.                                           // 17
    if ((v instanceof Object) && (obj1[k] instanceof Object))                    // 18
      result[k] = mergeObjects(v, obj1[k]);                                      // 19
    else                                                                         // 20
      result[k] = v;                                                             // 21
  });                                                                            // 22
  return result;                                                                 // 23
};                                                                               // 24
                                                                                 // 25
                                                                                 // 26
                                                                                 // 27
var startFun = function (argv) {                                                 // 28
  if (argv.help || argv._.length !== 0) {                                        // 29
    process.stderr.write(                                                        // 30
      "Usage: ctl start\n" +                                                     // 31
        "\n" +                                                                   // 32
        "Starts the app. For now, this just means that it runs the 'server'\n" + // 33
        "program.\n"                                                             // 34
    );                                                                           // 35
    process.exit(1);                                                             // 36
  }                                                                              // 37
  if (Ctl.hasProgram("console")) {                                               // 38
    console.log("starting console for app", Ctl.myAppName());                    // 39
    Ctl.startServerlikeProgramIfNotPresent("console", ["admin"], true);          // 40
  }                                                                              // 41
  console.log("starting server for app", Ctl.myAppName());                       // 42
  Ctl.startServerlikeProgramIfNotPresent("server", ["runner"]);                  // 43
};                                                                               // 44
                                                                                 // 45
Ctl.Commands.push({                                                              // 46
  name: "start",                                                                 // 47
  help: "Start this app",                                                        // 48
  func: startFun                                                                 // 49
});                                                                              // 50
                                                                                 // 51
                                                                                 // 52
Ctl.Commands.push({                                                              // 53
  name: "endUpdate",                                                             // 54
  help: "Start this app to end an update",                                       // 55
  func: startFun                                                                 // 56
});                                                                              // 57
                                                                                 // 58
var stopFun =  function (argv) {                                                 // 59
  if (argv.help || argv._.length !== 0) {                                        // 60
    process.stderr.write(                                                        // 61
      "Usage: ctl stop\n" +                                                      // 62
        "\n" +                                                                   // 63
        "Stops the app. For now, this just means that it kills all jobs\n" +     // 64
        "other than itself.\n"                                                   // 65
    );                                                                           // 66
    process.exit(1);                                                             // 67
  }                                                                              // 68
                                                                                 // 69
  // Get all jobs (other than this job: don't commit suicide!) that are not      // 70
  // already killed.                                                             // 71
  var jobs = Ctl.getJobsByApp(                                                   // 72
    Ctl.myAppName(), {_id: {$ne: Ctl.myJobId()}, done: false});                  // 73
  jobs.forEach(function (job) {                                                  // 74
    // Don't commit suicide.                                                     // 75
    if (job._id === Ctl.myJobId())                                               // 76
      return;                                                                    // 77
    // It's dead, Jim.                                                           // 78
    if (job.done)                                                                // 79
      return;                                                                    // 80
    Ctl.kill(job.program, job._id);                                              // 81
  });                                                                            // 82
  console.log("Server stopped.");                                                // 83
};                                                                               // 84
                                                                                 // 85
Ctl.Commands.push({                                                              // 86
  name: "stop",                                                                  // 87
  help: "Stop this app",                                                         // 88
  func: stopFun                                                                  // 89
});                                                                              // 90
                                                                                 // 91
                                                                                 // 92
Ctl.Commands.push({                                                              // 93
  name: "beginUpdate",                                                           // 94
  help: "Stop this app to begin an update",                                      // 95
  func: stopFun                                                                  // 96
});                                                                              // 97
                                                                                 // 98
Ctl.Commands.push({                                                              // 99
  name: "scale",                                                                 // 100
  help: "Scale jobs",                                                            // 101
  func: function (argv) {                                                        // 102
    if (argv.help || argv._.length === 0 || _.contains(argv._, 'ctl')) {         // 103
      process.stderr.write(                                                      // 104
"Usage: ctl scale program1=n [...] \n" +                                         // 105
 "\n" +                                                                          // 106
"Scales some programs. Runs or kills jobs until there are n non-done jobs\n" +   // 107
"in that state.\n"                                                               // 108
);                                                                               // 109
      process.exit(1);                                                           // 110
    }                                                                            // 111
                                                                                 // 112
    var scales = _.map(argv._, function (arg) {                                  // 113
      var m = arg.match(/^(.+)=(\d+)$/);                                         // 114
      if (!m) {                                                                  // 115
        console.log("Bad scaling argument; should be program=number.");          // 116
        process.exit(1);                                                         // 117
      }                                                                          // 118
      return {program: m[1], scale: parseInt(m[2])};                             // 119
    });                                                                          // 120
                                                                                 // 121
    _.each(scales, function (s) {                                                // 122
      var jobs = Ctl.getJobsByApp(                                               // 123
        Ctl.myAppName(), {program: s.program, done: false});                     // 124
      jobs.forEach(function (job) {                                              // 125
        --s.scale;                                                               // 126
        // Is this an extraneous job, more than the number that we need? Kill    // 127
        // it!                                                                   // 128
        if (s.scale < 0) {                                                       // 129
          Ctl.kill(s.program, job._id);                                          // 130
        }                                                                        // 131
      });                                                                        // 132
      // Now start any jobs that are necessary.                                  // 133
      if (s.scale <= 0)                                                          // 134
        return;                                                                  // 135
      console.log("Starting %d jobs for %s", s.scale, s.program);                // 136
      _.times(s.scale, function () {                                             // 137
        // XXX args? env?                                                        // 138
        Ctl.prettyCall(Ctl.findGalaxy(), 'run', [Ctl.myAppName(), s.program, {   // 139
          exitPolicy: 'restart'                                                  // 140
        }]);                                                                     // 141
      });                                                                        // 142
    });                                                                          // 143
  }                                                                              // 144
});                                                                              // 145
                                                                                 // 146
main = function (argv) {                                                         // 147
  return Ctl.main(argv);                                                         // 148
};                                                                               // 149
                                                                                 // 150
///////////////////////////////////////////////////////////////////////////////////

}).call(this);


/* Exports */
if (typeof Package === 'undefined') Package = {};
Package.ctl = {
  main: main
};

})();
