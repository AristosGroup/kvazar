(function () {

/* Imports */
var _ = Package.underscore._;

/* Package-scope variables */
var Meteor;

(function () {

/////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                         //
// packages/meteor/node-issue-6506-workaround.js                                                           //
//                                                                                                         //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                           //
// Temporary workaround for https://github.com/joyent/node/issues/6506                                     // 1
// Our fix involves replicating a bunch of functions in order to change                                    // 2
// a single line.                                                                                          // 3
                                                                                                           // 4
var PATCH_VERSIONS = ['v0.10.22', 'v0.10.23', 'v0.10.24'];                                                 // 5
                                                                                                           // 6
if (!_.contains(PATCH_VERSIONS, process.version)) {                                                        // 7
  if (!process.env.DISABLE_WEBSOCKETS) {                                                                   // 8
    console.error("This version of Meteor contains a patch for a bug in Node v0.10.");                     // 9
    console.error("The patch is against only versions 0.10.22 through 0.10.24.");                          // 10
    console.error("You are using version " + process.version + " instead, so we cannot apply the patch."); // 11
    console.error("To mitigate the most common effect of the bug, websockets will be disabled.");          // 12
    console.error("To enable websockets, use Node v0.10.22 through v0.10.24, or upgrade to a later version of Meteor (if available).");
    process.env.DISABLE_WEBSOCKETS = 't';                                                                  // 14
  }                                                                                                        // 15
} else {                                                                                                   // 16
  // This code is all copied from Node's lib/_stream_writable.js, git tag                                  // 17
  // v0.10.22, with one change (see "BUGFIX").                                                             // 18
  var Writable = Npm.require('_stream_writable');                                                          // 19
  var Duplex = Npm.require('_stream_duplex');                                                              // 20
                                                                                                           // 21
  Writable.prototype.write = function(chunk, encoding, cb) {                                               // 22
    var state = this._writableState;                                                                       // 23
    var ret = false;                                                                                       // 24
                                                                                                           // 25
    if (typeof encoding === 'function') {                                                                  // 26
      cb = encoding;                                                                                       // 27
      encoding = null;                                                                                     // 28
    }                                                                                                      // 29
                                                                                                           // 30
    if (Buffer.isBuffer(chunk))                                                                            // 31
      encoding = 'buffer';                                                                                 // 32
    else if (!encoding)                                                                                    // 33
      encoding = state.defaultEncoding;                                                                    // 34
                                                                                                           // 35
    if (typeof cb !== 'function')                                                                          // 36
      cb = function() {};                                                                                  // 37
                                                                                                           // 38
    if (state.ended)                                                                                       // 39
      writeAfterEnd(this, state, cb);                                                                      // 40
    else if (validChunk(this, state, chunk, cb))                                                           // 41
      ret = writeOrBuffer(this, state, chunk, encoding, cb);                                               // 42
                                                                                                           // 43
    return ret;                                                                                            // 44
  };                                                                                                       // 45
                                                                                                           // 46
  // Duplex doesn't directly inherit from Writable: it copies over this function                           // 47
  // explicitly. So we have to do it too.                                                                  // 48
  Duplex.prototype.write = Writable.prototype.write;                                                       // 49
                                                                                                           // 50
  function writeAfterEnd(stream, state, cb) {                                                              // 51
    var er = new Error('write after end');                                                                 // 52
    // TODO: defer error events consistently everywhere, not just the cb                                   // 53
    stream.emit('error', er);                                                                              // 54
    process.nextTick(function() {                                                                          // 55
      cb(er);                                                                                              // 56
    });                                                                                                    // 57
  }                                                                                                        // 58
                                                                                                           // 59
  function validChunk(stream, state, chunk, cb) {                                                          // 60
    var valid = true;                                                                                      // 61
    if (!Buffer.isBuffer(chunk) &&                                                                         // 62
        'string' !== typeof chunk &&                                                                       // 63
        chunk !== null &&                                                                                  // 64
        chunk !== undefined &&                                                                             // 65
        !state.objectMode) {                                                                               // 66
      var er = new TypeError('Invalid non-string/buffer chunk');                                           // 67
      stream.emit('error', er);                                                                            // 68
      process.nextTick(function() {                                                                        // 69
        cb(er);                                                                                            // 70
      });                                                                                                  // 71
      valid = false;                                                                                       // 72
    }                                                                                                      // 73
    return valid;                                                                                          // 74
  }                                                                                                        // 75
                                                                                                           // 76
  function writeOrBuffer(stream, state, chunk, encoding, cb) {                                             // 77
    chunk = decodeChunk(state, chunk, encoding);                                                           // 78
    if (Buffer.isBuffer(chunk))                                                                            // 79
      encoding = 'buffer';                                                                                 // 80
    var len = state.objectMode ? 1 : chunk.length;                                                         // 81
                                                                                                           // 82
    state.length += len;                                                                                   // 83
                                                                                                           // 84
    var ret = state.length < state.highWaterMark;                                                          // 85
    // This next line is the BUGFIX:                                                                       // 86
    state.needDrain = state.needDrain || !ret;                                                             // 87
                                                                                                           // 88
    if (state.writing)                                                                                     // 89
      state.buffer.push(new WriteReq(chunk, encoding, cb));                                                // 90
    else                                                                                                   // 91
      doWrite(stream, state, len, chunk, encoding, cb);                                                    // 92
                                                                                                           // 93
    return ret;                                                                                            // 94
  }                                                                                                        // 95
                                                                                                           // 96
  function decodeChunk(state, chunk, encoding) {                                                           // 97
    if (!state.objectMode &&                                                                               // 98
        state.decodeStrings !== false &&                                                                   // 99
        typeof chunk === 'string') {                                                                       // 100
      chunk = new Buffer(chunk, encoding);                                                                 // 101
    }                                                                                                      // 102
    return chunk;                                                                                          // 103
  }                                                                                                        // 104
                                                                                                           // 105
  function WriteReq(chunk, encoding, cb) {                                                                 // 106
    this.chunk = chunk;                                                                                    // 107
    this.encoding = encoding;                                                                              // 108
    this.callback = cb;                                                                                    // 109
  }                                                                                                        // 110
                                                                                                           // 111
  function doWrite(stream, state, len, chunk, encoding, cb) {                                              // 112
    state.writelen = len;                                                                                  // 113
    state.writecb = cb;                                                                                    // 114
    state.writing = true;                                                                                  // 115
    state.sync = true;                                                                                     // 116
    stream._write(chunk, encoding, state.onwrite);                                                         // 117
    state.sync = false;                                                                                    // 118
  }                                                                                                        // 119
}                                                                                                          // 120
                                                                                                           // 121
/////////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

/////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                         //
// packages/meteor/server_environment.js                                                                   //
//                                                                                                         //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                           //
Meteor = {                                                                                                 // 1
  isClient: false,                                                                                         // 2
  isServer: true                                                                                           // 3
};                                                                                                         // 4
                                                                                                           // 5
Meteor.settings = {};                                                                                      // 6
if (process.env.METEOR_SETTINGS) {                                                                         // 7
  try {                                                                                                    // 8
    Meteor.settings = JSON.parse(process.env.METEOR_SETTINGS);                                             // 9
  } catch (e) {                                                                                            // 10
    throw new Error("Settings are not valid JSON");                                                        // 11
  }                                                                                                        // 12
} else if ( process.env.APP_CONFIG) {                                                                      // 13
  // put settings from the app configuration in the settings.  Don't depend on                             // 14
  // the Galaxy package for now, to avoid silly loops.                                                     // 15
 try {                                                                                                     // 16
    Meteor.settings = JSON.parse(process.env.APP_CONFIG).settings || {};                                   // 17
  } catch (e) {                                                                                            // 18
    throw new Error("Settings are not valid JSON");                                                        // 19
  }                                                                                                        // 20
}                                                                                                          // 21
// Push a subset of settings to the client.                                                                // 22
if (Meteor.settings && Meteor.settings.public &&                                                           // 23
    typeof __meteor_runtime_config__ === "object") {                                                       // 24
  __meteor_runtime_config__.PUBLIC_SETTINGS = Meteor.settings.public;                                      // 25
}                                                                                                          // 26
                                                                                                           // 27
/////////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

/////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                         //
// packages/meteor/helpers.js                                                                              //
//                                                                                                         //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                           //
if (Meteor.isServer)                                                                                       // 1
  var Future = Npm.require('fibers/future');                                                               // 2
                                                                                                           // 3
if (typeof __meteor_runtime_config__ === 'object' &&                                                       // 4
    __meteor_runtime_config__.meteorRelease)                                                               // 5
  Meteor.release = __meteor_runtime_config__.meteorRelease;                                                // 6
                                                                                                           // 7
// XXX find a better home for these? Ideally they would be _.get,                                          // 8
// _.ensure, _.delete..                                                                                    // 9
                                                                                                           // 10
_.extend(Meteor, {                                                                                         // 11
  // _get(a,b,c,d) returns a[b][c][d], or else undefined if a[b] or                                        // 12
  // a[b][c] doesn't exist.                                                                                // 13
  //                                                                                                       // 14
  _get: function (obj /*, arguments */) {                                                                  // 15
    for (var i = 1; i < arguments.length; i++) {                                                           // 16
      if (!(arguments[i] in obj))                                                                          // 17
        return undefined;                                                                                  // 18
      obj = obj[arguments[i]];                                                                             // 19
    }                                                                                                      // 20
    return obj;                                                                                            // 21
  },                                                                                                       // 22
                                                                                                           // 23
  // _ensure(a,b,c,d) ensures that a[b][c][d] exists. If it does not,                                      // 24
  // it is created and set to {}. Either way, it is returned.                                              // 25
  //                                                                                                       // 26
  _ensure: function (obj /*, arguments */) {                                                               // 27
    for (var i = 1; i < arguments.length; i++) {                                                           // 28
      var key = arguments[i];                                                                              // 29
      if (!(key in obj))                                                                                   // 30
        obj[key] = {};                                                                                     // 31
      obj = obj[key];                                                                                      // 32
    }                                                                                                      // 33
                                                                                                           // 34
    return obj;                                                                                            // 35
  },                                                                                                       // 36
                                                                                                           // 37
  // _delete(a, b, c, d) deletes a[b][c][d], then a[b][c] unless it                                        // 38
  // isn't empty, then a[b] unless it isn't empty.                                                         // 39
  //                                                                                                       // 40
  _delete: function (obj /*, arguments */) {                                                               // 41
    var stack = [obj];                                                                                     // 42
    var leaf = true;                                                                                       // 43
    for (var i = 1; i < arguments.length - 1; i++) {                                                       // 44
      var key = arguments[i];                                                                              // 45
      if (!(key in obj)) {                                                                                 // 46
        leaf = false;                                                                                      // 47
        break;                                                                                             // 48
      }                                                                                                    // 49
      obj = obj[key];                                                                                      // 50
      if (typeof obj !== "object")                                                                         // 51
        break;                                                                                             // 52
      stack.push(obj);                                                                                     // 53
    }                                                                                                      // 54
                                                                                                           // 55
    for (var i = stack.length - 1; i >= 0; i--) {                                                          // 56
      var key = arguments[i+1];                                                                            // 57
                                                                                                           // 58
      if (leaf)                                                                                            // 59
        leaf = false;                                                                                      // 60
      else                                                                                                 // 61
        for (var other in stack[i][key])                                                                   // 62
          return; // not empty -- we're done                                                               // 63
                                                                                                           // 64
      delete stack[i][key];                                                                                // 65
    }                                                                                                      // 66
  },                                                                                                       // 67
                                                                                                           // 68
  // _wrapAsync can wrap any function that takes some number of arguments that                             // 69
  // can't be undefined, followed by some optional arguments, where the callback                           // 70
  // is the last optional argument.                                                                        // 71
  // e.g. fs.readFile(pathname, [callback]),                                                               // 72
  // fs.open(pathname, flags, [mode], [callback])                                                          // 73
  // For maximum effectiveness and least confusion, wrapAsync should be used on                            // 74
  // functions where the callback is the only argument of type Function.                                   // 75
  //                                                                                                       // 76
  _wrapAsync: function (fn) {                                                                              // 77
    return function (/* arguments */) {                                                                    // 78
      var self = this;                                                                                     // 79
      var callback;                                                                                        // 80
      var fut;                                                                                             // 81
      var newArgs = _.toArray(arguments);                                                                  // 82
                                                                                                           // 83
      var logErr = function (err) {                                                                        // 84
        if (err)                                                                                           // 85
          return Meteor._debug("Exception in callback of async function",                                  // 86
                               err.stack ? err.stack : err);                                               // 87
      };                                                                                                   // 88
                                                                                                           // 89
      // Pop off optional args that are undefined                                                          // 90
      while (newArgs.length > 0 &&                                                                         // 91
             typeof(newArgs[newArgs.length - 1]) === "undefined") {                                        // 92
        newArgs.pop();                                                                                     // 93
      }                                                                                                    // 94
      // If we have any left and the last one is a function, then that's our                               // 95
      // callback; otherwise, we don't have one.                                                           // 96
      if (newArgs.length > 0 &&                                                                            // 97
          newArgs[newArgs.length - 1] instanceof Function) {                                               // 98
        callback = newArgs.pop();                                                                          // 99
      } else {                                                                                             // 100
        if (Meteor.isClient) {                                                                             // 101
          callback = logErr;                                                                               // 102
        } else {                                                                                           // 103
          fut = new Future();                                                                              // 104
          callback = fut.resolver();                                                                       // 105
        }                                                                                                  // 106
      }                                                                                                    // 107
      newArgs.push(Meteor.bindEnvironment(callback));                                                      // 108
      var result = fn.apply(self, newArgs);                                                                // 109
      if (fut)                                                                                             // 110
        return fut.wait();                                                                                 // 111
      return result;                                                                                       // 112
    };                                                                                                     // 113
  }                                                                                                        // 114
});                                                                                                        // 115
                                                                                                           // 116
/////////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

/////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                         //
// packages/meteor/setimmediate.js                                                                         //
//                                                                                                         //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                           //
// Chooses one of three setImmediate implementations:                                                      // 1
//                                                                                                         // 2
// * Native setImmediate (IE 10, Node 0.9+)                                                                // 3
//                                                                                                         // 4
// * postMessage (many browsers)                                                                           // 5
//                                                                                                         // 6
// * setTimeout  (fallback)                                                                                // 7
//                                                                                                         // 8
// The postMessage implementation is based on                                                              // 9
// https://github.com/NobleJS/setImmediate/tree/1.0.1                                                      // 10
//                                                                                                         // 11
// Don't use `nextTick` for Node since it runs its callbacks before                                        // 12
// I/O, which is stricter than we're looking for.                                                          // 13
//                                                                                                         // 14
// Not installed as a polyfill, as our public API is `Meteor.defer`.                                       // 15
// Since we're not trying to be a polyfill, we have some                                                   // 16
// simplifications:                                                                                        // 17
//                                                                                                         // 18
// If one invocation of a setImmediate callback pauses itself by a                                         // 19
// call to alert/prompt/showModelDialog, the NobleJS polyfill                                              // 20
// implementation ensured that no setImmedate callback would run until                                     // 21
// the first invocation completed.  While correct per the spec, what it                                    // 22
// would mean for us in practice is that any reactive updates relying                                      // 23
// on Meteor.defer would be hung in the main window until the modal                                        // 24
// dialog was dismissed.  Thus we only ensure that a setImmediate                                          // 25
// function is called in a later event loop.                                                               // 26
//                                                                                                         // 27
// We don't need to support using a string to be eval'ed for the                                           // 28
// callback, arguments to the function, or clearImmediate.                                                 // 29
                                                                                                           // 30
"use strict";                                                                                              // 31
                                                                                                           // 32
var global = this;                                                                                         // 33
                                                                                                           // 34
                                                                                                           // 35
// IE 10, Node >= 9.1                                                                                      // 36
                                                                                                           // 37
function useSetImmediate() {                                                                               // 38
  if (! global.setImmediate)                                                                               // 39
    return null;                                                                                           // 40
  else {                                                                                                   // 41
    var setImmediate = function (fn) {                                                                     // 42
      global.setImmediate(fn);                                                                             // 43
    };                                                                                                     // 44
    setImmediate.implementation = 'setImmediate';                                                          // 45
    return setImmediate;                                                                                   // 46
  }                                                                                                        // 47
}                                                                                                          // 48
                                                                                                           // 49
                                                                                                           // 50
// Android 2.3.6, Chrome 26, Firefox 20, IE 8-9, iOS 5.1.1 Safari                                          // 51
                                                                                                           // 52
function usePostMessage() {                                                                                // 53
  // The test against `importScripts` prevents this implementation                                         // 54
  // from being installed inside a web worker, where                                                       // 55
  // `global.postMessage` means something completely different and                                         // 56
  // can't be used for this purpose.                                                                       // 57
                                                                                                           // 58
  if (!global.postMessage || global.importScripts) {                                                       // 59
    return null;                                                                                           // 60
  }                                                                                                        // 61
                                                                                                           // 62
  // Avoid synchronous post message implementations.                                                       // 63
                                                                                                           // 64
  var postMessageIsAsynchronous = true;                                                                    // 65
  var oldOnMessage = global.onmessage;                                                                     // 66
  global.onmessage = function () {                                                                         // 67
      postMessageIsAsynchronous = false;                                                                   // 68
  };                                                                                                       // 69
  global.postMessage("", "*");                                                                             // 70
  global.onmessage = oldOnMessage;                                                                         // 71
                                                                                                           // 72
  if (! postMessageIsAsynchronous)                                                                         // 73
    return null;                                                                                           // 74
                                                                                                           // 75
  var funcIndex = 0;                                                                                       // 76
  var funcs = {};                                                                                          // 77
                                                                                                           // 78
  // Installs an event handler on `global` for the `message` event: see                                    // 79
  // * https://developer.mozilla.org/en/DOM/window.postMessage                                             // 80
  // * http://www.whatwg.org/specs/web-apps/current-work/multipage/comms.html#crossDocumentMessages        // 81
                                                                                                           // 82
  // XXX use Random.id() here?                                                                             // 83
  var MESSAGE_PREFIX = "Meteor._setImmediate." + Math.random() + '.';                                      // 84
                                                                                                           // 85
  function isStringAndStartsWith(string, putativeStart) {                                                  // 86
    return (typeof string === "string" &&                                                                  // 87
            string.substring(0, putativeStart.length) === putativeStart);                                  // 88
  }                                                                                                        // 89
                                                                                                           // 90
  function onGlobalMessage(event) {                                                                        // 91
    // This will catch all incoming messages (even from other                                              // 92
    // windows!), so we need to try reasonably hard to avoid letting                                       // 93
    // anyone else trick us into firing off. We test the origin is                                         // 94
    // still this window, and that a (randomly generated)                                                  // 95
    // unpredictable identifying prefix is present.                                                        // 96
    if (event.source === global &&                                                                         // 97
        isStringAndStartsWith(event.data, MESSAGE_PREFIX)) {                                               // 98
      var index = event.data.substring(MESSAGE_PREFIX.length);                                             // 99
      try {                                                                                                // 100
        if (funcs[index])                                                                                  // 101
          funcs[index]();                                                                                  // 102
      }                                                                                                    // 103
      finally {                                                                                            // 104
        delete funcs[index];                                                                               // 105
      }                                                                                                    // 106
    }                                                                                                      // 107
  }                                                                                                        // 108
                                                                                                           // 109
  if (global.addEventListener) {                                                                           // 110
    global.addEventListener("message", onGlobalMessage, false);                                            // 111
  } else {                                                                                                 // 112
    global.attachEvent("onmessage", onGlobalMessage);                                                      // 113
  }                                                                                                        // 114
                                                                                                           // 115
  var setImmediate = function (fn) {                                                                       // 116
    // Make `global` post a message to itself with the handle and                                          // 117
    // identifying prefix, thus asynchronously invoking our                                                // 118
    // onGlobalMessage listener above.                                                                     // 119
    ++funcIndex;                                                                                           // 120
    funcs[funcIndex] = fn;                                                                                 // 121
    global.postMessage(MESSAGE_PREFIX + funcIndex, "*");                                                   // 122
  };                                                                                                       // 123
  setImmediate.implementation = 'postMessage';                                                             // 124
  return setImmediate;                                                                                     // 125
}                                                                                                          // 126
                                                                                                           // 127
                                                                                                           // 128
function useTimeout() {                                                                                    // 129
  var setImmediate = function (fn) {                                                                       // 130
    global.setTimeout(fn, 0);                                                                              // 131
  };                                                                                                       // 132
  setImmediate.implementation = 'setTimeout';                                                              // 133
  return setImmediate;                                                                                     // 134
}                                                                                                          // 135
                                                                                                           // 136
                                                                                                           // 137
Meteor._setImmediate =                                                                                     // 138
  useSetImmediate() ||                                                                                     // 139
  usePostMessage() ||                                                                                      // 140
  useTimeout();                                                                                            // 141
                                                                                                           // 142
/////////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

/////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                         //
// packages/meteor/timers.js                                                                               //
//                                                                                                         //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                           //
var withoutInvocation = function (f) {                                                                     // 1
  if (Package.livedata) {                                                                                  // 2
    var _CurrentInvocation = Package.livedata.DDP._CurrentInvocation;                                      // 3
    if (_CurrentInvocation.get() && _CurrentInvocation.get().isSimulation)                                 // 4
      throw new Error("Can't set timers inside simulations");                                              // 5
    return function () { _CurrentInvocation.withValue(null, f); };                                         // 6
  }                                                                                                        // 7
  else                                                                                                     // 8
    return f;                                                                                              // 9
};                                                                                                         // 10
                                                                                                           // 11
var bindAndCatch = function (context, f) {                                                                 // 12
  return Meteor.bindEnvironment(withoutInvocation(f), context);                                            // 13
};                                                                                                         // 14
                                                                                                           // 15
_.extend(Meteor, {                                                                                         // 16
  // Meteor.setTimeout and Meteor.setInterval callbacks scheduled                                          // 17
  // inside a server method are not part of the method invocation and                                      // 18
  // should clear out the CurrentInvocation environment variable.                                          // 19
                                                                                                           // 20
  setTimeout: function (f, duration) {                                                                     // 21
    return setTimeout(bindAndCatch("setTimeout callback", f), duration);                                   // 22
  },                                                                                                       // 23
                                                                                                           // 24
  setInterval: function (f, duration) {                                                                    // 25
    return setInterval(bindAndCatch("setInterval callback", f), duration);                                 // 26
  },                                                                                                       // 27
                                                                                                           // 28
  clearInterval: function(x) {                                                                             // 29
    return clearInterval(x);                                                                               // 30
  },                                                                                                       // 31
                                                                                                           // 32
  clearTimeout: function(x) {                                                                              // 33
    return clearTimeout(x);                                                                                // 34
  },                                                                                                       // 35
                                                                                                           // 36
  // XXX consider making this guarantee ordering of defer'd callbacks, like                                // 37
  // Deps.afterFlush or Node's nextTick (in practice). Then tests can do:                                  // 38
  //    callSomethingThatDefersSomeWork();                                                                 // 39
  //    Meteor.defer(expect(somethingThatValidatesThatTheWorkHappened));                                   // 40
  defer: function (f) {                                                                                    // 41
    Meteor._setImmediate(bindAndCatch("defer callback", f));                                               // 42
  }                                                                                                        // 43
});                                                                                                        // 44
                                                                                                           // 45
/////////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

/////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                         //
// packages/meteor/errors.js                                                                               //
//                                                                                                         //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                           //
// http://davidshariff.com/blog/javascript-inheritance-patterns/                                           // 1
var inherits = function (child, parent) {                                                                  // 2
  var tmp = function () {};                                                                                // 3
  tmp.prototype = parent.prototype;                                                                        // 4
  child.prototype = new tmp;                                                                               // 5
  child.prototype.constructor = child;                                                                     // 6
};                                                                                                         // 7
                                                                                                           // 8
// Makes an error subclass which properly contains a stack trace in most                                   // 9
// environments. constructor can set fields on `this` (and should probably set                             // 10
// `message`, which is what gets displayed at the top of a stack trace).                                   // 11
//                                                                                                         // 12
Meteor.makeErrorType = function (name, constructor) {                                                      // 13
  var errorClass = function (/*arguments*/) {                                                              // 14
    var self = this;                                                                                       // 15
                                                                                                           // 16
    // Ensure we get a proper stack trace in most Javascript environments                                  // 17
    if (Error.captureStackTrace) {                                                                         // 18
      // V8 environments (Chrome and Node.js)                                                              // 19
      Error.captureStackTrace(self, errorClass);                                                           // 20
    } else {                                                                                               // 21
      // Firefox                                                                                           // 22
      var e = new Error;                                                                                   // 23
      e.__proto__ = errorClass.prototype;                                                                  // 24
      if (e instanceof errorClass)                                                                         // 25
        self = e;                                                                                          // 26
    }                                                                                                      // 27
    // Safari magically works.                                                                             // 28
                                                                                                           // 29
    constructor.apply(self, arguments);                                                                    // 30
                                                                                                           // 31
    self.errorType = name;                                                                                 // 32
                                                                                                           // 33
    return self;                                                                                           // 34
  };                                                                                                       // 35
                                                                                                           // 36
  inherits(errorClass, Error);                                                                             // 37
                                                                                                           // 38
  return errorClass;                                                                                       // 39
};                                                                                                         // 40
                                                                                                           // 41
// This should probably be in the livedata package, but we don't want                                      // 42
// to require you to use the livedata package to get it. Eventually we                                     // 43
// should probably rename it to DDP.Error and put it back in the                                           // 44
// 'livedata' package (which we should rename to 'ddp' also.)                                              // 45
//                                                                                                         // 46
// Note: The DDP server assumes that Meteor.Error EJSON-serializes as an object                            // 47
// containing 'error' and optionally 'reason' and 'details'.                                               // 48
// The DDP client manually puts these into Meteor.Error objects. (We don't use                             // 49
// EJSON.addType here because the type is determined by location in the                                    // 50
// protocol, not text on the wire.)                                                                        // 51
//                                                                                                         // 52
Meteor.Error = Meteor.makeErrorType(                                                                       // 53
  "Meteor.Error",                                                                                          // 54
  function (error, reason, details) {                                                                      // 55
    var self = this;                                                                                       // 56
                                                                                                           // 57
    // Currently, a numeric code, likely similar to a HTTP code (eg,                                       // 58
    // 404, 500). That is likely to change though.                                                         // 59
    self.error = error;                                                                                    // 60
                                                                                                           // 61
    // Optional: A short human-readable summary of the error. Not                                          // 62
    // intended to be shown to end users, just developers. ("Not Found",                                   // 63
    // "Internal Server Error")                                                                            // 64
    self.reason = reason;                                                                                  // 65
                                                                                                           // 66
    // Optional: Additional information about the error, say for                                           // 67
    // debugging. It might be a (textual) stack trace if the server is                                     // 68
    // willing to provide one. The corresponding thing in HTTP would be                                    // 69
    // the body of a 404 or 500 response. (The difference is that we                                       // 70
    // never expect this to be shown to end users, only developers, so                                     // 71
    // it doesn't need to be pretty.)                                                                      // 72
    self.details = details;                                                                                // 73
                                                                                                           // 74
    // This is what gets displayed at the top of a stack trace. Current                                    // 75
    // format is "[404]" (if no reason is set) or "File not found [404]"                                   // 76
    if (self.reason)                                                                                       // 77
      self.message = self.reason + ' [' + self.error + ']';                                                // 78
    else                                                                                                   // 79
      self.message = '[' + self.error + ']';                                                               // 80
  });                                                                                                      // 81
                                                                                                           // 82
// Meteor.Error is basically data and is sent over DDP, so you should be able to                           // 83
// properly EJSON-clone it. This is especially important because if a                                      // 84
// Meteor.Error is thrown through a Future, the error, reason, and details                                 // 85
// properties become non-enumerable so a standard Object clone won't preserve                              // 86
// them and they will be lost from DDP.                                                                    // 87
Meteor.Error.prototype.clone = function () {                                                               // 88
  var self = this;                                                                                         // 89
  return new Meteor.Error(self.error, self.reason, self.details);                                          // 90
};                                                                                                         // 91
                                                                                                           // 92
/////////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

/////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                         //
// packages/meteor/fiber_helpers.js                                                                        //
//                                                                                                         //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                           //
var path = Npm.require('path');                                                                            // 1
var Fiber = Npm.require('fibers');                                                                         // 2
var Future = Npm.require(path.join('fibers', 'future'));                                                   // 3
                                                                                                           // 4
Meteor._noYieldsAllowed = function (f) {                                                                   // 5
  // "Fiber" and "yield" are both in the global namespace. The yield function is                           // 6
  // at both "yield" and "Fiber.yield". (It's also at require('fibers').yield                              // 7
  // but that is because require('fibers') === Fiber.)                                                     // 8
  var savedYield = Fiber.yield;                                                                            // 9
  Fiber.yield = function () {                                                                              // 10
    throw new Error("Can't call yield in a noYieldsAllowed block!");                                       // 11
  };                                                                                                       // 12
  global.yield = Fiber.yield;                                                                              // 13
  try {                                                                                                    // 14
    return f();                                                                                            // 15
  } finally {                                                                                              // 16
    Fiber.yield = savedYield;                                                                              // 17
    global.yield = savedYield;                                                                             // 18
  }                                                                                                        // 19
};                                                                                                         // 20
                                                                                                           // 21
// Meteor._SynchronousQueue is a queue which runs task functions serially.                                 // 22
// Tasks are assumed to be synchronous: ie, it's assumed that they are                                     // 23
// done when they return.                                                                                  // 24
//                                                                                                         // 25
// It has two methods:                                                                                     // 26
//   - queueTask queues a task to be run, and returns immediately.                                         // 27
//   - runTask queues a task to be run, and then yields. It returns                                        // 28
//     when the task finishes running.                                                                     // 29
//                                                                                                         // 30
// It's safe to call queueTask from within a task, but not runTask (unless                                 // 31
// you're calling runTask from a nested Fiber).                                                            // 32
//                                                                                                         // 33
// Somewhat inspired by async.queue, but specific to blocking tasks.                                       // 34
// XXX break this out into an NPM module?                                                                  // 35
// XXX could maybe use the npm 'schlock' module instead, which would                                       // 36
//     also support multiple concurrent "read" tasks                                                       // 37
//                                                                                                         // 38
Meteor._SynchronousQueue = function () {                                                                   // 39
  var self = this;                                                                                         // 40
  // List of tasks to run (not including a currently-running task if any). Each                            // 41
  // is an object with field 'task' (the task function to run) and 'future' (the                           // 42
  // Future associated with the blocking runTask call that queued it, or null if                           // 43
  // called from queueTask).                                                                               // 44
  self._taskHandles = [];                                                                                  // 45
  // This is true if self._run() is either currently executing or scheduled to                             // 46
  // do so soon.                                                                                           // 47
  self._runningOrRunScheduled = false;                                                                     // 48
  // During the execution of a task, this is set to the fiber used to execute                              // 49
  // that task. We use this to throw an error rather than deadlocking if the                               // 50
  // user calls runTask from within a task on the same fiber.                                              // 51
  self._currentTaskFiber = undefined;                                                                      // 52
  // This is true if we're currently draining.  While we're draining, a further                            // 53
  // drain is a noop, to prevent infinite loops.  "drain" is a heuristic type                              // 54
  // operation, that has a meaning like unto "what a naive person would expect                             // 55
  // when modifying a table from an observe"                                                               // 56
  self._draining = false;                                                                                  // 57
};                                                                                                         // 58
                                                                                                           // 59
_.extend(Meteor._SynchronousQueue.prototype, {                                                             // 60
  runTask: function (task) {                                                                               // 61
    var self = this;                                                                                       // 62
                                                                                                           // 63
    if (!self.safeToRunTask()) {                                                                           // 64
      if (Fiber.current)                                                                                   // 65
        throw new Error("Can't runTask from another task in the same fiber");                              // 66
      else                                                                                                 // 67
        throw new Error("Can only call runTask in a Fiber");                                               // 68
    }                                                                                                      // 69
                                                                                                           // 70
    var fut = new Future;                                                                                  // 71
    var handle = {                                                                                         // 72
      task: Meteor.bindEnvironment(task, function (e) {                                                    // 73
        Meteor._debug("Exception from task:", e && e.stack || e);                                          // 74
        throw e;                                                                                           // 75
      }),                                                                                                  // 76
      future: fut,                                                                                         // 77
      name: task.name                                                                                      // 78
    };                                                                                                     // 79
    self._taskHandles.push(handle);                                                                        // 80
    self._scheduleRun();                                                                                   // 81
    // Yield. We'll get back here after the task is run (and will throw if the                             // 82
    // task throws).                                                                                       // 83
    fut.wait();                                                                                            // 84
  },                                                                                                       // 85
  queueTask: function (task) {                                                                             // 86
    var self = this;                                                                                       // 87
    self._taskHandles.push({                                                                               // 88
      task: task,                                                                                          // 89
      name: task.name                                                                                      // 90
    });                                                                                                    // 91
    self._scheduleRun();                                                                                   // 92
    // No need to block.                                                                                   // 93
  },                                                                                                       // 94
                                                                                                           // 95
  flush: function () {                                                                                     // 96
    var self = this;                                                                                       // 97
    self.runTask(function () {});                                                                          // 98
  },                                                                                                       // 99
                                                                                                           // 100
  safeToRunTask: function () {                                                                             // 101
    var self = this;                                                                                       // 102
    return Fiber.current && self._currentTaskFiber !== Fiber.current;                                      // 103
  },                                                                                                       // 104
                                                                                                           // 105
  drain: function () {                                                                                     // 106
    var self = this;                                                                                       // 107
    if (self._draining)                                                                                    // 108
      return;                                                                                              // 109
    if (!self.safeToRunTask())                                                                             // 110
      return;                                                                                              // 111
    self._draining = true;                                                                                 // 112
    while (!_.isEmpty(self._taskHandles)) {                                                                // 113
      self.flush();                                                                                        // 114
    }                                                                                                      // 115
    self._draining = false;                                                                                // 116
  },                                                                                                       // 117
                                                                                                           // 118
  _scheduleRun: function () {                                                                              // 119
    var self = this;                                                                                       // 120
    // Already running or scheduled? Do nothing.                                                           // 121
    if (self._runningOrRunScheduled)                                                                       // 122
      return;                                                                                              // 123
                                                                                                           // 124
    self._runningOrRunScheduled = true;                                                                    // 125
    process.nextTick(function () {                                                                         // 126
      Fiber(function () {                                                                                  // 127
        self._run();                                                                                       // 128
      }).run();                                                                                            // 129
    });                                                                                                    // 130
  },                                                                                                       // 131
  _run: function () {                                                                                      // 132
    var self = this;                                                                                       // 133
                                                                                                           // 134
    if (!self._runningOrRunScheduled)                                                                      // 135
      throw new Error("expected to be _runningOrRunScheduled");                                            // 136
                                                                                                           // 137
    if (_.isEmpty(self._taskHandles)) {                                                                    // 138
      // Done running tasks! Don't immediately schedule another run, but                                   // 139
      // allow future tasks to do so.                                                                      // 140
      self._runningOrRunScheduled = false;                                                                 // 141
      return;                                                                                              // 142
    }                                                                                                      // 143
    var taskHandle = self._taskHandles.shift();                                                            // 144
                                                                                                           // 145
    // Run the task.                                                                                       // 146
    self._currentTaskFiber = Fiber.current;                                                                // 147
    var exception = undefined;                                                                             // 148
    try {                                                                                                  // 149
      taskHandle.task();                                                                                   // 150
    } catch (err) {                                                                                        // 151
      if (taskHandle.future) {                                                                             // 152
        // We'll throw this exception through runTask.                                                     // 153
        exception = err;                                                                                   // 154
      } else {                                                                                             // 155
        Meteor._debug("Exception in queued task: " + err.stack);                                           // 156
      }                                                                                                    // 157
    }                                                                                                      // 158
    self._currentTaskFiber = undefined;                                                                    // 159
                                                                                                           // 160
    // Soon, run the next task, if there is any.                                                           // 161
    self._runningOrRunScheduled = false;                                                                   // 162
    self._scheduleRun();                                                                                   // 163
                                                                                                           // 164
    // If this was queued with runTask, let the runTask call return (throwing if                           // 165
    // the task threw).                                                                                    // 166
    if (taskHandle.future) {                                                                               // 167
      if (exception)                                                                                       // 168
        taskHandle.future['throw'](exception);                                                             // 169
      else                                                                                                 // 170
        taskHandle.future['return']();                                                                     // 171
    }                                                                                                      // 172
  }                                                                                                        // 173
});                                                                                                        // 174
                                                                                                           // 175
// Sleep. Mostly used for debugging (eg, inserting latency into server                                     // 176
// methods).                                                                                               // 177
//                                                                                                         // 178
Meteor._sleepForMs = function (ms) {                                                                       // 179
  var fiber = Fiber.current;                                                                               // 180
  setTimeout(function() {                                                                                  // 181
    fiber.run();                                                                                           // 182
  }, ms);                                                                                                  // 183
  Fiber.yield();                                                                                           // 184
};                                                                                                         // 185
                                                                                                           // 186
/////////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

/////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                         //
// packages/meteor/startup_server.js                                                                       //
//                                                                                                         //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                           //
Meteor.startup = function (callback) {                                                                     // 1
  __meteor_bootstrap__.startup_hooks.push(callback);                                                       // 2
};                                                                                                         // 3
                                                                                                           // 4
/////////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

/////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                         //
// packages/meteor/debug.js                                                                                //
//                                                                                                         //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                           //
var suppress = 0;                                                                                          // 1
                                                                                                           // 2
// replacement for console.log. This is a temporary API. We should                                         // 3
// provide a real logging API soon (possibly just a polyfill for                                           // 4
// console?)                                                                                               // 5
//                                                                                                         // 6
// NOTE: this is used on the server to print the warning about                                             // 7
// having autopublish enabled when you probably meant to turn it                                           // 8
// off. it's not really the proper use of something called                                                 // 9
// _debug. the intent is for this message to go to the terminal and                                        // 10
// be very visible. if you change _debug to go someplace else, etc,                                        // 11
// please fix the autopublish code to do something reasonable.                                             // 12
//                                                                                                         // 13
Meteor._debug = function (/* arguments */) {                                                               // 14
  if (suppress) {                                                                                          // 15
    suppress--;                                                                                            // 16
    return;                                                                                                // 17
  }                                                                                                        // 18
  if (typeof console !== 'undefined' &&                                                                    // 19
      typeof console.log !== 'undefined') {                                                                // 20
    if (arguments.length == 0) { // IE Companion breaks otherwise                                          // 21
      // IE10 PP4 requires at least one argument                                                           // 22
      console.log('');                                                                                     // 23
    } else {                                                                                               // 24
      // IE doesn't have console.log.apply, it's not a real Object.                                        // 25
      // http://stackoverflow.com/questions/5538972/console-log-apply-not-working-in-ie9                   // 26
      // http://patik.com/blog/complete-cross-browser-console-log/                                         // 27
      if (typeof console.log.apply === "function") {                                                       // 28
        // Most browsers                                                                                   // 29
                                                                                                           // 30
        // Chrome and Safari only hyperlink URLs to source files in first argument of                      // 31
        // console.log, so try to call it with one argument if possible.                                   // 32
        // Approach taken here: If all arguments are strings, join them on space.                          // 33
        // See https://github.com/meteor/meteor/pull/732#issuecomment-13975991                             // 34
        var allArgumentsOfTypeString = true;                                                               // 35
        for (var i = 0; i < arguments.length; i++)                                                         // 36
          if (typeof arguments[i] !== "string")                                                            // 37
            allArgumentsOfTypeString = false;                                                              // 38
                                                                                                           // 39
        if (allArgumentsOfTypeString)                                                                      // 40
          console.log.apply(console, [Array.prototype.join.call(arguments, " ")]);                         // 41
        else                                                                                               // 42
          console.log.apply(console, arguments);                                                           // 43
                                                                                                           // 44
      } else if (typeof Function.prototype.bind === "function") {                                          // 45
        // IE9                                                                                             // 46
        var log = Function.prototype.bind.call(console.log, console);                                      // 47
        log.apply(console, arguments);                                                                     // 48
      } else {                                                                                             // 49
        // IE8                                                                                             // 50
        Function.prototype.call.call(console.log, console, Array.prototype.slice.call(arguments));         // 51
      }                                                                                                    // 52
    }                                                                                                      // 53
  }                                                                                                        // 54
};                                                                                                         // 55
                                                                                                           // 56
// Suppress the next 'count' Meteor._debug messsages. Use this to                                          // 57
// stop tests from spamming the console.                                                                   // 58
//                                                                                                         // 59
Meteor._suppress_log = function (count) {                                                                  // 60
  suppress += count;                                                                                       // 61
};                                                                                                         // 62
                                                                                                           // 63
/////////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

/////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                         //
// packages/meteor/dynamics_nodejs.js                                                                      //
//                                                                                                         //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                           //
// Fiber-aware implementation of dynamic scoping, for use on the server                                    // 1
                                                                                                           // 2
var Fiber = Npm.require('fibers');                                                                         // 3
                                                                                                           // 4
var nextSlot = 0;                                                                                          // 5
                                                                                                           // 6
var noFiberMessage = "Meteor code must always run within a Fiber. " +                                      // 7
                     "Try wrapping callbacks that you pass to non-Meteor " +                               // 8
                     "libraries with Meteor.bindEnvironment.";                                             // 9
                                                                                                           // 10
Meteor.EnvironmentVariable = function () {                                                                 // 11
  this.slot = nextSlot++;                                                                                  // 12
};                                                                                                         // 13
                                                                                                           // 14
_.extend(Meteor.EnvironmentVariable.prototype, {                                                           // 15
  get: function () {                                                                                       // 16
    if (!Fiber.current)                                                                                    // 17
      throw new Error(noFiberMessage);                                                                     // 18
                                                                                                           // 19
    return Fiber.current._meteor_dynamics &&                                                               // 20
      Fiber.current._meteor_dynamics[this.slot];                                                           // 21
  },                                                                                                       // 22
                                                                                                           // 23
  withValue: function (value, func) {                                                                      // 24
    if (!Fiber.current)                                                                                    // 25
      throw new Error(noFiberMessage);                                                                     // 26
                                                                                                           // 27
    if (!Fiber.current._meteor_dynamics)                                                                   // 28
      Fiber.current._meteor_dynamics = [];                                                                 // 29
    var currentValues = Fiber.current._meteor_dynamics;                                                    // 30
                                                                                                           // 31
    var saved = currentValues[this.slot];                                                                  // 32
    try {                                                                                                  // 33
      currentValues[this.slot] = value;                                                                    // 34
      var ret = func();                                                                                    // 35
    } finally {                                                                                            // 36
      currentValues[this.slot] = saved;                                                                    // 37
    }                                                                                                      // 38
                                                                                                           // 39
    return ret;                                                                                            // 40
  }                                                                                                        // 41
});                                                                                                        // 42
                                                                                                           // 43
// Meteor application code is always supposed to be run inside a                                           // 44
// fiber. bindEnvironment ensures that the function it wraps is run from                                   // 45
// inside a fiber and ensures it sees the values of Meteor environment                                     // 46
// variables that are set at the time bindEnvironment is called.                                           // 47
//                                                                                                         // 48
// If an environment-bound function is called from outside a fiber (eg, from                               // 49
// an asynchronous callback from a non-Meteor library such as MongoDB), it'll                              // 50
// kick off a new fiber to execute the function, and returns undefined as soon                             // 51
// as that fiber returns or yields (and func's return value is ignored).                                   // 52
//                                                                                                         // 53
// If it's called inside a fiber, it works normally (the                                                   // 54
// return value of the function will be passed through, and no new                                         // 55
// fiber will be created.)                                                                                 // 56
//                                                                                                         // 57
// `onException` should be a function or a string.  When it is a                                           // 58
// function, it is called as a callback when the bound function raises                                     // 59
// an exception.  If it is a string, it should be a description of the                                     // 60
// callback, and when an exception is raised a debug message will be                                       // 61
// printed with the description.                                                                           // 62
Meteor.bindEnvironment = function (func, onException, _this) {                                             // 63
  if (!Fiber.current)                                                                                      // 64
    throw new Error(noFiberMessage);                                                                       // 65
                                                                                                           // 66
  var boundValues = _.clone(Fiber.current._meteor_dynamics || []);                                         // 67
                                                                                                           // 68
  if (!onException || typeof(onException) === 'string') {                                                  // 69
    var description = onException || "callback of async function";                                         // 70
    onException = function (error) {                                                                       // 71
      Meteor._debug(                                                                                       // 72
        "Exception in " + description + ":",                                                               // 73
        error && error.stack || error                                                                      // 74
      );                                                                                                   // 75
    };                                                                                                     // 76
  }                                                                                                        // 77
                                                                                                           // 78
  return function (/* arguments */) {                                                                      // 79
    var args = _.toArray(arguments);                                                                       // 80
                                                                                                           // 81
    var runWithEnvironment = function () {                                                                 // 82
      var savedValues = Fiber.current._meteor_dynamics;                                                    // 83
      try {                                                                                                // 84
        // Need to clone boundValues in case two fibers invoke this                                        // 85
        // function at the same time                                                                       // 86
        Fiber.current._meteor_dynamics = _.clone(boundValues);                                             // 87
        var ret = func.apply(_this, args);                                                                 // 88
      } catch (e) {                                                                                        // 89
        onException(e);                                                                                    // 90
      } finally {                                                                                          // 91
        Fiber.current._meteor_dynamics = savedValues;                                                      // 92
      }                                                                                                    // 93
      return ret;                                                                                          // 94
    };                                                                                                     // 95
                                                                                                           // 96
    if (Fiber.current)                                                                                     // 97
      return runWithEnvironment();                                                                         // 98
    Fiber(runWithEnvironment).run();                                                                       // 99
  };                                                                                                       // 100
};                                                                                                         // 101
                                                                                                           // 102
/////////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

/////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                         //
// packages/meteor/url_server.js                                                                           //
//                                                                                                         //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                           //
if (process.env.ROOT_URL &&                                                                                // 1
    typeof __meteor_runtime_config__ === "object") {                                                       // 2
  __meteor_runtime_config__.ROOT_URL = process.env.ROOT_URL;                                               // 3
  var pathPrefix = Npm.require('url').parse(__meteor_runtime_config__.ROOT_URL).pathname;                  // 4
  __meteor_runtime_config__.ROOT_URL_PATH_PREFIX = pathPrefix === "/" ? "" : pathPrefix;                   // 5
}                                                                                                          // 6
                                                                                                           // 7
/////////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

/////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                         //
// packages/meteor/url_common.js                                                                           //
//                                                                                                         //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                           //
Meteor.absoluteUrl = function (path, options) {                                                            // 1
  // path is optional                                                                                      // 2
  if (!options && typeof path === 'object') {                                                              // 3
    options = path;                                                                                        // 4
    path = undefined;                                                                                      // 5
  }                                                                                                        // 6
  // merge options with defaults                                                                           // 7
  options = _.extend({}, Meteor.absoluteUrl.defaultOptions, options || {});                                // 8
                                                                                                           // 9
  var url = options.rootUrl;                                                                               // 10
  if (!url)                                                                                                // 11
    throw new Error("Must pass options.rootUrl or set ROOT_URL in the server environment");                // 12
                                                                                                           // 13
  if (!/^http[s]?:\/\//i.test(url)) // url starts with 'http://' or 'https://'                             // 14
    url = 'http://' + url; // we will later fix to https if options.secure is set                          // 15
                                                                                                           // 16
  if (!/\/$/.test(url)) // url ends with '/'                                                               // 17
    url += '/';                                                                                            // 18
                                                                                                           // 19
  if (path)                                                                                                // 20
    url += path;                                                                                           // 21
                                                                                                           // 22
  // turn http to http if secure option is set, and we're not talking                                      // 23
  // to localhost.                                                                                         // 24
  if (options.secure &&                                                                                    // 25
      /^http:/.test(url) && // url starts with 'http:'                                                     // 26
      !/http:\/\/localhost[:\/]/.test(url) && // doesn't match localhost                                   // 27
      !/http:\/\/127\.0\.0\.1[:\/]/.test(url)) // or 127.0.0.1                                             // 28
    url = url.replace(/^http:/, 'https:');                                                                 // 29
                                                                                                           // 30
  if (options.replaceLocalhost)                                                                            // 31
    url = url.replace(/^http:\/\/localhost([:\/].*)/, 'http://127.0.0.1$1');                               // 32
                                                                                                           // 33
  return url;                                                                                              // 34
};                                                                                                         // 35
                                                                                                           // 36
// allow later packages to override default options                                                        // 37
Meteor.absoluteUrl.defaultOptions = { };                                                                   // 38
if (typeof __meteor_runtime_config__ === "object" &&                                                       // 39
    __meteor_runtime_config__.ROOT_URL)                                                                    // 40
  Meteor.absoluteUrl.defaultOptions.rootUrl = __meteor_runtime_config__.ROOT_URL;                          // 41
                                                                                                           // 42
                                                                                                           // 43
Meteor._relativeToSiteRootUrl = function (link) {                                                          // 44
  if (typeof __meteor_runtime_config__ === "object" &&                                                     // 45
      link.substr(0, 1) === "/")                                                                           // 46
    link = (__meteor_runtime_config__.ROOT_URL_PATH_PREFIX || "") + link;                                  // 47
  return link;                                                                                             // 48
};                                                                                                         // 49
                                                                                                           // 50
/////////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);


/* Exports */
if (typeof Package === 'undefined') Package = {};
Package.meteor = {
  Meteor: Meteor
};

})();
