(function () {

/* Imports */
var Meteor = Package.meteor.Meteor;
var Random = Package.random.Random;
var EJSON = Package.ejson.EJSON;
var _ = Package.underscore._;
var LocalCollection = Package.minimongo.LocalCollection;
var Log = Package.logging.Log;
var DDP = Package.livedata.DDP;
var DDPServer = Package.livedata.DDPServer;
var Deps = Package.deps.Deps;
var AppConfig = Package['application-configuration'].AppConfig;
var check = Package.check.check;
var Match = Package.check.Match;

/* Package-scope variables */
var MongoInternals, MongoTest, MongoConnection, CursorDescription, Cursor, listenAll, forEachTrigger, idForOp, OplogHandle, ObserveMultiplexer, ObserveHandle, DocFetcher, PollingObserveDriver, OplogObserveDriver, LocalCollectionDriver;

(function () {

/////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                     //
// packages/mongo-livedata/mongo_driver.js                                                             //
//                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                       //
/**                                                                                                    // 1
 * Provide a synchronous Collection API using fibers, backed by                                        // 2
 * MongoDB.  This is only for use on the server, and mostly identical                                  // 3
 * to the client API.                                                                                  // 4
 *                                                                                                     // 5
 * NOTE: the public API methods must be run within a fiber. If you call                                // 6
 * these outside of a fiber they will explode!                                                         // 7
 */                                                                                                    // 8
                                                                                                       // 9
var path = Npm.require('path');                                                                        // 10
var MongoDB = Npm.require('mongodb');                                                                  // 11
var Fiber = Npm.require('fibers');                                                                     // 12
var Future = Npm.require(path.join('fibers', 'future'));                                               // 13
                                                                                                       // 14
MongoInternals = {};                                                                                   // 15
MongoTest = {};                                                                                        // 16
                                                                                                       // 17
var replaceNames = function (filter, thing) {                                                          // 18
  if (typeof thing === "object") {                                                                     // 19
    if (_.isArray(thing)) {                                                                            // 20
      return _.map(thing, _.bind(replaceNames, null, filter));                                         // 21
    }                                                                                                  // 22
    var ret = {};                                                                                      // 23
    _.each(thing, function (value, key) {                                                              // 24
      ret[filter(key)] = replaceNames(filter, value);                                                  // 25
    });                                                                                                // 26
    return ret;                                                                                        // 27
  }                                                                                                    // 28
  return thing;                                                                                        // 29
};                                                                                                     // 30
                                                                                                       // 31
// Ensure that EJSON.clone keeps a Timestamp as a Timestamp (instead of just                           // 32
// doing a structural clone).                                                                          // 33
// XXX how ok is this? what if there are multiple copies of MongoDB loaded?                            // 34
MongoDB.Timestamp.prototype.clone = function () {                                                      // 35
  // Timestamps should be immutable.                                                                   // 36
  return this;                                                                                         // 37
};                                                                                                     // 38
                                                                                                       // 39
var makeMongoLegal = function (name) { return "EJSON" + name; };                                       // 40
var unmakeMongoLegal = function (name) { return name.substr(5); };                                     // 41
                                                                                                       // 42
var replaceMongoAtomWithMeteor = function (document) {                                                 // 43
  if (document instanceof MongoDB.Binary) {                                                            // 44
    var buffer = document.value(true);                                                                 // 45
    return new Uint8Array(buffer);                                                                     // 46
  }                                                                                                    // 47
  if (document instanceof MongoDB.ObjectID) {                                                          // 48
    return new Meteor.Collection.ObjectID(document.toHexString());                                     // 49
  }                                                                                                    // 50
  if (document["EJSON$type"] && document["EJSON$value"]) {                                             // 51
    return EJSON.fromJSONValue(replaceNames(unmakeMongoLegal, document));                              // 52
  }                                                                                                    // 53
  if (document instanceof MongoDB.Timestamp) {                                                         // 54
    // For now, the Meteor representation of a Mongo timestamp type (not a date!                       // 55
    // this is a weird internal thing used in the oplog!) is the same as the                           // 56
    // Mongo representation. We need to do this explicitly or else we would do a                       // 57
    // structural clone and lose the prototype.                                                        // 58
    return document;                                                                                   // 59
  }                                                                                                    // 60
  return undefined;                                                                                    // 61
};                                                                                                     // 62
                                                                                                       // 63
var replaceMeteorAtomWithMongo = function (document) {                                                 // 64
  if (EJSON.isBinary(document)) {                                                                      // 65
    // This does more copies than we'd like, but is necessary because                                  // 66
    // MongoDB.BSON only looks like it takes a Uint8Array (and doesn't actually                        // 67
    // serialize it correctly).                                                                        // 68
    return new MongoDB.Binary(new Buffer(document));                                                   // 69
  }                                                                                                    // 70
  if (document instanceof Meteor.Collection.ObjectID) {                                                // 71
    return new MongoDB.ObjectID(document.toHexString());                                               // 72
  }                                                                                                    // 73
  if (document instanceof MongoDB.Timestamp) {                                                         // 74
    // For now, the Meteor representation of a Mongo timestamp type (not a date!                       // 75
    // this is a weird internal thing used in the oplog!) is the same as the                           // 76
    // Mongo representation. We need to do this explicitly or else we would do a                       // 77
    // structural clone and lose the prototype.                                                        // 78
    return document;                                                                                   // 79
  }                                                                                                    // 80
  if (EJSON._isCustomType(document)) {                                                                 // 81
    return replaceNames(makeMongoLegal, EJSON.toJSONValue(document));                                  // 82
  }                                                                                                    // 83
  // It is not ordinarily possible to stick dollar-sign keys into mongo                                // 84
  // so we don't bother checking for things that need escaping at this time.                           // 85
  return undefined;                                                                                    // 86
};                                                                                                     // 87
                                                                                                       // 88
var replaceTypes = function (document, atomTransformer) {                                              // 89
  if (typeof document !== 'object' || document === null)                                               // 90
    return document;                                                                                   // 91
                                                                                                       // 92
  var replacedTopLevelAtom = atomTransformer(document);                                                // 93
  if (replacedTopLevelAtom !== undefined)                                                              // 94
    return replacedTopLevelAtom;                                                                       // 95
                                                                                                       // 96
  var ret = document;                                                                                  // 97
  _.each(document, function (val, key) {                                                               // 98
    var valReplaced = replaceTypes(val, atomTransformer);                                              // 99
    if (val !== valReplaced) {                                                                         // 100
      // Lazy clone. Shallow copy.                                                                     // 101
      if (ret === document)                                                                            // 102
        ret = _.clone(document);                                                                       // 103
      ret[key] = valReplaced;                                                                          // 104
    }                                                                                                  // 105
  });                                                                                                  // 106
  return ret;                                                                                          // 107
};                                                                                                     // 108
                                                                                                       // 109
                                                                                                       // 110
MongoConnection = function (url, options) {                                                            // 111
  var self = this;                                                                                     // 112
  options = options || {};                                                                             // 113
  self._connectCallbacks = [];                                                                         // 114
  self._observeMultiplexers = {};                                                                      // 115
                                                                                                       // 116
  var mongoOptions = {db: {safe: true}, server: {}, replSet: {}};                                      // 117
                                                                                                       // 118
  // Set autoReconnect to true, unless passed on the URL. Why someone                                  // 119
  // would want to set autoReconnect to false, I'm not really sure, but                                // 120
  // keeping this for backwards compatibility for now.                                                 // 121
  if (!(/[\?&]auto_?[rR]econnect=/.test(url))) {                                                       // 122
    mongoOptions.server.auto_reconnect = true;                                                         // 123
  }                                                                                                    // 124
                                                                                                       // 125
  // Disable the native parser by default, unless specifically enabled                                 // 126
  // in the mongo URL.                                                                                 // 127
  // - The native driver can cause errors which normally would be                                      // 128
  //   thrown, caught, and handled into segfaults that take down the                                   // 129
  //   whole app.                                                                                      // 130
  // - Binary modules don't yet work when you bundle and move the bundle                               // 131
  //   to a different platform (aka deploy)                                                            // 132
  // We should revisit this after binary npm module support lands.                                     // 133
  if (!(/[\?&]native_?[pP]arser=/.test(url))) {                                                        // 134
    mongoOptions.db.native_parser = false;                                                             // 135
  }                                                                                                    // 136
                                                                                                       // 137
  // XXX maybe we should have a better way of allowing users to configure the                          // 138
  // underlying Mongo driver                                                                           // 139
  if (_.has(options, 'poolSize')) {                                                                    // 140
    // If we just set this for "server", replSet will override it. If we just                          // 141
    // set it for replSet, it will be ignored if we're not using a replSet.                            // 142
    mongoOptions.server.poolSize = options.poolSize;                                                   // 143
    mongoOptions.replSet.poolSize = options.poolSize;                                                  // 144
  }                                                                                                    // 145
                                                                                                       // 146
  MongoDB.connect(url, mongoOptions, function(err, db) {                                               // 147
    if (err)                                                                                           // 148
      throw err;                                                                                       // 149
    self.db = db;                                                                                      // 150
                                                                                                       // 151
    Fiber(function () {                                                                                // 152
      // drain queue of pending callbacks                                                              // 153
      _.each(self._connectCallbacks, function (c) {                                                    // 154
        c(db);                                                                                         // 155
      });                                                                                              // 156
    }).run();                                                                                          // 157
  });                                                                                                  // 158
                                                                                                       // 159
  self._docFetcher = new DocFetcher(self);                                                             // 160
  self._oplogHandle = null;                                                                            // 161
                                                                                                       // 162
  if (options.oplogUrl && !Package['disable-oplog']) {                                                 // 163
    var dbNameFuture = new Future;                                                                     // 164
    self._withDb(function (db) {                                                                       // 165
      dbNameFuture.return(db.databaseName);                                                            // 166
    });                                                                                                // 167
    self._oplogHandle = new OplogHandle(options.oplogUrl, dbNameFuture);                               // 168
  }                                                                                                    // 169
};                                                                                                     // 170
                                                                                                       // 171
MongoConnection.prototype.close = function() {                                                         // 172
  var self = this;                                                                                     // 173
                                                                                                       // 174
  // XXX probably untested                                                                             // 175
  var oplogHandle = self._oplogHandle;                                                                 // 176
  self._oplogHandle = null;                                                                            // 177
  if (oplogHandle)                                                                                     // 178
    oplogHandle.stop();                                                                                // 179
                                                                                                       // 180
  // Use Future.wrap so that errors get thrown. This happens to                                        // 181
  // work even outside a fiber since the 'close' method is not                                         // 182
  // actually asynchronous.                                                                            // 183
  Future.wrap(_.bind(self.db.close, self.db))(true).wait();                                            // 184
};                                                                                                     // 185
                                                                                                       // 186
MongoConnection.prototype._withDb = function (callback) {                                              // 187
  var self = this;                                                                                     // 188
  if (self.db) {                                                                                       // 189
    callback(self.db);                                                                                 // 190
  } else {                                                                                             // 191
    self._connectCallbacks.push(callback);                                                             // 192
  }                                                                                                    // 193
};                                                                                                     // 194
                                                                                                       // 195
// Returns the Mongo Collection object; may yield.                                                     // 196
MongoConnection.prototype._getCollection = function (collectionName) {                                 // 197
  var self = this;                                                                                     // 198
                                                                                                       // 199
  var future = new Future;                                                                             // 200
  self._withDb(function (db) {                                                                         // 201
    db.collection(collectionName, future.resolver());                                                  // 202
  });                                                                                                  // 203
  return future.wait();                                                                                // 204
};                                                                                                     // 205
                                                                                                       // 206
MongoConnection.prototype._createCappedCollection = function (collectionName,                          // 207
                                                              byteSize) {                              // 208
  var self = this;                                                                                     // 209
  var future = new Future();                                                                           // 210
  self._withDb(function (db) {                                                                         // 211
    db.createCollection(collectionName, {capped: true, size: byteSize},                                // 212
                        future.resolver());                                                            // 213
  });                                                                                                  // 214
  future.wait();                                                                                       // 215
};                                                                                                     // 216
                                                                                                       // 217
// This should be called synchronously with a write, to create a                                       // 218
// transaction on the current write fence, if any. After we can read                                   // 219
// the write, and after observers have been notified (or at least,                                     // 220
// after the observer notifiers have added themselves to the write                                     // 221
// fence), you should call 'committed()' on the object returned.                                       // 222
MongoConnection.prototype._maybeBeginWrite = function () {                                             // 223
  var self = this;                                                                                     // 224
  var fence = DDPServer._CurrentWriteFence.get();                                                      // 225
  if (fence)                                                                                           // 226
    return fence.beginWrite();                                                                         // 227
  else                                                                                                 // 228
    return {committed: function () {}};                                                                // 229
};                                                                                                     // 230
                                                                                                       // 231
                                                                                                       // 232
//////////// Public API //////////                                                                     // 233
                                                                                                       // 234
// The write methods block until the database has confirmed the write (it may                          // 235
// not be replicated or stable on disk, but one server has confirmed it) if no                         // 236
// callback is provided. If a callback is provided, then they call the callback                        // 237
// when the write is confirmed. They return nothing on success, and raise an                           // 238
// exception on failure.                                                                               // 239
//                                                                                                     // 240
// After making a write (with insert, update, remove), observers are                                   // 241
// notified asynchronously. If you want to receive a callback once all                                 // 242
// of the observer notifications have landed for your write, do the                                    // 243
// writes inside a write fence (set DDPServer._CurrentWriteFence to a new                              // 244
// _WriteFence, and then set a callback on the write fence.)                                           // 245
//                                                                                                     // 246
// Since our execution environment is single-threaded, this is                                         // 247
// well-defined -- a write "has been made" if it's returned, and an                                    // 248
// observer "has been notified" if its callback has returned.                                          // 249
                                                                                                       // 250
var writeCallback = function (write, refresh, callback) {                                              // 251
  return function (err, result) {                                                                      // 252
    if (! err) {                                                                                       // 253
      // XXX We don't have to run this on error, right?                                                // 254
      refresh();                                                                                       // 255
    }                                                                                                  // 256
    write.committed();                                                                                 // 257
    if (callback)                                                                                      // 258
      callback(err, result);                                                                           // 259
    else if (err)                                                                                      // 260
      throw err;                                                                                       // 261
  };                                                                                                   // 262
};                                                                                                     // 263
                                                                                                       // 264
var bindEnvironmentForWrite = function (callback) {                                                    // 265
  return Meteor.bindEnvironment(callback, "Mongo write");                                              // 266
};                                                                                                     // 267
                                                                                                       // 268
MongoConnection.prototype._insert = function (collection_name, document,                               // 269
                                              callback) {                                              // 270
  var self = this;                                                                                     // 271
  if (collection_name === "___meteor_failure_test_collection") {                                       // 272
    var e = new Error("Failure test");                                                                 // 273
    e.expected = true;                                                                                 // 274
    if (callback)                                                                                      // 275
      return callback(e);                                                                              // 276
    else                                                                                               // 277
      throw e;                                                                                         // 278
  }                                                                                                    // 279
                                                                                                       // 280
  var write = self._maybeBeginWrite();                                                                 // 281
  var refresh = function () {                                                                          // 282
    Meteor.refresh({collection: collection_name, id: document._id });                                  // 283
  };                                                                                                   // 284
  callback = bindEnvironmentForWrite(writeCallback(write, refresh, callback));                         // 285
  try {                                                                                                // 286
    var collection = self._getCollection(collection_name);                                             // 287
    collection.insert(replaceTypes(document, replaceMeteorAtomWithMongo),                              // 288
                      {safe: true}, callback);                                                         // 289
  } catch (e) {                                                                                        // 290
    write.committed();                                                                                 // 291
    throw e;                                                                                           // 292
  }                                                                                                    // 293
};                                                                                                     // 294
                                                                                                       // 295
// Cause queries that may be affected by the selector to poll in this write                            // 296
// fence.                                                                                              // 297
MongoConnection.prototype._refresh = function (collectionName, selector) {                             // 298
  var self = this;                                                                                     // 299
  var refreshKey = {collection: collectionName};                                                       // 300
  // If we know which documents we're removing, don't poll queries that are                            // 301
  // specific to other documents. (Note that multiple notifications here should                        // 302
  // not cause multiple polls, since all our listener is doing is enqueueing a                         // 303
  // poll.)                                                                                            // 304
  var specificIds = LocalCollection._idsMatchedBySelector(selector);                                   // 305
  if (specificIds) {                                                                                   // 306
    _.each(specificIds, function (id) {                                                                // 307
      Meteor.refresh(_.extend({id: id}, refreshKey));                                                  // 308
    });                                                                                                // 309
  } else {                                                                                             // 310
    Meteor.refresh(refreshKey);                                                                        // 311
  }                                                                                                    // 312
};                                                                                                     // 313
                                                                                                       // 314
MongoConnection.prototype._remove = function (collection_name, selector,                               // 315
                                              callback) {                                              // 316
  var self = this;                                                                                     // 317
                                                                                                       // 318
  if (collection_name === "___meteor_failure_test_collection") {                                       // 319
    var e = new Error("Failure test");                                                                 // 320
    e.expected = true;                                                                                 // 321
    if (callback)                                                                                      // 322
      return callback(e);                                                                              // 323
    else                                                                                               // 324
      throw e;                                                                                         // 325
  }                                                                                                    // 326
                                                                                                       // 327
  var write = self._maybeBeginWrite();                                                                 // 328
  var refresh = function () {                                                                          // 329
    self._refresh(collection_name, selector);                                                          // 330
  };                                                                                                   // 331
  callback = bindEnvironmentForWrite(writeCallback(write, refresh, callback));                         // 332
                                                                                                       // 333
  try {                                                                                                // 334
    var collection = self._getCollection(collection_name);                                             // 335
    collection.remove(replaceTypes(selector, replaceMeteorAtomWithMongo),                              // 336
                      {safe: true}, callback);                                                         // 337
  } catch (e) {                                                                                        // 338
    write.committed();                                                                                 // 339
    throw e;                                                                                           // 340
  }                                                                                                    // 341
};                                                                                                     // 342
                                                                                                       // 343
MongoConnection.prototype._dropCollection = function (collectionName, cb) {                            // 344
  var self = this;                                                                                     // 345
                                                                                                       // 346
  var write = self._maybeBeginWrite();                                                                 // 347
  var refresh = function () {                                                                          // 348
    Meteor.refresh({collection: collectionName, id: null,                                              // 349
                    dropCollection: true});                                                            // 350
  };                                                                                                   // 351
  cb = bindEnvironmentForWrite(writeCallback(write, refresh, cb));                                     // 352
                                                                                                       // 353
  try {                                                                                                // 354
    var collection = self._getCollection(collectionName);                                              // 355
    collection.drop(cb);                                                                               // 356
  } catch (e) {                                                                                        // 357
    write.committed();                                                                                 // 358
    throw e;                                                                                           // 359
  }                                                                                                    // 360
};                                                                                                     // 361
                                                                                                       // 362
MongoConnection.prototype._update = function (collection_name, selector, mod,                          // 363
                                              options, callback) {                                     // 364
  var self = this;                                                                                     // 365
                                                                                                       // 366
  if (! callback && options instanceof Function) {                                                     // 367
    callback = options;                                                                                // 368
    options = null;                                                                                    // 369
  }                                                                                                    // 370
                                                                                                       // 371
  if (collection_name === "___meteor_failure_test_collection") {                                       // 372
    var e = new Error("Failure test");                                                                 // 373
    e.expected = true;                                                                                 // 374
    if (callback)                                                                                      // 375
      return callback(e);                                                                              // 376
    else                                                                                               // 377
      throw e;                                                                                         // 378
  }                                                                                                    // 379
                                                                                                       // 380
  // explicit safety check. null and undefined can crash the mongo                                     // 381
  // driver. Although the node driver and minimongo do 'support'                                       // 382
  // non-object modifier in that they don't crash, they are not                                        // 383
  // meaningful operations and do not do anything. Defensively throw an                                // 384
  // error here.                                                                                       // 385
  if (!mod || typeof mod !== 'object')                                                                 // 386
    throw new Error("Invalid modifier. Modifier must be an object.");                                  // 387
                                                                                                       // 388
  if (!options) options = {};                                                                          // 389
                                                                                                       // 390
  var write = self._maybeBeginWrite();                                                                 // 391
  var refresh = function () {                                                                          // 392
    self._refresh(collection_name, selector);                                                          // 393
  };                                                                                                   // 394
  callback = writeCallback(write, refresh, callback);                                                  // 395
  try {                                                                                                // 396
    var collection = self._getCollection(collection_name);                                             // 397
    var mongoOpts = {safe: true};                                                                      // 398
    // explictly enumerate options that minimongo supports                                             // 399
    if (options.upsert) mongoOpts.upsert = true;                                                       // 400
    if (options.multi) mongoOpts.multi = true;                                                         // 401
                                                                                                       // 402
    var mongoSelector = replaceTypes(selector, replaceMeteorAtomWithMongo);                            // 403
    var mongoMod = replaceTypes(mod, replaceMeteorAtomWithMongo);                                      // 404
                                                                                                       // 405
    var isModify = isModificationMod(mongoMod);                                                        // 406
    var knownId = (isModify ? selector._id : mod._id);                                                 // 407
                                                                                                       // 408
    if (options.upsert && (! knownId) && options.insertedId) {                                         // 409
      // XXX In future we could do a real upsert for the mongo id generation                           // 410
      // case, if the the node mongo driver gives us back the id of the upserted                       // 411
      // doc (which our current version does not).                                                     // 412
      simulateUpsertWithInsertedId(                                                                    // 413
        collection, mongoSelector, mongoMod,                                                           // 414
        isModify, options,                                                                             // 415
        // This callback does not need to be bindEnvironment'ed because                                // 416
        // simulateUpsertWithInsertedId() wraps it and then passes it through                          // 417
        // bindEnvironmentForWrite.                                                                    // 418
        function (err, result) {                                                                       // 419
          // If we got here via a upsert() call, then options._returnObject will                       // 420
          // be set and we should return the whole object. Otherwise, we should                        // 421
          // just return the number of affected docs to match the mongo API.                           // 422
          if (result && ! options._returnObject)                                                       // 423
            callback(err, result.numberAffected);                                                      // 424
          else                                                                                         // 425
            callback(err, result);                                                                     // 426
        }                                                                                              // 427
      );                                                                                               // 428
    } else {                                                                                           // 429
      collection.update(                                                                               // 430
        mongoSelector, mongoMod, mongoOpts,                                                            // 431
        bindEnvironmentForWrite(function (err, result, extra) {                                        // 432
          if (! err) {                                                                                 // 433
            if (result && options._returnObject) {                                                     // 434
              result = { numberAffected: result };                                                     // 435
              // If this was an upsert() call, and we ended up                                         // 436
              // inserting a new doc and we know its id, then                                          // 437
              // return that id as well.                                                               // 438
              if (options.upsert && knownId &&                                                         // 439
                  ! extra.updatedExisting)                                                             // 440
                result.insertedId = knownId;                                                           // 441
            }                                                                                          // 442
          }                                                                                            // 443
          callback(err, result);                                                                       // 444
        }));                                                                                           // 445
    }                                                                                                  // 446
  } catch (e) {                                                                                        // 447
    write.committed();                                                                                 // 448
    throw e;                                                                                           // 449
  }                                                                                                    // 450
};                                                                                                     // 451
                                                                                                       // 452
var isModificationMod = function (mod) {                                                               // 453
  for (var k in mod)                                                                                   // 454
    if (k.substr(0, 1) === '$')                                                                        // 455
      return true;                                                                                     // 456
  return false;                                                                                        // 457
};                                                                                                     // 458
                                                                                                       // 459
var NUM_OPTIMISTIC_TRIES = 3;                                                                          // 460
                                                                                                       // 461
// exposed for testing                                                                                 // 462
MongoConnection._isCannotChangeIdError = function (err) {                                              // 463
  // either of these checks should work, but just to be safe...                                        // 464
  return (err.code === 13596 ||                                                                        // 465
          err.err.indexOf("cannot change _id of a document") === 0);                                   // 466
};                                                                                                     // 467
                                                                                                       // 468
var simulateUpsertWithInsertedId = function (collection, selector, mod,                                // 469
                                             isModify, options, callback) {                            // 470
  // STRATEGY:  First try doing a plain update.  If it affected 0 documents,                           // 471
  // then without affecting the database, we know we should probably do an                             // 472
  // insert.  We then do a *conditional* insert that will fail in the case                             // 473
  // of a race condition.  This conditional insert is actually an                                      // 474
  // upsert-replace with an _id, which will never successfully update an                               // 475
  // existing document.  If this upsert fails with an error saying it                                  // 476
  // couldn't change an existing _id, then we know an intervening write has                            // 477
  // caused the query to match something.  We go back to step one and repeat.                          // 478
  // Like all "optimistic write" schemes, we rely on the fact that it's                                // 479
  // unlikely our writes will continue to be interfered with under normal                              // 480
  // circumstances (though sufficiently heavy contention with writers                                  // 481
  // disagreeing on the existence of an object will cause writes to fail                               // 482
  // in theory).                                                                                       // 483
                                                                                                       // 484
  var newDoc;                                                                                          // 485
  // Run this code up front so that it fails fast if someone uses                                      // 486
  // a Mongo update operator we don't support.                                                         // 487
  if (isModify) {                                                                                      // 488
    // We've already run replaceTypes/replaceMeteorAtomWithMongo on                                    // 489
    // selector and mod.  We assume it doesn't matter, as far as                                       // 490
    // the behavior of modifiers is concerned, whether `_modify`                                       // 491
    // is run on EJSON or on mongo-converted EJSON.                                                    // 492
    var selectorDoc = LocalCollection._removeDollarOperators(selector);                                // 493
    LocalCollection._modify(selectorDoc, mod, true);                                                   // 494
    newDoc = selectorDoc;                                                                              // 495
  } else {                                                                                             // 496
    newDoc = mod;                                                                                      // 497
  }                                                                                                    // 498
                                                                                                       // 499
  var insertedId = options.insertedId; // must exist                                                   // 500
  var mongoOptsForUpdate = {                                                                           // 501
    safe: true,                                                                                        // 502
    multi: options.multi                                                                               // 503
  };                                                                                                   // 504
  var mongoOptsForInsert = {                                                                           // 505
    safe: true,                                                                                        // 506
    upsert: true                                                                                       // 507
  };                                                                                                   // 508
                                                                                                       // 509
  var tries = NUM_OPTIMISTIC_TRIES;                                                                    // 510
                                                                                                       // 511
  var doUpdate = function () {                                                                         // 512
    tries--;                                                                                           // 513
    if (! tries) {                                                                                     // 514
      callback(new Error("Upsert failed after " + NUM_OPTIMISTIC_TRIES + " tries."));                  // 515
    } else {                                                                                           // 516
      collection.update(selector, mod, mongoOptsForUpdate,                                             // 517
                        bindEnvironmentForWrite(function (err, result) {                               // 518
                          if (err)                                                                     // 519
                            callback(err);                                                             // 520
                          else if (result)                                                             // 521
                            callback(null, {                                                           // 522
                              numberAffected: result                                                   // 523
                            });                                                                        // 524
                          else                                                                         // 525
                            doConditionalInsert();                                                     // 526
                        }));                                                                           // 527
    }                                                                                                  // 528
  };                                                                                                   // 529
                                                                                                       // 530
  var doConditionalInsert = function () {                                                              // 531
    var replacementWithId = _.extend(                                                                  // 532
      replaceTypes({_id: insertedId}, replaceMeteorAtomWithMongo),                                     // 533
      newDoc);                                                                                         // 534
    collection.update(selector, replacementWithId, mongoOptsForInsert,                                 // 535
                      bindEnvironmentForWrite(function (err, result) {                                 // 536
                        if (err) {                                                                     // 537
                          // figure out if this is a                                                   // 538
                          // "cannot change _id of document" error, and                                // 539
                          // if so, try doUpdate() again, up to 3 times.                               // 540
                          if (MongoConnection._isCannotChangeIdError(err)) {                           // 541
                            doUpdate();                                                                // 542
                          } else {                                                                     // 543
                            callback(err);                                                             // 544
                          }                                                                            // 545
                        } else {                                                                       // 546
                          callback(null, {                                                             // 547
                            numberAffected: result,                                                    // 548
                            insertedId: insertedId                                                     // 549
                          });                                                                          // 550
                        }                                                                              // 551
                      }));                                                                             // 552
  };                                                                                                   // 553
                                                                                                       // 554
  doUpdate();                                                                                          // 555
};                                                                                                     // 556
                                                                                                       // 557
_.each(["insert", "update", "remove", "dropCollection"], function (method) {                           // 558
  MongoConnection.prototype[method] = function (/* arguments */) {                                     // 559
    var self = this;                                                                                   // 560
    return Meteor._wrapAsync(self["_" + method]).apply(self, arguments);                               // 561
  };                                                                                                   // 562
});                                                                                                    // 563
                                                                                                       // 564
// XXX MongoConnection.upsert() does not return the id of the inserted document                        // 565
// unless you set it explicitly in the selector or modifier (as a replacement                          // 566
// doc).                                                                                               // 567
MongoConnection.prototype.upsert = function (collectionName, selector, mod,                            // 568
                                             options, callback) {                                      // 569
  var self = this;                                                                                     // 570
  if (typeof options === "function" && ! callback) {                                                   // 571
    callback = options;                                                                                // 572
    options = {};                                                                                      // 573
  }                                                                                                    // 574
                                                                                                       // 575
  return self.update(collectionName, selector, mod,                                                    // 576
                     _.extend({}, options, {                                                           // 577
                       upsert: true,                                                                   // 578
                       _returnObject: true                                                             // 579
                     }), callback);                                                                    // 580
};                                                                                                     // 581
                                                                                                       // 582
MongoConnection.prototype.find = function (collectionName, selector, options) {                        // 583
  var self = this;                                                                                     // 584
                                                                                                       // 585
  if (arguments.length === 1)                                                                          // 586
    selector = {};                                                                                     // 587
                                                                                                       // 588
  return new Cursor(                                                                                   // 589
    self, new CursorDescription(collectionName, selector, options));                                   // 590
};                                                                                                     // 591
                                                                                                       // 592
MongoConnection.prototype.findOne = function (collection_name, selector,                               // 593
                                              options) {                                               // 594
  var self = this;                                                                                     // 595
  if (arguments.length === 1)                                                                          // 596
    selector = {};                                                                                     // 597
                                                                                                       // 598
  options = options || {};                                                                             // 599
  options.limit = 1;                                                                                   // 600
  return self.find(collection_name, selector, options).fetch()[0];                                     // 601
};                                                                                                     // 602
                                                                                                       // 603
// We'll actually design an index API later. For now, we just pass through to                          // 604
// Mongo's, but make it synchronous.                                                                   // 605
MongoConnection.prototype._ensureIndex = function (collectionName, index,                              // 606
                                                   options) {                                          // 607
  var self = this;                                                                                     // 608
  options = _.extend({safe: true}, options);                                                           // 609
                                                                                                       // 610
  // We expect this function to be called at startup, not from within a method,                        // 611
  // so we don't interact with the write fence.                                                        // 612
  var collection = self._getCollection(collectionName);                                                // 613
  var future = new Future;                                                                             // 614
  var indexName = collection.ensureIndex(index, options, future.resolver());                           // 615
  future.wait();                                                                                       // 616
};                                                                                                     // 617
MongoConnection.prototype._dropIndex = function (collectionName, index) {                              // 618
  var self = this;                                                                                     // 619
                                                                                                       // 620
  // This function is only used by test code, not within a method, so we don't                         // 621
  // interact with the write fence.                                                                    // 622
  var collection = self._getCollection(collectionName);                                                // 623
  var future = new Future;                                                                             // 624
  var indexName = collection.dropIndex(index, future.resolver());                                      // 625
  future.wait();                                                                                       // 626
};                                                                                                     // 627
                                                                                                       // 628
// CURSORS                                                                                             // 629
                                                                                                       // 630
// There are several classes which relate to cursors:                                                  // 631
//                                                                                                     // 632
// CursorDescription represents the arguments used to construct a cursor:                              // 633
// collectionName, selector, and (find) options.  Because it is used as a key                          // 634
// for cursor de-dup, everything in it should either be JSON-stringifiable or                          // 635
// not affect observeChanges output (eg, options.transform functions are not                           // 636
// stringifiable but do not affect observeChanges).                                                    // 637
//                                                                                                     // 638
// SynchronousCursor is a wrapper around a MongoDB cursor                                              // 639
// which includes fully-synchronous versions of forEach, etc.                                          // 640
//                                                                                                     // 641
// Cursor is the cursor object returned from find(), which implements the                              // 642
// documented Meteor.Collection cursor API.  It wraps a CursorDescription and a                        // 643
// SynchronousCursor (lazily: it doesn't contact Mongo until you call a method                         // 644
// like fetch or forEach on it).                                                                       // 645
//                                                                                                     // 646
// ObserveHandle is the "observe handle" returned from observeChanges. It has a                        // 647
// reference to an ObserveMultiplexer.                                                                 // 648
//                                                                                                     // 649
// ObserveMultiplexer allows multiple identical ObserveHandles to be driven by a                       // 650
// single observe driver.                                                                              // 651
//                                                                                                     // 652
// There are two "observe drivers" which drive ObserveMultiplexers:                                    // 653
//   - PollingObserveDriver caches the results of a query and reruns it when                           // 654
//     necessary.                                                                                      // 655
//   - OplogObserveDriver follows the Mongo operation log to directly observe                          // 656
//     database changes.                                                                               // 657
// Both implementations follow the same simple interface: when you create them,                        // 658
// they start sending observeChanges callbacks (and a ready() invocation) to                           // 659
// their ObserveMultiplexer, and you stop them by calling their stop() method.                         // 660
                                                                                                       // 661
CursorDescription = function (collectionName, selector, options) {                                     // 662
  var self = this;                                                                                     // 663
  self.collectionName = collectionName;                                                                // 664
  self.selector = Meteor.Collection._rewriteSelector(selector);                                        // 665
  self.options = options || {};                                                                        // 666
};                                                                                                     // 667
                                                                                                       // 668
Cursor = function (mongo, cursorDescription) {                                                         // 669
  var self = this;                                                                                     // 670
                                                                                                       // 671
  self._mongo = mongo;                                                                                 // 672
  self._cursorDescription = cursorDescription;                                                         // 673
  self._synchronousCursor = null;                                                                      // 674
};                                                                                                     // 675
                                                                                                       // 676
_.each(['forEach', 'map', 'rewind', 'fetch', 'count'], function (method) {                             // 677
  Cursor.prototype[method] = function () {                                                             // 678
    var self = this;                                                                                   // 679
                                                                                                       // 680
    // You can only observe a tailable cursor.                                                         // 681
    if (self._cursorDescription.options.tailable)                                                      // 682
      throw new Error("Cannot call " + method + " on a tailable cursor");                              // 683
                                                                                                       // 684
    if (!self._synchronousCursor) {                                                                    // 685
      self._synchronousCursor = self._mongo._createSynchronousCursor(                                  // 686
        self._cursorDescription, {                                                                     // 687
          // Make sure that the "self" argument to forEach/map callbacks is the                        // 688
          // Cursor, not the SynchronousCursor.                                                        // 689
          selfForIteration: self,                                                                      // 690
          useTransform: true                                                                           // 691
        });                                                                                            // 692
    }                                                                                                  // 693
                                                                                                       // 694
    return self._synchronousCursor[method].apply(                                                      // 695
      self._synchronousCursor, arguments);                                                             // 696
  };                                                                                                   // 697
});                                                                                                    // 698
                                                                                                       // 699
Cursor.prototype.getTransform = function () {                                                          // 700
  var self = this;                                                                                     // 701
  return self._cursorDescription.options.transform;                                                    // 702
};                                                                                                     // 703
                                                                                                       // 704
// When you call Meteor.publish() with a function that returns a Cursor, we need                       // 705
// to transmute it into the equivalent subscription.  This is the function that                        // 706
// does that.                                                                                          // 707
                                                                                                       // 708
Cursor.prototype._publishCursor = function (sub) {                                                     // 709
  var self = this;                                                                                     // 710
  var collection = self._cursorDescription.collectionName;                                             // 711
  return Meteor.Collection._publishCursor(self, sub, collection);                                      // 712
};                                                                                                     // 713
                                                                                                       // 714
// Used to guarantee that publish functions return at most one cursor per                              // 715
// collection. Private, because we might later have cursors that include                               // 716
// documents from multiple collections somehow.                                                        // 717
Cursor.prototype._getCollectionName = function () {                                                    // 718
  var self = this;                                                                                     // 719
  return self._cursorDescription.collectionName;                                                       // 720
}                                                                                                      // 721
                                                                                                       // 722
Cursor.prototype.observe = function (callbacks) {                                                      // 723
  var self = this;                                                                                     // 724
  return LocalCollection._observeFromObserveChanges(self, callbacks);                                  // 725
};                                                                                                     // 726
                                                                                                       // 727
Cursor.prototype.observeChanges = function (callbacks) {                                               // 728
  var self = this;                                                                                     // 729
  var ordered = LocalCollection._observeChangesCallbacksAreOrdered(callbacks);                         // 730
  return self._mongo._observeChanges(                                                                  // 731
    self._cursorDescription, ordered, callbacks);                                                      // 732
};                                                                                                     // 733
                                                                                                       // 734
MongoConnection.prototype._createSynchronousCursor = function(                                         // 735
    cursorDescription, options) {                                                                      // 736
  var self = this;                                                                                     // 737
  options = _.pick(options || {}, 'selfForIteration', 'useTransform');                                 // 738
                                                                                                       // 739
  var collection = self._getCollection(cursorDescription.collectionName);                              // 740
  var cursorOptions = cursorDescription.options;                                                       // 741
  var mongoOptions = {                                                                                 // 742
    sort: cursorOptions.sort,                                                                          // 743
    limit: cursorOptions.limit,                                                                        // 744
    skip: cursorOptions.skip                                                                           // 745
  };                                                                                                   // 746
                                                                                                       // 747
  // Do we want a tailable cursor (which only works on capped collections)?                            // 748
  if (cursorOptions.tailable) {                                                                        // 749
    // We want a tailable cursor...                                                                    // 750
    mongoOptions.tailable = true;                                                                      // 751
    // ... and for the server to wait a bit if any getMore has no data (rather                         // 752
    // than making us put the relevant sleeps in the client)...                                        // 753
    mongoOptions.awaitdata = true;                                                                     // 754
    // ... and to keep querying the server indefinitely rather than just 5 times                       // 755
    // if there's no more data.                                                                        // 756
    mongoOptions.numberOfRetries = -1;                                                                 // 757
    // And if this cursor specifies a 'ts', then set the undocumented oplog                            // 758
    // replay flag, which does a special scan to find the first document                               // 759
    // (instead of creating an index on ts).                                                           // 760
    if (cursorDescription.selector.ts)                                                                 // 761
      mongoOptions.oplogReplay = true;                                                                 // 762
  }                                                                                                    // 763
                                                                                                       // 764
  var dbCursor = collection.find(                                                                      // 765
    replaceTypes(cursorDescription.selector, replaceMeteorAtomWithMongo),                              // 766
    cursorOptions.fields, mongoOptions);                                                               // 767
                                                                                                       // 768
  return new SynchronousCursor(dbCursor, cursorDescription, options);                                  // 769
};                                                                                                     // 770
                                                                                                       // 771
var SynchronousCursor = function (dbCursor, cursorDescription, options) {                              // 772
  var self = this;                                                                                     // 773
  options = _.pick(options || {}, 'selfForIteration', 'useTransform');                                 // 774
                                                                                                       // 775
  self._dbCursor = dbCursor;                                                                           // 776
  self._cursorDescription = cursorDescription;                                                         // 777
  // The "self" argument passed to forEach/map callbacks. If we're wrapped                             // 778
  // inside a user-visible Cursor, we want to provide the outer cursor!                                // 779
  self._selfForIteration = options.selfForIteration || self;                                           // 780
  if (options.useTransform && cursorDescription.options.transform) {                                   // 781
    self._transform = Deps._makeNonreactive(                                                           // 782
      cursorDescription.options.transform                                                              // 783
    );                                                                                                 // 784
  } else {                                                                                             // 785
    self._transform = null;                                                                            // 786
  }                                                                                                    // 787
                                                                                                       // 788
  // Need to specify that the callback is the first argument to nextObject,                            // 789
  // since otherwise when we try to call it with no args the driver will                               // 790
  // interpret "undefined" first arg as an options hash and crash.                                     // 791
  self._synchronousNextObject = Future.wrap(                                                           // 792
    dbCursor.nextObject.bind(dbCursor), 0);                                                            // 793
  self._synchronousCount = Future.wrap(dbCursor.count.bind(dbCursor));                                 // 794
  self._visitedIds = {};                                                                               // 795
};                                                                                                     // 796
                                                                                                       // 797
_.extend(SynchronousCursor.prototype, {                                                                // 798
  _nextObject: function () {                                                                           // 799
    var self = this;                                                                                   // 800
                                                                                                       // 801
    while (true) {                                                                                     // 802
      var doc = self._synchronousNextObject().wait();                                                  // 803
                                                                                                       // 804
      if (!doc) return null;                                                                           // 805
      doc = replaceTypes(doc, replaceMongoAtomWithMeteor);                                             // 806
                                                                                                       // 807
      if (!self._cursorDescription.options.tailable && _.has(doc, '_id')) {                            // 808
        // Did Mongo give us duplicate documents in the same cursor? If so,                            // 809
        // ignore this one. (Do this before the transform, since transform might                       // 810
        // return some unrelated value.) We don't do this for tailable cursors,                        // 811
        // because we want to maintain O(1) memory usage. And if there isn't _id                       // 812
        // for some reason (maybe it's the oplog), then we don't do this either.                       // 813
        // (Be careful to do this for falsey but existing _id, though.)                                // 814
        var strId = LocalCollection._idStringify(doc._id);                                             // 815
        if (self._visitedIds[strId]) continue;                                                         // 816
        self._visitedIds[strId] = true;                                                                // 817
      }                                                                                                // 818
                                                                                                       // 819
      if (self._transform)                                                                             // 820
        doc = self._transform(doc);                                                                    // 821
                                                                                                       // 822
      return doc;                                                                                      // 823
    }                                                                                                  // 824
  },                                                                                                   // 825
                                                                                                       // 826
  forEach: function (callback, thisArg) {                                                              // 827
    var self = this;                                                                                   // 828
                                                                                                       // 829
    // We implement the loop ourself instead of using self._dbCursor.each,                             // 830
    // because "each" will call its callback outside of a fiber which makes it                         // 831
    // much more complex to make this function synchronous.                                            // 832
    var index = 0;                                                                                     // 833
    while (true) {                                                                                     // 834
      var doc = self._nextObject();                                                                    // 835
      if (!doc) return;                                                                                // 836
      callback.call(thisArg, doc, index++, self._selfForIteration);                                    // 837
    }                                                                                                  // 838
  },                                                                                                   // 839
                                                                                                       // 840
  // XXX Allow overlapping callback executions if callback yields.                                     // 841
  map: function (callback, thisArg) {                                                                  // 842
    var self = this;                                                                                   // 843
    var res = [];                                                                                      // 844
    self.forEach(function (doc, index) {                                                               // 845
      res.push(callback.call(thisArg, doc, index, self._selfForIteration));                            // 846
    });                                                                                                // 847
    return res;                                                                                        // 848
  },                                                                                                   // 849
                                                                                                       // 850
  rewind: function () {                                                                                // 851
    var self = this;                                                                                   // 852
                                                                                                       // 853
    // known to be synchronous                                                                         // 854
    self._dbCursor.rewind();                                                                           // 855
                                                                                                       // 856
    self._visitedIds = {};                                                                             // 857
  },                                                                                                   // 858
                                                                                                       // 859
  // Mostly usable for tailable cursors.                                                               // 860
  close: function () {                                                                                 // 861
    var self = this;                                                                                   // 862
                                                                                                       // 863
    self._dbCursor.close();                                                                            // 864
  },                                                                                                   // 865
                                                                                                       // 866
  fetch: function () {                                                                                 // 867
    var self = this;                                                                                   // 868
    return self.map(_.identity);                                                                       // 869
  },                                                                                                   // 870
                                                                                                       // 871
  count: function () {                                                                                 // 872
    var self = this;                                                                                   // 873
    return self._synchronousCount().wait();                                                            // 874
  },                                                                                                   // 875
                                                                                                       // 876
  // This method is NOT wrapped in Cursor.                                                             // 877
  getRawObjects: function (ordered) {                                                                  // 878
    var self = this;                                                                                   // 879
    if (ordered) {                                                                                     // 880
      return self.fetch();                                                                             // 881
    } else {                                                                                           // 882
      var results = {};                                                                                // 883
      self.forEach(function (doc) {                                                                    // 884
        results[doc._id] = doc;                                                                        // 885
      });                                                                                              // 886
      return results;                                                                                  // 887
    }                                                                                                  // 888
  }                                                                                                    // 889
});                                                                                                    // 890
                                                                                                       // 891
MongoConnection.prototype.tail = function (cursorDescription, docCallback) {                           // 892
  var self = this;                                                                                     // 893
  if (!cursorDescription.options.tailable)                                                             // 894
    throw new Error("Can only tail a tailable cursor");                                                // 895
                                                                                                       // 896
  var cursor = self._createSynchronousCursor(cursorDescription);                                       // 897
                                                                                                       // 898
  var stopped = false;                                                                                 // 899
  var lastTS = undefined;                                                                              // 900
  var loop = function () {                                                                             // 901
    while (true) {                                                                                     // 902
      if (stopped)                                                                                     // 903
        return;                                                                                        // 904
      try {                                                                                            // 905
        var doc = cursor._nextObject();                                                                // 906
      } catch (err) {                                                                                  // 907
        // There's no good way to figure out if this was actually an error                             // 908
        // from Mongo. Ah well. But either way, we need to retry the cursor                            // 909
        // (unless the failure was because the observe got stopped).                                   // 910
        doc = null;                                                                                    // 911
      }                                                                                                // 912
      // Since cursor._nextObject can yield, we need to check again to see if                          // 913
      // we've been stopped before calling the callback.                                               // 914
      if (stopped)                                                                                     // 915
        return;                                                                                        // 916
      if (doc) {                                                                                       // 917
        // If a tailable cursor contains a "ts" field, use it to recreate the                          // 918
        // cursor on error. ("ts" is a standard that Mongo uses internally for                         // 919
        // the oplog, and there's a special flag that lets you do binary search                        // 920
        // on it instead of needing to use an index.)                                                  // 921
        lastTS = doc.ts;                                                                               // 922
        docCallback(doc);                                                                              // 923
      } else {                                                                                         // 924
        var newSelector = _.clone(cursorDescription.selector);                                         // 925
        if (lastTS) {                                                                                  // 926
          newSelector.ts = {$gt: lastTS};                                                              // 927
        }                                                                                              // 928
        cursor = self._createSynchronousCursor(new CursorDescription(                                  // 929
          cursorDescription.collectionName,                                                            // 930
          newSelector,                                                                                 // 931
          cursorDescription.options));                                                                 // 932
        // Mongo failover takes many seconds.  Retry in a bit.  (Without this                          // 933
        // setTimeout, we peg the CPU at 100% and never notice the actual                              // 934
        // failover.                                                                                   // 935
        Meteor.setTimeout(loop, 100);                                                                  // 936
        break;                                                                                         // 937
      }                                                                                                // 938
    }                                                                                                  // 939
  };                                                                                                   // 940
                                                                                                       // 941
  Meteor.defer(loop);                                                                                  // 942
                                                                                                       // 943
  return {                                                                                             // 944
    stop: function () {                                                                                // 945
      stopped = true;                                                                                  // 946
      cursor.close();                                                                                  // 947
    }                                                                                                  // 948
  };                                                                                                   // 949
};                                                                                                     // 950
                                                                                                       // 951
MongoConnection.prototype._observeChanges = function (                                                 // 952
    cursorDescription, ordered, callbacks) {                                                           // 953
  var self = this;                                                                                     // 954
                                                                                                       // 955
  if (cursorDescription.options.tailable) {                                                            // 956
    return self._observeChangesTailable(cursorDescription, ordered, callbacks);                        // 957
  }                                                                                                    // 958
                                                                                                       // 959
  var observeKey = JSON.stringify(                                                                     // 960
    _.extend({ordered: ordered}, cursorDescription));                                                  // 961
                                                                                                       // 962
  var multiplexer, observeDriver;                                                                      // 963
  var firstHandle = false;                                                                             // 964
                                                                                                       // 965
  // Find a matching ObserveMultiplexer, or create a new one. This next block is                       // 966
  // guaranteed to not yield (and it doesn't call anything that can observe a                          // 967
  // new query), so no other calls to this function can interleave with it.                            // 968
  Meteor._noYieldsAllowed(function () {                                                                // 969
    if (_.has(self._observeMultiplexers, observeKey)) {                                                // 970
      multiplexer = self._observeMultiplexers[observeKey];                                             // 971
    } else {                                                                                           // 972
      firstHandle = true;                                                                              // 973
      // Create a new ObserveMultiplexer.                                                              // 974
      multiplexer = new ObserveMultiplexer({                                                           // 975
        ordered: ordered,                                                                              // 976
        onStop: function () {                                                                          // 977
          observeDriver.stop();                                                                        // 978
          delete self._observeMultiplexers[observeKey];                                                // 979
        }                                                                                              // 980
      });                                                                                              // 981
      self._observeMultiplexers[observeKey] = multiplexer;                                             // 982
    }                                                                                                  // 983
  });                                                                                                  // 984
                                                                                                       // 985
  var observeHandle = new ObserveHandle(multiplexer, callbacks);                                       // 986
                                                                                                       // 987
  if (firstHandle) {                                                                                   // 988
    var driverClass = PollingObserveDriver;                                                            // 989
    if (self._oplogHandle && !ordered && !callbacks._testOnlyPollCallback                              // 990
        && OplogObserveDriver.cursorSupported(cursorDescription)) {                                    // 991
      driverClass = OplogObserveDriver;                                                                // 992
    }                                                                                                  // 993
    observeDriver = new driverClass({                                                                  // 994
      cursorDescription: cursorDescription,                                                            // 995
      mongoHandle: self,                                                                               // 996
      multiplexer: multiplexer,                                                                        // 997
      ordered: ordered,                                                                                // 998
      _testOnlyPollCallback: callbacks._testOnlyPollCallback                                           // 999
    });                                                                                                // 1000
                                                                                                       // 1001
    // This field is only set for the first ObserveHandle in an                                        // 1002
    // ObserveMultiplexer. It is only there for use tests.                                             // 1003
    observeHandle._observeDriver = observeDriver;                                                      // 1004
  }                                                                                                    // 1005
                                                                                                       // 1006
  // Blocks until the initial adds have been sent.                                                     // 1007
  multiplexer.addHandleAndSendInitialAdds(observeHandle);                                              // 1008
                                                                                                       // 1009
  return observeHandle;                                                                                // 1010
};                                                                                                     // 1011
                                                                                                       // 1012
// Listen for the invalidation messages that will trigger us to poll the                               // 1013
// database for changes. If this selector specifies specific IDs, specify them                         // 1014
// here, so that updates to different specific IDs don't cause us to poll.                             // 1015
// listenCallback is the same kind of (notification, complete) callback passed                         // 1016
// to InvalidationCrossbar.listen.                                                                     // 1017
                                                                                                       // 1018
listenAll = function (cursorDescription, listenCallback) {                                             // 1019
  var listeners = [];                                                                                  // 1020
  forEachTrigger(cursorDescription, function (trigger) {                                               // 1021
    listeners.push(DDPServer._InvalidationCrossbar.listen(                                             // 1022
      trigger, listenCallback));                                                                       // 1023
  });                                                                                                  // 1024
                                                                                                       // 1025
  return {                                                                                             // 1026
    stop: function () {                                                                                // 1027
      _.each(listeners, function (listener) {                                                          // 1028
        listener.stop();                                                                               // 1029
      });                                                                                              // 1030
    }                                                                                                  // 1031
  };                                                                                                   // 1032
};                                                                                                     // 1033
                                                                                                       // 1034
forEachTrigger = function (cursorDescription, triggerCallback) {                                       // 1035
  var key = {collection: cursorDescription.collectionName};                                            // 1036
  var specificIds = LocalCollection._idsMatchedBySelector(                                             // 1037
    cursorDescription.selector);                                                                       // 1038
  if (specificIds) {                                                                                   // 1039
    _.each(specificIds, function (id) {                                                                // 1040
      triggerCallback(_.extend({id: id}, key));                                                        // 1041
    });                                                                                                // 1042
    triggerCallback(_.extend({dropCollection: true, id: null}, key));                                  // 1043
  } else {                                                                                             // 1044
    triggerCallback(key);                                                                              // 1045
  }                                                                                                    // 1046
};                                                                                                     // 1047
                                                                                                       // 1048
// observeChanges for tailable cursors on capped collections.                                          // 1049
//                                                                                                     // 1050
// Some differences from normal cursors:                                                               // 1051
//   - Will never produce anything other than 'added' or 'addedBefore'. If you                         // 1052
//     do update a document that has already been produced, this will not notice                       // 1053
//     it.                                                                                             // 1054
//   - If you disconnect and reconnect from Mongo, it will essentially restart                         // 1055
//     the query, which will lead to duplicate results. This is pretty bad,                            // 1056
//     but if you include a field called 'ts' which is inserted as                                     // 1057
//     new MongoInternals.MongoTimestamp(0, 0) (which is initialized to the                            // 1058
//     current Mongo-style timestamp), we'll be able to find the place to                              // 1059
//     restart properly. (This field is specifically understood by Mongo with an                       // 1060
//     optimization which allows it to find the right place to start without                           // 1061
//     an index on ts. It's how the oplog works.)                                                      // 1062
//   - No callbacks are triggered synchronously with the call (there's no                              // 1063
//     differentiation between "initial data" and "later changes"; everything                          // 1064
//     that matches the query gets sent asynchronously).                                               // 1065
//   - De-duplication is not implemented.                                                              // 1066
//   - Does not yet interact with the write fence. Probably, this should work by                       // 1067
//     ignoring removes (which don't work on capped collections) and updates                           // 1068
//     (which don't affect tailable cursors), and just keeping track of the ID                         // 1069
//     of the inserted object, and closing the write fence once you get to that                        // 1070
//     ID (or timestamp?).  This doesn't work well if the document doesn't match                       // 1071
//     the query, though.  On the other hand, the write fence can close                                // 1072
//     immediately if it does not match the query. So if we trust minimongo                            // 1073
//     enough to accurately evaluate the query against the write fence, we                             // 1074
//     should be able to do this...  Of course, minimongo doesn't even support                         // 1075
//     Mongo Timestamps yet.                                                                           // 1076
MongoConnection.prototype._observeChangesTailable = function (                                         // 1077
    cursorDescription, ordered, callbacks) {                                                           // 1078
  var self = this;                                                                                     // 1079
                                                                                                       // 1080
  // Tailable cursors only ever call added/addedBefore callbacks, so it's an                           // 1081
  // error if you didn't provide them.                                                                 // 1082
  if ((ordered && !callbacks.addedBefore) ||                                                           // 1083
      (!ordered && !callbacks.added)) {                                                                // 1084
    throw new Error("Can't observe an " + (ordered ? "ordered" : "unordered")                          // 1085
                    + " tailable cursor without a "                                                    // 1086
                    + (ordered ? "addedBefore" : "added") + " callback");                              // 1087
  }                                                                                                    // 1088
                                                                                                       // 1089
  return self.tail(cursorDescription, function (doc) {                                                 // 1090
    var id = doc._id;                                                                                  // 1091
    delete doc._id;                                                                                    // 1092
    // The ts is an implementation detail. Hide it.                                                    // 1093
    delete doc.ts;                                                                                     // 1094
    if (ordered) {                                                                                     // 1095
      callbacks.addedBefore(id, doc, null);                                                            // 1096
    } else {                                                                                           // 1097
      callbacks.added(id, doc);                                                                        // 1098
    }                                                                                                  // 1099
  });                                                                                                  // 1100
};                                                                                                     // 1101
                                                                                                       // 1102
// XXX We probably need to find a better way to expose this. Right now                                 // 1103
// it's only used by tests, but in fact you need it in normal                                          // 1104
// operation to interact with capped collections (eg, Galaxy uses it).                                 // 1105
MongoInternals.MongoTimestamp = MongoDB.Timestamp;                                                     // 1106
                                                                                                       // 1107
MongoInternals.Connection = MongoConnection;                                                           // 1108
MongoInternals.NpmModule = MongoDB;                                                                    // 1109
                                                                                                       // 1110
/////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

/////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                     //
// packages/mongo-livedata/oplog_tailing.js                                                            //
//                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                       //
var Future = Npm.require('fibers/future');                                                             // 1
                                                                                                       // 2
var OPLOG_COLLECTION = 'oplog.rs';                                                                     // 3
                                                                                                       // 4
// Like Perl's quotemeta: quotes all regexp metacharacters. See                                        // 5
//   https://github.com/substack/quotemeta/blob/master/index.js                                        // 6
// XXX this is duplicated with accounts_server.js                                                      // 7
var quotemeta = function (str) {                                                                       // 8
    return String(str).replace(/(\W)/g, '\\$1');                                                       // 9
};                                                                                                     // 10
                                                                                                       // 11
var showTS = function (ts) {                                                                           // 12
  return "Timestamp(" + ts.getHighBits() + ", " + ts.getLowBits() + ")";                               // 13
};                                                                                                     // 14
                                                                                                       // 15
idForOp = function (op) {                                                                              // 16
  if (op.op === 'd')                                                                                   // 17
    return op.o._id;                                                                                   // 18
  else if (op.op === 'i')                                                                              // 19
    return op.o._id;                                                                                   // 20
  else if (op.op === 'u')                                                                              // 21
    return op.o2._id;                                                                                  // 22
  else if (op.op === 'c')                                                                              // 23
    throw Error("Operator 'c' doesn't supply an object with id: " +                                    // 24
                EJSON.stringify(op));                                                                  // 25
  else                                                                                                 // 26
    throw Error("Unknown op: " + EJSON.stringify(op));                                                 // 27
};                                                                                                     // 28
                                                                                                       // 29
OplogHandle = function (oplogUrl, dbNameFuture) {                                                      // 30
  var self = this;                                                                                     // 31
  self._oplogUrl = oplogUrl;                                                                           // 32
  self._dbNameFuture = dbNameFuture;                                                                   // 33
                                                                                                       // 34
  self._oplogLastEntryConnection = null;                                                               // 35
  self._oplogTailConnection = null;                                                                    // 36
  self._stopped = false;                                                                               // 37
  self._tailHandle = null;                                                                             // 38
  self._readyFuture = new Future();                                                                    // 39
  self._crossbar = new DDPServer._Crossbar({                                                           // 40
    factPackage: "mongo-livedata", factName: "oplog-watchers"                                          // 41
  });                                                                                                  // 42
  self._lastProcessedTS = null;                                                                        // 43
  // Lazily calculate the basic selector. Don't call _baseOplogSelector() at the                       // 44
  // top level of the constructor, because we don't want the constructor to                            // 45
  // block. Note that the _.once is per-handle.                                                        // 46
  self._baseOplogSelector = _.once(function () {                                                       // 47
    return {                                                                                           // 48
      ns: new RegExp('^' + quotemeta(self._dbNameFuture.wait()) + '\\.'),                              // 49
      $or: [                                                                                           // 50
        { op: {$in: ['i', 'u', 'd']} },                                                                // 51
        // If it is not db.collection.drop(), ignore it                                                // 52
        { op: 'c', 'o.drop': { $exists: true } }]                                                      // 53
    };                                                                                                 // 54
  });                                                                                                  // 55
  // XXX doc                                                                                           // 56
  self._catchingUpFutures = [];                                                                        // 57
                                                                                                       // 58
  // Setting up the connections and tail handler is a blocking operation, so we                        // 59
  // do it "later".                                                                                    // 60
  Meteor.defer(function () {                                                                           // 61
    self._startTailing();                                                                              // 62
  });                                                                                                  // 63
};                                                                                                     // 64
                                                                                                       // 65
_.extend(OplogHandle.prototype, {                                                                      // 66
  stop: function () {                                                                                  // 67
    var self = this;                                                                                   // 68
    if (self._stopped)                                                                                 // 69
      return;                                                                                          // 70
    self._stopped = true;                                                                              // 71
    if (self._tailHandle)                                                                              // 72
      self._tailHandle.stop();                                                                         // 73
    // XXX should close connections too                                                                // 74
  },                                                                                                   // 75
  onOplogEntry: function (trigger, callback) {                                                         // 76
    var self = this;                                                                                   // 77
    if (self._stopped)                                                                                 // 78
      throw new Error("Called onOplogEntry on stopped handle!");                                       // 79
                                                                                                       // 80
    // Calling onOplogEntry requires us to wait for the tailing to be ready.                           // 81
    self._readyFuture.wait();                                                                          // 82
                                                                                                       // 83
    var originalCallback = callback;                                                                   // 84
    callback = Meteor.bindEnvironment(function (notification, onComplete) {                            // 85
      // XXX can we avoid this clone by making oplog.js careful?                                       // 86
      try {                                                                                            // 87
        originalCallback(EJSON.clone(notification));                                                   // 88
      } finally {                                                                                      // 89
        onComplete();                                                                                  // 90
      }                                                                                                // 91
    }, function (err) {                                                                                // 92
      Meteor._debug("Error in oplog callback", err.stack);                                             // 93
    });                                                                                                // 94
    var listenHandle = self._crossbar.listen(trigger, callback);                                       // 95
    return {                                                                                           // 96
      stop: function () {                                                                              // 97
        listenHandle.stop();                                                                           // 98
      }                                                                                                // 99
    };                                                                                                 // 100
  },                                                                                                   // 101
  // Calls `callback` once the oplog has been processed up to a point that is                          // 102
  // roughly "now": specifically, once we've processed all ops that are                                // 103
  // currently visible.                                                                                // 104
  // XXX become convinced that this is actually safe even if oplogConnection                           // 105
  // is some kind of pool                                                                              // 106
  waitUntilCaughtUp: function () {                                                                     // 107
    var self = this;                                                                                   // 108
    if (self._stopped)                                                                                 // 109
      throw new Error("Called waitUntilCaughtUp on stopped handle!");                                  // 110
                                                                                                       // 111
    // Calling waitUntilCaughtUp requries us to wait for the oplog connection to                       // 112
    // be ready.                                                                                       // 113
    self._readyFuture.wait();                                                                          // 114
                                                                                                       // 115
    // We need to make the selector at least as restrictive as the actual                              // 116
    // tailing selector (ie, we need to specify the DB name) or else we might                          // 117
    // find a TS that won't show up in the actual tail stream.                                         // 118
    var lastEntry = self._oplogLastEntryConnection.findOne(                                            // 119
      OPLOG_COLLECTION, self._baseOplogSelector(),                                                     // 120
      {fields: {ts: 1}, sort: {$natural: -1}});                                                        // 121
                                                                                                       // 122
    if (!lastEntry) {                                                                                  // 123
      // Really, nothing in the oplog? Well, we've processed everything.                               // 124
      return;                                                                                          // 125
    }                                                                                                  // 126
                                                                                                       // 127
    var ts = lastEntry.ts;                                                                             // 128
    if (!ts)                                                                                           // 129
      throw Error("oplog entry without ts: " + EJSON.stringify(lastEntry));                            // 130
                                                                                                       // 131
    if (self._lastProcessedTS && ts.lessThanOrEqual(self._lastProcessedTS)) {                          // 132
      // We've already caught up to here.                                                              // 133
      return;                                                                                          // 134
    }                                                                                                  // 135
                                                                                                       // 136
                                                                                                       // 137
    // Insert the future into our list. Almost always, this will be at the end,                        // 138
    // but it's conceivable that if we fail over from one primary to another,                          // 139
    // the oplog entries we see will go backwards.                                                     // 140
    var insertAfter = self._catchingUpFutures.length;                                                  // 141
    while (insertAfter - 1 > 0                                                                         // 142
           && self._catchingUpFutures[insertAfter - 1].ts.greaterThan(ts)) {                           // 143
      insertAfter--;                                                                                   // 144
    }                                                                                                  // 145
    var f = new Future;                                                                                // 146
    self._catchingUpFutures.splice(insertAfter, 0, {ts: ts, future: f});                               // 147
    f.wait();                                                                                          // 148
  },                                                                                                   // 149
  _startTailing: function () {                                                                         // 150
    var self = this;                                                                                   // 151
    // We make two separate connections to Mongo. The Node Mongo driver                                // 152
    // implements a naive round-robin connection pool: each "connection" is a                          // 153
    // pool of several (5 by default) TCP connections, and each request is                             // 154
    // rotated through the pools. Tailable cursor queries block on the server                          // 155
    // until there is some data to return (or until a few seconds have                                 // 156
    // passed). So if the connection pool used for tailing cursors is the same                         // 157
    // pool used for other queries, the other queries will be delayed by seconds                       // 158
    // 1/5 of the time.                                                                                // 159
    //                                                                                                 // 160
    // The tail connection will only ever be running a single tail command, so                         // 161
    // it only needs to make one underlying TCP connection.                                            // 162
    self._oplogTailConnection = new MongoConnection(                                                   // 163
      self._oplogUrl, {poolSize: 1});                                                                  // 164
    // XXX better docs, but: it's to get monotonic results                                             // 165
    // XXX is it safe to say "if there's an in flight query, just use its                              // 166
    //     results"? I don't think so but should consider that                                         // 167
    self._oplogLastEntryConnection = new MongoConnection(                                              // 168
      self._oplogUrl, {poolSize: 1});                                                                  // 169
                                                                                                       // 170
    // Find the last oplog entry. Blocks until the connection is ready.                                // 171
    var lastOplogEntry = self._oplogLastEntryConnection.findOne(                                       // 172
      OPLOG_COLLECTION, {}, {sort: {$natural: -1}});                                                   // 173
                                                                                                       // 174
    var dbName = self._dbNameFuture.wait();                                                            // 175
                                                                                                       // 176
    var oplogSelector = _.clone(self._baseOplogSelector());                                            // 177
    if (lastOplogEntry) {                                                                              // 178
      // Start after the last entry that currently exists.                                             // 179
      oplogSelector.ts = {$gt: lastOplogEntry.ts};                                                     // 180
      // If there are any calls to callWhenProcessedLatest before any other                            // 181
      // oplog entries show up, allow callWhenProcessedLatest to call its                              // 182
      // callback immediately.                                                                         // 183
      self._lastProcessedTS = lastOplogEntry.ts;                                                       // 184
    }                                                                                                  // 185
                                                                                                       // 186
    var cursorDescription = new CursorDescription(                                                     // 187
      OPLOG_COLLECTION, oplogSelector, {tailable: true});                                              // 188
                                                                                                       // 189
    self._tailHandle = self._oplogTailConnection.tail(                                                 // 190
      cursorDescription, function (doc) {                                                              // 191
        if (!(doc.ns && doc.ns.length > dbName.length + 1 &&                                           // 192
              doc.ns.substr(0, dbName.length + 1) === (dbName + '.')))                                 // 193
          throw new Error("Unexpected ns");                                                            // 194
                                                                                                       // 195
        var trigger = {collection: doc.ns.substr(dbName.length + 1),                                   // 196
                       dropCollection: false,                                                          // 197
                       op: doc};                                                                       // 198
                                                                                                       // 199
        // Is it a special command and the collection name is hidden somewhere                         // 200
        // in operator?                                                                                // 201
        if (trigger.collection === "$cmd") {                                                           // 202
          trigger.collection = doc.o.drop;                                                             // 203
          trigger.dropCollection = true;                                                               // 204
          trigger.id = null;                                                                           // 205
        } else {                                                                                       // 206
          // All other ops have an id.                                                                 // 207
          trigger.id = idForOp(doc);                                                                   // 208
        }                                                                                              // 209
                                                                                                       // 210
        var f = new Future;                                                                            // 211
        self._crossbar.fire(trigger, f.resolver());                                                    // 212
        f.wait();                                                                                      // 213
                                                                                                       // 214
        // Now that we've processed this operation, process pending sequencers.                        // 215
        if (!doc.ts)                                                                                   // 216
          throw Error("oplog entry without ts: " + EJSON.stringify(doc));                              // 217
        self._lastProcessedTS = doc.ts;                                                                // 218
        while (!_.isEmpty(self._catchingUpFutures)                                                     // 219
               && self._catchingUpFutures[0].ts.lessThanOrEqual(                                       // 220
                 self._lastProcessedTS)) {                                                             // 221
          var sequencer = self._catchingUpFutures.shift();                                             // 222
          sequencer.future.return();                                                                   // 223
        }                                                                                              // 224
      });                                                                                              // 225
    self._readyFuture.return();                                                                        // 226
  }                                                                                                    // 227
});                                                                                                    // 228
                                                                                                       // 229
/////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

/////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                     //
// packages/mongo-livedata/observe_multiplex.js                                                        //
//                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                       //
var Future = Npm.require('fibers/future');                                                             // 1
                                                                                                       // 2
ObserveMultiplexer = function (options) {                                                              // 3
  var self = this;                                                                                     // 4
                                                                                                       // 5
  if (!options || !_.has(options, 'ordered'))                                                          // 6
    throw Error("must specified ordered");                                                             // 7
                                                                                                       // 8
  Package.facts && Package.facts.Facts.incrementServerFact(                                            // 9
    "mongo-livedata", "observe-multiplexers", 1);                                                      // 10
                                                                                                       // 11
  self._ordered = options.ordered;                                                                     // 12
  self._onStop = options.onStop || function () {};                                                     // 13
  self._queue = new Meteor._SynchronousQueue();                                                        // 14
  self._handles = {};                                                                                  // 15
  self._readyFuture = new Future;                                                                      // 16
  self._cache = new LocalCollection._CachingChangeObserver({                                           // 17
    ordered: options.ordered});                                                                        // 18
  // Number of addHandleAndSendInitialAdds tasks scheduled but not yet                                 // 19
  // running. removeHandle uses this to know if it's time to call the onStop                           // 20
  // callback.                                                                                         // 21
  self._addHandleTasksScheduledButNotPerformed = 0;                                                    // 22
                                                                                                       // 23
  _.each(self.callbackNames(), function (callbackName) {                                               // 24
    self[callbackName] = function (/* ... */) {                                                        // 25
      self._applyCallback(callbackName, _.toArray(arguments));                                         // 26
    };                                                                                                 // 27
  });                                                                                                  // 28
};                                                                                                     // 29
                                                                                                       // 30
_.extend(ObserveMultiplexer.prototype, {                                                               // 31
  addHandleAndSendInitialAdds: function (handle) {                                                     // 32
    var self = this;                                                                                   // 33
                                                                                                       // 34
    // Check this before calling runTask (even though runTask does the same                            // 35
    // check) so that we don't leak an ObserveMultiplexer on error by                                  // 36
    // incrementing _addHandleTasksScheduledButNotPerformed and never                                  // 37
    // decrementing it.                                                                                // 38
    if (!self._queue.safeToRunTask())                                                                  // 39
      throw new Error(                                                                                 // 40
        "Can't call observeChanges from an observe callback on the same query");                       // 41
    ++self._addHandleTasksScheduledButNotPerformed;                                                    // 42
                                                                                                       // 43
    Package.facts && Package.facts.Facts.incrementServerFact(                                          // 44
      "mongo-livedata", "observe-handles", 1);                                                         // 45
                                                                                                       // 46
    self._queue.runTask(function () {                                                                  // 47
      self._handles[handle._id] = handle;                                                              // 48
      // Send out whatever adds we have so far (whether or not we the                                  // 49
      // multiplexer is ready).                                                                        // 50
      self._sendAdds(handle);                                                                          // 51
      --self._addHandleTasksScheduledButNotPerformed;                                                  // 52
    });                                                                                                // 53
    // *outside* the task, since otherwise we'd deadlock                                               // 54
    self._readyFuture.wait();                                                                          // 55
  },                                                                                                   // 56
                                                                                                       // 57
  // Remove an observe handle. If it was the last observe handle, call the                             // 58
  // onStop callback; you cannot add any more observe handles after this.                              // 59
  //                                                                                                   // 60
  // This is not synchronized with polls and handle additions: this means that                         // 61
  // you can safely call it from within an observe callback, but it also means                         // 62
  // that we have to be careful when we iterate over _handles.                                         // 63
  removeHandle: function (id) {                                                                        // 64
    var self = this;                                                                                   // 65
                                                                                                       // 66
    // This should not be possible: you can only call removeHandle by having                           // 67
    // access to the ObserveHandle, which isn't returned to user code until the                        // 68
    // multiplex is ready.                                                                             // 69
    if (!self._ready())                                                                                // 70
      throw new Error("Can't remove handles until the multiplex is ready");                            // 71
                                                                                                       // 72
    delete self._handles[id];                                                                          // 73
                                                                                                       // 74
    Package.facts && Package.facts.Facts.incrementServerFact(                                          // 75
      "mongo-livedata", "observe-handles", -1);                                                        // 76
                                                                                                       // 77
    if (_.isEmpty(self._handles) &&                                                                    // 78
        self._addHandleTasksScheduledButNotPerformed === 0) {                                          // 79
      self._stop();                                                                                    // 80
    }                                                                                                  // 81
  },                                                                                                   // 82
  _stop: function () {                                                                                 // 83
    var self = this;                                                                                   // 84
    // It shouldn't be possible for us to stop when all our handles still                              // 85
    // haven't been returned from observeChanges!                                                      // 86
    if (!self._ready())                                                                                // 87
      throw Error("surprising _stop: not ready");                                                      // 88
                                                                                                       // 89
    // Call stop callback (which kills the underlying process which sends us                           // 90
    // callbacks and removes us from the connection's dictionary).                                     // 91
    self._onStop();                                                                                    // 92
    Package.facts && Package.facts.Facts.incrementServerFact(                                          // 93
      "mongo-livedata", "observe-multiplexers", -1);                                                   // 94
                                                                                                       // 95
    // Cause future addHandleAndSendInitialAdds calls to throw (but the onStop                         // 96
    // callback should make our connection forget about us).                                           // 97
    self._handles = null;                                                                              // 98
  },                                                                                                   // 99
  // Allows all addHandleAndSendInitialAdds calls to return, once all preceding                        // 100
  // adds have been processed. Does not block.                                                         // 101
  ready: function () {                                                                                 // 102
    var self = this;                                                                                   // 103
    self._queue.queueTask(function () {                                                                // 104
      if (self._ready())                                                                               // 105
        throw Error("can't make ObserveMultiplex ready twice!");                                       // 106
      self._readyFuture.return();                                                                      // 107
    });                                                                                                // 108
  },                                                                                                   // 109
  // Calls "cb" once the effects of all "ready", "addHandleAndSendInitialAdds"                         // 110
  // and observe callbacks which came before this call have been propagated to                         // 111
  // all handles. "ready" must have already been called on this multiplexer.                           // 112
  onFlush: function (cb) {                                                                             // 113
    var self = this;                                                                                   // 114
    self._queue.queueTask(function () {                                                                // 115
      if (!self._ready())                                                                              // 116
        throw Error("only call onFlush on a multiplexer that will be ready");                          // 117
      cb();                                                                                            // 118
    });                                                                                                // 119
  },                                                                                                   // 120
  callbackNames: function () {                                                                         // 121
    var self = this;                                                                                   // 122
    if (self._ordered)                                                                                 // 123
      return ["addedBefore", "changed", "movedBefore", "removed"];                                     // 124
    else                                                                                               // 125
      return ["added", "changed", "removed"];                                                          // 126
  },                                                                                                   // 127
  _ready: function () {                                                                                // 128
    return this._readyFuture.isResolved();                                                             // 129
  },                                                                                                   // 130
  _applyCallback: function (callbackName, args) {                                                      // 131
    var self = this;                                                                                   // 132
    self._queue.queueTask(function () {                                                                // 133
      // First, apply the change to the cache.                                                         // 134
      // XXX We could make applyChange callbacks promise not to hang on to any                         // 135
      // state from their arguments (assuming that their supplied callbacks                            // 136
      // don't) and skip this clone. Currently 'changed' hangs on to state                             // 137
      // though.                                                                                       // 138
      self._cache.applyChange[callbackName].apply(null, EJSON.clone(args));                            // 139
                                                                                                       // 140
      // If we haven't finished the initial adds, then we should only be getting                       // 141
      // adds.                                                                                         // 142
      if (!self._ready() &&                                                                            // 143
          (callbackName !== 'added' && callbackName !== 'addedBefore')) {                              // 144
        throw new Error("Got " + callbackName + " during initial adds");                               // 145
      }                                                                                                // 146
                                                                                                       // 147
      // Now multiplex the callbacks out to all observe handles. It's OK if                            // 148
      // these calls yield; since we're inside a task, no other use of our queue                       // 149
      // can continue until these are done. (But we do have to be careful to not                       // 150
      // use a handle that got removed, because removeHandle does not use the                          // 151
      // queue; thus, we iterate over an array of keys that we control.)                               // 152
      _.each(_.keys(self._handles), function (handleId) {                                              // 153
        var handle = self._handles[handleId];                                                          // 154
        if (!handle)                                                                                   // 155
          return;                                                                                      // 156
        var callback = handle['_' + callbackName];                                                     // 157
        // clone arguments so that callbacks can mutate their arguments                                // 158
        callback && callback.apply(null, EJSON.clone(args));                                           // 159
      });                                                                                              // 160
    });                                                                                                // 161
  },                                                                                                   // 162
                                                                                                       // 163
  // Sends initial adds to a handle. It should only be called from within a task                       // 164
  // (the task that is processing the addHandleAndSendInitialAdds call). It                            // 165
  // synchronously invokes the handle's added or addedBefore; there's no need to                       // 166
  // flush the queue afterwards to ensure that the callbacks get out.                                  // 167
  _sendAdds: function (handle) {                                                                       // 168
    var self = this;                                                                                   // 169
    if (self._queue.safeToRunTask())                                                                   // 170
      throw Error("_sendAdds may only be called from within a task!");                                 // 171
    var add = self._ordered ? handle._addedBefore : handle._added;                                     // 172
    if (!add)                                                                                          // 173
      return;                                                                                          // 174
    // note: docs may be an _IdMap or an OrderedDict                                                   // 175
    self._cache.docs.forEach(function (doc, id) {                                                      // 176
      if (!_.has(self._handles, handle._id))                                                           // 177
        throw Error("handle got removed before sending initial adds!");                                // 178
      var fields = EJSON.clone(doc);                                                                   // 179
      delete fields._id;                                                                               // 180
      if (self._ordered)                                                                               // 181
        add(id, fields, null); // we're going in order, so add at end                                  // 182
      else                                                                                             // 183
        add(id, fields);                                                                               // 184
    });                                                                                                // 185
  }                                                                                                    // 186
});                                                                                                    // 187
                                                                                                       // 188
                                                                                                       // 189
var nextObserveHandleId = 1;                                                                           // 190
ObserveHandle = function (multiplexer, callbacks) {                                                    // 191
  var self = this;                                                                                     // 192
  // The end user is only supposed to call stop().  The other fields are                               // 193
  // accessible to the multiplexer, though.                                                            // 194
  self._multiplexer = multiplexer;                                                                     // 195
  _.each(multiplexer.callbackNames(), function (name) {                                                // 196
    if (callbacks[name]) {                                                                             // 197
      self['_' + name] = callbacks[name];                                                              // 198
    } else if (name === "addedBefore" && callbacks.added) {                                            // 199
      // Special case: if you specify "added" and "movedBefore", you get an                            // 200
      // ordered observe where for some reason you don't get ordering data on                          // 201
      // the adds.  I dunno, we wrote tests for it, there must have been a                             // 202
      // reason.                                                                                       // 203
      self._addedBefore = function (id, fields, before) {                                              // 204
        callbacks.added(id, fields);                                                                   // 205
      };                                                                                               // 206
    }                                                                                                  // 207
  });                                                                                                  // 208
  self._stopped = false;                                                                               // 209
  self._id = nextObserveHandleId++;                                                                    // 210
};                                                                                                     // 211
ObserveHandle.prototype.stop = function () {                                                           // 212
  var self = this;                                                                                     // 213
  if (self._stopped)                                                                                   // 214
    return;                                                                                            // 215
  self._stopped = true;                                                                                // 216
  self._multiplexer.removeHandle(self._id);                                                            // 217
};                                                                                                     // 218
                                                                                                       // 219
/////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

/////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                     //
// packages/mongo-livedata/doc_fetcher.js                                                              //
//                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                       //
var Fiber = Npm.require('fibers');                                                                     // 1
var Future = Npm.require('fibers/future');                                                             // 2
                                                                                                       // 3
DocFetcher = function (mongoConnection) {                                                              // 4
  var self = this;                                                                                     // 5
  self._mongoConnection = mongoConnection;                                                             // 6
  // Map from cache key -> [callback]                                                                  // 7
  self._callbacksForCacheKey = {};                                                                     // 8
};                                                                                                     // 9
                                                                                                       // 10
_.extend(DocFetcher.prototype, {                                                                       // 11
  // Fetches document "id" from collectionName, returning it or null if not                            // 12
  // found.                                                                                            // 13
  //                                                                                                   // 14
  // If you make multiple calls to fetch() with the same cacheKey (a string),                          // 15
  // DocFetcher may assume that they all return the same document. (It does                            // 16
  // not check to see if collectionName/id match.)                                                     // 17
  //                                                                                                   // 18
  // You may assume that callback is never called synchronously (and in fact                           // 19
  // OplogObserveDriver does so).                                                                      // 20
  fetch: function (collectionName, id, cacheKey, callback) {                                           // 21
    var self = this;                                                                                   // 22
                                                                                                       // 23
    check(collectionName, String);                                                                     // 24
    // id is some sort of scalar                                                                       // 25
    check(cacheKey, String);                                                                           // 26
                                                                                                       // 27
    // If there's already an in-progress fetch for this cache key, yield until                         // 28
    // it's done and return whatever it returns.                                                       // 29
    if (_.has(self._callbacksForCacheKey, cacheKey)) {                                                 // 30
      self._callbacksForCacheKey[cacheKey].push(callback);                                             // 31
      return;                                                                                          // 32
    }                                                                                                  // 33
                                                                                                       // 34
    var callbacks = self._callbacksForCacheKey[cacheKey] = [callback];                                 // 35
                                                                                                       // 36
    Fiber(function () {                                                                                // 37
      try {                                                                                            // 38
        var doc = self._mongoConnection.findOne(                                                       // 39
          collectionName, {_id: id}) || null;                                                          // 40
        // Return doc to all relevant callbacks. Note that this array can                              // 41
        // continue to grow during callback excecution.                                                // 42
        while (!_.isEmpty(callbacks)) {                                                                // 43
          // Clone the document so that the various calls to fetch don't return                        // 44
          // objects that are intertwingled with each other. Clone before                              // 45
          // popping the future, so that if clone throws, the error gets passed                        // 46
          // to the next callback.                                                                     // 47
          var clonedDoc = EJSON.clone(doc);                                                            // 48
          callbacks.pop()(null, clonedDoc);                                                            // 49
        }                                                                                              // 50
      } catch (e) {                                                                                    // 51
        while (!_.isEmpty(callbacks)) {                                                                // 52
          callbacks.pop()(e);                                                                          // 53
        }                                                                                              // 54
      } finally {                                                                                      // 55
        // XXX consider keeping the doc around for a period of time before                             // 56
        // removing from the cache                                                                     // 57
        delete self._callbacksForCacheKey[cacheKey];                                                   // 58
      }                                                                                                // 59
    }).run();                                                                                          // 60
  }                                                                                                    // 61
});                                                                                                    // 62
                                                                                                       // 63
MongoTest.DocFetcher = DocFetcher;                                                                     // 64
                                                                                                       // 65
/////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

/////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                     //
// packages/mongo-livedata/polling_observe_driver.js                                                   //
//                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                       //
PollingObserveDriver = function (options) {                                                            // 1
  var self = this;                                                                                     // 2
                                                                                                       // 3
  self._cursorDescription = options.cursorDescription;                                                 // 4
  self._mongoHandle = options.mongoHandle;                                                             // 5
  self._ordered = options.ordered;                                                                     // 6
  self._multiplexer = options.multiplexer;                                                             // 7
  self._stopCallbacks = [];                                                                            // 8
  self._stopped = false;                                                                               // 9
                                                                                                       // 10
  self._synchronousCursor = self._mongoHandle._createSynchronousCursor(                                // 11
    self._cursorDescription);                                                                          // 12
                                                                                                       // 13
  // previous results snapshot.  on each poll cycle, diffs against                                     // 14
  // results drives the callbacks.                                                                     // 15
  self._results = null;                                                                                // 16
                                                                                                       // 17
  // The number of _pollMongo calls that have been added to self._taskQueue but                        // 18
  // have not started running. Used to make sure we never schedule more than one                       // 19
  // _pollMongo (other than possibly the one that is currently running). It's                          // 20
  // also used by _suspendPolling to pretend there's a poll scheduled. Usually,                        // 21
  // it's either 0 (for "no polls scheduled other than maybe one currently                             // 22
  // running") or 1 (for "a poll scheduled that isn't running yet"), but it can                        // 23
  // also be 2 if incremented by _suspendPolling.                                                      // 24
  self._pollsScheduledButNotStarted = 0;                                                               // 25
  self._pendingWrites = []; // people to notify when polling completes                                 // 26
                                                                                                       // 27
  // Make sure to create a separately throttled function for each                                      // 28
  // PollingObserveDriver object.                                                                      // 29
  self._ensurePollIsScheduled = _.throttle(                                                            // 30
    self._unthrottledEnsurePollIsScheduled, 50 /* ms */);                                              // 31
                                                                                                       // 32
  // XXX figure out if we still need a queue                                                           // 33
  self._taskQueue = new Meteor._SynchronousQueue();                                                    // 34
                                                                                                       // 35
  var listenersHandle = listenAll(                                                                     // 36
    self._cursorDescription, function (notification, complete) {                                       // 37
      // When someone does a transaction that might affect us, schedule a poll                         // 38
      // of the database. If that transaction happens inside of a write fence,                         // 39
      // block the fence until we've polled and notified observers.                                    // 40
      var fence = DDPServer._CurrentWriteFence.get();                                                  // 41
      if (fence)                                                                                       // 42
        self._pendingWrites.push(fence.beginWrite());                                                  // 43
      // Ensure a poll is scheduled... but if we already know that one is,                             // 44
      // don't hit the throttled _ensurePollIsScheduled function (which might                          // 45
      // lead to us calling it unnecessarily in 50ms).                                                 // 46
      if (self._pollsScheduledButNotStarted === 0)                                                     // 47
        self._ensurePollIsScheduled();                                                                 // 48
      complete();                                                                                      // 49
    }                                                                                                  // 50
  );                                                                                                   // 51
  self._stopCallbacks.push(function () { listenersHandle.stop(); });                                   // 52
                                                                                                       // 53
  // every once and a while, poll even if we don't think we're dirty, for                              // 54
  // eventual consistency with database writes from outside the Meteor                                 // 55
  // universe.                                                                                         // 56
  //                                                                                                   // 57
  // For testing, there's an undocumented callback argument to observeChanges                          // 58
  // which disables time-based polling and gets called at the beginning of each                        // 59
  // poll.                                                                                             // 60
  if (options._testOnlyPollCallback) {                                                                 // 61
    self._testOnlyPollCallback = options._testOnlyPollCallback;                                        // 62
  } else {                                                                                             // 63
    var intervalHandle = Meteor.setInterval(                                                           // 64
      _.bind(self._ensurePollIsScheduled, self), 10 * 1000);                                           // 65
    self._stopCallbacks.push(function () {                                                             // 66
      Meteor.clearInterval(intervalHandle);                                                            // 67
    });                                                                                                // 68
  }                                                                                                    // 69
                                                                                                       // 70
  // Make sure we actually poll soon!                                                                  // 71
  self._unthrottledEnsurePollIsScheduled();                                                            // 72
                                                                                                       // 73
  Package.facts && Package.facts.Facts.incrementServerFact(                                            // 74
    "mongo-livedata", "observe-drivers-polling", 1);                                                   // 75
};                                                                                                     // 76
                                                                                                       // 77
_.extend(PollingObserveDriver.prototype, {                                                             // 78
  // This is always called through _.throttle (except once at startup).                                // 79
  _unthrottledEnsurePollIsScheduled: function () {                                                     // 80
    var self = this;                                                                                   // 81
    if (self._pollsScheduledButNotStarted > 0)                                                         // 82
      return;                                                                                          // 83
    ++self._pollsScheduledButNotStarted;                                                               // 84
    self._taskQueue.queueTask(function () {                                                            // 85
      self._pollMongo();                                                                               // 86
    });                                                                                                // 87
  },                                                                                                   // 88
                                                                                                       // 89
  // test-only interface for controlling polling.                                                      // 90
  //                                                                                                   // 91
  // _suspendPolling blocks until any currently running and scheduled polls are                        // 92
  // done, and prevents any further polls from being scheduled. (new                                   // 93
  // ObserveHandles can be added and receive their initial added callbacks,                            // 94
  // though.)                                                                                          // 95
  //                                                                                                   // 96
  // _resumePolling immediately polls, and allows further polls to occur.                              // 97
  _suspendPolling: function() {                                                                        // 98
    var self = this;                                                                                   // 99
    // Pretend that there's another poll scheduled (which will prevent                                 // 100
    // _ensurePollIsScheduled from queueing any more polls).                                           // 101
    ++self._pollsScheduledButNotStarted;                                                               // 102
    // Now block until all currently running or scheduled polls are done.                              // 103
    self._taskQueue.runTask(function() {});                                                            // 104
                                                                                                       // 105
    // Confirm that there is only one "poll" (the fake one we're pretending to                         // 106
    // have) scheduled.                                                                                // 107
    if (self._pollsScheduledButNotStarted !== 1)                                                       // 108
      throw new Error("_pollsScheduledButNotStarted is " +                                             // 109
                      self._pollsScheduledButNotStarted);                                              // 110
  },                                                                                                   // 111
  _resumePolling: function() {                                                                         // 112
    var self = this;                                                                                   // 113
    // We should be in the same state as in the end of _suspendPolling.                                // 114
    if (self._pollsScheduledButNotStarted !== 1)                                                       // 115
      throw new Error("_pollsScheduledButNotStarted is " +                                             // 116
                      self._pollsScheduledButNotStarted);                                              // 117
    // Run a poll synchronously (which will counteract the                                             // 118
    // ++_pollsScheduledButNotStarted from _suspendPolling).                                           // 119
    self._taskQueue.runTask(function () {                                                              // 120
      self._pollMongo();                                                                               // 121
    });                                                                                                // 122
  },                                                                                                   // 123
                                                                                                       // 124
  _pollMongo: function () {                                                                            // 125
    var self = this;                                                                                   // 126
    --self._pollsScheduledButNotStarted;                                                               // 127
                                                                                                       // 128
    var first = false;                                                                                 // 129
    if (!self._results) {                                                                              // 130
      first = true;                                                                                    // 131
      // XXX maybe use _IdMap/OrderedDict instead?                                                     // 132
      self._results = self._ordered ? [] : {};                                                         // 133
    }                                                                                                  // 134
                                                                                                       // 135
    self._testOnlyPollCallback && self._testOnlyPollCallback();                                        // 136
                                                                                                       // 137
    // Save the list of pending writes which this round will commit.                                   // 138
    var writesForCycle = self._pendingWrites;                                                          // 139
    self._pendingWrites = [];                                                                          // 140
                                                                                                       // 141
    // Get the new query results. (These calls can yield.)                                             // 142
    if (!first)                                                                                        // 143
      self._synchronousCursor.rewind();                                                                // 144
    var newResults = self._synchronousCursor.getRawObjects(self._ordered);                             // 145
    var oldResults = self._results;                                                                    // 146
                                                                                                       // 147
    // Run diffs. (This can yield too.)                                                                // 148
    if (!self._stopped) {                                                                              // 149
      LocalCollection._diffQueryChanges(                                                               // 150
        self._ordered, oldResults, newResults, self._multiplexer);                                     // 151
    }                                                                                                  // 152
                                                                                                       // 153
    // Replace self._results atomically.                                                               // 154
    self._results = newResults;                                                                        // 155
                                                                                                       // 156
    // Signals the multiplexer to call all initial adds.                                               // 157
    if (first)                                                                                         // 158
      self._multiplexer.ready();                                                                       // 159
                                                                                                       // 160
    // Once the ObserveMultiplexer has processed everything we've done in this                         // 161
    // round, mark all the writes which existed before this call as                                    // 162
    // commmitted. (If new writes have shown up in the meantime, there'll                              // 163
    // already be another _pollMongo task scheduled.)                                                  // 164
    self._multiplexer.onFlush(function () {                                                            // 165
      _.each(writesForCycle, function (w) {                                                            // 166
        w.committed();                                                                                 // 167
      });                                                                                              // 168
    });                                                                                                // 169
  },                                                                                                   // 170
                                                                                                       // 171
  stop: function () {                                                                                  // 172
    var self = this;                                                                                   // 173
    self._stopped = true;                                                                              // 174
    _.each(self._stopCallbacks, function (c) { c(); });                                                // 175
    Package.facts && Package.facts.Facts.incrementServerFact(                                          // 176
      "mongo-livedata", "observe-drivers-polling", -1);                                                // 177
  }                                                                                                    // 178
});                                                                                                    // 179
                                                                                                       // 180
/////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

/////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                     //
// packages/mongo-livedata/oplog_observe_driver.js                                                     //
//                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                       //
var Fiber = Npm.require('fibers');                                                                     // 1
var Future = Npm.require('fibers/future');                                                             // 2
                                                                                                       // 3
var PHASE = {                                                                                          // 4
  QUERYING: 1,                                                                                         // 5
  FETCHING: 2,                                                                                         // 6
  STEADY: 3                                                                                            // 7
};                                                                                                     // 8
                                                                                                       // 9
// OplogObserveDriver is an alternative to PollingObserveDriver which follows                          // 10
// the Mongo operation log instead of just re-polling the query. It obeys the                          // 11
// same simple interface: constructing it starts sending observeChanges                                // 12
// callbacks (and a ready() invocation) to the ObserveMultiplexer, and you stop                        // 13
// it by calling the stop() method.                                                                    // 14
OplogObserveDriver = function (options) {                                                              // 15
  var self = this;                                                                                     // 16
  self._usesOplog = true;  // tests look at this                                                       // 17
                                                                                                       // 18
  self._cursorDescription = options.cursorDescription;                                                 // 19
  self._mongoHandle = options.mongoHandle;                                                             // 20
  self._multiplexer = options.multiplexer;                                                             // 21
  if (options.ordered)                                                                                 // 22
    throw Error("OplogObserveDriver only supports unordered observeChanges");                          // 23
                                                                                                       // 24
  self._stopped = false;                                                                               // 25
  self._stopHandles = [];                                                                              // 26
                                                                                                       // 27
  Package.facts && Package.facts.Facts.incrementServerFact(                                            // 28
    "mongo-livedata", "observe-drivers-oplog", 1);                                                     // 29
                                                                                                       // 30
  self._phase = PHASE.QUERYING;                                                                        // 31
                                                                                                       // 32
  self._published = new LocalCollection._IdMap;                                                        // 33
  var selector = self._cursorDescription.selector;                                                     // 34
  self._selectorFn = LocalCollection._compileSelector(                                                 // 35
    self._cursorDescription.selector);                                                                 // 36
  var projection = self._cursorDescription.options.fields || {};                                       // 37
  self._projectionFn = LocalCollection._compileProjection(projection);                                 // 38
  // Projection function, result of combining important fields for selector and                        // 39
  // existing fields projection                                                                        // 40
  self._sharedProjection = LocalCollection._combineSelectorAndProjection(                              // 41
    selector, projection);                                                                             // 42
  self._sharedProjectionFn = LocalCollection._compileProjection(                                       // 43
    self._sharedProjection);                                                                           // 44
                                                                                                       // 45
  self._needToFetch = new LocalCollection._IdMap;                                                      // 46
  self._currentlyFetching = null;                                                                      // 47
  self._fetchGeneration = 0;                                                                           // 48
                                                                                                       // 49
  self._requeryWhenDoneThisQuery = false;                                                              // 50
  self._writesToCommitWhenWeReachSteady = [];                                                          // 51
                                                                                                       // 52
  forEachTrigger(self._cursorDescription, function (trigger) {                                         // 53
    self._stopHandles.push(self._mongoHandle._oplogHandle.onOplogEntry(                                // 54
      trigger, function (notification) {                                                               // 55
        var op = notification.op;                                                                      // 56
        if (notification.dropCollection) {                                                             // 57
          // Note: this call is not allowed to block on anything (especially on                        // 58
          // waiting for oplog entries to catch up) because that will block                            // 59
          // onOplogEntry!                                                                             // 60
          self._needToPollQuery();                                                                     // 61
        } else {                                                                                       // 62
          // All other operators should be handled depending on phase                                  // 63
          if (self._phase === PHASE.QUERYING)                                                          // 64
            self._handleOplogEntryQuerying(op);                                                        // 65
          else                                                                                         // 66
            self._handleOplogEntrySteadyOrFetching(op);                                                // 67
        }                                                                                              // 68
      }                                                                                                // 69
    ));                                                                                                // 70
  });                                                                                                  // 71
                                                                                                       // 72
  // XXX ordering w.r.t. everything else?                                                              // 73
  self._stopHandles.push(listenAll(                                                                    // 74
    self._cursorDescription, function (notification, complete) {                                       // 75
      // If we're not in a write fence, we don't have to do anything.                                  // 76
      var fence = DDPServer._CurrentWriteFence.get();                                                  // 77
      if (!fence) {                                                                                    // 78
        complete();                                                                                    // 79
        return;                                                                                        // 80
      }                                                                                                // 81
      var write = fence.beginWrite();                                                                  // 82
      // This write cannot complete until we've caught up to "this point" in the                       // 83
      // oplog, and then made it back to the steady state.                                             // 84
      Meteor.defer(function () {                                                                       // 85
        self._mongoHandle._oplogHandle.waitUntilCaughtUp();                                            // 86
        if (self._stopped) {                                                                           // 87
          // We're stopped, so just immediately commit.                                                // 88
          write.committed();                                                                           // 89
        } else if (self._phase === PHASE.STEADY) {                                                     // 90
          // Make sure that all of the callbacks have made it through the                              // 91
          // multiplexer and been delivered to ObserveHandles before committing                        // 92
          // writes.                                                                                   // 93
          self._multiplexer.onFlush(function () {                                                      // 94
            write.committed();                                                                         // 95
          });                                                                                          // 96
        } else {                                                                                       // 97
          self._writesToCommitWhenWeReachSteady.push(write);                                           // 98
        }                                                                                              // 99
      });                                                                                              // 100
      complete();                                                                                      // 101
    }                                                                                                  // 102
  ));                                                                                                  // 103
                                                                                                       // 104
  // Give _observeChanges a chance to add the new ObserveHandle to our                                 // 105
  // multiplexer, so that the added calls get streamed.                                                // 106
  Meteor.defer(function () {                                                                           // 107
    self._runInitialQuery();                                                                           // 108
  });                                                                                                  // 109
};                                                                                                     // 110
                                                                                                       // 111
_.extend(OplogObserveDriver.prototype, {                                                               // 112
  _add: function (doc) {                                                                               // 113
    var self = this;                                                                                   // 114
    var id = doc._id;                                                                                  // 115
    var fields = _.clone(doc);                                                                         // 116
    delete fields._id;                                                                                 // 117
    if (self._published.has(id))                                                                       // 118
      throw Error("tried to add something already published " + id);                                   // 119
    self._published.set(id, self._sharedProjectionFn(fields));                                         // 120
    self._multiplexer.added(id, self._projectionFn(fields));                                           // 121
  },                                                                                                   // 122
  _remove: function (id) {                                                                             // 123
    var self = this;                                                                                   // 124
    if (!self._published.has(id))                                                                      // 125
      throw Error("tried to remove something unpublished " + id);                                      // 126
    self._published.remove(id);                                                                        // 127
    self._multiplexer.removed(id);                                                                     // 128
  },                                                                                                   // 129
  _handleDoc: function (id, newDoc, mustMatchNow) {                                                    // 130
    var self = this;                                                                                   // 131
    newDoc = _.clone(newDoc);                                                                          // 132
                                                                                                       // 133
    var matchesNow = newDoc && self._selectorFn(newDoc);                                               // 134
    if (mustMatchNow && !matchesNow) {                                                                 // 135
      throw Error("expected " + EJSON.stringify(newDoc) + " to match "                                 // 136
                  + EJSON.stringify(self._cursorDescription));                                         // 137
    }                                                                                                  // 138
                                                                                                       // 139
    var matchedBefore = self._published.has(id);                                                       // 140
                                                                                                       // 141
    if (matchesNow && !matchedBefore) {                                                                // 142
      self._add(newDoc);                                                                               // 143
    } else if (matchedBefore && !matchesNow) {                                                         // 144
      self._remove(id);                                                                                // 145
    } else if (matchesNow) {                                                                           // 146
      var oldDoc = self._published.get(id);                                                            // 147
      if (!oldDoc)                                                                                     // 148
        throw Error("thought that " + id + " was there!");                                             // 149
      delete newDoc._id;                                                                               // 150
      self._published.set(id, self._sharedProjectionFn(newDoc));                                       // 151
      var changed = LocalCollection._makeChangedFields(_.clone(newDoc), oldDoc);                       // 152
      changed = self._projectionFn(changed);                                                           // 153
      if (!_.isEmpty(changed))                                                                         // 154
        self._multiplexer.changed(id, changed);                                                        // 155
    }                                                                                                  // 156
  },                                                                                                   // 157
  _fetchModifiedDocuments: function () {                                                               // 158
    var self = this;                                                                                   // 159
    self._phase = PHASE.FETCHING;                                                                      // 160
    while (!self._stopped && !self._needToFetch.empty()) {                                             // 161
      if (self._phase !== PHASE.FETCHING)                                                              // 162
        throw new Error("phase in fetchModifiedDocuments: " + self._phase);                            // 163
                                                                                                       // 164
      self._currentlyFetching = self._needToFetch;                                                     // 165
      var thisGeneration = ++self._fetchGeneration;                                                    // 166
      self._needToFetch = new LocalCollection._IdMap;                                                  // 167
      var waiting = 0;                                                                                 // 168
      var anyError = null;                                                                             // 169
      var fut = new Future;                                                                            // 170
      // This loop is safe, because _currentlyFetching will not be updated                             // 171
      // during this loop (in fact, it is never mutated).                                              // 172
      self._currentlyFetching.forEach(function (cacheKey, id) {                                        // 173
        waiting++;                                                                                     // 174
        self._mongoHandle._docFetcher.fetch(                                                           // 175
          self._cursorDescription.collectionName, id, cacheKey,                                        // 176
          function (err, doc) {                                                                        // 177
            if (err) {                                                                                 // 178
              if (!anyError)                                                                           // 179
                anyError = err;                                                                        // 180
            } else if (!self._stopped && self._phase === PHASE.FETCHING                                // 181
                       && self._fetchGeneration === thisGeneration) {                                  // 182
              // We re-check the generation in case we've had an explicit                              // 183
              // _pollQuery call which should effectively cancel this round of                         // 184
              // fetches.  (_pollQuery increments the generation.)                                     // 185
              self._handleDoc(id, doc);                                                                // 186
            }                                                                                          // 187
            waiting--;                                                                                 // 188
            // Because fetch() never calls its callback synchronously, this is                         // 189
            // safe (ie, we won't call fut.return() before the forEach is done).                       // 190
            if (waiting === 0)                                                                         // 191
              fut.return();                                                                            // 192
          });                                                                                          // 193
      });                                                                                              // 194
      fut.wait();                                                                                      // 195
      // XXX do this even if we've switched to PHASE.QUERYING?                                         // 196
      if (anyError)                                                                                    // 197
        throw anyError;                                                                                // 198
      // Exit now if we've had a _pollQuery call.                                                      // 199
      if (self._phase === PHASE.QUERYING)                                                              // 200
        return;                                                                                        // 201
      self._currentlyFetching = null;                                                                  // 202
    }                                                                                                  // 203
    self._beSteady();                                                                                  // 204
  },                                                                                                   // 205
  _beSteady: function () {                                                                             // 206
    var self = this;                                                                                   // 207
    self._phase = PHASE.STEADY;                                                                        // 208
    var writes = self._writesToCommitWhenWeReachSteady;                                                // 209
    self._writesToCommitWhenWeReachSteady = [];                                                        // 210
    self._multiplexer.onFlush(function () {                                                            // 211
      _.each(writes, function (w) {                                                                    // 212
        w.committed();                                                                                 // 213
      });                                                                                              // 214
    });                                                                                                // 215
  },                                                                                                   // 216
  _handleOplogEntryQuerying: function (op) {                                                           // 217
    var self = this;                                                                                   // 218
    self._needToFetch.set(idForOp(op), op.ts.toString());                                              // 219
  },                                                                                                   // 220
  _handleOplogEntrySteadyOrFetching: function (op) {                                                   // 221
    var self = this;                                                                                   // 222
    var id = idForOp(op);                                                                              // 223
    // If we're already fetching this one, or about to, we can't optimize; make                        // 224
    // sure that we fetch it again if necessary.                                                       // 225
    if (self._phase === PHASE.FETCHING &&                                                              // 226
        (self._currentlyFetching.has(id) || self._needToFetch.has(id))) {                              // 227
      self._needToFetch.set(id, op.ts.toString());                                                     // 228
      return;                                                                                          // 229
    }                                                                                                  // 230
                                                                                                       // 231
    if (op.op === 'd') {                                                                               // 232
      if (self._published.has(id))                                                                     // 233
        self._remove(id);                                                                              // 234
    } else if (op.op === 'i') {                                                                        // 235
      if (self._published.has(id))                                                                     // 236
        throw new Error("insert found for already-existing ID");                                       // 237
                                                                                                       // 238
      // XXX what if selector yields?  for now it can't but later it could have                        // 239
      // $where                                                                                        // 240
      if (self._selectorFn(op.o))                                                                      // 241
        self._add(op.o);                                                                               // 242
    } else if (op.op === 'u') {                                                                        // 243
      // Is this a modifier ($set/$unset, which may require us to poll the                             // 244
      // database to figure out if the whole document matches the selector) or a                       // 245
      // replacement (in which case we can just directly re-evaluate the                               // 246
      // selector)?                                                                                    // 247
      var isReplace = !_.has(op.o, '$set') && !_.has(op.o, '$unset');                                  // 248
      // If this modifier modifies something inside an EJSON custom type (ie,                          // 249
      // anything with EJSON$), then we can't try to use                                               // 250
      // LocalCollection._modify, since that just mutates the EJSON encoding,                          // 251
      // not the actual object.                                                                        // 252
      var canDirectlyModifyDoc =                                                                       // 253
            !isReplace && modifierCanBeDirectlyApplied(op.o);                                          // 254
                                                                                                       // 255
      if (isReplace) {                                                                                 // 256
        self._handleDoc(id, _.extend({_id: id}, op.o));                                                // 257
      } else if (self._published.has(id) && canDirectlyModifyDoc) {                                    // 258
        // Oh great, we actually know what the document is, so we can apply                            // 259
        // this directly.                                                                              // 260
        var newDoc = EJSON.clone(self._published.get(id));                                             // 261
        newDoc._id = id;                                                                               // 262
        LocalCollection._modify(newDoc, op.o);                                                         // 263
        self._handleDoc(id, self._sharedProjectionFn(newDoc));                                         // 264
      } else if (!canDirectlyModifyDoc ||                                                              // 265
                 LocalCollection._canSelectorBecomeTrueByModifier(                                     // 266
                   self._cursorDescription.selector, op.o)) {                                          // 267
        self._needToFetch.set(id, op.ts.toString());                                                   // 268
        if (self._phase === PHASE.STEADY)                                                              // 269
          self._fetchModifiedDocuments();                                                              // 270
      }                                                                                                // 271
    } else {                                                                                           // 272
      throw Error("XXX SURPRISING OPERATION: " + op);                                                  // 273
    }                                                                                                  // 274
  },                                                                                                   // 275
  _runInitialQuery: function () {                                                                      // 276
    var self = this;                                                                                   // 277
    if (self._stopped)                                                                                 // 278
      throw new Error("oplog stopped surprisingly early");                                             // 279
                                                                                                       // 280
    var initialCursor = self._cursorForQuery();                                                        // 281
    initialCursor.forEach(function (initialDoc) {                                                      // 282
      self._add(initialDoc);                                                                           // 283
    });                                                                                                // 284
    if (self._stopped)                                                                                 // 285
      throw new Error("oplog stopped quite early");                                                    // 286
    // Allow observeChanges calls to return. (After this, it's possible for                            // 287
    // stop() to be called.)                                                                           // 288
    self._multiplexer.ready();                                                                         // 289
                                                                                                       // 290
    self._doneQuerying();                                                                              // 291
  },                                                                                                   // 292
                                                                                                       // 293
  // In various circumstances, we may just want to stop processing the oplog and                       // 294
  // re-run the initial query, just as if we were a PollingObserveDriver.                              // 295
  //                                                                                                   // 296
  // This function may not block, because it is called from an oplog entry                             // 297
  // handler.                                                                                          // 298
  //                                                                                                   // 299
  // XXX We should call this when we detect that we've been in FETCHING for "too                       // 300
  // long".                                                                                            // 301
  //                                                                                                   // 302
  // XXX We should call this when we detect Mongo failover (since that might                           // 303
  // mean that some of the oplog entries we have processed have been rolled                            // 304
  // back). The Node Mongo driver is in the middle of a bunch of huge                                  // 305
  // refactorings, including the way that it notifies you when primary                                 // 306
  // changes. Will put off implementing this until driver 1.4 is out.                                  // 307
  _pollQuery: function () {                                                                            // 308
    var self = this;                                                                                   // 309
                                                                                                       // 310
    if (self._stopped)                                                                                 // 311
      return;                                                                                          // 312
                                                                                                       // 313
    // Yay, we get to forget about all the things we thought we had to fetch.                          // 314
    self._needToFetch = new LocalCollection._IdMap;                                                    // 315
    self._currentlyFetching = null;                                                                    // 316
    ++self._fetchGeneration;  // ignore any in-flight fetches                                          // 317
    self._phase = PHASE.QUERYING;                                                                      // 318
                                                                                                       // 319
    // Defer so that we don't block.                                                                   // 320
    Meteor.defer(function () {                                                                         // 321
      // subtle note: _published does not contain _id fields, but newResults                           // 322
      // does                                                                                          // 323
      var newResults = new LocalCollection._IdMap;                                                     // 324
      var cursor = self._cursorForQuery();                                                             // 325
      cursor.forEach(function (doc) {                                                                  // 326
        newResults.set(doc._id, doc);                                                                  // 327
      });                                                                                              // 328
                                                                                                       // 329
      self._publishNewResults(newResults);                                                             // 330
                                                                                                       // 331
      self._doneQuerying();                                                                            // 332
    });                                                                                                // 333
  },                                                                                                   // 334
                                                                                                       // 335
  // Transitions to QUERYING and runs another query, or (if already in QUERYING)                       // 336
  // ensures that we will query again later.                                                           // 337
  //                                                                                                   // 338
  // This function may not block, because it is called from an oplog entry                             // 339
  // handler.                                                                                          // 340
  _needToPollQuery: function () {                                                                      // 341
    var self = this;                                                                                   // 342
    if (self._stopped)                                                                                 // 343
      return;                                                                                          // 344
                                                                                                       // 345
    // If we're not already in the middle of a query, we can query now (possibly                       // 346
    // pausing FETCHING).                                                                              // 347
    if (self._phase !== PHASE.QUERYING) {                                                              // 348
      self._pollQuery();                                                                               // 349
      return;                                                                                          // 350
    }                                                                                                  // 351
                                                                                                       // 352
    // We're currently in QUERYING. Set a flag to ensure that we run another                           // 353
    // query when we're done.                                                                          // 354
    self._requeryWhenDoneThisQuery = true;                                                             // 355
  },                                                                                                   // 356
                                                                                                       // 357
  _doneQuerying: function () {                                                                         // 358
    var self = this;                                                                                   // 359
                                                                                                       // 360
    if (self._stopped)                                                                                 // 361
      return;                                                                                          // 362
    self._mongoHandle._oplogHandle.waitUntilCaughtUp();                                                // 363
                                                                                                       // 364
    if (self._stopped)                                                                                 // 365
      return;                                                                                          // 366
    if (self._phase !== PHASE.QUERYING)                                                                // 367
      throw Error("Phase unexpectedly " + self._phase);                                                // 368
                                                                                                       // 369
    if (self._requeryWhenDoneThisQuery) {                                                              // 370
      self._requeryWhenDoneThisQuery = false;                                                          // 371
      self._pollQuery();                                                                               // 372
    } else if (self._needToFetch.empty()) {                                                            // 373
      self._beSteady();                                                                                // 374
    } else {                                                                                           // 375
      self._fetchModifiedDocuments();                                                                  // 376
    }                                                                                                  // 377
  },                                                                                                   // 378
                                                                                                       // 379
  _cursorForQuery: function () {                                                                       // 380
    var self = this;                                                                                   // 381
                                                                                                       // 382
    // The query we run is almost the same as the cursor we are observing, with                        // 383
    // a few changes. We need to read all the fields that are relevant to the                          // 384
    // selector, not just the fields we are going to publish (that's the                               // 385
    // "shared" projection). And we don't want to apply any transform in the                           // 386
    // cursor, because observeChanges shouldn't use the transform.                                     // 387
    var options = _.clone(self._cursorDescription.options);                                            // 388
    options.fields = self._sharedProjection;                                                           // 389
    delete options.transform;                                                                          // 390
    // We are NOT deep cloning fields or selector here, which should be OK.                            // 391
    var description = new CursorDescription(                                                           // 392
      self._cursorDescription.collectionName,                                                          // 393
      self._cursorDescription.selector,                                                                // 394
      options);                                                                                        // 395
    return new Cursor(self._mongoHandle, description);                                                 // 396
  },                                                                                                   // 397
                                                                                                       // 398
                                                                                                       // 399
  // Replace self._published with newResults (both are IdMaps), invoking observe                       // 400
  // callbacks on the multiplexer.                                                                     // 401
  //                                                                                                   // 402
  // XXX This is very similar to LocalCollection._diffQueryUnorderedChanges. We                        // 403
  // should really: (a) Unify IdMap and OrderedDict into Unordered/OrderedDict (b)                     // 404
  // Rewrite diff.js to use these classes instead of arrays and objects.                               // 405
  _publishNewResults: function (newResults) {                                                          // 406
    var self = this;                                                                                   // 407
                                                                                                       // 408
    // First remove anything that's gone. Be careful not to modify                                     // 409
    // self._published while iterating over it.                                                        // 410
    var idsToRemove = [];                                                                              // 411
    self._published.forEach(function (doc, id) {                                                       // 412
      if (!newResults.has(id))                                                                         // 413
        idsToRemove.push(id);                                                                          // 414
    });                                                                                                // 415
    _.each(idsToRemove, function (id) {                                                                // 416
      self._remove(id);                                                                                // 417
    });                                                                                                // 418
                                                                                                       // 419
    // Now do adds and changes.                                                                        // 420
    newResults.forEach(function (doc, id) {                                                            // 421
      // "true" here means to throw if we think this doc doesn't match the                             // 422
      // selector.                                                                                     // 423
      self._handleDoc(id, doc, true);                                                                  // 424
    });                                                                                                // 425
  },                                                                                                   // 426
                                                                                                       // 427
  // This stop function is invoked from the onStop of the ObserveMultiplexer, so                       // 428
  // it shouldn't actually be possible to call it until the multiplexer is                             // 429
  // ready.                                                                                            // 430
  stop: function () {                                                                                  // 431
    var self = this;                                                                                   // 432
    if (self._stopped)                                                                                 // 433
      return;                                                                                          // 434
    self._stopped = true;                                                                              // 435
    _.each(self._stopHandles, function (handle) {                                                      // 436
      handle.stop();                                                                                   // 437
    });                                                                                                // 438
                                                                                                       // 439
    // Note: we *don't* use multiplexer.onFlush here because this stop                                 // 440
    // callback is actually invoked by the multiplexer itself when it has                              // 441
    // determined that there are no handles left. So nothing is actually going                         // 442
    // to get flushed (and it's probably not valid to call methods on the                              // 443
    // dying multiplexer).                                                                             // 444
    _.each(self._writesToCommitWhenWeReachSteady, function (w) {                                       // 445
      w.committed();                                                                                   // 446
    });                                                                                                // 447
    self._writesToCommitWhenWeReachSteady = null;                                                      // 448
                                                                                                       // 449
    // Proactively drop references to potentially big things.                                          // 450
    self._published = null;                                                                            // 451
    self._needToFetch = null;                                                                          // 452
    self._currentlyFetching = null;                                                                    // 453
    self._oplogEntryHandle = null;                                                                     // 454
    self._listenersHandle = null;                                                                      // 455
                                                                                                       // 456
    Package.facts && Package.facts.Facts.incrementServerFact(                                          // 457
      "mongo-livedata", "observe-drivers-oplog", -1);                                                  // 458
  }                                                                                                    // 459
});                                                                                                    // 460
                                                                                                       // 461
// Does our oplog tailing code support this cursor? For now, we are being very                         // 462
// conservative and allowing only simple queries with simple options.                                  // 463
// (This is a "static method".)                                                                        // 464
OplogObserveDriver.cursorSupported = function (cursorDescription) {                                    // 465
  // First, check the options.                                                                         // 466
  var options = cursorDescription.options;                                                             // 467
                                                                                                       // 468
  // Did the user say no explicitly?                                                                   // 469
  if (options._disableOplog)                                                                           // 470
    return false;                                                                                      // 471
                                                                                                       // 472
  // This option (which are mostly used for sorted cursors) require us to figure                       // 473
  // out where a given document fits in an order to know if it's included or                           // 474
  // not, and we don't track that information when doing oplog tailing.                                // 475
  if (options.limit || options.skip) return false;                                                     // 476
                                                                                                       // 477
  // If a fields projection option is given check if it is supported by                                // 478
  // minimongo (some operators are not supported).                                                     // 479
  if (options.fields) {                                                                                // 480
    try {                                                                                              // 481
      LocalCollection._checkSupportedProjection(options.fields);                                       // 482
    } catch (e) {                                                                                      // 483
      if (e.name === "MinimongoError")                                                                 // 484
        return false;                                                                                  // 485
      else                                                                                             // 486
        throw e;                                                                                       // 487
    }                                                                                                  // 488
  }                                                                                                    // 489
                                                                                                       // 490
  // For now, we're just dealing with equality queries: no $operators, regexps,                        // 491
  // or $and/$or/$where/etc clauses. We can expand the scope of what we're                             // 492
  // comfortable processing later. ($where will get pretty scary since it will                         // 493
  // allow selector processing to yield!)                                                              // 494
  return _.all(cursorDescription.selector, function (value, field) {                                   // 495
    // No logical operators like $and.                                                                 // 496
    if (field.substr(0, 1) === '$')                                                                    // 497
      return false;                                                                                    // 498
    // We only allow scalars, not sub-documents or $operators or RegExp.                               // 499
    // XXX Date would be easy too, though I doubt anyone is doing equality                             // 500
    // lookups on dates                                                                                // 501
    return typeof value === "string" ||                                                                // 502
      typeof value === "number" ||                                                                     // 503
      typeof value === "boolean" ||                                                                    // 504
      value === null ||                                                                                // 505
      value instanceof Meteor.Collection.ObjectID;                                                     // 506
  });                                                                                                  // 507
};                                                                                                     // 508
                                                                                                       // 509
var modifierCanBeDirectlyApplied = function (modifier) {                                               // 510
  return _.all(modifier, function (fields, operation) {                                                // 511
    return _.all(fields, function (value, field) {                                                     // 512
      return !/EJSON\$/.test(field);                                                                   // 513
    });                                                                                                // 514
  });                                                                                                  // 515
};                                                                                                     // 516
                                                                                                       // 517
MongoTest.OplogObserveDriver = OplogObserveDriver;                                                     // 518
                                                                                                       // 519
/////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

/////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                     //
// packages/mongo-livedata/local_collection_driver.js                                                  //
//                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                       //
LocalCollectionDriver = function () {                                                                  // 1
  var self = this;                                                                                     // 2
  self.noConnCollections = {};                                                                         // 3
};                                                                                                     // 4
                                                                                                       // 5
var ensureCollection = function (name, collections) {                                                  // 6
  if (!(name in collections))                                                                          // 7
    collections[name] = new LocalCollection(name);                                                     // 8
  return collections[name];                                                                            // 9
};                                                                                                     // 10
                                                                                                       // 11
_.extend(LocalCollectionDriver.prototype, {                                                            // 12
  open: function (name, conn) {                                                                        // 13
    var self = this;                                                                                   // 14
    if (!name)                                                                                         // 15
      return new LocalCollection;                                                                      // 16
    if (! conn) {                                                                                      // 17
      return ensureCollection(name, self.noConnCollections);                                           // 18
    }                                                                                                  // 19
    if (! conn._mongo_livedata_collections)                                                            // 20
      conn._mongo_livedata_collections = {};                                                           // 21
    // XXX is there a way to keep track of a connection's collections without                          // 22
    // dangling it off the connection object?                                                          // 23
    return ensureCollection(name, conn._mongo_livedata_collections);                                   // 24
  }                                                                                                    // 25
});                                                                                                    // 26
                                                                                                       // 27
// singleton                                                                                           // 28
LocalCollectionDriver = new LocalCollectionDriver;                                                     // 29
                                                                                                       // 30
/////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

/////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                     //
// packages/mongo-livedata/remote_collection_driver.js                                                 //
//                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                       //
MongoInternals.RemoteCollectionDriver = function (                                                     // 1
  mongo_url, options) {                                                                                // 2
  var self = this;                                                                                     // 3
  self.mongo = new MongoConnection(mongo_url, options);                                                // 4
};                                                                                                     // 5
                                                                                                       // 6
_.extend(MongoInternals.RemoteCollectionDriver.prototype, {                                            // 7
  open: function (name) {                                                                              // 8
    var self = this;                                                                                   // 9
    var ret = {};                                                                                      // 10
    _.each(                                                                                            // 11
      ['find', 'findOne', 'insert', 'update', , 'upsert',                                              // 12
       'remove', '_ensureIndex', '_dropIndex', '_createCappedCollection',                              // 13
       'dropCollection'],                                                                              // 14
      function (m) {                                                                                   // 15
        ret[m] = _.bind(self.mongo[m], self.mongo, name);                                              // 16
      });                                                                                              // 17
    return ret;                                                                                        // 18
  }                                                                                                    // 19
});                                                                                                    // 20
                                                                                                       // 21
                                                                                                       // 22
// Create the singleton RemoteCollectionDriver only on demand, so we                                   // 23
// only require Mongo configuration if it's actually used (eg, not if                                  // 24
// you're only trying to receive data from a remote DDP server.)                                       // 25
MongoInternals.defaultRemoteCollectionDriver = _.once(function () {                                    // 26
  var mongoUrl;                                                                                        // 27
  var connectionOptions = {};                                                                          // 28
                                                                                                       // 29
  AppConfig.configurePackage("mongo-livedata", function (config) {                                     // 30
    // This will keep running if mongo gets reconfigured.  That's not ideal, but                       // 31
    // should be ok for now.                                                                           // 32
    mongoUrl = config.url;                                                                             // 33
                                                                                                       // 34
    if (config.oplog)                                                                                  // 35
      connectionOptions.oplogUrl = config.oplog;                                                       // 36
  });                                                                                                  // 37
                                                                                                       // 38
  // XXX bad error since it could also be set directly in METEOR_DEPLOY_CONFIG                         // 39
  if (! mongoUrl)                                                                                      // 40
    throw new Error("MONGO_URL must be set in environment");                                           // 41
                                                                                                       // 42
                                                                                                       // 43
  return new MongoInternals.RemoteCollectionDriver(mongoUrl, connectionOptions);                       // 44
});                                                                                                    // 45
                                                                                                       // 46
/////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

/////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                     //
// packages/mongo-livedata/collection.js                                                               //
//                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                       //
// options.connection, if given, is a LivedataClient or LivedataServer                                 // 1
// XXX presently there is no way to destroy/clean up a Collection                                      // 2
                                                                                                       // 3
Meteor.Collection = function (name, options) {                                                         // 4
  var self = this;                                                                                     // 5
  if (! (self instanceof Meteor.Collection))                                                           // 6
    throw new Error('use "new" to construct a Meteor.Collection');                                     // 7
  if (options && options.methods) {                                                                    // 8
    // Backwards compatibility hack with original signature (which passed                              // 9
    // "connection" directly instead of in options. (Connections must have a "methods"                 // 10
    // method.)                                                                                        // 11
    // XXX remove before 1.0                                                                           // 12
    options = {connection: options};                                                                   // 13
  }                                                                                                    // 14
  // Backwards compatibility: "connection" used to be called "manager".                                // 15
  if (options && options.manager && !options.connection) {                                             // 16
    options.connection = options.manager;                                                              // 17
  }                                                                                                    // 18
  options = _.extend({                                                                                 // 19
    connection: undefined,                                                                             // 20
    idGeneration: 'STRING',                                                                            // 21
    transform: null,                                                                                   // 22
    _driver: undefined,                                                                                // 23
    _preventAutopublish: false                                                                         // 24
  }, options);                                                                                         // 25
                                                                                                       // 26
  switch (options.idGeneration) {                                                                      // 27
  case 'MONGO':                                                                                        // 28
    self._makeNewID = function () {                                                                    // 29
      return new Meteor.Collection.ObjectID();                                                         // 30
    };                                                                                                 // 31
    break;                                                                                             // 32
  case 'STRING':                                                                                       // 33
  default:                                                                                             // 34
    self._makeNewID = function () {                                                                    // 35
      return Random.id();                                                                              // 36
    };                                                                                                 // 37
    break;                                                                                             // 38
  }                                                                                                    // 39
                                                                                                       // 40
  if (options.transform)                                                                               // 41
    self._transform = Deps._makeNonreactive(options.transform);                                        // 42
  else                                                                                                 // 43
    self._transform = null;                                                                            // 44
                                                                                                       // 45
  if (!name && (name !== null)) {                                                                      // 46
    Meteor._debug("Warning: creating anonymous collection. It will not be " +                          // 47
                  "saved or synchronized over the network. (Pass null for " +                          // 48
                  "the collection name to turn off this warning.)");                                   // 49
  }                                                                                                    // 50
                                                                                                       // 51
  if (! name || options.connection === null)                                                           // 52
    // note: nameless collections never have a connection                                              // 53
    self._connection = null;                                                                           // 54
  else if (options.connection)                                                                         // 55
    self._connection = options.connection;                                                             // 56
  else if (Meteor.isClient)                                                                            // 57
    self._connection = Meteor.connection;                                                              // 58
  else                                                                                                 // 59
    self._connection = Meteor.server;                                                                  // 60
                                                                                                       // 61
  if (!options._driver) {                                                                              // 62
    if (name && self._connection === Meteor.server &&                                                  // 63
        typeof MongoInternals !== "undefined" &&                                                       // 64
        MongoInternals.defaultRemoteCollectionDriver) {                                                // 65
      options._driver = MongoInternals.defaultRemoteCollectionDriver();                                // 66
    } else {                                                                                           // 67
      options._driver = LocalCollectionDriver;                                                         // 68
    }                                                                                                  // 69
  }                                                                                                    // 70
                                                                                                       // 71
  self._collection = options._driver.open(name, self._connection);                                     // 72
  self._name = name;                                                                                   // 73
                                                                                                       // 74
  if (self._connection && self._connection.registerStore) {                                            // 75
    // OK, we're going to be a slave, replicating some remote                                          // 76
    // database, except possibly with some temporary divergence while                                  // 77
    // we have unacknowledged RPC's.                                                                   // 78
    var ok = self._connection.registerStore(name, {                                                    // 79
      // Called at the beginning of a batch of updates. batchSize is the number                        // 80
      // of update calls to expect.                                                                    // 81
      //                                                                                               // 82
      // XXX This interface is pretty janky. reset probably ought to go back to                        // 83
      // being its own function, and callers shouldn't have to calculate                               // 84
      // batchSize. The optimization of not calling pause/remove should be                             // 85
      // delayed until later: the first call to update() should buffer its                             // 86
      // message, and then we can either directly apply it at endUpdate time if                        // 87
      // it was the only update, or do pauseObservers/apply/apply at the next                          // 88
      // update() if there's another one.                                                              // 89
      beginUpdate: function (batchSize, reset) {                                                       // 90
        // pause observers so users don't see flicker when updating several                            // 91
        // objects at once (including the post-reconnect reset-and-reapply                             // 92
        // stage), and so that a re-sorting of a query can take advantage of the                       // 93
        // full _diffQuery moved calculation instead of applying change one at a                       // 94
        // time.                                                                                       // 95
        if (batchSize > 1 || reset)                                                                    // 96
          self._collection.pauseObservers();                                                           // 97
                                                                                                       // 98
        if (reset)                                                                                     // 99
          self._collection.remove({});                                                                 // 100
      },                                                                                               // 101
                                                                                                       // 102
      // Apply an update.                                                                              // 103
      // XXX better specify this interface (not in terms of a wire message)?                           // 104
      update: function (msg) {                                                                         // 105
        var mongoId = LocalCollection._idParse(msg.id);                                                // 106
        var doc = self._collection.findOne(mongoId);                                                   // 107
                                                                                                       // 108
        // Is this a "replace the whole doc" message coming from the quiescence                        // 109
        // of method writes to an object? (Note that 'undefined' is a valid                            // 110
        // value meaning "remove it".)                                                                 // 111
        if (msg.msg === 'replace') {                                                                   // 112
          var replace = msg.replace;                                                                   // 113
          if (!replace) {                                                                              // 114
            if (doc)                                                                                   // 115
              self._collection.remove(mongoId);                                                        // 116
          } else if (!doc) {                                                                           // 117
            self._collection.insert(replace);                                                          // 118
          } else {                                                                                     // 119
            // XXX check that replace has no $ ops                                                     // 120
            self._collection.update(mongoId, replace);                                                 // 121
          }                                                                                            // 122
          return;                                                                                      // 123
        } else if (msg.msg === 'added') {                                                              // 124
          if (doc) {                                                                                   // 125
            throw new Error("Expected not to find a document already present for an add");             // 126
          }                                                                                            // 127
          self._collection.insert(_.extend({_id: mongoId}, msg.fields));                               // 128
        } else if (msg.msg === 'removed') {                                                            // 129
          if (!doc)                                                                                    // 130
            throw new Error("Expected to find a document already present for removed");                // 131
          self._collection.remove(mongoId);                                                            // 132
        } else if (msg.msg === 'changed') {                                                            // 133
          if (!doc)                                                                                    // 134
            throw new Error("Expected to find a document to change");                                  // 135
          if (!_.isEmpty(msg.fields)) {                                                                // 136
            var modifier = {};                                                                         // 137
            _.each(msg.fields, function (value, key) {                                                 // 138
              if (value === undefined) {                                                               // 139
                if (!modifier.$unset)                                                                  // 140
                  modifier.$unset = {};                                                                // 141
                modifier.$unset[key] = 1;                                                              // 142
              } else {                                                                                 // 143
                if (!modifier.$set)                                                                    // 144
                  modifier.$set = {};                                                                  // 145
                modifier.$set[key] = value;                                                            // 146
              }                                                                                        // 147
            });                                                                                        // 148
            self._collection.update(mongoId, modifier);                                                // 149
          }                                                                                            // 150
        } else {                                                                                       // 151
          throw new Error("I don't know how to deal with this message");                               // 152
        }                                                                                              // 153
                                                                                                       // 154
      },                                                                                               // 155
                                                                                                       // 156
      // Called at the end of a batch of updates.                                                      // 157
      endUpdate: function () {                                                                         // 158
        self._collection.resumeObservers();                                                            // 159
      },                                                                                               // 160
                                                                                                       // 161
      // Called around method stub invocations to capture the original versions                        // 162
      // of modified documents.                                                                        // 163
      saveOriginals: function () {                                                                     // 164
        self._collection.saveOriginals();                                                              // 165
      },                                                                                               // 166
      retrieveOriginals: function () {                                                                 // 167
        return self._collection.retrieveOriginals();                                                   // 168
      }                                                                                                // 169
    });                                                                                                // 170
                                                                                                       // 171
    if (!ok)                                                                                           // 172
      throw new Error("There is already a collection named '" + name + "'");                           // 173
  }                                                                                                    // 174
                                                                                                       // 175
  self._defineMutationMethods();                                                                       // 176
                                                                                                       // 177
  // autopublish                                                                                       // 178
  if (Package.autopublish && !options._preventAutopublish && self._connection                          // 179
      && self._connection.publish) {                                                                   // 180
    self._connection.publish(null, function () {                                                       // 181
      return self.find();                                                                              // 182
    }, {is_auto: true});                                                                               // 183
  }                                                                                                    // 184
};                                                                                                     // 185
                                                                                                       // 186
///                                                                                                    // 187
/// Main collection API                                                                                // 188
///                                                                                                    // 189
                                                                                                       // 190
                                                                                                       // 191
_.extend(Meteor.Collection.prototype, {                                                                // 192
                                                                                                       // 193
  _getFindSelector: function (args) {                                                                  // 194
    if (args.length == 0)                                                                              // 195
      return {};                                                                                       // 196
    else                                                                                               // 197
      return args[0];                                                                                  // 198
  },                                                                                                   // 199
                                                                                                       // 200
  _getFindOptions: function (args) {                                                                   // 201
    var self = this;                                                                                   // 202
    if (args.length < 2) {                                                                             // 203
      return { transform: self._transform };                                                           // 204
    } else {                                                                                           // 205
      return _.extend({                                                                                // 206
        transform: self._transform                                                                     // 207
      }, args[1]);                                                                                     // 208
    }                                                                                                  // 209
  },                                                                                                   // 210
                                                                                                       // 211
  find: function (/* selector, options */) {                                                           // 212
    // Collection.find() (return all docs) behaves differently                                         // 213
    // from Collection.find(undefined) (return 0 docs).  so be                                         // 214
    // careful about the length of arguments.                                                          // 215
    var self = this;                                                                                   // 216
    var argArray = _.toArray(arguments);                                                               // 217
    return self._collection.find(self._getFindSelector(argArray),                                      // 218
                                 self._getFindOptions(argArray));                                      // 219
  },                                                                                                   // 220
                                                                                                       // 221
  findOne: function (/* selector, options */) {                                                        // 222
    var self = this;                                                                                   // 223
    var argArray = _.toArray(arguments);                                                               // 224
    return self._collection.findOne(self._getFindSelector(argArray),                                   // 225
                                    self._getFindOptions(argArray));                                   // 226
  }                                                                                                    // 227
                                                                                                       // 228
});                                                                                                    // 229
                                                                                                       // 230
Meteor.Collection._publishCursor = function (cursor, sub, collection) {                                // 231
  var observeHandle = cursor.observeChanges({                                                          // 232
    added: function (id, fields) {                                                                     // 233
      sub.added(collection, id, fields);                                                               // 234
    },                                                                                                 // 235
    changed: function (id, fields) {                                                                   // 236
      sub.changed(collection, id, fields);                                                             // 237
    },                                                                                                 // 238
    removed: function (id) {                                                                           // 239
      sub.removed(collection, id);                                                                     // 240
    }                                                                                                  // 241
  });                                                                                                  // 242
                                                                                                       // 243
  // We don't call sub.ready() here: it gets called in livedata_server, after                          // 244
  // possibly calling _publishCursor on multiple returned cursors.                                     // 245
                                                                                                       // 246
  // register stop callback (expects lambda w/ no args).                                               // 247
  sub.onStop(function () {observeHandle.stop();});                                                     // 248
};                                                                                                     // 249
                                                                                                       // 250
// protect against dangerous selectors.  falsey and {_id: falsey} are both                             // 251
// likely programmer error, and not what you want, particularly for destructive                        // 252
// operations.  JS regexps don't serialize over DDP but can be trivially                               // 253
// replaced by $regex.                                                                                 // 254
Meteor.Collection._rewriteSelector = function (selector) {                                             // 255
  // shorthand -- scalars match _id                                                                    // 256
  if (LocalCollection._selectorIsId(selector))                                                         // 257
    selector = {_id: selector};                                                                        // 258
                                                                                                       // 259
  if (!selector || (('_id' in selector) && !selector._id))                                             // 260
    // can't match anything                                                                            // 261
    return {_id: Random.id()};                                                                         // 262
                                                                                                       // 263
  var ret = {};                                                                                        // 264
  _.each(selector, function (value, key) {                                                             // 265
    // Mongo supports both {field: /foo/} and {field: {$regex: /foo/}}                                 // 266
    if (value instanceof RegExp) {                                                                     // 267
      ret[key] = convertRegexpToMongoSelector(value);                                                  // 268
    } else if (value && value.$regex instanceof RegExp) {                                              // 269
      ret[key] = convertRegexpToMongoSelector(value.$regex);                                           // 270
      // if value is {$regex: /foo/, $options: ...} then $options                                      // 271
      // override the ones set on $regex.                                                              // 272
      if (value.$options !== undefined)                                                                // 273
        ret[key].$options = value.$options;                                                            // 274
    }                                                                                                  // 275
    else if (_.contains(['$or','$and','$nor'], key)) {                                                 // 276
      // Translate lower levels of $and/$or/$nor                                                       // 277
      ret[key] = _.map(value, function (v) {                                                           // 278
        return Meteor.Collection._rewriteSelector(v);                                                  // 279
      });                                                                                              // 280
    }                                                                                                  // 281
    else {                                                                                             // 282
      ret[key] = value;                                                                                // 283
    }                                                                                                  // 284
  });                                                                                                  // 285
  return ret;                                                                                          // 286
};                                                                                                     // 287
                                                                                                       // 288
// convert a JS RegExp object to a Mongo {$regex: ..., $options: ...}                                  // 289
// selector                                                                                            // 290
var convertRegexpToMongoSelector = function (regexp) {                                                 // 291
  check(regexp, RegExp); // safety belt                                                                // 292
                                                                                                       // 293
  var selector = {$regex: regexp.source};                                                              // 294
  var regexOptions = '';                                                                               // 295
  // JS RegExp objects support 'i', 'm', and 'g'. Mongo regex $options                                 // 296
  // support 'i', 'm', 'x', and 's'. So we support 'i' and 'm' here.                                   // 297
  if (regexp.ignoreCase)                                                                               // 298
    regexOptions += 'i';                                                                               // 299
  if (regexp.multiline)                                                                                // 300
    regexOptions += 'm';                                                                               // 301
  if (regexOptions)                                                                                    // 302
    selector.$options = regexOptions;                                                                  // 303
                                                                                                       // 304
  return selector;                                                                                     // 305
};                                                                                                     // 306
                                                                                                       // 307
var throwIfSelectorIsNotId = function (selector, methodName) {                                         // 308
  if (!LocalCollection._selectorIsIdPerhapsAsObject(selector)) {                                       // 309
    throw new Meteor.Error(                                                                            // 310
      403, "Not permitted. Untrusted code may only " + methodName +                                    // 311
        " documents by ID.");                                                                          // 312
  }                                                                                                    // 313
};                                                                                                     // 314
                                                                                                       // 315
// 'insert' immediately returns the inserted document's new _id.                                       // 316
// The others return values immediately if you are in a stub, an in-memory                             // 317
// unmanaged collection, or a mongo-backed collection and you don't pass a                             // 318
// callback. 'update' and 'remove' return the number of affected                                       // 319
// documents. 'upsert' returns an object with keys 'numberAffected' and, if an                         // 320
// insert happened, 'insertedId'.                                                                      // 321
//                                                                                                     // 322
// Otherwise, the semantics are exactly like other methods: they take                                  // 323
// a callback as an optional last argument; if no callback is                                          // 324
// provided, they block until the operation is complete, and throw an                                  // 325
// exception if it fails; if a callback is provided, then they don't                                   // 326
// necessarily block, and they call the callback when they finish with error and                       // 327
// result arguments.  (The insert method provides the document ID as its result;                       // 328
// update and remove provide the number of affected docs as the result; upsert                         // 329
// provides an object with numberAffected and maybe insertedId.)                                       // 330
//                                                                                                     // 331
// On the client, blocking is impossible, so if a callback                                             // 332
// isn't provided, they just return immediately and any error                                          // 333
// information is lost.                                                                                // 334
//                                                                                                     // 335
// There's one more tweak. On the client, if you don't provide a                                       // 336
// callback, then if there is an error, a message will be logged with                                  // 337
// Meteor._debug.                                                                                      // 338
//                                                                                                     // 339
// The intent (though this is actually determined by the underlying                                    // 340
// drivers) is that the operations should be done synchronously, not                                   // 341
// generating their result until the database has acknowledged                                         // 342
// them. In the future maybe we should provide a flag to turn this                                     // 343
// off.                                                                                                // 344
_.each(["insert", "update", "remove"], function (name) {                                               // 345
  Meteor.Collection.prototype[name] = function (/* arguments */) {                                     // 346
    var self = this;                                                                                   // 347
    var args = _.toArray(arguments);                                                                   // 348
    var callback;                                                                                      // 349
    var insertId;                                                                                      // 350
    var ret;                                                                                           // 351
                                                                                                       // 352
    if (args.length && args[args.length - 1] instanceof Function)                                      // 353
      callback = args.pop();                                                                           // 354
                                                                                                       // 355
    if (name === "insert") {                                                                           // 356
      if (!args.length)                                                                                // 357
        throw new Error("insert requires an argument");                                                // 358
      // shallow-copy the document and generate an ID                                                  // 359
      args[0] = _.extend({}, args[0]);                                                                 // 360
      if ('_id' in args[0]) {                                                                          // 361
        insertId = args[0]._id;                                                                        // 362
        if (!insertId || !(typeof insertId === 'string'                                                // 363
              || insertId instanceof Meteor.Collection.ObjectID))                                      // 364
          throw new Error("Meteor requires document _id fields to be non-empty strings or ObjectIDs"); // 365
      } else {                                                                                         // 366
        insertId = args[0]._id = self._makeNewID();                                                    // 367
      }                                                                                                // 368
    } else {                                                                                           // 369
      args[0] = Meteor.Collection._rewriteSelector(args[0]);                                           // 370
                                                                                                       // 371
      if (name === "update") {                                                                         // 372
        // Mutate args but copy the original options object. We need to add                            // 373
        // insertedId to options, but don't want to mutate the caller's options                        // 374
        // object. We need to mutate `args` because we pass `args` into the                            // 375
        // driver below.                                                                               // 376
        var options = args[2] = _.clone(args[2]) || {};                                                // 377
        if (options && typeof options !== "function" && options.upsert) {                              // 378
          // set `insertedId` if absent.  `insertedId` is a Meteor extension.                          // 379
          if (options.insertedId) {                                                                    // 380
            if (!(typeof options.insertedId === 'string'                                               // 381
                  || options.insertedId instanceof Meteor.Collection.ObjectID))                        // 382
              throw new Error("insertedId must be string or ObjectID");                                // 383
          } else {                                                                                     // 384
            options.insertedId = self._makeNewID();                                                    // 385
          }                                                                                            // 386
        }                                                                                              // 387
      }                                                                                                // 388
    }                                                                                                  // 389
                                                                                                       // 390
    // On inserts, always return the id that we generated; on all other                                // 391
    // operations, just return the result from the collection.                                         // 392
    var chooseReturnValueFromCollectionResult = function (result) {                                    // 393
      if (name === "insert")                                                                           // 394
        return insertId;                                                                               // 395
      else                                                                                             // 396
        return result;                                                                                 // 397
    };                                                                                                 // 398
                                                                                                       // 399
    var wrappedCallback;                                                                               // 400
    if (callback) {                                                                                    // 401
      wrappedCallback = function (error, result) {                                                     // 402
        callback(error, ! error && chooseReturnValueFromCollectionResult(result));                     // 403
      };                                                                                               // 404
    }                                                                                                  // 405
                                                                                                       // 406
    if (self._connection && self._connection !== Meteor.server) {                                      // 407
      // just remote to another endpoint, propagate return value or                                    // 408
      // exception.                                                                                    // 409
                                                                                                       // 410
      var enclosing = DDP._CurrentInvocation.get();                                                    // 411
      var alreadyInSimulation = enclosing && enclosing.isSimulation;                                   // 412
                                                                                                       // 413
      if (Meteor.isClient && !wrappedCallback && ! alreadyInSimulation) {                              // 414
        // Client can't block, so it can't report errors by exception,                                 // 415
        // only by callback. If they forget the callback, give them a                                  // 416
        // default one that logs the error, so they aren't totally                                     // 417
        // baffled if their writes don't work because their database is                                // 418
        // down.                                                                                       // 419
        // Don't give a default callback in simulation, because inside stubs we                        // 420
        // want to return the results from the local collection immediately and                        // 421
        // not force a callback.                                                                       // 422
        wrappedCallback = function (err) {                                                             // 423
          if (err)                                                                                     // 424
            Meteor._debug(name + " failed: " + (err.reason || err.stack));                             // 425
        };                                                                                             // 426
      }                                                                                                // 427
                                                                                                       // 428
      if (!alreadyInSimulation && name !== "insert") {                                                 // 429
        // If we're about to actually send an RPC, we should throw an error if                         // 430
        // this is a non-ID selector, because the mutation methods only allow                          // 431
        // single-ID selectors. (If we don't throw here, we'll see flicker.)                           // 432
        throwIfSelectorIsNotId(args[0], name);                                                         // 433
      }                                                                                                // 434
                                                                                                       // 435
      ret = chooseReturnValueFromCollectionResult(                                                     // 436
        self._connection.apply(self._prefix + name, args, wrappedCallback)                             // 437
      );                                                                                               // 438
                                                                                                       // 439
    } else {                                                                                           // 440
      // it's my collection.  descend into the collection object                                       // 441
      // and propagate any exception.                                                                  // 442
      args.push(wrappedCallback);                                                                      // 443
      try {                                                                                            // 444
        // If the user provided a callback and the collection implements this                          // 445
        // operation asynchronously, then queryRet will be undefined, and the                          // 446
        // result will be returned through the callback instead.                                       // 447
        var queryRet = self._collection[name].apply(self._collection, args);                           // 448
        ret = chooseReturnValueFromCollectionResult(queryRet);                                         // 449
      } catch (e) {                                                                                    // 450
        if (callback) {                                                                                // 451
          callback(e);                                                                                 // 452
          return null;                                                                                 // 453
        }                                                                                              // 454
        throw e;                                                                                       // 455
      }                                                                                                // 456
    }                                                                                                  // 457
                                                                                                       // 458
    // both sync and async, unless we threw an exception, return ret                                   // 459
    // (new document ID for insert, num affected for update/remove, object with                        // 460
    // numberAffected and maybe insertedId for upsert).                                                // 461
    return ret;                                                                                        // 462
  };                                                                                                   // 463
});                                                                                                    // 464
                                                                                                       // 465
Meteor.Collection.prototype.upsert = function (selector, modifier,                                     // 466
                                               options, callback) {                                    // 467
  var self = this;                                                                                     // 468
  if (! callback && typeof options === "function") {                                                   // 469
    callback = options;                                                                                // 470
    options = {};                                                                                      // 471
  }                                                                                                    // 472
  return self.update(selector, modifier,                                                               // 473
              _.extend({}, options, { _returnObject: true, upsert: true }),                            // 474
              callback);                                                                               // 475
};                                                                                                     // 476
                                                                                                       // 477
// We'll actually design an index API later. For now, we just pass through to                          // 478
// Mongo's, but make it synchronous.                                                                   // 479
Meteor.Collection.prototype._ensureIndex = function (index, options) {                                 // 480
  var self = this;                                                                                     // 481
  if (!self._collection._ensureIndex)                                                                  // 482
    throw new Error("Can only call _ensureIndex on server collections");                               // 483
  self._collection._ensureIndex(index, options);                                                       // 484
};                                                                                                     // 485
Meteor.Collection.prototype._dropIndex = function (index) {                                            // 486
  var self = this;                                                                                     // 487
  if (!self._collection._dropIndex)                                                                    // 488
    throw new Error("Can only call _dropIndex on server collections");                                 // 489
  self._collection._dropIndex(index);                                                                  // 490
};                                                                                                     // 491
Meteor.Collection.prototype._dropCollection = function () {                                            // 492
  var self = this;                                                                                     // 493
  if (!self._collection.dropCollection)                                                                // 494
    throw new Error("Can only call _dropCollection on server collections");                            // 495
  self._collection.dropCollection();                                                                   // 496
};                                                                                                     // 497
Meteor.Collection.prototype._createCappedCollection = function (byteSize) {                            // 498
  var self = this;                                                                                     // 499
  if (!self._collection._createCappedCollection)                                                       // 500
    throw new Error("Can only call _createCappedCollection on server collections");                    // 501
  self._collection._createCappedCollection(byteSize);                                                  // 502
};                                                                                                     // 503
                                                                                                       // 504
Meteor.Collection.ObjectID = LocalCollection._ObjectID;                                                // 505
                                                                                                       // 506
///                                                                                                    // 507
/// Remote methods and access control.                                                                 // 508
///                                                                                                    // 509
                                                                                                       // 510
// Restrict default mutators on collection. allow() and deny() take the                                // 511
// same options:                                                                                       // 512
//                                                                                                     // 513
// options.insert {Function(userId, doc)}                                                              // 514
//   return true to allow/deny adding this document                                                    // 515
//                                                                                                     // 516
// options.update {Function(userId, docs, fields, modifier)}                                           // 517
//   return true to allow/deny updating these documents.                                               // 518
//   `fields` is passed as an array of fields that are to be modified                                  // 519
//                                                                                                     // 520
// options.remove {Function(userId, docs)}                                                             // 521
//   return true to allow/deny removing these documents                                                // 522
//                                                                                                     // 523
// options.fetch {Array}                                                                               // 524
//   Fields to fetch for these validators. If any call to allow or deny                                // 525
//   does not have this option then all fields are loaded.                                             // 526
//                                                                                                     // 527
// allow and deny can be called multiple times. The validators are                                     // 528
// evaluated as follows:                                                                               // 529
// - If neither deny() nor allow() has been called on the collection,                                  // 530
//   then the request is allowed if and only if the "insecure" smart                                   // 531
//   package is in use.                                                                                // 532
// - Otherwise, if any deny() function returns true, the request is denied.                            // 533
// - Otherwise, if any allow() function returns true, the request is allowed.                          // 534
// - Otherwise, the request is denied.                                                                 // 535
//                                                                                                     // 536
// Meteor may call your deny() and allow() functions in any order, and may not                         // 537
// call all of them if it is able to make a decision without calling them all                          // 538
// (so don't include side effects).                                                                    // 539
                                                                                                       // 540
(function () {                                                                                         // 541
  var addValidator = function(allowOrDeny, options) {                                                  // 542
    // validate keys                                                                                   // 543
    var VALID_KEYS = ['insert', 'update', 'remove', 'fetch', 'transform'];                             // 544
    _.each(_.keys(options), function (key) {                                                           // 545
      if (!_.contains(VALID_KEYS, key))                                                                // 546
        throw new Error(allowOrDeny + ": Invalid key: " + key);                                        // 547
    });                                                                                                // 548
                                                                                                       // 549
    var self = this;                                                                                   // 550
    self._restricted = true;                                                                           // 551
                                                                                                       // 552
    _.each(['insert', 'update', 'remove'], function (name) {                                           // 553
      if (options[name]) {                                                                             // 554
        if (!(options[name] instanceof Function)) {                                                    // 555
          throw new Error(allowOrDeny + ": Value for `" + name + "` must be a function");              // 556
        }                                                                                              // 557
        if (self._transform && options.transform !== null)                                             // 558
          options[name].transform = self._transform;                                                   // 559
        if (options.transform)                                                                         // 560
          options[name].transform = Deps._makeNonreactive(options.transform);                          // 561
        self._validators[name][allowOrDeny].push(options[name]);                                       // 562
      }                                                                                                // 563
    });                                                                                                // 564
                                                                                                       // 565
    // Only update the fetch fields if we're passed things that affect                                 // 566
    // fetching. This way allow({}) and allow({insert: f}) don't result in                             // 567
    // setting fetchAllFields                                                                          // 568
    if (options.update || options.remove || options.fetch) {                                           // 569
      if (options.fetch && !(options.fetch instanceof Array)) {                                        // 570
        throw new Error(allowOrDeny + ": Value for `fetch` must be an array");                         // 571
      }                                                                                                // 572
      self._updateFetch(options.fetch);                                                                // 573
    }                                                                                                  // 574
  };                                                                                                   // 575
                                                                                                       // 576
  Meteor.Collection.prototype.allow = function(options) {                                              // 577
    addValidator.call(this, 'allow', options);                                                         // 578
  };                                                                                                   // 579
  Meteor.Collection.prototype.deny = function(options) {                                               // 580
    addValidator.call(this, 'deny', options);                                                          // 581
  };                                                                                                   // 582
})();                                                                                                  // 583
                                                                                                       // 584
                                                                                                       // 585
Meteor.Collection.prototype._defineMutationMethods = function() {                                      // 586
  var self = this;                                                                                     // 587
                                                                                                       // 588
  // set to true once we call any allow or deny methods. If true, use                                  // 589
  // allow/deny semantics. If false, use insecure mode semantics.                                      // 590
  self._restricted = false;                                                                            // 591
                                                                                                       // 592
  // Insecure mode (default to allowing writes). Defaults to 'undefined' which                         // 593
  // means insecure iff the insecure package is loaded. This property can be                           // 594
  // overriden by tests or packages wishing to change insecure mode behavior of                        // 595
  // their collections.                                                                                // 596
  self._insecure = undefined;                                                                          // 597
                                                                                                       // 598
  self._validators = {                                                                                 // 599
    insert: {allow: [], deny: []},                                                                     // 600
    update: {allow: [], deny: []},                                                                     // 601
    remove: {allow: [], deny: []},                                                                     // 602
    upsert: {allow: [], deny: []}, // dummy arrays; can't set these!                                   // 603
    fetch: [],                                                                                         // 604
    fetchAllFields: false                                                                              // 605
  };                                                                                                   // 606
                                                                                                       // 607
  if (!self._name)                                                                                     // 608
    return; // anonymous collection                                                                    // 609
                                                                                                       // 610
  // XXX Think about method namespacing. Maybe methods should be                                       // 611
  // "Meteor:Mongo:insert/NAME"?                                                                       // 612
  self._prefix = '/' + self._name + '/';                                                               // 613
                                                                                                       // 614
  // mutation methods                                                                                  // 615
  if (self._connection) {                                                                              // 616
    var m = {};                                                                                        // 617
                                                                                                       // 618
    _.each(['insert', 'update', 'remove'], function (method) {                                         // 619
      m[self._prefix + method] = function (/* ... */) {                                                // 620
        // All the methods do their own validation, instead of using check().                          // 621
        check(arguments, [Match.Any]);                                                                 // 622
        try {                                                                                          // 623
          if (this.isSimulation) {                                                                     // 624
                                                                                                       // 625
            // In a client simulation, you can do any mutation (even with a                            // 626
            // complex selector).                                                                      // 627
            return self._collection[method].apply(                                                     // 628
              self._collection, _.toArray(arguments));                                                 // 629
          }                                                                                            // 630
                                                                                                       // 631
          // This is the server receiving a method call from the client.                               // 632
                                                                                                       // 633
          // We don't allow arbitrary selectors in mutations from the client: only                     // 634
          // single-ID selectors.                                                                      // 635
          if (method !== 'insert')                                                                     // 636
            throwIfSelectorIsNotId(arguments[0], method);                                              // 637
                                                                                                       // 638
          if (self._restricted) {                                                                      // 639
            // short circuit if there is no way it will pass.                                          // 640
            if (self._validators[method].allow.length === 0) {                                         // 641
              throw new Meteor.Error(                                                                  // 642
                403, "Access denied. No allow validators set on restricted " +                         // 643
                  "collection for method '" + method + "'.");                                          // 644
            }                                                                                          // 645
                                                                                                       // 646
            var validatedMethodName =                                                                  // 647
                  '_validated' + method.charAt(0).toUpperCase() + method.slice(1);                     // 648
            var argsWithUserId = [this.userId].concat(_.toArray(arguments));                           // 649
            return self[validatedMethodName].apply(self, argsWithUserId);                              // 650
          } else if (self._isInsecure()) {                                                             // 651
            // In insecure mode, allow any mutation (with a simple selector).                          // 652
            return self._collection[method].apply(self._collection,                                    // 653
                                                  _.toArray(arguments));                               // 654
          } else {                                                                                     // 655
            // In secure mode, if we haven't called allow or deny, then nothing                        // 656
            // is permitted.                                                                           // 657
            throw new Meteor.Error(403, "Access denied");                                              // 658
          }                                                                                            // 659
        } catch (e) {                                                                                  // 660
          if (e.name === 'MongoError' || e.name === 'MinimongoError') {                                // 661
            throw new Meteor.Error(409, e.toString());                                                 // 662
          } else {                                                                                     // 663
            throw e;                                                                                   // 664
          }                                                                                            // 665
        }                                                                                              // 666
      };                                                                                               // 667
    });                                                                                                // 668
    // Minimongo on the server gets no stubs; instead, by default                                      // 669
    // it wait()s until its result is ready, yielding.                                                 // 670
    // This matches the behavior of macromongo on the server better.                                   // 671
    if (Meteor.isClient || self._connection === Meteor.server)                                         // 672
      self._connection.methods(m);                                                                     // 673
  }                                                                                                    // 674
};                                                                                                     // 675
                                                                                                       // 676
                                                                                                       // 677
Meteor.Collection.prototype._updateFetch = function (fields) {                                         // 678
  var self = this;                                                                                     // 679
                                                                                                       // 680
  if (!self._validators.fetchAllFields) {                                                              // 681
    if (fields) {                                                                                      // 682
      self._validators.fetch = _.union(self._validators.fetch, fields);                                // 683
    } else {                                                                                           // 684
      self._validators.fetchAllFields = true;                                                          // 685
      // clear fetch just to make sure we don't accidentally read it                                   // 686
      self._validators.fetch = null;                                                                   // 687
    }                                                                                                  // 688
  }                                                                                                    // 689
};                                                                                                     // 690
                                                                                                       // 691
Meteor.Collection.prototype._isInsecure = function () {                                                // 692
  var self = this;                                                                                     // 693
  if (self._insecure === undefined)                                                                    // 694
    return !!Package.insecure;                                                                         // 695
  return self._insecure;                                                                               // 696
};                                                                                                     // 697
                                                                                                       // 698
var docToValidate = function (validator, doc) {                                                        // 699
  var ret = doc;                                                                                       // 700
  if (validator.transform)                                                                             // 701
    ret = validator.transform(EJSON.clone(doc));                                                       // 702
  return ret;                                                                                          // 703
};                                                                                                     // 704
                                                                                                       // 705
Meteor.Collection.prototype._validatedInsert = function(userId, doc) {                                 // 706
  var self = this;                                                                                     // 707
                                                                                                       // 708
  // call user validators.                                                                             // 709
  // Any deny returns true means denied.                                                               // 710
  if (_.any(self._validators.insert.deny, function(validator) {                                        // 711
    return validator(userId, docToValidate(validator, doc));                                           // 712
  })) {                                                                                                // 713
    throw new Meteor.Error(403, "Access denied");                                                      // 714
  }                                                                                                    // 715
  // Any allow returns true means proceed. Throw error if they all fail.                               // 716
  if (_.all(self._validators.insert.allow, function(validator) {                                       // 717
    return !validator(userId, docToValidate(validator, doc));                                          // 718
  })) {                                                                                                // 719
    throw new Meteor.Error(403, "Access denied");                                                      // 720
  }                                                                                                    // 721
                                                                                                       // 722
  self._collection.insert.call(self._collection, doc);                                                 // 723
};                                                                                                     // 724
                                                                                                       // 725
var transformDoc = function (validator, doc) {                                                         // 726
  if (validator.transform)                                                                             // 727
    return validator.transform(doc);                                                                   // 728
  return doc;                                                                                          // 729
};                                                                                                     // 730
                                                                                                       // 731
// Simulate a mongo `update` operation while validating that the access                                // 732
// control rules set by calls to `allow/deny` are satisfied. If all                                    // 733
// pass, rewrite the mongo operation to use $in to set the list of                                     // 734
// document ids to change ##ValidatedChange                                                            // 735
Meteor.Collection.prototype._validatedUpdate = function(                                               // 736
    userId, selector, mutator, options) {                                                              // 737
  var self = this;                                                                                     // 738
                                                                                                       // 739
  options = options || {};                                                                             // 740
                                                                                                       // 741
  if (!LocalCollection._selectorIsIdPerhapsAsObject(selector))                                         // 742
    throw new Error("validated update should be of a single ID");                                      // 743
                                                                                                       // 744
  // We don't support upserts because they don't fit nicely into allow/deny                            // 745
  // rules.                                                                                            // 746
  if (options.upsert)                                                                                  // 747
    throw new Meteor.Error(403, "Access denied. Upserts not " +                                        // 748
                           "allowed in a restricted collection.");                                     // 749
                                                                                                       // 750
  // compute modified fields                                                                           // 751
  var fields = [];                                                                                     // 752
  _.each(mutator, function (params, op) {                                                              // 753
    if (op.charAt(0) !== '$') {                                                                        // 754
      throw new Meteor.Error(                                                                          // 755
        403, "Access denied. In a restricted collection you can only update documents, not replace them. Use a Mongo update operator, such as '$set'.");
    } else if (!_.has(ALLOWED_UPDATE_OPERATIONS, op)) {                                                // 757
      throw new Meteor.Error(                                                                          // 758
        403, "Access denied. Operator " + op + " not allowed in a restricted collection.");            // 759
    } else {                                                                                           // 760
      _.each(_.keys(params), function (field) {                                                        // 761
        // treat dotted fields as if they are replacing their                                          // 762
        // top-level part                                                                              // 763
        if (field.indexOf('.') !== -1)                                                                 // 764
          field = field.substring(0, field.indexOf('.'));                                              // 765
                                                                                                       // 766
        // record the field we are trying to change                                                    // 767
        if (!_.contains(fields, field))                                                                // 768
          fields.push(field);                                                                          // 769
      });                                                                                              // 770
    }                                                                                                  // 771
  });                                                                                                  // 772
                                                                                                       // 773
  var findOptions = {transform: null};                                                                 // 774
  if (!self._validators.fetchAllFields) {                                                              // 775
    findOptions.fields = {};                                                                           // 776
    _.each(self._validators.fetch, function(fieldName) {                                               // 777
      findOptions.fields[fieldName] = 1;                                                               // 778
    });                                                                                                // 779
  }                                                                                                    // 780
                                                                                                       // 781
  var doc = self._collection.findOne(selector, findOptions);                                           // 782
  if (!doc)  // none satisfied!                                                                        // 783
    return;                                                                                            // 784
                                                                                                       // 785
  var factoriedDoc;                                                                                    // 786
                                                                                                       // 787
  // call user validators.                                                                             // 788
  // Any deny returns true means denied.                                                               // 789
  if (_.any(self._validators.update.deny, function(validator) {                                        // 790
    if (!factoriedDoc)                                                                                 // 791
      factoriedDoc = transformDoc(validator, doc);                                                     // 792
    return validator(userId,                                                                           // 793
                     factoriedDoc,                                                                     // 794
                     fields,                                                                           // 795
                     mutator);                                                                         // 796
  })) {                                                                                                // 797
    throw new Meteor.Error(403, "Access denied");                                                      // 798
  }                                                                                                    // 799
  // Any allow returns true means proceed. Throw error if they all fail.                               // 800
  if (_.all(self._validators.update.allow, function(validator) {                                       // 801
    if (!factoriedDoc)                                                                                 // 802
      factoriedDoc = transformDoc(validator, doc);                                                     // 803
    return !validator(userId,                                                                          // 804
                      factoriedDoc,                                                                    // 805
                      fields,                                                                          // 806
                      mutator);                                                                        // 807
  })) {                                                                                                // 808
    throw new Meteor.Error(403, "Access denied");                                                      // 809
  }                                                                                                    // 810
                                                                                                       // 811
  // Back when we supported arbitrary client-provided selectors, we actually                           // 812
  // rewrote the selector to include an _id clause before passing to Mongo to                          // 813
  // avoid races, but since selector is guaranteed to already just be an ID, we                        // 814
  // don't have to any more.                                                                           // 815
                                                                                                       // 816
  self._collection.update.call(                                                                        // 817
    self._collection, selector, mutator, options);                                                     // 818
};                                                                                                     // 819
                                                                                                       // 820
// Only allow these operations in validated updates. Specifically                                      // 821
// whitelist operations, rather than blacklist, so new complex                                         // 822
// operations that are added aren't automatically allowed. A complex                                   // 823
// operation is one that does more than just modify its target                                         // 824
// field. For now this contains all update operations except '$rename'.                                // 825
// http://docs.mongodb.org/manual/reference/operators/#update                                          // 826
var ALLOWED_UPDATE_OPERATIONS = {                                                                      // 827
  $inc:1, $set:1, $unset:1, $addToSet:1, $pop:1, $pullAll:1, $pull:1,                                  // 828
  $pushAll:1, $push:1, $bit:1                                                                          // 829
};                                                                                                     // 830
                                                                                                       // 831
// Simulate a mongo `remove` operation while validating access control                                 // 832
// rules. See #ValidatedChange                                                                         // 833
Meteor.Collection.prototype._validatedRemove = function(userId, selector) {                            // 834
  var self = this;                                                                                     // 835
                                                                                                       // 836
  var findOptions = {transform: null};                                                                 // 837
  if (!self._validators.fetchAllFields) {                                                              // 838
    findOptions.fields = {};                                                                           // 839
    _.each(self._validators.fetch, function(fieldName) {                                               // 840
      findOptions.fields[fieldName] = 1;                                                               // 841
    });                                                                                                // 842
  }                                                                                                    // 843
                                                                                                       // 844
  var doc = self._collection.findOne(selector, findOptions);                                           // 845
  if (!doc)                                                                                            // 846
    return;                                                                                            // 847
                                                                                                       // 848
  // call user validators.                                                                             // 849
  // Any deny returns true means denied.                                                               // 850
  if (_.any(self._validators.remove.deny, function(validator) {                                        // 851
    return validator(userId, transformDoc(validator, doc));                                            // 852
  })) {                                                                                                // 853
    throw new Meteor.Error(403, "Access denied");                                                      // 854
  }                                                                                                    // 855
  // Any allow returns true means proceed. Throw error if they all fail.                               // 856
  if (_.all(self._validators.remove.allow, function(validator) {                                       // 857
    return !validator(userId, transformDoc(validator, doc));                                           // 858
  })) {                                                                                                // 859
    throw new Meteor.Error(403, "Access denied");                                                      // 860
  }                                                                                                    // 861
                                                                                                       // 862
  // Back when we supported arbitrary client-provided selectors, we actually                           // 863
  // rewrote the selector to {_id: {$in: [ids that we found]}} before passing to                       // 864
  // Mongo to avoid races, but since selector is guaranteed to already just be                         // 865
  // an ID, we don't have to any more.                                                                 // 866
                                                                                                       // 867
  self._collection.remove.call(self._collection, selector);                                            // 868
};                                                                                                     // 869
                                                                                                       // 870
/////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);


/* Exports */
if (typeof Package === 'undefined') Package = {};
Package['mongo-livedata'] = {
  MongoInternals: MongoInternals,
  MongoTest: MongoTest
};

})();
