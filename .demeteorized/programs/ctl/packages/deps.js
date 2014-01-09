(function () {

/* Imports */
var Meteor = Package.meteor.Meteor;
var _ = Package.underscore._;

/* Package-scope variables */
var Deps;

(function () {

//////////////////////////////////////////////////////////////////////////////////
//                                                                              //
// packages/deps/deps.js                                                        //
//                                                                              //
//////////////////////////////////////////////////////////////////////////////////
                                                                                //
//////////////////////////////////////////////////                              // 1
// Package docs at http://docs.meteor.com/#deps //                              // 2
//////////////////////////////////////////////////                              // 3
                                                                                // 4
Deps = {};                                                                      // 5
                                                                                // 6
// http://docs.meteor.com/#deps_active                                          // 7
Deps.active = false;                                                            // 8
                                                                                // 9
// http://docs.meteor.com/#deps_currentcomputation                              // 10
Deps.currentComputation = null;                                                 // 11
                                                                                // 12
var setCurrentComputation = function (c) {                                      // 13
  Deps.currentComputation = c;                                                  // 14
  Deps.active = !! c;                                                           // 15
};                                                                              // 16
                                                                                // 17
var _debugFunc = function () {                                                  // 18
  // lazy evaluation because `Meteor` does not exist right away                 // 19
  return (typeof Meteor !== "undefined" ? Meteor._debug :                       // 20
          ((typeof console !== "undefined") && console.log ? console.log :      // 21
           function () {}));                                                    // 22
};                                                                              // 23
                                                                                // 24
var nextId = 1;                                                                 // 25
// computations whose callbacks we should call at flush time                    // 26
var pendingComputations = [];                                                   // 27
// `true` if a Deps.flush is scheduled, or if we are in Deps.flush now          // 28
var willFlush = false;                                                          // 29
// `true` if we are in Deps.flush now                                           // 30
var inFlush = false;                                                            // 31
// `true` if we are computing a computation now, either first time              // 32
// or recompute.  This matches Deps.active unless we are inside                 // 33
// Deps.nonreactive, which nullfies currentComputation even though              // 34
// an enclosing computation may still be running.                               // 35
var inCompute = false;                                                          // 36
                                                                                // 37
var afterFlushCallbacks = [];                                                   // 38
                                                                                // 39
var requireFlush = function () {                                                // 40
  if (! willFlush) {                                                            // 41
    setTimeout(Deps.flush, 0);                                                  // 42
    willFlush = true;                                                           // 43
  }                                                                             // 44
};                                                                              // 45
                                                                                // 46
// Deps.Computation constructor is visible but private                          // 47
// (throws an error if you try to call it)                                      // 48
var constructingComputation = false;                                            // 49
                                                                                // 50
//                                                                              // 51
// http://docs.meteor.com/#deps_computation                                     // 52
//                                                                              // 53
Deps.Computation = function (f, parent) {                                       // 54
  if (! constructingComputation)                                                // 55
    throw new Error(                                                            // 56
      "Deps.Computation constructor is private; use Deps.autorun");             // 57
  constructingComputation = false;                                              // 58
                                                                                // 59
  var self = this;                                                              // 60
                                                                                // 61
  // http://docs.meteor.com/#computation_stopped                                // 62
  self.stopped = false;                                                         // 63
                                                                                // 64
  // http://docs.meteor.com/#computation_invalidated                            // 65
  self.invalidated = false;                                                     // 66
                                                                                // 67
  // http://docs.meteor.com/#computation_firstrun                               // 68
  self.firstRun = true;                                                         // 69
                                                                                // 70
  self._id = nextId++;                                                          // 71
  self._onInvalidateCallbacks = [];                                             // 72
  // the plan is at some point to use the parent relation                       // 73
  // to constrain the order that computations are processed                     // 74
  self._parent = parent;                                                        // 75
  self._func = f;                                                               // 76
  self._recomputing = false;                                                    // 77
                                                                                // 78
  var errored = true;                                                           // 79
  try {                                                                         // 80
    self._compute();                                                            // 81
    errored = false;                                                            // 82
  } finally {                                                                   // 83
    self.firstRun = false;                                                      // 84
    if (errored)                                                                // 85
      self.stop();                                                              // 86
  }                                                                             // 87
};                                                                              // 88
                                                                                // 89
_.extend(Deps.Computation.prototype, {                                          // 90
                                                                                // 91
  // http://docs.meteor.com/#computation_oninvalidate                           // 92
  onInvalidate: function (f) {                                                  // 93
    var self = this;                                                            // 94
                                                                                // 95
    if (typeof f !== 'function')                                                // 96
      throw new Error("onInvalidate requires a function");                      // 97
                                                                                // 98
    var g = function () {                                                       // 99
      Deps.nonreactive(function () {                                            // 100
        f(self);                                                                // 101
      });                                                                       // 102
    };                                                                          // 103
                                                                                // 104
    if (self.invalidated)                                                       // 105
      g();                                                                      // 106
    else                                                                        // 107
      self._onInvalidateCallbacks.push(g);                                      // 108
  },                                                                            // 109
                                                                                // 110
  // http://docs.meteor.com/#computation_invalidate                             // 111
  invalidate: function () {                                                     // 112
    var self = this;                                                            // 113
    if (! self.invalidated) {                                                   // 114
      // if we're currently in _recompute(), don't enqueue                      // 115
      // ourselves, since we'll rerun immediately anyway.                       // 116
      if (! self._recomputing && ! self.stopped) {                              // 117
        requireFlush();                                                         // 118
        pendingComputations.push(this);                                         // 119
      }                                                                         // 120
                                                                                // 121
      self.invalidated = true;                                                  // 122
                                                                                // 123
      // callbacks can't add callbacks, because                                 // 124
      // self.invalidated === true.                                             // 125
      for(var i = 0, f; f = self._onInvalidateCallbacks[i]; i++)                // 126
        f(); // already bound with self as argument                             // 127
      self._onInvalidateCallbacks = [];                                         // 128
    }                                                                           // 129
  },                                                                            // 130
                                                                                // 131
  // http://docs.meteor.com/#computation_stop                                   // 132
  stop: function () {                                                           // 133
    if (! this.stopped) {                                                       // 134
      this.stopped = true;                                                      // 135
      this.invalidate();                                                        // 136
    }                                                                           // 137
  },                                                                            // 138
                                                                                // 139
  _compute: function () {                                                       // 140
    var self = this;                                                            // 141
    self.invalidated = false;                                                   // 142
                                                                                // 143
    var previous = Deps.currentComputation;                                     // 144
    setCurrentComputation(self);                                                // 145
    var previousInCompute = inCompute;                                          // 146
    inCompute = true;                                                           // 147
    try {                                                                       // 148
      self._func(self);                                                         // 149
    } finally {                                                                 // 150
      setCurrentComputation(previous);                                          // 151
      inCompute = false;                                                        // 152
    }                                                                           // 153
  },                                                                            // 154
                                                                                // 155
  _recompute: function () {                                                     // 156
    var self = this;                                                            // 157
                                                                                // 158
    self._recomputing = true;                                                   // 159
    while (self.invalidated && ! self.stopped) {                                // 160
      try {                                                                     // 161
        self._compute();                                                        // 162
      } catch (e) {                                                             // 163
        _debugFunc()("Exception from Deps recompute:", e.stack || e.message);   // 164
      }                                                                         // 165
      // If _compute() invalidated us, we run again immediately.                // 166
      // A computation that invalidates itself indefinitely is an               // 167
      // infinite loop, of course.                                              // 168
      //                                                                        // 169
      // We could put an iteration counter here and catch run-away              // 170
      // loops.                                                                 // 171
    }                                                                           // 172
    self._recomputing = false;                                                  // 173
  }                                                                             // 174
});                                                                             // 175
                                                                                // 176
//                                                                              // 177
// http://docs.meteor.com/#deps_dependency                                      // 178
//                                                                              // 179
Deps.Dependency = function () {                                                 // 180
  this._dependentsById = {};                                                    // 181
};                                                                              // 182
                                                                                // 183
_.extend(Deps.Dependency.prototype, {                                           // 184
  // http://docs.meteor.com/#dependency_depend                                  // 185
  //                                                                            // 186
  // Adds `computation` to this set if it is not already                        // 187
  // present.  Returns true if `computation` is a new member of the set.        // 188
  // If no argument, defaults to currentComputation, or does nothing            // 189
  // if there is no currentComputation.                                         // 190
  depend: function (computation) {                                              // 191
    if (! computation) {                                                        // 192
      if (! Deps.active)                                                        // 193
        return false;                                                           // 194
                                                                                // 195
      computation = Deps.currentComputation;                                    // 196
    }                                                                           // 197
    var self = this;                                                            // 198
    var id = computation._id;                                                   // 199
    if (! (id in self._dependentsById)) {                                       // 200
      self._dependentsById[id] = computation;                                   // 201
      computation.onInvalidate(function () {                                    // 202
        delete self._dependentsById[id];                                        // 203
      });                                                                       // 204
      return true;                                                              // 205
    }                                                                           // 206
    return false;                                                               // 207
  },                                                                            // 208
                                                                                // 209
  // http://docs.meteor.com/#dependency_changed                                 // 210
  changed: function () {                                                        // 211
    var self = this;                                                            // 212
    for (var id in self._dependentsById)                                        // 213
      self._dependentsById[id].invalidate();                                    // 214
  },                                                                            // 215
                                                                                // 216
  // http://docs.meteor.com/#dependency_hasdependents                           // 217
  hasDependents: function () {                                                  // 218
    var self = this;                                                            // 219
    for(var id in self._dependentsById)                                         // 220
      return true;                                                              // 221
    return false;                                                               // 222
  }                                                                             // 223
});                                                                             // 224
                                                                                // 225
_.extend(Deps, {                                                                // 226
  // http://docs.meteor.com/#deps_flush                                         // 227
  flush: function () {                                                          // 228
    // Nested flush could plausibly happen if, say, a flush causes              // 229
    // DOM mutation, which causes a "blur" event, which runs an                 // 230
    // app event handler that calls Deps.flush.  At the moment                  // 231
    // Spark blocks event handlers during DOM mutation anyway,                  // 232
    // because the LiveRange tree isn't valid.  And we don't have               // 233
    // any useful notion of a nested flush.                                     // 234
    //                                                                          // 235
    // https://app.asana.com/0/159908330244/385138233856                        // 236
    if (inFlush)                                                                // 237
      throw new Error("Can't call Deps.flush while flushing");                  // 238
                                                                                // 239
    if (inCompute)                                                              // 240
      throw new Error("Can't flush inside Deps.autorun");                       // 241
                                                                                // 242
    inFlush = true;                                                             // 243
    willFlush = true;                                                           // 244
                                                                                // 245
    while (pendingComputations.length ||                                        // 246
           afterFlushCallbacks.length) {                                        // 247
                                                                                // 248
      // recompute all pending computations                                     // 249
      var comps = pendingComputations;                                          // 250
      pendingComputations = [];                                                 // 251
                                                                                // 252
      for (var i = 0, comp; comp = comps[i]; i++)                               // 253
        comp._recompute();                                                      // 254
                                                                                // 255
      if (afterFlushCallbacks.length) {                                         // 256
        // call one afterFlush callback, which may                              // 257
        // invalidate more computations                                         // 258
        var func = afterFlushCallbacks.shift();                                 // 259
        try {                                                                   // 260
          func();                                                               // 261
        } catch (e) {                                                           // 262
          _debugFunc()("Exception from Deps afterFlush function:",              // 263
                       e.stack || e.message);                                   // 264
        }                                                                       // 265
      }                                                                         // 266
    }                                                                           // 267
                                                                                // 268
    inFlush = false;                                                            // 269
    willFlush = false;                                                          // 270
  },                                                                            // 271
                                                                                // 272
  // http://docs.meteor.com/#deps_autorun                                       // 273
  //                                                                            // 274
  // Run f(). Record its dependencies. Rerun it whenever the                    // 275
  // dependencies change.                                                       // 276
  //                                                                            // 277
  // Returns a new Computation, which is also passed to f.                      // 278
  //                                                                            // 279
  // Links the computation to the current computation                           // 280
  // so that it is stopped if the current computation is invalidated.           // 281
  autorun: function (f) {                                                       // 282
    if (typeof f !== 'function')                                                // 283
      throw new Error('Deps.autorun requires a function argument');             // 284
                                                                                // 285
    constructingComputation = true;                                             // 286
    var c = new Deps.Computation(f, Deps.currentComputation);                   // 287
                                                                                // 288
    if (Deps.active)                                                            // 289
      Deps.onInvalidate(function () {                                           // 290
        c.stop();                                                               // 291
      });                                                                       // 292
                                                                                // 293
    return c;                                                                   // 294
  },                                                                            // 295
                                                                                // 296
  // http://docs.meteor.com/#deps_nonreactive                                   // 297
  //                                                                            // 298
  // Run `f` with no current computation, returning the return value            // 299
  // of `f`.  Used to turn off reactivity for the duration of `f`,              // 300
  // so that reactive data sources accessed by `f` will not result in any       // 301
  // computations being invalidated.                                            // 302
  nonreactive: function (f) {                                                   // 303
    var previous = Deps.currentComputation;                                     // 304
    setCurrentComputation(null);                                                // 305
    try {                                                                       // 306
      return f();                                                               // 307
    } finally {                                                                 // 308
      setCurrentComputation(previous);                                          // 309
    }                                                                           // 310
  },                                                                            // 311
                                                                                // 312
  // Wrap `f` so that it is always run nonreactively.                           // 313
  _makeNonreactive: function (f) {                                              // 314
    if (f.$isNonreactive) // avoid multiple layers of wrapping.                 // 315
      return f;                                                                 // 316
    var nonreactiveVersion = function (/*arguments*/) {                         // 317
      var self = this;                                                          // 318
      var args = _.toArray(arguments);                                          // 319
      var ret;                                                                  // 320
      Deps.nonreactive(function () {                                            // 321
        ret = f.apply(self, args);                                              // 322
      });                                                                       // 323
      return ret;                                                               // 324
    };                                                                          // 325
    nonreactiveVersion.$isNonreactive = true;                                   // 326
    return nonreactiveVersion;                                                  // 327
  },                                                                            // 328
                                                                                // 329
  // http://docs.meteor.com/#deps_oninvalidate                                  // 330
  onInvalidate: function (f) {                                                  // 331
    if (! Deps.active)                                                          // 332
      throw new Error("Deps.onInvalidate requires a currentComputation");       // 333
                                                                                // 334
    Deps.currentComputation.onInvalidate(f);                                    // 335
  },                                                                            // 336
                                                                                // 337
  // http://docs.meteor.com/#deps_afterflush                                    // 338
  afterFlush: function (f) {                                                    // 339
    afterFlushCallbacks.push(f);                                                // 340
    requireFlush();                                                             // 341
  }                                                                             // 342
});                                                                             // 343
                                                                                // 344
//////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

//////////////////////////////////////////////////////////////////////////////////
//                                                                              //
// packages/deps/deprecated.js                                                  //
//                                                                              //
//////////////////////////////////////////////////////////////////////////////////
                                                                                //
// Deprecated (Deps-recated?) functions.                                        // 1
                                                                                // 2
// These functions used to be on the Meteor object (and worked slightly         // 3
// differently).                                                                // 4
// XXX COMPAT WITH 0.5.7                                                        // 5
Meteor.flush = Deps.flush;                                                      // 6
Meteor.autorun = Deps.autorun;                                                  // 7
                                                                                // 8
// We used to require a special "autosubscribe" call to reactively subscribe to // 9
// things. Now, it works with autorun.                                          // 10
// XXX COMPAT WITH 0.5.4                                                        // 11
Meteor.autosubscribe = Deps.autorun;                                            // 12
                                                                                // 13
// This Deps API briefly existed in 0.5.8 and 0.5.9                             // 14
// XXX COMPAT WITH 0.5.9                                                        // 15
Deps.depend = function (d) {                                                    // 16
  return d.depend();                                                            // 17
};                                                                              // 18
                                                                                // 19
//////////////////////////////////////////////////////////////////////////////////

}).call(this);


/* Exports */
if (typeof Package === 'undefined') Package = {};
Package.deps = {
  Deps: Deps
};

})();
