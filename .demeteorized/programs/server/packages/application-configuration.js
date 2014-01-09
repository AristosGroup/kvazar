(function () {

/* Imports */
var Meteor = Package.meteor.Meteor;
var Log = Package.logging.Log;
var _ = Package.underscore._;
var DDP = Package.livedata.DDP;
var DDPServer = Package.livedata.DDPServer;
var EJSON = Package.ejson.EJSON;
var Follower = Package['follower-livedata'].Follower;

/* Package-scope variables */
var AppConfig;

(function () {

///////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                           //
// packages/application-configuration/config.js                                              //
//                                                                                           //
///////////////////////////////////////////////////////////////////////////////////////////////
                                                                                             //
var Future = Npm.require("fibers/future");                                                   // 1
                                                                                             // 2
AppConfig = {};                                                                              // 3
                                                                                             // 4
                                                                                             // 5
AppConfig.findGalaxy = _.once(function () {                                                  // 6
  if (!('GALAXY' in process.env || 'ULTRAWORLD_DDP_ENDPOINT' in process.env)) {              // 7
    return null;                                                                             // 8
  }                                                                                          // 9
  return Follower.connect(process.env.ULTRAWORLD_DDP_ENDPOINT || process.env.GALAXY);        // 10
});                                                                                          // 11
                                                                                             // 12
var ultra = AppConfig.findGalaxy();                                                          // 13
                                                                                             // 14
var subFuture = new Future();                                                                // 15
if (ultra)                                                                                   // 16
  ultra.subscribe("oneApp", process.env.GALAXY_APP, subFuture.resolver());                   // 17
var OneAppApps;                                                                              // 18
var Services;                                                                                // 19
var collectionFuture = new Future();                                                         // 20
                                                                                             // 21
Meteor.startup(function () {                                                                 // 22
  if (ultra) {                                                                               // 23
    OneAppApps = new Meteor.Collection("apps", {                                             // 24
      connection: ultra                                                                      // 25
    });                                                                                      // 26
    Services = new Meteor.Collection('services', {                                           // 27
      connection: ultra                                                                      // 28
    });                                                                                      // 29
    // allow us to block on the collections being ready                                      // 30
    collectionFuture.return();                                                               // 31
  }                                                                                          // 32
});                                                                                          // 33
                                                                                             // 34
// XXX: Remove this once we allow the same collection to be new'd from multiple              // 35
// places.                                                                                   // 36
AppConfig._getAppCollection = function () {                                                  // 37
  collectionFuture.wait();                                                                   // 38
  return OneAppApps;                                                                         // 39
};                                                                                           // 40
                                                                                             // 41
var staticAppConfig;                                                                         // 42
                                                                                             // 43
try {                                                                                        // 44
  if (process.env.APP_CONFIG) {                                                              // 45
    staticAppConfig = JSON.parse(process.env.APP_CONFIG);                                    // 46
  } else {                                                                                   // 47
    var settings;                                                                            // 48
    try {                                                                                    // 49
      if (process.env.METEOR_SETTINGS) {                                                     // 50
        settings = JSON.parse(process.env.METEOR_SETTINGS);                                  // 51
      }                                                                                      // 52
    } catch (e) {                                                                            // 53
      Log.warn("Could not parse METEOR_SETTINGS as JSON");                                   // 54
    }                                                                                        // 55
    staticAppConfig = {                                                                      // 56
      settings: settings,                                                                    // 57
      packages: {                                                                            // 58
        'mongo-livedata': {                                                                  // 59
          url: process.env.MONGO_URL,                                                        // 60
          oplog: process.env.MONGO_OPLOG_URL                                                 // 61
        }                                                                                    // 62
      }                                                                                      // 63
    };                                                                                       // 64
  }                                                                                          // 65
} catch (e) {                                                                                // 66
  Log.warn("Could not parse initial APP_CONFIG environment variable");                       // 67
};                                                                                           // 68
                                                                                             // 69
AppConfig.getAppConfig = function () {                                                       // 70
  if (!subFuture.isResolved() && staticAppConfig) {                                          // 71
    return staticAppConfig;                                                                  // 72
  }                                                                                          // 73
  subFuture.wait();                                                                          // 74
  var myApp = OneAppApps.findOne(process.env.GALAXY_APP);                                    // 75
  if (myApp)                                                                                 // 76
    return myApp.config;                                                                     // 77
  throw new Error("there is no app config for this app");                                    // 78
};                                                                                           // 79
                                                                                             // 80
AppConfig.configurePackage = function (packageName, configure) {                             // 81
  var appConfig = AppConfig.getAppConfig(); // Will either be based in the env var,          // 82
                                         // or wait for galaxy to connect.                   // 83
  var lastConfig =                                                                           // 84
        (appConfig && appConfig.packages && appConfig.packages[packageName]) || {};          // 85
  // Always call the configure callback "soon" even if the initial configuration             // 86
  // is empty (synchronously, though deferred would be OK).                                  // 87
  // XXX make sure that all callers of configurePackage deal well with multiple              // 88
  // callback invocations!  eg, email does not                                               // 89
  configure(lastConfig);                                                                     // 90
  var configureIfDifferent = function (app) {                                                // 91
    if (!EJSON.equals(app.config && app.config.packages && app.config.packages[packageName], // 92
                      lastConfig)) {                                                         // 93
      lastConfig = app.config.packages[packageName];                                         // 94
      configure(lastConfig);                                                                 // 95
    }                                                                                        // 96
  };                                                                                         // 97
  var subHandle;                                                                             // 98
  var observed = new Future();                                                               // 99
                                                                                             // 100
  // This is not required to finish, so defer it so it doesn't block anything                // 101
  // else.                                                                                   // 102
  Meteor.defer( function () {                                                                // 103
    // there's a Meteor.startup() that produces the various collections, make                // 104
    // sure it runs first before we continue.                                                // 105
    collectionFuture.wait();                                                                 // 106
    subHandle = OneAppApps.find(process.env.GALAXY_APP).observe({                            // 107
      added: configureIfDifferent,                                                           // 108
      changed: configureIfDifferent                                                          // 109
    });                                                                                      // 110
    observed.return();                                                                       // 111
  });                                                                                        // 112
                                                                                             // 113
  return {                                                                                   // 114
    stop: function () {                                                                      // 115
      observed.wait();                                                                       // 116
      subHandle.stop();                                                                      // 117
    }                                                                                        // 118
  };                                                                                         // 119
};                                                                                           // 120
                                                                                             // 121
                                                                                             // 122
AppConfig.configureService = function (serviceName, configure) {                             // 123
  if (ultra) {                                                                               // 124
    // there's a Meteor.startup() that produces the various collections, make                // 125
    // sure it runs first before we continue.                                                // 126
    collectionFuture.wait();                                                                 // 127
    ultra.subscribe('servicesByName', serviceName);                                          // 128
    return Services.find({name: serviceName}).observe({                                      // 129
      added: configure,                                                                      // 130
      changed: configure                                                                     // 131
    });                                                                                      // 132
  }                                                                                          // 133
                                                                                             // 134
};                                                                                           // 135
                                                                                             // 136
///////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);


/* Exports */
if (typeof Package === 'undefined') Package = {};
Package['application-configuration'] = {
  AppConfig: AppConfig
};

})();
