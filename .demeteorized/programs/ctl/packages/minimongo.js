(function () {

/* Imports */
var Meteor = Package.meteor.Meteor;
var _ = Package.underscore._;
var EJSON = Package.ejson.EJSON;
var OrderedDict = Package['ordered-dict'].OrderedDict;
var Deps = Package.deps.Deps;
var Random = Package.random.Random;
var GeoJSON = Package['geojson-utils'].GeoJSON;

/* Package-scope variables */
var LocalCollection, MinimongoTest, MinimongoError, projectionDetails, pathsToTree, getPathsWithoutNumericKeys;

(function () {

////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                    //
// packages/minimongo/minimongo.js                                                                    //
//                                                                                                    //
////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                      //
// XXX type checking on selectors (graceful error if malformed)                                       // 1
                                                                                                      // 2
// LocalCollection: a set of documents that supports queries and modifiers.                           // 3
                                                                                                      // 4
// Cursor: a specification for a particular subset of documents, w/                                   // 5
// a defined order, limit, and offset.  creating a Cursor with LocalCollection.find(),                // 6
                                                                                                      // 7
// ObserveHandle: the return value of a live query.                                                   // 8
                                                                                                      // 9
LocalCollection = function (name) {                                                                   // 10
  this.name = name;                                                                                   // 11
  this.docs = {}; // _id -> document (also containing id)                                             // 12
                                                                                                      // 13
  this._observeQueue = new Meteor._SynchronousQueue();                                                // 14
                                                                                                      // 15
  this.next_qid = 1; // live query id generator                                                       // 16
                                                                                                      // 17
  // qid -> live query object. keys:                                                                  // 18
  //  ordered: bool. ordered queries have addedBefore/movedBefore callbacks.                          // 19
  //  results: array (ordered) or object (unordered) of current results                               // 20
  //  results_snapshot: snapshot of results. null if not paused.                                      // 21
  //  cursor: Cursor object for the query.                                                            // 22
  //  selector_f, sort_f, (callbacks): functions                                                      // 23
  this.queries = {};                                                                                  // 24
                                                                                                      // 25
  // null if not saving originals; a map from id to original document value if                        // 26
  // saving originals. See comments before saveOriginals().                                           // 27
  this._savedOriginals = null;                                                                        // 28
                                                                                                      // 29
  // True when observers are paused and we should not send callbacks.                                 // 30
  this.paused = false;                                                                                // 31
};                                                                                                    // 32
                                                                                                      // 33
// Object exported only for unit testing.                                                             // 34
// Use it to export private functions to test in Tinytest.                                            // 35
MinimongoTest = {};                                                                                   // 36
                                                                                                      // 37
LocalCollection._applyChanges = function (doc, changeFields) {                                        // 38
  _.each(changeFields, function (value, key) {                                                        // 39
    if (value === undefined)                                                                          // 40
      delete doc[key];                                                                                // 41
    else                                                                                              // 42
      doc[key] = value;                                                                               // 43
  });                                                                                                 // 44
};                                                                                                    // 45
                                                                                                      // 46
MinimongoError = function (message) {                                                                 // 47
  var e = new Error(message);                                                                         // 48
  e.name = "MinimongoError";                                                                          // 49
  return e;                                                                                           // 50
};                                                                                                    // 51
                                                                                                      // 52
                                                                                                      // 53
// options may include sort, skip, limit, reactive                                                    // 54
// sort may be any of these forms:                                                                    // 55
//     {a: 1, b: -1}                                                                                  // 56
//     [["a", "asc"], ["b", "desc"]]                                                                  // 57
//     ["a", ["b", "desc"]]                                                                           // 58
//   (in the first form you're beholden to key enumeration order in                                   // 59
//   your javascript VM)                                                                              // 60
//                                                                                                    // 61
// reactive: if given, and false, don't register with Deps (default                                   // 62
// is true)                                                                                           // 63
//                                                                                                    // 64
// XXX possibly should support retrieving a subset of fields? and                                     // 65
// have it be a hint (ignored on the client, when not copying the                                     // 66
// doc?)                                                                                              // 67
//                                                                                                    // 68
// XXX sort does not yet support subkeys ('a.b') .. fix that!                                         // 69
// XXX add one more sort form: "key"                                                                  // 70
// XXX tests                                                                                          // 71
LocalCollection.prototype.find = function (selector, options) {                                       // 72
  // default syntax for everything is to omit the selector argument.                                  // 73
  // but if selector is explicitly passed in as false or undefined, we                                // 74
  // want a selector that matches nothing.                                                            // 75
  if (arguments.length === 0)                                                                         // 76
    selector = {};                                                                                    // 77
                                                                                                      // 78
  return new LocalCollection.Cursor(this, selector, options);                                         // 79
};                                                                                                    // 80
                                                                                                      // 81
// don't call this ctor directly.  use LocalCollection.find().                                        // 82
LocalCollection.Cursor = function (collection, selector, options) {                                   // 83
  var self = this;                                                                                    // 84
  if (!options) options = {};                                                                         // 85
                                                                                                      // 86
  this.collection = collection;                                                                       // 87
                                                                                                      // 88
  if (LocalCollection._selectorIsId(selector)) {                                                      // 89
    // stash for fast path                                                                            // 90
    self.selector_id = LocalCollection._idStringify(selector);                                        // 91
    self.selector_f = LocalCollection._compileSelector(selector, self);                               // 92
    self.sort_f = undefined;                                                                          // 93
  } else {                                                                                            // 94
    // MongoDB throws different errors on different branching operators                               // 95
    // containing $near                                                                               // 96
    if (isGeoQuerySpecial(selector))                                                                  // 97
      throw new Error("$near can't be inside $or/$and/$nor/$not");                                    // 98
                                                                                                      // 99
    self.selector_id = undefined;                                                                     // 100
    self.selector_f = LocalCollection._compileSelector(selector, self);                               // 101
    self.sort_f = (isGeoQuery(selector) || options.sort) ?                                            // 102
      LocalCollection._compileSort(options.sort || [], self) : null;                                  // 103
  }                                                                                                   // 104
  self.skip = options.skip;                                                                           // 105
  self.limit = options.limit;                                                                         // 106
  self.fields = options.fields;                                                                       // 107
                                                                                                      // 108
  if (self.fields)                                                                                    // 109
    self.projection_f = LocalCollection._compileProjection(self.fields);                              // 110
                                                                                                      // 111
  if (options.transform && typeof Deps !== "undefined")                                               // 112
    self._transform = Deps._makeNonreactive(options.transform);                                       // 113
  else                                                                                                // 114
    self._transform = options.transform;                                                              // 115
                                                                                                      // 116
  // db_objects is a list of the objects that match the cursor. (It's always a                        // 117
  // list, never an object: LocalCollection.Cursor is always ordered.)                                // 118
  self.db_objects = null;                                                                             // 119
  self.cursor_pos = 0;                                                                                // 120
                                                                                                      // 121
  // by default, queries register w/ Deps when it is available.                                       // 122
  if (typeof Deps !== "undefined")                                                                    // 123
    self.reactive = (options.reactive === undefined) ? true : options.reactive;                       // 124
};                                                                                                    // 125
                                                                                                      // 126
LocalCollection.Cursor.prototype.rewind = function () {                                               // 127
  var self = this;                                                                                    // 128
  self.db_objects = null;                                                                             // 129
  self.cursor_pos = 0;                                                                                // 130
};                                                                                                    // 131
                                                                                                      // 132
LocalCollection.prototype.findOne = function (selector, options) {                                    // 133
  if (arguments.length === 0)                                                                         // 134
    selector = {};                                                                                    // 135
                                                                                                      // 136
  // NOTE: by setting limit 1 here, we end up using very inefficient                                  // 137
  // code that recomputes the whole query on each update. The upside is                               // 138
  // that when you reactively depend on a findOne you only get                                        // 139
  // invalidated when the found object changes, not any object in the                                 // 140
  // collection. Most findOne will be by id, which has a fast path, so                                // 141
  // this might not be a big deal. In most cases, invalidation causes                                 // 142
  // the called to re-query anyway, so this should be a net performance                               // 143
  // improvement.                                                                                     // 144
  options = options || {};                                                                            // 145
  options.limit = 1;                                                                                  // 146
                                                                                                      // 147
  return this.find(selector, options).fetch()[0];                                                     // 148
};                                                                                                    // 149
                                                                                                      // 150
LocalCollection.Cursor.prototype.forEach = function (callback, thisArg) {                             // 151
  var self = this;                                                                                    // 152
                                                                                                      // 153
  if (self.db_objects === null)                                                                       // 154
    self.db_objects = self._getRawObjects(true);                                                      // 155
                                                                                                      // 156
  if (self.reactive)                                                                                  // 157
    self._depend({                                                                                    // 158
      addedBefore: true,                                                                              // 159
      removed: true,                                                                                  // 160
      changed: true,                                                                                  // 161
      movedBefore: true});                                                                            // 162
                                                                                                      // 163
  while (self.cursor_pos < self.db_objects.length) {                                                  // 164
    var elt = EJSON.clone(self.db_objects[self.cursor_pos]);                                          // 165
    if (self.projection_f)                                                                            // 166
      elt = self.projection_f(elt);                                                                   // 167
    if (self._transform)                                                                              // 168
      elt = self._transform(elt);                                                                     // 169
    callback.call(thisArg, elt, self.cursor_pos, self);                                               // 170
    ++self.cursor_pos;                                                                                // 171
  }                                                                                                   // 172
};                                                                                                    // 173
                                                                                                      // 174
LocalCollection.Cursor.prototype.getTransform = function () {                                         // 175
  var self = this;                                                                                    // 176
  return self._transform;                                                                             // 177
};                                                                                                    // 178
                                                                                                      // 179
LocalCollection.Cursor.prototype.map = function (callback, thisArg) {                                 // 180
  var self = this;                                                                                    // 181
  var res = [];                                                                                       // 182
  self.forEach(function (doc, index) {                                                                // 183
    res.push(callback.call(thisArg, doc, index, self));                                               // 184
  });                                                                                                 // 185
  return res;                                                                                         // 186
};                                                                                                    // 187
                                                                                                      // 188
LocalCollection.Cursor.prototype.fetch = function () {                                                // 189
  var self = this;                                                                                    // 190
  var res = [];                                                                                       // 191
  self.forEach(function (doc) {                                                                       // 192
    res.push(doc);                                                                                    // 193
  });                                                                                                 // 194
  return res;                                                                                         // 195
};                                                                                                    // 196
                                                                                                      // 197
LocalCollection.Cursor.prototype.count = function () {                                                // 198
  var self = this;                                                                                    // 199
                                                                                                      // 200
  if (self.reactive)                                                                                  // 201
    self._depend({added: true, removed: true},                                                        // 202
                 true /* allow the observe to be unordered */);                                       // 203
                                                                                                      // 204
  if (self.db_objects === null)                                                                       // 205
    self.db_objects = self._getRawObjects(true);                                                      // 206
                                                                                                      // 207
  return self.db_objects.length;                                                                      // 208
};                                                                                                    // 209
                                                                                                      // 210
LocalCollection.Cursor.prototype._publishCursor = function (sub) {                                    // 211
  var self = this;                                                                                    // 212
  if (! self.collection.name)                                                                         // 213
    throw new Error("Can't publish a cursor from a collection without a name.");                      // 214
  var collection = self.collection.name;                                                              // 215
                                                                                                      // 216
  // XXX minimongo should not depend on mongo-livedata!                                               // 217
  return Meteor.Collection._publishCursor(self, sub, collection);                                     // 218
};                                                                                                    // 219
                                                                                                      // 220
LocalCollection._observeChangesCallbacksAreOrdered = function (callbacks) {                           // 221
  if (callbacks.added && callbacks.addedBefore)                                                       // 222
    throw new Error("Please specify only one of added() and addedBefore()");                          // 223
  return !!(callbacks.addedBefore || callbacks.movedBefore);                                          // 224
};                                                                                                    // 225
                                                                                                      // 226
LocalCollection._observeCallbacksAreOrdered = function (callbacks) {                                  // 227
  if (callbacks.addedAt && callbacks.added)                                                           // 228
    throw new Error("Please specify only one of added() and addedAt()");                              // 229
  if (callbacks.changedAt && callbacks.changed)                                                       // 230
    throw new Error("Please specify only one of changed() and changedAt()");                          // 231
  if (callbacks.removed && callbacks.removedAt)                                                       // 232
    throw new Error("Please specify only one of removed() and removedAt()");                          // 233
                                                                                                      // 234
  return !!(callbacks.addedAt || callbacks.movedTo || callbacks.changedAt                             // 235
            || callbacks.removedAt);                                                                  // 236
};                                                                                                    // 237
                                                                                                      // 238
// the handle that comes back from observe.                                                           // 239
LocalCollection.ObserveHandle = function () {};                                                       // 240
                                                                                                      // 241
// options to contain:                                                                                // 242
//  * callbacks for observe():                                                                        // 243
//    - addedAt (document, atIndex)                                                                   // 244
//    - added (document)                                                                              // 245
//    - changedAt (newDocument, oldDocument, atIndex)                                                 // 246
//    - changed (newDocument, oldDocument)                                                            // 247
//    - removedAt (document, atIndex)                                                                 // 248
//    - removed (document)                                                                            // 249
//    - movedTo (document, oldIndex, newIndex)                                                        // 250
//                                                                                                    // 251
// attributes available on returned query handle:                                                     // 252
//  * stop(): end updates                                                                             // 253
//  * collection: the collection this query is querying                                               // 254
//                                                                                                    // 255
// iff x is a returned query handle, (x instanceof                                                    // 256
// LocalCollection.ObserveHandle) is true                                                             // 257
//                                                                                                    // 258
// initial results delivered through added callback                                                   // 259
// XXX maybe callbacks should take a list of objects, to expose transactions?                         // 260
// XXX maybe support field limiting (to limit what you're notified on)                                // 261
                                                                                                      // 262
_.extend(LocalCollection.Cursor.prototype, {                                                          // 263
  observe: function (options) {                                                                       // 264
    var self = this;                                                                                  // 265
    return LocalCollection._observeFromObserveChanges(self, options);                                 // 266
  },                                                                                                  // 267
  observeChanges: function (options) {                                                                // 268
    var self = this;                                                                                  // 269
                                                                                                      // 270
    var ordered = LocalCollection._observeChangesCallbacksAreOrdered(options);                        // 271
                                                                                                      // 272
    if (!options._allow_unordered && !ordered && (self.skip || self.limit))                           // 273
      throw new Error("must use ordered observe with skip or limit");                                 // 274
                                                                                                      // 275
    // XXX merge this object w/ "this" Cursor.  they're the same.                                     // 276
    var query = {                                                                                     // 277
      selector_f: self.selector_f, // not fast pathed                                                 // 278
      sort_f: ordered && self.sort_f,                                                                 // 279
      results_snapshot: null,                                                                         // 280
      ordered: ordered,                                                                               // 281
      cursor: self,                                                                                   // 282
      observeChanges: options.observeChanges,                                                         // 283
      fields: self.fields,                                                                            // 284
      projection_f: self.projection_f                                                                 // 285
    };                                                                                                // 286
    var qid;                                                                                          // 287
                                                                                                      // 288
    // Non-reactive queries call added[Before] and then never call anything                           // 289
    // else.                                                                                          // 290
    if (self.reactive) {                                                                              // 291
      qid = self.collection.next_qid++;                                                               // 292
      self.collection.queries[qid] = query;                                                           // 293
    }                                                                                                 // 294
    query.results = self._getRawObjects(ordered);                                                     // 295
    if (self.collection.paused)                                                                       // 296
      query.results_snapshot = (ordered ? [] : {});                                                   // 297
                                                                                                      // 298
    // wrap callbacks we were passed. callbacks only fire when not paused and                         // 299
    // are never undefined                                                                            // 300
    // Filters out blacklisted fields according to cursor's projection.                               // 301
    // XXX wrong place for this?                                                                      // 302
                                                                                                      // 303
    // furthermore, callbacks enqueue until the operation we're working on is                         // 304
    // done.                                                                                          // 305
    var wrapCallback = function (f, fieldsIndex, ignoreEmptyFields) {                                 // 306
      if (!f)                                                                                         // 307
        return function () {};                                                                        // 308
      return function (/*args*/) {                                                                    // 309
        var context = this;                                                                           // 310
        var args = arguments;                                                                         // 311
                                                                                                      // 312
        if (fieldsIndex !== undefined && self.projection_f) {                                         // 313
          args[fieldsIndex] = self.projection_f(args[fieldsIndex]);                                   // 314
          if (ignoreEmptyFields && _.isEmpty(args[fieldsIndex]))                                      // 315
            return;                                                                                   // 316
        }                                                                                             // 317
                                                                                                      // 318
        if (!self.collection.paused) {                                                                // 319
          self.collection._observeQueue.queueTask(function () {                                       // 320
            f.apply(context, args);                                                                   // 321
          });                                                                                         // 322
        }                                                                                             // 323
      };                                                                                              // 324
    };                                                                                                // 325
    query.added = wrapCallback(options.added, 1);                                                     // 326
    query.changed = wrapCallback(options.changed, 1, true);                                           // 327
    query.removed = wrapCallback(options.removed);                                                    // 328
    if (ordered) {                                                                                    // 329
      query.addedBefore = wrapCallback(options.addedBefore, 1);                                       // 330
      query.movedBefore = wrapCallback(options.movedBefore);                                          // 331
    }                                                                                                 // 332
                                                                                                      // 333
    if (!options._suppress_initial && !self.collection.paused) {                                      // 334
      _.each(query.results, function (doc, i) {                                                       // 335
        var fields = EJSON.clone(doc);                                                                // 336
                                                                                                      // 337
        delete fields._id;                                                                            // 338
        if (ordered)                                                                                  // 339
          query.addedBefore(doc._id, fields, null);                                                   // 340
        query.added(doc._id, fields);                                                                 // 341
      });                                                                                             // 342
    }                                                                                                 // 343
                                                                                                      // 344
    var handle = new LocalCollection.ObserveHandle;                                                   // 345
    _.extend(handle, {                                                                                // 346
      collection: self.collection,                                                                    // 347
      stop: function () {                                                                             // 348
        if (self.reactive)                                                                            // 349
          delete self.collection.queries[qid];                                                        // 350
      }                                                                                               // 351
    });                                                                                               // 352
                                                                                                      // 353
    if (self.reactive && Deps.active) {                                                               // 354
      // XXX in many cases, the same observe will be recreated when                                   // 355
      // the current autorun is rerun.  we could save work by                                         // 356
      // letting it linger across rerun and potentially get                                           // 357
      // repurposed if the same observe is performed, using logic                                     // 358
      // similar to that of Meteor.subscribe.                                                         // 359
      Deps.onInvalidate(function () {                                                                 // 360
        handle.stop();                                                                                // 361
      });                                                                                             // 362
    }                                                                                                 // 363
    // run the observe callbacks resulting from the initial contents                                  // 364
    // before we leave the observe.                                                                   // 365
    self.collection._observeQueue.drain();                                                            // 366
                                                                                                      // 367
    return handle;                                                                                    // 368
  }                                                                                                   // 369
});                                                                                                   // 370
                                                                                                      // 371
// Returns a collection of matching objects, but doesn't deep copy them.                              // 372
//                                                                                                    // 373
// If ordered is set, returns a sorted array, respecting sort_f, skip, and limit                      // 374
// properties of the query.  if sort_f is falsey, no sort -- you get the natural                      // 375
// order.                                                                                             // 376
//                                                                                                    // 377
// If ordered is not set, returns an object mapping from ID to doc (sort_f, skip                      // 378
// and limit should not be set).                                                                      // 379
LocalCollection.Cursor.prototype._getRawObjects = function (ordered) {                                // 380
  var self = this;                                                                                    // 381
                                                                                                      // 382
  var results = ordered ? [] : {};                                                                    // 383
                                                                                                      // 384
  // fast path for single ID value                                                                    // 385
  if (self.selector_id) {                                                                             // 386
    // If you have non-zero skip and ask for a single id, you get                                     // 387
    // nothing. This is so it matches the behavior of the '{_id: foo}'                                // 388
    // path.                                                                                          // 389
    if (self.skip)                                                                                    // 390
      return results;                                                                                 // 391
                                                                                                      // 392
    if (_.has(self.collection.docs, self.selector_id)) {                                              // 393
      var selectedDoc = self.collection.docs[self.selector_id];                                       // 394
      if (ordered)                                                                                    // 395
        results.push(selectedDoc);                                                                    // 396
      else                                                                                            // 397
        results[self.selector_id] = selectedDoc;                                                      // 398
    }                                                                                                 // 399
    return results;                                                                                   // 400
  }                                                                                                   // 401
                                                                                                      // 402
  // slow path for arbitrary selector, sort, skip, limit                                              // 403
  for (var id in self.collection.docs) {                                                              // 404
    var doc = self.collection.docs[id];                                                               // 405
    if (self.selector_f(doc)) {                                                                       // 406
      if (ordered)                                                                                    // 407
        results.push(doc);                                                                            // 408
      else                                                                                            // 409
        results[id] = doc;                                                                            // 410
    }                                                                                                 // 411
    // Fast path for limited unsorted queries.                                                        // 412
    if (self.limit && !self.skip && !self.sort_f &&                                                   // 413
        results.length === self.limit)                                                                // 414
      return results;                                                                                 // 415
  }                                                                                                   // 416
                                                                                                      // 417
  if (!ordered)                                                                                       // 418
    return results;                                                                                   // 419
                                                                                                      // 420
  if (self.sort_f)                                                                                    // 421
    results.sort(self.sort_f);                                                                        // 422
                                                                                                      // 423
  var idx_start = self.skip || 0;                                                                     // 424
  var idx_end = self.limit ? (self.limit + idx_start) : results.length;                               // 425
  return results.slice(idx_start, idx_end);                                                           // 426
};                                                                                                    // 427
                                                                                                      // 428
// XXX Maybe we need a version of observe that just calls a callback if                               // 429
// anything changed.                                                                                  // 430
LocalCollection.Cursor.prototype._depend = function (changers, _allow_unordered) {                    // 431
  var self = this;                                                                                    // 432
                                                                                                      // 433
  if (Deps.active) {                                                                                  // 434
    var v = new Deps.Dependency;                                                                      // 435
    v.depend();                                                                                       // 436
    var notifyChange = _.bind(v.changed, v);                                                          // 437
                                                                                                      // 438
    var options = {                                                                                   // 439
      _suppress_initial: true,                                                                        // 440
      _allow_unordered: _allow_unordered                                                              // 441
    };                                                                                                // 442
    _.each(['added', 'changed', 'removed', 'addedBefore', 'movedBefore'],                             // 443
           function (fnName) {                                                                        // 444
             if (changers[fnName])                                                                    // 445
               options[fnName] = notifyChange;                                                        // 446
           });                                                                                        // 447
                                                                                                      // 448
    // observeChanges will stop() when this computation is invalidated                                // 449
    self.observeChanges(options);                                                                     // 450
  }                                                                                                   // 451
};                                                                                                    // 452
                                                                                                      // 453
// XXX enforce rule that field names can't start with '$' or contain '.'                              // 454
// (real mongodb does in fact enforce this)                                                           // 455
// XXX possibly enforce that 'undefined' does not appear (we assume                                   // 456
// this in our handling of null and $exists)                                                          // 457
LocalCollection.prototype.insert = function (doc, callback) {                                         // 458
  var self = this;                                                                                    // 459
  doc = EJSON.clone(doc);                                                                             // 460
                                                                                                      // 461
  if (!_.has(doc, '_id')) {                                                                           // 462
    // if you really want to use ObjectIDs, set this global.                                          // 463
    // Meteor.Collection specifies its own ids and does not use this code.                            // 464
    doc._id = LocalCollection._useOID ? new LocalCollection._ObjectID()                               // 465
                                      : Random.id();                                                  // 466
  }                                                                                                   // 467
  var id = LocalCollection._idStringify(doc._id);                                                     // 468
                                                                                                      // 469
  if (_.has(self.docs, id))                                                                           // 470
    throw MinimongoError("Duplicate _id '" + doc._id + "'");                                          // 471
                                                                                                      // 472
  self._saveOriginal(id, undefined);                                                                  // 473
  self.docs[id] = doc;                                                                                // 474
                                                                                                      // 475
  var queriesToRecompute = [];                                                                        // 476
  // trigger live queries that match                                                                  // 477
  for (var qid in self.queries) {                                                                     // 478
    var query = self.queries[qid];                                                                    // 479
    if (query.selector_f(doc)) {                                                                      // 480
      if (query.cursor.skip || query.cursor.limit)                                                    // 481
        queriesToRecompute.push(qid);                                                                 // 482
      else                                                                                            // 483
        LocalCollection._insertInResults(query, doc);                                                 // 484
    }                                                                                                 // 485
  }                                                                                                   // 486
                                                                                                      // 487
  _.each(queriesToRecompute, function (qid) {                                                         // 488
    if (self.queries[qid])                                                                            // 489
      LocalCollection._recomputeResults(self.queries[qid]);                                           // 490
  });                                                                                                 // 491
  self._observeQueue.drain();                                                                         // 492
                                                                                                      // 493
  // Defer because the caller likely doesn't expect the callback to be run                            // 494
  // immediately.                                                                                     // 495
  if (callback)                                                                                       // 496
    Meteor.defer(function () {                                                                        // 497
      callback(null, doc._id);                                                                        // 498
    });                                                                                               // 499
  return doc._id;                                                                                     // 500
};                                                                                                    // 501
                                                                                                      // 502
LocalCollection.prototype.remove = function (selector, callback) {                                    // 503
  var self = this;                                                                                    // 504
  var remove = [];                                                                                    // 505
                                                                                                      // 506
  var queriesToRecompute = [];                                                                        // 507
  var selector_f = LocalCollection._compileSelector(selector, self);                                  // 508
                                                                                                      // 509
  // Avoid O(n) for "remove a single doc by ID".                                                      // 510
  var specificIds = LocalCollection._idsMatchedBySelector(selector);                                  // 511
  if (specificIds) {                                                                                  // 512
    _.each(specificIds, function (id) {                                                               // 513
      var strId = LocalCollection._idStringify(id);                                                   // 514
      // We still have to run selector_f, in case it's something like                                 // 515
      //   {_id: "X", a: 42}                                                                          // 516
      if (_.has(self.docs, strId) && selector_f(self.docs[strId]))                                    // 517
        remove.push(strId);                                                                           // 518
    });                                                                                               // 519
  } else {                                                                                            // 520
    for (var id in self.docs) {                                                                       // 521
      var doc = self.docs[id];                                                                        // 522
      if (selector_f(doc)) {                                                                          // 523
        remove.push(id);                                                                              // 524
      }                                                                                               // 525
    }                                                                                                 // 526
  }                                                                                                   // 527
                                                                                                      // 528
  var queryRemove = [];                                                                               // 529
  for (var i = 0; i < remove.length; i++) {                                                           // 530
    var removeId = remove[i];                                                                         // 531
    var removeDoc = self.docs[removeId];                                                              // 532
    _.each(self.queries, function (query, qid) {                                                      // 533
      if (query.selector_f(removeDoc)) {                                                              // 534
        if (query.cursor.skip || query.cursor.limit)                                                  // 535
          queriesToRecompute.push(qid);                                                               // 536
        else                                                                                          // 537
          queryRemove.push({qid: qid, doc: removeDoc});                                               // 538
      }                                                                                               // 539
    });                                                                                               // 540
    self._saveOriginal(removeId, removeDoc);                                                          // 541
    delete self.docs[removeId];                                                                       // 542
  }                                                                                                   // 543
                                                                                                      // 544
  // run live query callbacks _after_ we've removed the documents.                                    // 545
  _.each(queryRemove, function (remove) {                                                             // 546
    var query = self.queries[remove.qid];                                                             // 547
    if (query)                                                                                        // 548
      LocalCollection._removeFromResults(query, remove.doc);                                          // 549
  });                                                                                                 // 550
  _.each(queriesToRecompute, function (qid) {                                                         // 551
    var query = self.queries[qid];                                                                    // 552
    if (query)                                                                                        // 553
      LocalCollection._recomputeResults(query);                                                       // 554
  });                                                                                                 // 555
  self._observeQueue.drain();                                                                         // 556
  var result = remove.length;                                                                         // 557
  if (callback)                                                                                       // 558
    Meteor.defer(function () {                                                                        // 559
      callback(null, result);                                                                         // 560
    });                                                                                               // 561
  return result;                                                                                      // 562
};                                                                                                    // 563
                                                                                                      // 564
// XXX atomicity: if multi is true, and one modification fails, do                                    // 565
// we rollback the whole operation, or what?                                                          // 566
LocalCollection.prototype.update = function (selector, mod, options, callback) {                      // 567
  var self = this;                                                                                    // 568
  if (! callback && options instanceof Function) {                                                    // 569
    callback = options;                                                                               // 570
    options = null;                                                                                   // 571
  }                                                                                                   // 572
  if (!options) options = {};                                                                         // 573
                                                                                                      // 574
  var selector_f = LocalCollection._compileSelector(selector, self);                                  // 575
                                                                                                      // 576
  // Save the original results of any query that we might need to                                     // 577
  // _recomputeResults on, because _modifyAndNotify will mutate the objects in                        // 578
  // it. (We don't need to save the original results of paused queries because                        // 579
  // they already have a results_snapshot and we won't be diffing in                                  // 580
  // _recomputeResults.)                                                                              // 581
  var qidToOriginalResults = {};                                                                      // 582
  _.each(self.queries, function (query, qid) {                                                        // 583
    if ((query.cursor.skip || query.cursor.limit) && !query.paused)                                   // 584
      qidToOriginalResults[qid] = EJSON.clone(query.results);                                         // 585
  });                                                                                                 // 586
  var recomputeQids = {};                                                                             // 587
                                                                                                      // 588
  var updateCount = 0;                                                                                // 589
                                                                                                      // 590
  for (var id in self.docs) {                                                                         // 591
    var doc = self.docs[id];                                                                          // 592
    if (selector_f(doc)) {                                                                            // 593
      // XXX Should we save the original even if mod ends up being a no-op?                           // 594
      self._saveOriginal(id, doc);                                                                    // 595
      self._modifyAndNotify(doc, mod, recomputeQids);                                                 // 596
      ++updateCount;                                                                                  // 597
      if (!options.multi)                                                                             // 598
        break;                                                                                        // 599
    }                                                                                                 // 600
  }                                                                                                   // 601
                                                                                                      // 602
  _.each(recomputeQids, function (dummy, qid) {                                                       // 603
    var query = self.queries[qid];                                                                    // 604
    if (query)                                                                                        // 605
      LocalCollection._recomputeResults(query,                                                        // 606
                                        qidToOriginalResults[qid]);                                   // 607
  });                                                                                                 // 608
  self._observeQueue.drain();                                                                         // 609
                                                                                                      // 610
  // If we are doing an upsert, and we didn't modify any documents yet, then                          // 611
  // it's time to do an insert. Figure out what document we are inserting, and                        // 612
  // generate an id for it.                                                                           // 613
  var insertedId;                                                                                     // 614
  if (updateCount === 0 && options.upsert) {                                                          // 615
    var newDoc = LocalCollection._removeDollarOperators(selector);                                    // 616
    LocalCollection._modify(newDoc, mod, true);                                                       // 617
    if (! newDoc._id && options.insertedId)                                                           // 618
      newDoc._id = options.insertedId;                                                                // 619
    insertedId = self.insert(newDoc);                                                                 // 620
    updateCount = 1;                                                                                  // 621
  }                                                                                                   // 622
                                                                                                      // 623
  // Return the number of affected documents, or in the upsert case, an object                        // 624
  // containing the number of affected docs and the id of the doc that was                            // 625
  // inserted, if any.                                                                                // 626
  var result;                                                                                         // 627
  if (options._returnObject) {                                                                        // 628
    result = {                                                                                        // 629
      numberAffected: updateCount                                                                     // 630
    };                                                                                                // 631
    if (insertedId !== undefined)                                                                     // 632
      result.insertedId = insertedId;                                                                 // 633
  } else {                                                                                            // 634
    result = updateCount;                                                                             // 635
  }                                                                                                   // 636
                                                                                                      // 637
  if (callback)                                                                                       // 638
    Meteor.defer(function () {                                                                        // 639
      callback(null, result);                                                                         // 640
    });                                                                                               // 641
  return result;                                                                                      // 642
};                                                                                                    // 643
                                                                                                      // 644
// A convenience wrapper on update. LocalCollection.upsert(sel, mod) is                               // 645
// equivalent to LocalCollection.update(sel, mod, { upsert: true, _returnObject:                      // 646
// true }).                                                                                           // 647
LocalCollection.prototype.upsert = function (selector, mod, options, callback) {                      // 648
  var self = this;                                                                                    // 649
  if (! callback && typeof options === "function") {                                                  // 650
    callback = options;                                                                               // 651
    options = {};                                                                                     // 652
  }                                                                                                   // 653
  return self.update(selector, mod, _.extend({}, options, {                                           // 654
    upsert: true,                                                                                     // 655
    _returnObject: true                                                                               // 656
  }), callback);                                                                                      // 657
};                                                                                                    // 658
                                                                                                      // 659
LocalCollection.prototype._modifyAndNotify = function (                                               // 660
    doc, mod, recomputeQids) {                                                                        // 661
  var self = this;                                                                                    // 662
                                                                                                      // 663
  var matched_before = {};                                                                            // 664
  for (var qid in self.queries) {                                                                     // 665
    var query = self.queries[qid];                                                                    // 666
    if (query.ordered) {                                                                              // 667
      matched_before[qid] = query.selector_f(doc);                                                    // 668
    } else {                                                                                          // 669
      // Because we don't support skip or limit (yet) in unordered queries, we                        // 670
      // can just do a direct lookup.                                                                 // 671
      matched_before[qid] = _.has(query.results,                                                      // 672
                                  LocalCollection._idStringify(doc._id));                             // 673
    }                                                                                                 // 674
  }                                                                                                   // 675
                                                                                                      // 676
  var old_doc = EJSON.clone(doc);                                                                     // 677
                                                                                                      // 678
  LocalCollection._modify(doc, mod);                                                                  // 679
                                                                                                      // 680
  for (qid in self.queries) {                                                                         // 681
    query = self.queries[qid];                                                                        // 682
    var before = matched_before[qid];                                                                 // 683
    var after = query.selector_f(doc);                                                                // 684
                                                                                                      // 685
    if (query.cursor.skip || query.cursor.limit) {                                                    // 686
      // We need to recompute any query where the doc may have been in the                            // 687
      // cursor's window either before or after the update. (Note that if skip                        // 688
      // or limit is set, "before" and "after" being true do not necessarily                          // 689
      // mean that the document is in the cursor's output after skip/limit is                         // 690
      // applied... but if they are false, then the document definitely is NOT                        // 691
      // in the output. So it's safe to skip recompute if neither before or                           // 692
      // after are true.)                                                                             // 693
      if (before || after)                                                                            // 694
        recomputeQids[qid] = true;                                                                    // 695
    } else if (before && !after) {                                                                    // 696
      LocalCollection._removeFromResults(query, doc);                                                 // 697
    } else if (!before && after) {                                                                    // 698
      LocalCollection._insertInResults(query, doc);                                                   // 699
    } else if (before && after) {                                                                     // 700
      LocalCollection._updateInResults(query, doc, old_doc);                                          // 701
    }                                                                                                 // 702
  }                                                                                                   // 703
};                                                                                                    // 704
                                                                                                      // 705
// XXX the sorted-query logic below is laughably inefficient. we'll                                   // 706
// need to come up with a better datastructure for this.                                              // 707
//                                                                                                    // 708
// XXX the logic for observing with a skip or a limit is even more                                    // 709
// laughably inefficient. we recompute the whole results every time!                                  // 710
                                                                                                      // 711
LocalCollection._insertInResults = function (query, doc) {                                            // 712
  var fields = EJSON.clone(doc);                                                                      // 713
  delete fields._id;                                                                                  // 714
  if (query.ordered) {                                                                                // 715
    if (!query.sort_f) {                                                                              // 716
      query.addedBefore(doc._id, fields, null);                                                       // 717
      query.results.push(doc);                                                                        // 718
    } else {                                                                                          // 719
      var i = LocalCollection._insertInSortedList(                                                    // 720
        query.sort_f, query.results, doc);                                                            // 721
      var next = query.results[i+1];                                                                  // 722
      if (next)                                                                                       // 723
        next = next._id;                                                                              // 724
      else                                                                                            // 725
        next = null;                                                                                  // 726
      query.addedBefore(doc._id, fields, next);                                                       // 727
    }                                                                                                 // 728
    query.added(doc._id, fields);                                                                     // 729
  } else {                                                                                            // 730
    query.added(doc._id, fields);                                                                     // 731
    query.results[LocalCollection._idStringify(doc._id)] = doc;                                       // 732
  }                                                                                                   // 733
};                                                                                                    // 734
                                                                                                      // 735
LocalCollection._removeFromResults = function (query, doc) {                                          // 736
  if (query.ordered) {                                                                                // 737
    var i = LocalCollection._findInOrderedResults(query, doc);                                        // 738
    query.removed(doc._id);                                                                           // 739
    query.results.splice(i, 1);                                                                       // 740
  } else {                                                                                            // 741
    var id = LocalCollection._idStringify(doc._id);  // in case callback mutates doc                  // 742
    query.removed(doc._id);                                                                           // 743
    delete query.results[id];                                                                         // 744
  }                                                                                                   // 745
};                                                                                                    // 746
                                                                                                      // 747
LocalCollection._updateInResults = function (query, doc, old_doc) {                                   // 748
  if (!EJSON.equals(doc._id, old_doc._id))                                                            // 749
    throw new Error("Can't change a doc's _id while updating");                                       // 750
  var changedFields = LocalCollection._makeChangedFields(doc, old_doc);                               // 751
  if (!query.ordered) {                                                                               // 752
    if (!_.isEmpty(changedFields)) {                                                                  // 753
      query.changed(doc._id, changedFields);                                                          // 754
      query.results[LocalCollection._idStringify(doc._id)] = doc;                                     // 755
    }                                                                                                 // 756
    return;                                                                                           // 757
  }                                                                                                   // 758
                                                                                                      // 759
  var orig_idx = LocalCollection._findInOrderedResults(query, doc);                                   // 760
                                                                                                      // 761
  if (!_.isEmpty(changedFields))                                                                      // 762
    query.changed(doc._id, changedFields);                                                            // 763
  if (!query.sort_f)                                                                                  // 764
    return;                                                                                           // 765
                                                                                                      // 766
  // just take it out and put it back in again, and see if the index                                  // 767
  // changes                                                                                          // 768
  query.results.splice(orig_idx, 1);                                                                  // 769
  var new_idx = LocalCollection._insertInSortedList(                                                  // 770
    query.sort_f, query.results, doc);                                                                // 771
  if (orig_idx !== new_idx) {                                                                         // 772
    var next = query.results[new_idx+1];                                                              // 773
    if (next)                                                                                         // 774
      next = next._id;                                                                                // 775
    else                                                                                              // 776
      next = null;                                                                                    // 777
    query.movedBefore && query.movedBefore(doc._id, next);                                            // 778
  }                                                                                                   // 779
};                                                                                                    // 780
                                                                                                      // 781
// Recomputes the results of a query and runs observe callbacks for the                               // 782
// difference between the previous results and the current results (unless                            // 783
// paused). Used for skip/limit queries.                                                              // 784
//                                                                                                    // 785
// When this is used by insert or remove, it can just use query.results for the                       // 786
// old results (and there's no need to pass in oldResults), because these                             // 787
// operations don't mutate the documents in the collection. Update needs to pass                      // 788
// in an oldResults which was deep-copied before the modifier was applied.                            // 789
LocalCollection._recomputeResults = function (query, oldResults) {                                    // 790
  if (!oldResults)                                                                                    // 791
    oldResults = query.results;                                                                       // 792
  query.results = query.cursor._getRawObjects(query.ordered);                                         // 793
                                                                                                      // 794
  if (!query.paused) {                                                                                // 795
    LocalCollection._diffQueryChanges(                                                                // 796
      query.ordered, oldResults, query.results, query);                                               // 797
  }                                                                                                   // 798
};                                                                                                    // 799
                                                                                                      // 800
                                                                                                      // 801
LocalCollection._findInOrderedResults = function (query, doc) {                                       // 802
  if (!query.ordered)                                                                                 // 803
    throw new Error("Can't call _findInOrderedResults on unordered query");                           // 804
  for (var i = 0; i < query.results.length; i++)                                                      // 805
    if (query.results[i] === doc)                                                                     // 806
      return i;                                                                                       // 807
  throw Error("object missing from query");                                                           // 808
};                                                                                                    // 809
                                                                                                      // 810
// This binary search puts a value between any equal values, and the first                            // 811
// lesser value.                                                                                      // 812
LocalCollection._binarySearch = function (cmp, array, value) {                                        // 813
  var first = 0, rangeLength = array.length;                                                          // 814
                                                                                                      // 815
  while (rangeLength > 0) {                                                                           // 816
    var halfRange = Math.floor(rangeLength/2);                                                        // 817
    if (cmp(value, array[first + halfRange]) >= 0) {                                                  // 818
      first += halfRange + 1;                                                                         // 819
      rangeLength -= halfRange + 1;                                                                   // 820
    } else {                                                                                          // 821
      rangeLength = halfRange;                                                                        // 822
    }                                                                                                 // 823
  }                                                                                                   // 824
  return first;                                                                                       // 825
};                                                                                                    // 826
                                                                                                      // 827
LocalCollection._insertInSortedList = function (cmp, array, value) {                                  // 828
  if (array.length === 0) {                                                                           // 829
    array.push(value);                                                                                // 830
    return 0;                                                                                         // 831
  }                                                                                                   // 832
                                                                                                      // 833
  var idx = LocalCollection._binarySearch(cmp, array, value);                                         // 834
  array.splice(idx, 0, value);                                                                        // 835
  return idx;                                                                                         // 836
};                                                                                                    // 837
                                                                                                      // 838
// To track what documents are affected by a piece of code, call saveOriginals()                      // 839
// before it and retrieveOriginals() after it. retrieveOriginals returns an                           // 840
// object whose keys are the ids of the documents that were affected since the                        // 841
// call to saveOriginals(), and the values are equal to the document's contents                       // 842
// at the time of saveOriginals. (In the case of an inserted document, undefined                      // 843
// is the value.) You must alternate between calls to saveOriginals() and                             // 844
// retrieveOriginals().                                                                               // 845
LocalCollection.prototype.saveOriginals = function () {                                               // 846
  var self = this;                                                                                    // 847
  if (self._savedOriginals)                                                                           // 848
    throw new Error("Called saveOriginals twice without retrieveOriginals");                          // 849
  self._savedOriginals = {};                                                                          // 850
};                                                                                                    // 851
LocalCollection.prototype.retrieveOriginals = function () {                                           // 852
  var self = this;                                                                                    // 853
  if (!self._savedOriginals)                                                                          // 854
    throw new Error("Called retrieveOriginals without saveOriginals");                                // 855
                                                                                                      // 856
  var originals = self._savedOriginals;                                                               // 857
  self._savedOriginals = null;                                                                        // 858
  return originals;                                                                                   // 859
};                                                                                                    // 860
                                                                                                      // 861
LocalCollection.prototype._saveOriginal = function (id, doc) {                                        // 862
  var self = this;                                                                                    // 863
  // Are we even trying to save originals?                                                            // 864
  if (!self._savedOriginals)                                                                          // 865
    return;                                                                                           // 866
  // Have we previously mutated the original (and so 'doc' is not actually                            // 867
  // original)?  (Note the 'has' check rather than truth: we store undefined                          // 868
  // here for inserted docs!)                                                                         // 869
  if (_.has(self._savedOriginals, id))                                                                // 870
    return;                                                                                           // 871
  self._savedOriginals[id] = EJSON.clone(doc);                                                        // 872
};                                                                                                    // 873
                                                                                                      // 874
// Pause the observers. No callbacks from observers will fire until                                   // 875
// 'resumeObservers' is called.                                                                       // 876
LocalCollection.prototype.pauseObservers = function () {                                              // 877
  // No-op if already paused.                                                                         // 878
  if (this.paused)                                                                                    // 879
    return;                                                                                           // 880
                                                                                                      // 881
  // Set the 'paused' flag such that new observer messages don't fire.                                // 882
  this.paused = true;                                                                                 // 883
                                                                                                      // 884
  // Take a snapshot of the query results for each query.                                             // 885
  for (var qid in this.queries) {                                                                     // 886
    var query = this.queries[qid];                                                                    // 887
                                                                                                      // 888
    query.results_snapshot = EJSON.clone(query.results);                                              // 889
  }                                                                                                   // 890
};                                                                                                    // 891
                                                                                                      // 892
// Resume the observers. Observers immediately receive change                                         // 893
// notifications to bring them to the current state of the                                            // 894
// database. Note that this is not just replaying all the changes that                                // 895
// happened during the pause, it is a smarter 'coalesced' diff.                                       // 896
LocalCollection.prototype.resumeObservers = function () {                                             // 897
  var self = this;                                                                                    // 898
  // No-op if not paused.                                                                             // 899
  if (!this.paused)                                                                                   // 900
    return;                                                                                           // 901
                                                                                                      // 902
  // Unset the 'paused' flag. Make sure to do this first, otherwise                                   // 903
  // observer methods won't actually fire when we trigger them.                                       // 904
  this.paused = false;                                                                                // 905
                                                                                                      // 906
  for (var qid in this.queries) {                                                                     // 907
    var query = self.queries[qid];                                                                    // 908
    // Diff the current results against the snapshot and send to observers.                           // 909
    // pass the query object for its observer callbacks.                                              // 910
    LocalCollection._diffQueryChanges(                                                                // 911
      query.ordered, query.results_snapshot, query.results, query);                                   // 912
    query.results_snapshot = null;                                                                    // 913
  }                                                                                                   // 914
  self._observeQueue.drain();                                                                         // 915
};                                                                                                    // 916
                                                                                                      // 917
                                                                                                      // 918
// NB: used by livedata                                                                               // 919
LocalCollection._idStringify = function (id) {                                                        // 920
  if (id instanceof LocalCollection._ObjectID) {                                                      // 921
    return id.valueOf();                                                                              // 922
  } else if (typeof id === 'string') {                                                                // 923
    if (id === "") {                                                                                  // 924
      return id;                                                                                      // 925
    } else if (id.substr(0, 1) === "-" || // escape previously dashed strings                         // 926
               id.substr(0, 1) === "~" || // escape escaped numbers, true, false                      // 927
               LocalCollection._looksLikeObjectID(id) || // escape object-id-form strings             // 928
               id.substr(0, 1) === '{') { // escape object-form strings, for maybe implementing later // 929
      return "-" + id;                                                                                // 930
    } else {                                                                                          // 931
      return id; // other strings go through unchanged.                                               // 932
    }                                                                                                 // 933
  } else if (id === undefined) {                                                                      // 934
    return '-';                                                                                       // 935
  } else if (typeof id === 'object' && id !== null) {                                                 // 936
    throw new Error("Meteor does not currently support objects other than ObjectID as ids");          // 937
  } else { // Numbers, true, false, null                                                              // 938
    return "~" + JSON.stringify(id);                                                                  // 939
  }                                                                                                   // 940
};                                                                                                    // 941
                                                                                                      // 942
                                                                                                      // 943
// NB: used by livedata                                                                               // 944
LocalCollection._idParse = function (id) {                                                            // 945
  if (id === "") {                                                                                    // 946
    return id;                                                                                        // 947
  } else if (id === '-') {                                                                            // 948
    return undefined;                                                                                 // 949
  } else if (id.substr(0, 1) === '-') {                                                               // 950
    return id.substr(1);                                                                              // 951
  } else if (id.substr(0, 1) === '~') {                                                               // 952
    return JSON.parse(id.substr(1));                                                                  // 953
  } else if (LocalCollection._looksLikeObjectID(id)) {                                                // 954
    return new LocalCollection._ObjectID(id);                                                         // 955
  } else {                                                                                            // 956
    return id;                                                                                        // 957
  }                                                                                                   // 958
};                                                                                                    // 959
                                                                                                      // 960
LocalCollection._makeChangedFields = function (newDoc, oldDoc) {                                      // 961
  var fields = {};                                                                                    // 962
  LocalCollection._diffObjects(oldDoc, newDoc, {                                                      // 963
    leftOnly: function (key, value) {                                                                 // 964
      fields[key] = undefined;                                                                        // 965
    },                                                                                                // 966
    rightOnly: function (key, value) {                                                                // 967
      fields[key] = value;                                                                            // 968
    },                                                                                                // 969
    both: function (key, leftValue, rightValue) {                                                     // 970
      if (!EJSON.equals(leftValue, rightValue))                                                       // 971
        fields[key] = rightValue;                                                                     // 972
    }                                                                                                 // 973
  });                                                                                                 // 974
  return fields;                                                                                      // 975
};                                                                                                    // 976
                                                                                                      // 977
// Searches $near operator in the selector recursively                                                // 978
// (including all $or/$and/$nor/$not branches)                                                        // 979
var isGeoQuery = function (selector) {                                                                // 980
  return _.any(selector, function (val, key) {                                                        // 981
    // Note: _.isObject matches objects and arrays                                                    // 982
    return key === "$near" || (_.isObject(val) && isGeoQuery(val));                                   // 983
  });                                                                                                 // 984
};                                                                                                    // 985
                                                                                                      // 986
// Checks if $near appears under some $or/$and/$nor/$not branch                                       // 987
var isGeoQuerySpecial = function (selector) {                                                         // 988
  return _.any(selector, function (val, key) {                                                        // 989
    if (_.contains(['$or', '$and', '$nor', '$not'], key))                                             // 990
      return isGeoQuery(val);                                                                         // 991
    // Note: _.isObject matches objects and arrays                                                    // 992
    return _.isObject(val) && isGeoQuerySpecial(val);                                                 // 993
  });                                                                                                 // 994
};                                                                                                    // 995
                                                                                                      // 996
                                                                                                      // 997
////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                    //
// packages/minimongo/selector.js                                                                     //
//                                                                                                    //
////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                      //
// Like _.isArray, but doesn't regard polyfilled Uint8Arrays on old browsers as                       // 1
// arrays.                                                                                            // 2
var isArray = function (x) {                                                                          // 3
  return _.isArray(x) && !EJSON.isBinary(x);                                                          // 4
};                                                                                                    // 5
                                                                                                      // 6
var _anyIfArray = function (x, f) {                                                                   // 7
  if (isArray(x))                                                                                     // 8
    return _.any(x, f);                                                                               // 9
  return f(x);                                                                                        // 10
};                                                                                                    // 11
                                                                                                      // 12
var _anyIfArrayPlus = function (x, f) {                                                               // 13
  if (f(x))                                                                                           // 14
    return true;                                                                                      // 15
  return isArray(x) && _.any(x, f);                                                                   // 16
};                                                                                                    // 17
                                                                                                      // 18
var hasOperators = function(valueSelector) {                                                          // 19
  var theseAreOperators = undefined;                                                                  // 20
  for (var selKey in valueSelector) {                                                                 // 21
    var thisIsOperator = selKey.substr(0, 1) === '$';                                                 // 22
    if (theseAreOperators === undefined) {                                                            // 23
      theseAreOperators = thisIsOperator;                                                             // 24
    } else if (theseAreOperators !== thisIsOperator) {                                                // 25
      throw new Error("Inconsistent selector: " + valueSelector);                                     // 26
    }                                                                                                 // 27
  }                                                                                                   // 28
  return !!theseAreOperators;  // {} has no operators                                                 // 29
};                                                                                                    // 30
                                                                                                      // 31
var compileValueSelector = function (valueSelector, selector, cursor) {                               // 32
  if (valueSelector == null) {  // undefined or null                                                  // 33
    return function (value) {                                                                         // 34
      return _anyIfArray(value, function (x) {                                                        // 35
        return x == null;  // undefined or null                                                       // 36
      });                                                                                             // 37
    };                                                                                                // 38
  }                                                                                                   // 39
                                                                                                      // 40
  // Selector is a non-null primitive (and not an array or RegExp either).                            // 41
  if (!_.isObject(valueSelector)) {                                                                   // 42
    return function (value) {                                                                         // 43
      return _anyIfArray(value, function (x) {                                                        // 44
        return x === valueSelector;                                                                   // 45
      });                                                                                             // 46
    };                                                                                                // 47
  }                                                                                                   // 48
                                                                                                      // 49
  if (valueSelector instanceof RegExp) {                                                              // 50
    return function (value) {                                                                         // 51
      if (value === undefined)                                                                        // 52
        return false;                                                                                 // 53
      return _anyIfArray(value, function (x) {                                                        // 54
        return valueSelector.test(x);                                                                 // 55
      });                                                                                             // 56
    };                                                                                                // 57
  }                                                                                                   // 58
                                                                                                      // 59
  // Arrays match either identical arrays or arrays that contain it as a value.                       // 60
  if (isArray(valueSelector)) {                                                                       // 61
    return function (value) {                                                                         // 62
      if (!isArray(value))                                                                            // 63
        return false;                                                                                 // 64
      return _anyIfArrayPlus(value, function (x) {                                                    // 65
        return LocalCollection._f._equal(valueSelector, x);                                           // 66
      });                                                                                             // 67
    };                                                                                                // 68
  }                                                                                                   // 69
                                                                                                      // 70
  // It's an object, but not an array or regexp.                                                      // 71
  if (hasOperators(valueSelector)) {                                                                  // 72
    var operatorFunctions = [];                                                                       // 73
    _.each(valueSelector, function (operand, operator) {                                              // 74
      if (!_.has(VALUE_OPERATORS, operator))                                                          // 75
        throw new Error("Unrecognized operator: " + operator);                                        // 76
      // Special case for location operators                                                          // 77
      operatorFunctions.push(VALUE_OPERATORS[operator](                                               // 78
        operand, valueSelector, cursor));                                                             // 79
    });                                                                                               // 80
    return function (value, doc) {                                                                    // 81
      return _.all(operatorFunctions, function (f) {                                                  // 82
        return f(value, doc);                                                                         // 83
      });                                                                                             // 84
    };                                                                                                // 85
  }                                                                                                   // 86
                                                                                                      // 87
  // It's a literal; compare value (or element of value array) directly to the                        // 88
  // selector.                                                                                        // 89
  return function (value) {                                                                           // 90
    return _anyIfArray(value, function (x) {                                                          // 91
      return LocalCollection._f._equal(valueSelector, x);                                             // 92
    });                                                                                               // 93
  };                                                                                                  // 94
};                                                                                                    // 95
                                                                                                      // 96
// XXX can factor out common logic below                                                              // 97
var LOGICAL_OPERATORS = {                                                                             // 98
  "$and": function(subSelector, operators, cursor) {                                                  // 99
    if (!isArray(subSelector) || _.isEmpty(subSelector))                                              // 100
      throw Error("$and/$or/$nor must be nonempty array");                                            // 101
    var subSelectorFunctions = _.map(subSelector, function (selector) {                               // 102
      return compileDocumentSelector(selector, cursor); });                                           // 103
    return function (doc, wholeDoc) {                                                                 // 104
      return _.all(subSelectorFunctions, function (f) {                                               // 105
        return f(doc, wholeDoc);                                                                      // 106
      });                                                                                             // 107
    };                                                                                                // 108
  },                                                                                                  // 109
                                                                                                      // 110
  "$or": function(subSelector, operators, cursor) {                                                   // 111
    if (!isArray(subSelector) || _.isEmpty(subSelector))                                              // 112
      throw Error("$and/$or/$nor must be nonempty array");                                            // 113
    var subSelectorFunctions = _.map(subSelector, function (selector) {                               // 114
      return compileDocumentSelector(selector, cursor); });                                           // 115
    return function (doc, wholeDoc) {                                                                 // 116
      return _.any(subSelectorFunctions, function (f) {                                               // 117
        return f(doc, wholeDoc);                                                                      // 118
      });                                                                                             // 119
    };                                                                                                // 120
  },                                                                                                  // 121
                                                                                                      // 122
  "$nor": function(subSelector, operators, cursor) {                                                  // 123
    if (!isArray(subSelector) || _.isEmpty(subSelector))                                              // 124
      throw Error("$and/$or/$nor must be nonempty array");                                            // 125
    var subSelectorFunctions = _.map(subSelector, function (selector) {                               // 126
      return compileDocumentSelector(selector, cursor); });                                           // 127
    return function (doc, wholeDoc) {                                                                 // 128
      return _.all(subSelectorFunctions, function (f) {                                               // 129
        return !f(doc, wholeDoc);                                                                     // 130
      });                                                                                             // 131
    };                                                                                                // 132
  },                                                                                                  // 133
                                                                                                      // 134
  "$where": function(selectorValue) {                                                                 // 135
    if (!(selectorValue instanceof Function)) {                                                       // 136
      selectorValue = Function("return " + selectorValue);                                            // 137
    }                                                                                                 // 138
    return function (doc) {                                                                           // 139
      return selectorValue.call(doc);                                                                 // 140
    };                                                                                                // 141
  }                                                                                                   // 142
};                                                                                                    // 143
                                                                                                      // 144
// Each value operator is a function with args:                                                       // 145
//  - operand - Anything                                                                              // 146
//  - operators - Object - operators on the same level (neighbours)                                   // 147
//  - cursor - Object - original cursor                                                               // 148
// returns a function with args:                                                                      // 149
//  - value - a value the operator is tested against                                                  // 150
//  - doc - the whole document tested in this query                                                   // 151
var VALUE_OPERATORS = {                                                                               // 152
  "$in": function (operand) {                                                                         // 153
    if (!isArray(operand))                                                                            // 154
      throw new Error("Argument to $in must be array");                                               // 155
    return function (value) {                                                                         // 156
      return _anyIfArrayPlus(value, function (x) {                                                    // 157
        return _.any(operand, function (operandElt) {                                                 // 158
          return LocalCollection._f._equal(operandElt, x);                                            // 159
        });                                                                                           // 160
      });                                                                                             // 161
    };                                                                                                // 162
  },                                                                                                  // 163
                                                                                                      // 164
  "$all": function (operand) {                                                                        // 165
    if (!isArray(operand))                                                                            // 166
      throw new Error("Argument to $all must be array");                                              // 167
    return function (value) {                                                                         // 168
      if (!isArray(value))                                                                            // 169
        return false;                                                                                 // 170
      return _.all(operand, function (operandElt) {                                                   // 171
        return _.any(value, function (valueElt) {                                                     // 172
          return LocalCollection._f._equal(operandElt, valueElt);                                     // 173
        });                                                                                           // 174
      });                                                                                             // 175
    };                                                                                                // 176
  },                                                                                                  // 177
                                                                                                      // 178
  "$lt": function (operand) {                                                                         // 179
    return function (value) {                                                                         // 180
      return _anyIfArray(value, function (x) {                                                        // 181
        return LocalCollection._f._cmp(x, operand) < 0;                                               // 182
      });                                                                                             // 183
    };                                                                                                // 184
  },                                                                                                  // 185
                                                                                                      // 186
  "$lte": function (operand) {                                                                        // 187
    return function (value) {                                                                         // 188
      return _anyIfArray(value, function (x) {                                                        // 189
        return LocalCollection._f._cmp(x, operand) <= 0;                                              // 190
      });                                                                                             // 191
    };                                                                                                // 192
  },                                                                                                  // 193
                                                                                                      // 194
  "$gt": function (operand) {                                                                         // 195
    return function (value) {                                                                         // 196
      return _anyIfArray(value, function (x) {                                                        // 197
        return LocalCollection._f._cmp(x, operand) > 0;                                               // 198
      });                                                                                             // 199
    };                                                                                                // 200
  },                                                                                                  // 201
                                                                                                      // 202
  "$gte": function (operand) {                                                                        // 203
    return function (value) {                                                                         // 204
      return _anyIfArray(value, function (x) {                                                        // 205
        return LocalCollection._f._cmp(x, operand) >= 0;                                              // 206
      });                                                                                             // 207
    };                                                                                                // 208
  },                                                                                                  // 209
                                                                                                      // 210
  "$ne": function (operand) {                                                                         // 211
    return function (value) {                                                                         // 212
      return ! _anyIfArrayPlus(value, function (x) {                                                  // 213
        return LocalCollection._f._equal(x, operand);                                                 // 214
      });                                                                                             // 215
    };                                                                                                // 216
  },                                                                                                  // 217
                                                                                                      // 218
  "$nin": function (operand) {                                                                        // 219
    if (!isArray(operand))                                                                            // 220
      throw new Error("Argument to $nin must be array");                                              // 221
    var inFunction = VALUE_OPERATORS.$in(operand);                                                    // 222
    return function (value, doc) {                                                                    // 223
      // Field doesn't exist, so it's not-in operand                                                  // 224
      if (value === undefined)                                                                        // 225
        return true;                                                                                  // 226
      return !inFunction(value, doc);                                                                 // 227
    };                                                                                                // 228
  },                                                                                                  // 229
                                                                                                      // 230
  "$exists": function (operand) {                                                                     // 231
    return function (value) {                                                                         // 232
      return operand === (value !== undefined);                                                       // 233
    };                                                                                                // 234
  },                                                                                                  // 235
                                                                                                      // 236
  "$mod": function (operand) {                                                                        // 237
    var divisor = operand[0],                                                                         // 238
        remainder = operand[1];                                                                       // 239
    return function (value) {                                                                         // 240
      return _anyIfArray(value, function (x) {                                                        // 241
        return x % divisor === remainder;                                                             // 242
      });                                                                                             // 243
    };                                                                                                // 244
  },                                                                                                  // 245
                                                                                                      // 246
  "$size": function (operand) {                                                                       // 247
    return function (value) {                                                                         // 248
      return isArray(value) && operand === value.length;                                              // 249
    };                                                                                                // 250
  },                                                                                                  // 251
                                                                                                      // 252
  "$type": function (operand) {                                                                       // 253
    return function (value) {                                                                         // 254
      // A nonexistent field is of no type.                                                           // 255
      if (value === undefined)                                                                        // 256
        return false;                                                                                 // 257
      // Definitely not _anyIfArrayPlus: $type: 4 only matches arrays that have                       // 258
      // arrays as elements according to the Mongo docs.                                              // 259
      return _anyIfArray(value, function (x) {                                                        // 260
        return LocalCollection._f._type(x) === operand;                                               // 261
      });                                                                                             // 262
    };                                                                                                // 263
  },                                                                                                  // 264
                                                                                                      // 265
  "$regex": function (operand, operators) {                                                           // 266
    var options = operators.$options;                                                                 // 267
    if (options !== undefined) {                                                                      // 268
      // Options passed in $options (even the empty string) always overrides                          // 269
      // options in the RegExp object itself. (See also                                               // 270
      // Meteor.Collection._rewriteSelector.)                                                         // 271
                                                                                                      // 272
      // Be clear that we only support the JS-supported options, not extended                         // 273
      // ones (eg, Mongo supports x and s). Ideally we would implement x and s                        // 274
      // by transforming the regexp, but not today...                                                 // 275
      if (/[^gim]/.test(options))                                                                     // 276
        throw new Error("Only the i, m, and g regexp options are supported");                         // 277
                                                                                                      // 278
      var regexSource = operand instanceof RegExp ? operand.source : operand;                         // 279
      operand = new RegExp(regexSource, options);                                                     // 280
    } else if (!(operand instanceof RegExp)) {                                                        // 281
      operand = new RegExp(operand);                                                                  // 282
    }                                                                                                 // 283
                                                                                                      // 284
    return function (value) {                                                                         // 285
      if (value === undefined)                                                                        // 286
        return false;                                                                                 // 287
      return _anyIfArray(value, function (x) {                                                        // 288
        return operand.test(x);                                                                       // 289
      });                                                                                             // 290
    };                                                                                                // 291
  },                                                                                                  // 292
                                                                                                      // 293
  "$options": function (operand) {                                                                    // 294
    // evaluation happens at the $regex function above                                                // 295
    return function (value) { return true; };                                                         // 296
  },                                                                                                  // 297
                                                                                                      // 298
  "$elemMatch": function (operand, selector, cursor) {                                                // 299
    var matcher = compileDocumentSelector(operand, cursor);                                           // 300
    return function (value, doc) {                                                                    // 301
      if (!isArray(value))                                                                            // 302
        return false;                                                                                 // 303
      return _.any(value, function (x) {                                                              // 304
        return matcher(x, doc);                                                                       // 305
      });                                                                                             // 306
    };                                                                                                // 307
  },                                                                                                  // 308
                                                                                                      // 309
  "$not": function (operand, operators, cursor) {                                                     // 310
    var matcher = compileValueSelector(operand, operators, cursor);                                   // 311
    return function (value, doc) {                                                                    // 312
      return !matcher(value, doc);                                                                    // 313
    };                                                                                                // 314
  },                                                                                                  // 315
                                                                                                      // 316
  "$near": function (operand, operators, cursor) {                                                    // 317
    function distanceCoordinatePairs (a, b) {                                                         // 318
      a = pointToArray(a);                                                                            // 319
      b = pointToArray(b);                                                                            // 320
      var x = a[0] - b[0];                                                                            // 321
      var y = a[1] - b[1];                                                                            // 322
      if (_.isNaN(x) || _.isNaN(y))                                                                   // 323
        return null;                                                                                  // 324
      return Math.sqrt(x * x + y * y);                                                                // 325
    }                                                                                                 // 326
    // Makes sure we get 2 elements array and assume the first one to be x and                        // 327
    // the second one to y no matter what user passes.                                                // 328
    // In case user passes { lon: x, lat: y } returns [x, y]                                          // 329
    function pointToArray (point) {                                                                   // 330
      return _.map(point, _.identity);                                                                // 331
    }                                                                                                 // 332
    // GeoJSON query is marked as $geometry property                                                  // 333
    var mode = _.isObject(operand) && _.has(operand, '$geometry') ? "2dsphere" : "2d";                // 334
    var maxDistance = mode === "2d" ? operators.$maxDistance : operand.$maxDistance;                  // 335
    var point = mode === "2d" ? operand : operand.$geometry;                                          // 336
    return function (value, doc) {                                                                    // 337
      var dist = null;                                                                                // 338
      switch (mode) {                                                                                 // 339
        case "2d":                                                                                    // 340
          dist = distanceCoordinatePairs(point, value);                                               // 341
          break;                                                                                      // 342
        case "2dsphere":                                                                              // 343
          // XXX: for now, we don't calculate the actual distance between, say,                       // 344
          // polygon and circle. If people care about this use-case it will get                       // 345
          // a priority.                                                                              // 346
          if (value.type === "Point")                                                                 // 347
            dist = GeoJSON.pointDistance(point, value);                                               // 348
          else                                                                                        // 349
            dist = GeoJSON.geometryWithinRadius(value, point, maxDistance) ?                          // 350
                     0 : maxDistance + 1;                                                             // 351
          break;                                                                                      // 352
      }                                                                                               // 353
      // Used later in sorting by distance, since $near queries are sorted by                         // 354
      // distance from closest to farthest.                                                           // 355
      if (cursor) {                                                                                   // 356
        if (!cursor._distance)                                                                        // 357
          cursor._distance = {};                                                                      // 358
        cursor._distance[doc._id] = dist;                                                             // 359
      }                                                                                               // 360
                                                                                                      // 361
      // Distance couldn't parse a geometry object                                                    // 362
      if (dist === null)                                                                              // 363
        return false;                                                                                 // 364
                                                                                                      // 365
      return maxDistance === undefined ? true : dist <= maxDistance;                                  // 366
    };                                                                                                // 367
  },                                                                                                  // 368
                                                                                                      // 369
  "$maxDistance": function () {                                                                       // 370
    // evaluation happens in the $near operator                                                       // 371
    return function () { return true; }                                                               // 372
  }                                                                                                   // 373
};                                                                                                    // 374
                                                                                                      // 375
// helpers used by compiled selector code                                                             // 376
LocalCollection._f = {                                                                                // 377
  // XXX for _all and _in, consider building 'inquery' at compile time..                              // 378
                                                                                                      // 379
  _type: function (v) {                                                                               // 380
    if (typeof v === "number")                                                                        // 381
      return 1;                                                                                       // 382
    if (typeof v === "string")                                                                        // 383
      return 2;                                                                                       // 384
    if (typeof v === "boolean")                                                                       // 385
      return 8;                                                                                       // 386
    if (isArray(v))                                                                                   // 387
      return 4;                                                                                       // 388
    if (v === null)                                                                                   // 389
      return 10;                                                                                      // 390
    if (v instanceof RegExp)                                                                          // 391
      return 11;                                                                                      // 392
    if (typeof v === "function")                                                                      // 393
      // note that typeof(/x/) === "function"                                                         // 394
      return 13;                                                                                      // 395
    if (v instanceof Date)                                                                            // 396
      return 9;                                                                                       // 397
    if (EJSON.isBinary(v))                                                                            // 398
      return 5;                                                                                       // 399
    if (v instanceof LocalCollection._ObjectID)                                                       // 400
      return 7;                                                                                       // 401
    return 3; // object                                                                               // 402
                                                                                                      // 403
    // XXX support some/all of these:                                                                 // 404
    // 14, symbol                                                                                     // 405
    // 15, javascript code with scope                                                                 // 406
    // 16, 18: 32-bit/64-bit integer                                                                  // 407
    // 17, timestamp                                                                                  // 408
    // 255, minkey                                                                                    // 409
    // 127, maxkey                                                                                    // 410
  },                                                                                                  // 411
                                                                                                      // 412
  // deep equality test: use for literal document and array matches                                   // 413
  _equal: function (a, b) {                                                                           // 414
    return EJSON.equals(a, b, {keyOrderSensitive: true});                                             // 415
  },                                                                                                  // 416
                                                                                                      // 417
  // maps a type code to a value that can be used to sort values of                                   // 418
  // different types                                                                                  // 419
  _typeorder: function (t) {                                                                          // 420
    // http://www.mongodb.org/display/DOCS/What+is+the+Compare+Order+for+BSON+Types                   // 421
    // XXX what is the correct sort position for Javascript code?                                     // 422
    // ('100' in the matrix below)                                                                    // 423
    // XXX minkey/maxkey                                                                              // 424
    return [-1,  // (not a type)                                                                      // 425
            1,   // number                                                                            // 426
            2,   // string                                                                            // 427
            3,   // object                                                                            // 428
            4,   // array                                                                             // 429
            5,   // binary                                                                            // 430
            -1,  // deprecated                                                                        // 431
            6,   // ObjectID                                                                          // 432
            7,   // bool                                                                              // 433
            8,   // Date                                                                              // 434
            0,   // null                                                                              // 435
            9,   // RegExp                                                                            // 436
            -1,  // deprecated                                                                        // 437
            100, // JS code                                                                           // 438
            2,   // deprecated (symbol)                                                               // 439
            100, // JS code                                                                           // 440
            1,   // 32-bit int                                                                        // 441
            8,   // Mongo timestamp                                                                   // 442
            1    // 64-bit int                                                                        // 443
           ][t];                                                                                      // 444
  },                                                                                                  // 445
                                                                                                      // 446
  // compare two values of unknown type according to BSON ordering                                    // 447
  // semantics. (as an extension, consider 'undefined' to be less than                                // 448
  // any other value.) return negative if a is less, positive if b is                                 // 449
  // less, or 0 if equal                                                                              // 450
  _cmp: function (a, b) {                                                                             // 451
    if (a === undefined)                                                                              // 452
      return b === undefined ? 0 : -1;                                                                // 453
    if (b === undefined)                                                                              // 454
      return 1;                                                                                       // 455
    var ta = LocalCollection._f._type(a);                                                             // 456
    var tb = LocalCollection._f._type(b);                                                             // 457
    var oa = LocalCollection._f._typeorder(ta);                                                       // 458
    var ob = LocalCollection._f._typeorder(tb);                                                       // 459
    if (oa !== ob)                                                                                    // 460
      return oa < ob ? -1 : 1;                                                                        // 461
    if (ta !== tb)                                                                                    // 462
      // XXX need to implement this if we implement Symbol or integers, or                            // 463
      // Timestamp                                                                                    // 464
      throw Error("Missing type coercion logic in _cmp");                                             // 465
    if (ta === 7) { // ObjectID                                                                       // 466
      // Convert to string.                                                                           // 467
      ta = tb = 2;                                                                                    // 468
      a = a.toHexString();                                                                            // 469
      b = b.toHexString();                                                                            // 470
    }                                                                                                 // 471
    if (ta === 9) { // Date                                                                           // 472
      // Convert to millis.                                                                           // 473
      ta = tb = 1;                                                                                    // 474
      a = a.getTime();                                                                                // 475
      b = b.getTime();                                                                                // 476
    }                                                                                                 // 477
                                                                                                      // 478
    if (ta === 1) // double                                                                           // 479
      return a - b;                                                                                   // 480
    if (tb === 2) // string                                                                           // 481
      return a < b ? -1 : (a === b ? 0 : 1);                                                          // 482
    if (ta === 3) { // Object                                                                         // 483
      // this could be much more efficient in the expected case ...                                   // 484
      var to_array = function (obj) {                                                                 // 485
        var ret = [];                                                                                 // 486
        for (var key in obj) {                                                                        // 487
          ret.push(key);                                                                              // 488
          ret.push(obj[key]);                                                                         // 489
        }                                                                                             // 490
        return ret;                                                                                   // 491
      };                                                                                              // 492
      return LocalCollection._f._cmp(to_array(a), to_array(b));                                       // 493
    }                                                                                                 // 494
    if (ta === 4) { // Array                                                                          // 495
      for (var i = 0; ; i++) {                                                                        // 496
        if (i === a.length)                                                                           // 497
          return (i === b.length) ? 0 : -1;                                                           // 498
        if (i === b.length)                                                                           // 499
          return 1;                                                                                   // 500
        var s = LocalCollection._f._cmp(a[i], b[i]);                                                  // 501
        if (s !== 0)                                                                                  // 502
          return s;                                                                                   // 503
      }                                                                                               // 504
    }                                                                                                 // 505
    if (ta === 5) { // binary                                                                         // 506
      // Surprisingly, a small binary blob is always less than a large one in                         // 507
      // Mongo.                                                                                       // 508
      if (a.length !== b.length)                                                                      // 509
        return a.length - b.length;                                                                   // 510
      for (i = 0; i < a.length; i++) {                                                                // 511
        if (a[i] < b[i])                                                                              // 512
          return -1;                                                                                  // 513
        if (a[i] > b[i])                                                                              // 514
          return 1;                                                                                   // 515
      }                                                                                               // 516
      return 0;                                                                                       // 517
    }                                                                                                 // 518
    if (ta === 8) { // boolean                                                                        // 519
      if (a) return b ? 0 : 1;                                                                        // 520
      return b ? -1 : 0;                                                                              // 521
    }                                                                                                 // 522
    if (ta === 10) // null                                                                            // 523
      return 0;                                                                                       // 524
    if (ta === 11) // regexp                                                                          // 525
      throw Error("Sorting not supported on regular expression"); // XXX                              // 526
    // 13: javascript code                                                                            // 527
    // 14: symbol                                                                                     // 528
    // 15: javascript code with scope                                                                 // 529
    // 16: 32-bit integer                                                                             // 530
    // 17: timestamp                                                                                  // 531
    // 18: 64-bit integer                                                                             // 532
    // 255: minkey                                                                                    // 533
    // 127: maxkey                                                                                    // 534
    if (ta === 13) // javascript code                                                                 // 535
      throw Error("Sorting not supported on Javascript code"); // XXX                                 // 536
    throw Error("Unknown type to sort");                                                              // 537
  }                                                                                                   // 538
};                                                                                                    // 539
                                                                                                      // 540
// For unit tests. True if the given document matches the given                                       // 541
// selector.                                                                                          // 542
MinimongoTest.matches = function (selector, doc) {                                                    // 543
  return (LocalCollection._compileSelector(selector))(doc);                                           // 544
};                                                                                                    // 545
                                                                                                      // 546
// _makeLookupFunction(key) returns a lookup function.                                                // 547
//                                                                                                    // 548
// A lookup function takes in a document and returns an array of matching                             // 549
// values.  This array has more than one element if any segment of the key other                      // 550
// than the last one is an array.  ie, any arrays found when doing non-final                          // 551
// lookups result in this function "branching"; each element in the returned                          // 552
// array represents the value found at this branch. If any branch doesn't have a                      // 553
// final value for the full key, its element in the returned list will be                             // 554
// undefined. It always returns a non-empty array.                                                    // 555
//                                                                                                    // 556
// _makeLookupFunction('a.x')({a: {x: 1}}) returns [1]                                                // 557
// _makeLookupFunction('a.x')({a: {x: [1]}}) returns [[1]]                                            // 558
// _makeLookupFunction('a.x')({a: 5})  returns [undefined]                                            // 559
// _makeLookupFunction('a.x')({a: [{x: 1},                                                            // 560
//                                 {x: [2]},                                                          // 561
//                                 {y: 3}]})                                                          // 562
//   returns [1, [2], undefined]                                                                      // 563
LocalCollection._makeLookupFunction = function (key) {                                                // 564
  var dotLocation = key.indexOf('.');                                                                 // 565
  var first, lookupRest, nextIsNumeric;                                                               // 566
  if (dotLocation === -1) {                                                                           // 567
    first = key;                                                                                      // 568
  } else {                                                                                            // 569
    first = key.substr(0, dotLocation);                                                               // 570
    var rest = key.substr(dotLocation + 1);                                                           // 571
    lookupRest = LocalCollection._makeLookupFunction(rest);                                           // 572
    // Is the next (perhaps final) piece numeric (ie, an array lookup?)                               // 573
    nextIsNumeric = /^\d+(\.|$)/.test(rest);                                                          // 574
  }                                                                                                   // 575
                                                                                                      // 576
  return function (doc) {                                                                             // 577
    if (doc == null)  // null or undefined                                                            // 578
      return [undefined];                                                                             // 579
    var firstLevel = doc[first];                                                                      // 580
                                                                                                      // 581
    // We don't "branch" at the final level.                                                          // 582
    if (!lookupRest)                                                                                  // 583
      return [firstLevel];                                                                            // 584
                                                                                                      // 585
    // It's an empty array, and we're not done: we won't find anything.                               // 586
    if (isArray(firstLevel) && firstLevel.length === 0)                                               // 587
      return [undefined];                                                                             // 588
                                                                                                      // 589
    // For each result at this level, finish the lookup on the rest of the key,                       // 590
    // and return everything we find. Also, if the next result is a number,                           // 591
    // don't branch here.                                                                             // 592
    //                                                                                                // 593
    // Technically, in MongoDB, we should be able to handle the case where                            // 594
    // objects have numeric keys, but Mongo doesn't actually handle this                              // 595
    // consistently yet itself, see eg                                                                // 596
    // https://jira.mongodb.org/browse/SERVER-2898                                                    // 597
    // https://github.com/mongodb/mongo/blob/master/jstests/array_match2.js                           // 598
    if (!isArray(firstLevel) || nextIsNumeric)                                                        // 599
      firstLevel = [firstLevel];                                                                      // 600
    return Array.prototype.concat.apply([], _.map(firstLevel, lookupRest));                           // 601
  };                                                                                                  // 602
};                                                                                                    // 603
                                                                                                      // 604
// The main compilation function for a given selector.                                                // 605
var compileDocumentSelector = function (docSelector, cursor) {                                        // 606
  var perKeySelectors = [];                                                                           // 607
  _.each(docSelector, function (subSelector, key) {                                                   // 608
    if (key.substr(0, 1) === '$') {                                                                   // 609
      // Outer operators are either logical operators (they recurse back into                         // 610
      // this function), or $where.                                                                   // 611
      if (!_.has(LOGICAL_OPERATORS, key))                                                             // 612
        throw new Error("Unrecognized logical operator: " + key);                                     // 613
      perKeySelectors.push(                                                                           // 614
        LOGICAL_OPERATORS[key](subSelector, docSelector, cursor));                                    // 615
    } else {                                                                                          // 616
      var lookUpByIndex = LocalCollection._makeLookupFunction(key);                                   // 617
      var valueSelectorFunc =                                                                         // 618
        compileValueSelector(subSelector, docSelector, cursor);                                       // 619
      perKeySelectors.push(function (doc, wholeDoc) {                                                 // 620
        var branchValues = lookUpByIndex(doc);                                                        // 621
        // We apply the selector to each "branched" value and return true if any                      // 622
        // match. However, for "negative" selectors like $ne or $not we actually                      // 623
        // require *all* elements to match.                                                           // 624
        //                                                                                            // 625
        // This is because {'x.tag': {$ne: "foo"}} applied to {x: [{tag: 'foo'},                      // 626
        // {tag: 'bar'}]} should NOT match even though there is a branch that                         // 627
        // matches. (This matches the fact that $ne uses a negated                                    // 628
        // _anyIfArrayPlus, for when the last level of the key is the array,                          // 629
        // which deMorgans into an 'all'.)                                                            // 630
        //                                                                                            // 631
        // XXX This isn't 100% consistent with MongoDB in 'null' cases:                               // 632
        //     https://jira.mongodb.org/browse/SERVER-8585                                            // 633
        // XXX this still isn't right.  consider {a: {$ne: 5, $gt: 6}}. the                           // 634
        //     $ne needs to use the "all" logic and the $gt needs the "any"                           // 635
        //     logic                                                                                  // 636
        var combiner = (subSelector &&                                                                // 637
                        (subSelector.$not || subSelector.$ne ||                                       // 638
                         subSelector.$nin))                                                           // 639
              ? _.all : _.any;                                                                        // 640
        return combiner(branchValues, function (val) {                                                // 641
          return valueSelectorFunc(val, wholeDoc);                                                    // 642
        });                                                                                           // 643
      });                                                                                             // 644
    }                                                                                                 // 645
  });                                                                                                 // 646
                                                                                                      // 647
                                                                                                      // 648
  return function (doc, wholeDoc) {                                                                   // 649
    // If called w/o wholeDoc, doc is considered the original by default                              // 650
    if (wholeDoc === undefined)                                                                       // 651
      wholeDoc = doc;                                                                                 // 652
    return _.all(perKeySelectors, function (f) {                                                      // 653
      return f(doc, wholeDoc);                                                                        // 654
    });                                                                                               // 655
  };                                                                                                  // 656
};                                                                                                    // 657
                                                                                                      // 658
// Given a selector, return a function that takes one argument, a                                     // 659
// document, and returns true if the document matches the selector,                                   // 660
// else false.                                                                                        // 661
LocalCollection._compileSelector = function (selector, cursor) {                                      // 662
  // you can pass a literal function instead of a selector                                            // 663
  if (selector instanceof Function)                                                                   // 664
    return function (doc) {return selector.call(doc);};                                               // 665
                                                                                                      // 666
  // shorthand -- scalars match _id                                                                   // 667
  if (LocalCollection._selectorIsId(selector)) {                                                      // 668
    return function (doc) {                                                                           // 669
      return EJSON.equals(doc._id, selector);                                                         // 670
    };                                                                                                // 671
  }                                                                                                   // 672
                                                                                                      // 673
  // protect against dangerous selectors.  falsey and {_id: falsey} are both                          // 674
  // likely programmer error, and not what you want, particularly for                                 // 675
  // destructive operations.                                                                          // 676
  if (!selector || (('_id' in selector) && !selector._id))                                            // 677
    return function (doc) {return false;};                                                            // 678
                                                                                                      // 679
  // Top level can't be an array or true or binary.                                                   // 680
  if (typeof(selector) === 'boolean' || isArray(selector) ||                                          // 681
      EJSON.isBinary(selector))                                                                       // 682
    throw new Error("Invalid selector: " + selector);                                                 // 683
                                                                                                      // 684
  return compileDocumentSelector(selector, cursor);                                                   // 685
};                                                                                                    // 686
                                                                                                      // 687
// Give a sort spec, which can be in any of these forms:                                              // 688
//   {"key1": 1, "key2": -1}                                                                          // 689
//   [["key1", "asc"], ["key2", "desc"]]                                                              // 690
//   ["key1", ["key2", "desc"]]                                                                       // 691
//                                                                                                    // 692
// (.. with the first form being dependent on the key enumeration                                     // 693
// behavior of your javascript VM, which usually does what you mean in                                // 694
// this case if the key names don't look like integers ..)                                            // 695
//                                                                                                    // 696
// return a function that takes two objects, and returns -1 if the                                    // 697
// first object comes first in order, 1 if the second object comes                                    // 698
// first, or 0 if neither object comes before the other.                                              // 699
                                                                                                      // 700
LocalCollection._compileSort = function (spec, cursor) {                                              // 701
  var sortSpecParts = [];                                                                             // 702
                                                                                                      // 703
  if (spec instanceof Array) {                                                                        // 704
    for (var i = 0; i < spec.length; i++) {                                                           // 705
      if (typeof spec[i] === "string") {                                                              // 706
        sortSpecParts.push({                                                                          // 707
          lookup: LocalCollection._makeLookupFunction(spec[i]),                                       // 708
          ascending: true                                                                             // 709
        });                                                                                           // 710
      } else {                                                                                        // 711
        sortSpecParts.push({                                                                          // 712
          lookup: LocalCollection._makeLookupFunction(spec[i][0]),                                    // 713
          ascending: spec[i][1] !== "desc"                                                            // 714
        });                                                                                           // 715
      }                                                                                               // 716
    }                                                                                                 // 717
  } else if (typeof spec === "object") {                                                              // 718
    for (var key in spec) {                                                                           // 719
      sortSpecParts.push({                                                                            // 720
        lookup: LocalCollection._makeLookupFunction(key),                                             // 721
        ascending: spec[key] >= 0                                                                     // 722
      });                                                                                             // 723
    }                                                                                                 // 724
  } else {                                                                                            // 725
    throw Error("Bad sort specification: ", JSON.stringify(spec));                                    // 726
  }                                                                                                   // 727
                                                                                                      // 728
  // If there are no sorting rules specified, try to sort on _distance hidden                         // 729
  // fields on cursor we may acquire if query involved $near operator.                                // 730
  if (sortSpecParts.length === 0)                                                                     // 731
    return function (a, b) {                                                                          // 732
      if (!cursor || !cursor._distance)                                                               // 733
        return 0;                                                                                     // 734
      return cursor._distance[a._id] - cursor._distance[b._id];                                       // 735
    };                                                                                                // 736
                                                                                                      // 737
  // reduceValue takes in all the possible values for the sort key along various                      // 738
  // branches, and returns the min or max value (according to the bool                                // 739
  // findMin). Each value can itself be an array, and we look at its values                           // 740
  // too. (ie, we do a single level of flattening on branchValues, then find the                      // 741
  // min/max.)                                                                                        // 742
  var reduceValue = function (branchValues, findMin) {                                                // 743
    var reduced;                                                                                      // 744
    var first = true;                                                                                 // 745
    // Iterate over all the values found in all the branches, and if a value is                       // 746
    // an array itself, iterate over the values in the array separately.                              // 747
    _.each(branchValues, function (branchValue) {                                                     // 748
      // Value not an array? Pretend it is.                                                           // 749
      if (!isArray(branchValue))                                                                      // 750
        branchValue = [branchValue];                                                                  // 751
      // Value is an empty array? Pretend it was missing, since that's where it                       // 752
      // should be sorted.                                                                            // 753
      if (isArray(branchValue) && branchValue.length === 0)                                           // 754
        branchValue = [undefined];                                                                    // 755
      _.each(branchValue, function (value) {                                                          // 756
        // We should get here at least once: lookup functions return non-empty                        // 757
        // arrays, so the outer loop runs at least once, and we prevented                             // 758
        // branchValue from being an empty array.                                                     // 759
        if (first) {                                                                                  // 760
          reduced = value;                                                                            // 761
          first = false;                                                                              // 762
        } else {                                                                                      // 763
          // Compare the value we found to the value we found so far, saving it                       // 764
          // if it's less (for an ascending sort) or more (for a descending                           // 765
          // sort).                                                                                   // 766
          var cmp = LocalCollection._f._cmp(reduced, value);                                          // 767
          if ((findMin && cmp > 0) || (!findMin && cmp < 0))                                          // 768
            reduced = value;                                                                          // 769
        }                                                                                             // 770
      });                                                                                             // 771
    });                                                                                               // 772
    return reduced;                                                                                   // 773
  };                                                                                                  // 774
                                                                                                      // 775
  return function (a, b) {                                                                            // 776
    for (var i = 0; i < sortSpecParts.length; ++i) {                                                  // 777
      var specPart = sortSpecParts[i];                                                                // 778
      var aValue = reduceValue(specPart.lookup(a), specPart.ascending);                               // 779
      var bValue = reduceValue(specPart.lookup(b), specPart.ascending);                               // 780
      var compare = LocalCollection._f._cmp(aValue, bValue);                                          // 781
      if (compare !== 0)                                                                              // 782
        return specPart.ascending ? compare : -compare;                                               // 783
    };                                                                                                // 784
    return 0;                                                                                         // 785
  };                                                                                                  // 786
};                                                                                                    // 787
                                                                                                      // 788
                                                                                                      // 789
////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                    //
// packages/minimongo/projection.js                                                                   //
//                                                                                                    //
////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                      //
// Knows how to compile a fields projection to a predicate function.                                  // 1
// @returns - Function: a closure that filters out an object according to the                         // 2
//            fields projection rules:                                                                // 3
//            @param obj - Object: MongoDB-styled document                                            // 4
//            @returns - Object: a document with the fields filtered out                              // 5
//                       according to projection rules. Doesn't retain subfields                      // 6
//                       of passed argument.                                                          // 7
LocalCollection._compileProjection = function (fields) {                                              // 8
  LocalCollection._checkSupportedProjection(fields);                                                  // 9
                                                                                                      // 10
  var _idProjection = _.isUndefined(fields._id) ? true : fields._id;                                  // 11
  var details = projectionDetails(fields);                                                            // 12
                                                                                                      // 13
  // returns transformed doc according to ruleTree                                                    // 14
  var transform = function (doc, ruleTree) {                                                          // 15
    // Special case for "sets"                                                                        // 16
    if (_.isArray(doc))                                                                               // 17
      return _.map(doc, function (subdoc) { return transform(subdoc, ruleTree); });                   // 18
                                                                                                      // 19
    var res = details.including ? {} : EJSON.clone(doc);                                              // 20
    _.each(ruleTree, function (rule, key) {                                                           // 21
      if (!_.has(doc, key))                                                                           // 22
        return;                                                                                       // 23
      if (_.isObject(rule)) {                                                                         // 24
        // For sub-objects/subsets we branch                                                          // 25
        if (_.isObject(doc[key]))                                                                     // 26
          res[key] = transform(doc[key], rule);                                                       // 27
        // Otherwise we don't even touch this subfield                                                // 28
      } else if (details.including)                                                                   // 29
        res[key] = EJSON.clone(doc[key]);                                                             // 30
      else                                                                                            // 31
        delete res[key];                                                                              // 32
    });                                                                                               // 33
                                                                                                      // 34
    return res;                                                                                       // 35
  };                                                                                                  // 36
                                                                                                      // 37
  return function (obj) {                                                                             // 38
    var res = transform(obj, details.tree);                                                           // 39
                                                                                                      // 40
    if (_idProjection && _.has(obj, '_id'))                                                           // 41
      res._id = obj._id;                                                                              // 42
    if (!_idProjection && _.has(res, '_id'))                                                          // 43
      delete res._id;                                                                                 // 44
    return res;                                                                                       // 45
  };                                                                                                  // 46
};                                                                                                    // 47
                                                                                                      // 48
// Traverses the keys of passed projection and constructs a tree where all                            // 49
// leaves are either all True or all False                                                            // 50
// @returns Object:                                                                                   // 51
//  - tree - Object - tree representation of keys involved in projection                              // 52
//  (exception for '_id' as it is a special case handled separately)                                  // 53
//  - including - Boolean - "take only certain fields" type of projection                             // 54
projectionDetails = function (fields) {                                                               // 55
  // Find the non-_id keys (_id is handled specially because it is included unless                    // 56
  // explicitly excluded). Sort the keys, so that our code to detect overlaps                         // 57
  // like 'foo' and 'foo.bar' can assume that 'foo' comes first.                                      // 58
  var fieldsKeys = _.keys(fields).sort();                                                             // 59
                                                                                                      // 60
  // If there are other rules other than '_id', treat '_id' differently in a                          // 61
  // separate case. If '_id' is the only rule, use it to understand if it is                          // 62
  // including/excluding projection.                                                                  // 63
  if (fieldsKeys.length > 0 && !(fieldsKeys.length === 1 && fieldsKeys[0] === '_id'))                 // 64
    fieldsKeys = _.reject(fieldsKeys, function (key) { return key === '_id'; });                      // 65
                                                                                                      // 66
  var including = null; // Unknown                                                                    // 67
                                                                                                      // 68
  _.each(fieldsKeys, function (keyPath) {                                                             // 69
    var rule = !!fields[keyPath];                                                                     // 70
    if (including === null)                                                                           // 71
      including = rule;                                                                               // 72
    if (including !== rule)                                                                           // 73
      // This error message is copies from MongoDB shell                                              // 74
      throw MinimongoError("You cannot currently mix including and excluding fields.");               // 75
  });                                                                                                 // 76
                                                                                                      // 77
                                                                                                      // 78
  var projectionRulesTree = pathsToTree(                                                              // 79
    fieldsKeys,                                                                                       // 80
    function (path) { return including; },                                                            // 81
    function (node, path, fullPath) {                                                                 // 82
      // Check passed projection fields' keys: If you have two rules such as                          // 83
      // 'foo.bar' and 'foo.bar.baz', then the result becomes ambiguous. If                           // 84
      // that happens, there is a probability you are doing something wrong,                          // 85
      // framework should notify you about such mistake earlier on cursor                             // 86
      // compilation step than later during runtime.  Note, that real mongo                           // 87
      // doesn't do anything about it and the later rule appears in projection                        // 88
      // project, more priority it takes.                                                             // 89
      //                                                                                              // 90
      // Example, assume following in mongo shell:                                                    // 91
      // > db.coll.insert({ a: { b: 23, c: 44 } })                                                    // 92
      // > db.coll.find({}, { 'a': 1, 'a.b': 1 })                                                     // 93
      // { "_id" : ObjectId("520bfe456024608e8ef24af3"), "a" : { "b" : 23 } }                         // 94
      // > db.coll.find({}, { 'a.b': 1, 'a': 1 })                                                     // 95
      // { "_id" : ObjectId("520bfe456024608e8ef24af3"), "a" : { "b" : 23, "c" : 44 } }               // 96
      //                                                                                              // 97
      // Note, how second time the return set of keys is different.                                   // 98
                                                                                                      // 99
      var currentPath = fullPath;                                                                     // 100
      var anotherPath = path;                                                                         // 101
      throw MinimongoError("both " + currentPath + " and " + anotherPath +                            // 102
                           " found in fields option, using both of them may trigger " +               // 103
                           "unexpected behavior. Did you mean to use only one of them?");             // 104
    });                                                                                               // 105
                                                                                                      // 106
  return {                                                                                            // 107
    tree: projectionRulesTree,                                                                        // 108
    including: including                                                                              // 109
  };                                                                                                  // 110
};                                                                                                    // 111
                                                                                                      // 112
// paths - Array: list of mongo style paths                                                           // 113
// newLeafFn - Function: of form function(path) should return a scalar value to                       // 114
//                       put into list created for that path                                          // 115
// conflictFn - Function: of form function(node, path, fullPath) is called                            // 116
//                        when building a tree path for 'fullPath' node on                            // 117
//                        'path' was already a leaf with a value. Must return a                       // 118
//                        conflict resolution.                                                        // 119
// initial tree - Optional Object: starting tree.                                                     // 120
// @returns - Object: tree represented as a set of nested objects                                     // 121
pathsToTree = function (paths, newLeafFn, conflictFn, tree) {                                         // 122
  tree = tree || {};                                                                                  // 123
  _.each(paths, function (keyPath) {                                                                  // 124
    var treePos = tree;                                                                               // 125
    var pathArr = keyPath.split('.');                                                                 // 126
                                                                                                      // 127
    // use _.all just for iteration with break                                                        // 128
    var success = _.all(pathArr.slice(0, -1), function (key, idx) {                                   // 129
      if (!_.has(treePos, key))                                                                       // 130
        treePos[key] = {};                                                                            // 131
      else if (!_.isObject(treePos[key])) {                                                           // 132
        treePos[key] = conflictFn(treePos[key],                                                       // 133
                                  pathArr.slice(0, idx + 1).join('.'),                                // 134
                                  keyPath);                                                           // 135
        // break out of loop if we are failing for this path                                          // 136
        if (!_.isObject(treePos[key]))                                                                // 137
          return false;                                                                               // 138
      }                                                                                               // 139
                                                                                                      // 140
      treePos = treePos[key];                                                                         // 141
      return true;                                                                                    // 142
    });                                                                                               // 143
                                                                                                      // 144
    if (success) {                                                                                    // 145
      var lastKey = _.last(pathArr);                                                                  // 146
      if (!_.has(treePos, lastKey))                                                                   // 147
        treePos[lastKey] = newLeafFn(keyPath);                                                        // 148
      else                                                                                            // 149
        treePos[lastKey] = conflictFn(treePos[lastKey], keyPath, keyPath);                            // 150
    }                                                                                                 // 151
  });                                                                                                 // 152
                                                                                                      // 153
  return tree;                                                                                        // 154
};                                                                                                    // 155
                                                                                                      // 156
LocalCollection._checkSupportedProjection = function (fields) {                                       // 157
  if (!_.isObject(fields) || _.isArray(fields))                                                       // 158
    throw MinimongoError("fields option must be an object");                                          // 159
                                                                                                      // 160
  _.each(fields, function (val, keyPath) {                                                            // 161
    if (_.contains(keyPath.split('.'), '$'))                                                          // 162
      throw MinimongoError("Minimongo doesn't support $ operator in projections yet.");               // 163
    if (_.indexOf([1, 0, true, false], val) === -1)                                                   // 164
      throw MinimongoError("Projection values should be one of 1, 0, true, or false");                // 165
  });                                                                                                 // 166
};                                                                                                    // 167
                                                                                                      // 168
                                                                                                      // 169
////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                    //
// packages/minimongo/modify.js                                                                       //
//                                                                                                    //
////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                      //
// XXX need a strategy for passing the binding of $ into this                                         // 1
// function, from the compiled selector                                                               // 2
//                                                                                                    // 3
// maybe just {key.up.to.just.before.dollarsign: array_index}                                         // 4
//                                                                                                    // 5
// XXX atomicity: if one modification fails, do we roll back the whole                                // 6
// change?                                                                                            // 7
//                                                                                                    // 8
// isInsert is set when _modify is being called to compute the document to                            // 9
// insert as part of an upsert operation. We use this primarily to figure out                         // 10
// when to set the fields in $setOnInsert, if present.                                                // 11
LocalCollection._modify = function (doc, mod, isInsert) {                                             // 12
  var is_modifier = false;                                                                            // 13
  for (var k in mod) {                                                                                // 14
    // IE7 doesn't support indexing into strings (eg, k[0]), so use substr.                           // 15
    // Too bad -- it's far slower:                                                                    // 16
    // http://jsperf.com/testing-the-first-character-of-a-string                                      // 17
    is_modifier = k.substr(0, 1) === '$';                                                             // 18
    break; // just check the first key.                                                               // 19
  }                                                                                                   // 20
                                                                                                      // 21
  var new_doc;                                                                                        // 22
                                                                                                      // 23
  if (!is_modifier) {                                                                                 // 24
    if (mod._id && !EJSON.equals(doc._id, mod._id))                                                   // 25
      throw MinimongoError("Cannot change the _id of a document");                                    // 26
                                                                                                      // 27
    // replace the whole document                                                                     // 28
    for (var k in mod) {                                                                              // 29
      if (k.substr(0, 1) === '$')                                                                     // 30
        throw MinimongoError(                                                                         // 31
          "When replacing document, field name may not start with '$'");                              // 32
      if (/\./.test(k))                                                                               // 33
        throw MinimongoError(                                                                         // 34
          "When replacing document, field name may not contain '.'");                                 // 35
    }                                                                                                 // 36
    new_doc = mod;                                                                                    // 37
  } else {                                                                                            // 38
    // apply modifiers                                                                                // 39
    var new_doc = EJSON.clone(doc);                                                                   // 40
                                                                                                      // 41
    for (var op in mod) {                                                                             // 42
      var mod_func = LocalCollection._modifiers[op];                                                  // 43
      // Treat $setOnInsert as $set if this is an insert.                                             // 44
      if (isInsert && op === '$setOnInsert')                                                          // 45
        mod_func = LocalCollection._modifiers['$set'];                                                // 46
      if (!mod_func)                                                                                  // 47
        throw MinimongoError("Invalid modifier specified " + op);                                     // 48
      for (var keypath in mod[op]) {                                                                  // 49
        // XXX mongo doesn't allow mod field names to end in a period,                                // 50
        // but I don't see why.. it allows '' as a key, as does JS                                    // 51
        if (keypath.length && keypath[keypath.length-1] === '.')                                      // 52
          throw MinimongoError(                                                                       // 53
            "Invalid mod field name, may not end in a period");                                       // 54
                                                                                                      // 55
        var arg = mod[op][keypath];                                                                   // 56
        var keyparts = keypath.split('.');                                                            // 57
        var no_create = !!LocalCollection._noCreateModifiers[op];                                     // 58
        var forbid_array = (op === "$rename");                                                        // 59
        var target = LocalCollection._findModTarget(new_doc, keyparts,                                // 60
                                                    no_create, forbid_array);                         // 61
        var field = keyparts.pop();                                                                   // 62
        mod_func(target, field, arg, keypath, new_doc);                                               // 63
      }                                                                                               // 64
    }                                                                                                 // 65
  }                                                                                                   // 66
                                                                                                      // 67
  // move new document into place.                                                                    // 68
  _.each(_.keys(doc), function (k) {                                                                  // 69
    // Note: this used to be for (var k in doc) however, this does not                                // 70
    // work right in Opera. Deleting from a doc while iterating over it                               // 71
    // would sometimes cause opera to skip some keys.                                                 // 72
                                                                                                      // 73
    // isInsert: if we're constructing a document to insert (via upsert)                              // 74
    // and we're in replacement mode, not modify mode, DON'T take the                                 // 75
    // _id from the query.  This matches mongo's behavior.                                            // 76
    if (k !== '_id' || isInsert)                                                                      // 77
      delete doc[k];                                                                                  // 78
  });                                                                                                 // 79
  for (var k in new_doc) {                                                                            // 80
    doc[k] = new_doc[k];                                                                              // 81
  }                                                                                                   // 82
};                                                                                                    // 83
                                                                                                      // 84
// for a.b.c.2.d.e, keyparts should be ['a', 'b', 'c', '2', 'd', 'e'],                                // 85
// and then you would operate on the 'e' property of the returned                                     // 86
// object. if no_create is falsey, creates intermediate levels of                                     // 87
// structure as necessary, like mkdir -p (and raises an exception if                                  // 88
// that would mean giving a non-numeric property to an array.) if                                     // 89
// no_create is true, return undefined instead. may modify the last                                   // 90
// element of keyparts to signal to the caller that it needs to use a                                 // 91
// different value to index into the returned object (for example,                                    // 92
// ['a', '01'] -> ['a', 1]). if forbid_array is true, return null if                                  // 93
// the keypath goes through an array.                                                                 // 94
LocalCollection._findModTarget = function (doc, keyparts, no_create,                                  // 95
                                      forbid_array) {                                                 // 96
  for (var i = 0; i < keyparts.length; i++) {                                                         // 97
    var last = (i === keyparts.length - 1);                                                           // 98
    var keypart = keyparts[i];                                                                        // 99
    var numeric = /^[0-9]+$/.test(keypart);                                                           // 100
    if (no_create && (!(typeof doc === "object") || !(keypart in doc)))                               // 101
      return undefined;                                                                               // 102
    if (doc instanceof Array) {                                                                       // 103
      if (forbid_array)                                                                               // 104
        return null;                                                                                  // 105
      if (!numeric)                                                                                   // 106
        throw MinimongoError(                                                                         // 107
          "can't append to array using string field name ["                                           // 108
                    + keypart + "]");                                                                 // 109
      keypart = parseInt(keypart);                                                                    // 110
      if (last)                                                                                       // 111
        // handle 'a.01'                                                                              // 112
        keyparts[i] = keypart;                                                                        // 113
      while (doc.length < keypart)                                                                    // 114
        doc.push(null);                                                                               // 115
      if (!last) {                                                                                    // 116
        if (doc.length === keypart)                                                                   // 117
          doc.push({});                                                                               // 118
        else if (typeof doc[keypart] !== "object")                                                    // 119
          throw MinimongoError("can't modify field '" + keyparts[i + 1] +                             // 120
                      "' of list value " + JSON.stringify(doc[keypart]));                             // 121
      }                                                                                               // 122
    } else {                                                                                          // 123
      // XXX check valid fieldname (no $ at start, no .)                                              // 124
      if (!last && !(keypart in doc))                                                                 // 125
        doc[keypart] = {};                                                                            // 126
    }                                                                                                 // 127
                                                                                                      // 128
    if (last)                                                                                         // 129
      return doc;                                                                                     // 130
    doc = doc[keypart];                                                                               // 131
  }                                                                                                   // 132
                                                                                                      // 133
  // notreached                                                                                       // 134
};                                                                                                    // 135
                                                                                                      // 136
LocalCollection._noCreateModifiers = {                                                                // 137
  $unset: true,                                                                                       // 138
  $pop: true,                                                                                         // 139
  $rename: true,                                                                                      // 140
  $pull: true,                                                                                        // 141
  $pullAll: true                                                                                      // 142
};                                                                                                    // 143
                                                                                                      // 144
LocalCollection._modifiers = {                                                                        // 145
  $inc: function (target, field, arg) {                                                               // 146
    if (typeof arg !== "number")                                                                      // 147
      throw MinimongoError("Modifier $inc allowed for numbers only");                                 // 148
    if (field in target) {                                                                            // 149
      if (typeof target[field] !== "number")                                                          // 150
        throw MinimongoError("Cannot apply $inc modifier to non-number");                             // 151
      target[field] += arg;                                                                           // 152
    } else {                                                                                          // 153
      target[field] = arg;                                                                            // 154
    }                                                                                                 // 155
  },                                                                                                  // 156
  $set: function (target, field, arg) {                                                               // 157
    if (!_.isObject(target)) { // not an array or an object                                           // 158
      var e = MinimongoError("Cannot set property on non-object field");                              // 159
      e.setPropertyError = true;                                                                      // 160
      throw e;                                                                                        // 161
    }                                                                                                 // 162
    if (target === null) {                                                                            // 163
      var e = MinimongoError("Cannot set property on null");                                          // 164
      e.setPropertyError = true;                                                                      // 165
      throw e;                                                                                        // 166
    }                                                                                                 // 167
    if (field === '_id' && !EJSON.equals(arg, target._id))                                            // 168
      throw MinimongoError("Cannot change the _id of a document");                                    // 169
                                                                                                      // 170
    target[field] = EJSON.clone(arg);                                                                 // 171
  },                                                                                                  // 172
  $setOnInsert: function (target, field, arg) {                                                       // 173
    // converted to `$set` in `_modify`                                                               // 174
  },                                                                                                  // 175
  $unset: function (target, field, arg) {                                                             // 176
    if (target !== undefined) {                                                                       // 177
      if (target instanceof Array) {                                                                  // 178
        if (field in target)                                                                          // 179
          target[field] = null;                                                                       // 180
      } else                                                                                          // 181
        delete target[field];                                                                         // 182
    }                                                                                                 // 183
  },                                                                                                  // 184
  $push: function (target, field, arg) {                                                              // 185
    if (target[field] === undefined)                                                                  // 186
      target[field] = [];                                                                             // 187
    if (!(target[field] instanceof Array))                                                            // 188
      throw MinimongoError("Cannot apply $push modifier to non-array");                               // 189
                                                                                                      // 190
    if (!(arg && arg.$each)) {                                                                        // 191
      // Simple mode: not $each                                                                       // 192
      target[field].push(EJSON.clone(arg));                                                           // 193
      return;                                                                                         // 194
    }                                                                                                 // 195
                                                                                                      // 196
    // Fancy mode: $each (and maybe $slice and $sort)                                                 // 197
    var toPush = arg.$each;                                                                           // 198
    if (!(toPush instanceof Array))                                                                   // 199
      throw MinimongoError("$each must be an array");                                                 // 200
                                                                                                      // 201
    // Parse $slice.                                                                                  // 202
    var slice = undefined;                                                                            // 203
    if ('$slice' in arg) {                                                                            // 204
      if (typeof arg.$slice !== "number")                                                             // 205
        throw MinimongoError("$slice must be a numeric value");                                       // 206
      // XXX should check to make sure integer                                                        // 207
      if (arg.$slice > 0)                                                                             // 208
        throw MinimongoError("$slice in $push must be zero or negative");                             // 209
      slice = arg.$slice;                                                                             // 210
    }                                                                                                 // 211
                                                                                                      // 212
    // Parse $sort.                                                                                   // 213
    var sortFunction = undefined;                                                                     // 214
    if (arg.$sort) {                                                                                  // 215
      if (slice === undefined)                                                                        // 216
        throw MinimongoError("$sort requires $slice to be present");                                  // 217
      // XXX this allows us to use a $sort whose value is an array, but that's                        // 218
      // actually an extension of the Node driver, so it won't work                                   // 219
      // server-side. Could be confusing!                                                             // 220
      sortFunction = LocalCollection._compileSort(arg.$sort);                                         // 221
      for (var i = 0; i < toPush.length; i++) {                                                       // 222
        if (LocalCollection._f._type(toPush[i]) !== 3) {                                              // 223
          throw MinimongoError("$push like modifiers using $sort " +                                  // 224
                      "require all elements to be objects");                                          // 225
        }                                                                                             // 226
      }                                                                                               // 227
    }                                                                                                 // 228
                                                                                                      // 229
    // Actually push.                                                                                 // 230
    for (var j = 0; j < toPush.length; j++)                                                           // 231
      target[field].push(EJSON.clone(toPush[j]));                                                     // 232
                                                                                                      // 233
    // Actually sort.                                                                                 // 234
    if (sortFunction)                                                                                 // 235
      target[field].sort(sortFunction);                                                               // 236
                                                                                                      // 237
    // Actually slice.                                                                                // 238
    if (slice !== undefined) {                                                                        // 239
      if (slice === 0)                                                                                // 240
        target[field] = [];  // differs from Array.slice!                                             // 241
      else                                                                                            // 242
        target[field] = target[field].slice(slice);                                                   // 243
    }                                                                                                 // 244
  },                                                                                                  // 245
  $pushAll: function (target, field, arg) {                                                           // 246
    if (!(typeof arg === "object" && arg instanceof Array))                                           // 247
      throw MinimongoError("Modifier $pushAll/pullAll allowed for arrays only");                      // 248
    var x = target[field];                                                                            // 249
    if (x === undefined)                                                                              // 250
      target[field] = arg;                                                                            // 251
    else if (!(x instanceof Array))                                                                   // 252
      throw MinimongoError("Cannot apply $pushAll modifier to non-array");                            // 253
    else {                                                                                            // 254
      for (var i = 0; i < arg.length; i++)                                                            // 255
        x.push(arg[i]);                                                                               // 256
    }                                                                                                 // 257
  },                                                                                                  // 258
  $addToSet: function (target, field, arg) {                                                          // 259
    var x = target[field];                                                                            // 260
    if (x === undefined)                                                                              // 261
      target[field] = [arg];                                                                          // 262
    else if (!(x instanceof Array))                                                                   // 263
      throw MinimongoError("Cannot apply $addToSet modifier to non-array");                           // 264
    else {                                                                                            // 265
      var isEach = false;                                                                             // 266
      if (typeof arg === "object") {                                                                  // 267
        for (var k in arg) {                                                                          // 268
          if (k === "$each")                                                                          // 269
            isEach = true;                                                                            // 270
          break;                                                                                      // 271
        }                                                                                             // 272
      }                                                                                               // 273
      var values = isEach ? arg["$each"] : [arg];                                                     // 274
      _.each(values, function (value) {                                                               // 275
        for (var i = 0; i < x.length; i++)                                                            // 276
          if (LocalCollection._f._equal(value, x[i]))                                                 // 277
            return;                                                                                   // 278
        x.push(EJSON.clone(value));                                                                   // 279
      });                                                                                             // 280
    }                                                                                                 // 281
  },                                                                                                  // 282
  $pop: function (target, field, arg) {                                                               // 283
    if (target === undefined)                                                                         // 284
      return;                                                                                         // 285
    var x = target[field];                                                                            // 286
    if (x === undefined)                                                                              // 287
      return;                                                                                         // 288
    else if (!(x instanceof Array))                                                                   // 289
      throw MinimongoError("Cannot apply $pop modifier to non-array");                                // 290
    else {                                                                                            // 291
      if (typeof arg === 'number' && arg < 0)                                                         // 292
        x.splice(0, 1);                                                                               // 293
      else                                                                                            // 294
        x.pop();                                                                                      // 295
    }                                                                                                 // 296
  },                                                                                                  // 297
  $pull: function (target, field, arg) {                                                              // 298
    if (target === undefined)                                                                         // 299
      return;                                                                                         // 300
    var x = target[field];                                                                            // 301
    if (x === undefined)                                                                              // 302
      return;                                                                                         // 303
    else if (!(x instanceof Array))                                                                   // 304
      throw MinimongoError("Cannot apply $pull/pullAll modifier to non-array");                       // 305
    else {                                                                                            // 306
      var out = []                                                                                    // 307
      if (typeof arg === "object" && !(arg instanceof Array)) {                                       // 308
        // XXX would be much nicer to compile this once, rather than                                  // 309
        // for each document we modify.. but usually we're not                                        // 310
        // modifying that many documents, so we'll let it slide for                                   // 311
        // now                                                                                        // 312
                                                                                                      // 313
        // XXX _compileSelector isn't up for the job, because we need                                 // 314
        // to permit stuff like {$pull: {a: {$gt: 4}}}.. something                                    // 315
        // like {$gt: 4} is not normally a complete selector.                                         // 316
        // same issue as $elemMatch possibly?                                                         // 317
        var match = LocalCollection._compileSelector(arg);                                            // 318
        for (var i = 0; i < x.length; i++)                                                            // 319
          if (!match(x[i]))                                                                           // 320
            out.push(x[i])                                                                            // 321
      } else {                                                                                        // 322
        for (var i = 0; i < x.length; i++)                                                            // 323
          if (!LocalCollection._f._equal(x[i], arg))                                                  // 324
            out.push(x[i]);                                                                           // 325
      }                                                                                               // 326
      target[field] = out;                                                                            // 327
    }                                                                                                 // 328
  },                                                                                                  // 329
  $pullAll: function (target, field, arg) {                                                           // 330
    if (!(typeof arg === "object" && arg instanceof Array))                                           // 331
      throw MinimongoError("Modifier $pushAll/pullAll allowed for arrays only");                      // 332
    if (target === undefined)                                                                         // 333
      return;                                                                                         // 334
    var x = target[field];                                                                            // 335
    if (x === undefined)                                                                              // 336
      return;                                                                                         // 337
    else if (!(x instanceof Array))                                                                   // 338
      throw MinimongoError("Cannot apply $pull/pullAll modifier to non-array");                       // 339
    else {                                                                                            // 340
      var out = []                                                                                    // 341
      for (var i = 0; i < x.length; i++) {                                                            // 342
        var exclude = false;                                                                          // 343
        for (var j = 0; j < arg.length; j++) {                                                        // 344
          if (LocalCollection._f._equal(x[i], arg[j])) {                                              // 345
            exclude = true;                                                                           // 346
            break;                                                                                    // 347
          }                                                                                           // 348
        }                                                                                             // 349
        if (!exclude)                                                                                 // 350
          out.push(x[i]);                                                                             // 351
      }                                                                                               // 352
      target[field] = out;                                                                            // 353
    }                                                                                                 // 354
  },                                                                                                  // 355
  $rename: function (target, field, arg, keypath, doc) {                                              // 356
    if (keypath === arg)                                                                              // 357
      // no idea why mongo has this restriction..                                                     // 358
      throw MinimongoError("$rename source must differ from target");                                 // 359
    if (target === null)                                                                              // 360
      throw MinimongoError("$rename source field invalid");                                           // 361
    if (typeof arg !== "string")                                                                      // 362
      throw MinimongoError("$rename target must be a string");                                        // 363
    if (target === undefined)                                                                         // 364
      return;                                                                                         // 365
    var v = target[field];                                                                            // 366
    delete target[field];                                                                             // 367
                                                                                                      // 368
    var keyparts = arg.split('.');                                                                    // 369
    var target2 = LocalCollection._findModTarget(doc, keyparts, false, true);                         // 370
    if (target2 === null)                                                                             // 371
      throw MinimongoError("$rename target field invalid");                                           // 372
    var field2 = keyparts.pop();                                                                      // 373
    target2[field2] = v;                                                                              // 374
  },                                                                                                  // 375
  $bit: function (target, field, arg) {                                                               // 376
    // XXX mongo only supports $bit on integers, and we only support                                  // 377
    // native javascript numbers (doubles) so far, so we can't support $bit                           // 378
    throw MinimongoError("$bit is not supported");                                                    // 379
  }                                                                                                   // 380
};                                                                                                    // 381
                                                                                                      // 382
LocalCollection._removeDollarOperators = function (selector) {                                        // 383
  var selectorDoc = {};                                                                               // 384
  for (var k in selector)                                                                             // 385
    if (k.substr(0, 1) !== '$')                                                                       // 386
      selectorDoc[k] = selector[k];                                                                   // 387
  return selectorDoc;                                                                                 // 388
};                                                                                                    // 389
                                                                                                      // 390
                                                                                                      // 391
////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                    //
// packages/minimongo/diff.js                                                                         //
//                                                                                                    //
////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                      //
                                                                                                      // 1
// ordered: bool.                                                                                     // 2
// old_results and new_results: collections of documents.                                             // 3
//    if ordered, they are arrays.                                                                    // 4
//    if unordered, they are maps {_id: doc}.                                                         // 5
LocalCollection._diffQueryChanges = function (ordered, oldResults, newResults,                        // 6
                                       observer) {                                                    // 7
  if (ordered)                                                                                        // 8
    LocalCollection._diffQueryOrderedChanges(                                                         // 9
      oldResults, newResults, observer);                                                              // 10
  else                                                                                                // 11
    LocalCollection._diffQueryUnorderedChanges(                                                       // 12
      oldResults, newResults, observer);                                                              // 13
};                                                                                                    // 14
                                                                                                      // 15
LocalCollection._diffQueryUnorderedChanges = function (oldResults, newResults,                        // 16
                                                observer) {                                           // 17
  if (observer.movedBefore) {                                                                         // 18
    throw new Error("_diffQueryUnordered called with a movedBefore observer!");                       // 19
  }                                                                                                   // 20
                                                                                                      // 21
  _.each(newResults, function (newDoc) {                                                              // 22
    if (_.has(oldResults, newDoc._id)) {                                                              // 23
      var oldDoc = oldResults[newDoc._id];                                                            // 24
      if (observer.changed && !EJSON.equals(oldDoc, newDoc)) {                                        // 25
        observer.changed(newDoc._id, LocalCollection._makeChangedFields(newDoc, oldDoc));             // 26
      }                                                                                               // 27
    } else {                                                                                          // 28
      var fields = EJSON.clone(newDoc);                                                               // 29
      delete fields._id;                                                                              // 30
      observer.added && observer.added(newDoc._id, fields);                                           // 31
    }                                                                                                 // 32
  });                                                                                                 // 33
                                                                                                      // 34
  if (observer.removed) {                                                                             // 35
    _.each(oldResults, function (oldDoc) {                                                            // 36
      if (!_.has(newResults, oldDoc._id))                                                             // 37
        observer.removed(oldDoc._id);                                                                 // 38
    });                                                                                               // 39
  }                                                                                                   // 40
};                                                                                                    // 41
                                                                                                      // 42
                                                                                                      // 43
LocalCollection._diffQueryOrderedChanges = function (old_results, new_results, observer) {            // 44
                                                                                                      // 45
  var new_presence_of_id = {};                                                                        // 46
  _.each(new_results, function (doc) {                                                                // 47
    if (new_presence_of_id[doc._id])                                                                  // 48
      Meteor._debug("Duplicate _id in new_results");                                                  // 49
    new_presence_of_id[doc._id] = true;                                                               // 50
  });                                                                                                 // 51
                                                                                                      // 52
  var old_index_of_id = {};                                                                           // 53
  _.each(old_results, function (doc, i) {                                                             // 54
    if (doc._id in old_index_of_id)                                                                   // 55
      Meteor._debug("Duplicate _id in old_results");                                                  // 56
    old_index_of_id[doc._id] = i;                                                                     // 57
  });                                                                                                 // 58
                                                                                                      // 59
  // ALGORITHM:                                                                                       // 60
  //                                                                                                  // 61
  // To determine which docs should be considered "moved" (and which                                  // 62
  // merely change position because of other docs moving) we run                                      // 63
  // a "longest common subsequence" (LCS) algorithm.  The LCS of the                                  // 64
  // old doc IDs and the new doc IDs gives the docs that should NOT be                                // 65
  // considered moved.                                                                                // 66
                                                                                                      // 67
  // To actually call the appropriate callbacks to get from the old state to the                      // 68
  // new state:                                                                                       // 69
                                                                                                      // 70
  // First, we call removed() on all the items that only appear in the old                            // 71
  // state.                                                                                           // 72
                                                                                                      // 73
  // Then, once we have the items that should not move, we walk through the new                       // 74
  // results array group-by-group, where a "group" is a set of items that have                        // 75
  // moved, anchored on the end by an item that should not move.  One by one, we                      // 76
  // move each of those elements into place "before" the anchoring end-of-group                       // 77
  // item, and fire changed events on them if necessary.  Then we fire a changed                      // 78
  // event on the anchor, and move on to the next group.  There is always at                          // 79
  // least one group; the last group is anchored by a virtual "null" id at the                        // 80
  // end.                                                                                             // 81
                                                                                                      // 82
  // Asymptotically: O(N k) where k is number of ops, or potentially                                  // 83
  // O(N log N) if inner loop of LCS were made to be binary search.                                   // 84
                                                                                                      // 85
                                                                                                      // 86
  //////// LCS (longest common sequence, with respect to _id)                                         // 87
  // (see Wikipedia article on Longest Increasing Subsequence,                                        // 88
  // where the LIS is taken of the sequence of old indices of the                                     // 89
  // docs in new_results)                                                                             // 90
  //                                                                                                  // 91
  // unmoved: the output of the algorithm; members of the LCS,                                        // 92
  // in the form of indices into new_results                                                          // 93
  var unmoved = [];                                                                                   // 94
  // max_seq_len: length of LCS found so far                                                          // 95
  var max_seq_len = 0;                                                                                // 96
  // seq_ends[i]: the index into new_results of the last doc in a                                     // 97
  // common subsequence of length of i+1 <= max_seq_len                                               // 98
  var N = new_results.length;                                                                         // 99
  var seq_ends = new Array(N);                                                                        // 100
  // ptrs:  the common subsequence ending with new_results[n] extends                                 // 101
  // a common subsequence ending with new_results[ptr[n]], unless                                     // 102
  // ptr[n] is -1.                                                                                    // 103
  var ptrs = new Array(N);                                                                            // 104
  // virtual sequence of old indices of new results                                                   // 105
  var old_idx_seq = function(i_new) {                                                                 // 106
    return old_index_of_id[new_results[i_new]._id];                                                   // 107
  };                                                                                                  // 108
  // for each item in new_results, use it to extend a common subsequence                              // 109
  // of length j <= max_seq_len                                                                       // 110
  for(var i=0; i<N; i++) {                                                                            // 111
    if (old_index_of_id[new_results[i]._id] !== undefined) {                                          // 112
      var j = max_seq_len;                                                                            // 113
      // this inner loop would traditionally be a binary search,                                      // 114
      // but scanning backwards we will likely find a subseq to extend                                // 115
      // pretty soon, bounded for example by the total number of ops.                                 // 116
      // If this were to be changed to a binary search, we'd still want                               // 117
      // to scan backwards a bit as an optimization.                                                  // 118
      while (j > 0) {                                                                                 // 119
        if (old_idx_seq(seq_ends[j-1]) < old_idx_seq(i))                                              // 120
          break;                                                                                      // 121
        j--;                                                                                          // 122
      }                                                                                               // 123
                                                                                                      // 124
      ptrs[i] = (j === 0 ? -1 : seq_ends[j-1]);                                                       // 125
      seq_ends[j] = i;                                                                                // 126
      if (j+1 > max_seq_len)                                                                          // 127
        max_seq_len = j+1;                                                                            // 128
    }                                                                                                 // 129
  }                                                                                                   // 130
                                                                                                      // 131
  // pull out the LCS/LIS into unmoved                                                                // 132
  var idx = (max_seq_len === 0 ? -1 : seq_ends[max_seq_len-1]);                                       // 133
  while (idx >= 0) {                                                                                  // 134
    unmoved.push(idx);                                                                                // 135
    idx = ptrs[idx];                                                                                  // 136
  }                                                                                                   // 137
  // the unmoved item list is built backwards, so fix that                                            // 138
  unmoved.reverse();                                                                                  // 139
                                                                                                      // 140
  // the last group is always anchored by the end of the result list, which is                        // 141
  // an id of "null"                                                                                  // 142
  unmoved.push(new_results.length);                                                                   // 143
                                                                                                      // 144
  _.each(old_results, function (doc) {                                                                // 145
    if (!new_presence_of_id[doc._id])                                                                 // 146
      observer.removed && observer.removed(doc._id);                                                  // 147
  });                                                                                                 // 148
  // for each group of things in the new_results that is anchored by an unmoved                       // 149
  // element, iterate through the things before it.                                                   // 150
  var startOfGroup = 0;                                                                               // 151
  _.each(unmoved, function (endOfGroup) {                                                             // 152
    var groupId = new_results[endOfGroup] ? new_results[endOfGroup]._id : null;                       // 153
    var oldDoc;                                                                                       // 154
    var newDoc;                                                                                       // 155
    var fields;                                                                                       // 156
    for (var i = startOfGroup; i < endOfGroup; i++) {                                                 // 157
      newDoc = new_results[i];                                                                        // 158
      if (!_.has(old_index_of_id, newDoc._id)) {                                                      // 159
        fields = EJSON.clone(newDoc);                                                                 // 160
        delete fields._id;                                                                            // 161
        observer.addedBefore && observer.addedBefore(newDoc._id, fields, groupId);                    // 162
        observer.added && observer.added(newDoc._id, fields);                                         // 163
      } else {                                                                                        // 164
        // moved                                                                                      // 165
        oldDoc = old_results[old_index_of_id[newDoc._id]];                                            // 166
        fields = LocalCollection._makeChangedFields(newDoc, oldDoc);                                  // 167
        if (!_.isEmpty(fields)) {                                                                     // 168
          observer.changed && observer.changed(newDoc._id, fields);                                   // 169
        }                                                                                             // 170
        observer.movedBefore && observer.movedBefore(newDoc._id, groupId);                            // 171
      }                                                                                               // 172
    }                                                                                                 // 173
    if (groupId) {                                                                                    // 174
      newDoc = new_results[endOfGroup];                                                               // 175
      oldDoc = old_results[old_index_of_id[newDoc._id]];                                              // 176
      fields = LocalCollection._makeChangedFields(newDoc, oldDoc);                                    // 177
      if (!_.isEmpty(fields)) {                                                                       // 178
        observer.changed && observer.changed(newDoc._id, fields);                                     // 179
      }                                                                                               // 180
    }                                                                                                 // 181
    startOfGroup = endOfGroup+1;                                                                      // 182
  });                                                                                                 // 183
                                                                                                      // 184
                                                                                                      // 185
};                                                                                                    // 186
                                                                                                      // 187
                                                                                                      // 188
// General helper for diff-ing two objects.                                                           // 189
// callbacks is an object like so:                                                                    // 190
// { leftOnly: function (key, leftValue) {...},                                                       // 191
//   rightOnly: function (key, rightValue) {...},                                                     // 192
//   both: function (key, leftValue, rightValue) {...},                                               // 193
// }                                                                                                  // 194
LocalCollection._diffObjects = function (left, right, callbacks) {                                    // 195
  _.each(left, function (leftValue, key) {                                                            // 196
    if (_.has(right, key))                                                                            // 197
      callbacks.both && callbacks.both(key, leftValue, right[key]);                                   // 198
    else                                                                                              // 199
      callbacks.leftOnly && callbacks.leftOnly(key, leftValue);                                       // 200
  });                                                                                                 // 201
  if (callbacks.rightOnly) {                                                                          // 202
    _.each(right, function(rightValue, key) {                                                         // 203
      if (!_.has(left, key))                                                                          // 204
        callbacks.rightOnly(key, rightValue);                                                         // 205
    });                                                                                               // 206
  }                                                                                                   // 207
};                                                                                                    // 208
                                                                                                      // 209
////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                    //
// packages/minimongo/id_map.js                                                                       //
//                                                                                                    //
////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                      //
LocalCollection._IdMap = function () {                                                                // 1
  var self = this;                                                                                    // 2
  self._map = {};                                                                                     // 3
};                                                                                                    // 4
                                                                                                      // 5
// Some of these methods are designed to match methods on OrderedDict, since                          // 6
// (eg) ObserveMultiplex and _CachingChangeObserver use them interchangeably.                         // 7
// (Conceivably, this should be replaced with "UnorderedDict" with a specific                         // 8
// set of methods that overlap between the two.)                                                      // 9
                                                                                                      // 10
_.extend(LocalCollection._IdMap.prototype, {                                                          // 11
  get: function (id) {                                                                                // 12
    var self = this;                                                                                  // 13
    var key = LocalCollection._idStringify(id);                                                       // 14
    return self._map[key];                                                                            // 15
  },                                                                                                  // 16
  set: function (id, value) {                                                                         // 17
    var self = this;                                                                                  // 18
    var key = LocalCollection._idStringify(id);                                                       // 19
    self._map[key] = value;                                                                           // 20
  },                                                                                                  // 21
  remove: function (id) {                                                                             // 22
    var self = this;                                                                                  // 23
    var key = LocalCollection._idStringify(id);                                                       // 24
    delete self._map[key];                                                                            // 25
  },                                                                                                  // 26
  has: function (id) {                                                                                // 27
    var self = this;                                                                                  // 28
    var key = LocalCollection._idStringify(id);                                                       // 29
    return _.has(self._map, key);                                                                     // 30
  },                                                                                                  // 31
  empty: function () {                                                                                // 32
    var self = this;                                                                                  // 33
    return _.isEmpty(self._map);                                                                      // 34
  },                                                                                                  // 35
  clear: function () {                                                                                // 36
    var self = this;                                                                                  // 37
    self._map = {};                                                                                   // 38
  },                                                                                                  // 39
  forEach: function (iterator) {                                                                      // 40
    var self = this;                                                                                  // 41
    _.each(self._map, function (value, key, obj) {                                                    // 42
      var context = this;                                                                             // 43
      iterator.call(context, value, LocalCollection._idParse(key), obj);                              // 44
    });                                                                                               // 45
  },                                                                                                  // 46
  // XXX used?                                                                                        // 47
  setDefault: function (id, def) {                                                                    // 48
    var self = this;                                                                                  // 49
    var key = LocalCollection._idStringify(id);                                                       // 50
    if (_.has(self._map, key))                                                                        // 51
      return self._map[key];                                                                          // 52
    self._map[key] = def;                                                                             // 53
    return def;                                                                                       // 54
  }                                                                                                   // 55
});                                                                                                   // 56
                                                                                                      // 57
////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                    //
// packages/minimongo/observe.js                                                                      //
//                                                                                                    //
////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                      //
// XXX maybe move these into another ObserveHelpers package or something                              // 1
                                                                                                      // 2
// _CachingChangeObserver is an object which receives observeChanges callbacks                        // 3
// and keeps a cache of the current cursor state up to date in self.docs. Users                       // 4
// of this class should read the docs field but not modify it. You should pass                        // 5
// the "applyChange" field as the callbacks to the underlying observeChanges                          // 6
// call. Optionally, you can specify your own observeChanges callbacks which are                      // 7
// invoked immediately before the docs field is updated; this object is made                          // 8
// available as `this` to those callbacks.                                                            // 9
LocalCollection._CachingChangeObserver = function (options) {                                         // 10
  var self = this;                                                                                    // 11
  options = options || {};                                                                            // 12
                                                                                                      // 13
  var orderedFromCallbacks = options.callbacks &&                                                     // 14
        LocalCollection._observeChangesCallbacksAreOrdered(options.callbacks);                        // 15
  if (_.has(options, 'ordered')) {                                                                    // 16
    self.ordered = options.ordered;                                                                   // 17
    if (options.callbacks && options.ordered !== orderedFromCallbacks)                                // 18
      throw Error("ordered option doesn't match callbacks");                                          // 19
  } else if (options.callbacks) {                                                                     // 20
    self.ordered = orderedFromCallbacks;                                                              // 21
  } else {                                                                                            // 22
    throw Error("must provide ordered or callbacks");                                                 // 23
  }                                                                                                   // 24
  var callbacks = options.callbacks || {};                                                            // 25
                                                                                                      // 26
  if (self.ordered) {                                                                                 // 27
    self.docs = new OrderedDict(LocalCollection._idStringify);                                        // 28
    self.applyChange = {                                                                              // 29
      addedBefore: function (id, fields, before) {                                                    // 30
        var doc = EJSON.clone(fields);                                                                // 31
        doc._id = id;                                                                                 // 32
        callbacks.addedBefore && callbacks.addedBefore.call(                                          // 33
          self, id, fields, before);                                                                  // 34
        // This line triggers if we provide added with movedBefore.                                   // 35
        callbacks.added && callbacks.added.call(self, id, fields);                                    // 36
        // XXX could `before` be a falsy ID?  Technically                                             // 37
        // idStringify seems to allow for them -- though                                              // 38
        // OrderedDict won't call stringify on a falsy arg.                                           // 39
        self.docs.putBefore(id, doc, before || null);                                                 // 40
      },                                                                                              // 41
      movedBefore: function (id, before) {                                                            // 42
        var doc = self.docs.get(id);                                                                  // 43
        callbacks.movedBefore && callbacks.movedBefore.call(self, id, before);                        // 44
        self.docs.moveBefore(id, before || null);                                                     // 45
      }                                                                                               // 46
    };                                                                                                // 47
  } else {                                                                                            // 48
    self.docs = new LocalCollection._IdMap;                                                           // 49
    self.applyChange = {                                                                              // 50
      added: function (id, fields) {                                                                  // 51
        var doc = EJSON.clone(fields);                                                                // 52
        callbacks.added && callbacks.added.call(self, id, fields);                                    // 53
        doc._id = id;                                                                                 // 54
        self.docs.set(id,  doc);                                                                      // 55
      }                                                                                               // 56
    };                                                                                                // 57
  }                                                                                                   // 58
                                                                                                      // 59
  // The methods in _IdMap and OrderedDict used by these callbacks are                                // 60
  // identical.                                                                                       // 61
  self.applyChange.changed = function (id, fields) {                                                  // 62
    var doc = self.docs.get(id);                                                                      // 63
    if (!doc)                                                                                         // 64
      throw new Error("Unknown id for changed: " + id);                                               // 65
    callbacks.changed && callbacks.changed.call(                                                      // 66
      self, id, EJSON.clone(fields));                                                                 // 67
    LocalCollection._applyChanges(doc, fields);                                                       // 68
  };                                                                                                  // 69
  self.applyChange.removed = function (id) {                                                          // 70
    callbacks.removed && callbacks.removed.call(self, id);                                            // 71
    self.docs.remove(id);                                                                             // 72
  };                                                                                                  // 73
};                                                                                                    // 74
                                                                                                      // 75
LocalCollection._observeFromObserveChanges = function (cursor, observeCallbacks) {                    // 76
  var transform = cursor.getTransform() || function (doc) {return doc;};                              // 77
  var suppressed = !!observeCallbacks._suppress_initial;                                              // 78
                                                                                                      // 79
  var observeChangesCallbacks;                                                                        // 80
  if (LocalCollection._observeCallbacksAreOrdered(observeCallbacks)) {                                // 81
    // The "_no_indices" option sets all index arguments to -1 and skips the                          // 82
    // linear scans required to generate them.  This lets observers that don't                        // 83
    // need absolute indices benefit from the other features of this API --                           // 84
    // relative order, transforms, and applyChanges -- without the speed hit.                         // 85
    var indices = !observeCallbacks._no_indices;                                                      // 86
    observeChangesCallbacks = {                                                                       // 87
      addedBefore: function (id, fields, before) {                                                    // 88
        var self = this;                                                                              // 89
        if (suppressed || !(observeCallbacks.addedAt || observeCallbacks.added))                      // 90
          return;                                                                                     // 91
        var doc = transform(_.extend(fields, {_id: id}));                                             // 92
        if (observeCallbacks.addedAt) {                                                               // 93
          var index = indices                                                                         // 94
                ? (before ? self.docs.indexOf(before) : self.docs.size()) : -1;                       // 95
          observeCallbacks.addedAt(doc, index, before);                                               // 96
        } else {                                                                                      // 97
          observeCallbacks.added(doc);                                                                // 98
        }                                                                                             // 99
      },                                                                                              // 100
      changed: function (id, fields) {                                                                // 101
        var self = this;                                                                              // 102
        if (!(observeCallbacks.changedAt || observeCallbacks.changed))                                // 103
          return;                                                                                     // 104
        var doc = EJSON.clone(self.docs.get(id));                                                     // 105
        if (!doc)                                                                                     // 106
          throw new Error("Unknown id for changed: " + id);                                           // 107
        var oldDoc = transform(EJSON.clone(doc));                                                     // 108
        LocalCollection._applyChanges(doc, fields);                                                   // 109
        doc = transform(doc);                                                                         // 110
        if (observeCallbacks.changedAt) {                                                             // 111
          var index = indices ? self.docs.indexOf(id) : -1;                                           // 112
          observeCallbacks.changedAt(doc, oldDoc, index);                                             // 113
        } else {                                                                                      // 114
          observeCallbacks.changed(doc, oldDoc);                                                      // 115
        }                                                                                             // 116
      },                                                                                              // 117
      movedBefore: function (id, before) {                                                            // 118
        var self = this;                                                                              // 119
        if (!observeCallbacks.movedTo)                                                                // 120
          return;                                                                                     // 121
        var from = indices ? self.docs.indexOf(id) : -1;                                              // 122
                                                                                                      // 123
        var to = indices                                                                              // 124
              ? (before ? self.docs.indexOf(before) : self.docs.size()) : -1;                         // 125
        // When not moving backwards, adjust for the fact that removing the                           // 126
        // document slides everything back one slot.                                                  // 127
        if (to > from)                                                                                // 128
          --to;                                                                                       // 129
        observeCallbacks.movedTo(transform(EJSON.clone(self.docs.get(id))),                           // 130
                                 from, to, before || null);                                           // 131
      },                                                                                              // 132
      removed: function (id) {                                                                        // 133
        var self = this;                                                                              // 134
        if (!(observeCallbacks.removedAt || observeCallbacks.removed))                                // 135
          return;                                                                                     // 136
        // technically maybe there should be an EJSON.clone here, but it's about                      // 137
        // to be removed from self.docs!                                                              // 138
        var doc = transform(self.docs.get(id));                                                       // 139
        if (observeCallbacks.removedAt) {                                                             // 140
          var index = indices ? self.docs.indexOf(id) : -1;                                           // 141
          observeCallbacks.removedAt(doc, index);                                                     // 142
        } else {                                                                                      // 143
          observeCallbacks.removed(doc);                                                              // 144
        }                                                                                             // 145
      }                                                                                               // 146
    };                                                                                                // 147
  } else {                                                                                            // 148
    observeChangesCallbacks = {                                                                       // 149
      added: function (id, fields) {                                                                  // 150
        if (!suppressed && observeCallbacks.added) {                                                  // 151
          var doc = _.extend(fields, {_id:  id});                                                     // 152
          observeCallbacks.added(transform(doc));                                                     // 153
        }                                                                                             // 154
      },                                                                                              // 155
      changed: function (id, fields) {                                                                // 156
        var self = this;                                                                              // 157
        if (observeCallbacks.changed) {                                                               // 158
          var oldDoc = self.docs.get(id);                                                             // 159
          var doc = EJSON.clone(oldDoc);                                                              // 160
          LocalCollection._applyChanges(doc, fields);                                                 // 161
          observeCallbacks.changed(transform(doc), transform(oldDoc));                                // 162
        }                                                                                             // 163
      },                                                                                              // 164
      removed: function (id) {                                                                        // 165
        var self = this;                                                                              // 166
        if (observeCallbacks.removed) {                                                               // 167
          observeCallbacks.removed(transform(self.docs.get(id)));                                     // 168
        }                                                                                             // 169
      }                                                                                               // 170
    };                                                                                                // 171
  }                                                                                                   // 172
                                                                                                      // 173
  var changeObserver = new LocalCollection._CachingChangeObserver(                                    // 174
    {callbacks: observeChangesCallbacks});                                                            // 175
  var handle = cursor.observeChanges(changeObserver.applyChange);                                     // 176
  suppressed = false;                                                                                 // 177
  return handle;                                                                                      // 178
};                                                                                                    // 179
                                                                                                      // 180
////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                    //
// packages/minimongo/objectid.js                                                                     //
//                                                                                                    //
////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                      //
LocalCollection._looksLikeObjectID = function (str) {                                                 // 1
  return str.length === 24 && str.match(/^[0-9a-f]*$/);                                               // 2
};                                                                                                    // 3
                                                                                                      // 4
LocalCollection._ObjectID = function (hexString) {                                                    // 5
  //random-based impl of Mongo ObjectID                                                               // 6
  var self = this;                                                                                    // 7
  if (hexString) {                                                                                    // 8
    hexString = hexString.toLowerCase();                                                              // 9
    if (!LocalCollection._looksLikeObjectID(hexString)) {                                             // 10
      throw new Error("Invalid hexadecimal string for creating an ObjectID");                         // 11
    }                                                                                                 // 12
    // meant to work with _.isEqual(), which relies on structural equality                            // 13
    self._str = hexString;                                                                            // 14
  } else {                                                                                            // 15
    self._str = Random.hexString(24);                                                                 // 16
  }                                                                                                   // 17
};                                                                                                    // 18
                                                                                                      // 19
LocalCollection._ObjectID.prototype.toString = function () {                                          // 20
  var self = this;                                                                                    // 21
  return "ObjectID(\"" + self._str + "\")";                                                           // 22
};                                                                                                    // 23
                                                                                                      // 24
LocalCollection._ObjectID.prototype.equals = function (other) {                                       // 25
  var self = this;                                                                                    // 26
  return other instanceof LocalCollection._ObjectID &&                                                // 27
    self.valueOf() === other.valueOf();                                                               // 28
};                                                                                                    // 29
                                                                                                      // 30
LocalCollection._ObjectID.prototype.clone = function () {                                             // 31
  var self = this;                                                                                    // 32
  return new LocalCollection._ObjectID(self._str);                                                    // 33
};                                                                                                    // 34
                                                                                                      // 35
LocalCollection._ObjectID.prototype.typeName = function() {                                           // 36
  return "oid";                                                                                       // 37
};                                                                                                    // 38
                                                                                                      // 39
LocalCollection._ObjectID.prototype.getTimestamp = function() {                                       // 40
  var self = this;                                                                                    // 41
  return parseInt(self._str.substr(0, 8), 16);                                                        // 42
};                                                                                                    // 43
                                                                                                      // 44
LocalCollection._ObjectID.prototype.valueOf =                                                         // 45
    LocalCollection._ObjectID.prototype.toJSONValue =                                                 // 46
    LocalCollection._ObjectID.prototype.toHexString =                                                 // 47
    function () { return this._str; };                                                                // 48
                                                                                                      // 49
// Is this selector just shorthand for lookup by _id?                                                 // 50
LocalCollection._selectorIsId = function (selector) {                                                 // 51
  return (typeof selector === "string") ||                                                            // 52
    (typeof selector === "number") ||                                                                 // 53
    selector instanceof LocalCollection._ObjectID;                                                    // 54
};                                                                                                    // 55
                                                                                                      // 56
// Is the selector just lookup by _id (shorthand or not)?                                             // 57
LocalCollection._selectorIsIdPerhapsAsObject = function (selector) {                                  // 58
  return LocalCollection._selectorIsId(selector) ||                                                   // 59
    (selector && typeof selector === "object" &&                                                      // 60
     selector._id && LocalCollection._selectorIsId(selector._id) &&                                   // 61
     _.size(selector) === 1);                                                                         // 62
};                                                                                                    // 63
                                                                                                      // 64
// If this is a selector which explicitly constrains the match by ID to a finite                      // 65
// number of documents, returns a list of their IDs.  Otherwise returns                               // 66
// null. Note that the selector may have other restrictions so it may not even                        // 67
// match those document!  We care about $in and $and since those are generated                        // 68
// access-controlled update and remove.                                                               // 69
LocalCollection._idsMatchedBySelector = function (selector) {                                         // 70
  // Is the selector just an ID?                                                                      // 71
  if (LocalCollection._selectorIsId(selector))                                                        // 72
    return [selector];                                                                                // 73
  if (!selector)                                                                                      // 74
    return null;                                                                                      // 75
                                                                                                      // 76
  // Do we have an _id clause?                                                                        // 77
  if (_.has(selector, '_id')) {                                                                       // 78
    // Is the _id clause just an ID?                                                                  // 79
    if (LocalCollection._selectorIsId(selector._id))                                                  // 80
      return [selector._id];                                                                          // 81
    // Is the _id clause {_id: {$in: ["x", "y", "z"]}}?                                               // 82
    if (selector._id && selector._id.$in                                                              // 83
        && _.isArray(selector._id.$in)                                                                // 84
        && !_.isEmpty(selector._id.$in)                                                               // 85
        && _.all(selector._id.$in, LocalCollection._selectorIsId)) {                                  // 86
      return selector._id.$in;                                                                        // 87
    }                                                                                                 // 88
    return null;                                                                                      // 89
  }                                                                                                   // 90
                                                                                                      // 91
  // If this is a top-level $and, and any of the clauses constrain their                              // 92
  // documents, then the whole selector is constrained by any one clause's                            // 93
  // constraint. (Well, by their intersection, but that seems unlikely.)                              // 94
  if (selector.$and && _.isArray(selector.$and)) {                                                    // 95
    for (var i = 0; i < selector.$and.length; ++i) {                                                  // 96
      var subIds = LocalCollection._idsMatchedBySelector(selector.$and[i]);                           // 97
      if (subIds)                                                                                     // 98
        return subIds;                                                                                // 99
    }                                                                                                 // 100
  }                                                                                                   // 101
                                                                                                      // 102
  return null;                                                                                        // 103
};                                                                                                    // 104
                                                                                                      // 105
EJSON.addType("oid",  function (str) {                                                                // 106
  return new LocalCollection._ObjectID(str);                                                          // 107
});                                                                                                   // 108
                                                                                                      // 109
////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                    //
// packages/minimongo/selector_projection.js                                                          //
//                                                                                                    //
////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                      //
// Knows how to combine a mongo selector and a fields projection to a new fields                      // 1
// projection taking into account active fields from the passed selector.                             // 2
// @returns Object - projection object (same as fields option of mongo cursor)                        // 3
LocalCollection._combineSelectorAndProjection = function (selector, projection)                       // 4
{                                                                                                     // 5
  var selectorPaths = getPathsWithoutNumericKeys(selector);                                           // 6
                                                                                                      // 7
  // Special case for $where operator in the selector - projection should depend                      // 8
  // on all fields of the document. getSelectorPaths returns a list of paths                          // 9
  // selector depends on. If one of the paths is '' (empty string) representing                       // 10
  // the root or the whole document, complete projection should be returned.                          // 11
  if (_.contains(selectorPaths, ''))                                                                  // 12
    return {};                                                                                        // 13
                                                                                                      // 14
  var prjDetails = projectionDetails(projection);                                                     // 15
  var tree = prjDetails.tree;                                                                         // 16
  var mergedProjection = {};                                                                          // 17
                                                                                                      // 18
  // merge the paths to include                                                                       // 19
  tree = pathsToTree(selectorPaths,                                                                   // 20
                     function (path) { return true; },                                                // 21
                     function (node, path, fullPath) { return true; },                                // 22
                     tree);                                                                           // 23
  mergedProjection = treeToPaths(tree);                                                               // 24
  if (prjDetails.including) {                                                                         // 25
    // both selector and projection are pointing on fields to include                                 // 26
    // so we can just return the merged tree                                                          // 27
    return mergedProjection;                                                                          // 28
  } else {                                                                                            // 29
    // selector is pointing at fields to include                                                      // 30
    // projection is pointing at fields to exclude                                                    // 31
    // make sure we don't exclude important paths                                                     // 32
    var mergedExclProjection = {};                                                                    // 33
    _.each(mergedProjection, function (incl, path) {                                                  // 34
      if (!incl)                                                                                      // 35
        mergedExclProjection[path] = false;                                                           // 36
    });                                                                                               // 37
                                                                                                      // 38
    return mergedExclProjection;                                                                      // 39
  }                                                                                                   // 40
};                                                                                                    // 41
                                                                                                      // 42
// Returns a set of key paths similar to                                                              // 43
// { 'foo.bar': 1, 'a.b.c': 1 }                                                                       // 44
var treeToPaths = function (tree, prefix) {                                                           // 45
  prefix = prefix || '';                                                                              // 46
  var result = {};                                                                                    // 47
                                                                                                      // 48
  _.each(tree, function (val, key) {                                                                  // 49
    if (_.isObject(val))                                                                              // 50
      _.extend(result, treeToPaths(val, prefix + key + '.'));                                         // 51
    else                                                                                              // 52
      result[prefix + key] = val;                                                                     // 53
  });                                                                                                 // 54
                                                                                                      // 55
  return result;                                                                                      // 56
};                                                                                                    // 57
                                                                                                      // 58
                                                                                                      // 59
////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                    //
// packages/minimongo/selector_modifier.js                                                            //
//                                                                                                    //
////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                      //
// Returns true if the modifier applied to some document may change the result                        // 1
// of matching the document by selector                                                               // 2
// The modifier is always in a form of Object:                                                        // 3
//  - $set                                                                                            // 4
//    - 'a.b.22.z': value                                                                             // 5
//    - 'foo.bar': 42                                                                                 // 6
//  - $unset                                                                                          // 7
//    - 'abc.d': 1                                                                                    // 8
LocalCollection._isSelectorAffectedByModifier = function (selector, modifier) {                       // 9
  // safe check for $set/$unset being objects                                                         // 10
  modifier = _.extend({ $set: {}, $unset: {} }, modifier);                                            // 11
  var modifiedPaths = _.keys(modifier.$set).concat(_.keys(modifier.$unset));                          // 12
  var meaningfulPaths = getPaths(selector);                                                           // 13
                                                                                                      // 14
  return _.any(modifiedPaths, function (path) {                                                       // 15
    var mod = path.split('.');                                                                        // 16
    return _.any(meaningfulPaths, function (meaningfulPath) {                                         // 17
      var sel = meaningfulPath.split('.');                                                            // 18
      var i = 0, j = 0;                                                                               // 19
                                                                                                      // 20
      while (i < sel.length && j < mod.length) {                                                      // 21
        if (numericKey(sel[i]) && numericKey(mod[j])) {                                               // 22
          // foo.4.bar selector affected by foo.4 modifier                                            // 23
          // foo.3.bar selector unaffected by foo.4 modifier                                          // 24
          if (sel[i] === mod[j])                                                                      // 25
            i++, j++;                                                                                 // 26
          else                                                                                        // 27
            return false;                                                                             // 28
        } else if (numericKey(sel[i])) {                                                              // 29
          // foo.4.bar selector unaffected by foo.bar modifier                                        // 30
          return false;                                                                               // 31
        } else if (numericKey(mod[j])) {                                                              // 32
          j++;                                                                                        // 33
        } else if (sel[i] === mod[j])                                                                 // 34
          i++, j++;                                                                                   // 35
        else                                                                                          // 36
          return false;                                                                               // 37
      }                                                                                               // 38
                                                                                                      // 39
      // One is a prefix of another, taking numeric fields into account                               // 40
      return true;                                                                                    // 41
    });                                                                                               // 42
  });                                                                                                 // 43
};                                                                                                    // 44
                                                                                                      // 45
getPathsWithoutNumericKeys = function (sel) {                                                         // 46
  return _.map(getPaths(sel), function (path) {                                                       // 47
    return _.reject(path.split('.'), numericKey).join('.');                                           // 48
  });                                                                                                 // 49
};                                                                                                    // 50
                                                                                                      // 51
// @param selector - Object: MongoDB selector. Currently doesn't support                              // 52
//                           $-operators and arrays well.                                             // 53
// @param modifier - Object: MongoDB-styled modifier with `$set`s and `$unsets`                       // 54
//                           only. (assumed to come from oplog)                                       // 55
// @returns - Boolean: if after applying the modifier, selector can start                             // 56
//                     accepting the modified value.                                                  // 57
LocalCollection._canSelectorBecomeTrueByModifier = function (selector, modifier)                      // 58
{                                                                                                     // 59
  if (!LocalCollection._isSelectorAffectedByModifier(selector, modifier))                             // 60
    return false;                                                                                     // 61
                                                                                                      // 62
  modifier = _.extend({$set:{}, $unset:{}}, modifier);                                                // 63
                                                                                                      // 64
  if (_.any(_.keys(selector), pathHasNumericKeys) ||                                                  // 65
      _.any(_.keys(modifier.$unset), pathHasNumericKeys) ||                                           // 66
      _.any(_.keys(modifier.$set), pathHasNumericKeys))                                               // 67
    return true;                                                                                      // 68
                                                                                                      // 69
  if (!isLiteralSelector(selector))                                                                   // 70
    return true;                                                                                      // 71
                                                                                                      // 72
  // convert a selector into an object matching the selector                                          // 73
  // { 'a.b': { ans: 42 }, 'foo.bar': null, 'foo.baz': "something" }                                  // 74
  // => { a: { b: { ans: 42 } }, foo: { bar: null, baz: "something" } }                               // 75
  var doc = pathsToTree(_.keys(selector),                                                             // 76
                        function (path) { return selector[path]; },                                   // 77
                        _.identity /*conflict resolution is no resolution*/);                         // 78
                                                                                                      // 79
  var selectorFn = LocalCollection._compileSelector(selector);                                        // 80
                                                                                                      // 81
  try {                                                                                               // 82
    LocalCollection._modify(doc, modifier);                                                           // 83
  } catch (e) {                                                                                       // 84
    // Couldn't set a property on a field which is a scalar or null in the                            // 85
    // selector.                                                                                      // 86
    // Example:                                                                                       // 87
    // real document: { 'a.b': 3 }                                                                    // 88
    // selector: { 'a': 12 }                                                                          // 89
    // converted selector (ideal document): { 'a': 12 }                                               // 90
    // modifier: { $set: { 'a.b': 4 } }                                                               // 91
    // We don't know what real document was like but from the error raised by                         // 92
    // $set on a scalar field we can reason that the structure of real document                       // 93
    // is completely different.                                                                       // 94
    if (e.name === "MinimongoError" && e.setPropertyError)                                            // 95
      return false;                                                                                   // 96
    throw e;                                                                                          // 97
  }                                                                                                   // 98
                                                                                                      // 99
  return selectorFn(doc);                                                                             // 100
};                                                                                                    // 101
                                                                                                      // 102
// Returns a list of key paths the given selector is looking for                                      // 103
var getPaths = MinimongoTest.getSelectorPaths = function (sel) {                                      // 104
  return _.chain(sel).map(function (v, k) {                                                           // 105
    // we don't know how to handle $where because it can be anything                                  // 106
    if (k === "$where")                                                                               // 107
      return ''; // matches everything                                                                // 108
    // we branch from $or/$and/$nor operator                                                          // 109
    if (_.contains(['$or', '$and', '$nor'], k))                                                       // 110
      return _.map(v, getPaths);                                                                      // 111
    // the value is a literal or some comparison operator                                             // 112
    return k;                                                                                         // 113
  }).flatten().uniq().value();                                                                        // 114
};                                                                                                    // 115
                                                                                                      // 116
function pathHasNumericKeys (path) {                                                                  // 117
  return _.any(path.split('.'), numericKey);                                                          // 118
}                                                                                                     // 119
                                                                                                      // 120
// string can be converted to integer                                                                 // 121
function numericKey (s) {                                                                             // 122
  return /^[0-9]+$/.test(s);                                                                          // 123
}                                                                                                     // 124
                                                                                                      // 125
function isLiteralSelector (selector) {                                                               // 126
  return _.all(selector, function (subSelector, keyPath) {                                            // 127
    if (keyPath.substr(0, 1) === "$" || _.isRegExp(subSelector))                                      // 128
      return false;                                                                                   // 129
    if (!_.isObject(subSelector) || _.isArray(subSelector))                                           // 130
      return true;                                                                                    // 131
    return _.all(subSelector, function (value, key) {                                                 // 132
      return key.substr(0, 1) !== "$";                                                                // 133
    });                                                                                               // 134
  });                                                                                                 // 135
}                                                                                                     // 136
                                                                                                      // 137
                                                                                                      // 138
////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);


/* Exports */
if (typeof Package === 'undefined') Package = {};
Package.minimongo = {
  LocalCollection: LocalCollection,
  MinimongoTest: MinimongoTest
};

})();
