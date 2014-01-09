(function () {

/* Imports */
var Meteor = Package.meteor.Meteor;
var Deps = Package.deps.Deps;
var _ = Package.underscore._;
var check = Package.check.check;
var Match = Package.check.Match;

/* Package-scope variables */
var SimpleSchema, SchemaRegEx, MongoObject, S, looksLikeModifier, SimpleSchemaValidationContext;

(function () {

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                    //
// packages/simple-schema/mongo-object.js                                                                             //
//                                                                                                                    //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                      //
/*                                                                                                                    // 1
 * @constructor                                                                                                       // 2
 * @param {Object} objOrModifier                                                                                      // 3
 * @returns {undefined}                                                                                               // 4
 */                                                                                                                   // 5
MongoObject = function(objOrModifier) {                                                                               // 6
  var self = this;                                                                                                    // 7
  self._obj = objOrModifier;                                                                                          // 8
  self._affectedKeys = {};                                                                                            // 9
  self._genericAffectedKeys = {};                                                                                     // 10
                                                                                                                      // 11
  function parseObj(val, currentPosition, affectedKey, operator, adjusted) {                                          // 12
                                                                                                                      // 13
    // Adjust for first-level modifier operators                                                                      // 14
    if (!operator && affectedKey && affectedKey.substring(0, 1) === "$") {                                            // 15
      operator = affectedKey;                                                                                         // 16
      affectedKey = null;                                                                                             // 17
    }                                                                                                                 // 18
                                                                                                                      // 19
    if (affectedKey) {                                                                                                // 20
                                                                                                                      // 21
      // Adjust for $push and $addToSet                                                                               // 22
      if (!adjusted && (operator === "$push" || operator === "$addToSet" || operator === "$pull" || operator === "$pop")) {
        // Adjust for $each                                                                                           // 24
        // We can simply jump forward and pretend like the $each array                                                // 25
        // is the array for the field. This has the added benefit of                                                  // 26
        // skipping past any $slice, which we also don't care about.                                                  // 27
        if (isBasicObject(val) && "$each" in val) {                                                                   // 28
          val = val.$each;                                                                                            // 29
          currentPosition = currentPosition + "[$each]";                                                              // 30
        } else {                                                                                                      // 31
          affectedKey = affectedKey + ".0";                                                                           // 32
        }                                                                                                             // 33
        adjusted = true;                                                                                              // 34
      }                                                                                                               // 35
                                                                                                                      // 36
      if (currentPosition && (!isBasicObject(val) || _.isEmpty(val)) && (!_.isArray(val) || _.isEmpty(val))) {        // 37
        self._affectedKeys[currentPosition] = affectedKey;                                                            // 38
        self._genericAffectedKeys[currentPosition] = makeGeneric(affectedKey);                                        // 39
      }                                                                                                               // 40
    }                                                                                                                 // 41
                                                                                                                      // 42
    // Loop through arrays                                                                                            // 43
    if (_.isArray(val)) {                                                                                             // 44
      _.each(val, function(v, i) {                                                                                    // 45
        parseObj(v, (currentPosition ? currentPosition + "[" + i + "]" : i), affectedKey + '.' + i, operator, adjusted);
      });                                                                                                             // 47
    }                                                                                                                 // 48
                                                                                                                      // 49
    // Loop through object keys                                                                                       // 50
    else if (isBasicObject(val)) {                                                                                    // 51
      _.each(val, function(v, k) {                                                                                    // 52
        if (k !== "$slice") {                                                                                         // 53
          parseObj(v, (currentPosition ? currentPosition + "[" + k + "]" : k), appendAffectedKey(affectedKey, k), operator, adjusted);
        }                                                                                                             // 55
      });                                                                                                             // 56
    }                                                                                                                 // 57
                                                                                                                      // 58
  }                                                                                                                   // 59
  parseObj(objOrModifier);                                                                                            // 60
                                                                                                                      // 61
//  (function recurse(obj, currentPosition, affectedKey, isUnderOperator, isUnderEachOrPullAll, isUnderArrayOperator) {
//    var newAffectedKey;                                                                                             // 63
//    var objIsArray = isArray(obj);                                                                                  // 64
//    var objIsObject = isBasicObject(obj);                                                                           // 65
//                                                                                                                    // 66
//    //store values, affectedKeys, and genericAffectedKeys                                                           // 67
//    if (currentPosition && (!objIsObject || _.isEmpty(obj)) && (!objIsArray || _.isEmpty(obj))) {                   // 68
//      self._affectedKeys[currentPosition] = affectedKey;                                                            // 69
//      self._genericAffectedKeys[currentPosition] = makeGeneric(affectedKey);                                        // 70
//    }                                                                                                               // 71
//                                                                                                                    // 72
//    //loop through array items                                                                                      // 73
//    else if (objIsArray) {                                                                                          // 74
//      for (var i = 0, ln = obj.length; i < ln; i++) {                                                               // 75
//        if (isUnderEachOrPullAll) {                                                                                 // 76
//          newAffectedKey = affectedKey;                                                                             // 77
//        } else {                                                                                                    // 78
//          newAffectedKey = (affectedKey ? affectedKey + "." + i : i);                                               // 79
//        }                                                                                                           // 80
//        recurse(obj[i],                                                                                             // 81
//                (currentPosition ? currentPosition + "[" + i + "]" : i),                                            // 82
//                newAffectedKey,                                                                                     // 83
//                isUnderOperator,                                                                                    // 84
//                null, // Only the first array needs to be treated differently                                       // 85
//                isUnderArrayOperator                                                                                // 86
//                );                                                                                                  // 87
//      }                                                                                                             // 88
//    }                                                                                                               // 89
//                                                                                                                    // 90
//    //recurse into objects                                                                                          // 91
//    else if (objIsObject) {                                                                                         // 92
//      for (var key in obj) {                                                                                        // 93
//        if (obj.hasOwnProperty(key)) {                                                                              // 94
//          if (key.substring(0, 1) === "$") {                                                                        // 95
//            newAffectedKey = affectedKey;                                                                           // 96
//          } else if (isUnderArrayOperator) {                                                                        // 97
//            newAffectedKey = (affectedKey ? affectedKey + ".$." + key : key);                                       // 98
//          } else {                                                                                                  // 99
//            newAffectedKey = (affectedKey ? affectedKey + "." + key : key);                                         // 100
//          }                                                                                                         // 101
//          if (key !== "$slice") {                                                                                   // 102
//            recurse(obj[key], //value                                                                               // 103
//                    (currentPosition ? currentPosition + "[" + key + "]" : key), //position                         // 104
//                    newAffectedKey,                                                                                 // 105
//                    (isUnderOperator || key.substring(0, 1) === "$"),                                               // 106
//                    // For $each and $pullAll, the first array we come to after                                     // 107
//                    // the operator needs to be treated differently                                                 // 108
//                    (isUnderEachOrPullAll || key === "$each" || key === "$pullAll"),                                // 109
//                    (isUnderArrayOperator || key === "$push" || key === "$addToSet" || key === "$pull" || key === "$pop")
//                    );                                                                                              // 111
//          }                                                                                                         // 112
//      }                                                                                                             // 113
//    }                                                                                                               // 114
//  }                                                                                                                 // 115
//})(objOrModifier);                                                                                                  // 116
                                                                                                                      // 117
  // Runs a function for each endpoint node in the object tree, including all items in every array.                   // 118
  // The function arguments are                                                                                       // 119
  // (1) the value at this node                                                                                       // 120
  // (2) a string representing the node position                                                                      // 121
  // (3) the representation of what would be changed in mongo, using mongo dot notation                               // 122
  // (4) the generic equivalent of argument 3, with "$" instead of numeric pieces                                     // 123
  self.forEachNode = function(func) {                                                                                 // 124
    if (typeof func !== "function")                                                                                   // 125
      throw new Error("filter requires a loop function");                                                             // 126
    _.each(self._affectedKeys, function(affectedKey, position) {                                                      // 127
      func.call({                                                                                                     // 128
        updateValue: function(newVal) {                                                                               // 129
          self.setValueForPosition(position, newVal);                                                                 // 130
        },                                                                                                            // 131
        remove: function() {                                                                                          // 132
          self.removeValueForPosition(position);                                                                      // 133
        }                                                                                                             // 134
      }, self.getValueForPosition(position), position, affectedKey, self._genericAffectedKeys[position]);             // 135
    });                                                                                                               // 136
  };                                                                                                                  // 137
                                                                                                                      // 138
  self.getValueForPosition = function(position) {                                                                     // 139
    var subkey, subkeys = position.split("["), current = self._obj;                                                   // 140
    for (var i = 0, ln = subkeys.length; i < ln; i++) {                                                               // 141
      subkey = subkeys[i];                                                                                            // 142
      // If the subkey ends in "]", remove the ending                                                                 // 143
      if (subkey.slice(-1) === "]") {                                                                                 // 144
        subkey = subkey.slice(0, -1);                                                                                 // 145
      }                                                                                                               // 146
      current = current[subkey];                                                                                      // 147
      if (!isArray(current) && !isBasicObject(current) && i < ln - 1) {                                               // 148
        return;                                                                                                       // 149
      }                                                                                                               // 150
    }                                                                                                                 // 151
    return current;                                                                                                   // 152
  };                                                                                                                  // 153
                                                                                                                      // 154
  self.setValueForPosition = function(position, value) {                                                              // 155
    var nextPiece, subkey, subkeys = position.split("["), current = self._obj;                                        // 156
    for (var i = 0, ln = subkeys.length; i < ln; i++) {                                                               // 157
      subkey = subkeys[i];                                                                                            // 158
      // If the subkey ends in "]", remove the ending                                                                 // 159
      if (subkey.slice(-1) === "]") {                                                                                 // 160
        subkey = subkey.slice(0, -1);                                                                                 // 161
      }                                                                                                               // 162
      if (i === ln - 1) {                                                                                             // 163
        current[subkey] = value;                                                                                      // 164
        //if value is undefined, delete the property                                                                  // 165
        if (value === void 0)                                                                                         // 166
          delete current[subkey];                                                                                     // 167
      } else {                                                                                                        // 168
        if (current[subkey] === void 0) {                                                                             // 169
          //see if the next piece is a number                                                                         // 170
          nextPiece = subkeys[i + 1];                                                                                 // 171
          nextPiece = parseInt(nextPiece, 10);                                                                        // 172
          current[subkey] = isNaN(nextPiece) ? {} : [];                                                               // 173
        }                                                                                                             // 174
        current = current[subkey];                                                                                    // 175
        if (!isArray(current) && !isBasicObject(current) && i < ln - 1) {                                             // 176
          return;                                                                                                     // 177
        }                                                                                                             // 178
      }                                                                                                               // 179
    }                                                                                                                 // 180
  };                                                                                                                  // 181
                                                                                                                      // 182
  self.removeValueForPosition = function(position) {                                                                  // 183
//    var subkey, subkeys = position.split("["), current = self._obj;                                                 // 184
//    for (var i = 0, ln = subkeys.length; i < ln; i++) {                                                             // 185
//      subkey = subkeys[i];                                                                                          // 186
//      // If the subkey ends in "]", remove the ending                                                               // 187
//      if (subkey.slice(-1) === "]") {                                                                               // 188
//        subkey = subkey.slice(0, -1);                                                                               // 189
//      }                                                                                                             // 190
//      if (i === ln - 1) {                                                                                           // 191
//        delete current[subkey];                                                                                     // 192
//      } else {                                                                                                      // 193
//        current = current[subkey];                                                                                  // 194
//        if (!isArray(current) && !isBasicObject(current) && i < ln - 1) {                                           // 195
//          return;                                                                                                   // 196
//        }                                                                                                           // 197
//      }                                                                                                             // 198
//    }                                                                                                               // 199
                                                                                                                      // 200
    // Update affected key caches                                                                                     // 201
    for (var p in self._genericAffectedKeys) {                                                                        // 202
      if (self._genericAffectedKeys.hasOwnProperty(p)) {                                                              // 203
        if (position.slice(0, p.length) === p) {                                                                      // 204
          delete self._genericAffectedKeys[p];                                                                        // 205
          delete self._affectedKeys[p];                                                                               // 206
        }                                                                                                             // 207
      }                                                                                                               // 208
    }                                                                                                                 // 209
                                                                                                                      // 210
    // Rebuild _obj. This is necessary instead of deleting individual                                                 // 211
    // nodes because it's the easier way to make sure ancestor nodes                                                  // 212
    // are deleted as needed, too.                                                                                    // 213
    self.rebuildObject();                                                                                             // 214
  };                                                                                                                  // 215
                                                                                                                      // 216
  // Returns the full array for the requested non-generic key,                                                        // 217
  // if its value is an array                                                                                         // 218
  self.getArrayInfoForKey = function(key) {                                                                           // 219
    key = key + ".$";                                                                                                 // 220
    var start, firstPositionPiece, v;                                                                                 // 221
    for (var p in self._genericAffectedKeys) {                                                                        // 222
      if (self._genericAffectedKeys.hasOwnProperty(p)) {                                                              // 223
        if (self._genericAffectedKeys[p] === key) {                                                                   // 224
          // Get the position string without the final array index                                                    // 225
          start = p.slice(0, p.lastIndexOf("["));                                                                     // 226
          firstPositionPiece = p.slice(0, p.indexOf("["));                                                            // 227
          v = self.getValueForPosition(start);                                                                        // 228
          if (isArray(v)) {                                                                                           // 229
            return {                                                                                                  // 230
              value: v,                                                                                               // 231
              operator: (firstPositionPiece.substring(0, 1) === "$") ? firstPositionPiece : null                      // 232
            };                                                                                                        // 233
          }                                                                                                           // 234
        }                                                                                                             // 235
      }                                                                                                               // 236
    }                                                                                                                 // 237
  };                                                                                                                  // 238
                                                                                                                      // 239
  // Returns the value of the requested non-generic key                                                               // 240
  self.getValueForKey = function(key) {                                                                               // 241
    for (var position in self._affectedKeys) {                                                                        // 242
      if (self._affectedKeys.hasOwnProperty(position)) {                                                              // 243
        if (self._affectedKeys[position] === key) {                                                                   // 244
          // We return the first one we find. While it's                                                              // 245
          // possible that multiple update operators could                                                            // 246
          // affect the same key, mongo generally doesn't                                                             // 247
          // like this, so we'll assume that's not the case.                                                          // 248
          return self.getValueForPosition(position);                                                                  // 249
        }                                                                                                             // 250
      }                                                                                                               // 251
    }                                                                                                                 // 252
  };                                                                                                                  // 253
                                                                                                                      // 254
  // Returns the value and operator of the requested non-generic key                                                  // 255
  self.getInfoForKey = function(key) {                                                                                // 256
    for (var position in self._affectedKeys) {                                                                        // 257
      if (self._affectedKeys.hasOwnProperty(position)) {                                                              // 258
        if (self._affectedKeys[position] === key) {                                                                   // 259
          // We return the first one we find. While it's                                                              // 260
          // possible that multiple update operators could                                                            // 261
          // affect the same generic key, especially where                                                            // 262
          // arrays are involved, we'll assume that's not the case.                                                   // 263
          var firstPositionPiece = position.slice(0, position.indexOf("["));                                          // 264
          return {                                                                                                    // 265
            value: self.getValueForPosition(position),                                                                // 266
            operator: (firstPositionPiece.substring(0, 1) === "$") ? firstPositionPiece : null                        // 267
          };                                                                                                          // 268
        }                                                                                                             // 269
      }                                                                                                               // 270
    }                                                                                                                 // 271
  };                                                                                                                  // 272
                                                                                                                      // 273
  // Adds key with value val                                                                                          // 274
  self.addKey = function(key, val, op) {                                                                              // 275
    var position, keyPieces;                                                                                          // 276
    if (typeof op === "string") {                                                                                     // 277
      position = op + "[" + key + "]";                                                                                // 278
    } else {                                                                                                          // 279
      keyPieces = key.split(".");                                                                                     // 280
      for (var i = 0, ln = keyPieces.length; i < ln; i++) {                                                           // 281
        if (i === 0) {                                                                                                // 282
          position = keyPieces[i];                                                                                    // 283
        } else {                                                                                                      // 284
          position += "[" + keyPieces[i] + "]";                                                                       // 285
        }                                                                                                             // 286
      }                                                                                                               // 287
    }                                                                                                                 // 288
                                                                                                                      // 289
    self.setValueForPosition(position, val);                                                                          // 290
    self._affectedKeys[position] = key;                                                                               // 291
    self._genericAffectedKeys[position] = makeGeneric(key);                                                           // 292
  };                                                                                                                  // 293
                                                                                                                      // 294
  // Removes the requested generic key                                                                                // 295
  self.removeGenericKey = function(key) {                                                                             // 296
    for (var position in self._genericAffectedKeys) {                                                                 // 297
      if (self._genericAffectedKeys.hasOwnProperty(position)) {                                                       // 298
        if (self._genericAffectedKeys[position] === key) {                                                            // 299
          self.removeValueForPosition(position);                                                                      // 300
        }                                                                                                             // 301
      }                                                                                                               // 302
    }                                                                                                                 // 303
  };                                                                                                                  // 304
                                                                                                                      // 305
  // Removes the requested non-generic key                                                                            // 306
  self.removeKey = function(key) {                                                                                    // 307
    for (var position in self._affectedKeys) {                                                                        // 308
      if (self._affectedKeys.hasOwnProperty(position)) {                                                              // 309
        if (self._affectedKeys[position] === key) {                                                                   // 310
          self.removeValueForPosition(position);                                                                      // 311
        }                                                                                                             // 312
      }                                                                                                               // 313
    }                                                                                                                 // 314
  };                                                                                                                  // 315
                                                                                                                      // 316
  // Removes the requested non-generic keys                                                                           // 317
  self.removeKeys = function(keys) {                                                                                  // 318
    for (var i = 0, ln = keys.length; i < ln; i++) {                                                                  // 319
      self.removeKey(keys[i]);                                                                                        // 320
    }                                                                                                                 // 321
  };                                                                                                                  // 322
                                                                                                                      // 323
  // Passes all affected keys to a test function, which                                                               // 324
  // should return false to remove whatever is affecting that key                                                     // 325
  self.filterGenericKeys = function(test) {                                                                           // 326
    var gk, checkedKeys = [];                                                                                         // 327
    for (var position in self._genericAffectedKeys) {                                                                 // 328
      if (self._genericAffectedKeys.hasOwnProperty(position)) {                                                       // 329
        gk = self._genericAffectedKeys[position];                                                                     // 330
        if (!_.contains(checkedKeys, gk)) {                                                                           // 331
          checkedKeys.push(gk);                                                                                       // 332
          if (gk && !test(gk)) {                                                                                      // 333
            self.removeGenericKey(gk);                                                                                // 334
          }                                                                                                           // 335
        }                                                                                                             // 336
      }                                                                                                               // 337
    }                                                                                                                 // 338
  };                                                                                                                  // 339
                                                                                                                      // 340
  // Sets the value of the requested non-generic key                                                                  // 341
  self.setValueForKey = function(key, val) {                                                                          // 342
    for (var position in self._affectedKeys) {                                                                        // 343
      if (self._affectedKeys.hasOwnProperty(position)) {                                                              // 344
        if (self._affectedKeys[position] === key) {                                                                   // 345
          self.setValueForPosition(position, val);                                                                    // 346
        }                                                                                                             // 347
      }                                                                                                               // 348
    }                                                                                                                 // 349
  };                                                                                                                  // 350
                                                                                                                      // 351
  // Sets the value of the requested generic key                                                                      // 352
  self.setValueForGenericKey = function(key, val) {                                                                   // 353
    for (var position in self._genericAffectedKeys) {                                                                 // 354
      if (self._genericAffectedKeys.hasOwnProperty(position)) {                                                       // 355
        if (self._genericAffectedKeys[position] === key) {                                                            // 356
          self.setValueForPosition(position, val);                                                                    // 357
        }                                                                                                             // 358
      }                                                                                                               // 359
    }                                                                                                                 // 360
  };                                                                                                                  // 361
                                                                                                                      // 362
  // Gets a normal object based on the MongoObject instance                                                           // 363
  self.getObject = function() {                                                                                       // 364
    return self._obj;                                                                                                 // 365
  };                                                                                                                  // 366
                                                                                                                      // 367
  self.rebuildObject = function() {                                                                                   // 368
    var newObj = {};                                                                                                  // 369
    _.each(self._affectedKeys, function(affectedKey, position) {                                                      // 370
      MongoObject.expandKey(self.getValueForPosition(position), position, newObj);                                    // 371
    });                                                                                                               // 372
    self._obj = newObj;                                                                                               // 373
  };                                                                                                                  // 374
                                                                                                                      // 375
  // Gets a flat object based on the MongoObject instance.                                                            // 376
  // In a flat object, the key is the name of the non-generic affectedKey,                                            // 377
  // with mongo dot notation if necessary, and the value is the value for                                             // 378
  // that key.                                                                                                        // 379
  self.getFlatObject = function() {                                                                                   // 380
    var newObj = {};                                                                                                  // 381
    _.each(self._affectedKeys, function(affectedKey, position) {                                                      // 382
      if (typeof affectedKey === "string") {                                                                          // 383
        newObj[affectedKey] = self.getValueForPosition(position);                                                     // 384
      }                                                                                                               // 385
    });                                                                                                               // 386
    return newObj;                                                                                                    // 387
  };                                                                                                                  // 388
                                                                                                                      // 389
  // Returns true if the non-generic key is affected by this object                                                   // 390
  self.affectsKey = function(key) {                                                                                   // 391
    for (var position in self._affectedKeys) {                                                                        // 392
      if (self._affectedKeys.hasOwnProperty(position)) {                                                              // 393
        if (self._affectedKeys[position] === key) {                                                                   // 394
          return true;                                                                                                // 395
        }                                                                                                             // 396
      }                                                                                                               // 397
    }                                                                                                                 // 398
    return false;                                                                                                     // 399
  };                                                                                                                  // 400
                                                                                                                      // 401
  // Returns true if the generic key is affected by this object                                                       // 402
  self.affectsGenericKey = function(key) {                                                                            // 403
    for (var position in self._genericAffectedKeys) {                                                                 // 404
      if (self._genericAffectedKeys.hasOwnProperty(position)) {                                                       // 405
        if (self._genericAffectedKeys[position] === key) {                                                            // 406
          return true;                                                                                                // 407
        }                                                                                                             // 408
      }                                                                                                               // 409
    }                                                                                                                 // 410
    return false;                                                                                                     // 411
  };                                                                                                                  // 412
                                                                                                                      // 413
  // Like affectsGenericKey, but will return true if a child key is affected                                          // 414
  self.affectsGenericKeyImplicit = function(key) {                                                                    // 415
    for (var position in self._genericAffectedKeys) {                                                                 // 416
      if (self._genericAffectedKeys.hasOwnProperty(position)) {                                                       // 417
        var affectedKey = self._genericAffectedKeys[position];                                                        // 418
                                                                                                                      // 419
        // If the affected key is the test key                                                                        // 420
        if (affectedKey === key) {                                                                                    // 421
          return true;                                                                                                // 422
        }                                                                                                             // 423
                                                                                                                      // 424
        // If the affected key implies the test key because the affected key                                          // 425
        // starts with the test key followed by a period                                                              // 426
        if (affectedKey.substring(0, key.length + 1) === key + ".") {                                                 // 427
          return true;                                                                                                // 428
        }                                                                                                             // 429
                                                                                                                      // 430
        // If the affected key implies the test key because the affected key                                          // 431
        // starts with the test key and the test key ends with ".$"                                                   // 432
        var lastTwo = key.slice(-2);                                                                                  // 433
        if (lastTwo === ".$" && key.slice(0, -2) === affectedKey) {                                                   // 434
          return true;                                                                                                // 435
        }                                                                                                             // 436
      }                                                                                                               // 437
    }                                                                                                                 // 438
    return false;                                                                                                     // 439
  };                                                                                                                  // 440
};                                                                                                                    // 441
                                                                                                                      // 442
/** Takes a string representation of an object key and its value                                                      // 443
 *  and updates "obj" to contain that key with that value.                                                            // 444
 *                                                                                                                    // 445
 *  Example keys and results if val is 1:                                                                             // 446
 *    "a" -> {a: 1}                                                                                                   // 447
 *    "a[b]" -> {a: {b: 1}}                                                                                           // 448
 *    "a[b][0]" -> {a: {b: [1]}}                                                                                      // 449
 *    "a[b.0.c]" -> {a: {'b.0.c': 1}}                                                                                 // 450
 */                                                                                                                   // 451
                                                                                                                      // 452
/** Takes a string representation of an object key and its value                                                      // 453
 *  and updates "obj" to contain that key with that value.                                                            // 454
 *                                                                                                                    // 455
 *  Example keys and results if val is 1:                                                                             // 456
 *    "a" -> {a: 1}                                                                                                   // 457
 *    "a[b]" -> {a: {b: 1}}                                                                                           // 458
 *    "a[b][0]" -> {a: {b: [1]}}                                                                                      // 459
 *    "a[b.0.c]" -> {a: {'b.0.c': 1}}                                                                                 // 460
 *                                                                                                                    // 461
 * @param {any} val                                                                                                   // 462
 * @param {String} key                                                                                                // 463
 * @param {Object} obj                                                                                                // 464
 * @returns {undefined}                                                                                               // 465
 */                                                                                                                   // 466
MongoObject.expandKey = function(val, key, obj) {                                                                     // 467
  var nextPiece, subkey, subkeys = key.split("["), current = obj;                                                     // 468
  for (var i = 0, ln = subkeys.length; i < ln; i++) {                                                                 // 469
    subkey = subkeys[i];                                                                                              // 470
    if (subkey.slice(-1) === "]") {                                                                                   // 471
      subkey = subkey.slice(0, -1);                                                                                   // 472
    }                                                                                                                 // 473
    if (i === ln - 1) {                                                                                               // 474
      //last iteration; time to set the value; always overwrite                                                       // 475
      current[subkey] = val;                                                                                          // 476
      //if val is undefined, delete the property                                                                      // 477
      if (val === void 0)                                                                                             // 478
        delete current[subkey];                                                                                       // 479
    } else {                                                                                                          // 480
      //see if the next piece is a number                                                                             // 481
      nextPiece = subkeys[i + 1];                                                                                     // 482
      nextPiece = parseInt(nextPiece, 10);                                                                            // 483
      if (!current[subkey]) {                                                                                         // 484
        current[subkey] = isNaN(nextPiece) ? {} : [];                                                                 // 485
      }                                                                                                               // 486
    }                                                                                                                 // 487
    current = current[subkey];                                                                                        // 488
  }                                                                                                                   // 489
};                                                                                                                    // 490
                                                                                                                      // 491
var isArray = Array.isArray || function(obj) {                                                                        // 492
  return obj.toString() === '[object Array]';                                                                         // 493
};                                                                                                                    // 494
                                                                                                                      // 495
var isObject = function(obj) {                                                                                        // 496
  return obj === Object(obj);                                                                                         // 497
};                                                                                                                    // 498
                                                                                                                      // 499
// getPrototypeOf polyfill                                                                                            // 500
if (typeof Object.getPrototypeOf !== "function") {                                                                    // 501
  if (typeof "".__proto__ === "object") {                                                                             // 502
    Object.getPrototypeOf = function(object) {                                                                        // 503
      return object.__proto__;                                                                                        // 504
    };                                                                                                                // 505
  } else {                                                                                                            // 506
    Object.getPrototypeOf = function(object) {                                                                        // 507
      // May break if the constructor has been tampered with                                                          // 508
      return object.constructor.prototype;                                                                            // 509
    };                                                                                                                // 510
  }                                                                                                                   // 511
}                                                                                                                     // 512
                                                                                                                      // 513
/* Tests whether "obj" is an Object as opposed to                                                                     // 514
 * something that inherits from Object                                                                                // 515
 *                                                                                                                    // 516
 * @param {any} obj                                                                                                   // 517
 * @returns {Boolean}                                                                                                 // 518
 */                                                                                                                   // 519
var isBasicObject = function(obj) {                                                                                   // 520
  return isObject(obj) && Object.getPrototypeOf(obj) === Object.prototype;                                            // 521
};                                                                                                                    // 522
                                                                                                                      // 523
/* Takes a specific string that uses mongo-style dot notation                                                         // 524
 * and returns a generic string equivalent. Replaces all numeric                                                      // 525
 * "pieces" with a dollar sign ($).                                                                                   // 526
 *                                                                                                                    // 527
 * @param {type} name                                                                                                 // 528
 * @returns {unresolved}                                                                                              // 529
 */                                                                                                                   // 530
var makeGeneric = function(name) {                                                                                    // 531
  if (typeof name !== "string")                                                                                       // 532
    return null;                                                                                                      // 533
  return name.replace(/\.[0-9]+\./g, '.$.').replace(/\.[0-9]+/g, '.$');                                               // 534
};                                                                                                                    // 535
                                                                                                                      // 536
var appendAffectedKey = function(affectedKey, key) {                                                                  // 537
  if (key === "$each") {                                                                                              // 538
    return affectedKey;                                                                                               // 539
  } else {                                                                                                            // 540
    return (affectedKey ? affectedKey + "." + key : key);                                                             // 541
  }                                                                                                                   // 542
};                                                                                                                    // 543
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                    //
// packages/simple-schema/simple-schema.js                                                                            //
//                                                                                                                    //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                      //
//URL RegEx from https://gist.github.com/dperini/729294                                                               // 1
//http://mathiasbynens.be/demo/url-regex                                                                              // 2
                                                                                                                      // 3
if (Meteor.isServer) {                                                                                                // 4
  S = Npm.require("string");                                                                                          // 5
}                                                                                                                     // 6
if (Meteor.isClient) {                                                                                                // 7
  S = window.S;                                                                                                       // 8
}                                                                                                                     // 9
                                                                                                                      // 10
//exported                                                                                                            // 11
SchemaRegEx = {                                                                                                       // 12
  Email: /^([0-9a-zA-Z]([-.\w]*[0-9a-zA-Z])*@([0-9a-zA-Z][-\w]*[0-9a-zA-Z]\.)+[a-zA-Z]{2,9})$/,                       // 13
  Url: /^(?:(?:https?|ftp):\/\/)(?:\S+(?::\S*)?@)?(?:(?!10(?:\.\d{1,3}){3})(?!127(?:\.\d{1,3}){3})(?!169\.254(?:\.\d{1,3}){2})(?!192\.168(?:\.\d{1,3}){2})(?!172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})(?:[1-9]\d?|1\d\d|2[01]\d|22[0-3])(?:\.(?:1?\d{1,2}|2[0-4]\d|25[0-5])){2}(?:\.(?:[1-9]\d?|1\d\d|2[0-4]\d|25[0-4]))|(?:(?:[a-z\u00a1-\uffff0-9]+-?)*[a-z\u00a1-\uffff0-9]+)(?:\.(?:[a-z\u00a1-\uffff0-9]+-?)*[a-z\u00a1-\uffff0-9]+)*(?:\.(?:[a-z\u00a1-\uffff]{2,})))(?::\d{2,5})?(?:\/[^\s]*)?$/i
};                                                                                                                    // 15
                                                                                                                      // 16
var defaultMessages = {                                                                                               // 17
  required: "[label] is required",                                                                                    // 18
  minString: "[label] must be at least [min] characters",                                                             // 19
  maxString: "[label] cannot exceed [max] characters",                                                                // 20
  minNumber: "[label] must be at least [min]",                                                                        // 21
  maxNumber: "[label] cannot exceed [max]",                                                                           // 22
  minDate: "[label] must be on or before [min]",                                                                      // 23
  maxDate: "[label] cannot be after [max]",                                                                           // 24
  minCount: "You must specify at least [minCount] values",                                                            // 25
  maxCount: "You cannot specify more than [maxCount] values",                                                         // 26
  noDecimal: "[label] must be an integer",                                                                            // 27
  notAllowed: "[value] is not an allowed value",                                                                      // 28
  expectedString: "[label] must be a string",                                                                         // 29
  expectedNumber: "[label] must be a number",                                                                         // 30
  expectedBoolean: "[label] must be a boolean",                                                                       // 31
  expectedArray: "[label] must be an array",                                                                          // 32
  expectedObject: "[label] must be an object",                                                                        // 33
  expectedConstructor: "[label] must be a [type]",                                                                    // 34
  regEx: "[label] failed regular expression validation",                                                              // 35
  keyNotInSchema: "[label] is not allowed by the schema"                                                              // 36
};                                                                                                                    // 37
                                                                                                                      // 38
var extendedOptions = {};                                                                                             // 39
                                                                                                                      // 40
//exported                                                                                                            // 41
SimpleSchema = function(schema, options) {                                                                            // 42
  var self = this, requiredSchemaKeys = [], firstLevelSchemaKeys = [],                                                // 43
          firstLevelRequiredSchemaKeys = [], valueIsAllowedSchemaKeys = [],                                           // 44
          firstLevelValueIsAllowedSchemaKeys = [], fieldNameRoot;                                                     // 45
  options = options || {};                                                                                            // 46
  schema = inflectLabels(addImplicitKeys(expandSchema(schema)));                                                      // 47
  self._schema = schema || {};                                                                                        // 48
  self._schemaKeys = []; //for speedier checking                                                                      // 49
  self._validators = [];                                                                                              // 50
  //set up default message for each error type                                                                        // 51
  self._messages = defaultMessages;                                                                                   // 52
                                                                                                                      // 53
  //set schemaDefinition validator                                                                                    // 54
  var schemaDefinition = {                                                                                            // 55
    type: Match.Any,                                                                                                  // 56
    label: Match.Optional(String),                                                                                    // 57
    optional: Match.Optional(Boolean),                                                                                // 58
    min: Match.Optional(Match.OneOf(Number, Date, Function)),                                                         // 59
    max: Match.Optional(Match.OneOf(Number, Date, Function)),                                                         // 60
    minCount: Match.Optional(Number),                                                                                 // 61
    maxCount: Match.Optional(Number),                                                                                 // 62
    allowedValues: Match.Optional([Match.Any]),                                                                       // 63
    valueIsAllowed: Match.Optional(Function),                                                                         // 64
    decimal: Match.Optional(Boolean),                                                                                 // 65
    regEx: Match.Optional(Match.OneOf(RegExp, [RegExp]))                                                              // 66
  };                                                                                                                  // 67
                                                                                                                      // 68
  // This way of extending options is deprecated. TODO Remove this eventually                                         // 69
  if (typeof options.additionalKeyPatterns === "object")                                                              // 70
    _.extend(schemaDefinition, options.additionalKeyPatterns);                                                        // 71
                                                                                                                      // 72
  // Extend schema options                                                                                            // 73
  _.extend(schemaDefinition, extendedOptions);                                                                        // 74
                                                                                                                      // 75
  _.each(schema, function(definition, fieldName) {                                                                    // 76
    // Validate the field definition                                                                                  // 77
    if (!Match.test(definition, schemaDefinition)) {                                                                  // 78
      throw new Error('Invalid definition for ' + fieldName + ' field.');                                             // 79
    }                                                                                                                 // 80
                                                                                                                      // 81
    fieldNameRoot = fieldName.split(".")[0];                                                                          // 82
                                                                                                                      // 83
    self._schemaKeys.push(fieldName);                                                                                 // 84
                                                                                                                      // 85
    if (!_.contains(firstLevelSchemaKeys, fieldNameRoot)) {                                                           // 86
      firstLevelSchemaKeys.push(fieldNameRoot);                                                                       // 87
      if (!definition.optional) {                                                                                     // 88
        firstLevelRequiredSchemaKeys.push(fieldNameRoot);                                                             // 89
      }                                                                                                               // 90
                                                                                                                      // 91
      if (definition.valueIsAllowed) {                                                                                // 92
        firstLevelValueIsAllowedSchemaKeys.push(fieldNameRoot);                                                       // 93
      }                                                                                                               // 94
    }                                                                                                                 // 95
                                                                                                                      // 96
    if (!definition.optional) {                                                                                       // 97
      requiredSchemaKeys.push(fieldName);                                                                             // 98
    }                                                                                                                 // 99
                                                                                                                      // 100
    if (definition.valueIsAllowed) {                                                                                  // 101
      valueIsAllowedSchemaKeys.push(fieldName);                                                                       // 102
    }                                                                                                                 // 103
  });                                                                                                                 // 104
                                                                                                                      // 105
  // Cache these lists                                                                                                // 106
  self._requiredSchemaKeys = requiredSchemaKeys;                                                                      // 107
  self._firstLevelSchemaKeys = firstLevelSchemaKeys;                                                                  // 108
  self._firstLevelRequiredSchemaKeys = firstLevelRequiredSchemaKeys;                                                  // 109
  self._requiredObjectKeys = getObjectKeys(schema, requiredSchemaKeys);                                               // 110
  self._valueIsAllowedSchemaKeys = valueIsAllowedSchemaKeys;                                                          // 111
  self._firstLevelValueIsAllowedSchemaKeys = firstLevelValueIsAllowedSchemaKeys;                                      // 112
  self._valueIsAllowedObjectKeys = getObjectKeys(schema, valueIsAllowedSchemaKeys);                                   // 113
                                                                                                                      // 114
  // We will store named validation contexts here                                                                     // 115
  self._validationContexts = {};                                                                                      // 116
};                                                                                                                    // 117
                                                                                                                      // 118
// This allows other packages to extend the schema definition options that                                            // 119
// are supported.                                                                                                     // 120
SimpleSchema.extendOptions = function(options) {                                                                      // 121
  _.extend(extendedOptions, options);                                                                                 // 122
};                                                                                                                    // 123
                                                                                                                      // 124
// Inherit from Match.Where                                                                                           // 125
// This allow SimpleSchema instance to be recognized as a Match.Where instance as well                                // 126
// as a SimpleSchema instance                                                                                         // 127
SimpleSchema.prototype = new Match.Where();                                                                           // 128
                                                                                                                      // 129
// If an object is an instance of Match.Where, Meteor built-in check API will look at                                 // 130
// the function named `condition` and will pass it the document to validate                                           // 131
SimpleSchema.prototype.condition = function(obj) {                                                                    // 132
  var self = this;                                                                                                    // 133
                                                                                                                      // 134
  //determine whether obj is a modifier                                                                               // 135
  var isModifier, isNotModifier;                                                                                      // 136
  _.each(obj, function(val, key) {                                                                                    // 137
    if (key.substring(0, 1) === "$") {                                                                                // 138
      isModifier = true;                                                                                              // 139
    } else {                                                                                                          // 140
      isNotModifier = true;                                                                                           // 141
  }                                                                                                                   // 142
  });                                                                                                                 // 143
                                                                                                                      // 144
  if (isModifier && isNotModifier)                                                                                    // 145
    throw new Match.Error("Object cannot contain modifier operators alongside other keys");                           // 146
                                                                                                                      // 147
  if (!self.newContext().validate(obj, {modifier: isModifier, filter: false, autoConvert: false}))                    // 148
    throw new Match.Error("One or more properties do not match the schema.");                                         // 149
                                                                                                                      // 150
  return true;                                                                                                        // 151
};                                                                                                                    // 152
                                                                                                                      // 153
SimpleSchema.prototype.namedContext = function(name) {                                                                // 154
  var self = this;                                                                                                    // 155
  if (typeof name !== "string") {                                                                                     // 156
    name = "default";                                                                                                 // 157
  }                                                                                                                   // 158
  self._validationContexts[name] = self._validationContexts[name] || new SimpleSchemaValidationContext(self);         // 159
  return self._validationContexts[name];                                                                              // 160
};                                                                                                                    // 161
                                                                                                                      // 162
SimpleSchema.prototype.validator = function(func) {                                                                   // 163
  this._validators.push(func);                                                                                        // 164
};                                                                                                                    // 165
                                                                                                                      // 166
// Filter and automatically type convert                                                                              // 167
SimpleSchema.prototype.clean = function(doc, options) {                                                               // 168
  var self = this;                                                                                                    // 169
                                                                                                                      // 170
  // By default, doc will be filtered and autoconverted                                                               // 171
  options = _.extend({                                                                                                // 172
    filter: true,                                                                                                     // 173
    autoConvert: true                                                                                                 // 174
  }, options || {});                                                                                                  // 175
                                                                                                                      // 176
  // Convert $pushAll (deprecated) to $push with $each                                                                // 177
  if ("$pushAll" in doc) {                                                                                            // 178
    doc.$push = doc.$push || {};                                                                                      // 179
    for (var field in doc.$pushAll) {                                                                                 // 180
      doc.$push[field] = doc.$push[field] || {};                                                                      // 181
      doc.$push[field].$each = doc.$push[field].$each || [];                                                          // 182
      for (var i = 0, ln = doc.$pushAll[field].length; i < ln; i++) {                                                 // 183
        doc.$push[field].$each.push(doc.$pushAll[field][i]);                                                          // 184
      }                                                                                                               // 185
      delete doc.$pushAll;                                                                                            // 186
    }                                                                                                                 // 187
  }                                                                                                                   // 188
                                                                                                                      // 189
  var mDoc = new MongoObject(doc);                                                                                    // 190
                                                                                                                      // 191
  // Filter out anything that would affect keys not defined                                                           // 192
  // or implied by the schema                                                                                         // 193
  options.filter && mDoc.filterGenericKeys(function(genericKey) {                                                     // 194
    return self.allowsKey(genericKey);                                                                                // 195
  });                                                                                                                 // 196
                                                                                                                      // 197
  // Autoconvert values if requested and if possible                                                                  // 198
  options.autoConvert && mDoc.forEachNode(function(val, position, affectedKey, affectedKeyGeneric) {                  // 199
    if (affectedKeyGeneric) {                                                                                         // 200
      var def = self._schema[affectedKeyGeneric];                                                                     // 201
      def && this.updateValue(typeconvert(val, def.type));                                                            // 202
    }                                                                                                                 // 203
  });                                                                                                                 // 204
                                                                                                                      // 205
  return mDoc.getObject();                                                                                            // 206
};                                                                                                                    // 207
                                                                                                                      // 208
// Returns the entire schema object or just the definition for one key                                                // 209
// in the schema.                                                                                                     // 210
SimpleSchema.prototype.schema = function(key) {                                                                       // 211
  var self = this;                                                                                                    // 212
  if (key) {                                                                                                          // 213
    return self._schema[key];                                                                                         // 214
  } else {                                                                                                            // 215
    return self._schema;                                                                                              // 216
  }                                                                                                                   // 217
};                                                                                                                    // 218
                                                                                                                      // 219
SimpleSchema.prototype.messages = function(messages) {                                                                // 220
  this._messages = defaultMessages; //make sure we're always extending the defaults, even if called more than once    // 221
  _.extend(this._messages, messages);                                                                                 // 222
};                                                                                                                    // 223
                                                                                                                      // 224
// Use to dynamically change the schema labels.                                                                       // 225
SimpleSchema.prototype.labels = function(labels) {                                                                    // 226
  var self = this;                                                                                                    // 227
  _.each(labels, function(label, fieldName) {                                                                         // 228
    if (typeof label !== "string")                                                                                    // 229
      return;                                                                                                         // 230
                                                                                                                      // 231
    if (!(fieldName in self._schema))                                                                                 // 232
      return;                                                                                                         // 233
                                                                                                                      // 234
    self._schema[fieldName]["label"] = label;                                                                         // 235
  });                                                                                                                 // 236
};                                                                                                                    // 237
                                                                                                                      // 238
// Returns a string message for the given error type and key. Uses the                                                // 239
// def and value arguments to fill in placeholders in the error messages.                                             // 240
SimpleSchema.prototype.messageForError = function(type, key, def, value) {                                            // 241
  var self = this, typePlusKey = type + " " + key, genType, genTypePlusKey, firstTypePeriod = type.indexOf(".");      // 242
  if (firstTypePeriod !== -1) {                                                                                       // 243
    genType = type.substring(0, firstTypePeriod);                                                                     // 244
    genTypePlusKey = genType + " " + key;                                                                             // 245
  }                                                                                                                   // 246
  var message = self._messages[typePlusKey] || self._messages[type];                                                  // 247
  if (!message && genType) {                                                                                          // 248
    message = self._messages[genTypePlusKey] || self._messages[genType];                                              // 249
  }                                                                                                                   // 250
  if (!message)                                                                                                       // 251
    return "Unknown validation error";                                                                                // 252
  def = def || self._schema[key] || {};                                                                               // 253
  message = message.replace("[label]", def.label || key);                                                             // 254
  if (typeof def.minCount !== "undefined") {                                                                          // 255
    message = message.replace("[minCount]", def.minCount);                                                            // 256
  }                                                                                                                   // 257
  if (typeof def.maxCount !== "undefined") {                                                                          // 258
    message = message.replace("[maxCount]", def.maxCount);                                                            // 259
  }                                                                                                                   // 260
  if (value !== void 0 && value !== null) {                                                                           // 261
    message = message.replace("[value]", value.toString());                                                           // 262
  }                                                                                                                   // 263
  var min = def.min;                                                                                                  // 264
  var max = def.max;                                                                                                  // 265
  if (typeof min === "function") {                                                                                    // 266
    min = min();                                                                                                      // 267
  }                                                                                                                   // 268
  if (typeof max === "function") {                                                                                    // 269
    max = max();                                                                                                      // 270
  }                                                                                                                   // 271
  if (def.type === Date || def.type === [Date]) {                                                                     // 272
    if (typeof min !== "undefined") {                                                                                 // 273
      message = message.replace("[min]", dateToDateString(min));                                                      // 274
    }                                                                                                                 // 275
    if (typeof max !== "undefined") {                                                                                 // 276
      message = message.replace("[max]", dateToDateString(max));                                                      // 277
    }                                                                                                                 // 278
  } else {                                                                                                            // 279
    if (typeof min !== "undefined") {                                                                                 // 280
      message = message.replace("[min]", min);                                                                        // 281
    }                                                                                                                 // 282
    if (typeof max !== "undefined") {                                                                                 // 283
      message = message.replace("[max]", max);                                                                        // 284
    }                                                                                                                 // 285
  }                                                                                                                   // 286
  if (def.type instanceof Function) {                                                                                 // 287
    message = message.replace("[type]", def.type.name);                                                               // 288
  }                                                                                                                   // 289
  return message;                                                                                                     // 290
};                                                                                                                    // 291
                                                                                                                      // 292
// Returns true if key is explicitly allowed by the schema or implied                                                 // 293
// by other explicitly allowed keys.                                                                                  // 294
// The key string should have $ in place of any numeric array positions.                                              // 295
SimpleSchema.prototype.allowsKey = function(key) {                                                                    // 296
  var self = this, schemaKeys = self._schemaKeys;                                                                     // 297
                                                                                                                      // 298
  // Begin by assuming it's not allowed.                                                                              // 299
  var allowed = false;                                                                                                // 300
                                                                                                                      // 301
  // Loop through all keys in the schema                                                                              // 302
  for (var i = 0, ln = schemaKeys.length, schemaKey; i < ln; i++) {                                                   // 303
    schemaKey = schemaKeys[i];                                                                                        // 304
                                                                                                                      // 305
    // If the schema key is the test key, it's allowed.                                                               // 306
    if (schemaKey === key) {                                                                                          // 307
      allowed = true;                                                                                                 // 308
      break;                                                                                                          // 309
    }                                                                                                                 // 310
                                                                                                                      // 311
    // If the schema key implies the test key because the schema key                                                  // 312
    // starts with the test key followed by a period, it's allowed.                                                   // 313
    if (schemaKey.substring(0, key.length + 1) === key + ".") {                                                       // 314
      allowed = true;                                                                                                 // 315
      break;                                                                                                          // 316
    }                                                                                                                 // 317
                                                                                                                      // 318
    // If the schema key implies the test key because the schema key                                                  // 319
    // starts with the test key and the test key ends with ".$", it's allowed.                                        // 320
    var lastTwo = key.slice(-2);                                                                                      // 321
    if (lastTwo === ".$" && key.slice(0, -2) === schemaKey) {                                                         // 322
      allowed = true;                                                                                                 // 323
      break;                                                                                                          // 324
    }                                                                                                                 // 325
  }                                                                                                                   // 326
                                                                                                                      // 327
  return allowed;                                                                                                     // 328
};                                                                                                                    // 329
                                                                                                                      // 330
SimpleSchema.prototype.newContext = function() {                                                                      // 331
  return new SimpleSchemaValidationContext(this);                                                                     // 332
};                                                                                                                    // 333
                                                                                                                      // 334
SimpleSchema.prototype.requiredObjectKeys = function(keyPrefix) {                                                     // 335
  var self = this;                                                                                                    // 336
  if (!keyPrefix) {                                                                                                   // 337
    return self._firstLevelRequiredSchemaKeys;                                                                        // 338
  }                                                                                                                   // 339
  return self._requiredObjectKeys[keyPrefix + "."] || [];                                                             // 340
};                                                                                                                    // 341
                                                                                                                      // 342
SimpleSchema.prototype.requiredSchemaKeys = function() {                                                              // 343
  return this._requiredSchemaKeys;                                                                                    // 344
};                                                                                                                    // 345
                                                                                                                      // 346
SimpleSchema.prototype.firstLevelSchemaKeys = function() {                                                            // 347
  return this._firstLevelSchemaKeys;                                                                                  // 348
};                                                                                                                    // 349
                                                                                                                      // 350
SimpleSchema.prototype.valueIsAllowedObjectKeys = function(keyPrefix) {                                               // 351
  var self = this;                                                                                                    // 352
  if (!keyPrefix) {                                                                                                   // 353
    return self._firstLevelValueIsAllowedSchemaKeys;                                                                  // 354
  }                                                                                                                   // 355
  return self._valueIsAllowedObjectKeys[keyPrefix + "."] || [];                                                       // 356
};                                                                                                                    // 357
                                                                                                                      // 358
SimpleSchema.prototype.valueIsAllowedSchemaKeys = function() {                                                        // 359
  return this._valueIsAllowedSchemaKeys;                                                                              // 360
};                                                                                                                    // 361
                                                                                                                      // 362
//called by clean()                                                                                                   // 363
var typeconvert = function(value, type) {                                                                             // 364
  if (type === String) {                                                                                              // 365
    if (typeof value !== "undefined" && value !== null && typeof value !== "string") {                                // 366
      return value.toString();                                                                                        // 367
    }                                                                                                                 // 368
    return value;                                                                                                     // 369
  }                                                                                                                   // 370
  if (type === Number) {                                                                                              // 371
    if (typeof value === "string") {                                                                                  // 372
      //try to convert numeric strings to numbers                                                                     // 373
      var floatVal = parseFloat(value);                                                                               // 374
      if (!isNaN(floatVal)) {                                                                                         // 375
        return floatVal;                                                                                              // 376
      } else {                                                                                                        // 377
        return value; //leave string; will fail validation                                                            // 378
      }                                                                                                               // 379
    }                                                                                                                 // 380
    return value;                                                                                                     // 381
  }                                                                                                                   // 382
  return value;                                                                                                       // 383
};                                                                                                                    // 384
                                                                                                                      // 385
//tests whether it's an Object as opposed to something that inherits from Object                                      // 386
var isBasicObject = function(obj) {                                                                                   // 387
  return _.isObject(obj) && Object.getPrototypeOf(obj) === Object.prototype;                                          // 388
};                                                                                                                    // 389
                                                                                                                      // 390
looksLikeModifier = function(obj) {                                                                                   // 391
  for (var key in obj) {                                                                                              // 392
    if (obj.hasOwnProperty(key) && key.substring(0, 1) === "$") {                                                     // 393
      return true;                                                                                                    // 394
    }                                                                                                                 // 395
  }                                                                                                                   // 396
  return false;                                                                                                       // 397
};                                                                                                                    // 398
                                                                                                                      // 399
var dateToDateString = function(date) {                                                                               // 400
  var m = (date.getUTCMonth() + 1);                                                                                   // 401
  if (m < 10) {                                                                                                       // 402
    m = "0" + m;                                                                                                      // 403
  }                                                                                                                   // 404
  var d = date.getUTCDate();                                                                                          // 405
  if (d < 10) {                                                                                                       // 406
    d = "0" + d;                                                                                                      // 407
  }                                                                                                                   // 408
  return date.getUTCFullYear() + '-' + m + '-' + d;                                                                   // 409
};                                                                                                                    // 410
                                                                                                                      // 411
var expandSchema = function(schema) {                                                                                 // 412
  // If schema is an array of schemas, merge them first                                                               // 413
  if (_.isArray(schema)) {                                                                                            // 414
    var mergedSchema = {};                                                                                            // 415
    _.each(schema, function(ss) {                                                                                     // 416
      ss = Match.test(ss, SimpleSchema) ? ss._schema : ss;                                                            // 417
      isBasicObject(ss) && _.extend(mergedSchema, ss);                                                                // 418
    });                                                                                                               // 419
    schema = mergedSchema;                                                                                            // 420
  }                                                                                                                   // 421
                                                                                                                      // 422
  // Now flatten schema by inserting nested definitions                                                               // 423
  _.each(schema, function(val, key) {                                                                                 // 424
    var dot, type;                                                                                                    // 425
    if (Match.test(val.type, SimpleSchema)) {                                                                         // 426
      dot = '.';                                                                                                      // 427
      type = val.type;                                                                                                // 428
      val.type = Object;                                                                                              // 429
    } else if (Match.test(val.type, [SimpleSchema])) {                                                                // 430
      dot = '.$.';                                                                                                    // 431
      type = val.type[0];                                                                                             // 432
      val.type = [Object];                                                                                            // 433
    } else {                                                                                                          // 434
      return;                                                                                                         // 435
    }                                                                                                                 // 436
    //add child schema definitions to parent schema                                                                   // 437
    _.each(type._schema, function(subVal, subKey) {                                                                   // 438
      var newKey = key + dot + subKey;                                                                                // 439
      if (!(newKey in schema))                                                                                        // 440
        schema[newKey] = subVal;                                                                                      // 441
    });                                                                                                               // 442
  });                                                                                                                 // 443
  return schema;                                                                                                      // 444
};                                                                                                                    // 445
                                                                                                                      // 446
/**                                                                                                                   // 447
 * Adds implied keys.                                                                                                 // 448
 * * If schema contains a key like "foo.$.bar" but not "foo", adds "foo".                                             // 449
 * * If schema contains a key like "foo" with an array type, adds "foo.$".                                            // 450
 * @param {Object} schema                                                                                             // 451
 * @returns {Object} modified schema                                                                                  // 452
 */                                                                                                                   // 453
var addImplicitKeys = function(schema) {                                                                              // 454
  var arrayKeysToAdd = [], objectKeysToAdd = [], newKey, key, nextThree;                                              // 455
                                                                                                                      // 456
  // Pass 1 (objects)                                                                                                 // 457
  _.each(schema, function(def, existingKey) {                                                                         // 458
    var pos = existingKey.indexOf(".");                                                                               // 459
                                                                                                                      // 460
    while (pos !== -1) {                                                                                              // 461
      newKey = existingKey.substring(0, pos);                                                                         // 462
      nextThree = existingKey.substring(pos, pos + 3);                                                                // 463
      if (newKey.substring(newKey.length - 2) !== ".$") {                                                             // 464
        if (nextThree === ".$.") {                                                                                    // 465
          arrayKeysToAdd.push(newKey);                                                                                // 466
        } else {                                                                                                      // 467
          objectKeysToAdd.push(newKey);                                                                               // 468
        }                                                                                                             // 469
      }                                                                                                               // 470
      pos = existingKey.indexOf(".", pos + 3);                                                                        // 471
    }                                                                                                                 // 472
  });                                                                                                                 // 473
                                                                                                                      // 474
  for (var i = 0, ln = arrayKeysToAdd.length; i < ln; i++) {                                                          // 475
    key = arrayKeysToAdd[i];                                                                                          // 476
    if (!(key in schema)) {                                                                                           // 477
      schema[key] = {type: [Object], optional: true};                                                                 // 478
    }                                                                                                                 // 479
  }                                                                                                                   // 480
                                                                                                                      // 481
  for (var i = 0, ln = objectKeysToAdd.length; i < ln; i++) {                                                         // 482
    key = objectKeysToAdd[i];                                                                                         // 483
    if (!(key in schema)) {                                                                                           // 484
      schema[key] = {type: Object, optional: true};                                                                   // 485
    }                                                                                                                 // 486
  }                                                                                                                   // 487
                                                                                                                      // 488
  // Pass 2 (arrays)                                                                                                  // 489
  _.each(schema, function(def, existingKey) {                                                                         // 490
    if (_.isArray(def.type)) {                                                                                        // 491
      // Copy some options to array-item definition                                                                   // 492
      var itemKey = existingKey + ".$";                                                                               // 493
      if (!(itemKey in schema)) {                                                                                     // 494
        schema[itemKey] = {};                                                                                         // 495
      }                                                                                                               // 496
      //var itemDef = schema[itemKey];                                                                                // 497
      schema[itemKey].type = def.type[0];                                                                             // 498
      if (def.label) {                                                                                                // 499
        schema[itemKey].label = def.label;                                                                            // 500
      }                                                                                                               // 501
      schema[itemKey].optional = true;                                                                                // 502
      if (typeof def.min !== "undefined") {                                                                           // 503
        schema[itemKey].min = def.min;                                                                                // 504
      }                                                                                                               // 505
      if (typeof def.max !== "undefined") {                                                                           // 506
        schema[itemKey].max = def.max;                                                                                // 507
      }                                                                                                               // 508
      if (typeof def.allowedValues !== "undefined") {                                                                 // 509
        schema[itemKey].allowedValues = def.allowedValues;                                                            // 510
      }                                                                                                               // 511
      if (typeof def.valueIsAllowed !== "undefined") {                                                                // 512
        schema[itemKey].valueIsAllowed = def.valueIsAllowed;                                                          // 513
      }                                                                                                               // 514
      if (typeof def.decimal !== "undefined") {                                                                       // 515
        schema[itemKey].decimal = def.decimal;                                                                        // 516
      }                                                                                                               // 517
      if (typeof def.regEx !== "undefined") {                                                                         // 518
        schema[itemKey].regEx = def.regEx;                                                                            // 519
      }                                                                                                               // 520
      // Remove copied options and adjust type                                                                        // 521
      def.type = Array;                                                                                               // 522
      _.each(['min', 'max', 'allowedValues', 'valueIsAllowed', 'decimal', 'regEx'], function(k) {                     // 523
        deleteIfPresent(def, k);                                                                                      // 524
      });                                                                                                             // 525
    }                                                                                                                 // 526
  });                                                                                                                 // 527
                                                                                                                      // 528
  for (var i = 0, ln = arrayKeysToAdd.length; i < ln; i++) {                                                          // 529
    key = arrayKeysToAdd[i];                                                                                          // 530
    if (!(key in schema)) {                                                                                           // 531
      schema[key] = {type: [Object], optional: true};                                                                 // 532
    }                                                                                                                 // 533
  }                                                                                                                   // 534
                                                                                                                      // 535
  for (var i = 0, ln = objectKeysToAdd.length; i < ln; i++) {                                                         // 536
    key = objectKeysToAdd[i];                                                                                         // 537
    if (!(key in schema)) {                                                                                           // 538
      schema[key] = {type: Object, optional: true};                                                                   // 539
    }                                                                                                                 // 540
  }                                                                                                                   // 541
                                                                                                                      // 542
  return schema;                                                                                                      // 543
};                                                                                                                    // 544
                                                                                                                      // 545
// Returns an object relating the keys in the list                                                                    // 546
// to their parent object.                                                                                            // 547
var getObjectKeys = function(schema, schemaKeyList) {                                                                 // 548
  var keyPrefix, remainingText, rKeys = {}, loopArray;                                                                // 549
  _.each(schema, function(definition, fieldName) {                                                                    // 550
    if (definition.type === Object) {                                                                                 // 551
      //object                                                                                                        // 552
      keyPrefix = fieldName + ".";                                                                                    // 553
    } else {                                                                                                          // 554
      return;                                                                                                         // 555
    }                                                                                                                 // 556
                                                                                                                      // 557
    loopArray = [];                                                                                                   // 558
    _.each(schemaKeyList, function(fieldName2) {                                                                      // 559
      if (S(fieldName2).startsWith(keyPrefix)) {                                                                      // 560
        remainingText = fieldName2.substring(keyPrefix.length);                                                       // 561
        if (remainingText.indexOf(".") === -1) {                                                                      // 562
          loopArray.push(remainingText);                                                                              // 563
        }                                                                                                             // 564
      }                                                                                                               // 565
    });                                                                                                               // 566
    rKeys[keyPrefix] = loopArray;                                                                                     // 567
  });                                                                                                                 // 568
  return rKeys;                                                                                                       // 569
};                                                                                                                    // 570
                                                                                                                      // 571
//label inflection                                                                                                    // 572
var inflectLabels = function(schema) {                                                                                // 573
  if (!_.isObject(schema))                                                                                            // 574
    return schema;                                                                                                    // 575
                                                                                                                      // 576
  var editedSchema = {};                                                                                              // 577
  _.each(schema, function(definition, fieldName) {                                                                    // 578
    if (typeof definition.label === "string") {                                                                       // 579
      editedSchema[fieldName] = definition;                                                                           // 580
      return;                                                                                                         // 581
    }                                                                                                                 // 582
                                                                                                                      // 583
    var label = fieldName, lastPeriod = label.lastIndexOf(".");                                                       // 584
    if (lastPeriod !== -1) {                                                                                          // 585
      label = label.substring(lastPeriod + 1);                                                                        // 586
      if (label === "$") {                                                                                            // 587
        var pcs = fieldName.split(".");                                                                               // 588
        label = pcs[pcs.length - 2];                                                                                  // 589
      }                                                                                                               // 590
    }                                                                                                                 // 591
    definition.label = S(label).humanize().s;                                                                         // 592
    editedSchema[fieldName] = definition;                                                                             // 593
  });                                                                                                                 // 594
                                                                                                                      // 595
  return editedSchema;                                                                                                // 596
};                                                                                                                    // 597
                                                                                                                      // 598
var deleteIfPresent = function (obj, key) {                                                                           // 599
  if (key in obj) {                                                                                                   // 600
    delete obj[key];                                                                                                  // 601
  }                                                                                                                   // 602
};                                                                                                                    // 603
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                    //
// packages/simple-schema/simple-schema-context.js                                                                    //
//                                                                                                                    //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                      //
/*                                                                                                                    // 1
 * PUBLIC API                                                                                                         // 2
 */                                                                                                                   // 3
                                                                                                                      // 4
SimpleSchemaValidationContext = function(ss) {                                                                        // 5
  var self = this;                                                                                                    // 6
  self._simpleSchema = ss;                                                                                            // 7
  self._schema = ss.schema();                                                                                         // 8
  self._schemaKeys = _.keys(self._schema);                                                                            // 9
  self._invalidKeys = [];                                                                                             // 10
  //set up validation dependencies                                                                                    // 11
  self._deps = {};                                                                                                    // 12
  self._depsAny = new Deps.Dependency;                                                                                // 13
  _.each(self._schemaKeys, function(name) {                                                                           // 14
    self._deps[name] = new Deps.Dependency;                                                                           // 15
  });                                                                                                                 // 16
};                                                                                                                    // 17
                                                                                                                      // 18
//validates the object against the simple schema and sets a reactive array of error objects                           // 19
SimpleSchemaValidationContext.prototype.validate = function(doc, options) {                                           // 20
  var self = this;                                                                                                    // 21
  options = _.extend({                                                                                                // 22
    modifier: false,                                                                                                  // 23
    upsert: false                                                                                                     // 24
  }, options || {});                                                                                                  // 25
                                                                                                                      // 26
  //clean doc                                                                                                         // 27
  doc = self._simpleSchema.clean(doc, options);                                                                       // 28
                                                                                                                      // 29
  var invalidKeys = doValidation(doc, options.modifier, options.upsert, null, self._simpleSchema);                    // 30
                                                                                                                      // 31
  //now update self._invalidKeys and dependencies                                                                     // 32
                                                                                                                      // 33
  //note any currently invalid keys so that we can mark them as changed                                               // 34
  //due to new validation (they may be valid now, or invalid in a different way)                                      // 35
  var removedKeys = _.pluck(self._invalidKeys, "name");                                                               // 36
                                                                                                                      // 37
  //update                                                                                                            // 38
  self._invalidKeys = invalidKeys;                                                                                    // 39
                                                                                                                      // 40
  //add newly invalid keys to changedKeys                                                                             // 41
  var addedKeys = _.pluck(self._invalidKeys, "name");                                                                 // 42
                                                                                                                      // 43
  //mark all changed keys as changed                                                                                  // 44
  var changedKeys = _.union(addedKeys, removedKeys);                                                                  // 45
  _.each(changedKeys, function(name) {                                                                                // 46
    var genericName = makeGeneric(name);                                                                              // 47
    if (genericName in self._deps) {                                                                                  // 48
      self._deps[genericName].changed();                                                                              // 49
    }                                                                                                                 // 50
  });                                                                                                                 // 51
  if (changedKeys.length) {                                                                                           // 52
    self._depsAny.changed();                                                                                          // 53
  }                                                                                                                   // 54
                                                                                                                      // 55
  // Return true if it was valid; otherwise, return false                                                             // 56
  return self._invalidKeys.length === 0;                                                                              // 57
};                                                                                                                    // 58
                                                                                                                      // 59
//validates doc against self._schema for one key and sets a reactive array of error objects                           // 60
SimpleSchemaValidationContext.prototype.validateOne = function(doc, keyName, options) {                               // 61
  var self = this;                                                                                                    // 62
  options = _.extend({                                                                                                // 63
    modifier: false                                                                                                   // 64
  }, options || {});                                                                                                  // 65
                                                                                                                      // 66
  //clean doc                                                                                                         // 67
  doc = self._simpleSchema.clean(doc, options);                                                                       // 68
                                                                                                                      // 69
  var invalidKeys = doValidation(doc, options.modifier, options.upsert, keyName, self._simpleSchema);                 // 70
                                                                                                                      // 71
  //now update self._invalidKeys and dependencies                                                                     // 72
                                                                                                                      // 73
  //remove objects from self._invalidKeys where name = keyName                                                        // 74
  var newInvalidKeys = [];                                                                                            // 75
  for (var i = 0, ln = self._invalidKeys.length, k; i < ln; i++) {                                                    // 76
    k = self._invalidKeys[i];                                                                                         // 77
    if (k.name !== keyName) {                                                                                         // 78
      newInvalidKeys.push(k);                                                                                         // 79
    }                                                                                                                 // 80
  }                                                                                                                   // 81
  self._invalidKeys = newInvalidKeys;                                                                                 // 82
                                                                                                                      // 83
  //merge invalidKeys into self._invalidKeys                                                                          // 84
  for (var i = 0, ln = invalidKeys.length, k; i < ln; i++) {                                                          // 85
    k = invalidKeys[i];                                                                                               // 86
    self._invalidKeys.push(k);                                                                                        // 87
  }                                                                                                                   // 88
                                                                                                                      // 89
  //mark key as changed due to new validation (they may be valid now, or invalid in a different way)                  // 90
  var genericName = makeGeneric(keyName);                                                                             // 91
  if (genericName in self._deps) {                                                                                    // 92
    self._deps[genericName].changed();                                                                                // 93
  }                                                                                                                   // 94
  self._depsAny.changed();                                                                                            // 95
                                                                                                                      // 96
  // Return true if it was valid; otherwise, return false                                                             // 97
  return !self._keyIsInvalid(keyName);                                                                                // 98
};                                                                                                                    // 99
                                                                                                                      // 100
//reset the invalidKeys array                                                                                         // 101
SimpleSchemaValidationContext.prototype.resetValidation = function() {                                                // 102
  var self = this;                                                                                                    // 103
  var removedKeys = _.pluck(self._invalidKeys, "name");                                                               // 104
  self._invalidKeys = [];                                                                                             // 105
  _.each(removedKeys, function(name) {                                                                                // 106
    var genericName = makeGeneric(name);                                                                              // 107
    if (genericName in self._deps) {                                                                                  // 108
      self._deps[genericName].changed();                                                                              // 109
    }                                                                                                                 // 110
  });                                                                                                                 // 111
};                                                                                                                    // 112
                                                                                                                      // 113
SimpleSchemaValidationContext.prototype.isValid = function() {                                                        // 114
  var self = this;                                                                                                    // 115
  self._depsAny.depend();                                                                                             // 116
  return !self._invalidKeys.length;                                                                                   // 117
};                                                                                                                    // 118
                                                                                                                      // 119
SimpleSchemaValidationContext.prototype.invalidKeys = function() {                                                    // 120
  var self = this;                                                                                                    // 121
  self._depsAny.depend();                                                                                             // 122
  return self._invalidKeys;                                                                                           // 123
};                                                                                                                    // 124
                                                                                                                      // 125
SimpleSchemaValidationContext.prototype._keyIsInvalid = function(name, genericName) {                                 // 126
  var self = this;                                                                                                    // 127
  genericName = genericName || makeGeneric(name);                                                                     // 128
  var specificIsInvalid = !!_.findWhere(self._invalidKeys, {name: name});                                             // 129
  var genericIsInvalid = (genericName !== name) ? (!!_.findWhere(self._invalidKeys, {name: genericName})) : false;    // 130
  return specificIsInvalid || genericIsInvalid;                                                                       // 131
};                                                                                                                    // 132
                                                                                                                      // 133
SimpleSchemaValidationContext.prototype.keyIsInvalid = function(name) {                                               // 134
  var self = this, genericName = makeGeneric(name);                                                                   // 135
  self._deps[genericName].depend();                                                                                   // 136
  return self._keyIsInvalid(name, genericName);                                                                       // 137
};                                                                                                                    // 138
                                                                                                                      // 139
SimpleSchemaValidationContext.prototype.keyErrorMessage = function(name) {                                            // 140
  var self = this, genericName = makeGeneric(name);                                                                   // 141
  self._deps[genericName].depend();                                                                                   // 142
  var errorObj = _.findWhere(self._invalidKeys, {name: name});                                                        // 143
  if (!errorObj) {                                                                                                    // 144
    errorObj = _.findWhere(self._invalidKeys, {name: genericName});                                                   // 145
  }                                                                                                                   // 146
  return errorObj ? errorObj.message : "";                                                                            // 147
};                                                                                                                    // 148
                                                                                                                      // 149
/*                                                                                                                    // 150
 * PRIVATE                                                                                                            // 151
 */                                                                                                                   // 152
                                                                                                                      // 153
var doValidation = function(obj, isModifier, isUpsert, keyToValidate, ss) {                                           // 154
                                                                                                                      // 155
  // First do some basic checks of the object, and throw errors if necessary                                          // 156
  if (!_.isObject(obj)) {                                                                                             // 157
    throw new Error("The first argument of validate() or validateOne() must be an object");                           // 158
  }                                                                                                                   // 159
                                                                                                                      // 160
  if (isModifier) {                                                                                                   // 161
    if (_.isEmpty(obj)) {                                                                                             // 162
      throw new Error("When the modifier option is true, validation object must have at least one operator");         // 163
    } else {                                                                                                          // 164
      var allKeysAreOperators = _.every(obj, function (v, k) {                                                        // 165
        return (k.substring(0, 1) === "$");                                                                           // 166
      });                                                                                                             // 167
      if (!allKeysAreOperators) {                                                                                     // 168
        throw new Error("When the modifier option is true, all validation object keys must be operators");            // 169
      }                                                                                                               // 170
    }                                                                                                                 // 171
  } else if (looksLikeModifier(obj)) {                                                                                // 172
    throw new Error("When the validation object contains mongo operators, you must set the modifier option to true"); // 173
  }                                                                                                                   // 174
                                                                                                                      // 175
  // If this is an upsert, add all the $setOnInsert keys to $set;                                                     // 176
  // since we don't know whether it will be an insert or update, we'll                                                // 177
  // validate upserts as if they will be an insert.                                                                   // 178
  // TODO It would be more secure to validate twice, once as                                                          // 179
  // an update and once as an insert, because $set validation does not                                                // 180
  // consider missing required keys to be an issue.                                                                   // 181
  if ("$setOnInsert" in obj) {                                                                                        // 182
    if (isUpsert) {                                                                                                   // 183
      obj.$set = obj.$set || {};                                                                                      // 184
      obj.$set = _.extend(obj.$set, obj.$setOnInsert);                                                                // 185
    }                                                                                                                 // 186
    delete obj.$setOnInsert;                                                                                          // 187
  }                                                                                                                   // 188
                                                                                                                      // 189
  var invalidKeys = [];                                                                                               // 190
                                                                                                                      // 191
  // Validation function called for each affected key                                                                 // 192
  function validate(val, affectedKey, affectedKeyGeneric, def, op) {                                                  // 193
                                                                                                                      // 194
    // Get the schema for this key, marking invalid if there isn't one.                                               // 195
    if (!def) {                                                                                                       // 196
      invalidKeys.push(errorObject("keyNotInSchema", affectedKey, val, def, ss));                                     // 197
      return;                                                                                                         // 198
    }                                                                                                                 // 199
                                                                                                                      // 200
    // Check for missing required values. The general logic is this:                                                  // 201
    // * If there's no operator, or if the operator is $set and it's an upsert,                                       // 202
    //   val must not be undefined, null, or an empty string.                                                         // 203
    // * If there is an operator other than $unset or $rename, val must                                               // 204
    //   not be null or an empty string, but undefined is OK.                                                         // 205
    // * If the operator is $unset or $rename, it's invalid.                                                          // 206
    if (!def.optional) {                                                                                              // 207
      if (op === "$unset" || op === "$rename" || isBlankNullOrUndefined(val)) {                                       // 208
        invalidKeys.push(errorObject("required", affectedKey, null, def, ss));                                        // 209
        return;                                                                                                       // 210
      }                                                                                                               // 211
    }                                                                                                                 // 212
                                                                                                                      // 213
    // For $rename, make sure that the new name is allowed by the schema                                              // 214
    if (op === "$rename" && typeof val === "string" && !ss.allowsKey(val)) {                                          // 215
      invalidKeys.push(errorObject("keyNotInSchema", val, null, null, ss));                                           // 216
      return;                                                                                                         // 217
    }                                                                                                                 // 218
                                                                                                                      // 219
    // Value checks are not necessary for null or undefined values,                                                   // 220
    // or for certain operators.                                                                                      // 221
    if (!_.contains(["$unset", "$rename", "$pull", "$pullAll", "$pop"], op)) {                                        // 222
                                                                                                                      // 223
      if (isSet(val)) {                                                                                               // 224
                                                                                                                      // 225
        // Check that value is of the correct type                                                                    // 226
        var typeError = doTypeChecks(def, val, op);                                                                   // 227
        if (typeError) {                                                                                              // 228
          invalidKeys.push(errorObject(typeError, affectedKey, val, def, ss));                                        // 229
          return;                                                                                                     // 230
        }                                                                                                             // 231
                                                                                                                      // 232
        // Check value against allowedValues array                                                                    // 233
        if (def.allowedValues && !_.contains(def.allowedValues, val)) {                                               // 234
          invalidKeys.push(errorObject("notAllowed", affectedKey, val, def, ss));                                     // 235
          return;                                                                                                     // 236
        }                                                                                                             // 237
                                                                                                                      // 238
      }                                                                                                               // 239
                                                                                                                      // 240
      // Check value using valusIsAllowed function                                                                    // 241
      if (def.valueIsAllowed && !def.valueIsAllowed(val, obj, op)) {                                                  // 242
        invalidKeys.push(errorObject("notAllowed", affectedKey, val, def, ss));                                       // 243
        return;                                                                                                       // 244
      }                                                                                                               // 245
                                                                                                                      // 246
    }                                                                                                                 // 247
                                                                                                                      // 248
    // Perform custom validation                                                                                      // 249
    _.every(ss._validators, function(validator) {                                                                     // 250
      var errorType = validator(affectedKeyGeneric, val, def, op);                                                    // 251
      if (typeof errorType === "string") {                                                                            // 252
        invalidKeys.push(errorObject(errorType, affectedKey, val, def, ss));                                          // 253
        return false;                                                                                                 // 254
      }                                                                                                               // 255
      return true;                                                                                                    // 256
    });                                                                                                               // 257
  }                                                                                                                   // 258
                                                                                                                      // 259
  // The recursive function                                                                                           // 260
  function checkObj(val, affectedKey, operator, adjusted) {                                                           // 261
    var affectedKeyGeneric, def;                                                                                      // 262
                                                                                                                      // 263
    // Adjust for first-level modifier operators                                                                      // 264
    if (!operator && affectedKey && affectedKey.substring(0, 1) === "$") {                                            // 265
      operator = affectedKey;                                                                                         // 266
      affectedKey = null;                                                                                             // 267
    }                                                                                                                 // 268
                                                                                                                      // 269
    if (affectedKey) {                                                                                                // 270
                                                                                                                      // 271
      // Adjust for $push and $addToSet                                                                               // 272
      if (! adjusted && (operator === "$push" || operator === "$addToSet")) {                                         // 273
        // Adjust for $each                                                                                           // 274
        // We can simply jump forward and pretend like the $each array                                                // 275
        // is the array for the field. This has the added benefit of                                                  // 276
        // skipping past any $slice, which we also don't care about.                                                  // 277
        if (isBasicObject(val) && "$each" in val) {                                                                   // 278
          val = val.$each;                                                                                            // 279
        } else {                                                                                                      // 280
          affectedKey = affectedKey + ".0";                                                                           // 281
        }                                                                                                             // 282
        adjusted = true;                                                                                              // 283
      }                                                                                                               // 284
                                                                                                                      // 285
      // Make a generic version of the affected key, and use that                                                     // 286
      // to get the schema for this key.                                                                              // 287
      affectedKeyGeneric = makeGeneric(affectedKey);                                                                  // 288
      def = ss.schema(affectedKeyGeneric);                                                                            // 289
                                                                                                                      // 290
      // Perform validation for this key                                                                              // 291
      if (!keyToValidate || keyToValidate === affectedKey || keyToValidate === affectedKeyGeneric) {                  // 292
        validate(val, affectedKey, affectedKeyGeneric, def, operator);                                                // 293
      }                                                                                                               // 294
    }                                                                                                                 // 295
                                                                                                                      // 296
    // Temporarily convert missing objects to empty objects                                                           // 297
    // so that the looping code will be called and required                                                           // 298
    // descendent keys can be validated.                                                                              // 299
    if (!val && (!def || def.type === Object)) {                                                                      // 300
      val = {};                                                                                                       // 301
    }                                                                                                                 // 302
                                                                                                                      // 303
    // Loop through arrays                                                                                            // 304
    if (_.isArray(val)) {                                                                                             // 305
      _.each(val, function(v, i) {                                                                                    // 306
        checkObj(v, affectedKey + '.' + i, operator, adjusted);                                                       // 307
      });                                                                                                             // 308
    }                                                                                                                 // 309
                                                                                                                      // 310
    // Loop through object keys                                                                                       // 311
    else if (isBasicObject(val)) {                                                                                    // 312
                                                                                                                      // 313
      // Get list of present keys                                                                                     // 314
      var presentKeys = _.keys(val);                                                                                  // 315
                                                                                                                      // 316
      // For required checks, we want to also loop through all keys expected                                          // 317
      // based on the schema, in case any are missing.                                                                // 318
      var requiredKeys, valueIsAllowedKeys;                                                                           // 319
      if (!isModifier || (isUpsert && operator === "$set") || (affectedKeyGeneric && affectedKeyGeneric.slice(-2) === ".$")) {
        requiredKeys = ss.requiredObjectKeys(affectedKeyGeneric);                                                     // 321
                                                                                                                      // 322
        // Filter out required keys that are ancestors                                                                // 323
        // of those in $set                                                                                           // 324
        requiredKeys = _.filter(requiredKeys, function (k) {                                                          // 325
          return !_.some(presentKeys, function (pk) {                                                                 // 326
            return (pk.slice(0, k.length + 1) === k + ".");                                                           // 327
          });                                                                                                         // 328
        });                                                                                                           // 329
      }                                                                                                               // 330
                                                                                                                      // 331
      if (!isModifier || (operator === "$set") || (affectedKeyGeneric && affectedKeyGeneric.slice(-2) === ".$")) {    // 332
                                                                                                                      // 333
        // We want to be sure to call any present valueIsAllowed functions                                            // 334
        // even if the value isn't set, so they can be used for custom                                                // 335
        // required errors, such as basing it on another field's value.                                               // 336
        valueIsAllowedKeys = ss.valueIsAllowedObjectKeys(affectedKeyGeneric);                                         // 337
                                                                                                                      // 338
      }                                                                                                               // 339
                                                                                                                      // 340
      // Merge the lists                                                                                              // 341
      var keysToCheck = _.union(presentKeys, requiredKeys || [], valueIsAllowedKeys || []);                           // 342
                                                                                                                      // 343
      // Check all keys in the merged list                                                                            // 344
      _.each(keysToCheck, function(key) {                                                                             // 345
        if (shouldCheck(key)) {                                                                                       // 346
          checkObj(val[key], appendAffectedKey(affectedKey, key), operator, adjusted);                                // 347
        }                                                                                                             // 348
      });                                                                                                             // 349
    }                                                                                                                 // 350
                                                                                                                      // 351
  }                                                                                                                   // 352
                                                                                                                      // 353
  // Kick off the validation                                                                                          // 354
  checkObj(obj);                                                                                                      // 355
                                                                                                                      // 356
  // Make sure there is only one error per fieldName                                                                  // 357
  var addedFieldNames = [];                                                                                           // 358
  invalidKeys = _.filter(invalidKeys, function(errObj) {                                                              // 359
    if (!_.contains(addedFieldNames, errObj.name)) {                                                                  // 360
      addedFieldNames.push(errObj.name);                                                                              // 361
      return true;                                                                                                    // 362
    }                                                                                                                 // 363
    return false;                                                                                                     // 364
  });                                                                                                                 // 365
                                                                                                                      // 366
  return invalidKeys;                                                                                                 // 367
};                                                                                                                    // 368
                                                                                                                      // 369
var doTypeChecks = function(def, keyValue, op) {                                                                      // 370
  var expectedType = def.type;                                                                                        // 371
                                                                                                                      // 372
  // If min/max are functions, call them                                                                              // 373
  var min = def.min;                                                                                                  // 374
  var max = def.max;                                                                                                  // 375
  if (typeof min === "function") {                                                                                    // 376
    min = min();                                                                                                      // 377
  }                                                                                                                   // 378
  if (typeof max === "function") {                                                                                    // 379
    max = max();                                                                                                      // 380
  }                                                                                                                   // 381
                                                                                                                      // 382
  // String checks                                                                                                    // 383
  if (expectedType === String) {                                                                                      // 384
    if (typeof keyValue !== "string") {                                                                               // 385
      return "expectedString";                                                                                        // 386
    } else if (max !== null && max < keyValue.length) {                                                               // 387
      return "maxString";                                                                                             // 388
    } else if (min !== null && min > keyValue.length) {                                                               // 389
      return "minString";                                                                                             // 390
    } else if (def.regEx instanceof RegExp && !def.regEx.test(keyValue)) {                                            // 391
      return "regEx";                                                                                                 // 392
    } else if (_.isArray(def.regEx)) {                                                                                // 393
      var regExError;                                                                                                 // 394
      _.every(def.regEx, function(re, i) {                                                                            // 395
        if (!re.test(keyValue)) {                                                                                     // 396
          regExError = "regEx." + i;                                                                                  // 397
          return false;                                                                                               // 398
        }                                                                                                             // 399
        return true;                                                                                                  // 400
      });                                                                                                             // 401
      if (regExError)                                                                                                 // 402
        return regExError;                                                                                            // 403
    }                                                                                                                 // 404
  }                                                                                                                   // 405
                                                                                                                      // 406
  // Number checks                                                                                                    // 407
  else if (expectedType === Number) {                                                                                 // 408
    if (typeof keyValue !== "number") {                                                                               // 409
      return "expectedNumber";                                                                                        // 410
    } else if (op !== "$inc" && max !== null && max < keyValue) {                                                     // 411
      return "maxNumber";                                                                                             // 412
    } else if (op !== "$inc" && min !== null && min > keyValue) {                                                     // 413
      return "minNumber";                                                                                             // 414
    } else if (!def.decimal && keyValue.toString().indexOf(".") > -1) {                                               // 415
      return "noDecimal";                                                                                             // 416
    }                                                                                                                 // 417
  }                                                                                                                   // 418
                                                                                                                      // 419
  // Boolean checks                                                                                                   // 420
  else if (expectedType === Boolean) {                                                                                // 421
    if (typeof keyValue !== "boolean") {                                                                              // 422
      return "expectedBoolean";                                                                                       // 423
    }                                                                                                                 // 424
  }                                                                                                                   // 425
                                                                                                                      // 426
  // Object checks                                                                                                    // 427
  else if (expectedType === Object) {                                                                                 // 428
    if (!isBasicObject(keyValue)) {                                                                                   // 429
      return "expectedObject";                                                                                        // 430
    }                                                                                                                 // 431
  }                                                                                                                   // 432
                                                                                                                      // 433
  // Array checks                                                                                                     // 434
  else if (expectedType === Array) {                                                                                  // 435
    if (!_.isArray(keyValue)) {                                                                                       // 436
      return "expectedArray";                                                                                         // 437
    } else if (def.minCount !== null && keyValue.length < def.minCount) {                                             // 438
      return "minCount";                                                                                              // 439
    } else if (def.maxCount !== null && keyValue.length > def.maxCount) {                                             // 440
      return "maxCount";                                                                                              // 441
    }                                                                                                                 // 442
  }                                                                                                                   // 443
                                                                                                                      // 444
  // Constructor function checks                                                                                      // 445
  else if (expectedType instanceof Function || safariBugFix(expectedType)) {                                          // 446
                                                                                                                      // 447
    // Generic constructor checks                                                                                     // 448
    if (!(keyValue instanceof expectedType)) {                                                                        // 449
      return "expectedConstructor";                                                                                   // 450
    }                                                                                                                 // 451
                                                                                                                      // 452
    // Date checks                                                                                                    // 453
    else if (expectedType === Date) {                                                                                 // 454
      if (_.isDate(min) && min.getTime() > keyValue.getTime()) {                                                      // 455
        return "minDate";                                                                                             // 456
      } else if (_.isDate(max) && max.getTime() < keyValue.getTime()) {                                               // 457
        return "maxDate";                                                                                             // 458
      }                                                                                                               // 459
    }                                                                                                                 // 460
  }                                                                                                                   // 461
                                                                                                                      // 462
};                                                                                                                    // 463
                                                                                                                      // 464
/*                                                                                                                    // 465
 * HELPERS                                                                                                            // 466
 */                                                                                                                   // 467
                                                                                                                      // 468
var appendAffectedKey = function(affectedKey, key) {                                                                  // 469
  if (key === "$each") {                                                                                              // 470
    return affectedKey;                                                                                               // 471
  } else {                                                                                                            // 472
    return (affectedKey ? affectedKey + "." + key : key);                                                             // 473
  }                                                                                                                   // 474
};                                                                                                                    // 475
                                                                                                                      // 476
var shouldCheck = function(key) {                                                                                     // 477
  if (key === "$pushAll") {                                                                                           // 478
    throw new Error("$pushAll is not supported; use $push + $each");                                                  // 479
  }                                                                                                                   // 480
  return !_.contains(["$pull", "$pullAll", "$pop", "$slice"], key);                                                   // 481
};                                                                                                                    // 482
                                                                                                                      // 483
var isBlank = function(str) {                                                                                         // 484
  if (typeof str !== "string") {                                                                                      // 485
    return false;                                                                                                     // 486
  }                                                                                                                   // 487
  return (/^\s*$/).test(str);                                                                                         // 488
};                                                                                                                    // 489
                                                                                                                      // 490
var isBlankNullOrUndefined = function(str) {                                                                          // 491
  return (str === void 0 || str === null || isBlank(str));                                                            // 492
};                                                                                                                    // 493
                                                                                                                      // 494
var errorObject = function(errorType, keyName, keyValue, def, ss) {                                                   // 495
  return {name: keyName, type: errorType, message: ss.messageForError(errorType, keyName, def, keyValue)};            // 496
};                                                                                                                    // 497
                                                                                                                      // 498
// Tests whether it's an Object as opposed to something that inherits from Object                                     // 499
var isBasicObject = function(obj) {                                                                                   // 500
  return _.isObject(obj) && Object.getPrototypeOf(obj) === Object.prototype;                                          // 501
};                                                                                                                    // 502
                                                                                                                      // 503
// The latest Safari returns false for Uint8Array, etc. instanceof Function                                           // 504
// unlike other browsers.                                                                                             // 505
var safariBugFix = function(type) {                                                                                   // 506
  return (typeof Uint8Array !== "undefined" && type === Uint8Array)                                                   // 507
          || (typeof Uint16Array !== "undefined" && type === Uint16Array)                                             // 508
          || (typeof Uint32Array !== "undefined" && type === Uint32Array)                                             // 509
          || (typeof Uint8ClampedArray !== "undefined" && type === Uint8ClampedArray);                                // 510
};                                                                                                                    // 511
                                                                                                                      // 512
var isSet = function(val) {                                                                                           // 513
  return val !== void 0 && val !== null;                                                                              // 514
};                                                                                                                    // 515
                                                                                                                      // 516
var makeGeneric = function(name) {                                                                                    // 517
  if (typeof name !== "string")                                                                                       // 518
    return null;                                                                                                      // 519
                                                                                                                      // 520
  return name.replace(/\.[0-9]+\./g, '.$.').replace(/\.[0-9]+/g, '.$');                                               // 521
};                                                                                                                    // 522
                                                                                                                      // 523
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);


/* Exports */
if (typeof Package === 'undefined') Package = {};
Package['simple-schema'] = {
  SimpleSchema: SimpleSchema,
  SchemaRegEx: SchemaRegEx,
  MongoObject: MongoObject
};

})();
