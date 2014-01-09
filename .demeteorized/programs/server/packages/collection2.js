(function () {

/* Imports */
var Meteor = Package.meteor.Meteor;
var SimpleSchema = Package['simple-schema'].SimpleSchema;
var SchemaRegEx = Package['simple-schema'].SchemaRegEx;
var MongoObject = Package['simple-schema'].MongoObject;
var _ = Package.underscore._;
var Deps = Package.deps.Deps;
var check = Package.check.check;
var Match = Package.check.Match;
var MongoInternals = Package['mongo-livedata'].MongoInternals;

(function () {

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                             //
// packages/collection2/collection2.js                                                                         //
//                                                                                                             //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                               //
// Extend the schema options allowed by SimpleSchema                                                           // 1
SimpleSchema.extendOptions({                                                                                   // 2
  unique: Match.Optional(Boolean),                                                                             // 3
  autoValue: Match.Optional(Function),                                                                         // 4
  denyInsert: Match.Optional(Boolean),                                                                         // 5
  denyUpdate: Match.Optional(Boolean)                                                                          // 6
});                                                                                                            // 7
                                                                                                               // 8
Meteor.Collection2 = function(name, options) {                                                                 // 9
  var self = this, userTransform, existingCollection;                                                          // 10
                                                                                                               // 11
  if (!(self instanceof Meteor.Collection2)) {                                                                 // 12
    throw new Error('use "new" to construct a Meteor.Collection2');                                            // 13
  }                                                                                                            // 14
                                                                                                               // 15
  options = options || {};                                                                                     // 16
                                                                                                               // 17
  if (!("schema" in options)) {                                                                                // 18
    throw new Error('Meteor.Collection2 options must define a schema');                                        // 19
  }                                                                                                            // 20
                                                                                                               // 21
  //set up simpleSchema                                                                                        // 22
  if (options.schema instanceof SimpleSchema) {                                                                // 23
    self._simpleSchema = options.schema;                                                                       // 24
  } else {                                                                                                     // 25
    self._simpleSchema = new SimpleSchema(options.schema);                                                     // 26
  }                                                                                                            // 27
  delete options.schema;                                                                                       // 28
                                                                                                               // 29
  //get the virtual fields                                                                                     // 30
  self._virtualFields = options.virtualFields;                                                                 // 31
  if ("virtualFields" in options) {                                                                            // 32
    delete options.virtualFields;                                                                              // 33
  }                                                                                                            // 34
                                                                                                               // 35
  //populate _autoValues                                                                                       // 36
  self._autoValues = {};                                                                                       // 37
  _.each(self._simpleSchema.schema(), function(definition, fieldName) {                                        // 38
    if ('autoValue' in definition) {                                                                           // 39
      self._autoValues[fieldName] = definition.autoValue;                                                      // 40
    }                                                                                                          // 41
  });                                                                                                          // 42
                                                                                                               // 43
  //create or update the collection                                                                            // 44
  if (name instanceof Meteor.Collection                                                                        // 45
          || ("SmartCollection" in Meteor && name instanceof Meteor.SmartCollection)                           // 46
          || (typeof Offline === "object" && "Collection" in Offline && name instanceof Offline.Collection)) { // 47
    existingCollection = name;                                                                                 // 48
    //set up virtual fields                                                                                    // 49
    if (self._virtualFields) {                                                                                 // 50
      userTransform = existingCollection._transform;                                                           // 51
      options.transform = function(doc) {                                                                      // 52
        //add all virtual fields to document whenever it's passed to a callback                                // 53
        _.each(self._virtualFields, function(func, fieldName, list) {                                          // 54
          doc[fieldName] = func(doc);                                                                          // 55
        });                                                                                                    // 56
        //support user-supplied transformation function as well                                                // 57
        return userTransform ? userTransform(doc) : doc;                                                       // 58
      };                                                                                                       // 59
      existingCollection._transform = Deps._makeNonreactive(options.transform);                                // 60
    }                                                                                                          // 61
    //update the collection                                                                                    // 62
    self._name = existingCollection._name;                                                                     // 63
    self._collection = existingCollection;                                                                     // 64
  } else {                                                                                                     // 65
    //set up virtual fields                                                                                    // 66
    if (self._virtualFields) {                                                                                 // 67
      userTransform = options.transform;                                                                       // 68
      options.transform = function(doc) {                                                                      // 69
        //add all virtual fields to document whenever it's passed to a callback                                // 70
        _.each(self._virtualFields, function(func, fieldName, list) {                                          // 71
          doc[fieldName] = func(doc);                                                                          // 72
        });                                                                                                    // 73
        //support user-supplied transformation function as well                                                // 74
        return userTransform ? userTransform(doc) : doc;                                                       // 75
      };                                                                                                       // 76
    }                                                                                                          // 77
    //create the collection                                                                                    // 78
    self._name = name;                                                                                         // 79
    var useSmart;                                                                                              // 80
    if ("smart" in options) {                                                                                  // 81
      useSmart = options.smart;                                                                                // 82
      delete options.smart;                                                                                    // 83
    }                                                                                                          // 84
    if (useSmart === true && "SmartCollection" in Meteor) {                                                    // 85
      self._collection = new Meteor.SmartCollection(name, options);                                            // 86
    } else {                                                                                                   // 87
      self._collection = new Meteor.Collection(name, options);                                                 // 88
    }                                                                                                          // 89
  }                                                                                                            // 90
  //Validate from the real collection, too.                                                                    // 91
  //This prevents doing C2._collection.insert(invalidDoc) (and update) on the client                           // 92
  self._collection.deny({                                                                                      // 93
    insert: function(userId, doc) {                                                                            // 94
      // Set automatic values                                                                                  // 95
      var newDoc = getAutoValues.call(self, doc, "insert");                                                    // 96
      _.extend(doc, newDoc);                                                                                   // 97
                                                                                                               // 98
      // In case the call to getAutoValues removed anything, remove                                            // 99
      // it from doc, too                                                                                      // 100
      _.each(doc, function (val, key) {                                                                        // 101
        if (! (key in newDoc)) {                                                                               // 102
          delete doc[key];                                                                                     // 103
        }                                                                                                      // 104
      });                                                                                                      // 105
                                                                                                               // 106
      // At this point the _id has been autogenerated and added to doc,                                        // 107
      // and any virtual fields have been added,                                                               // 108
      // which makes it different from what we validated on the client.                                        // 109
      // Clone doc, remove _id and virtual fields, and validate the clone                                      // 110
      var docCopy = _.clone(doc);                                                                              // 111
      if ("_id" in docCopy && !self._simpleSchema.allowsKey("_id")) {                                          // 112
        // Remove _id only if _id doesn't have a definition in the schema                                      // 113
        delete docCopy["_id"];                                                                                 // 114
      }                                                                                                        // 115
                                                                                                               // 116
      // The virtualFields should not be present because we set transform: null,                               // 117
      // but we'll check for them in case it's an older version of Meteor that                                 // 118
      // doesn't recognize the null transform flag                                                             // 119
      if (self._virtualFields) {                                                                               // 120
        _.each(self._virtualFields, function(func, fieldName) {                                                // 121
          if (fieldName in docCopy) {                                                                          // 122
            delete docCopy[fieldName];                                                                         // 123
          }                                                                                                    // 124
        });                                                                                                    // 125
      }                                                                                                        // 126
                                                                                                               // 127
      // Get a throwaway context here to avoid mixing up contexts                                              // 128
      var context = self._simpleSchema.newContext();                                                           // 129
      return !context.validate(docCopy);                                                                       // 130
    },                                                                                                         // 131
    update: function(userId, doc, fields, modifier) {                                                          // 132
      // NOTE: This will never be an upsert because client-side upserts                                        // 133
      // are not allowed once you define allow/deny functions                                                  // 134
                                                                                                               // 135
      // Set automatic values                                                                                  // 136
      _.extend(modifier, getAutoValues.call(self, modifier, "update"));                                        // 137
                                                                                                               // 138
      // Set automatic values                                                                                  // 139
      var newMod = getAutoValues.call(self, modifier, "update");                                               // 140
      _.extend(modifier, newMod);                                                                              // 141
                                                                                                               // 142
      // In case the call to getAutoValues removed anything, remove                                            // 143
      // it from doc, too                                                                                      // 144
      _.each(modifier, function (val, key) {                                                                   // 145
        if (! (key in newMod)) {                                                                               // 146
          delete modifier[key];                                                                                // 147
        }                                                                                                      // 148
      });                                                                                                      // 149
                                                                                                               // 150
      // Get a throwaway context here to avoid mixing up contexts                                              // 151
      var context = self._simpleSchema.newContext();                                                           // 152
      var isValid = context.validate(modifier, {modifier: true});                                              // 153
      // Ignore any notUnique errors until we can figure out how to make them accurate                         // 154
      // i.e., don't count any docs that will be updated by this update selector                               // 155
      // if that is even possible.                                                                             // 156
      // Note that unique validation is still done on the client, so that would catch                          // 157
      // most non-malicious errors. Implementing a unique index in mongo will protect against the rest.        // 158
      var keys = context.invalidKeys();                                                                        // 159
      return !isValid && _.where(keys, {type: "notUnique"}).length !== keys.length;                            // 160
    },                                                                                                         // 161
    fetch: [],                                                                                                 // 162
    transform: null                                                                                            // 163
  });                                                                                                          // 164
  //when the insecure package is used, we will confuse developers if we                                        // 165
  //don't add allow functions because the deny functions that we added                                         // 166
  //will "turn off" the insecure package                                                                       // 167
  if (typeof Package === 'object' && Package.insecure) { //Package is not available pre-0.6.5                  // 168
    self._collection.allow({                                                                                   // 169
      insert: function() {                                                                                     // 170
        return true;                                                                                           // 171
      },                                                                                                       // 172
      update: function() {                                                                                     // 173
        return true;                                                                                           // 174
      },                                                                                                       // 175
      remove: function() {                                                                                     // 176
        return true;                                                                                           // 177
      },                                                                                                       // 178
      fetch: [],                                                                                               // 179
      transform: null                                                                                          // 180
    });                                                                                                        // 181
  }                                                                                                            // 182
                                                                                                               // 183
  // Set up additional checks                                                                                  // 184
  self._simpleSchema.validator(function(key, val, def, op) {                                                   // 185
    var test, totalUsing, usingAndBeingUpdated, sel;                                                           // 186
                                                                                                               // 187
    if (def.denyInsert && val !== void 0 && !op) {                                                             // 188
      // This is an insert of a defined value into a field where denyInsert=true                               // 189
      return "insertNotAllowed";                                                                               // 190
    }                                                                                                          // 191
                                                                                                               // 192
    if (def.denyUpdate && op) {                                                                                // 193
      // This is an insert of a defined value into a field where denyUpdate=true                               // 194
      if (op !== "$set" || (op === "$set" && val !== void 0)) {                                                // 195
        return "updateNotAllowed";                                                                             // 196
      }                                                                                                        // 197
    }                                                                                                          // 198
                                                                                                               // 199
    if ((val === void 0 || val === null) && def.optional) {                                                    // 200
      return true;                                                                                             // 201
    }                                                                                                          // 202
                                                                                                               // 203
    if (def.unique) {                                                                                          // 204
      test = {};                                                                                               // 205
      test[key] = val;                                                                                         // 206
      if (op) { //updating                                                                                     // 207
        if (!self._selector) {                                                                                 // 208
          return true; //we can't determine whether we have a notUnique error                                  // 209
        }                                                                                                      // 210
        //find count of all with key = val                                                                     // 211
        totalUsing = self._collection.find(test).count();                                                      // 212
        if (totalUsing === 0)                                                                                  // 213
          return true;                                                                                         // 214
                                                                                                               // 215
        //find all that match selector for current update operation and also have key = val already            // 216
        sel = self._selector;                                                                                  // 217
        if (typeof sel === "string")                                                                           // 218
          sel = {_id: sel};                                                                                    // 219
                                                                                                               // 220
        if (key in sel && sel[key] !== val) {                                                                  // 221
          //if we're selecting on the unique key with a different value, usingAndBeingUpdated must be 0        // 222
          usingAndBeingUpdated = 0;                                                                            // 223
        } else {                                                                                               // 224
          sel[key] = val;                                                                                      // 225
          usingAndBeingUpdated = self._collection.find(sel).count();                                           // 226
        }                                                                                                      // 227
                                                                                                               // 228
        //if first count > second count, not unique                                                            // 229
        return totalUsing > usingAndBeingUpdated ? "notUnique" : true;                                         // 230
      } else {                                                                                                 // 231
        return self._collection.findOne(test) ? "notUnique" : true;                                            // 232
      }                                                                                                        // 233
    }                                                                                                          // 234
                                                                                                               // 235
    return true;                                                                                               // 236
  });                                                                                                          // 237
};                                                                                                             // 238
                                                                                                               // 239
Meteor.Collection2.prototype._insertOrUpdate = function(type, args) {                                          // 240
  var self = this,                                                                                             // 241
          collection = self._collection,                                                                       // 242
          schema = self._simpleSchema,                                                                         // 243
          doc, callback, error, options, isUpsert;                                                             // 244
                                                                                                               // 245
  if (!args.length) {                                                                                          // 246
    throw new Error(type + " requires an argument");                                                           // 247
  }                                                                                                            // 248
                                                                                                               // 249
  self._selector = null; //reset                                                                               // 250
  if (type === "insert") {                                                                                     // 251
    doc = args[0];                                                                                             // 252
    options = args[1];                                                                                         // 253
    callback = args[2];                                                                                        // 254
  } else if (type === "update" || type === "upsert") {                                                         // 255
    self._selector = args[0];                                                                                  // 256
    doc = args[1];                                                                                             // 257
    options = args[2];                                                                                         // 258
    callback = args[3];                                                                                        // 259
  } else {                                                                                                     // 260
    throw new Error("invalid type argument");                                                                  // 261
  }                                                                                                            // 262
                                                                                                               // 263
  if (!callback && typeof options === "function") {                                                            // 264
    callback = options;                                                                                        // 265
    options = {};                                                                                              // 266
  }                                                                                                            // 267
                                                                                                               // 268
  options = options || {};                                                                                     // 269
                                                                                                               // 270
  //if update was called with upsert:true or upsert was called, flag as an upsert                              // 271
  isUpsert = (type === "upsert" || (type === "update" && options.upsert === true));                            // 272
                                                                                                               // 273
  //remove the options from insert now that we're done with them;                                              // 274
  //the real insert does not have an options argument                                                          // 275
  if (type === "insert" && args[1] !== void 0 && !(typeof args[1] === "function")) {                           // 276
    args.splice(1, 1);                                                                                         // 277
  }                                                                                                            // 278
                                                                                                               // 279
  //add a default callback function if we're on the client and no callback was given                           // 280
  if (Meteor.isClient && !callback) {                                                                          // 281
    // Client can't block, so it can't report errors by exception,                                             // 282
    // only by callback. If they forget the callback, give them a                                              // 283
    // default one that logs the error, so they aren't totally                                                 // 284
    // baffled if their writes don't work because their database is                                            // 285
    // down.                                                                                                   // 286
    callback = function(err) {                                                                                 // 287
      if (err)                                                                                                 // 288
        Meteor._debug(type + " failed: " + (err.reason || err.stack));                                         // 289
    };                                                                                                         // 290
  }                                                                                                            // 291
                                                                                                               // 292
  doc = schema.clean(doc);                                                                                     // 293
                                                                                                               // 294
  // Set automatic values                                                                                      // 295
  // On the server, we actually update the doc, but on the client,                                             // 296
  // we will add them to docToValidate for validation purposes only.                                           // 297
  // This is because we want all actual values generated on the server.                                        // 298
  if (Meteor.isServer) {                                                                                       // 299
    doc = getAutoValues.call(self, doc, ( isUpsert ? "upsert" : type ));                                       // 300
  }                                                                                                            // 301
                                                                                                               // 302
  //On the server, upserts are possible; SimpleSchema handles upserts pretty                                   // 303
  //well by default, but it will not know about the fields in the selector,                                    // 304
  //which are also stored in the database if an insert is performed. So we                                     // 305
  //will allow these fields to be considered for validation by adding them                                     // 306
  //to the $set in the modifier. This is no doubt prone to errors, but there                                   // 307
  //probably isn't any better way right now.                                                                   // 308
  var docToValidate = _.clone(doc);                                                                            // 309
  if (Meteor.isServer && isUpsert && _.isObject(self._selector)) {                                             // 310
    var set = docToValidate.$set || {};                                                                        // 311
    docToValidate.$set = _.clone(self._selector);                                                              // 312
    _.extend(docToValidate.$set, set);                                                                         // 313
  }                                                                                                            // 314
                                                                                                               // 315
  // Set automatic values for validation on the client                                                         // 316
  if (Meteor.isClient) {                                                                                       // 317
    docToValidate = getAutoValues.call(self, docToValidate, ( isUpsert ? "upsert" : type ));                   // 318
  }                                                                                                            // 319
                                                                                                               // 320
  //validate doc                                                                                               // 321
  var isValid = schema.namedContext(options.validationContext).validate(docToValidate, {                       // 322
    modifier: (type === "update" || type === "upsert"),                                                        // 323
    upsert: isUpsert,                                                                                          // 324
    // Skip filter and autoconvert because we already called clean()                                           // 325
    filter: false,                                                                                             // 326
    autoConvert: false                                                                                         // 327
  });                                                                                                          // 328
  self._selector = null; //reset                                                                               // 329
                                                                                                               // 330
  if (isValid) {                                                                                               // 331
    if (type === "insert") {                                                                                   // 332
      args[0] = doc; //update to reflect cleaned doc                                                           // 333
      return collection.insert.apply(collection, args);                                                        // 334
    } else if (type === "update") {                                                                            // 335
      args[1] = doc; //update to reflect cleaned doc                                                           // 336
      return collection.update.apply(collection, args);                                                        // 337
    } else if (type === "upsert") {                                                                            // 338
      args[1] = doc; //update to reflect cleaned doc                                                           // 339
      return collection.upsert.apply(collection, args);                                                        // 340
    }                                                                                                          // 341
  } else {                                                                                                     // 342
    error = new Error("failed validation");                                                                    // 343
    if (callback) {                                                                                            // 344
      callback(error);                                                                                         // 345
      return null;                                                                                             // 346
    }                                                                                                          // 347
    throw error;                                                                                               // 348
  }                                                                                                            // 349
};                                                                                                             // 350
                                                                                                               // 351
Meteor.Collection2.prototype.insert = function(/* arguments */) {                                              // 352
  var args = _.toArray(arguments);                                                                             // 353
  return this._insertOrUpdate("insert", args);                                                                 // 354
};                                                                                                             // 355
                                                                                                               // 356
Meteor.Collection2.prototype.update = function(/* arguments */) {                                              // 357
  var args = _.toArray(arguments);                                                                             // 358
  return this._insertOrUpdate("update", args);                                                                 // 359
};                                                                                                             // 360
                                                                                                               // 361
Meteor.Collection2.prototype.upsert = function(/* arguments */) {                                              // 362
  if (!this._collection.upsert)                                                                                // 363
    throw new Error("Meteor 0.6.6 or higher is required to do an upsert");                                     // 364
                                                                                                               // 365
  var args = _.toArray(arguments);                                                                             // 366
  return this._insertOrUpdate("upsert", args);                                                                 // 367
};                                                                                                             // 368
                                                                                                               // 369
Meteor.Collection2.prototype.simpleSchema = function() {                                                       // 370
  return this._simpleSchema;                                                                                   // 371
};                                                                                                             // 372
                                                                                                               // 373
//DEPRECATED; Use myC2.simpleSchema().namedContext() instead                                                   // 374
Meteor.Collection2.prototype.namedContext = function(name) {                                                   // 375
  return this._simpleSchema.namedContext(name);                                                                // 376
};                                                                                                             // 377
                                                                                                               // 378
//DEPRECATED; Use myC2.simpleSchema().namedContext().validate() instead                                        // 379
Meteor.Collection2.prototype.validate = function(doc, options) {                                               // 380
  options = options || {};                                                                                     // 381
  // Validate doc and return validity                                                                          // 382
  return this._simpleSchema.namedContext(options.validationContext).validate(doc, options);                    // 383
};                                                                                                             // 384
                                                                                                               // 385
//DEPRECATED; Use myC2.simpleSchema().namedContext().validateOne() instead                                     // 386
Meteor.Collection2.prototype.validateOne = function(doc, keyName, options) {                                   // 387
  options = options || {};                                                                                     // 388
  // Validate doc and return validity                                                                          // 389
  return this._simpleSchema.namedContext(options.validationContext).validateOne(doc, keyName, options);        // 390
};                                                                                                             // 391
                                                                                                               // 392
//Pass-through Methods                                                                                         // 393
                                                                                                               // 394
Meteor.Collection2.prototype.remove = function(/* arguments */) {                                              // 395
  var self = this, collection = self._collection;                                                              // 396
  return collection.remove.apply(collection, arguments);                                                       // 397
};                                                                                                             // 398
                                                                                                               // 399
Meteor.Collection2.prototype.allow = function(/* arguments */) {                                               // 400
  var self = this, collection = self._collection;                                                              // 401
  return collection.allow.apply(collection, arguments);                                                        // 402
};                                                                                                             // 403
                                                                                                               // 404
Meteor.Collection2.prototype.deny = function(/* arguments */) {                                                // 405
  var self = this, collection = self._collection;                                                              // 406
  return collection.deny.apply(collection, arguments);                                                         // 407
};                                                                                                             // 408
                                                                                                               // 409
Meteor.Collection2.prototype.find = function(/* arguments */) {                                                // 410
  var self = this, collection = self._collection;                                                              // 411
  return collection.find.apply(collection, arguments);                                                         // 412
};                                                                                                             // 413
                                                                                                               // 414
Meteor.Collection2.prototype.findOne = function(/* arguments */) {                                             // 415
  var self = this, collection = self._collection;                                                              // 416
  return collection.findOne.apply(collection, arguments);                                                      // 417
};                                                                                                             // 418
                                                                                                               // 419
// Updates doc with automatic values from autoValue functions                                                  // 420
var getAutoValues = function(doc, type) {                                                                      // 421
  var self = this;                                                                                             // 422
  var mDoc = new MongoObject(doc);                                                                             // 423
  _.each(self._autoValues, function(func, fieldName) {                                                         // 424
    var keyInfo = mDoc.getArrayInfoForKey(fieldName) || mDoc.getInfoForKey(fieldName) || {};                   // 425
    var doUnset = false;                                                                                       // 426
    var autoValue = func.call({                                                                                // 427
      isInsert: (type === "insert"),                                                                           // 428
      isUpdate: (type === "update"),                                                                           // 429
      isUpsert: (type === "upsert"),                                                                           // 430
      isSet: mDoc.affectsGenericKey(fieldName),                                                                // 431
      unset: function () {                                                                                     // 432
        doUnset = true;                                                                                        // 433
      },                                                                                                       // 434
      value: keyInfo.value,                                                                                    // 435
      operator: keyInfo.operator,                                                                              // 436
      field: function(fName) {                                                                                 // 437
        var keyInfo = mDoc.getArrayInfoForKey(fName) || mDoc.getInfoForKey(fName) || {};                       // 438
        return {                                                                                               // 439
          isSet: (keyInfo.value !== void 0),                                                                   // 440
          value: keyInfo.value,                                                                                // 441
          operator: keyInfo.operator                                                                           // 442
        };                                                                                                     // 443
      }                                                                                                        // 444
    }, doc);                                                                                                   // 445
                                                                                                               // 446
    if (autoValue === void 0) {                                                                                // 447
      doUnset && mDoc.removeKey(fieldName);                                                                    // 448
      return;                                                                                                  // 449
    }                                                                                                          // 450
                                                                                                               // 451
    var fieldNameHasDollar = (fieldName.indexOf(".$") !== -1);                                                 // 452
    var newValue = autoValue;                                                                                  // 453
    var op = null;                                                                                             // 454
    if (_.isObject(autoValue)) {                                                                               // 455
      for (var key in autoValue) {                                                                             // 456
        if (autoValue.hasOwnProperty(key) && key.substring(0, 1) === "$") {                                    // 457
          if (fieldNameHasDollar) {                                                                            // 458
            throw new Error("The return value of an autoValue function may not be an object with update operators when the field name contains a dollar sign");
          }                                                                                                    // 460
          op = key;                                                                                            // 461
          newValue = autoValue[key];                                                                           // 462
          break;                                                                                               // 463
        }                                                                                                      // 464
      }                                                                                                        // 465
    }                                                                                                          // 466
                                                                                                               // 467
    // Add $set for updates and upserts if necessary                                                           // 468
    if (op === null && type !== "insert") {                                                                    // 469
      op = "$set";                                                                                             // 470
    }                                                                                                          // 471
                                                                                                               // 472
    if (fieldNameHasDollar) {                                                                                  // 473
      // There is no way to know which specific keys should be set to                                          // 474
      // the autoValue, so we will set only keys that exist                                                    // 475
      // in the object and match this generic key.                                                             // 476
      mDoc.setValueForGenericKey(fieldName, newValue);                                                         // 477
    } else {                                                                                                   // 478
      mDoc.removeKey(fieldName);                                                                               // 479
      mDoc.addKey(fieldName, newValue, op);                                                                    // 480
    }                                                                                                          // 481
  });                                                                                                          // 482
  return mDoc.getObject();                                                                                     // 483
};                                                                                                             // 484
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);


/* Exports */
if (typeof Package === 'undefined') Package = {};
Package.collection2 = {};

})();
