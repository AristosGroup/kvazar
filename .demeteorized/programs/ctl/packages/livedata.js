(function () {

/* Imports */
var Meteor = Package.meteor.Meteor;
var check = Package.check.check;
var Match = Package.check.Match;
var Random = Package.random.Random;
var EJSON = Package.ejson.EJSON;
var _ = Package.underscore._;
var Deps = Package.deps.Deps;
var Log = Package.logging.Log;
var LocalCollection = Package.minimongo.LocalCollection;

/* Package-scope variables */
var DDP, DDPServer, LivedataTest, Retry, toSockjsUrl, toWebsocketUrl, StreamServer, Server, SUPPORTED_DDP_VERSIONS, MethodInvocation, parseDDP, stringifyDDP, allConnections;

(function () {

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/livedata/common.js                                                                                         //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
LivedataTest = {};                                                                                                     // 1
                                                                                                                       // 2
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/livedata/retry.js                                                                                          //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
// Retry logic with an exponential backoff.                                                                            // 1
                                                                                                                       // 2
Retry = function (options) {                                                                                           // 3
  var self = this;                                                                                                     // 4
  _.extend(self, _.defaults(_.clone(options || {}), {                                                                  // 5
    // time for initial reconnect attempt.                                                                             // 6
    baseTimeout: 1000,                                                                                                 // 7
    // exponential factor to increase timeout each attempt.                                                            // 8
    exponent: 2.2,                                                                                                     // 9
    // maximum time between reconnects. keep this intentionally                                                        // 10
    // high-ish to ensure a server can recover from a failure caused                                                   // 11
    // by load                                                                                                         // 12
    maxTimeout: 5 * 60000, // 5 minutes                                                                                // 13
    // time to wait for the first 2 retries.  this helps page reload                                                   // 14
    // speed during dev mode restarts, but doesn't hurt prod too                                                       // 15
    // much (due to CONNECT_TIMEOUT)                                                                                   // 16
    minTimeout: 10,                                                                                                    // 17
    // how many times to try to reconnect 'instantly'                                                                  // 18
    minCount: 2,                                                                                                       // 19
    // fuzz factor to randomize reconnect times by. avoid reconnect                                                    // 20
    // storms.                                                                                                         // 21
    fuzz: 0.5 // +- 25%                                                                                                // 22
  }));                                                                                                                 // 23
  self.retryTimer = null;                                                                                              // 24
};                                                                                                                     // 25
                                                                                                                       // 26
_.extend(Retry.prototype, {                                                                                            // 27
                                                                                                                       // 28
  // Reset a pending retry, if any.                                                                                    // 29
  clear: function () {                                                                                                 // 30
    var self = this;                                                                                                   // 31
    if (self.retryTimer)                                                                                               // 32
      clearTimeout(self.retryTimer);                                                                                   // 33
    self.retryTimer = null;                                                                                            // 34
  },                                                                                                                   // 35
                                                                                                                       // 36
  // Calculate how long to wait in milliseconds to retry, based on the                                                 // 37
  // `count` of which retry this is.                                                                                   // 38
  _timeout: function (count) {                                                                                         // 39
    var self = this;                                                                                                   // 40
                                                                                                                       // 41
    if (count < self.minCount)                                                                                         // 42
      return self.minTimeout;                                                                                          // 43
                                                                                                                       // 44
    var timeout = Math.min(                                                                                            // 45
      self.maxTimeout,                                                                                                 // 46
      self.baseTimeout * Math.pow(self.exponent, count));                                                              // 47
    // fuzz the timeout randomly, to avoid reconnect storms when a                                                     // 48
    // server goes down.                                                                                               // 49
    timeout = timeout * ((Random.fraction() * self.fuzz) +                                                             // 50
                         (1 - self.fuzz/2));                                                                           // 51
    return timeout;                                                                                                    // 52
  },                                                                                                                   // 53
                                                                                                                       // 54
  // Call `fn` after a delay, based on the `count` of which retry this is.                                             // 55
  retryLater: function (count, fn) {                                                                                   // 56
    var self = this;                                                                                                   // 57
    var timeout = self._timeout(count);                                                                                // 58
    if (self.retryTimer)                                                                                               // 59
      clearTimeout(self.retryTimer);                                                                                   // 60
    self.retryTimer = setTimeout(fn, timeout);                                                                         // 61
    return timeout;                                                                                                    // 62
  }                                                                                                                    // 63
                                                                                                                       // 64
});                                                                                                                    // 65
                                                                                                                       // 66
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/livedata/stream_client_nodejs.js                                                                           //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
// @param endpoint {String} URL to Meteor app                                                                          // 1
//   "http://subdomain.meteor.com/" or "/" or                                                                          // 2
//   "ddp+sockjs://foo-**.meteor.com/sockjs"                                                                           // 3
//                                                                                                                     // 4
// We do some rewriting of the URL to eventually make it "ws://" or "wss://",                                          // 5
// whatever was passed in.  At the very least, what Meteor.absoluteUrl() returns                                       // 6
// us should work.                                                                                                     // 7
//                                                                                                                     // 8
// We don't do any heartbeating. (The logic that did this in sockjs was removed,                                       // 9
// because it used a built-in sockjs mechanism. We could do it with WebSocket                                          // 10
// ping frames or with DDP-level messages.)                                                                            // 11
LivedataTest.ClientStream = function (endpoint, options) {                                                             // 12
  var self = this;                                                                                                     // 13
  self.options = _.extend({                                                                                            // 14
    retry: true                                                                                                        // 15
  }, options);                                                                                                         // 16
                                                                                                                       // 17
  // WebSocket-Node https://github.com/Worlize/WebSocket-Node                                                          // 18
  // Chosen because it can run without native components. It has a                                                     // 19
  // somewhat idiosyncratic API. We may want to use 'ws' instead in the                                                // 20
  // future.                                                                                                           // 21
  //                                                                                                                   // 22
  // Since server-to-server DDP is still an experimental feature, we only                                              // 23
  // require the module if we actually create a server-to-server                                                       // 24
  // connection. This is a minor efficiency improvement, but moreover: while                                           // 25
  // 'websocket' doesn't require native components, it tries to use some                                               // 26
  // optional native components and prints a warning if it can't load                                                  // 27
  // them. Since native components in packages don't work when transferred to                                          // 28
  // other architectures yet, this means that require('websocket') prints a                                            // 29
  // spammy log message when deployed to another architecture. Delaying the                                            // 30
  // require means you only get the log message if you're actually using the                                           // 31
  // feature.                                                                                                          // 32
  self.client = new (Npm.require('websocket').client)();                                                               // 33
  self.endpoint = endpoint;                                                                                            // 34
  self.currentConnection = null;                                                                                       // 35
                                                                                                                       // 36
  self.client.on('connect', Meteor.bindEnvironment(                                                                    // 37
    function (connection) {                                                                                            // 38
      return self._onConnect(connection);                                                                              // 39
    },                                                                                                                 // 40
    "stream connect callback"                                                                                          // 41
  ));                                                                                                                  // 42
                                                                                                                       // 43
  self.client.on('connectFailed', function (error) {                                                                   // 44
    // XXX: Make this do something better than make the tests hang if it does not work.                                // 45
    return self._lostConnection();                                                                                     // 46
  });                                                                                                                  // 47
                                                                                                                       // 48
  self._initCommon();                                                                                                  // 49
                                                                                                                       // 50
  //// Kickoff!                                                                                                        // 51
  self._launchConnection();                                                                                            // 52
};                                                                                                                     // 53
                                                                                                                       // 54
_.extend(LivedataTest.ClientStream.prototype, {                                                                        // 55
                                                                                                                       // 56
  // data is a utf8 string. Data sent while not connected is dropped on                                                // 57
  // the floor, and it is up the user of this API to retransmit lost                                                   // 58
  // messages on 'reset'                                                                                               // 59
  send: function (data) {                                                                                              // 60
    var self = this;                                                                                                   // 61
    if (self.currentStatus.connected) {                                                                                // 62
      self.currentConnection.send(data);                                                                               // 63
    }                                                                                                                  // 64
  },                                                                                                                   // 65
                                                                                                                       // 66
  // Changes where this connection points                                                                              // 67
  _changeUrl: function (url) {                                                                                         // 68
    var self = this;                                                                                                   // 69
    self.endpoint = url;                                                                                               // 70
  },                                                                                                                   // 71
                                                                                                                       // 72
  _onConnect: function (connection) {                                                                                  // 73
    var self = this;                                                                                                   // 74
                                                                                                                       // 75
    if (self._forcedToDisconnect) {                                                                                    // 76
      // We were asked to disconnect between trying to open the connection and                                         // 77
      // actually opening it. Let's just pretend this never happened.                                                  // 78
      connection.close();                                                                                              // 79
      return;                                                                                                          // 80
    }                                                                                                                  // 81
                                                                                                                       // 82
    if (self.currentStatus.connected) {                                                                                // 83
      // We already have a connection. It must have been the case that                                                 // 84
      // we started two parallel connection attempts (because we                                                       // 85
      // wanted to 'reconnect now' on a hanging connection and we had                                                  // 86
      // no way to cancel the connection attempt.) Just ignore/close                                                   // 87
      // the latecomer.                                                                                                // 88
      connection.close();                                                                                              // 89
      return;                                                                                                          // 90
    }                                                                                                                  // 91
                                                                                                                       // 92
    if (self.connectionTimer) {                                                                                        // 93
      clearTimeout(self.connectionTimer);                                                                              // 94
      self.connectionTimer = null;                                                                                     // 95
    }                                                                                                                  // 96
                                                                                                                       // 97
    var onError = Meteor.bindEnvironment(                                                                              // 98
      function (_this, error) {                                                                                        // 99
        if (self.currentConnection !== _this)                                                                          // 100
          return;                                                                                                      // 101
                                                                                                                       // 102
        Meteor._debug("stream error", error.toString(),                                                                // 103
                      (new Date()).toDateString());                                                                    // 104
        self._lostConnection();                                                                                        // 105
      },                                                                                                               // 106
      "stream error callback"                                                                                          // 107
    );                                                                                                                 // 108
                                                                                                                       // 109
    connection.on('error', function (error) {                                                                          // 110
      // We have to pass in `this` explicitly because bindEnvironment                                                  // 111
      // doesn't propagate it for us.                                                                                  // 112
      onError(this, error);                                                                                            // 113
    });                                                                                                                // 114
                                                                                                                       // 115
    var onClose = Meteor.bindEnvironment(                                                                              // 116
      function (_this) {                                                                                               // 117
        if (self.options._testOnClose)                                                                                 // 118
          self.options._testOnClose();                                                                                 // 119
                                                                                                                       // 120
        if (self.currentConnection !== _this)                                                                          // 121
          return;                                                                                                      // 122
                                                                                                                       // 123
        self._lostConnection();                                                                                        // 124
      },                                                                                                               // 125
      "stream close callback"                                                                                          // 126
    );                                                                                                                 // 127
                                                                                                                       // 128
    connection.on('close', function () {                                                                               // 129
      // We have to pass in `this` explicitly because bindEnvironment                                                  // 130
      // doesn't propagate it for us.                                                                                  // 131
      onClose(this);                                                                                                   // 132
    });                                                                                                                // 133
                                                                                                                       // 134
    connection.on('message', function (message) {                                                                      // 135
      if (self.currentConnection !== this)                                                                             // 136
        return; // old connection still emitting messages                                                              // 137
                                                                                                                       // 138
      if (message.type === "utf8") // ignore binary frames                                                             // 139
        _.each(self.eventCallbacks.message, function (callback) {                                                      // 140
          callback(message.utf8Data);                                                                                  // 141
        });                                                                                                            // 142
    });                                                                                                                // 143
                                                                                                                       // 144
    // update status                                                                                                   // 145
    self.currentConnection = connection;                                                                               // 146
    self.currentStatus.status = "connected";                                                                           // 147
    self.currentStatus.connected = true;                                                                               // 148
    self.currentStatus.retryCount = 0;                                                                                 // 149
    self.statusChanged();                                                                                              // 150
                                                                                                                       // 151
    // fire resets. This must come after status change so that clients                                                 // 152
    // can call send from within a reset callback.                                                                     // 153
    _.each(self.eventCallbacks.reset, function (callback) { callback(); });                                            // 154
  },                                                                                                                   // 155
                                                                                                                       // 156
  _cleanup: function () {                                                                                              // 157
    var self = this;                                                                                                   // 158
                                                                                                                       // 159
    self._clearConnectionTimer();                                                                                      // 160
    if (self.currentConnection) {                                                                                      // 161
      var conn = self.currentConnection;                                                                               // 162
      self.currentConnection = null;                                                                                   // 163
      conn.close();                                                                                                    // 164
    }                                                                                                                  // 165
  },                                                                                                                   // 166
                                                                                                                       // 167
  _clearConnectionTimer: function () {                                                                                 // 168
    var self = this;                                                                                                   // 169
                                                                                                                       // 170
    if (self.connectionTimer) {                                                                                        // 171
      clearTimeout(self.connectionTimer);                                                                              // 172
      self.connectionTimer = null;                                                                                     // 173
    }                                                                                                                  // 174
  },                                                                                                                   // 175
                                                                                                                       // 176
  _launchConnection: function () {                                                                                     // 177
    var self = this;                                                                                                   // 178
    self._cleanup(); // cleanup the old socket, if there was one.                                                      // 179
                                                                                                                       // 180
    // launch a connect attempt. we have no way to track it. we either                                                 // 181
    // get an _onConnect event, or we don't.                                                                           // 182
                                                                                                                       // 183
    // XXX: set up a timeout on this.                                                                                  // 184
                                                                                                                       // 185
    // we would like to specify 'ddp' as the protocol here, but                                                        // 186
    // unfortunately WebSocket-Node fails the handshake if we ask for                                                  // 187
    // a protocol and the server doesn't send one back (and sockjs                                                     // 188
    // doesn't). also, related: I guess we have to accept that                                                         // 189
    // 'stream' is ddp-specific                                                                                        // 190
    self.client.connect(toWebsocketUrl(self.endpoint));                                                                // 191
                                                                                                                       // 192
    if (self.connectionTimer)                                                                                          // 193
      clearTimeout(self.connectionTimer);                                                                              // 194
    self.connectionTimer = setTimeout(                                                                                 // 195
      _.bind(self._lostConnection, self),                                                                              // 196
      self.CONNECT_TIMEOUT);                                                                                           // 197
  }                                                                                                                    // 198
});                                                                                                                    // 199
                                                                                                                       // 200
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/livedata/stream_client_common.js                                                                           //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
// XXX from Underscore.String (http://epeli.github.com/underscore.string/)                                             // 1
var startsWith = function(str, starts) {                                                                               // 2
  return str.length >= starts.length &&                                                                                // 3
    str.substring(0, starts.length) === starts;                                                                        // 4
};                                                                                                                     // 5
var endsWith = function(str, ends) {                                                                                   // 6
  return str.length >= ends.length &&                                                                                  // 7
    str.substring(str.length - ends.length) === ends;                                                                  // 8
};                                                                                                                     // 9
                                                                                                                       // 10
// @param url {String} URL to Meteor app, eg:                                                                          // 11
//   "/" or "madewith.meteor.com" or "https://foo.meteor.com"                                                          // 12
//   or "ddp+sockjs://ddp--****-foo.meteor.com/sockjs"                                                                 // 13
// @returns {String} URL to the endpoint with the specific scheme and subPath, e.g.                                    // 14
// for scheme "http" and subPath "sockjs"                                                                              // 15
//   "http://subdomain.meteor.com/sockjs" or "/sockjs"                                                                 // 16
//   or "https://ddp--1234-foo.meteor.com/sockjs"                                                                      // 17
var translateUrl =  function(url, newSchemeBase, subPath) {                                                            // 18
  if (! newSchemeBase) {                                                                                               // 19
    newSchemeBase = "http";                                                                                            // 20
  }                                                                                                                    // 21
                                                                                                                       // 22
  var ddpUrlMatch = url.match(/^ddp(i?)\+sockjs:\/\//);                                                                // 23
  var httpUrlMatch = url.match(/^http(s?):\/\//);                                                                      // 24
  var newScheme;                                                                                                       // 25
  if (ddpUrlMatch) {                                                                                                   // 26
    // Remove scheme and split off the host.                                                                           // 27
    var urlAfterDDP = url.substr(ddpUrlMatch[0].length);                                                               // 28
    newScheme = ddpUrlMatch[1] === "i" ? newSchemeBase : newSchemeBase + "s";                                          // 29
    var slashPos = urlAfterDDP.indexOf('/');                                                                           // 30
    var host =                                                                                                         // 31
          slashPos === -1 ? urlAfterDDP : urlAfterDDP.substr(0, slashPos);                                             // 32
    var rest = slashPos === -1 ? '' : urlAfterDDP.substr(slashPos);                                                    // 33
                                                                                                                       // 34
    // In the host (ONLY!), change '*' characters into random digits. This                                             // 35
    // allows different stream connections to connect to different hostnames                                           // 36
    // and avoid browser per-hostname connection limits.                                                               // 37
    host = host.replace(/\*/g, function () {                                                                           // 38
      return Math.floor(Random.fraction()*10);                                                                         // 39
    });                                                                                                                // 40
                                                                                                                       // 41
    return newScheme + '://' + host + rest;                                                                            // 42
  } else if (httpUrlMatch) {                                                                                           // 43
    newScheme = !httpUrlMatch[1] ? newSchemeBase : newSchemeBase + "s";                                                // 44
    var urlAfterHttp = url.substr(httpUrlMatch[0].length);                                                             // 45
    url = newScheme + "://" + urlAfterHttp;                                                                            // 46
  }                                                                                                                    // 47
                                                                                                                       // 48
  // Prefix FQDNs but not relative URLs                                                                                // 49
  if (url.indexOf("://") === -1 && !startsWith(url, "/")) {                                                            // 50
    url = newSchemeBase + "://" + url;                                                                                 // 51
  }                                                                                                                    // 52
                                                                                                                       // 53
  url = Meteor._relativeToSiteRootUrl(url);                                                                            // 54
                                                                                                                       // 55
  if (endsWith(url, "/"))                                                                                              // 56
    return url + subPath;                                                                                              // 57
  else                                                                                                                 // 58
    return url + "/" + subPath;                                                                                        // 59
};                                                                                                                     // 60
                                                                                                                       // 61
toSockjsUrl = function (url) {                                                                                         // 62
  return translateUrl(url, "http", "sockjs");                                                                          // 63
};                                                                                                                     // 64
                                                                                                                       // 65
toWebsocketUrl = function (url) {                                                                                      // 66
  var ret = translateUrl(url, "ws", "websocket");                                                                      // 67
  return ret;                                                                                                          // 68
};                                                                                                                     // 69
                                                                                                                       // 70
LivedataTest.toSockjsUrl = toSockjsUrl;                                                                                // 71
                                                                                                                       // 72
                                                                                                                       // 73
_.extend(LivedataTest.ClientStream.prototype, {                                                                        // 74
                                                                                                                       // 75
  // Register for callbacks.                                                                                           // 76
  on: function (name, callback) {                                                                                      // 77
    var self = this;                                                                                                   // 78
                                                                                                                       // 79
    if (name !== 'message' && name !== 'reset')                                                                        // 80
      throw new Error("unknown event type: " + name);                                                                  // 81
                                                                                                                       // 82
    if (!self.eventCallbacks[name])                                                                                    // 83
      self.eventCallbacks[name] = [];                                                                                  // 84
    self.eventCallbacks[name].push(callback);                                                                          // 85
  },                                                                                                                   // 86
                                                                                                                       // 87
                                                                                                                       // 88
  _initCommon: function () {                                                                                           // 89
    var self = this;                                                                                                   // 90
    //// Constants                                                                                                     // 91
                                                                                                                       // 92
    // how long to wait until we declare the connection attempt                                                        // 93
    // failed.                                                                                                         // 94
    self.CONNECT_TIMEOUT = 10000;                                                                                      // 95
                                                                                                                       // 96
    self.eventCallbacks = {}; // name -> [callback]                                                                    // 97
                                                                                                                       // 98
    self._forcedToDisconnect = false;                                                                                  // 99
                                                                                                                       // 100
    //// Reactive status                                                                                               // 101
    self.currentStatus = {                                                                                             // 102
      status: "connecting",                                                                                            // 103
      connected: false,                                                                                                // 104
      retryCount: 0                                                                                                    // 105
    };                                                                                                                 // 106
                                                                                                                       // 107
                                                                                                                       // 108
    self.statusListeners = typeof Deps !== 'undefined' && new Deps.Dependency;                                         // 109
    self.statusChanged = function () {                                                                                 // 110
      if (self.statusListeners)                                                                                        // 111
        self.statusListeners.changed();                                                                                // 112
    };                                                                                                                 // 113
                                                                                                                       // 114
    //// Retry logic                                                                                                   // 115
    self._retry = new Retry;                                                                                           // 116
    self.connectionTimer = null;                                                                                       // 117
                                                                                                                       // 118
  },                                                                                                                   // 119
                                                                                                                       // 120
  // Trigger a reconnect.                                                                                              // 121
  reconnect: function (options) {                                                                                      // 122
    var self = this;                                                                                                   // 123
    options = options || {};                                                                                           // 124
                                                                                                                       // 125
    if (options.url) {                                                                                                 // 126
      self._changeUrl(options.url);                                                                                    // 127
    }                                                                                                                  // 128
                                                                                                                       // 129
    if (self.currentStatus.connected) {                                                                                // 130
      if (options._force || options.url) {                                                                             // 131
        // force reconnect.                                                                                            // 132
        self._lostConnection();                                                                                        // 133
      } // else, noop.                                                                                                 // 134
      return;                                                                                                          // 135
    }                                                                                                                  // 136
                                                                                                                       // 137
    // if we're mid-connection, stop it.                                                                               // 138
    if (self.currentStatus.status === "connecting") {                                                                  // 139
      self._lostConnection();                                                                                          // 140
    }                                                                                                                  // 141
                                                                                                                       // 142
    self._retry.clear();                                                                                               // 143
    self.currentStatus.retryCount -= 1; // don't count manual retries                                                  // 144
    self._retryNow();                                                                                                  // 145
  },                                                                                                                   // 146
                                                                                                                       // 147
  disconnect: function (options) {                                                                                     // 148
    var self = this;                                                                                                   // 149
    options = options || {};                                                                                           // 150
                                                                                                                       // 151
    // Failed is permanent. If we're failed, don't let people go back                                                  // 152
    // online by calling 'disconnect' then 'reconnect'.                                                                // 153
    if (self._forcedToDisconnect)                                                                                      // 154
      return;                                                                                                          // 155
                                                                                                                       // 156
    // If _permanent is set, permanently disconnect a stream. Once a stream                                            // 157
    // is forced to disconnect, it can never reconnect. This is for                                                    // 158
    // error cases such as ddp version mismatch, where trying again                                                    // 159
    // won't fix the problem.                                                                                          // 160
    if (options._permanent) {                                                                                          // 161
      self._forcedToDisconnect = true;                                                                                 // 162
    }                                                                                                                  // 163
                                                                                                                       // 164
    self._cleanup();                                                                                                   // 165
    self._retry.clear();                                                                                               // 166
                                                                                                                       // 167
    self.currentStatus = {                                                                                             // 168
      status: (options._permanent ? "failed" : "offline"),                                                             // 169
      connected: false,                                                                                                // 170
      retryCount: 0                                                                                                    // 171
    };                                                                                                                 // 172
                                                                                                                       // 173
    if (options._permanent && options._error)                                                                          // 174
      self.currentStatus.reason = options._error;                                                                      // 175
                                                                                                                       // 176
    self.statusChanged();                                                                                              // 177
  },                                                                                                                   // 178
                                                                                                                       // 179
  _lostConnection: function () {                                                                                       // 180
    var self = this;                                                                                                   // 181
                                                                                                                       // 182
    self._cleanup();                                                                                                   // 183
    self._retryLater(); // sets status. no need to do it here.                                                         // 184
  },                                                                                                                   // 185
                                                                                                                       // 186
  // fired when we detect that we've gone online. try to reconnect                                                     // 187
  // immediately.                                                                                                      // 188
  _online: function () {                                                                                               // 189
    // if we've requested to be offline by disconnecting, don't reconnect.                                             // 190
    if (this.currentStatus.status != "offline")                                                                        // 191
      this.reconnect();                                                                                                // 192
  },                                                                                                                   // 193
                                                                                                                       // 194
  _retryLater: function () {                                                                                           // 195
    var self = this;                                                                                                   // 196
                                                                                                                       // 197
    var timeout = 0;                                                                                                   // 198
    if (self.options.retry) {                                                                                          // 199
      timeout = self._retry.retryLater(                                                                                // 200
        self.currentStatus.retryCount,                                                                                 // 201
        _.bind(self._retryNow, self)                                                                                   // 202
      );                                                                                                               // 203
    }                                                                                                                  // 204
                                                                                                                       // 205
    self.currentStatus.status = "waiting";                                                                             // 206
    self.currentStatus.connected = false;                                                                              // 207
    self.currentStatus.retryTime = (new Date()).getTime() + timeout;                                                   // 208
    self.statusChanged();                                                                                              // 209
  },                                                                                                                   // 210
                                                                                                                       // 211
  _retryNow: function () {                                                                                             // 212
    var self = this;                                                                                                   // 213
                                                                                                                       // 214
    if (self._forcedToDisconnect)                                                                                      // 215
      return;                                                                                                          // 216
                                                                                                                       // 217
    self.currentStatus.retryCount += 1;                                                                                // 218
    self.currentStatus.status = "connecting";                                                                          // 219
    self.currentStatus.connected = false;                                                                              // 220
    delete self.currentStatus.retryTime;                                                                               // 221
    self.statusChanged();                                                                                              // 222
                                                                                                                       // 223
    self._launchConnection();                                                                                          // 224
  },                                                                                                                   // 225
                                                                                                                       // 226
                                                                                                                       // 227
  // Get current status. Reactive.                                                                                     // 228
  status: function () {                                                                                                // 229
    var self = this;                                                                                                   // 230
    if (self.statusListeners)                                                                                          // 231
      self.statusListeners.depend();                                                                                   // 232
    return self.currentStatus;                                                                                         // 233
  }                                                                                                                    // 234
});                                                                                                                    // 235
                                                                                                                       // 236
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/livedata/stream_server.js                                                                                  //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
var pathPrefix = __meteor_runtime_config__.ROOT_URL_PATH_PREFIX ||  "";                                                // 1
                                                                                                                       // 2
StreamServer = function () {                                                                                           // 3
  var self = this;                                                                                                     // 4
  self.registration_callbacks = [];                                                                                    // 5
  self.open_sockets = [];                                                                                              // 6
                                                                                                                       // 7
  // Because we are installing directly onto WebApp.httpServer instead of using                                        // 8
  // WebApp.app, we have to process the path prefix ourselves.                                                         // 9
  self.prefix = pathPrefix + '/sockjs';                                                                                // 10
  // routepolicy is only a weak dependency, because we don't need it if we're                                          // 11
  // just doing server-to-server DDP as a client.                                                                      // 12
  if (Package.routepolicy) {                                                                                           // 13
    Package.routepolicy.RoutePolicy.declare(self.prefix + '/', 'network');                                             // 14
  }                                                                                                                    // 15
                                                                                                                       // 16
  // set up sockjs                                                                                                     // 17
  var sockjs = Npm.require('sockjs');                                                                                  // 18
  var serverOptions = {                                                                                                // 19
    prefix: self.prefix,                                                                                               // 20
    log: function() {},                                                                                                // 21
    // this is the default, but we code it explicitly because we depend                                                // 22
    // on it in stream_client:HEARTBEAT_TIMEOUT                                                                        // 23
    heartbeat_delay: 25000,                                                                                            // 24
    // The default disconnect_delay is 5 seconds, but if the server ends up CPU                                        // 25
    // bound for that much time, SockJS might not notice that the user has                                             // 26
    // reconnected because the timer (of disconnect_delay ms) can fire before                                          // 27
    // SockJS processes the new connection. Eventually we'll fix this by not                                           // 28
    // combining CPU-heavy processing with SockJS termination (eg a proxy which                                        // 29
    // converts to Unix sockets) but for now, raise the delay.                                                         // 30
    disconnect_delay: 60 * 1000,                                                                                       // 31
    // Set the USE_JSESSIONID environment variable to enable setting the                                               // 32
    // JSESSIONID cookie. This is useful for setting up proxies with                                                   // 33
    // session affinity.                                                                                               // 34
    jsessionid: !!process.env.USE_JSESSIONID                                                                           // 35
  };                                                                                                                   // 36
                                                                                                                       // 37
  // If you know your server environment (eg, proxies) will prevent websockets                                         // 38
  // from ever working, set $DISABLE_WEBSOCKETS and SockJS clients (ie,                                                // 39
  // browsers) will not waste time attempting to use them.                                                             // 40
  // (Your server will still have a /websocket endpoint.)                                                              // 41
  if (process.env.DISABLE_WEBSOCKETS)                                                                                  // 42
    serverOptions.websocket = false;                                                                                   // 43
                                                                                                                       // 44
  self.server = sockjs.createServer(serverOptions);                                                                    // 45
  if (!Package.webapp) {                                                                                               // 46
    throw new Error("Cannot create a DDP server without the webapp package");                                          // 47
  }                                                                                                                    // 48
  // Install the sockjs handlers, but we want to keep around our own particular                                        // 49
  // request handler that adjusts idle timeouts while we have an outstanding                                           // 50
  // request.  This compensates for the fact that sockjs removes all listeners                                         // 51
  // for "request" to add its own.                                                                                     // 52
  Package.webapp.WebApp.httpServer.removeListener('request', Package.webapp.WebApp._timeoutAdjustmentRequestCallback); // 53
  self.server.installHandlers(Package.webapp.WebApp.httpServer);                                                       // 54
  Package.webapp.WebApp.httpServer.addListener('request', Package.webapp.WebApp._timeoutAdjustmentRequestCallback);    // 55
                                                                                                                       // 56
  Package.webapp.WebApp.httpServer.on('meteor-closing', function () {                                                  // 57
    _.each(self.open_sockets, function (socket) {                                                                      // 58
      socket.end();                                                                                                    // 59
    });                                                                                                                // 60
  });                                                                                                                  // 61
                                                                                                                       // 62
  // Support the /websocket endpoint                                                                                   // 63
  self._redirectWebsocketEndpoint();                                                                                   // 64
                                                                                                                       // 65
  self.server.on('connection', function (socket) {                                                                     // 66
    socket.send = function (data) {                                                                                    // 67
      socket.write(data);                                                                                              // 68
    };                                                                                                                 // 69
    socket.on('close', function () {                                                                                   // 70
      self.open_sockets = _.without(self.open_sockets, socket);                                                        // 71
    });                                                                                                                // 72
    self.open_sockets.push(socket);                                                                                    // 73
                                                                                                                       // 74
    // XXX COMPAT WITH 0.6.6. Send the old style welcome message, which                                                // 75
    // will force old clients to reload. Remove this once we're not                                                    // 76
    // concerned about people upgrading from a pre-0.7.0 release. Also,                                                // 77
    // remove the clause in the client that ignores the welcome message                                                // 78
    // (livedata_connection.js)                                                                                        // 79
    socket.send(JSON.stringify({server_id: "0"}));                                                                     // 80
                                                                                                                       // 81
    // call all our callbacks when we get a new socket. they will do the                                               // 82
    // work of setting up handlers and such for specific messages.                                                     // 83
    _.each(self.registration_callbacks, function (callback) {                                                          // 84
      callback(socket);                                                                                                // 85
    });                                                                                                                // 86
  });                                                                                                                  // 87
                                                                                                                       // 88
};                                                                                                                     // 89
                                                                                                                       // 90
_.extend(StreamServer.prototype, {                                                                                     // 91
  // call my callback when a new socket connects.                                                                      // 92
  // also call it for all current connections.                                                                         // 93
  register: function (callback) {                                                                                      // 94
    var self = this;                                                                                                   // 95
    self.registration_callbacks.push(callback);                                                                        // 96
    _.each(self.all_sockets(), function (socket) {                                                                     // 97
      callback(socket);                                                                                                // 98
    });                                                                                                                // 99
  },                                                                                                                   // 100
                                                                                                                       // 101
  // get a list of all sockets                                                                                         // 102
  all_sockets: function () {                                                                                           // 103
    var self = this;                                                                                                   // 104
    return _.values(self.open_sockets);                                                                                // 105
  },                                                                                                                   // 106
                                                                                                                       // 107
  // Redirect /websocket to /sockjs/websocket in order to not expose                                                   // 108
  // sockjs to clients that want to use raw websockets                                                                 // 109
  _redirectWebsocketEndpoint: function() {                                                                             // 110
    var self = this;                                                                                                   // 111
    // Unfortunately we can't use a connect middleware here since                                                      // 112
    // sockjs installs itself prior to all existing listeners                                                          // 113
    // (meaning prior to any connect middlewares) so we need to take                                                   // 114
    // an approach similar to overshadowListeners in                                                                   // 115
    // https://github.com/sockjs/sockjs-node/blob/cf820c55af6a9953e16558555a31decea554f70e/src/utils.coffee            // 116
    _.each(['request', 'upgrade'], function(event) {                                                                   // 117
      var httpServer = Package.webapp.WebApp.httpServer;                                                               // 118
      var oldHttpServerListeners = httpServer.listeners(event).slice(0);                                               // 119
      httpServer.removeAllListeners(event);                                                                            // 120
                                                                                                                       // 121
      // request and upgrade have different arguments passed but                                                       // 122
      // we only care about the first one which is always request                                                      // 123
      var newListener = function(request /*, moreArguments */) {                                                       // 124
        // Store arguments for use within the closure below                                                            // 125
        var args = arguments;                                                                                          // 126
                                                                                                                       // 127
        if (request.url === pathPrefix + '/websocket' ||                                                               // 128
            request.url === pathPrefix + '/websocket/') {                                                              // 129
          request.url = self.prefix + '/websocket';                                                                    // 130
        }                                                                                                              // 131
        _.each(oldHttpServerListeners, function(oldListener) {                                                         // 132
          oldListener.apply(httpServer, args);                                                                         // 133
        });                                                                                                            // 134
      };                                                                                                               // 135
      httpServer.addListener(event, newListener);                                                                      // 136
    });                                                                                                                // 137
  }                                                                                                                    // 138
});                                                                                                                    // 139
                                                                                                                       // 140
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/livedata/livedata_server.js                                                                                //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
DDPServer = {};                                                                                                        // 1
                                                                                                                       // 2
var Fiber = Npm.require('fibers');                                                                                     // 3
                                                                                                                       // 4
// This file contains classes:                                                                                         // 5
// * Session - The server's connection to a single DDP client                                                          // 6
// * Subscription - A single subscription for a single client                                                          // 7
// * Server - An entire server that may talk to > 1 client. A DDP endpoint.                                            // 8
//                                                                                                                     // 9
// Session and Subscription are file scope. For now, until we freeze                                                   // 10
// the interface, Server is package scope (in the future it should be                                                  // 11
// exported.)                                                                                                          // 12
                                                                                                                       // 13
// Represents a single document in a SessionCollectionView                                                             // 14
var SessionDocumentView = function () {                                                                                // 15
  var self = this;                                                                                                     // 16
  self.existsIn = {}; // set of subscriptionHandle                                                                     // 17
  self.dataByKey = {}; // key-> [ {subscriptionHandle, value} by precedence]                                           // 18
};                                                                                                                     // 19
                                                                                                                       // 20
_.extend(SessionDocumentView.prototype, {                                                                              // 21
                                                                                                                       // 22
  getFields: function () {                                                                                             // 23
    var self = this;                                                                                                   // 24
    var ret = {};                                                                                                      // 25
    _.each(self.dataByKey, function (precedenceList, key) {                                                            // 26
      ret[key] = precedenceList[0].value;                                                                              // 27
    });                                                                                                                // 28
    return ret;                                                                                                        // 29
  },                                                                                                                   // 30
                                                                                                                       // 31
  clearField: function (subscriptionHandle, key, changeCollector) {                                                    // 32
    var self = this;                                                                                                   // 33
    // Publish API ignores _id if present in fields                                                                    // 34
    if (key === "_id")                                                                                                 // 35
      return;                                                                                                          // 36
    var precedenceList = self.dataByKey[key];                                                                          // 37
                                                                                                                       // 38
    // It's okay to clear fields that didn't exist. No need to throw                                                   // 39
    // an error.                                                                                                       // 40
    if (!precedenceList)                                                                                               // 41
      return;                                                                                                          // 42
                                                                                                                       // 43
    var removedValue = undefined;                                                                                      // 44
    for (var i = 0; i < precedenceList.length; i++) {                                                                  // 45
      var precedence = precedenceList[i];                                                                              // 46
      if (precedence.subscriptionHandle === subscriptionHandle) {                                                      // 47
        // The view's value can only change if this subscription is the one that                                       // 48
        // used to have precedence.                                                                                    // 49
        if (i === 0)                                                                                                   // 50
          removedValue = precedence.value;                                                                             // 51
        precedenceList.splice(i, 1);                                                                                   // 52
        break;                                                                                                         // 53
      }                                                                                                                // 54
    }                                                                                                                  // 55
    if (_.isEmpty(precedenceList)) {                                                                                   // 56
      delete self.dataByKey[key];                                                                                      // 57
      changeCollector[key] = undefined;                                                                                // 58
    } else if (removedValue !== undefined &&                                                                           // 59
               !EJSON.equals(removedValue, precedenceList[0].value)) {                                                 // 60
      changeCollector[key] = precedenceList[0].value;                                                                  // 61
    }                                                                                                                  // 62
  },                                                                                                                   // 63
                                                                                                                       // 64
  changeField: function (subscriptionHandle, key, value,                                                               // 65
                         changeCollector, isAdd) {                                                                     // 66
    var self = this;                                                                                                   // 67
    // Publish API ignores _id if present in fields                                                                    // 68
    if (key === "_id")                                                                                                 // 69
      return;                                                                                                          // 70
    if (!_.has(self.dataByKey, key)) {                                                                                 // 71
      self.dataByKey[key] = [{subscriptionHandle: subscriptionHandle,                                                  // 72
                              value: value}];                                                                          // 73
      changeCollector[key] = value;                                                                                    // 74
      return;                                                                                                          // 75
    }                                                                                                                  // 76
    var precedenceList = self.dataByKey[key];                                                                          // 77
    var elt;                                                                                                           // 78
    if (!isAdd) {                                                                                                      // 79
      elt = _.find(precedenceList, function (precedence) {                                                             // 80
        return precedence.subscriptionHandle === subscriptionHandle;                                                   // 81
      });                                                                                                              // 82
    }                                                                                                                  // 83
                                                                                                                       // 84
    if (elt) {                                                                                                         // 85
      if (elt === precedenceList[0] && !EJSON.equals(value, elt.value)) {                                              // 86
        // this subscription is changing the value of this field.                                                      // 87
        changeCollector[key] = value;                                                                                  // 88
      }                                                                                                                // 89
      elt.value = value;                                                                                               // 90
    } else {                                                                                                           // 91
      // this subscription is newly caring about this field                                                            // 92
      precedenceList.push({subscriptionHandle: subscriptionHandle, value: value});                                     // 93
    }                                                                                                                  // 94
                                                                                                                       // 95
  }                                                                                                                    // 96
});                                                                                                                    // 97
                                                                                                                       // 98
// Represents a client's view of a single collection                                                                   // 99
var SessionCollectionView = function (collectionName, sessionCallbacks) {                                              // 100
  var self = this;                                                                                                     // 101
  self.collectionName = collectionName;                                                                                // 102
  self.documents = {};                                                                                                 // 103
  self.callbacks = sessionCallbacks;                                                                                   // 104
};                                                                                                                     // 105
                                                                                                                       // 106
LivedataTest.SessionCollectionView = SessionCollectionView;                                                            // 107
                                                                                                                       // 108
                                                                                                                       // 109
_.extend(SessionCollectionView.prototype, {                                                                            // 110
                                                                                                                       // 111
  isEmpty: function () {                                                                                               // 112
    var self = this;                                                                                                   // 113
    return _.isEmpty(self.documents);                                                                                  // 114
  },                                                                                                                   // 115
                                                                                                                       // 116
  diff: function (previous) {                                                                                          // 117
    var self = this;                                                                                                   // 118
    LocalCollection._diffObjects(previous.documents, self.documents, {                                                 // 119
      both: _.bind(self.diffDocument, self),                                                                           // 120
                                                                                                                       // 121
      rightOnly: function (id, nowDV) {                                                                                // 122
        self.callbacks.added(self.collectionName, id, nowDV.getFields());                                              // 123
      },                                                                                                               // 124
                                                                                                                       // 125
      leftOnly: function (id, prevDV) {                                                                                // 126
        self.callbacks.removed(self.collectionName, id);                                                               // 127
      }                                                                                                                // 128
    });                                                                                                                // 129
  },                                                                                                                   // 130
                                                                                                                       // 131
  diffDocument: function (id, prevDV, nowDV) {                                                                         // 132
    var self = this;                                                                                                   // 133
    var fields = {};                                                                                                   // 134
    LocalCollection._diffObjects(prevDV.getFields(), nowDV.getFields(), {                                              // 135
      both: function (key, prev, now) {                                                                                // 136
        if (!EJSON.equals(prev, now))                                                                                  // 137
          fields[key] = now;                                                                                           // 138
      },                                                                                                               // 139
      rightOnly: function (key, now) {                                                                                 // 140
        fields[key] = now;                                                                                             // 141
      },                                                                                                               // 142
      leftOnly: function(key, prev) {                                                                                  // 143
        fields[key] = undefined;                                                                                       // 144
      }                                                                                                                // 145
    });                                                                                                                // 146
    self.callbacks.changed(self.collectionName, id, fields);                                                           // 147
  },                                                                                                                   // 148
                                                                                                                       // 149
  added: function (subscriptionHandle, id, fields) {                                                                   // 150
    var self = this;                                                                                                   // 151
    var docView = self.documents[id];                                                                                  // 152
    var added = false;                                                                                                 // 153
    if (!docView) {                                                                                                    // 154
      added = true;                                                                                                    // 155
      docView = new SessionDocumentView();                                                                             // 156
      self.documents[id] = docView;                                                                                    // 157
    }                                                                                                                  // 158
    docView.existsIn[subscriptionHandle] = true;                                                                       // 159
    var changeCollector = {};                                                                                          // 160
    _.each(fields, function (value, key) {                                                                             // 161
      docView.changeField(                                                                                             // 162
        subscriptionHandle, key, value, changeCollector, true);                                                        // 163
    });                                                                                                                // 164
    if (added)                                                                                                         // 165
      self.callbacks.added(self.collectionName, id, changeCollector);                                                  // 166
    else                                                                                                               // 167
      self.callbacks.changed(self.collectionName, id, changeCollector);                                                // 168
  },                                                                                                                   // 169
                                                                                                                       // 170
  changed: function (subscriptionHandle, id, changed) {                                                                // 171
    var self = this;                                                                                                   // 172
    var changedResult = {};                                                                                            // 173
    var docView = self.documents[id];                                                                                  // 174
    if (!docView)                                                                                                      // 175
      throw new Error("Could not find element with id " + id + " to change");                                          // 176
    _.each(changed, function (value, key) {                                                                            // 177
      if (value === undefined)                                                                                         // 178
        docView.clearField(subscriptionHandle, key, changedResult);                                                    // 179
      else                                                                                                             // 180
        docView.changeField(subscriptionHandle, key, value, changedResult);                                            // 181
    });                                                                                                                // 182
    self.callbacks.changed(self.collectionName, id, changedResult);                                                    // 183
  },                                                                                                                   // 184
                                                                                                                       // 185
  removed: function (subscriptionHandle, id) {                                                                         // 186
    var self = this;                                                                                                   // 187
    var docView = self.documents[id];                                                                                  // 188
    if (!docView) {                                                                                                    // 189
      var err = new Error("Removed nonexistent document " + id);                                                       // 190
      throw err;                                                                                                       // 191
    }                                                                                                                  // 192
    delete docView.existsIn[subscriptionHandle];                                                                       // 193
    if (_.isEmpty(docView.existsIn)) {                                                                                 // 194
      // it is gone from everyone                                                                                      // 195
      self.callbacks.removed(self.collectionName, id);                                                                 // 196
      delete self.documents[id];                                                                                       // 197
    } else {                                                                                                           // 198
      var changed = {};                                                                                                // 199
      // remove this subscription from every precedence list                                                           // 200
      // and record the changes                                                                                        // 201
      _.each(docView.dataByKey, function (precedenceList, key) {                                                       // 202
        docView.clearField(subscriptionHandle, key, changed);                                                          // 203
      });                                                                                                              // 204
                                                                                                                       // 205
      self.callbacks.changed(self.collectionName, id, changed);                                                        // 206
    }                                                                                                                  // 207
  }                                                                                                                    // 208
});                                                                                                                    // 209
                                                                                                                       // 210
/******************************************************************************/                                       // 211
/* Session                                                                    */                                       // 212
/******************************************************************************/                                       // 213
                                                                                                                       // 214
var Session = function (server, version, socket) {                                                                     // 215
  var self = this;                                                                                                     // 216
  self.id = Random.id();                                                                                               // 217
                                                                                                                       // 218
  self.server = server;                                                                                                // 219
  self.version = version;                                                                                              // 220
                                                                                                                       // 221
  self.initialized = false;                                                                                            // 222
  self.socket = socket;                                                                                                // 223
                                                                                                                       // 224
  // set to null when the session is destroyed. multiple places below                                                  // 225
  // use this to determine if the session is alive or not.                                                             // 226
  self.inQueue = [];                                                                                                   // 227
                                                                                                                       // 228
  self.blocked = false;                                                                                                // 229
  self.workerRunning = false;                                                                                          // 230
                                                                                                                       // 231
  // Sub objects for active subscriptions                                                                              // 232
  self._namedSubs = {};                                                                                                // 233
  self._universalSubs = [];                                                                                            // 234
                                                                                                                       // 235
  self.userId = null;                                                                                                  // 236
                                                                                                                       // 237
  self.collectionViews = {};                                                                                           // 238
                                                                                                                       // 239
  // Set this to false to not send messages when collectionViews are                                                   // 240
  // modified. This is done when rerunning subs in _setUserId and those messages                                       // 241
  // are calculated via a diff instead.                                                                                // 242
  self._isSending = true;                                                                                              // 243
                                                                                                                       // 244
  // If this is true, don't start a newly-created universal publisher on this                                          // 245
  // session. The session will take care of starting it when appropriate.                                              // 246
  self._dontStartNewUniversalSubs = false;                                                                             // 247
                                                                                                                       // 248
  // when we are rerunning subscriptions, any ready messages                                                           // 249
  // we want to buffer up for when we are done rerunning subscriptions                                                 // 250
  self._pendingReady = [];                                                                                             // 251
                                                                                                                       // 252
  // List of callbacks to call when this connection is closed.                                                         // 253
  self._closeCallbacks = [];                                                                                           // 254
                                                                                                                       // 255
  // The `ConnectionHandle` for this session, passed to                                                                // 256
  // `Meteor.server.onConnection` callbacks.                                                                           // 257
  self.connectionHandle = {                                                                                            // 258
    id: self.id,                                                                                                       // 259
    close: function () {                                                                                               // 260
      self.server._closeSession(self);                                                                                 // 261
    },                                                                                                                 // 262
    onClose: function (fn) {                                                                                           // 263
      var cb = Meteor.bindEnvironment(fn, "connection onClose callback");                                              // 264
      if (self.inQueue) {                                                                                              // 265
        self._closeCallbacks.push(cb);                                                                                 // 266
      } else {                                                                                                         // 267
        // if we're already closed, call the callback.                                                                 // 268
        Meteor.defer(cb);                                                                                              // 269
      }                                                                                                                // 270
    }                                                                                                                  // 271
  };                                                                                                                   // 272
                                                                                                                       // 273
  socket.send(stringifyDDP({msg: 'connected',                                                                          // 274
                            session: self.id}));                                                                       // 275
  // On initial connect, spin up all the universal publishers.                                                         // 276
  Fiber(function () {                                                                                                  // 277
    self.startUniversalSubs();                                                                                         // 278
  }).run();                                                                                                            // 279
                                                                                                                       // 280
  Package.facts && Package.facts.Facts.incrementServerFact(                                                            // 281
    "livedata", "sessions", 1);                                                                                        // 282
};                                                                                                                     // 283
                                                                                                                       // 284
_.extend(Session.prototype, {                                                                                          // 285
                                                                                                                       // 286
                                                                                                                       // 287
  sendReady: function (subscriptionIds) {                                                                              // 288
    var self = this;                                                                                                   // 289
    if (self._isSending)                                                                                               // 290
      self.send({msg: "ready", subs: subscriptionIds});                                                                // 291
    else {                                                                                                             // 292
      _.each(subscriptionIds, function (subscriptionId) {                                                              // 293
        self._pendingReady.push(subscriptionId);                                                                       // 294
      });                                                                                                              // 295
    }                                                                                                                  // 296
  },                                                                                                                   // 297
                                                                                                                       // 298
  sendAdded: function (collectionName, id, fields) {                                                                   // 299
    var self = this;                                                                                                   // 300
    if (self._isSending)                                                                                               // 301
      self.send({msg: "added", collection: collectionName, id: id, fields: fields});                                   // 302
  },                                                                                                                   // 303
                                                                                                                       // 304
  sendChanged: function (collectionName, id, fields) {                                                                 // 305
    var self = this;                                                                                                   // 306
    if (_.isEmpty(fields))                                                                                             // 307
      return;                                                                                                          // 308
                                                                                                                       // 309
    if (self._isSending) {                                                                                             // 310
      self.send({                                                                                                      // 311
        msg: "changed",                                                                                                // 312
        collection: collectionName,                                                                                    // 313
        id: id,                                                                                                        // 314
        fields: fields                                                                                                 // 315
      });                                                                                                              // 316
    }                                                                                                                  // 317
  },                                                                                                                   // 318
                                                                                                                       // 319
  sendRemoved: function (collectionName, id) {                                                                         // 320
    var self = this;                                                                                                   // 321
    if (self._isSending)                                                                                               // 322
      self.send({msg: "removed", collection: collectionName, id: id});                                                 // 323
  },                                                                                                                   // 324
                                                                                                                       // 325
  getSendCallbacks: function () {                                                                                      // 326
    var self = this;                                                                                                   // 327
    return {                                                                                                           // 328
      added: _.bind(self.sendAdded, self),                                                                             // 329
      changed: _.bind(self.sendChanged, self),                                                                         // 330
      removed: _.bind(self.sendRemoved, self)                                                                          // 331
    };                                                                                                                 // 332
  },                                                                                                                   // 333
                                                                                                                       // 334
  getCollectionView: function (collectionName) {                                                                       // 335
    var self = this;                                                                                                   // 336
    if (_.has(self.collectionViews, collectionName)) {                                                                 // 337
      return self.collectionViews[collectionName];                                                                     // 338
    }                                                                                                                  // 339
    var ret = new SessionCollectionView(collectionName,                                                                // 340
                                        self.getSendCallbacks());                                                      // 341
    self.collectionViews[collectionName] = ret;                                                                        // 342
    return ret;                                                                                                        // 343
  },                                                                                                                   // 344
                                                                                                                       // 345
  added: function (subscriptionHandle, collectionName, id, fields) {                                                   // 346
    var self = this;                                                                                                   // 347
    var view = self.getCollectionView(collectionName);                                                                 // 348
    view.added(subscriptionHandle, id, fields);                                                                        // 349
  },                                                                                                                   // 350
                                                                                                                       // 351
  removed: function (subscriptionHandle, collectionName, id) {                                                         // 352
    var self = this;                                                                                                   // 353
    var view = self.getCollectionView(collectionName);                                                                 // 354
    view.removed(subscriptionHandle, id);                                                                              // 355
    if (view.isEmpty()) {                                                                                              // 356
      delete self.collectionViews[collectionName];                                                                     // 357
    }                                                                                                                  // 358
  },                                                                                                                   // 359
                                                                                                                       // 360
  changed: function (subscriptionHandle, collectionName, id, fields) {                                                 // 361
    var self = this;                                                                                                   // 362
    var view = self.getCollectionView(collectionName);                                                                 // 363
    view.changed(subscriptionHandle, id, fields);                                                                      // 364
  },                                                                                                                   // 365
                                                                                                                       // 366
  startUniversalSubs: function () {                                                                                    // 367
    var self = this;                                                                                                   // 368
    // Make a shallow copy of the set of universal handlers and start them. If                                         // 369
    // additional universal publishers start while we're running them (due to                                          // 370
    // yielding), they will run separately as part of Server.publish.                                                  // 371
    var handlers = _.clone(self.server.universal_publish_handlers);                                                    // 372
    _.each(handlers, function (handler) {                                                                              // 373
      self._startSubscription(handler);                                                                                // 374
    });                                                                                                                // 375
  },                                                                                                                   // 376
                                                                                                                       // 377
  // Destroy this session. Stop all processing and tear everything                                                     // 378
  // down. If a socket was attached, close it.                                                                         // 379
  destroy: function () {                                                                                               // 380
    var self = this;                                                                                                   // 381
                                                                                                                       // 382
    if (self.socket) {                                                                                                 // 383
      self.socket.close();                                                                                             // 384
      self.socket._meteorSession = null;                                                                               // 385
    }                                                                                                                  // 386
                                                                                                                       // 387
    // Drop the merge box data immediately.                                                                            // 388
    self.collectionViews = {};                                                                                         // 389
    self.inQueue = null;                                                                                               // 390
                                                                                                                       // 391
    Package.facts && Package.facts.Facts.incrementServerFact(                                                          // 392
      "livedata", "sessions", -1);                                                                                     // 393
                                                                                                                       // 394
    Meteor.defer(function () {                                                                                         // 395
      // stop callbacks can yield, so we defer this on destroy.                                                        // 396
      // sub._isDeactivated() detects that we set inQueue to null and                                                  // 397
      // treats it as semi-deactivated (it will ignore incoming callbacks, etc).                                       // 398
      self._deactivateAllSubscriptions();                                                                              // 399
                                                                                                                       // 400
      // Defer calling the close callbacks, so that the caller closing                                                 // 401
      // the session isn't waiting for all the callbacks to complete.                                                  // 402
      _.each(self._closeCallbacks, function (callback) {                                                               // 403
        callback();                                                                                                    // 404
      });                                                                                                              // 405
    });                                                                                                                // 406
  },                                                                                                                   // 407
                                                                                                                       // 408
  // Send a message (doing nothing if no socket is connected right now.)                                               // 409
  // It should be a JSON object (it will be stringified.)                                                              // 410
  send: function (msg) {                                                                                               // 411
    var self = this;                                                                                                   // 412
    if (self.socket) {                                                                                                 // 413
      if (Meteor._printSentDDP)                                                                                        // 414
        Meteor._debug("Sent DDP", stringifyDDP(msg));                                                                  // 415
      self.socket.send(stringifyDDP(msg));                                                                             // 416
    }                                                                                                                  // 417
  },                                                                                                                   // 418
                                                                                                                       // 419
  // Send a connection error.                                                                                          // 420
  sendError: function (reason, offendingMessage) {                                                                     // 421
    var self = this;                                                                                                   // 422
    var msg = {msg: 'error', reason: reason};                                                                          // 423
    if (offendingMessage)                                                                                              // 424
      msg.offendingMessage = offendingMessage;                                                                         // 425
    self.send(msg);                                                                                                    // 426
  },                                                                                                                   // 427
                                                                                                                       // 428
  // Process 'msg' as an incoming message. (But as a guard against                                                     // 429
  // race conditions during reconnection, ignore the message if                                                        // 430
  // 'socket' is not the currently connected socket.)                                                                  // 431
  //                                                                                                                   // 432
  // We run the messages from the client one at a time, in the order                                                   // 433
  // given by the client. The message handler is passed an idempotent                                                  // 434
  // function 'unblock' which it may call to allow other messages to                                                   // 435
  // begin running in parallel in another fiber (for example, a method                                                 // 436
  // that wants to yield.) Otherwise, it is automatically unblocked                                                    // 437
  // when it returns.                                                                                                  // 438
  //                                                                                                                   // 439
  // Actually, we don't have to 'totally order' the messages in this                                                   // 440
  // way, but it's the easiest thing that's correct. (unsub needs to                                                   // 441
  // be ordered against sub, methods need to be ordered against each                                                   // 442
  // other.)                                                                                                           // 443
  processMessage: function (msg_in) {                                                                                  // 444
    var self = this;                                                                                                   // 445
    if (!self.inQueue) // we have been destroyed.                                                                      // 446
      return;                                                                                                          // 447
                                                                                                                       // 448
    self.inQueue.push(msg_in);                                                                                         // 449
    if (self.workerRunning)                                                                                            // 450
      return;                                                                                                          // 451
    self.workerRunning = true;                                                                                         // 452
                                                                                                                       // 453
    var processNext = function () {                                                                                    // 454
      var msg = self.inQueue && self.inQueue.shift();                                                                  // 455
      if (!msg) {                                                                                                      // 456
        self.workerRunning = false;                                                                                    // 457
        return;                                                                                                        // 458
      }                                                                                                                // 459
                                                                                                                       // 460
      Fiber(function () {                                                                                              // 461
        var blocked = true;                                                                                            // 462
                                                                                                                       // 463
        var unblock = function () {                                                                                    // 464
          if (!blocked)                                                                                                // 465
            return; // idempotent                                                                                      // 466
          blocked = false;                                                                                             // 467
          processNext();                                                                                               // 468
        };                                                                                                             // 469
                                                                                                                       // 470
        if (_.has(self.protocol_handlers, msg.msg))                                                                    // 471
          self.protocol_handlers[msg.msg].call(self, msg, unblock);                                                    // 472
        else                                                                                                           // 473
          self.sendError('Bad request', msg);                                                                          // 474
        unblock(); // in case the handler didn't already do it                                                         // 475
      }).run();                                                                                                        // 476
    };                                                                                                                 // 477
                                                                                                                       // 478
    processNext();                                                                                                     // 479
  },                                                                                                                   // 480
                                                                                                                       // 481
  protocol_handlers: {                                                                                                 // 482
    sub: function (msg) {                                                                                              // 483
      var self = this;                                                                                                 // 484
                                                                                                                       // 485
      // reject malformed messages                                                                                     // 486
      if (typeof (msg.id) !== "string" ||                                                                              // 487
          typeof (msg.name) !== "string" ||                                                                            // 488
          (('params' in msg) && !(msg.params instanceof Array))) {                                                     // 489
        self.sendError("Malformed subscription", msg);                                                                 // 490
        return;                                                                                                        // 491
      }                                                                                                                // 492
                                                                                                                       // 493
      if (!self.server.publish_handlers[msg.name]) {                                                                   // 494
        self.send({                                                                                                    // 495
          msg: 'nosub', id: msg.id,                                                                                    // 496
          error: new Meteor.Error(404, "Subscription not found")});                                                    // 497
        return;                                                                                                        // 498
      }                                                                                                                // 499
                                                                                                                       // 500
      if (_.has(self._namedSubs, msg.id))                                                                              // 501
        // subs are idempotent, or rather, they are ignored if a sub                                                   // 502
        // with that id already exists. this is important during                                                       // 503
        // reconnect.                                                                                                  // 504
        return;                                                                                                        // 505
                                                                                                                       // 506
      var handler = self.server.publish_handlers[msg.name];                                                            // 507
      self._startSubscription(handler, msg.id, msg.params, msg.name);                                                  // 508
                                                                                                                       // 509
    },                                                                                                                 // 510
                                                                                                                       // 511
    unsub: function (msg) {                                                                                            // 512
      var self = this;                                                                                                 // 513
                                                                                                                       // 514
      self._stopSubscription(msg.id);                                                                                  // 515
    },                                                                                                                 // 516
                                                                                                                       // 517
    method: function (msg, unblock) {                                                                                  // 518
      var self = this;                                                                                                 // 519
                                                                                                                       // 520
      // reject malformed messages                                                                                     // 521
      // XXX should also reject messages with unknown attributes?                                                      // 522
      if (typeof (msg.id) !== "string" ||                                                                              // 523
          typeof (msg.method) !== "string" ||                                                                          // 524
          (('params' in msg) && !(msg.params instanceof Array))) {                                                     // 525
        self.sendError("Malformed method invocation", msg);                                                            // 526
        return;                                                                                                        // 527
      }                                                                                                                // 528
                                                                                                                       // 529
      // set up to mark the method as satisfied once all observers                                                     // 530
      // (and subscriptions) have reacted to any writes that were                                                      // 531
      // done.                                                                                                         // 532
      var fence = new DDPServer._WriteFence;                                                                           // 533
      fence.onAllCommitted(function () {                                                                               // 534
        // Retire the fence so that future writes are allowed.                                                         // 535
        // This means that callbacks like timers are free to use                                                       // 536
        // the fence, and if they fire before it's armed (for                                                          // 537
        // example, because the method waits for them) their                                                           // 538
        // writes will be included in the fence.                                                                       // 539
        fence.retire();                                                                                                // 540
        self.send({                                                                                                    // 541
          msg: 'updated', methods: [msg.id]});                                                                         // 542
      });                                                                                                              // 543
                                                                                                                       // 544
      // find the handler                                                                                              // 545
      var handler = self.server.method_handlers[msg.method];                                                           // 546
      if (!handler) {                                                                                                  // 547
        self.send({                                                                                                    // 548
          msg: 'result', id: msg.id,                                                                                   // 549
          error: new Meteor.Error(404, "Method not found")});                                                          // 550
        fence.arm();                                                                                                   // 551
        return;                                                                                                        // 552
      }                                                                                                                // 553
                                                                                                                       // 554
      var setUserId = function(userId) {                                                                               // 555
        self._setUserId(userId);                                                                                       // 556
      };                                                                                                               // 557
                                                                                                                       // 558
      var invocation = new MethodInvocation({                                                                          // 559
        isSimulation: false,                                                                                           // 560
        userId: self.userId,                                                                                           // 561
        setUserId: setUserId,                                                                                          // 562
        unblock: unblock,                                                                                              // 563
        connection: self.connectionHandle                                                                              // 564
      });                                                                                                              // 565
      try {                                                                                                            // 566
        var result = DDPServer._CurrentWriteFence.withValue(fence, function () {                                       // 567
          return DDP._CurrentInvocation.withValue(invocation, function () {                                            // 568
            return maybeAuditArgumentChecks(                                                                           // 569
              handler, invocation, msg.params, "call to '" + msg.method + "'");                                        // 570
          });                                                                                                          // 571
        });                                                                                                            // 572
      } catch (e) {                                                                                                    // 573
        var exception = e;                                                                                             // 574
      }                                                                                                                // 575
                                                                                                                       // 576
      fence.arm(); // we're done adding writes to the fence                                                            // 577
      unblock(); // unblock, if the method hasn't done it already                                                      // 578
                                                                                                                       // 579
      exception = wrapInternalException(                                                                               // 580
        exception, "while invoking method '" + msg.method + "'");                                                      // 581
                                                                                                                       // 582
      // send response and add to cache                                                                                // 583
      var payload =                                                                                                    // 584
        exception ? {error: exception} : (result !== undefined ?                                                       // 585
                                          {result: result} : {});                                                      // 586
      self.send(_.extend({msg: 'result', id: msg.id}, payload));                                                       // 587
    }                                                                                                                  // 588
  },                                                                                                                   // 589
                                                                                                                       // 590
  _eachSub: function (f) {                                                                                             // 591
    var self = this;                                                                                                   // 592
    _.each(self._namedSubs, f);                                                                                        // 593
    _.each(self._universalSubs, f);                                                                                    // 594
  },                                                                                                                   // 595
                                                                                                                       // 596
  _diffCollectionViews: function (beforeCVs) {                                                                         // 597
    var self = this;                                                                                                   // 598
    LocalCollection._diffObjects(beforeCVs, self.collectionViews, {                                                    // 599
      both: function (collectionName, leftValue, rightValue) {                                                         // 600
        rightValue.diff(leftValue);                                                                                    // 601
      },                                                                                                               // 602
      rightOnly: function (collectionName, rightValue) {                                                               // 603
        _.each(rightValue.documents, function (docView, id) {                                                          // 604
          self.sendAdded(collectionName, id, docView.getFields());                                                     // 605
        });                                                                                                            // 606
      },                                                                                                               // 607
      leftOnly: function (collectionName, leftValue) {                                                                 // 608
        _.each(leftValue.documents, function (doc, id) {                                                               // 609
          self.sendRemoved(collectionName, id);                                                                        // 610
        });                                                                                                            // 611
      }                                                                                                                // 612
    });                                                                                                                // 613
  },                                                                                                                   // 614
                                                                                                                       // 615
  // Sets the current user id in all appropriate contexts and reruns                                                   // 616
  // all subscriptions                                                                                                 // 617
  _setUserId: function(userId) {                                                                                       // 618
    var self = this;                                                                                                   // 619
                                                                                                                       // 620
    if (userId !== null && typeof userId !== "string")                                                                 // 621
      throw new Error("setUserId must be called on string or null, not " +                                             // 622
                      typeof userId);                                                                                  // 623
                                                                                                                       // 624
    // Prevent newly-created universal subscriptions from being added to our                                           // 625
    // session; they will be found below when we call startUniversalSubs.                                              // 626
    //                                                                                                                 // 627
    // (We don't have to worry about named subscriptions, because we only add                                          // 628
    // them when we process a 'sub' message. We are currently processing a                                             // 629
    // 'method' message, and the method did not unblock, because it is illegal                                         // 630
    // to call setUserId after unblock. Thus we cannot be concurrently adding a                                        // 631
    // new named subscription.)                                                                                        // 632
    self._dontStartNewUniversalSubs = true;                                                                            // 633
                                                                                                                       // 634
    // Prevent current subs from updating our collectionViews and call their                                           // 635
    // stop callbacks. This may yield.                                                                                 // 636
    self._eachSub(function (sub) {                                                                                     // 637
      sub._deactivate();                                                                                               // 638
    });                                                                                                                // 639
                                                                                                                       // 640
    // All subs should now be deactivated. Stop sending messages to the client,                                        // 641
    // save the state of the published collections, reset to an empty view, and                                        // 642
    // update the userId.                                                                                              // 643
    self._isSending = false;                                                                                           // 644
    var beforeCVs = self.collectionViews;                                                                              // 645
    self.collectionViews = {};                                                                                         // 646
    self.userId = userId;                                                                                              // 647
                                                                                                                       // 648
    // Save the old named subs, and reset to having no subscriptions.                                                  // 649
    var oldNamedSubs = self._namedSubs;                                                                                // 650
    self._namedSubs = {};                                                                                              // 651
    self._universalSubs = [];                                                                                          // 652
                                                                                                                       // 653
    _.each(oldNamedSubs, function (sub, subscriptionId) {                                                              // 654
      self._namedSubs[subscriptionId] = sub._recreate();                                                               // 655
      // nb: if the handler throws or calls this.error(), it will in fact                                              // 656
      // immediately send its 'nosub'. This is OK, though.                                                             // 657
      self._namedSubs[subscriptionId]._runHandler();                                                                   // 658
    });                                                                                                                // 659
                                                                                                                       // 660
    // Allow newly-created universal subs to be started on our connection in                                           // 661
    // parallel with the ones we're spinning up here, and spin up universal                                            // 662
    // subs.                                                                                                           // 663
    self._dontStartNewUniversalSubs = false;                                                                           // 664
    self.startUniversalSubs();                                                                                         // 665
                                                                                                                       // 666
    // Start sending messages again, beginning with the diff from the previous                                         // 667
    // state of the world to the current state. No yields are allowed during                                           // 668
    // this diff, so that other changes cannot interleave.                                                             // 669
    Meteor._noYieldsAllowed(function () {                                                                              // 670
      self._isSending = true;                                                                                          // 671
      self._diffCollectionViews(beforeCVs);                                                                            // 672
      if (!_.isEmpty(self._pendingReady)) {                                                                            // 673
        self.sendReady(self._pendingReady);                                                                            // 674
        self._pendingReady = [];                                                                                       // 675
      }                                                                                                                // 676
    });                                                                                                                // 677
  },                                                                                                                   // 678
                                                                                                                       // 679
  _startSubscription: function (handler, subId, params, name) {                                                        // 680
    var self = this;                                                                                                   // 681
                                                                                                                       // 682
    var sub = new Subscription(                                                                                        // 683
      self, handler, subId, params, name);                                                                             // 684
    if (subId)                                                                                                         // 685
      self._namedSubs[subId] = sub;                                                                                    // 686
    else                                                                                                               // 687
      self._universalSubs.push(sub);                                                                                   // 688
                                                                                                                       // 689
    sub._runHandler();                                                                                                 // 690
  },                                                                                                                   // 691
                                                                                                                       // 692
  // tear down specified subscription                                                                                  // 693
  _stopSubscription: function (subId, error) {                                                                         // 694
    var self = this;                                                                                                   // 695
                                                                                                                       // 696
    if (subId && self._namedSubs[subId]) {                                                                             // 697
      self._namedSubs[subId]._removeAllDocuments();                                                                    // 698
      self._namedSubs[subId]._deactivate();                                                                            // 699
      delete self._namedSubs[subId];                                                                                   // 700
    }                                                                                                                  // 701
                                                                                                                       // 702
    var response = {msg: 'nosub', id: subId};                                                                          // 703
                                                                                                                       // 704
    if (error)                                                                                                         // 705
      response.error = wrapInternalException(error, "from sub " + subId);                                              // 706
                                                                                                                       // 707
    self.send(response);                                                                                               // 708
  },                                                                                                                   // 709
                                                                                                                       // 710
  // tear down all subscriptions. Note that this does NOT send removed or nosub                                        // 711
  // messages, since we assume the client is gone.                                                                     // 712
  _deactivateAllSubscriptions: function () {                                                                           // 713
    var self = this;                                                                                                   // 714
                                                                                                                       // 715
    _.each(self._namedSubs, function (sub, id) {                                                                       // 716
      sub._deactivate();                                                                                               // 717
    });                                                                                                                // 718
    self._namedSubs = {};                                                                                              // 719
                                                                                                                       // 720
    _.each(self._universalSubs, function (sub) {                                                                       // 721
      sub._deactivate();                                                                                               // 722
    });                                                                                                                // 723
    self._universalSubs = [];                                                                                          // 724
  }                                                                                                                    // 725
                                                                                                                       // 726
});                                                                                                                    // 727
                                                                                                                       // 728
/******************************************************************************/                                       // 729
/* Subscription                                                               */                                       // 730
/******************************************************************************/                                       // 731
                                                                                                                       // 732
// ctor for a sub handle: the input to each publish function                                                           // 733
var Subscription = function (                                                                                          // 734
    session, handler, subscriptionId, params, name) {                                                                  // 735
  var self = this;                                                                                                     // 736
  self._session = session; // type is Session                                                                          // 737
  self.connection = session.connectionHandle; // public API object                                                     // 738
                                                                                                                       // 739
  self._handler = handler;                                                                                             // 740
                                                                                                                       // 741
  // my subscription ID (generated by client, undefined for universal subs).                                           // 742
  self._subscriptionId = subscriptionId;                                                                               // 743
  // undefined for universal subs                                                                                      // 744
  self._name = name;                                                                                                   // 745
                                                                                                                       // 746
  self._params = params || [];                                                                                         // 747
                                                                                                                       // 748
  // Only named subscriptions have IDs, but we need some sort of string                                                // 749
  // internally to keep track of all subscriptions inside                                                              // 750
  // SessionDocumentViews. We use this subscriptionHandle for that.                                                    // 751
  if (self._subscriptionId) {                                                                                          // 752
    self._subscriptionHandle = 'N' + self._subscriptionId;                                                             // 753
  } else {                                                                                                             // 754
    self._subscriptionHandle = 'U' + Random.id();                                                                      // 755
  }                                                                                                                    // 756
                                                                                                                       // 757
  // has _deactivate been called?                                                                                      // 758
  self._deactivated = false;                                                                                           // 759
                                                                                                                       // 760
  // stop callbacks to g/c this sub.  called w/ zero arguments.                                                        // 761
  self._stopCallbacks = [];                                                                                            // 762
                                                                                                                       // 763
  // the set of (collection, documentid) that this subscription has                                                    // 764
  // an opinion about                                                                                                  // 765
  self._documents = {};                                                                                                // 766
                                                                                                                       // 767
  // remember if we are ready.                                                                                         // 768
  self._ready = false;                                                                                                 // 769
                                                                                                                       // 770
  // Part of the public API: the user of this sub.                                                                     // 771
  self.userId = session.userId;                                                                                        // 772
                                                                                                                       // 773
  // For now, the id filter is going to default to                                                                     // 774
  // the to/from DDP methods on LocalCollection, to                                                                    // 775
  // specifically deal with mongo/minimongo ObjectIds.                                                                 // 776
                                                                                                                       // 777
  // Later, you will be able to make this be "raw"                                                                     // 778
  // if you want to publish a collection that you know                                                                 // 779
  // just has strings for keys and no funny business, to                                                               // 780
  // a ddp consumer that isn't minimongo                                                                               // 781
                                                                                                                       // 782
  self._idFilter = {                                                                                                   // 783
    idStringify: LocalCollection._idStringify,                                                                         // 784
    idParse: LocalCollection._idParse                                                                                  // 785
  };                                                                                                                   // 786
                                                                                                                       // 787
  Package.facts && Package.facts.Facts.incrementServerFact(                                                            // 788
    "livedata", "subscriptions", 1);                                                                                   // 789
};                                                                                                                     // 790
                                                                                                                       // 791
_.extend(Subscription.prototype, {                                                                                     // 792
  _runHandler: function () {                                                                                           // 793
    var self = this;                                                                                                   // 794
    try {                                                                                                              // 795
      var res = maybeAuditArgumentChecks(                                                                              // 796
        self._handler, self, EJSON.clone(self._params),                                                                // 797
        "publisher '" + self._name + "'");                                                                             // 798
    } catch (e) {                                                                                                      // 799
      self.error(e);                                                                                                   // 800
      return;                                                                                                          // 801
    }                                                                                                                  // 802
                                                                                                                       // 803
    // Did the handler call this.error or this.stop?                                                                   // 804
    if (self._isDeactivated())                                                                                         // 805
      return;                                                                                                          // 806
                                                                                                                       // 807
    // SPECIAL CASE: Instead of writing their own callbacks that invoke                                                // 808
    // this.added/changed/ready/etc, the user can just return a collection                                             // 809
    // cursor or array of cursors from the publish function; we call their                                             // 810
    // _publishCursor method which starts observing the cursor and publishes the                                       // 811
    // results. Note that _publishCursor does NOT call ready().                                                        // 812
    //                                                                                                                 // 813
    // XXX This uses an undocumented interface which only the Mongo cursor                                             // 814
    // interface publishes. Should we make this interface public and encourage                                         // 815
    // users to implement it themselves? Arguably, it's unnecessary; users can                                         // 816
    // already write their own functions like                                                                          // 817
    //   var publishMyReactiveThingy = function (name, handler) {                                                      // 818
    //     Meteor.publish(name, function () {                                                                          // 819
    //       var reactiveThingy = handler();                                                                           // 820
    //       reactiveThingy.publishMe();                                                                               // 821
    //     });                                                                                                         // 822
    //   };                                                                                                            // 823
    var isCursor = function (c) {                                                                                      // 824
      return c && c._publishCursor;                                                                                    // 825
    };                                                                                                                 // 826
    if (isCursor(res)) {                                                                                               // 827
      res._publishCursor(self);                                                                                        // 828
      // _publishCursor only returns after the initial added callbacks have run.                                       // 829
      // mark subscription as ready.                                                                                   // 830
      self.ready();                                                                                                    // 831
    } else if (_.isArray(res)) {                                                                                       // 832
      // check all the elements are cursors                                                                            // 833
      if (! _.all(res, isCursor)) {                                                                                    // 834
        self.error(new Error("Publish function returned an array of non-Cursors"));                                    // 835
        return;                                                                                                        // 836
      }                                                                                                                // 837
      // find duplicate collection names                                                                               // 838
      // XXX we should support overlapping cursors, but that would require the                                         // 839
      // merge box to allow overlap within a subscription                                                              // 840
      var collectionNames = {};                                                                                        // 841
      for (var i = 0; i < res.length; ++i) {                                                                           // 842
        var collectionName = res[i]._getCollectionName();                                                              // 843
        if (_.has(collectionNames, collectionName)) {                                                                  // 844
          self.error(new Error(                                                                                        // 845
            "Publish function returned multiple cursors for collection " +                                             // 846
              collectionName));                                                                                        // 847
          return;                                                                                                      // 848
        }                                                                                                              // 849
        collectionNames[collectionName] = true;                                                                        // 850
      };                                                                                                               // 851
                                                                                                                       // 852
      _.each(res, function (cur) {                                                                                     // 853
        cur._publishCursor(self);                                                                                      // 854
      });                                                                                                              // 855
      self.ready();                                                                                                    // 856
    } else if (res) {                                                                                                  // 857
      // truthy values other than cursors or arrays are probably a                                                     // 858
      // user mistake (possible returning a Mongo document via, say,                                                   // 859
      // `coll.findOne()`).                                                                                            // 860
      self.error(new Error("Publish function can only return a Cursor or "                                             // 861
                           + "an array of Cursors"));                                                                  // 862
    }                                                                                                                  // 863
  },                                                                                                                   // 864
                                                                                                                       // 865
  // This calls all stop callbacks and prevents the handler from updating any                                          // 866
  // SessionCollectionViews further. It's used when the user unsubscribes or                                           // 867
  // disconnects, as well as during setUserId re-runs. It does *NOT* send                                              // 868
  // removed messages for the published objects; if that is necessary, call                                            // 869
  // _removeAllDocuments first.                                                                                        // 870
  _deactivate: function() {                                                                                            // 871
    var self = this;                                                                                                   // 872
    if (self._deactivated)                                                                                             // 873
      return;                                                                                                          // 874
    self._deactivated = true;                                                                                          // 875
    self._callStopCallbacks();                                                                                         // 876
    Package.facts && Package.facts.Facts.incrementServerFact(                                                          // 877
      "livedata", "subscriptions", -1);                                                                                // 878
  },                                                                                                                   // 879
                                                                                                                       // 880
  _callStopCallbacks: function () {                                                                                    // 881
    var self = this;                                                                                                   // 882
    // tell listeners, so they can clean up                                                                            // 883
    var callbacks = self._stopCallbacks;                                                                               // 884
    self._stopCallbacks = [];                                                                                          // 885
    _.each(callbacks, function (callback) {                                                                            // 886
      callback();                                                                                                      // 887
    });                                                                                                                // 888
  },                                                                                                                   // 889
                                                                                                                       // 890
  // Send remove messages for every document.                                                                          // 891
  _removeAllDocuments: function () {                                                                                   // 892
    var self = this;                                                                                                   // 893
    Meteor._noYieldsAllowed(function () {                                                                              // 894
      _.each(self._documents, function(collectionDocs, collectionName) {                                               // 895
        // Iterate over _.keys instead of the dictionary itself, since we'll be                                        // 896
        // mutating it.                                                                                                // 897
        _.each(_.keys(collectionDocs), function (strId) {                                                              // 898
          self.removed(collectionName, self._idFilter.idParse(strId));                                                 // 899
        });                                                                                                            // 900
      });                                                                                                              // 901
    });                                                                                                                // 902
  },                                                                                                                   // 903
                                                                                                                       // 904
  // Returns a new Subscription for the same session with the same                                                     // 905
  // initial creation parameters. This isn't a clone: it doesn't have                                                  // 906
  // the same _documents cache, stopped state or callbacks; may have a                                                 // 907
  // different _subscriptionHandle, and gets its userId from the                                                       // 908
  // session, not from this object.                                                                                    // 909
  _recreate: function () {                                                                                             // 910
    var self = this;                                                                                                   // 911
    return new Subscription(                                                                                           // 912
      self._session, self._handler, self._subscriptionId, self._params);                                               // 913
  },                                                                                                                   // 914
                                                                                                                       // 915
  error: function (error) {                                                                                            // 916
    var self = this;                                                                                                   // 917
    if (self._isDeactivated())                                                                                         // 918
      return;                                                                                                          // 919
    self._session._stopSubscription(self._subscriptionId, error);                                                      // 920
  },                                                                                                                   // 921
                                                                                                                       // 922
  // Note that while our DDP client will notice that you've called stop() on the                                       // 923
  // server (and clean up its _subscriptions table) we don't actually provide a                                        // 924
  // mechanism for an app to notice this (the subscribe onError callback only                                          // 925
  // triggers if there is an error).                                                                                   // 926
  stop: function () {                                                                                                  // 927
    var self = this;                                                                                                   // 928
    if (self._isDeactivated())                                                                                         // 929
      return;                                                                                                          // 930
    self._session._stopSubscription(self._subscriptionId);                                                             // 931
  },                                                                                                                   // 932
                                                                                                                       // 933
  onStop: function (callback) {                                                                                        // 934
    var self = this;                                                                                                   // 935
    if (self._isDeactivated())                                                                                         // 936
      callback();                                                                                                      // 937
    else                                                                                                               // 938
      self._stopCallbacks.push(callback);                                                                              // 939
  },                                                                                                                   // 940
                                                                                                                       // 941
  // This returns true if the sub has been deactivated, *OR* if the session was                                        // 942
  // destroyed but the deferred call to _deactivateAllSubscriptions hasn't                                             // 943
  // happened yet.                                                                                                     // 944
  _isDeactivated: function () {                                                                                        // 945
    var self = this;                                                                                                   // 946
    return self._deactivated || self._session.inQueue === null;                                                        // 947
  },                                                                                                                   // 948
                                                                                                                       // 949
  added: function (collectionName, id, fields) {                                                                       // 950
    var self = this;                                                                                                   // 951
    if (self._isDeactivated())                                                                                         // 952
      return;                                                                                                          // 953
    id = self._idFilter.idStringify(id);                                                                               // 954
    Meteor._ensure(self._documents, collectionName)[id] = true;                                                        // 955
    self._session.added(self._subscriptionHandle, collectionName, id, fields);                                         // 956
  },                                                                                                                   // 957
                                                                                                                       // 958
  changed: function (collectionName, id, fields) {                                                                     // 959
    var self = this;                                                                                                   // 960
    if (self._isDeactivated())                                                                                         // 961
      return;                                                                                                          // 962
    id = self._idFilter.idStringify(id);                                                                               // 963
    self._session.changed(self._subscriptionHandle, collectionName, id, fields);                                       // 964
  },                                                                                                                   // 965
                                                                                                                       // 966
  removed: function (collectionName, id) {                                                                             // 967
    var self = this;                                                                                                   // 968
    if (self._isDeactivated())                                                                                         // 969
      return;                                                                                                          // 970
    id = self._idFilter.idStringify(id);                                                                               // 971
    // We don't bother to delete sets of things in a collection if the                                                 // 972
    // collection is empty.  It could break _removeAllDocuments.                                                       // 973
    delete self._documents[collectionName][id];                                                                        // 974
    self._session.removed(self._subscriptionHandle, collectionName, id);                                               // 975
  },                                                                                                                   // 976
                                                                                                                       // 977
  ready: function () {                                                                                                 // 978
    var self = this;                                                                                                   // 979
    if (self._isDeactivated())                                                                                         // 980
      return;                                                                                                          // 981
    if (!self._subscriptionId)                                                                                         // 982
      return;  // unnecessary but ignored for universal sub                                                            // 983
    if (!self._ready) {                                                                                                // 984
      self._session.sendReady([self._subscriptionId]);                                                                 // 985
      self._ready = true;                                                                                              // 986
    }                                                                                                                  // 987
  }                                                                                                                    // 988
});                                                                                                                    // 989
                                                                                                                       // 990
/******************************************************************************/                                       // 991
/* Server                                                                     */                                       // 992
/******************************************************************************/                                       // 993
                                                                                                                       // 994
Server = function () {                                                                                                 // 995
  var self = this;                                                                                                     // 996
                                                                                                                       // 997
  // Map of callbacks to call when a new connection comes in to the                                                    // 998
  // server and completes DDP version negotiation. Use an object instead                                               // 999
  // of an array so we can safely remove one from the list while                                                       // 1000
  // iterating over it.                                                                                                // 1001
  self.connectionCallbacks = {};                                                                                       // 1002
  self.nextConnectionCallbackId = 0;                                                                                   // 1003
                                                                                                                       // 1004
  self.publish_handlers = {};                                                                                          // 1005
  self.universal_publish_handlers = [];                                                                                // 1006
                                                                                                                       // 1007
  self.method_handlers = {};                                                                                           // 1008
                                                                                                                       // 1009
  self.sessions = {}; // map from id to session                                                                        // 1010
                                                                                                                       // 1011
  self.stream_server = new StreamServer;                                                                               // 1012
                                                                                                                       // 1013
  self.stream_server.register(function (socket) {                                                                      // 1014
    // socket implements the SockJSConnection interface                                                                // 1015
    socket._meteorSession = null;                                                                                      // 1016
                                                                                                                       // 1017
    var sendError = function (reason, offendingMessage) {                                                              // 1018
      var msg = {msg: 'error', reason: reason};                                                                        // 1019
      if (offendingMessage)                                                                                            // 1020
        msg.offendingMessage = offendingMessage;                                                                       // 1021
      socket.send(stringifyDDP(msg));                                                                                  // 1022
    };                                                                                                                 // 1023
                                                                                                                       // 1024
    socket.on('data', function (raw_msg) {                                                                             // 1025
      if (Meteor._printReceivedDDP) {                                                                                  // 1026
        Meteor._debug("Received DDP", raw_msg);                                                                        // 1027
      }                                                                                                                // 1028
      try {                                                                                                            // 1029
        try {                                                                                                          // 1030
          var msg = parseDDP(raw_msg);                                                                                 // 1031
        } catch (err) {                                                                                                // 1032
          sendError('Parse error');                                                                                    // 1033
          return;                                                                                                      // 1034
        }                                                                                                              // 1035
        if (msg === null || !msg.msg) {                                                                                // 1036
          sendError('Bad request', msg);                                                                               // 1037
          return;                                                                                                      // 1038
        }                                                                                                              // 1039
                                                                                                                       // 1040
        if (msg.msg === 'connect') {                                                                                   // 1041
          if (socket._meteorSession) {                                                                                 // 1042
            sendError("Already connected", msg);                                                                       // 1043
            return;                                                                                                    // 1044
          }                                                                                                            // 1045
          self._handleConnect(socket, msg);                                                                            // 1046
          return;                                                                                                      // 1047
        }                                                                                                              // 1048
                                                                                                                       // 1049
        if (!socket._meteorSession) {                                                                                  // 1050
          sendError('Must connect first', msg);                                                                        // 1051
          return;                                                                                                      // 1052
        }                                                                                                              // 1053
        socket._meteorSession.processMessage(msg);                                                                     // 1054
      } catch (e) {                                                                                                    // 1055
        // XXX print stack nicely                                                                                      // 1056
        Meteor._debug("Internal exception while processing message", msg,                                              // 1057
                      e.message, e.stack);                                                                             // 1058
      }                                                                                                                // 1059
    });                                                                                                                // 1060
                                                                                                                       // 1061
    socket.on('close', function () {                                                                                   // 1062
      if (socket._meteorSession) {                                                                                     // 1063
        Fiber(function () {                                                                                            // 1064
          self._closeSession(socket._meteorSession);                                                                   // 1065
        }).run();                                                                                                      // 1066
      }                                                                                                                // 1067
    });                                                                                                                // 1068
  });                                                                                                                  // 1069
};                                                                                                                     // 1070
                                                                                                                       // 1071
_.extend(Server.prototype, {                                                                                           // 1072
                                                                                                                       // 1073
  onConnection: function (fn) {                                                                                        // 1074
    var self = this;                                                                                                   // 1075
                                                                                                                       // 1076
    fn = Meteor.bindEnvironment(fn, "onConnection callback");                                                          // 1077
                                                                                                                       // 1078
    var id = self.nextConnectionCallbackId++;                                                                          // 1079
    self.connectionCallbacks[id] = fn;                                                                                 // 1080
                                                                                                                       // 1081
    return {                                                                                                           // 1082
      stop: function () {                                                                                              // 1083
        delete self.connectionCallbacks[id];                                                                           // 1084
      }                                                                                                                // 1085
    };                                                                                                                 // 1086
  },                                                                                                                   // 1087
                                                                                                                       // 1088
  _handleConnect: function (socket, msg) {                                                                             // 1089
    var self = this;                                                                                                   // 1090
    // In the future, handle session resumption: something like:                                                       // 1091
    //  socket._meteorSession = self.sessions[msg.session]                                                             // 1092
    var version = calculateVersion(msg.support, SUPPORTED_DDP_VERSIONS);                                               // 1093
                                                                                                                       // 1094
    if (msg.version === version) {                                                                                     // 1095
      // Creating a new session                                                                                        // 1096
      socket._meteorSession = new Session(self, version, socket);                                                      // 1097
      self.sessions[socket._meteorSession.id] = socket._meteorSession;                                                 // 1098
      _.each(_.keys(self.connectionCallbacks), function (id) {                                                         // 1099
        if (_.has(self.connectionCallbacks, id) && socket._meteorSession) {                                            // 1100
          var callback = self.connectionCallbacks[id];                                                                 // 1101
          callback(socket._meteorSession.connectionHandle);                                                            // 1102
        }                                                                                                              // 1103
      });                                                                                                              // 1104
    } else if (!msg.version) {                                                                                         // 1105
      // connect message without a version. This means an old (pre-pre1)                                               // 1106
      // client is trying to connect. If we just disconnect the                                                        // 1107
      // connection, they'll retry right away. Instead, just pause for a                                               // 1108
      // bit (randomly distributed so as to avoid synchronized swarms)                                                 // 1109
      // and hold the connection open.                                                                                 // 1110
      var timeout = 1000 * (30 + Random.fraction() * 60);                                                              // 1111
      // drop all future data coming over this connection on the                                                       // 1112
      // floor. We don't want to confuse things.                                                                       // 1113
      socket.removeAllListeners('data');                                                                               // 1114
      setTimeout(function () {                                                                                         // 1115
        socket.send(stringifyDDP({msg: 'failed', version: version}));                                                  // 1116
        socket.close();                                                                                                // 1117
      }, timeout);                                                                                                     // 1118
    } else {                                                                                                           // 1119
      socket.send(stringifyDDP({msg: 'failed', version: version}));                                                    // 1120
      socket.close();                                                                                                  // 1121
    }                                                                                                                  // 1122
  },                                                                                                                   // 1123
  /**                                                                                                                  // 1124
   * Register a publish handler function.                                                                              // 1125
   *                                                                                                                   // 1126
   * @param name {String} identifier for query                                                                         // 1127
   * @param handler {Function} publish handler                                                                         // 1128
   * @param options {Object}                                                                                           // 1129
   *                                                                                                                   // 1130
   * Server will call handler function on each new subscription,                                                       // 1131
   * either when receiving DDP sub message for a named subscription, or on                                             // 1132
   * DDP connect for a universal subscription.                                                                         // 1133
   *                                                                                                                   // 1134
   * If name is null, this will be a subscription that is                                                              // 1135
   * automatically established and permanently on for all connected                                                    // 1136
   * client, instead of a subscription that can be turned on and off                                                   // 1137
   * with subscribe().                                                                                                 // 1138
   *                                                                                                                   // 1139
   * options to contain:                                                                                               // 1140
   *  - (mostly internal) is_auto: true if generated automatically                                                     // 1141
   *    from an autopublish hook. this is for cosmetic purposes only                                                   // 1142
   *    (it lets us determine whether to print a warning suggesting                                                    // 1143
   *    that you turn off autopublish.)                                                                                // 1144
   */                                                                                                                  // 1145
  publish: function (name, handler, options) {                                                                         // 1146
    var self = this;                                                                                                   // 1147
                                                                                                                       // 1148
    options = options || {};                                                                                           // 1149
                                                                                                                       // 1150
    if (name && name in self.publish_handlers) {                                                                       // 1151
      Meteor._debug("Ignoring duplicate publish named '" + name + "'");                                                // 1152
      return;                                                                                                          // 1153
    }                                                                                                                  // 1154
                                                                                                                       // 1155
    if (Package.autopublish && !options.is_auto) {                                                                     // 1156
      // They have autopublish on, yet they're trying to manually                                                      // 1157
      // picking stuff to publish. They probably should turn off                                                       // 1158
      // autopublish. (This check isn't perfect -- if you create a                                                     // 1159
      // publish before you turn on autopublish, it won't catch                                                        // 1160
      // it. But this will definitely handle the simple case where                                                     // 1161
      // you've added the autopublish package to your app, and are                                                     // 1162
      // calling publish from your app code.)                                                                          // 1163
      if (!self.warned_about_autopublish) {                                                                            // 1164
        self.warned_about_autopublish = true;                                                                          // 1165
        Meteor._debug(                                                                                                 // 1166
"** You've set up some data subscriptions with Meteor.publish(), but\n" +                                              // 1167
"** you still have autopublish turned on. Because autopublish is still\n" +                                            // 1168
"** on, your Meteor.publish() calls won't have much effect. All data\n" +                                              // 1169
"** will still be sent to all clients.\n" +                                                                            // 1170
"**\n" +                                                                                                               // 1171
"** Turn off autopublish by removing the autopublish package:\n" +                                                     // 1172
"**\n" +                                                                                                               // 1173
"**   $ meteor remove autopublish\n" +                                                                                 // 1174
"**\n" +                                                                                                               // 1175
"** .. and make sure you have Meteor.publish() and Meteor.subscribe() calls\n" +                                       // 1176
"** for each collection that you want clients to see.\n");                                                             // 1177
      }                                                                                                                // 1178
    }                                                                                                                  // 1179
                                                                                                                       // 1180
    if (name)                                                                                                          // 1181
      self.publish_handlers[name] = handler;                                                                           // 1182
    else {                                                                                                             // 1183
      self.universal_publish_handlers.push(handler);                                                                   // 1184
      // Spin up the new publisher on any existing session too. Run each                                               // 1185
      // session's subscription in a new Fiber, so that there's no change for                                          // 1186
      // self.sessions to change while we're running this loop.                                                        // 1187
      _.each(self.sessions, function (session) {                                                                       // 1188
        if (!session._dontStartNewUniversalSubs) {                                                                     // 1189
          Fiber(function() {                                                                                           // 1190
            session._startSubscription(handler);                                                                       // 1191
          }).run();                                                                                                    // 1192
        }                                                                                                              // 1193
      });                                                                                                              // 1194
    }                                                                                                                  // 1195
  },                                                                                                                   // 1196
                                                                                                                       // 1197
  _closeSession: function (session) {                                                                                  // 1198
    var self = this;                                                                                                   // 1199
    if (self.sessions[session.id]) {                                                                                   // 1200
      delete self.sessions[session.id];                                                                                // 1201
      session.destroy();                                                                                               // 1202
    }                                                                                                                  // 1203
  },                                                                                                                   // 1204
                                                                                                                       // 1205
  methods: function (methods) {                                                                                        // 1206
    var self = this;                                                                                                   // 1207
    _.each(methods, function (func, name) {                                                                            // 1208
      if (self.method_handlers[name])                                                                                  // 1209
        throw new Error("A method named '" + name + "' is already defined");                                           // 1210
      self.method_handlers[name] = func;                                                                               // 1211
    });                                                                                                                // 1212
  },                                                                                                                   // 1213
                                                                                                                       // 1214
  call: function (name /*, arguments */) {                                                                             // 1215
    // if it's a function, the last argument is the result callback,                                                   // 1216
    // not a parameter to the remote method.                                                                           // 1217
    var args = Array.prototype.slice.call(arguments, 1);                                                               // 1218
    if (args.length && typeof args[args.length - 1] === "function")                                                    // 1219
      var callback = args.pop();                                                                                       // 1220
    return this.apply(name, args, callback);                                                                           // 1221
  },                                                                                                                   // 1222
                                                                                                                       // 1223
  // @param options {Optional Object}                                                                                  // 1224
  // @param callback {Optional Function}                                                                               // 1225
  apply: function (name, args, options, callback) {                                                                    // 1226
    var self = this;                                                                                                   // 1227
                                                                                                                       // 1228
    // We were passed 3 arguments. They may be either (name, args, options)                                            // 1229
    // or (name, args, callback)                                                                                       // 1230
    if (!callback && typeof options === 'function') {                                                                  // 1231
      callback = options;                                                                                              // 1232
      options = {};                                                                                                    // 1233
    }                                                                                                                  // 1234
    options = options || {};                                                                                           // 1235
                                                                                                                       // 1236
    if (callback)                                                                                                      // 1237
      // It's not really necessary to do this, since we immediately                                                    // 1238
      // run the callback in this fiber before returning, but we do it                                                 // 1239
      // anyway for regularity.                                                                                        // 1240
      // XXX improve error message (and how we report it)                                                              // 1241
      callback = Meteor.bindEnvironment(                                                                               // 1242
        callback,                                                                                                      // 1243
        "delivering result of invoking '" + name + "'"                                                                 // 1244
      );                                                                                                               // 1245
                                                                                                                       // 1246
    // Run the handler                                                                                                 // 1247
    var handler = self.method_handlers[name];                                                                          // 1248
    var exception;                                                                                                     // 1249
    if (!handler) {                                                                                                    // 1250
      exception = new Meteor.Error(404, "Method not found");                                                           // 1251
    } else {                                                                                                           // 1252
      // If this is a method call from within another method, get the                                                  // 1253
      // user state from the outer method, otherwise don't allow                                                       // 1254
      // setUserId to be called                                                                                        // 1255
      var userId = null;                                                                                               // 1256
      var setUserId = function() {                                                                                     // 1257
        throw new Error("Can't call setUserId on a server initiated method call");                                     // 1258
      };                                                                                                               // 1259
      var connection = null;                                                                                           // 1260
      var currentInvocation = DDP._CurrentInvocation.get();                                                            // 1261
      if (currentInvocation) {                                                                                         // 1262
        userId = currentInvocation.userId;                                                                             // 1263
        setUserId = function(userId) {                                                                                 // 1264
          currentInvocation.setUserId(userId);                                                                         // 1265
        };                                                                                                             // 1266
        connection = currentInvocation.connection;                                                                     // 1267
      }                                                                                                                // 1268
                                                                                                                       // 1269
      var invocation = new MethodInvocation({                                                                          // 1270
        isSimulation: false,                                                                                           // 1271
        userId: userId,                                                                                                // 1272
        setUserId: setUserId,                                                                                          // 1273
        connection: connection                                                                                         // 1274
      });                                                                                                              // 1275
      try {                                                                                                            // 1276
        var result = DDP._CurrentInvocation.withValue(invocation, function () {                                        // 1277
          return maybeAuditArgumentChecks(                                                                             // 1278
            handler, invocation, args, "internal call to '" + name + "'");                                             // 1279
        });                                                                                                            // 1280
      } catch (e) {                                                                                                    // 1281
        exception = e;                                                                                                 // 1282
      }                                                                                                                // 1283
    }                                                                                                                  // 1284
                                                                                                                       // 1285
    // Return the result in whichever way the caller asked for it. Note that we                                        // 1286
    // do NOT block on the write fence in an analogous way to how the client                                           // 1287
    // blocks on the relevant data being visible, so you are NOT guaranteed that                                       // 1288
    // cursor observe callbacks have fired when your callback is invoked. (We                                          // 1289
    // can change this if there's a real use case.)                                                                    // 1290
    if (callback) {                                                                                                    // 1291
      callback(exception, result);                                                                                     // 1292
      return undefined;                                                                                                // 1293
    }                                                                                                                  // 1294
    if (exception)                                                                                                     // 1295
      throw exception;                                                                                                 // 1296
    return result;                                                                                                     // 1297
  }                                                                                                                    // 1298
});                                                                                                                    // 1299
                                                                                                                       // 1300
var calculateVersion = function (clientSupportedVersions,                                                              // 1301
                                 serverSupportedVersions) {                                                            // 1302
  var correctVersion = _.find(clientSupportedVersions, function (version) {                                            // 1303
    return _.contains(serverSupportedVersions, version);                                                               // 1304
  });                                                                                                                  // 1305
  if (!correctVersion) {                                                                                               // 1306
    correctVersion = serverSupportedVersions[0];                                                                       // 1307
  }                                                                                                                    // 1308
  return correctVersion;                                                                                               // 1309
};                                                                                                                     // 1310
                                                                                                                       // 1311
LivedataTest.calculateVersion = calculateVersion;                                                                      // 1312
                                                                                                                       // 1313
                                                                                                                       // 1314
// "blind" exceptions other than those that were deliberately thrown to signal                                         // 1315
// errors to the client                                                                                                // 1316
var wrapInternalException = function (exception, context) {                                                            // 1317
  if (!exception || exception instanceof Meteor.Error)                                                                 // 1318
    return exception;                                                                                                  // 1319
                                                                                                                       // 1320
  // Did the error contain more details that could have been useful if caught in                                       // 1321
  // server code (or if thrown from non-client-originated code), but also                                              // 1322
  // provided a "sanitized" version with more context than 500 Internal server                                         // 1323
  // error? Use that.                                                                                                  // 1324
  if (exception.sanitizedError) {                                                                                      // 1325
    if (exception.sanitizedError instanceof Meteor.Error)                                                              // 1326
      return exception.sanitizedError;                                                                                 // 1327
    Meteor._debug("Exception " + context + " provides a sanitizedError that " +                                        // 1328
                  "is not a Meteor.Error; ignoring");                                                                  // 1329
  }                                                                                                                    // 1330
                                                                                                                       // 1331
  // tests can set the 'expected' flag on an exception so it won't go to the                                           // 1332
  // server log                                                                                                        // 1333
  if (!exception.expected)                                                                                             // 1334
    Meteor._debug("Exception " + context, exception.stack);                                                            // 1335
                                                                                                                       // 1336
  return new Meteor.Error(500, "Internal server error");                                                               // 1337
};                                                                                                                     // 1338
                                                                                                                       // 1339
                                                                                                                       // 1340
// Audit argument checks, if the audit-argument-checks package exists (it is a                                         // 1341
// weak dependency of this package).                                                                                   // 1342
var maybeAuditArgumentChecks = function (f, context, args, description) {                                              // 1343
  args = args || [];                                                                                                   // 1344
  if (Package['audit-argument-checks']) {                                                                              // 1345
    return Match._failIfArgumentsAreNotAllChecked(                                                                     // 1346
      f, context, args, description);                                                                                  // 1347
  }                                                                                                                    // 1348
  return f.apply(context, args);                                                                                       // 1349
};                                                                                                                     // 1350
                                                                                                                       // 1351
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/livedata/writefence.js                                                                                     //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
var path = Npm.require('path');                                                                                        // 1
var Future = Npm.require(path.join('fibers', 'future'));                                                               // 2
                                                                                                                       // 3
// A write fence collects a group of writes, and provides a callback                                                   // 4
// when all of the writes are fully committed and propagated (all                                                      // 5
// observers have been notified of the write and acknowledged it.)                                                     // 6
//                                                                                                                     // 7
DDPServer._WriteFence = function () {                                                                                  // 8
  var self = this;                                                                                                     // 9
                                                                                                                       // 10
  self.armed = false;                                                                                                  // 11
  self.fired = false;                                                                                                  // 12
  self.retired = false;                                                                                                // 13
  self.outstanding_writes = 0;                                                                                         // 14
  self.completion_callbacks = [];                                                                                      // 15
};                                                                                                                     // 16
                                                                                                                       // 17
// The current write fence. When there is a current write fence, code                                                  // 18
// that writes to databases should register their writes with it using                                                 // 19
// beginWrite().                                                                                                       // 20
//                                                                                                                     // 21
DDPServer._CurrentWriteFence = new Meteor.EnvironmentVariable;                                                         // 22
                                                                                                                       // 23
_.extend(DDPServer._WriteFence.prototype, {                                                                            // 24
  // Start tracking a write, and return an object to represent it. The                                                 // 25
  // object has a single method, committed(). This method should be                                                    // 26
  // called when the write is fully committed and propagated. You can                                                  // 27
  // continue to add writes to the WriteFence up until it is triggered                                                 // 28
  // (calls its callbacks because all writes have committed.)                                                          // 29
  beginWrite: function () {                                                                                            // 30
    var self = this;                                                                                                   // 31
                                                                                                                       // 32
    if (self.retired)                                                                                                  // 33
      return { committed: function () {} };                                                                            // 34
                                                                                                                       // 35
    if (self.fired)                                                                                                    // 36
      throw new Error("fence has already activated -- too late to add writes");                                        // 37
                                                                                                                       // 38
    self.outstanding_writes++;                                                                                         // 39
    var committed = false;                                                                                             // 40
    return {                                                                                                           // 41
      committed: function () {                                                                                         // 42
        if (committed)                                                                                                 // 43
          throw new Error("committed called twice on the same write");                                                 // 44
        committed = true;                                                                                              // 45
        self.outstanding_writes--;                                                                                     // 46
        self._maybeFire();                                                                                             // 47
      }                                                                                                                // 48
    };                                                                                                                 // 49
  },                                                                                                                   // 50
                                                                                                                       // 51
  // Arm the fence. Once the fence is armed, and there are no more                                                     // 52
  // uncommitted writes, it will activate.                                                                             // 53
  arm: function () {                                                                                                   // 54
    var self = this;                                                                                                   // 55
    self.armed = true;                                                                                                 // 56
    self._maybeFire();                                                                                                 // 57
  },                                                                                                                   // 58
                                                                                                                       // 59
  // Register a function to be called when the fence fires.                                                            // 60
  onAllCommitted: function (func) {                                                                                    // 61
    var self = this;                                                                                                   // 62
    if (self.fired)                                                                                                    // 63
      throw new Error("fence has already activated -- too late to " +                                                  // 64
                      "add a callback");                                                                               // 65
    self.completion_callbacks.push(func);                                                                              // 66
  },                                                                                                                   // 67
                                                                                                                       // 68
  // Convenience function. Arms the fence, then blocks until it fires.                                                 // 69
  armAndWait: function () {                                                                                            // 70
    var self = this;                                                                                                   // 71
    var future = new Future;                                                                                           // 72
    self.onAllCommitted(function () {                                                                                  // 73
      future['return']();                                                                                              // 74
    });                                                                                                                // 75
    self.arm();                                                                                                        // 76
    future.wait();                                                                                                     // 77
  },                                                                                                                   // 78
                                                                                                                       // 79
  _maybeFire: function () {                                                                                            // 80
    var self = this;                                                                                                   // 81
    if (self.fired)                                                                                                    // 82
      throw new Error("write fence already activated?");                                                               // 83
    if (self.armed && !self.outstanding_writes) {                                                                      // 84
      self.fired = true;                                                                                               // 85
      _.each(self.completion_callbacks, function (f) {f(self);});                                                      // 86
      self.completion_callbacks = [];                                                                                  // 87
    }                                                                                                                  // 88
  },                                                                                                                   // 89
                                                                                                                       // 90
  // Deactivate this fence so that adding more writes has no effect.                                                   // 91
  // The fence must have already fired.                                                                                // 92
  retire: function () {                                                                                                // 93
    var self = this;                                                                                                   // 94
    if (! self.fired)                                                                                                  // 95
      throw new Error("Can't retire a fence that hasn't fired.");                                                      // 96
    self.retired = true;                                                                                               // 97
  }                                                                                                                    // 98
});                                                                                                                    // 99
                                                                                                                       // 100
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/livedata/crossbar.js                                                                                       //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
// A "crossbar" is a class that provides structured notification registration.                                         // 1
// The "invalidation crossbar" is a specific instance used by the DDP server to                                        // 2
// implement write fence notifications.                                                                                // 3
                                                                                                                       // 4
DDPServer._Crossbar = function (options) {                                                                             // 5
  var self = this;                                                                                                     // 6
  options = options || {};                                                                                             // 7
                                                                                                                       // 8
  self.nextId = 1;                                                                                                     // 9
  // map from listener id to object. each object has keys 'trigger',                                                   // 10
  // 'callback'.                                                                                                       // 11
  self.listeners = {};                                                                                                 // 12
  self.factPackage = options.factPackage || "livedata";                                                                // 13
  self.factName = options.factName || null;                                                                            // 14
};                                                                                                                     // 15
                                                                                                                       // 16
_.extend(DDPServer._Crossbar.prototype, {                                                                              // 17
  // Listen for notification that match 'trigger'. A notification                                                      // 18
  // matches if it has the key-value pairs in trigger as a                                                             // 19
  // subset. When a notification matches, call 'callback', passing two                                                 // 20
  // arguments, the actual notification and an acknowledgement                                                         // 21
  // function. The callback should call the acknowledgement function                                                   // 22
  // when it is finished processing the notification.                                                                  // 23
  //                                                                                                                   // 24
  // Returns a listen handle, which is an object with a method                                                         // 25
  // stop(). Call stop() to stop listening.                                                                            // 26
  //                                                                                                                   // 27
  // XXX It should be legal to call fire() from inside a listen()                                                      // 28
  // callback?                                                                                                         // 29
  listen: function (trigger, callback) {                                                                               // 30
    var self = this;                                                                                                   // 31
    var id = self.nextId++;                                                                                            // 32
    self.listeners[id] = {trigger: EJSON.clone(trigger), callback: callback};                                          // 33
    if (self.factName && Package.facts) {                                                                              // 34
      Package.facts.Facts.incrementServerFact(                                                                         // 35
        self.factPackage, self.factName, 1);                                                                           // 36
    }                                                                                                                  // 37
    return {                                                                                                           // 38
      stop: function () {                                                                                              // 39
        if (self.factName && Package.facts) {                                                                          // 40
          Package.facts.Facts.incrementServerFact(                                                                     // 41
            self.factPackage, self.factName, -1);                                                                      // 42
        }                                                                                                              // 43
        delete self.listeners[id];                                                                                     // 44
      }                                                                                                                // 45
    };                                                                                                                 // 46
  },                                                                                                                   // 47
                                                                                                                       // 48
  // Fire the provided 'notification' (an object whose attribute                                                       // 49
  // values are all JSON-compatibile) -- inform all matching listeners                                                 // 50
  // (registered with listen()), and once they have all acknowledged                                                   // 51
  // the notification, call onComplete with no arguments.                                                              // 52
  //                                                                                                                   // 53
  // If fire() is called inside a write fence, then each of the                                                        // 54
  // listener callbacks will be called inside the write fence as well.                                                 // 55
  //                                                                                                                   // 56
  // The listeners may be invoked in parallel, rather than serially.                                                   // 57
  fire: function (notification, onComplete) {                                                                          // 58
    var self = this;                                                                                                   // 59
    var callbacks = [];                                                                                                // 60
    // XXX consider refactoring to "index" on "collection"                                                             // 61
    _.each(self.listeners, function (l) {                                                                              // 62
      if (self._matches(notification, l.trigger))                                                                      // 63
        callbacks.push(l.callback);                                                                                    // 64
    });                                                                                                                // 65
                                                                                                                       // 66
    if (onComplete)                                                                                                    // 67
      onComplete = Meteor.bindEnvironment(                                                                             // 68
        onComplete,                                                                                                    // 69
        "Crossbar fire complete callback");                                                                            // 70
                                                                                                                       // 71
    var outstanding = callbacks.length;                                                                                // 72
    if (!outstanding)                                                                                                  // 73
      onComplete && onComplete();                                                                                      // 74
    else {                                                                                                             // 75
      _.each(callbacks, function (c) {                                                                                 // 76
        c(notification, function () {                                                                                  // 77
          if (--outstanding === 0)                                                                                     // 78
            onComplete && onComplete();                                                                                // 79
        });                                                                                                            // 80
      });                                                                                                              // 81
    }                                                                                                                  // 82
  },                                                                                                                   // 83
                                                                                                                       // 84
  // A notification matches a trigger if all keys that exist in both are equal.                                        // 85
  //                                                                                                                   // 86
  // Examples:                                                                                                         // 87
  //  N:{collection: "C"} matches T:{collection: "C"}                                                                  // 88
  //    (a non-targeted write to a collection matches a                                                                // 89
  //     non-targeted query)                                                                                           // 90
  //  N:{collection: "C", id: "X"} matches T:{collection: "C"}                                                         // 91
  //    (a targeted write to a collection matches a non-targeted query)                                                // 92
  //  N:{collection: "C"} matches T:{collection: "C", id: "X"}                                                         // 93
  //    (a non-targeted write to a collection matches a                                                                // 94
  //     targeted query)                                                                                               // 95
  //  N:{collection: "C", id: "X"} matches T:{collection: "C", id: "X"}                                                // 96
  //    (a targeted write to a collection matches a targeted query targeted                                            // 97
  //     at the same document)                                                                                         // 98
  //  N:{collection: "C", id: "X"} does not match T:{collection: "C", id: "Y"}                                         // 99
  //    (a targeted write to a collection does not match a targeted query                                              // 100
  //     targeted at a different document)                                                                             // 101
  _matches: function (notification, trigger) {                                                                         // 102
    return _.all(trigger, function (triggerValue, key) {                                                               // 103
      return !_.has(notification, key) ||                                                                              // 104
        EJSON.equals(triggerValue, notification[key]);                                                                 // 105
    });                                                                                                                // 106
  }                                                                                                                    // 107
});                                                                                                                    // 108
                                                                                                                       // 109
DDPServer._InvalidationCrossbar = new DDPServer._Crossbar({                                                            // 110
  factName: "invalidation-crossbar-listeners"                                                                          // 111
});                                                                                                                    // 112
                                                                                                                       // 113
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/livedata/livedata_common.js                                                                                //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
DDP = {};                                                                                                              // 1
                                                                                                                       // 2
SUPPORTED_DDP_VERSIONS = [ 'pre1' ];                                                                                   // 3
                                                                                                                       // 4
LivedataTest.SUPPORTED_DDP_VERSIONS = SUPPORTED_DDP_VERSIONS;                                                          // 5
                                                                                                                       // 6
MethodInvocation = function (options) {                                                                                // 7
  var self = this;                                                                                                     // 8
                                                                                                                       // 9
  // true if we're running not the actual method, but a stub (that is,                                                 // 10
  // if we're on a client (which may be a browser, or in the future a                                                  // 11
  // server connecting to another server) and presently running a                                                      // 12
  // simulation of a server-side method for latency compensation                                                       // 13
  // purposes). not currently true except in a client such as a browser,                                               // 14
  // since there's usually no point in running stubs unless you have a                                                 // 15
  // zero-latency connection to the user.                                                                              // 16
  this.isSimulation = options.isSimulation;                                                                            // 17
                                                                                                                       // 18
  // call this function to allow other method invocations (from the                                                    // 19
  // same client) to continue running without waiting for this one to                                                  // 20
  // complete.                                                                                                         // 21
  this._unblock = options.unblock || function () {};                                                                   // 22
  this._calledUnblock = false;                                                                                         // 23
                                                                                                                       // 24
  // current user id                                                                                                   // 25
  this.userId = options.userId;                                                                                        // 26
                                                                                                                       // 27
  // sets current user id in all appropriate server contexts and                                                       // 28
  // reruns subscriptions                                                                                              // 29
  this._setUserId = options.setUserId || function () {};                                                               // 30
                                                                                                                       // 31
  // On the server, the connection this method call came in on.                                                        // 32
  this.connection = options.connection;                                                                                // 33
};                                                                                                                     // 34
                                                                                                                       // 35
_.extend(MethodInvocation.prototype, {                                                                                 // 36
  unblock: function () {                                                                                               // 37
    var self = this;                                                                                                   // 38
    self._calledUnblock = true;                                                                                        // 39
    self._unblock();                                                                                                   // 40
  },                                                                                                                   // 41
  setUserId: function(userId) {                                                                                        // 42
    var self = this;                                                                                                   // 43
    if (self._calledUnblock)                                                                                           // 44
      throw new Error("Can't call setUserId in a method after calling unblock");                                       // 45
    self.userId = userId;                                                                                              // 46
    self._setUserId(userId);                                                                                           // 47
  }                                                                                                                    // 48
});                                                                                                                    // 49
                                                                                                                       // 50
parseDDP = function (stringMessage) {                                                                                  // 51
  try {                                                                                                                // 52
    var msg = JSON.parse(stringMessage);                                                                               // 53
  } catch (e) {                                                                                                        // 54
    Meteor._debug("Discarding message with invalid JSON", stringMessage);                                              // 55
    return null;                                                                                                       // 56
  }                                                                                                                    // 57
  // DDP messages must be objects.                                                                                     // 58
  if (msg === null || typeof msg !== 'object') {                                                                       // 59
    Meteor._debug("Discarding non-object DDP message", stringMessage);                                                 // 60
    return null;                                                                                                       // 61
  }                                                                                                                    // 62
                                                                                                                       // 63
  // massage msg to get it into "abstract ddp" rather than "wire ddp" format.                                          // 64
                                                                                                                       // 65
  // switch between "cleared" rep of unsetting fields and "undefined"                                                  // 66
  // rep of same                                                                                                       // 67
  if (_.has(msg, 'cleared')) {                                                                                         // 68
    if (!_.has(msg, 'fields'))                                                                                         // 69
      msg.fields = {};                                                                                                 // 70
    _.each(msg.cleared, function (clearKey) {                                                                          // 71
      msg.fields[clearKey] = undefined;                                                                                // 72
    });                                                                                                                // 73
    delete msg.cleared;                                                                                                // 74
  }                                                                                                                    // 75
                                                                                                                       // 76
  _.each(['fields', 'params', 'result'], function (field) {                                                            // 77
    if (_.has(msg, field))                                                                                             // 78
      msg[field] = EJSON._adjustTypesFromJSONValue(msg[field]);                                                        // 79
  });                                                                                                                  // 80
                                                                                                                       // 81
  return msg;                                                                                                          // 82
};                                                                                                                     // 83
                                                                                                                       // 84
stringifyDDP = function (msg) {                                                                                        // 85
  var copy = EJSON.clone(msg);                                                                                         // 86
  // swizzle 'changed' messages from 'fields undefined' rep to 'fields                                                 // 87
  // and cleared' rep                                                                                                  // 88
  if (_.has(msg, 'fields')) {                                                                                          // 89
    var cleared = [];                                                                                                  // 90
    _.each(msg.fields, function (value, key) {                                                                         // 91
      if (value === undefined) {                                                                                       // 92
        cleared.push(key);                                                                                             // 93
        delete copy.fields[key];                                                                                       // 94
      }                                                                                                                // 95
    });                                                                                                                // 96
    if (!_.isEmpty(cleared))                                                                                           // 97
      copy.cleared = cleared;                                                                                          // 98
    if (_.isEmpty(copy.fields))                                                                                        // 99
      delete copy.fields;                                                                                              // 100
  }                                                                                                                    // 101
  // adjust types to basic                                                                                             // 102
  _.each(['fields', 'params', 'result'], function (field) {                                                            // 103
    if (_.has(copy, field))                                                                                            // 104
      copy[field] = EJSON._adjustTypesToJSONValue(copy[field]);                                                        // 105
  });                                                                                                                  // 106
  if (msg.id && typeof msg.id !== 'string') {                                                                          // 107
    throw new Error("Message id is not a string");                                                                     // 108
  }                                                                                                                    // 109
  return JSON.stringify(copy);                                                                                         // 110
};                                                                                                                     // 111
                                                                                                                       // 112
// This is private but it's used in a few places. accounts-base uses                                                   // 113
// it to get the current user. accounts-password uses it to stash SRP                                                  // 114
// state in the DDP session. Meteor.setTimeout and friends clear                                                       // 115
// it. We can probably find a better way to factor this.                                                               // 116
DDP._CurrentInvocation = new Meteor.EnvironmentVariable;                                                               // 117
                                                                                                                       // 118
                                                                                                                       // 119
// This is private and a hack. It is used by autoupdate_client. We                                                     // 120
// should refactor. Maybe a separate 'exponential-backoff' package?                                                    // 121
DDP._Retry = Retry;                                                                                                    // 122
                                                                                                                       // 123
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/livedata/livedata_connection.js                                                                            //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
if (Meteor.isServer) {                                                                                                 // 1
  var path = Npm.require('path');                                                                                      // 2
  var Fiber = Npm.require('fibers');                                                                                   // 3
  var Future = Npm.require(path.join('fibers', 'future'));                                                             // 4
}                                                                                                                      // 5
                                                                                                                       // 6
// @param url {String|Object} URL to Meteor app,                                                                       // 7
//   or an object as a test hook (see code)                                                                            // 8
// Options:                                                                                                            // 9
//   reloadWithOutstanding: is it OK to reload if there are outstanding methods?                                       // 10
//   onDDPNegotiationVersionFailure: callback when version negotiation fails.                                          // 11
var Connection = function (url, options) {                                                                             // 12
  var self = this;                                                                                                     // 13
  options = _.extend({                                                                                                 // 14
    onConnected: function () {},                                                                                       // 15
    onDDPVersionNegotiationFailure: function (description) {                                                           // 16
      Meteor._debug(description);                                                                                      // 17
    },                                                                                                                 // 18
    // These options are only for testing.                                                                             // 19
    reloadWithOutstanding: false,                                                                                      // 20
    supportedDDPVersions: SUPPORTED_DDP_VERSIONS,                                                                      // 21
    retry: true                                                                                                        // 22
  }, options);                                                                                                         // 23
                                                                                                                       // 24
  // If set, called when we reconnect, queuing method calls _before_ the                                               // 25
  // existing outstanding ones. This is the only data member that is part of the                                       // 26
  // public API!                                                                                                       // 27
  self.onReconnect = null;                                                                                             // 28
                                                                                                                       // 29
  // as a test hook, allow passing a stream instead of a url.                                                          // 30
  if (typeof url === "object") {                                                                                       // 31
    self._stream = url;                                                                                                // 32
  } else {                                                                                                             // 33
    self._stream = new LivedataTest.ClientStream(url, {                                                                // 34
      retry: options.retry                                                                                             // 35
    });                                                                                                                // 36
  }                                                                                                                    // 37
                                                                                                                       // 38
  self._lastSessionId = null;                                                                                          // 39
  self._versionSuggestion = null;  // The last proposed DDP version.                                                   // 40
  self._version = null;   // The DDP version agreed on by client and server.                                           // 41
  self._stores = {}; // name -> object with methods                                                                    // 42
  self._methodHandlers = {}; // name -> func                                                                           // 43
  self._nextMethodId = 1;                                                                                              // 44
  self._supportedDDPVersions = options.supportedDDPVersions;                                                           // 45
                                                                                                                       // 46
  // Tracks methods which the user has tried to call but which have not yet                                            // 47
  // called their user callback (ie, they are waiting on their result or for all                                       // 48
  // of their writes to be written to the local cache). Map from method ID to                                          // 49
  // MethodInvoker object.                                                                                             // 50
  self._methodInvokers = {};                                                                                           // 51
                                                                                                                       // 52
  // Tracks methods which the user has called but whose result messages have not                                       // 53
  // arrived yet.                                                                                                      // 54
  //                                                                                                                   // 55
  // _outstandingMethodBlocks is an array of blocks of methods. Each block                                             // 56
  // represents a set of methods that can run at the same time. The first block                                        // 57
  // represents the methods which are currently in flight; subsequent blocks                                           // 58
  // must wait for previous blocks to be fully finished before they can be sent                                        // 59
  // to the server.                                                                                                    // 60
  //                                                                                                                   // 61
  // Each block is an object with the following fields:                                                                // 62
  // - methods: a list of MethodInvoker objects                                                                        // 63
  // - wait: a boolean; if true, this block had a single method invoked with                                           // 64
  //         the "wait" option                                                                                         // 65
  //                                                                                                                   // 66
  // There will never be adjacent blocks with wait=false, because the only thing                                       // 67
  // that makes methods need to be serialized is a wait method.                                                        // 68
  //                                                                                                                   // 69
  // Methods are removed from the first block when their "result" is                                                   // 70
  // received. The entire first block is only removed when all of the in-flight                                        // 71
  // methods have received their results (so the "methods" list is empty) *AND*                                        // 72
  // all of the data written by those methods are visible in the local cache. So                                       // 73
  // it is possible for the first block's methods list to be empty, if we are                                          // 74
  // still waiting for some objects to quiesce.                                                                        // 75
  //                                                                                                                   // 76
  // Example:                                                                                                          // 77
  //  _outstandingMethodBlocks = [                                                                                     // 78
  //    {wait: false, methods: []},                                                                                    // 79
  //    {wait: true, methods: [<MethodInvoker for 'login'>]},                                                          // 80
  //    {wait: false, methods: [<MethodInvoker for 'foo'>,                                                             // 81
  //                            <MethodInvoker for 'bar'>]}]                                                           // 82
  // This means that there were some methods which were sent to the server and                                         // 83
  // which have returned their results, but some of the data written by                                                // 84
  // the methods may not be visible in the local cache. Once all that data is                                          // 85
  // visible, we will send a 'login' method. Once the login method has returned                                        // 86
  // and all the data is visible (including re-running subs if userId changes),                                        // 87
  // we will send the 'foo' and 'bar' methods in parallel.                                                             // 88
  self._outstandingMethodBlocks = [];                                                                                  // 89
                                                                                                                       // 90
  // method ID -> array of objects with keys 'collection' and 'id', listing                                            // 91
  // documents written by a given method's stub. keys are associated with                                              // 92
  // methods whose stub wrote at least one document, and whose data-done message                                       // 93
  // has not yet been received.                                                                                        // 94
  self._documentsWrittenByStub = {};                                                                                   // 95
  // collection -> id -> "server document" object. A "server document" has:                                            // 96
  // - "document": the version of the document according the                                                           // 97
  //   server (ie, the snapshot before a stub wrote it, amended by any changes                                         // 98
  //   received from the server)                                                                                       // 99
  //   It is undefined if we think the document does not exist                                                         // 100
  // - "writtenByStubs": a set of method IDs whose stubs wrote to the document                                         // 101
  //   whose "data done" messages have not yet been processed                                                          // 102
  self._serverDocuments = {};                                                                                          // 103
                                                                                                                       // 104
  // Array of callbacks to be called after the next update of the local                                                // 105
  // cache. Used for:                                                                                                  // 106
  //  - Calling methodInvoker.dataVisible and sub ready callbacks after                                                // 107
  //    the relevant data is flushed.                                                                                  // 108
  //  - Invoking the callbacks of "half-finished" methods after reconnect                                              // 109
  //    quiescence. Specifically, methods whose result was received over the old                                       // 110
  //    connection (so we don't re-send it) but whose data had not been made                                           // 111
  //    visible.                                                                                                       // 112
  self._afterUpdateCallbacks = [];                                                                                     // 113
                                                                                                                       // 114
  // In two contexts, we buffer all incoming data messages and then process them                                       // 115
  // all at once in a single update:                                                                                   // 116
  //   - During reconnect, we buffer all data messages until all subs that had                                         // 117
  //     been ready before reconnect are ready again, and all methods that are                                         // 118
  //     active have returned their "data done message"; then                                                          // 119
  //   - During the execution of a "wait" method, we buffer all data messages                                          // 120
  //     until the wait method gets its "data done" message. (If the wait method                                       // 121
  //     occurs during reconnect, it doesn't get any special handling.)                                                // 122
  // all data messages are processed in one update.                                                                    // 123
  //                                                                                                                   // 124
  // The following fields are used for this "quiescence" process.                                                      // 125
                                                                                                                       // 126
  // This buffers the messages that aren't being processed yet.                                                        // 127
  self._messagesBufferedUntilQuiescence = [];                                                                          // 128
  // Map from method ID -> true. Methods are removed from this when their                                              // 129
  // "data done" message is received, and we will not quiesce until it is                                              // 130
  // empty.                                                                                                            // 131
  self._methodsBlockingQuiescence = {};                                                                                // 132
  // map from sub ID -> true for subs that were ready (ie, called the sub                                              // 133
  // ready callback) before reconnect but haven't become ready again yet                                               // 134
  self._subsBeingRevived = {}; // map from sub._id -> true                                                             // 135
  // if true, the next data update should reset all stores. (set during                                                // 136
  // reconnect.)                                                                                                       // 137
  self._resetStores = false;                                                                                           // 138
                                                                                                                       // 139
  // name -> array of updates for (yet to be created) collections                                                      // 140
  self._updatesForUnknownStores = {};                                                                                  // 141
  // if we're blocking a migration, the retry func                                                                     // 142
  self._retryMigrate = null;                                                                                           // 143
                                                                                                                       // 144
  // metadata for subscriptions.  Map from sub ID to object with keys:                                                 // 145
  //   - id                                                                                                            // 146
  //   - name                                                                                                          // 147
  //   - params                                                                                                        // 148
  //   - inactive (if true, will be cleaned up if not reused in re-run)                                                // 149
  //   - ready (has the 'ready' message been received?)                                                                // 150
  //   - readyCallback (an optional callback to call when ready)                                                       // 151
  //   - errorCallback (an optional callback to call if the sub terminates with                                        // 152
  //                    an error)                                                                                      // 153
  self._subscriptions = {};                                                                                            // 154
                                                                                                                       // 155
  // Reactive userId.                                                                                                  // 156
  self._userId = null;                                                                                                 // 157
  self._userIdDeps = (typeof Deps !== "undefined") && new Deps.Dependency;                                             // 158
                                                                                                                       // 159
  // Block auto-reload while we're waiting for method responses.                                                       // 160
  if (Meteor.isClient && Package.reload && !options.reloadWithOutstanding) {                                           // 161
    Package.reload.Reload._onMigrate(function (retry) {                                                                // 162
      if (!self._readyToMigrate()) {                                                                                   // 163
        if (self._retryMigrate)                                                                                        // 164
          throw new Error("Two migrations in progress?");                                                              // 165
        self._retryMigrate = retry;                                                                                    // 166
        return false;                                                                                                  // 167
      } else {                                                                                                         // 168
        return [true];                                                                                                 // 169
      }                                                                                                                // 170
    });                                                                                                                // 171
  }                                                                                                                    // 172
                                                                                                                       // 173
  var onMessage = function (raw_msg) {                                                                                 // 174
    try {                                                                                                              // 175
      var msg = parseDDP(raw_msg);                                                                                     // 176
    } catch (e) {                                                                                                      // 177
      Meteor._debug("Exception while parsing DDP", e);                                                                 // 178
      return;                                                                                                          // 179
    }                                                                                                                  // 180
                                                                                                                       // 181
    if (msg === null || !msg.msg) {                                                                                    // 182
      // XXX COMPAT WITH 0.6.6. ignore the old welcome message for back                                                // 183
      // compat.  Remove this 'if' once the server stops sending welcome                                               // 184
      // messages (stream_server.js).                                                                                  // 185
      if (! (msg && msg.server_id))                                                                                    // 186
        Meteor._debug("discarding invalid livedata message", msg);                                                     // 187
      return;                                                                                                          // 188
    }                                                                                                                  // 189
                                                                                                                       // 190
    if (msg.msg === 'connected') {                                                                                     // 191
      self._version = self._versionSuggestion;                                                                         // 192
      options.onConnected();                                                                                           // 193
      self._livedata_connected(msg);                                                                                   // 194
    }                                                                                                                  // 195
    else if (msg.msg == 'failed') {                                                                                    // 196
      if (_.contains(self._supportedDDPVersions, msg.version)) {                                                       // 197
        self._versionSuggestion = msg.version;                                                                         // 198
        self._stream.reconnect({_force: true});                                                                        // 199
      } else {                                                                                                         // 200
        var description =                                                                                              // 201
              "DDP version negotiation failed; server requested version " + msg.version;                               // 202
        self._stream.disconnect({_permanent: true, _error: description});                                              // 203
        options.onDDPVersionNegotiationFailure(description);                                                           // 204
      }                                                                                                                // 205
    }                                                                                                                  // 206
    else if (_.include(['added', 'changed', 'removed', 'ready', 'updated'], msg.msg))                                  // 207
      self._livedata_data(msg);                                                                                        // 208
    else if (msg.msg === 'nosub')                                                                                      // 209
      self._livedata_nosub(msg);                                                                                       // 210
    else if (msg.msg === 'result')                                                                                     // 211
      self._livedata_result(msg);                                                                                      // 212
    else if (msg.msg === 'error')                                                                                      // 213
      self._livedata_error(msg);                                                                                       // 214
    else                                                                                                               // 215
      Meteor._debug("discarding unknown livedata message type", msg);                                                  // 216
  };                                                                                                                   // 217
                                                                                                                       // 218
  var onReset = function () {                                                                                          // 219
    // Send a connect message at the beginning of the stream.                                                          // 220
    // NOTE: reset is called even on the first connection, so this is                                                  // 221
    // the only place we send this message.                                                                            // 222
    var msg = {msg: 'connect'};                                                                                        // 223
    if (self._lastSessionId)                                                                                           // 224
      msg.session = self._lastSessionId;                                                                               // 225
    msg.version = self._versionSuggestion || self._supportedDDPVersions[0];                                            // 226
    self._versionSuggestion = msg.version;                                                                             // 227
    msg.support = self._supportedDDPVersions;                                                                          // 228
    self._send(msg);                                                                                                   // 229
                                                                                                                       // 230
    // Now, to minimize setup latency, go ahead and blast out all of                                                   // 231
    // our pending methods ands subscriptions before we've even taken                                                  // 232
    // the necessary RTT to know if we successfully reconnected. (1)                                                   // 233
    // They're supposed to be idempotent; (2) even if we did                                                           // 234
    // reconnect, we're not sure what messages might have gotten lost                                                  // 235
    // (in either direction) since we were disconnected (TCP being                                                     // 236
    // sloppy about that.)                                                                                             // 237
                                                                                                                       // 238
    // If the current block of methods all got their results (but didn't all get                                       // 239
    // their data visible), discard the empty block now.                                                               // 240
    if (! _.isEmpty(self._outstandingMethodBlocks) &&                                                                  // 241
        _.isEmpty(self._outstandingMethodBlocks[0].methods)) {                                                         // 242
      self._outstandingMethodBlocks.shift();                                                                           // 243
    }                                                                                                                  // 244
                                                                                                                       // 245
    // Mark all messages as unsent, they have not yet been sent on this                                                // 246
    // connection.                                                                                                     // 247
    _.each(self._methodInvokers, function (m) {                                                                        // 248
      m.sentMessage = false;                                                                                           // 249
    });                                                                                                                // 250
                                                                                                                       // 251
    // If an `onReconnect` handler is set, call it first. Go through                                                   // 252
    // some hoops to ensure that methods that are called from within                                                   // 253
    // `onReconnect` get executed _before_ ones that were originally                                                   // 254
    // outstanding (since `onReconnect` is used to re-establish auth                                                   // 255
    // certificates)                                                                                                   // 256
    if (self.onReconnect)                                                                                              // 257
      self._callOnReconnectAndSendAppropriateOutstandingMethods();                                                     // 258
    else                                                                                                               // 259
      self._sendOutstandingMethods();                                                                                  // 260
                                                                                                                       // 261
    // add new subscriptions at the end. this way they take effect after                                               // 262
    // the handlers and we don't see flicker.                                                                          // 263
    _.each(self._subscriptions, function (sub, id) {                                                                   // 264
      self._send({                                                                                                     // 265
        msg: 'sub',                                                                                                    // 266
        id: id,                                                                                                        // 267
        name: sub.name,                                                                                                // 268
        params: sub.params                                                                                             // 269
      });                                                                                                              // 270
    });                                                                                                                // 271
  };                                                                                                                   // 272
                                                                                                                       // 273
  if (Meteor.isServer) {                                                                                               // 274
    self._stream.on('message', Meteor.bindEnvironment(onMessage, Meteor._debug));                                      // 275
    self._stream.on('reset', Meteor.bindEnvironment(onReset, Meteor._debug));                                          // 276
  } else {                                                                                                             // 277
    self._stream.on('message', onMessage);                                                                             // 278
    self._stream.on('reset', onReset);                                                                                 // 279
  }                                                                                                                    // 280
};                                                                                                                     // 281
                                                                                                                       // 282
// A MethodInvoker manages sending a method to the server and calling the user's                                       // 283
// callbacks. On construction, it registers itself in the connection's                                                 // 284
// _methodInvokers map; it removes itself once the method is fully finished and                                        // 285
// the callback is invoked. This occurs when it has both received a result,                                            // 286
// and the data written by it is fully visible.                                                                        // 287
var MethodInvoker = function (options) {                                                                               // 288
  var self = this;                                                                                                     // 289
                                                                                                                       // 290
  // Public (within this file) fields.                                                                                 // 291
  self.methodId = options.methodId;                                                                                    // 292
  self.sentMessage = false;                                                                                            // 293
                                                                                                                       // 294
  self._callback = options.callback;                                                                                   // 295
  self._connection = options.connection;                                                                               // 296
  self._message = options.message;                                                                                     // 297
  self._onResultReceived = options.onResultReceived || function () {};                                                 // 298
  self._wait = options.wait;                                                                                           // 299
  self._methodResult = null;                                                                                           // 300
  self._dataVisible = false;                                                                                           // 301
                                                                                                                       // 302
  // Register with the connection.                                                                                     // 303
  self._connection._methodInvokers[self.methodId] = self;                                                              // 304
};                                                                                                                     // 305
_.extend(MethodInvoker.prototype, {                                                                                    // 306
  // Sends the method message to the server. May be called additional times if                                         // 307
  // we lose the connection and reconnect before receiving a result.                                                   // 308
  sendMessage: function () {                                                                                           // 309
    var self = this;                                                                                                   // 310
    // This function is called before sending a method (including resending on                                         // 311
    // reconnect). We should only (re)send methods where we don't already have a                                       // 312
    // result!                                                                                                         // 313
    if (self.gotResult())                                                                                              // 314
      throw new Error("sendingMethod is called on method with result");                                                // 315
                                                                                                                       // 316
    // If we're re-sending it, it doesn't matter if data was written the first                                         // 317
    // time.                                                                                                           // 318
    self._dataVisible = false;                                                                                         // 319
                                                                                                                       // 320
    self.sentMessage = true;                                                                                           // 321
                                                                                                                       // 322
    // If this is a wait method, make all data messages be buffered until it is                                        // 323
    // done.                                                                                                           // 324
    if (self._wait)                                                                                                    // 325
      self._connection._methodsBlockingQuiescence[self.methodId] = true;                                               // 326
                                                                                                                       // 327
    // Actually send the message.                                                                                      // 328
    self._connection._send(self._message);                                                                             // 329
  },                                                                                                                   // 330
  // Invoke the callback, if we have both a result and know that all data has                                          // 331
  // been written to the local cache.                                                                                  // 332
  _maybeInvokeCallback: function () {                                                                                  // 333
    var self = this;                                                                                                   // 334
    if (self._methodResult && self._dataVisible) {                                                                     // 335
      // Call the callback. (This won't throw: the callback was wrapped with                                           // 336
      // bindEnvironment.)                                                                                             // 337
      self._callback(self._methodResult[0], self._methodResult[1]);                                                    // 338
                                                                                                                       // 339
      // Forget about this method.                                                                                     // 340
      delete self._connection._methodInvokers[self.methodId];                                                          // 341
                                                                                                                       // 342
      // Let the connection know that this method is finished, so it can try to                                        // 343
      // move on to the next block of methods.                                                                         // 344
      self._connection._outstandingMethodFinished();                                                                   // 345
    }                                                                                                                  // 346
  },                                                                                                                   // 347
  // Call with the result of the method from the server. Only may be called                                            // 348
  // once; once it is called, you should not call sendMessage again.                                                   // 349
  // If the user provided an onResultReceived callback, call it immediately.                                           // 350
  // Then invoke the main callback if data is also visible.                                                            // 351
  receiveResult: function (err, result) {                                                                              // 352
    var self = this;                                                                                                   // 353
    if (self.gotResult())                                                                                              // 354
      throw new Error("Methods should only receive results once");                                                     // 355
    self._methodResult = [err, result];                                                                                // 356
    self._onResultReceived(err, result);                                                                               // 357
    self._maybeInvokeCallback();                                                                                       // 358
  },                                                                                                                   // 359
  // Call this when all data written by the method is visible. This means that                                         // 360
  // the method has returns its "data is done" message *AND* all server                                                // 361
  // documents that are buffered at that time have been written to the local                                           // 362
  // cache. Invokes the main callback if the result has been received.                                                 // 363
  dataVisible: function () {                                                                                           // 364
    var self = this;                                                                                                   // 365
    self._dataVisible = true;                                                                                          // 366
    self._maybeInvokeCallback();                                                                                       // 367
  },                                                                                                                   // 368
  // True if receiveResult has been called.                                                                            // 369
  gotResult: function () {                                                                                             // 370
    var self = this;                                                                                                   // 371
    return !!self._methodResult;                                                                                       // 372
  }                                                                                                                    // 373
});                                                                                                                    // 374
                                                                                                                       // 375
_.extend(Connection.prototype, {                                                                                       // 376
  // 'name' is the name of the data on the wire that should go in the                                                  // 377
  // store. 'wrappedStore' should be an object with methods beginUpdate, update,                                       // 378
  // endUpdate, saveOriginals, retrieveOriginals. see Collection for an example.                                       // 379
  registerStore: function (name, wrappedStore) {                                                                       // 380
    var self = this;                                                                                                   // 381
                                                                                                                       // 382
    if (name in self._stores)                                                                                          // 383
      return false;                                                                                                    // 384
                                                                                                                       // 385
    // Wrap the input object in an object which makes any store method not                                             // 386
    // implemented by 'store' into a no-op.                                                                            // 387
    var store = {};                                                                                                    // 388
    _.each(['update', 'beginUpdate', 'endUpdate', 'saveOriginals',                                                     // 389
            'retrieveOriginals'], function (method) {                                                                  // 390
              store[method] = function () {                                                                            // 391
                return (wrappedStore[method]                                                                           // 392
                        ? wrappedStore[method].apply(wrappedStore, arguments)                                          // 393
                        : undefined);                                                                                  // 394
              };                                                                                                       // 395
            });                                                                                                        // 396
                                                                                                                       // 397
    self._stores[name] = store;                                                                                        // 398
                                                                                                                       // 399
    var queued = self._updatesForUnknownStores[name];                                                                  // 400
    if (queued) {                                                                                                      // 401
      store.beginUpdate(queued.length, false);                                                                         // 402
      _.each(queued, function (msg) {                                                                                  // 403
        store.update(msg);                                                                                             // 404
      });                                                                                                              // 405
      store.endUpdate();                                                                                               // 406
      delete self._updatesForUnknownStores[name];                                                                      // 407
    }                                                                                                                  // 408
                                                                                                                       // 409
    return true;                                                                                                       // 410
  },                                                                                                                   // 411
                                                                                                                       // 412
  subscribe: function (name /* .. [arguments] .. (callback|callbacks) */) {                                            // 413
    var self = this;                                                                                                   // 414
                                                                                                                       // 415
    var params = Array.prototype.slice.call(arguments, 1);                                                             // 416
    var callbacks = {};                                                                                                // 417
    if (params.length) {                                                                                               // 418
      var lastParam = params[params.length - 1];                                                                       // 419
      if (typeof lastParam === "function") {                                                                           // 420
        callbacks.onReady = params.pop();                                                                              // 421
      } else if (lastParam && (typeof lastParam.onReady === "function" ||                                              // 422
                               typeof lastParam.onError === "function")) {                                             // 423
        callbacks = params.pop();                                                                                      // 424
      }                                                                                                                // 425
    }                                                                                                                  // 426
                                                                                                                       // 427
    // Is there an existing sub with the same name and param, run in an                                                // 428
    // invalidated Computation? This will happen if we are rerunning an                                                // 429
    // existing computation.                                                                                           // 430
    //                                                                                                                 // 431
    // For example, consider a rerun of:                                                                               // 432
    //                                                                                                                 // 433
    //     Deps.autorun(function () {                                                                                  // 434
    //       Meteor.subscribe("foo", Session.get("foo"));                                                              // 435
    //       Meteor.subscribe("bar", Session.get("bar"));                                                              // 436
    //     });                                                                                                         // 437
    //                                                                                                                 // 438
    // If "foo" has changed but "bar" has not, we will match the "bar"                                                 // 439
    // subcribe to an existing inactive subscription in order to not                                                   // 440
    // unsub and resub the subscription unnecessarily.                                                                 // 441
    //                                                                                                                 // 442
    // We only look for one such sub; if there are N apparently-identical subs                                         // 443
    // being invalidated, we will require N matching subscribe calls to keep                                           // 444
    // them all active.                                                                                                // 445
    var existing = _.find(self._subscriptions, function (sub) {                                                        // 446
      return sub.inactive && sub.name === name &&                                                                      // 447
        EJSON.equals(sub.params, params);                                                                              // 448
    });                                                                                                                // 449
                                                                                                                       // 450
    var id;                                                                                                            // 451
    if (existing) {                                                                                                    // 452
      id = existing.id;                                                                                                // 453
      existing.inactive = false; // reactivate                                                                         // 454
                                                                                                                       // 455
      if (callbacks.onReady) {                                                                                         // 456
        // If the sub is not already ready, replace any ready callback with the                                        // 457
        // one provided now. (It's not really clear what users would expect for                                        // 458
        // an onReady callback inside an autorun; the semantics we provide is                                          // 459
        // that at the time the sub first becomes ready, we call the last                                              // 460
        // onReady callback provided, if any.)                                                                         // 461
        if (!existing.ready)                                                                                           // 462
          existing.readyCallback = callbacks.onReady;                                                                  // 463
      }                                                                                                                // 464
      if (callbacks.onError) {                                                                                         // 465
        // Replace existing callback if any, so that errors aren't                                                     // 466
        // double-reported.                                                                                            // 467
        existing.errorCallback = callbacks.onError;                                                                    // 468
      }                                                                                                                // 469
    } else {                                                                                                           // 470
      // New sub! Generate an id, save it locally, and send message.                                                   // 471
      id = Random.id();                                                                                                // 472
      self._subscriptions[id] = {                                                                                      // 473
        id: id,                                                                                                        // 474
        name: name,                                                                                                    // 475
        params: params,                                                                                                // 476
        inactive: false,                                                                                               // 477
        ready: false,                                                                                                  // 478
        readyDeps: (typeof Deps !== "undefined") && new Deps.Dependency,                                               // 479
        readyCallback: callbacks.onReady,                                                                              // 480
        errorCallback: callbacks.onError                                                                               // 481
      };                                                                                                               // 482
      self._send({msg: 'sub', id: id, name: name, params: params});                                                    // 483
    }                                                                                                                  // 484
                                                                                                                       // 485
    // return a handle to the application.                                                                             // 486
    var handle = {                                                                                                     // 487
      stop: function () {                                                                                              // 488
        if (!_.has(self._subscriptions, id))                                                                           // 489
          return;                                                                                                      // 490
        self._send({msg: 'unsub', id: id});                                                                            // 491
        delete self._subscriptions[id];                                                                                // 492
      },                                                                                                               // 493
      ready: function () {                                                                                             // 494
        // return false if we've unsubscribed.                                                                         // 495
        if (!_.has(self._subscriptions, id))                                                                           // 496
          return false;                                                                                                // 497
        var record = self._subscriptions[id];                                                                          // 498
        record.readyDeps && record.readyDeps.depend();                                                                 // 499
        return record.ready;                                                                                           // 500
      }                                                                                                                // 501
    };                                                                                                                 // 502
                                                                                                                       // 503
    if (Deps.active) {                                                                                                 // 504
      // We're in a reactive computation, so we'd like to unsubscribe when the                                         // 505
      // computation is invalidated... but not if the rerun just re-subscribes                                         // 506
      // to the same subscription!  When a rerun happens, we use onInvalidate                                          // 507
      // as a change to mark the subscription "inactive" so that it can                                                // 508
      // be reused from the rerun.  If it isn't reused, it's killed from                                               // 509
      // an afterFlush.                                                                                                // 510
      Deps.onInvalidate(function (c) {                                                                                 // 511
        if (_.has(self._subscriptions, id))                                                                            // 512
          self._subscriptions[id].inactive = true;                                                                     // 513
                                                                                                                       // 514
        Deps.afterFlush(function () {                                                                                  // 515
          if (_.has(self._subscriptions, id) &&                                                                        // 516
              self._subscriptions[id].inactive)                                                                        // 517
            handle.stop();                                                                                             // 518
        });                                                                                                            // 519
      });                                                                                                              // 520
    }                                                                                                                  // 521
                                                                                                                       // 522
    return handle;                                                                                                     // 523
  },                                                                                                                   // 524
                                                                                                                       // 525
  // options:                                                                                                          // 526
  // - onLateError {Function(error)} called if an error was received after the ready event.                            // 527
  //     (errors received before ready cause an error to be thrown)                                                    // 528
  _subscribeAndWait: function (name, args, options) {                                                                  // 529
    var self = this;                                                                                                   // 530
    var f = new Future();                                                                                              // 531
    var ready = false;                                                                                                 // 532
    args = args || [];                                                                                                 // 533
    args.push({                                                                                                        // 534
      onReady: function () {                                                                                           // 535
        ready = true;                                                                                                  // 536
        f['return']();                                                                                                 // 537
      },                                                                                                               // 538
      onError: function (e) {                                                                                          // 539
        if (!ready)                                                                                                    // 540
          f['throw'](e);                                                                                               // 541
        else                                                                                                           // 542
          options && options.onLateError && options.onLateError(e);                                                    // 543
      }                                                                                                                // 544
    });                                                                                                                // 545
                                                                                                                       // 546
    self.subscribe.apply(self, [name].concat(args));                                                                   // 547
    f.wait();                                                                                                          // 548
  },                                                                                                                   // 549
                                                                                                                       // 550
  methods: function (methods) {                                                                                        // 551
    var self = this;                                                                                                   // 552
    _.each(methods, function (func, name) {                                                                            // 553
      if (self._methodHandlers[name])                                                                                  // 554
        throw new Error("A method named '" + name + "' is already defined");                                           // 555
      self._methodHandlers[name] = func;                                                                               // 556
    });                                                                                                                // 557
  },                                                                                                                   // 558
                                                                                                                       // 559
  call: function (name /* .. [arguments] .. callback */) {                                                             // 560
    // if it's a function, the last argument is the result callback,                                                   // 561
    // not a parameter to the remote method.                                                                           // 562
    var args = Array.prototype.slice.call(arguments, 1);                                                               // 563
    if (args.length && typeof args[args.length - 1] === "function")                                                    // 564
      var callback = args.pop();                                                                                       // 565
    return this.apply(name, args, callback);                                                                           // 566
  },                                                                                                                   // 567
                                                                                                                       // 568
  // @param options {Optional Object}                                                                                  // 569
  //   wait: Boolean - Should we wait to call this until all current methods                                           // 570
  //                   are fully finished, and block subsequent method calls                                           // 571
  //                   until this method is fully finished?                                                            // 572
  //                   (does not affect methods called from within this method)                                        // 573
  //   onResultReceived: Function - a callback to call as soon as the method                                           // 574
  //                                result is received. the data written by                                            // 575
  //                                the method may not yet be in the cache!                                            // 576
  // @param callback {Optional Function}                                                                               // 577
  apply: function (name, args, options, callback) {                                                                    // 578
    var self = this;                                                                                                   // 579
                                                                                                                       // 580
    // We were passed 3 arguments. They may be either (name, args, options)                                            // 581
    // or (name, args, callback)                                                                                       // 582
    if (!callback && typeof options === 'function') {                                                                  // 583
      callback = options;                                                                                              // 584
      options = {};                                                                                                    // 585
    }                                                                                                                  // 586
    options = options || {};                                                                                           // 587
                                                                                                                       // 588
    if (callback) {                                                                                                    // 589
      // XXX would it be better form to do the binding in stream.on,                                                   // 590
      // or caller, instead of here?                                                                                   // 591
      // XXX improve error message (and how we report it)                                                              // 592
      callback = Meteor.bindEnvironment(                                                                               // 593
        callback,                                                                                                      // 594
        "delivering result of invoking '" + name + "'"                                                                 // 595
      );                                                                                                               // 596
    }                                                                                                                  // 597
                                                                                                                       // 598
    // Lazily allocate method ID once we know that it'll be needed.                                                    // 599
    var methodId = (function () {                                                                                      // 600
      var id;                                                                                                          // 601
      return function () {                                                                                             // 602
        if (id === undefined)                                                                                          // 603
          id = '' + (self._nextMethodId++);                                                                            // 604
        return id;                                                                                                     // 605
      };                                                                                                               // 606
    })();                                                                                                              // 607
                                                                                                                       // 608
    // Run the stub, if we have one. The stub is supposed to make some                                                 // 609
    // temporary writes to the database to give the user a smooth experience                                           // 610
    // until the actual result of executing the method comes back from the                                             // 611
    // server (whereupon the temporary writes to the database will be reversed                                         // 612
    // during the beginUpdate/endUpdate process.)                                                                      // 613
    //                                                                                                                 // 614
    // Normally, we ignore the return value of the stub (even if it is an                                              // 615
    // exception), in favor of the real return value from the server. The                                              // 616
    // exception is if the *caller* is a stub. In that case, we're not going                                           // 617
    // to do a RPC, so we use the return value of the stub as our return                                               // 618
    // value.                                                                                                          // 619
                                                                                                                       // 620
    var enclosing = DDP._CurrentInvocation.get();                                                                      // 621
    var alreadyInSimulation = enclosing && enclosing.isSimulation;                                                     // 622
                                                                                                                       // 623
    var stub = self._methodHandlers[name];                                                                             // 624
    if (stub) {                                                                                                        // 625
      var setUserId = function(userId) {                                                                               // 626
        self.setUserId(userId);                                                                                        // 627
      };                                                                                                               // 628
      var invocation = new MethodInvocation({                                                                          // 629
        isSimulation: true,                                                                                            // 630
        userId: self.userId(),                                                                                         // 631
        setUserId: setUserId                                                                                           // 632
      });                                                                                                              // 633
                                                                                                                       // 634
      if (!alreadyInSimulation)                                                                                        // 635
        self._saveOriginals();                                                                                         // 636
                                                                                                                       // 637
      try {                                                                                                            // 638
        // Note that unlike in the corresponding server code, we never audit                                           // 639
        // that stubs check() their arguments.                                                                         // 640
        var ret = DDP._CurrentInvocation.withValue(invocation, function () {                                           // 641
          if (Meteor.isServer) {                                                                                       // 642
            // Because saveOriginals and retrieveOriginals aren't reentrant,                                           // 643
            // don't allow stubs to yield.                                                                             // 644
            return Meteor._noYieldsAllowed(function () {                                                               // 645
              return stub.apply(invocation, EJSON.clone(args));                                                        // 646
            });                                                                                                        // 647
          } else {                                                                                                     // 648
            return stub.apply(invocation, EJSON.clone(args));                                                          // 649
          }                                                                                                            // 650
        });                                                                                                            // 651
      }                                                                                                                // 652
      catch (e) {                                                                                                      // 653
        var exception = e;                                                                                             // 654
      }                                                                                                                // 655
                                                                                                                       // 656
      if (!alreadyInSimulation)                                                                                        // 657
        self._retrieveAndStoreOriginals(methodId());                                                                   // 658
    }                                                                                                                  // 659
                                                                                                                       // 660
    // If we're in a simulation, stop and return the result we have,                                                   // 661
    // rather than going on to do an RPC. If there was no stub,                                                        // 662
    // we'll end up returning undefined.                                                                               // 663
    if (alreadyInSimulation) {                                                                                         // 664
      if (callback) {                                                                                                  // 665
        callback(exception, ret);                                                                                      // 666
        return undefined;                                                                                              // 667
      }                                                                                                                // 668
      if (exception)                                                                                                   // 669
        throw exception;                                                                                               // 670
      return ret;                                                                                                      // 671
    }                                                                                                                  // 672
                                                                                                                       // 673
    // If an exception occurred in a stub, and we're ignoring it                                                       // 674
    // because we're doing an RPC and want to use what the server                                                      // 675
    // returns instead, log it so the developer knows.                                                                 // 676
    //                                                                                                                 // 677
    // Tests can set the 'expected' flag on an exception so it won't                                                   // 678
    // go to log.                                                                                                      // 679
    if (exception && !exception.expected) {                                                                            // 680
      Meteor._debug("Exception while simulating the effect of invoking '" +                                            // 681
                    name + "'", exception, exception.stack);                                                           // 682
    }                                                                                                                  // 683
                                                                                                                       // 684
                                                                                                                       // 685
    // At this point we're definitely doing an RPC, and we're going to                                                 // 686
    // return the value of the RPC to the caller.                                                                      // 687
                                                                                                                       // 688
    // If the caller didn't give a callback, decide what to do.                                                        // 689
    if (!callback) {                                                                                                   // 690
      if (Meteor.isClient) {                                                                                           // 691
        // On the client, we don't have fibers, so we can't block. The                                                 // 692
        // only thing we can do is to return undefined and discard the                                                 // 693
        // result of the RPC.                                                                                          // 694
        callback = function () {};                                                                                     // 695
      } else {                                                                                                         // 696
        // On the server, make the function synchronous. Throw on                                                      // 697
        // errors, return on success.                                                                                  // 698
        var future = new Future;                                                                                       // 699
        callback = future.resolver();                                                                                  // 700
      }                                                                                                                // 701
    }                                                                                                                  // 702
    // Send the RPC. Note that on the client, it is important that the                                                 // 703
    // stub have finished before we send the RPC, so that we know we have                                              // 704
    // a complete list of which local documents the stub wrote.                                                        // 705
    var methodInvoker = new MethodInvoker({                                                                            // 706
      methodId: methodId(),                                                                                            // 707
      callback: callback,                                                                                              // 708
      connection: self,                                                                                                // 709
      onResultReceived: options.onResultReceived,                                                                      // 710
      wait: !!options.wait,                                                                                            // 711
      message: {                                                                                                       // 712
        msg: 'method',                                                                                                 // 713
        method: name,                                                                                                  // 714
        params: args,                                                                                                  // 715
        id: methodId()                                                                                                 // 716
      }                                                                                                                // 717
    });                                                                                                                // 718
                                                                                                                       // 719
    if (options.wait) {                                                                                                // 720
      // It's a wait method! Wait methods go in their own block.                                                       // 721
      self._outstandingMethodBlocks.push(                                                                              // 722
        {wait: true, methods: [methodInvoker]});                                                                       // 723
    } else {                                                                                                           // 724
      // Not a wait method. Start a new block if the previous block was a wait                                         // 725
      // block, and add it to the last block of methods.                                                               // 726
      if (_.isEmpty(self._outstandingMethodBlocks) ||                                                                  // 727
          _.last(self._outstandingMethodBlocks).wait)                                                                  // 728
        self._outstandingMethodBlocks.push({wait: false, methods: []});                                                // 729
      _.last(self._outstandingMethodBlocks).methods.push(methodInvoker);                                               // 730
    }                                                                                                                  // 731
                                                                                                                       // 732
    // If we added it to the first block, send it out now.                                                             // 733
    if (self._outstandingMethodBlocks.length === 1)                                                                    // 734
      methodInvoker.sendMessage();                                                                                     // 735
                                                                                                                       // 736
    // If we're using the default callback on the server,                                                              // 737
    // block waiting for the result.                                                                                   // 738
    if (future) {                                                                                                      // 739
      return future.wait();                                                                                            // 740
    }                                                                                                                  // 741
    return undefined;                                                                                                  // 742
  },                                                                                                                   // 743
                                                                                                                       // 744
  // Before calling a method stub, prepare all stores to track changes and allow                                       // 745
  // _retrieveAndStoreOriginals to get the original versions of changed                                                // 746
  // documents.                                                                                                        // 747
  _saveOriginals: function () {                                                                                        // 748
    var self = this;                                                                                                   // 749
    _.each(self._stores, function (s) {                                                                                // 750
      s.saveOriginals();                                                                                               // 751
    });                                                                                                                // 752
  },                                                                                                                   // 753
  // Retrieves the original versions of all documents modified by the stub for                                         // 754
  // method 'methodId' from all stores and saves them to _serverDocuments (keyed                                       // 755
  // by document) and _documentsWrittenByStub (keyed by method ID).                                                    // 756
  _retrieveAndStoreOriginals: function (methodId) {                                                                    // 757
    var self = this;                                                                                                   // 758
    if (self._documentsWrittenByStub[methodId])                                                                        // 759
      throw new Error("Duplicate methodId in _retrieveAndStoreOriginals");                                             // 760
                                                                                                                       // 761
    var docsWritten = [];                                                                                              // 762
    _.each(self._stores, function (s, collection) {                                                                    // 763
      var originals = s.retrieveOriginals();                                                                           // 764
      _.each(originals, function (doc, id) {                                                                           // 765
        if (typeof id !== 'string')                                                                                    // 766
          throw new Error("id is not a string");                                                                       // 767
        docsWritten.push({collection: collection, id: id});                                                            // 768
        var serverDoc = Meteor._ensure(self._serverDocuments, collection, id);                                         // 769
        if (serverDoc.writtenByStubs) {                                                                                // 770
          // We're not the first stub to write this doc. Just add our method ID                                        // 771
          // to the record.                                                                                            // 772
          serverDoc.writtenByStubs[methodId] = true;                                                                   // 773
        } else {                                                                                                       // 774
          // First stub! Save the original value and our method ID.                                                    // 775
          serverDoc.document = doc;                                                                                    // 776
          serverDoc.flushCallbacks = [];                                                                               // 777
          serverDoc.writtenByStubs = {};                                                                               // 778
          serverDoc.writtenByStubs[methodId] = true;                                                                   // 779
        }                                                                                                              // 780
      });                                                                                                              // 781
    });                                                                                                                // 782
    if (!_.isEmpty(docsWritten)) {                                                                                     // 783
      self._documentsWrittenByStub[methodId] = docsWritten;                                                            // 784
    }                                                                                                                  // 785
  },                                                                                                                   // 786
                                                                                                                       // 787
  // This is very much a private function we use to make the tests                                                     // 788
  // take up fewer server resources after they complete.                                                               // 789
  _unsubscribeAll: function () {                                                                                       // 790
    var self = this;                                                                                                   // 791
    _.each(_.clone(self._subscriptions), function (sub, id) {                                                          // 792
      // Avoid killing the autoupdate subscription so that developers                                                  // 793
      // still get hot code pushes when writing tests.                                                                 // 794
      //                                                                                                               // 795
      // XXX it's a hack to encode knowledge about autoupdate here,                                                    // 796
      // but it doesn't seem worth it yet to have a special API for                                                    // 797
      // subscriptions to preserve after unit tests.                                                                   // 798
      if (sub.name !== 'meteor_autoupdate_clientVersions') {                                                           // 799
        self._send({msg: 'unsub', id: id});                                                                            // 800
        delete self._subscriptions[id];                                                                                // 801
      }                                                                                                                // 802
    });                                                                                                                // 803
  },                                                                                                                   // 804
                                                                                                                       // 805
  // Sends the DDP stringification of the given message object                                                         // 806
  _send: function (obj) {                                                                                              // 807
    var self = this;                                                                                                   // 808
    self._stream.send(stringifyDDP(obj));                                                                              // 809
  },                                                                                                                   // 810
                                                                                                                       // 811
  status: function (/*passthrough args*/) {                                                                            // 812
    var self = this;                                                                                                   // 813
    return self._stream.status.apply(self._stream, arguments);                                                         // 814
  },                                                                                                                   // 815
                                                                                                                       // 816
  reconnect: function (/*passthrough args*/) {                                                                         // 817
    var self = this;                                                                                                   // 818
    return self._stream.reconnect.apply(self._stream, arguments);                                                      // 819
  },                                                                                                                   // 820
                                                                                                                       // 821
  disconnect: function (/*passthrough args*/) {                                                                        // 822
    var self = this;                                                                                                   // 823
    return self._stream.disconnect.apply(self._stream, arguments);                                                     // 824
  },                                                                                                                   // 825
                                                                                                                       // 826
  close: function () {                                                                                                 // 827
    var self = this;                                                                                                   // 828
    return self._stream.disconnect({_permanent: true});                                                                // 829
  },                                                                                                                   // 830
                                                                                                                       // 831
  ///                                                                                                                  // 832
  /// Reactive user system                                                                                             // 833
  ///                                                                                                                  // 834
  userId: function () {                                                                                                // 835
    var self = this;                                                                                                   // 836
    if (self._userIdDeps)                                                                                              // 837
      self._userIdDeps.depend();                                                                                       // 838
    return self._userId;                                                                                               // 839
  },                                                                                                                   // 840
                                                                                                                       // 841
  setUserId: function (userId) {                                                                                       // 842
    var self = this;                                                                                                   // 843
    // Avoid invalidating dependents if setUserId is called with current value.                                        // 844
    if (self._userId === userId)                                                                                       // 845
      return;                                                                                                          // 846
    self._userId = userId;                                                                                             // 847
    if (self._userIdDeps)                                                                                              // 848
      self._userIdDeps.changed();                                                                                      // 849
  },                                                                                                                   // 850
                                                                                                                       // 851
  // Returns true if we are in a state after reconnect of waiting for subs to be                                       // 852
  // revived or early methods to finish their data, or we are waiting for a                                            // 853
  // "wait" method to finish.                                                                                          // 854
  _waitingForQuiescence: function () {                                                                                 // 855
    var self = this;                                                                                                   // 856
    return (! _.isEmpty(self._subsBeingRevived) ||                                                                     // 857
            ! _.isEmpty(self._methodsBlockingQuiescence));                                                             // 858
  },                                                                                                                   // 859
                                                                                                                       // 860
  // Returns true if any method whose message has been sent to the server has                                          // 861
  // not yet invoked its user callback.                                                                                // 862
  _anyMethodsAreOutstanding: function () {                                                                             // 863
    var self = this;                                                                                                   // 864
    return _.any(_.pluck(self._methodInvokers, 'sentMessage'));                                                        // 865
  },                                                                                                                   // 866
                                                                                                                       // 867
  _livedata_connected: function (msg) {                                                                                // 868
    var self = this;                                                                                                   // 869
                                                                                                                       // 870
    // If this is a reconnect, we'll have to reset all stores.                                                         // 871
    if (self._lastSessionId)                                                                                           // 872
      self._resetStores = true;                                                                                        // 873
                                                                                                                       // 874
    if (typeof (msg.session) === "string") {                                                                           // 875
      var reconnectedToPreviousSession = (self._lastSessionId === msg.session);                                        // 876
      self._lastSessionId = msg.session;                                                                               // 877
    }                                                                                                                  // 878
                                                                                                                       // 879
    if (reconnectedToPreviousSession) {                                                                                // 880
      // Successful reconnection -- pick up where we left off.  Note that right                                        // 881
      // now, this never happens: the server never connects us to a previous                                           // 882
      // session, because DDP doesn't provide enough data for the server to know                                       // 883
      // what messages the client has processed. We need to improve DDP to make                                        // 884
      // this possible, at which point we'll probably need more code here.                                             // 885
      return;                                                                                                          // 886
    }                                                                                                                  // 887
                                                                                                                       // 888
    // Server doesn't have our data any more. Re-sync a new session.                                                   // 889
                                                                                                                       // 890
    // Forget about messages we were buffering for unknown collections. They'll                                        // 891
    // be resent if still relevant.                                                                                    // 892
    self._updatesForUnknownStores = {};                                                                                // 893
                                                                                                                       // 894
    if (self._resetStores) {                                                                                           // 895
      // Forget about the effects of stubs. We'll be resetting all collections                                         // 896
      // anyway.                                                                                                       // 897
      self._documentsWrittenByStub = {};                                                                               // 898
      self._serverDocuments = {};                                                                                      // 899
    }                                                                                                                  // 900
                                                                                                                       // 901
    // Clear _afterUpdateCallbacks.                                                                                    // 902
    self._afterUpdateCallbacks = [];                                                                                   // 903
                                                                                                                       // 904
    // Mark all named subscriptions which are ready (ie, we already called the                                         // 905
    // ready callback) as needing to be revived.                                                                       // 906
    // XXX We should also block reconnect quiescence until unnamed subscriptions                                       // 907
    //     (eg, autopublish) are done re-publishing to avoid flicker!                                                  // 908
    self._subsBeingRevived = {};                                                                                       // 909
    _.each(self._subscriptions, function (sub, id) {                                                                   // 910
      if (sub.ready)                                                                                                   // 911
        self._subsBeingRevived[id] = true;                                                                             // 912
    });                                                                                                                // 913
                                                                                                                       // 914
    // Arrange for "half-finished" methods to have their callbacks run, and                                            // 915
    // track methods that were sent on this connection so that we don't                                                // 916
    // quiesce until they are all done.                                                                                // 917
    //                                                                                                                 // 918
    // Start by clearing _methodsBlockingQuiescence: methods sent before                                               // 919
    // reconnect don't matter, and any "wait" methods sent on the new connection                                       // 920
    // that we drop here will be restored by the loop below.                                                           // 921
    self._methodsBlockingQuiescence = {};                                                                              // 922
    if (self._resetStores) {                                                                                           // 923
      _.each(self._methodInvokers, function (invoker) {                                                                // 924
        if (invoker.gotResult()) {                                                                                     // 925
          // This method already got its result, but it didn't call its callback                                       // 926
          // because its data didn't become visible. We did not resend the                                             // 927
          // method RPC. We'll call its callback when we get a full quiesce,                                           // 928
          // since that's as close as we'll get to "data must be visible".                                             // 929
          self._afterUpdateCallbacks.push(_.bind(invoker.dataVisible, invoker));                                       // 930
        } else if (invoker.sentMessage) {                                                                              // 931
          // This method has been sent on this connection (maybe as a resend                                           // 932
          // from the last connection, maybe from onReconnect, maybe just very                                         // 933
          // quickly before processing the connected message).                                                         // 934
          //                                                                                                           // 935
          // We don't need to do anything special to ensure its callbacks get                                          // 936
          // called, but we'll count it as a method which is preventing                                                // 937
          // reconnect quiescence. (eg, it might be a login method that was run                                        // 938
          // from onReconnect, and we don't want to see flicker by seeing a                                            // 939
          // logged-out state.)                                                                                        // 940
          self._methodsBlockingQuiescence[invoker.methodId] = true;                                                    // 941
        }                                                                                                              // 942
      });                                                                                                              // 943
    }                                                                                                                  // 944
                                                                                                                       // 945
    self._messagesBufferedUntilQuiescence = [];                                                                        // 946
                                                                                                                       // 947
    // If we're not waiting on any methods or subs, we can reset the stores and                                        // 948
    // call the callbacks immediately.                                                                                 // 949
    if (!self._waitingForQuiescence()) {                                                                               // 950
      if (self._resetStores) {                                                                                         // 951
        _.each(self._stores, function (s) {                                                                            // 952
          s.beginUpdate(0, true);                                                                                      // 953
          s.endUpdate();                                                                                               // 954
        });                                                                                                            // 955
        self._resetStores = false;                                                                                     // 956
      }                                                                                                                // 957
      self._runAfterUpdateCallbacks();                                                                                 // 958
    }                                                                                                                  // 959
  },                                                                                                                   // 960
                                                                                                                       // 961
                                                                                                                       // 962
  _processOneDataMessage: function (msg, updates) {                                                                    // 963
    var self = this;                                                                                                   // 964
    // Using underscore here so as not to need to capitalize.                                                          // 965
    self['_process_' + msg.msg](msg, updates);                                                                         // 966
  },                                                                                                                   // 967
                                                                                                                       // 968
                                                                                                                       // 969
  _livedata_data: function (msg) {                                                                                     // 970
    var self = this;                                                                                                   // 971
                                                                                                                       // 972
    // collection name -> array of messages                                                                            // 973
    var updates = {};                                                                                                  // 974
                                                                                                                       // 975
    if (self._waitingForQuiescence()) {                                                                                // 976
      self._messagesBufferedUntilQuiescence.push(msg);                                                                 // 977
                                                                                                                       // 978
      if (msg.msg === "nosub")                                                                                         // 979
        delete self._subsBeingRevived[msg.id];                                                                         // 980
                                                                                                                       // 981
      _.each(msg.subs || [], function (subId) {                                                                        // 982
        delete self._subsBeingRevived[subId];                                                                          // 983
      });                                                                                                              // 984
      _.each(msg.methods || [], function (methodId) {                                                                  // 985
        delete self._methodsBlockingQuiescence[methodId];                                                              // 986
      });                                                                                                              // 987
                                                                                                                       // 988
      if (self._waitingForQuiescence())                                                                                // 989
        return;                                                                                                        // 990
                                                                                                                       // 991
      // No methods or subs are blocking quiescence!                                                                   // 992
      // We'll now process and all of our buffered messages, reset all stores,                                         // 993
      // and apply them all at once.                                                                                   // 994
      _.each(self._messagesBufferedUntilQuiescence, function (bufferedMsg) {                                           // 995
        self._processOneDataMessage(bufferedMsg, updates);                                                             // 996
      });                                                                                                              // 997
      self._messagesBufferedUntilQuiescence = [];                                                                      // 998
    } else {                                                                                                           // 999
      self._processOneDataMessage(msg, updates);                                                                       // 1000
    }                                                                                                                  // 1001
                                                                                                                       // 1002
    if (self._resetStores || !_.isEmpty(updates)) {                                                                    // 1003
      // Begin a transactional update of each store.                                                                   // 1004
      _.each(self._stores, function (s, storeName) {                                                                   // 1005
        s.beginUpdate(_.has(updates, storeName) ? updates[storeName].length : 0,                                       // 1006
                      self._resetStores);                                                                              // 1007
      });                                                                                                              // 1008
      self._resetStores = false;                                                                                       // 1009
                                                                                                                       // 1010
      _.each(updates, function (updateMessages, storeName) {                                                           // 1011
        var store = self._stores[storeName];                                                                           // 1012
        if (store) {                                                                                                   // 1013
          _.each(updateMessages, function (updateMessage) {                                                            // 1014
            store.update(updateMessage);                                                                               // 1015
          });                                                                                                          // 1016
        } else {                                                                                                       // 1017
          // Nobody's listening for this data. Queue it up until                                                       // 1018
          // someone wants it.                                                                                         // 1019
          // XXX memory use will grow without bound if you forget to                                                   // 1020
          // create a collection or just don't care about it... going                                                  // 1021
          // to have to do something about that.                                                                       // 1022
          if (!_.has(self._updatesForUnknownStores, storeName))                                                        // 1023
            self._updatesForUnknownStores[storeName] = [];                                                             // 1024
          Array.prototype.push.apply(self._updatesForUnknownStores[storeName],                                         // 1025
                                     updateMessages);                                                                  // 1026
        }                                                                                                              // 1027
      });                                                                                                              // 1028
                                                                                                                       // 1029
      // End update transaction.                                                                                       // 1030
      _.each(self._stores, function (s) { s.endUpdate(); });                                                           // 1031
    }                                                                                                                  // 1032
                                                                                                                       // 1033
    self._runAfterUpdateCallbacks();                                                                                   // 1034
  },                                                                                                                   // 1035
                                                                                                                       // 1036
  // Call any callbacks deferred with _runWhenAllServerDocsAreFlushed whose                                            // 1037
  // relevant docs have been flushed, as well as dataVisible callbacks at                                              // 1038
  // reconnect-quiescence time.                                                                                        // 1039
  _runAfterUpdateCallbacks: function () {                                                                              // 1040
    var self = this;                                                                                                   // 1041
    var callbacks = self._afterUpdateCallbacks;                                                                        // 1042
    self._afterUpdateCallbacks = [];                                                                                   // 1043
    _.each(callbacks, function (c) {                                                                                   // 1044
      c();                                                                                                             // 1045
    });                                                                                                                // 1046
  },                                                                                                                   // 1047
                                                                                                                       // 1048
  _pushUpdate: function (updates, collection, msg) {                                                                   // 1049
    var self = this;                                                                                                   // 1050
    if (!_.has(updates, collection)) {                                                                                 // 1051
      updates[collection] = [];                                                                                        // 1052
    }                                                                                                                  // 1053
    updates[collection].push(msg);                                                                                     // 1054
  },                                                                                                                   // 1055
                                                                                                                       // 1056
  _process_added: function (msg, updates) {                                                                            // 1057
    var self = this;                                                                                                   // 1058
    var serverDoc = Meteor._get(self._serverDocuments, msg.collection, msg.id);                                        // 1059
    if (serverDoc) {                                                                                                   // 1060
      // Some outstanding stub wrote here.                                                                             // 1061
      if (serverDoc.document !== undefined) {                                                                          // 1062
        throw new Error("It doesn't make sense to be adding something we know exists: "                                // 1063
                        + msg.id);                                                                                     // 1064
      }                                                                                                                // 1065
      serverDoc.document = msg.fields || {};                                                                           // 1066
      serverDoc.document._id = LocalCollection._idParse(msg.id);                                                       // 1067
    } else {                                                                                                           // 1068
      self._pushUpdate(updates, msg.collection, msg);                                                                  // 1069
    }                                                                                                                  // 1070
  },                                                                                                                   // 1071
                                                                                                                       // 1072
  _process_changed: function (msg, updates) {                                                                          // 1073
    var self = this;                                                                                                   // 1074
    var serverDoc = Meteor._get(self._serverDocuments, msg.collection, msg.id);                                        // 1075
    if (serverDoc) {                                                                                                   // 1076
      if (serverDoc.document === undefined) {                                                                          // 1077
        throw new Error("It doesn't make sense to be changing something we don't think exists: "                       // 1078
                        + msg.id);                                                                                     // 1079
      }                                                                                                                // 1080
      LocalCollection._applyChanges(serverDoc.document, msg.fields);                                                   // 1081
    } else {                                                                                                           // 1082
      self._pushUpdate(updates, msg.collection, msg);                                                                  // 1083
    }                                                                                                                  // 1084
  },                                                                                                                   // 1085
                                                                                                                       // 1086
  _process_removed: function (msg, updates) {                                                                          // 1087
    var self = this;                                                                                                   // 1088
    var serverDoc = Meteor._get(                                                                                       // 1089
      self._serverDocuments, msg.collection, msg.id);                                                                  // 1090
    if (serverDoc) {                                                                                                   // 1091
      // Some outstanding stub wrote here.                                                                             // 1092
      if (serverDoc.document === undefined) {                                                                          // 1093
        throw new Error("It doesn't make sense to be deleting something we don't know exists: "                        // 1094
                        + msg.id);                                                                                     // 1095
      }                                                                                                                // 1096
      serverDoc.document = undefined;                                                                                  // 1097
    } else {                                                                                                           // 1098
      self._pushUpdate(updates, msg.collection, {                                                                      // 1099
        msg: 'removed',                                                                                                // 1100
        collection: msg.collection,                                                                                    // 1101
        id: msg.id                                                                                                     // 1102
      });                                                                                                              // 1103
    }                                                                                                                  // 1104
  },                                                                                                                   // 1105
                                                                                                                       // 1106
  _process_updated: function (msg, updates) {                                                                          // 1107
    var self = this;                                                                                                   // 1108
    // Process "method done" messages.                                                                                 // 1109
    _.each(msg.methods, function (methodId) {                                                                          // 1110
      _.each(self._documentsWrittenByStub[methodId], function (written) {                                              // 1111
        var serverDoc = Meteor._get(self._serverDocuments,                                                             // 1112
                                    written.collection, written.id);                                                   // 1113
        if (!serverDoc)                                                                                                // 1114
          throw new Error("Lost serverDoc for " + JSON.stringify(written));                                            // 1115
        if (!serverDoc.writtenByStubs[methodId])                                                                       // 1116
          throw new Error("Doc " + JSON.stringify(written) +                                                           // 1117
                          " not written by  method " + methodId);                                                      // 1118
        delete serverDoc.writtenByStubs[methodId];                                                                     // 1119
        if (_.isEmpty(serverDoc.writtenByStubs)) {                                                                     // 1120
          // All methods whose stubs wrote this method have completed! We can                                          // 1121
          // now copy the saved document to the database (reverting the stub's                                         // 1122
          // change if the server did not write to this object, or applying the                                        // 1123
          // server's writes if it did).                                                                               // 1124
                                                                                                                       // 1125
          // This is a fake ddp 'replace' message.  It's just for talking between                                      // 1126
          // livedata connections and minimongo.                                                                       // 1127
          self._pushUpdate(updates, written.collection, {                                                              // 1128
            msg: 'replace',                                                                                            // 1129
            id: written.id,                                                                                            // 1130
            replace: serverDoc.document                                                                                // 1131
          });                                                                                                          // 1132
          // Call all flush callbacks.                                                                                 // 1133
          _.each(serverDoc.flushCallbacks, function (c) {                                                              // 1134
            c();                                                                                                       // 1135
          });                                                                                                          // 1136
                                                                                                                       // 1137
          // Delete this completed serverDocument. Don't bother to GC empty                                            // 1138
          // objects inside self._serverDocuments, since there probably aren't                                         // 1139
          // many collections and they'll be written repeatedly.                                                       // 1140
          delete self._serverDocuments[written.collection][written.id];                                                // 1141
        }                                                                                                              // 1142
      });                                                                                                              // 1143
      delete self._documentsWrittenByStub[methodId];                                                                   // 1144
                                                                                                                       // 1145
      // We want to call the data-written callback, but we can't do so until all                                       // 1146
      // currently buffered messages are flushed.                                                                      // 1147
      var callbackInvoker = self._methodInvokers[methodId];                                                            // 1148
      if (!callbackInvoker)                                                                                            // 1149
        throw new Error("No callback invoker for method " + methodId);                                                 // 1150
      self._runWhenAllServerDocsAreFlushed(                                                                            // 1151
        _.bind(callbackInvoker.dataVisible, callbackInvoker));                                                         // 1152
    });                                                                                                                // 1153
  },                                                                                                                   // 1154
                                                                                                                       // 1155
  _process_ready: function (msg, updates) {                                                                            // 1156
    var self = this;                                                                                                   // 1157
    // Process "sub ready" messages. "sub ready" messages don't take effect                                            // 1158
    // until all current server documents have been flushed to the local                                               // 1159
    // database. We can use a write fence to implement this.                                                           // 1160
    _.each(msg.subs, function (subId) {                                                                                // 1161
      self._runWhenAllServerDocsAreFlushed(function () {                                                               // 1162
        var subRecord = self._subscriptions[subId];                                                                    // 1163
        // Did we already unsubscribe?                                                                                 // 1164
        if (!subRecord)                                                                                                // 1165
          return;                                                                                                      // 1166
        // Did we already receive a ready message? (Oops!)                                                             // 1167
        if (subRecord.ready)                                                                                           // 1168
          return;                                                                                                      // 1169
        subRecord.readyCallback && subRecord.readyCallback();                                                          // 1170
        subRecord.ready = true;                                                                                        // 1171
        subRecord.readyDeps && subRecord.readyDeps.changed();                                                          // 1172
      });                                                                                                              // 1173
    });                                                                                                                // 1174
  },                                                                                                                   // 1175
                                                                                                                       // 1176
  // Ensures that "f" will be called after all documents currently in                                                  // 1177
  // _serverDocuments have been written to the local cache. f will not be called                                       // 1178
  // if the connection is lost before then!                                                                            // 1179
  _runWhenAllServerDocsAreFlushed: function (f) {                                                                      // 1180
    var self = this;                                                                                                   // 1181
    var runFAfterUpdates = function () {                                                                               // 1182
      self._afterUpdateCallbacks.push(f);                                                                              // 1183
    };                                                                                                                 // 1184
    var unflushedServerDocCount = 0;                                                                                   // 1185
    var onServerDocFlush = function () {                                                                               // 1186
      --unflushedServerDocCount;                                                                                       // 1187
      if (unflushedServerDocCount === 0) {                                                                             // 1188
        // This was the last doc to flush! Arrange to run f after the updates                                          // 1189
        // have been applied.                                                                                          // 1190
        runFAfterUpdates();                                                                                            // 1191
      }                                                                                                                // 1192
    };                                                                                                                 // 1193
    _.each(self._serverDocuments, function (collectionDocs) {                                                          // 1194
      _.each(collectionDocs, function (serverDoc) {                                                                    // 1195
        var writtenByStubForAMethodWithSentMessage = _.any(                                                            // 1196
          serverDoc.writtenByStubs, function (dummy, methodId) {                                                       // 1197
            var invoker = self._methodInvokers[methodId];                                                              // 1198
            return invoker && invoker.sentMessage;                                                                     // 1199
          });                                                                                                          // 1200
        if (writtenByStubForAMethodWithSentMessage) {                                                                  // 1201
          ++unflushedServerDocCount;                                                                                   // 1202
          serverDoc.flushCallbacks.push(onServerDocFlush);                                                             // 1203
        }                                                                                                              // 1204
      });                                                                                                              // 1205
    });                                                                                                                // 1206
    if (unflushedServerDocCount === 0) {                                                                               // 1207
      // There aren't any buffered docs --- we can call f as soon as the current                                       // 1208
      // round of updates is applied!                                                                                  // 1209
      runFAfterUpdates();                                                                                              // 1210
    }                                                                                                                  // 1211
  },                                                                                                                   // 1212
                                                                                                                       // 1213
  _livedata_nosub: function (msg) {                                                                                    // 1214
    var self = this;                                                                                                   // 1215
                                                                                                                       // 1216
    // First pass it through _livedata_data, which only uses it to help get                                            // 1217
    // towards quiescence.                                                                                             // 1218
    self._livedata_data(msg);                                                                                          // 1219
                                                                                                                       // 1220
    // Do the rest of our processing immediately, with no                                                              // 1221
    // buffering-until-quiescence.                                                                                     // 1222
                                                                                                                       // 1223
    // we weren't subbed anyway, or we initiated the unsub.                                                            // 1224
    if (!_.has(self._subscriptions, msg.id))                                                                           // 1225
      return;                                                                                                          // 1226
    var errorCallback = self._subscriptions[msg.id].errorCallback;                                                     // 1227
    delete self._subscriptions[msg.id];                                                                                // 1228
    if (errorCallback && msg.error) {                                                                                  // 1229
      errorCallback(new Meteor.Error(                                                                                  // 1230
        msg.error.error, msg.error.reason, msg.error.details));                                                        // 1231
    }                                                                                                                  // 1232
  },                                                                                                                   // 1233
                                                                                                                       // 1234
  _process_nosub: function () {                                                                                        // 1235
    // This is called as part of the "buffer until quiescence" process, but                                            // 1236
    // nosub's effect is always immediate. It only goes in the buffer at all                                           // 1237
    // because it's possible for a nosub to be the thing that triggers                                                 // 1238
    // quiescence, if we were waiting for a sub to be revived and it dies                                              // 1239
    // instead.                                                                                                        // 1240
  },                                                                                                                   // 1241
                                                                                                                       // 1242
  _livedata_result: function (msg) {                                                                                   // 1243
    // id, result or error. error has error (code), reason, details                                                    // 1244
                                                                                                                       // 1245
    var self = this;                                                                                                   // 1246
                                                                                                                       // 1247
    // find the outstanding request                                                                                    // 1248
    // should be O(1) in nearly all realistic use cases                                                                // 1249
    if (_.isEmpty(self._outstandingMethodBlocks)) {                                                                    // 1250
      Meteor._debug("Received method result but no methods outstanding");                                              // 1251
      return;                                                                                                          // 1252
    }                                                                                                                  // 1253
    var currentMethodBlock = self._outstandingMethodBlocks[0].methods;                                                 // 1254
    var m;                                                                                                             // 1255
    for (var i = 0; i < currentMethodBlock.length; i++) {                                                              // 1256
      m = currentMethodBlock[i];                                                                                       // 1257
      if (m.methodId === msg.id)                                                                                       // 1258
        break;                                                                                                         // 1259
    }                                                                                                                  // 1260
                                                                                                                       // 1261
    if (!m) {                                                                                                          // 1262
      Meteor._debug("Can't match method response to original method call", msg);                                       // 1263
      return;                                                                                                          // 1264
    }                                                                                                                  // 1265
                                                                                                                       // 1266
    // Remove from current method block. This may leave the block empty, but we                                        // 1267
    // don't move on to the next block until the callback has been delivered, in                                       // 1268
    // _outstandingMethodFinished.                                                                                     // 1269
    currentMethodBlock.splice(i, 1);                                                                                   // 1270
                                                                                                                       // 1271
    if (_.has(msg, 'error')) {                                                                                         // 1272
      m.receiveResult(new Meteor.Error(                                                                                // 1273
        msg.error.error, msg.error.reason,                                                                             // 1274
        msg.error.details));                                                                                           // 1275
    } else {                                                                                                           // 1276
      // msg.result may be undefined if the method didn't return a                                                     // 1277
      // value                                                                                                         // 1278
      m.receiveResult(undefined, msg.result);                                                                          // 1279
    }                                                                                                                  // 1280
  },                                                                                                                   // 1281
                                                                                                                       // 1282
  // Called by MethodInvoker after a method's callback is invoked.  If this was                                        // 1283
  // the last outstanding method in the current block, runs the next block. If                                         // 1284
  // there are no more methods, consider accepting a hot code push.                                                    // 1285
  _outstandingMethodFinished: function () {                                                                            // 1286
    var self = this;                                                                                                   // 1287
    if (self._anyMethodsAreOutstanding())                                                                              // 1288
      return;                                                                                                          // 1289
                                                                                                                       // 1290
    // No methods are outstanding. This should mean that the first block of                                            // 1291
    // methods is empty. (Or it might not exist, if this was a method that                                             // 1292
    // half-finished before disconnect/reconnect.)                                                                     // 1293
    if (! _.isEmpty(self._outstandingMethodBlocks)) {                                                                  // 1294
      var firstBlock = self._outstandingMethodBlocks.shift();                                                          // 1295
      if (! _.isEmpty(firstBlock.methods))                                                                             // 1296
        throw new Error("No methods outstanding but nonempty block: " +                                                // 1297
                        JSON.stringify(firstBlock));                                                                   // 1298
                                                                                                                       // 1299
      // Send the outstanding methods now in the first block.                                                          // 1300
      if (!_.isEmpty(self._outstandingMethodBlocks))                                                                   // 1301
        self._sendOutstandingMethods();                                                                                // 1302
    }                                                                                                                  // 1303
                                                                                                                       // 1304
    // Maybe accept a hot code push.                                                                                   // 1305
    self._maybeMigrate();                                                                                              // 1306
  },                                                                                                                   // 1307
                                                                                                                       // 1308
  // Sends messages for all the methods in the first block in                                                          // 1309
  // _outstandingMethodBlocks.                                                                                         // 1310
  _sendOutstandingMethods: function() {                                                                                // 1311
    var self = this;                                                                                                   // 1312
    if (_.isEmpty(self._outstandingMethodBlocks))                                                                      // 1313
      return;                                                                                                          // 1314
    _.each(self._outstandingMethodBlocks[0].methods, function (m) {                                                    // 1315
      m.sendMessage();                                                                                                 // 1316
    });                                                                                                                // 1317
  },                                                                                                                   // 1318
                                                                                                                       // 1319
  _livedata_error: function (msg) {                                                                                    // 1320
    Meteor._debug("Received error from server: ", msg.reason);                                                         // 1321
    if (msg.offendingMessage)                                                                                          // 1322
      Meteor._debug("For: ", msg.offendingMessage);                                                                    // 1323
  },                                                                                                                   // 1324
                                                                                                                       // 1325
  _callOnReconnectAndSendAppropriateOutstandingMethods: function() {                                                   // 1326
    var self = this;                                                                                                   // 1327
    var oldOutstandingMethodBlocks = self._outstandingMethodBlocks;                                                    // 1328
    self._outstandingMethodBlocks = [];                                                                                // 1329
                                                                                                                       // 1330
    self.onReconnect();                                                                                                // 1331
                                                                                                                       // 1332
    if (_.isEmpty(oldOutstandingMethodBlocks))                                                                         // 1333
      return;                                                                                                          // 1334
                                                                                                                       // 1335
    // We have at least one block worth of old outstanding methods to try                                              // 1336
    // again. First: did onReconnect actually send anything? If not, we just                                           // 1337
    // restore all outstanding methods and run the first block.                                                        // 1338
    if (_.isEmpty(self._outstandingMethodBlocks)) {                                                                    // 1339
      self._outstandingMethodBlocks = oldOutstandingMethodBlocks;                                                      // 1340
      self._sendOutstandingMethods();                                                                                  // 1341
      return;                                                                                                          // 1342
    }                                                                                                                  // 1343
                                                                                                                       // 1344
    // OK, there are blocks on both sides. Special case: merge the last block of                                       // 1345
    // the reconnect methods with the first block of the original methods, if                                          // 1346
    // neither of them are "wait" blocks.                                                                              // 1347
    if (!_.last(self._outstandingMethodBlocks).wait &&                                                                 // 1348
        !oldOutstandingMethodBlocks[0].wait) {                                                                         // 1349
      _.each(oldOutstandingMethodBlocks[0].methods, function (m) {                                                     // 1350
        _.last(self._outstandingMethodBlocks).methods.push(m);                                                         // 1351
                                                                                                                       // 1352
        // If this "last block" is also the first block, send the message.                                             // 1353
        if (self._outstandingMethodBlocks.length === 1)                                                                // 1354
          m.sendMessage();                                                                                             // 1355
      });                                                                                                              // 1356
                                                                                                                       // 1357
      oldOutstandingMethodBlocks.shift();                                                                              // 1358
    }                                                                                                                  // 1359
                                                                                                                       // 1360
    // Now add the rest of the original blocks on.                                                                     // 1361
    _.each(oldOutstandingMethodBlocks, function (block) {                                                              // 1362
      self._outstandingMethodBlocks.push(block);                                                                       // 1363
    });                                                                                                                // 1364
  },                                                                                                                   // 1365
                                                                                                                       // 1366
  // We can accept a hot code push if there are no methods in flight.                                                  // 1367
  _readyToMigrate: function() {                                                                                        // 1368
    var self = this;                                                                                                   // 1369
    return _.isEmpty(self._methodInvokers);                                                                            // 1370
  },                                                                                                                   // 1371
                                                                                                                       // 1372
  // If we were blocking a migration, see if it's now possible to continue.                                            // 1373
  // Call whenever the set of outstanding/blocked methods shrinks.                                                     // 1374
  _maybeMigrate: function () {                                                                                         // 1375
    var self = this;                                                                                                   // 1376
    if (self._retryMigrate && self._readyToMigrate()) {                                                                // 1377
      self._retryMigrate();                                                                                            // 1378
      self._retryMigrate = null;                                                                                       // 1379
    }                                                                                                                  // 1380
  }                                                                                                                    // 1381
});                                                                                                                    // 1382
                                                                                                                       // 1383
LivedataTest.Connection = Connection;                                                                                  // 1384
                                                                                                                       // 1385
// @param url {String} URL to Meteor app,                                                                              // 1386
//     e.g.:                                                                                                           // 1387
//     "subdomain.meteor.com",                                                                                         // 1388
//     "http://subdomain.meteor.com",                                                                                  // 1389
//     "/",                                                                                                            // 1390
//     "ddp+sockjs://ddp--****-foo.meteor.com/sockjs"                                                                  // 1391
//                                                                                                                     // 1392
DDP.connect = function (url, options) {                                                                                // 1393
  var ret = new Connection(url, options);                                                                              // 1394
  allConnections.push(ret); // hack. see below.                                                                        // 1395
  return ret;                                                                                                          // 1396
};                                                                                                                     // 1397
                                                                                                                       // 1398
// Hack for `spiderable` package: a way to see if the page is done                                                     // 1399
// loading all the data it needs.                                                                                      // 1400
//                                                                                                                     // 1401
allConnections = [];                                                                                                   // 1402
DDP._allSubscriptionsReady = function () {                                                                             // 1403
  return _.all(allConnections, function (conn) {                                                                       // 1404
    return _.all(conn._subscriptions, function (sub) {                                                                 // 1405
      return sub.ready;                                                                                                // 1406
    });                                                                                                                // 1407
  });                                                                                                                  // 1408
};                                                                                                                     // 1409
                                                                                                                       // 1410
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/livedata/server_convenience.js                                                                             //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
// Only create a server if we are in an environment with a HTTP server                                                 // 1
// (as opposed to, eg, a command-line tool).                                                                           // 2
//                                                                                                                     // 3
if (Package.webapp) {                                                                                                  // 4
  if (process.env.DDP_DEFAULT_CONNECTION_URL) {                                                                        // 5
    __meteor_runtime_config__.DDP_DEFAULT_CONNECTION_URL =                                                             // 6
      process.env.DDP_DEFAULT_CONNECTION_URL;                                                                          // 7
  }                                                                                                                    // 8
                                                                                                                       // 9
  Meteor.server = new Server;                                                                                          // 10
                                                                                                                       // 11
  Meteor.refresh = function (notification) {                                                                           // 12
    var fence = DDPServer._CurrentWriteFence.get();                                                                    // 13
    if (fence) {                                                                                                       // 14
      // Block the write fence until all of the invalidations have                                                     // 15
      // landed.                                                                                                       // 16
      var proxy_write = fence.beginWrite();                                                                            // 17
    }                                                                                                                  // 18
    DDPServer._InvalidationCrossbar.fire(notification, function () {                                                   // 19
      if (proxy_write)                                                                                                 // 20
        proxy_write.committed();                                                                                       // 21
    });                                                                                                                // 22
  };                                                                                                                   // 23
                                                                                                                       // 24
  // Proxy the public methods of Meteor.server so they can                                                             // 25
  // be called directly on Meteor.                                                                                     // 26
  _.each(['publish', 'methods', 'call', 'apply', 'onConnection'],                                                      // 27
         function (name) {                                                                                             // 28
           Meteor[name] = _.bind(Meteor.server[name], Meteor.server);                                                  // 29
         });                                                                                                           // 30
} else {                                                                                                               // 31
  // No server? Make these empty/no-ops.                                                                               // 32
  Meteor.server = null;                                                                                                // 33
  Meteor.refresh = function (notification) {                                                                           // 34
  };                                                                                                                   // 35
}                                                                                                                      // 36
                                                                                                                       // 37
// Meteor.server used to be called Meteor.default_server. Provide                                                      // 38
// backcompat as a courtesy even though it was never documented.                                                       // 39
// XXX COMPAT WITH 0.6.4                                                                                               // 40
Meteor.default_server = Meteor.server;                                                                                 // 41
                                                                                                                       // 42
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);


/* Exports */
if (typeof Package === 'undefined') Package = {};
Package.livedata = {
  DDP: DDP,
  DDPServer: DDPServer,
  LivedataTest: LivedataTest
};

})();
