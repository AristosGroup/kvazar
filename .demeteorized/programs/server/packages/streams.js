(function () {

/* Imports */
var Meteor = Package.meteor.Meteor;
var _ = Package.underscore._;

/* Package-scope variables */
var EV;

(function () {

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                   //
// packages/streams/lib/ev.js                                                                                        //
//                                                                                                                   //
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                     //
function _EV() {                                                                                                     // 1
  var self = this;                                                                                                   // 2
  var handlers = {};                                                                                                 // 3
                                                                                                                     // 4
  self.emit = function emit(event) {                                                                                 // 5
    var args = Array.prototype.slice.call(arguments, 1);                                                             // 6
                                                                                                                     // 7
    if(handlers[event]) {                                                                                            // 8
      for(var lc=0; lc<handlers[event].length; lc++) {                                                               // 9
        var handler = handlers[event][lc];                                                                           // 10
        handler.apply(this, args);                                                                                   // 11
      }                                                                                                              // 12
    }                                                                                                                // 13
  };                                                                                                                 // 14
                                                                                                                     // 15
  self.on = function on(event, callback) {                                                                           // 16
    if(!handlers[event]) {                                                                                           // 17
      handlers[event] = [];                                                                                          // 18
    }                                                                                                                // 19
    handlers[event].push(callback);                                                                                  // 20
  };                                                                                                                 // 21
                                                                                                                     // 22
  self.once = function once(event, callback) {                                                                       // 23
    self.on(event, function onetimeCallback() {                                                                      // 24
      callback.apply(this, arguments);                                                                               // 25
      self.removeListener(event, onetimeCallback);                                                                   // 26
    });                                                                                                              // 27
  };                                                                                                                 // 28
                                                                                                                     // 29
  self.removeListener = function removeListener(event, callback) {                                                   // 30
    if(handlers[event]) {                                                                                            // 31
      var index = handlers[event].indexOf(callback);                                                                 // 32
      handlers[event].splice(index, 1);                                                                              // 33
    }                                                                                                                // 34
  };                                                                                                                 // 35
                                                                                                                     // 36
  self.removeAllListeners = function removeAllListeners(event) {                                                     // 37
    handlers[event] = undefined;                                                                                     // 38
  };                                                                                                                 // 39
}                                                                                                                    // 40
                                                                                                                     // 41
EV = _EV;                                                                                                            // 42
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                   //
// packages/streams/lib/server.js                                                                                    //
//                                                                                                                   //
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                     //
var EventEmitter = Npm.require('events').EventEmitter;                                                               // 1
var util = Npm.require('util');                                                                                      // 2
var Fibers = Npm.require('fibers');                                                                                  // 3
                                                                                                                     // 4
Meteor.Stream = function Stream(name) {                                                                              // 5
  EV.call(this);                                                                                                     // 6
                                                                                                                     // 7
  var self = this;                                                                                                   // 8
  var streamName = 'stream-' + name;                                                                                 // 9
  var allowFunction;                                                                                                 // 10
  var allowResultCache = true;                                                                                       // 11
  var allowResults = {};                                                                                             // 12
  var filters = [];                                                                                                  // 13
                                                                                                                     // 14
  self.name = name;                                                                                                  // 15
                                                                                                                     // 16
  var events = new EventEmitter();                                                                                   // 17
  events.setMaxListeners(0);                                                                                         // 18
                                                                                                                     // 19
  var disconnectEvents = new EV();                                                                                   // 20
                                                                                                                     // 21
  self._emit = self.emit;                                                                                            // 22
  self.emit = function emit() {                                                                                      // 23
    self.emitToSubscriptions(arguments, null, null);                                                                 // 24
  };                                                                                                                 // 25
                                                                                                                     // 26
  var defaultResult =  (typeof(Package) == 'object' && Package.insecure)? true: Meteor.Collection.insecure === true; // 27
  self.permissions = new Meteor.Stream.Permission(defaultResult, true);                                              // 28
                                                                                                                     // 29
  self.addFilter = function addFilter(callback) {                                                                    // 30
    filters.push(callback);                                                                                          // 31
  };                                                                                                                 // 32
                                                                                                                     // 33
  self.emitToSubscriptions = function emitToSubscriptions(args, subscriptionId, userId) {                            // 34
    events.emit('item', {args: args, userId: userId, subscriptionId: subscriptionId});                               // 35
  };                                                                                                                 // 36
                                                                                                                     // 37
  Meteor.publish(streamName, function() {                                                                            // 38
    check(arguments, Match.Any);                                                                                     // 39
    var subscriptionId = Random.id();                                                                                // 40
    var publication = this;                                                                                          // 41
                                                                                                                     // 42
    //send subscription id as the first document                                                                     // 43
    publication.added(streamName, subscriptionId, {type: 'subscriptionId'});                                         // 44
    publication.ready();                                                                                             // 45
    events.on('item', onItem);                                                                                       // 46
                                                                                                                     // 47
    function onItem(item) {                                                                                          // 48
      Fibers(function() {                                                                                            // 49
        var id = Random.id();                                                                                        // 50
        if(self.permissions.checkPermission('read', subscriptionId, publication.userId, item.args)) {                // 51
          //do not send again this to the sender                                                                     // 52
          if(subscriptionId != item.subscriptionId) {                                                                // 53
            publication.added(streamName, id, item);                                                                 // 54
            publication.removed(streamName, id);                                                                     // 55
          }                                                                                                          // 56
        }                                                                                                            // 57
      }).run();                                                                                                      // 58
    }                                                                                                                // 59
                                                                                                                     // 60
    publication.onStop(function() {                                                                                  // 61
      //trigger related onDisconnect handlers if exists                                                              // 62
      Fibers(function() {                                                                                            // 63
        disconnectEvents.emit(subscriptionId);                                                                       // 64
        disconnectEvents.removeAllListeners(subscriptionId);                                                         // 65
      }).run();                                                                                                      // 66
      events.removeListener('item', onItem);                                                                         // 67
    });                                                                                                              // 68
  });                                                                                                                // 69
                                                                                                                     // 70
  var methods = {};                                                                                                  // 71
  methods[streamName] = function(subscriptionId, args) {                                                             // 72
    check(arguments, Match.Any);                                                                                     // 73
    //in order to send this to the server callback                                                                   // 74
    var userId = this.userId;                                                                                        // 75
    Fibers(function() {                                                                                              // 76
      var methodContext = {};                                                                                        // 77
      methodContext.userId = userId;                                                                                 // 78
      methodContext.subscriptionId = subscriptionId;                                                                 // 79
                                                                                                                     // 80
      //in order to send this to the serve callback                                                                  // 81
      methodContext.allowed = self.permissions.checkPermission('write', subscriptionId, methodContext.userId, args); // 82
      if(methodContext.allowed) {                                                                                    // 83
        //apply filters                                                                                              // 84
        args = applyFilters(args, methodContext);                                                                    // 85
        self.emitToSubscriptions(args, subscriptionId, methodContext.userId);                                        // 86
        //send to firehose if exists                                                                                 // 87
        if(self.firehose) {                                                                                          // 88
          self.firehose(args, subscriptionId, methodContext.userId);                                                 // 89
        }                                                                                                            // 90
      }                                                                                                              // 91
      //need to send this to server always                                                                           // 92
      self._emit.apply(methodContext, args);                                                                         // 93
                                                                                                                     // 94
      //register onDisconnect handlers if provided                                                                   // 95
      if(typeof(methodContext.onDisconnect) == 'function') {                                                         // 96
        disconnectEvents.on(subscriptionId, methodContext.onDisconnect)                                              // 97
      }                                                                                                              // 98
                                                                                                                     // 99
    }).run();                                                                                                        // 100
  };                                                                                                                 // 101
  Meteor.methods(methods);                                                                                           // 102
                                                                                                                     // 103
  function applyFilters(args, context) {                                                                             // 104
    var eventName = args.shift();                                                                                    // 105
    filters.forEach(function(filter) {                                                                               // 106
      args = filter.call(context, eventName, args);                                                                  // 107
    });                                                                                                              // 108
    args.unshift(eventName);                                                                                         // 109
    return args;                                                                                                     // 110
  }                                                                                                                  // 111
};                                                                                                                   // 112
                                                                                                                     // 113
util.inherits(Meteor.Stream, EV);                                                                                    // 114
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                   //
// packages/streams/lib/stream_permission.js                                                                         //
//                                                                                                                   //
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                     //
Meteor.Stream.Permission = function (acceptAll, cacheAll) {                                                          // 1
  var options = {                                                                                                    // 2
    "read": {                                                                                                        // 3
      results: {}                                                                                                    // 4
    },                                                                                                               // 5
    "write": {                                                                                                       // 6
      results: {}                                                                                                    // 7
    }                                                                                                                // 8
  };                                                                                                                 // 9
                                                                                                                     // 10
  this.read = function(func, cache) {                                                                                // 11
    options['read']['func'] = func;                                                                                  // 12
    options['read']['doCache'] = (cache === undefined)? cacheAll: cache;                                             // 13
  };                                                                                                                 // 14
                                                                                                                     // 15
  this.write = function(func, cache) {                                                                               // 16
    options['write']['func'] = func;                                                                                 // 17
    options['write']['doCache'] = (cache === undefined)? cacheAll: cache;                                            // 18
  };                                                                                                                 // 19
                                                                                                                     // 20
  this.checkPermission = function(type, subscriptionId, userId, args) {                                              // 21
    var eventName = args[0];                                                                                         // 22
    var namespace = subscriptionId + '-' + eventName;                                                                // 23
    var result = options[type].results[namespace];                                                                   // 24
                                                                                                                     // 25
    if(result === undefined) {                                                                                       // 26
      var func = options[type].func;                                                                                 // 27
      if(func) {                                                                                                     // 28
        var context = {subscriptionId: subscriptionId, userId: userId};                                              // 29
        result = func.apply(context, args);                                                                          // 30
        if(options[type].doCache) {                                                                                  // 31
          options[type].results[namespace] = result;                                                                 // 32
        }                                                                                                            // 33
        return result;                                                                                               // 34
      } else {                                                                                                       // 35
        return acceptAll;                                                                                            // 36
      }                                                                                                              // 37
    } else {                                                                                                         // 38
      return result;                                                                                                 // 39
    }                                                                                                                // 40
  };                                                                                                                 // 41
}                                                                                                                    // 42
                                                                                                                     // 43
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);


/* Exports */
if (typeof Package === 'undefined') Package = {};
Package.streams = {};

})();
