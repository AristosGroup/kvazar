(function () {

/* Imports */
var Meteor = Package.meteor.Meteor;
var _ = Package.underscore._;

/* Package-scope variables */
var EJSON, EJSONTest, base64Encode, base64Decode;

(function () {

//////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                              //
// packages/ejson/ejson.js                                                                      //
//                                                                                              //
//////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                //
EJSON = {};                                                                                     // 1
EJSONTest = {};                                                                                 // 2
                                                                                                // 3
var customTypes = {};                                                                           // 4
// Add a custom type, using a method of your choice to get to and                               // 5
// from a basic JSON-able representation.  The factory argument                                 // 6
// is a function of JSON-able --> your object                                                   // 7
// The type you add must have:                                                                  // 8
// - A clone() method, so that Meteor can deep-copy it when necessary.                          // 9
// - A equals() method, so that Meteor can compare it                                           // 10
// - A toJSONValue() method, so that Meteor can serialize it                                    // 11
// - a typeName() method, to show how to look it up in our type table.                          // 12
// It is okay if these methods are monkey-patched on.                                           // 13
//                                                                                              // 14
EJSON.addType = function (name, factory) {                                                      // 15
  if (_.has(customTypes, name))                                                                 // 16
    throw new Error("Type " + name + " already present");                                       // 17
  customTypes[name] = factory;                                                                  // 18
};                                                                                              // 19
                                                                                                // 20
var isInfOrNan = function (obj) {                                                               // 21
  return _.isNaN(obj) || obj === Infinity || obj === -Infinity;                                 // 22
};                                                                                              // 23
                                                                                                // 24
var builtinConverters = [                                                                       // 25
  { // Date                                                                                     // 26
    matchJSONValue: function (obj) {                                                            // 27
      return _.has(obj, '$date') && _.size(obj) === 1;                                          // 28
    },                                                                                          // 29
    matchObject: function (obj) {                                                               // 30
      return obj instanceof Date;                                                               // 31
    },                                                                                          // 32
    toJSONValue: function (obj) {                                                               // 33
      return {$date: obj.getTime()};                                                            // 34
    },                                                                                          // 35
    fromJSONValue: function (obj) {                                                             // 36
      return new Date(obj.$date);                                                               // 37
    }                                                                                           // 38
  },                                                                                            // 39
  { // NaN, Inf, -Inf. (These are the only objects with typeof !== 'object'                     // 40
    // which we match.)                                                                         // 41
    matchJSONValue: function (obj) {                                                            // 42
      return _.has(obj, '$InfNaN') && _.size(obj) === 1;                                        // 43
    },                                                                                          // 44
    matchObject: isInfOrNan,                                                                    // 45
    toJSONValue: function (obj) {                                                               // 46
      var sign;                                                                                 // 47
      if (_.isNaN(obj))                                                                         // 48
        sign = 0;                                                                               // 49
      else if (obj === Infinity)                                                                // 50
        sign = 1;                                                                               // 51
      else                                                                                      // 52
        sign = -1;                                                                              // 53
      return {$InfNaN: sign};                                                                   // 54
    },                                                                                          // 55
    fromJSONValue: function (obj) {                                                             // 56
      return obj.$InfNaN/0;                                                                     // 57
    }                                                                                           // 58
  },                                                                                            // 59
  { // Binary                                                                                   // 60
    matchJSONValue: function (obj) {                                                            // 61
      return _.has(obj, '$binary') && _.size(obj) === 1;                                        // 62
    },                                                                                          // 63
    matchObject: function (obj) {                                                               // 64
      return typeof Uint8Array !== 'undefined' && obj instanceof Uint8Array                     // 65
        || (obj && _.has(obj, '$Uint8ArrayPolyfill'));                                          // 66
    },                                                                                          // 67
    toJSONValue: function (obj) {                                                               // 68
      return {$binary: base64Encode(obj)};                                                      // 69
    },                                                                                          // 70
    fromJSONValue: function (obj) {                                                             // 71
      return base64Decode(obj.$binary);                                                         // 72
    }                                                                                           // 73
  },                                                                                            // 74
  { // Escaping one level                                                                       // 75
    matchJSONValue: function (obj) {                                                            // 76
      return _.has(obj, '$escape') && _.size(obj) === 1;                                        // 77
    },                                                                                          // 78
    matchObject: function (obj) {                                                               // 79
      if (_.isEmpty(obj) || _.size(obj) > 2) {                                                  // 80
        return false;                                                                           // 81
      }                                                                                         // 82
      return _.any(builtinConverters, function (converter) {                                    // 83
        return converter.matchJSONValue(obj);                                                   // 84
      });                                                                                       // 85
    },                                                                                          // 86
    toJSONValue: function (obj) {                                                               // 87
      var newObj = {};                                                                          // 88
      _.each(obj, function (value, key) {                                                       // 89
        newObj[key] = EJSON.toJSONValue(value);                                                 // 90
      });                                                                                       // 91
      return {$escape: newObj};                                                                 // 92
    },                                                                                          // 93
    fromJSONValue: function (obj) {                                                             // 94
      var newObj = {};                                                                          // 95
      _.each(obj.$escape, function (value, key) {                                               // 96
        newObj[key] = EJSON.fromJSONValue(value);                                               // 97
      });                                                                                       // 98
      return newObj;                                                                            // 99
    }                                                                                           // 100
  },                                                                                            // 101
  { // Custom                                                                                   // 102
    matchJSONValue: function (obj) {                                                            // 103
      return _.has(obj, '$type') && _.has(obj, '$value') && _.size(obj) === 2;                  // 104
    },                                                                                          // 105
    matchObject: function (obj) {                                                               // 106
      return EJSON._isCustomType(obj);                                                          // 107
    },                                                                                          // 108
    toJSONValue: function (obj) {                                                               // 109
      return {$type: obj.typeName(), $value: obj.toJSONValue()};                                // 110
    },                                                                                          // 111
    fromJSONValue: function (obj) {                                                             // 112
      var typeName = obj.$type;                                                                 // 113
      var converter = customTypes[typeName];                                                    // 114
      return converter(obj.$value);                                                             // 115
    }                                                                                           // 116
  }                                                                                             // 117
];                                                                                              // 118
                                                                                                // 119
EJSON._isCustomType = function (obj) {                                                          // 120
  return obj &&                                                                                 // 121
    typeof obj.toJSONValue === 'function' &&                                                    // 122
    typeof obj.typeName === 'function' &&                                                       // 123
    _.has(customTypes, obj.typeName());                                                         // 124
};                                                                                              // 125
                                                                                                // 126
                                                                                                // 127
// for both arrays and objects, in-place modification.                                          // 128
var adjustTypesToJSONValue =                                                                    // 129
EJSON._adjustTypesToJSONValue = function (obj) {                                                // 130
  // Is it an atom that we need to adjust?                                                      // 131
  if (obj === null)                                                                             // 132
    return null;                                                                                // 133
  var maybeChanged = toJSONValueHelper(obj);                                                    // 134
  if (maybeChanged !== undefined)                                                               // 135
    return maybeChanged;                                                                        // 136
                                                                                                // 137
  // Other atoms are unchanged.                                                                 // 138
  if (typeof obj !== 'object')                                                                  // 139
    return obj;                                                                                 // 140
                                                                                                // 141
  // Iterate over array or object structure.                                                    // 142
  _.each(obj, function (value, key) {                                                           // 143
    if (typeof value !== 'object' && value !== undefined &&                                     // 144
        !isInfOrNan(value))                                                                     // 145
      return; // continue                                                                       // 146
                                                                                                // 147
    var changed = toJSONValueHelper(value);                                                     // 148
    if (changed) {                                                                              // 149
      obj[key] = changed;                                                                       // 150
      return; // on to the next key                                                             // 151
    }                                                                                           // 152
    // if we get here, value is an object but not adjustable                                    // 153
    // at this level.  recurse.                                                                 // 154
    adjustTypesToJSONValue(value);                                                              // 155
  });                                                                                           // 156
  return obj;                                                                                   // 157
};                                                                                              // 158
                                                                                                // 159
// Either return the JSON-compatible version of the argument, or undefined (if                  // 160
// the item isn't itself replaceable, but maybe some fields in it are)                          // 161
var toJSONValueHelper = function (item) {                                                       // 162
  for (var i = 0; i < builtinConverters.length; i++) {                                          // 163
    var converter = builtinConverters[i];                                                       // 164
    if (converter.matchObject(item)) {                                                          // 165
      return converter.toJSONValue(item);                                                       // 166
    }                                                                                           // 167
  }                                                                                             // 168
  return undefined;                                                                             // 169
};                                                                                              // 170
                                                                                                // 171
EJSON.toJSONValue = function (item) {                                                           // 172
  var changed = toJSONValueHelper(item);                                                        // 173
  if (changed !== undefined)                                                                    // 174
    return changed;                                                                             // 175
  if (typeof item === 'object') {                                                               // 176
    item = EJSON.clone(item);                                                                   // 177
    adjustTypesToJSONValue(item);                                                               // 178
  }                                                                                             // 179
  return item;                                                                                  // 180
};                                                                                              // 181
                                                                                                // 182
// for both arrays and objects. Tries its best to just                                          // 183
// use the object you hand it, but may return something                                         // 184
// different if the object you hand it itself needs changing.                                   // 185
//                                                                                              // 186
var adjustTypesFromJSONValue =                                                                  // 187
EJSON._adjustTypesFromJSONValue = function (obj) {                                              // 188
  if (obj === null)                                                                             // 189
    return null;                                                                                // 190
  var maybeChanged = fromJSONValueHelper(obj);                                                  // 191
  if (maybeChanged !== obj)                                                                     // 192
    return maybeChanged;                                                                        // 193
                                                                                                // 194
  // Other atoms are unchanged.                                                                 // 195
  if (typeof obj !== 'object')                                                                  // 196
    return obj;                                                                                 // 197
                                                                                                // 198
  _.each(obj, function (value, key) {                                                           // 199
    if (typeof value === 'object') {                                                            // 200
      var changed = fromJSONValueHelper(value);                                                 // 201
      if (value !== changed) {                                                                  // 202
        obj[key] = changed;                                                                     // 203
        return;                                                                                 // 204
      }                                                                                         // 205
      // if we get here, value is an object but not adjustable                                  // 206
      // at this level.  recurse.                                                               // 207
      adjustTypesFromJSONValue(value);                                                          // 208
    }                                                                                           // 209
  });                                                                                           // 210
  return obj;                                                                                   // 211
};                                                                                              // 212
                                                                                                // 213
// Either return the argument changed to have the non-json                                      // 214
// rep of itself (the Object version) or the argument itself.                                   // 215
                                                                                                // 216
// DOES NOT RECURSE.  For actually getting the fully-changed value, use                         // 217
// EJSON.fromJSONValue                                                                          // 218
var fromJSONValueHelper = function (value) {                                                    // 219
  if (typeof value === 'object' && value !== null) {                                            // 220
    if (_.size(value) <= 2                                                                      // 221
        && _.all(value, function (v, k) {                                                       // 222
          return typeof k === 'string' && k.substr(0, 1) === '$';                               // 223
        })) {                                                                                   // 224
      for (var i = 0; i < builtinConverters.length; i++) {                                      // 225
        var converter = builtinConverters[i];                                                   // 226
        if (converter.matchJSONValue(value)) {                                                  // 227
          return converter.fromJSONValue(value);                                                // 228
        }                                                                                       // 229
      }                                                                                         // 230
    }                                                                                           // 231
  }                                                                                             // 232
  return value;                                                                                 // 233
};                                                                                              // 234
                                                                                                // 235
EJSON.fromJSONValue = function (item) {                                                         // 236
  var changed = fromJSONValueHelper(item);                                                      // 237
  if (changed === item && typeof item === 'object') {                                           // 238
    item = EJSON.clone(item);                                                                   // 239
    adjustTypesFromJSONValue(item);                                                             // 240
    return item;                                                                                // 241
  } else {                                                                                      // 242
    return changed;                                                                             // 243
  }                                                                                             // 244
};                                                                                              // 245
                                                                                                // 246
EJSON.stringify = function (item, options) {                                                    // 247
  var json = EJSON.toJSONValue(item);                                                           // 248
  if (options && (options.canonical || options.indent)) {                                       // 249
    return EJSON._canonicalStringify(json, options);                                            // 250
  } else {                                                                                      // 251
    return JSON.stringify(json);                                                                // 252
  }                                                                                             // 253
};                                                                                              // 254
                                                                                                // 255
EJSON.parse = function (item) {                                                                 // 256
  if (typeof item !== 'string')                                                                 // 257
    throw new Error("EJSON.parse argument should be a string");                                 // 258
  return EJSON.fromJSONValue(JSON.parse(item));                                                 // 259
};                                                                                              // 260
                                                                                                // 261
EJSON.isBinary = function (obj) {                                                               // 262
  return !!((typeof Uint8Array !== 'undefined' && obj instanceof Uint8Array) ||                 // 263
    (obj && obj.$Uint8ArrayPolyfill));                                                          // 264
};                                                                                              // 265
                                                                                                // 266
EJSON.equals = function (a, b, options) {                                                       // 267
  var i;                                                                                        // 268
  var keyOrderSensitive = !!(options && options.keyOrderSensitive);                             // 269
  if (a === b)                                                                                  // 270
    return true;                                                                                // 271
  if (_.isNaN(a) && _.isNaN(b))                                                                 // 272
    return true; // This differs from the IEEE spec for NaN equality, b/c we don't want         // 273
                 // anything ever with a NaN to be poisoned from becoming equal to anything.    // 274
  if (!a || !b) // if either one is falsy, they'd have to be === to be equal                    // 275
    return false;                                                                               // 276
  if (!(typeof a === 'object' && typeof b === 'object'))                                        // 277
    return false;                                                                               // 278
  if (a instanceof Date && b instanceof Date)                                                   // 279
    return a.valueOf() === b.valueOf();                                                         // 280
  if (EJSON.isBinary(a) && EJSON.isBinary(b)) {                                                 // 281
    if (a.length !== b.length)                                                                  // 282
      return false;                                                                             // 283
    for (i = 0; i < a.length; i++) {                                                            // 284
      if (a[i] !== b[i])                                                                        // 285
        return false;                                                                           // 286
    }                                                                                           // 287
    return true;                                                                                // 288
  }                                                                                             // 289
  if (typeof (a.equals) === 'function')                                                         // 290
    return a.equals(b, options);                                                                // 291
  if (a instanceof Array) {                                                                     // 292
    if (!(b instanceof Array))                                                                  // 293
      return false;                                                                             // 294
    if (a.length !== b.length)                                                                  // 295
      return false;                                                                             // 296
    for (i = 0; i < a.length; i++) {                                                            // 297
      if (!EJSON.equals(a[i], b[i], options))                                                   // 298
        return false;                                                                           // 299
    }                                                                                           // 300
    return true;                                                                                // 301
  }                                                                                             // 302
  // fall back to structural equality of objects                                                // 303
  var ret;                                                                                      // 304
  if (keyOrderSensitive) {                                                                      // 305
    var bKeys = [];                                                                             // 306
    _.each(b, function (val, x) {                                                               // 307
        bKeys.push(x);                                                                          // 308
    });                                                                                         // 309
    i = 0;                                                                                      // 310
    ret = _.all(a, function (val, x) {                                                          // 311
      if (i >= bKeys.length) {                                                                  // 312
        return false;                                                                           // 313
      }                                                                                         // 314
      if (x !== bKeys[i]) {                                                                     // 315
        return false;                                                                           // 316
      }                                                                                         // 317
      if (!EJSON.equals(val, b[bKeys[i]], options)) {                                           // 318
        return false;                                                                           // 319
      }                                                                                         // 320
      i++;                                                                                      // 321
      return true;                                                                              // 322
    });                                                                                         // 323
    return ret && i === bKeys.length;                                                           // 324
  } else {                                                                                      // 325
    i = 0;                                                                                      // 326
    ret = _.all(a, function (val, key) {                                                        // 327
      if (!_.has(b, key)) {                                                                     // 328
        return false;                                                                           // 329
      }                                                                                         // 330
      if (!EJSON.equals(val, b[key], options)) {                                                // 331
        return false;                                                                           // 332
      }                                                                                         // 333
      i++;                                                                                      // 334
      return true;                                                                              // 335
    });                                                                                         // 336
    return ret && _.size(b) === i;                                                              // 337
  }                                                                                             // 338
};                                                                                              // 339
                                                                                                // 340
EJSON.clone = function (v) {                                                                    // 341
  var ret;                                                                                      // 342
  if (typeof v !== "object")                                                                    // 343
    return v;                                                                                   // 344
  if (v === null)                                                                               // 345
    return null; // null has typeof "object"                                                    // 346
  if (v instanceof Date)                                                                        // 347
    return new Date(v.getTime());                                                               // 348
  if (EJSON.isBinary(v)) {                                                                      // 349
    ret = EJSON.newBinary(v.length);                                                            // 350
    for (var i = 0; i < v.length; i++) {                                                        // 351
      ret[i] = v[i];                                                                            // 352
    }                                                                                           // 353
    return ret;                                                                                 // 354
  }                                                                                             // 355
  // XXX: Use something better than underscore's isArray                                        // 356
  if (_.isArray(v) || _.isArguments(v)) {                                                       // 357
    // For some reason, _.map doesn't work in this context on Opera (weird test                 // 358
    // failures).                                                                               // 359
    ret = [];                                                                                   // 360
    for (i = 0; i < v.length; i++)                                                              // 361
      ret[i] = EJSON.clone(v[i]);                                                               // 362
    return ret;                                                                                 // 363
  }                                                                                             // 364
  // handle general user-defined typed Objects if they have a clone method                      // 365
  if (typeof v.clone === 'function') {                                                          // 366
    return v.clone();                                                                           // 367
  }                                                                                             // 368
  // handle other objects                                                                       // 369
  ret = {};                                                                                     // 370
  _.each(v, function (value, key) {                                                             // 371
    ret[key] = EJSON.clone(value);                                                              // 372
  });                                                                                           // 373
  return ret;                                                                                   // 374
};                                                                                              // 375
                                                                                                // 376
//////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

//////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                              //
// packages/ejson/stringify.js                                                                  //
//                                                                                              //
//////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                //
// Based on json2.js from https://github.com/douglascrockford/JSON-js                           // 1
//                                                                                              // 2
//    json2.js                                                                                  // 3
//    2012-10-08                                                                                // 4
//                                                                                              // 5
//    Public Domain.                                                                            // 6
//                                                                                              // 7
//    NO WARRANTY EXPRESSED OR IMPLIED. USE AT YOUR OWN RISK.                                   // 8
                                                                                                // 9
function quote(string) {                                                                        // 10
  return JSON.stringify(string);                                                                // 11
}                                                                                               // 12
                                                                                                // 13
var str = function (key, holder, singleIndent, outerIndent, canonical) {                        // 14
                                                                                                // 15
  // Produce a string from holder[key].                                                         // 16
                                                                                                // 17
  var i;          // The loop counter.                                                          // 18
  var k;          // The member key.                                                            // 19
  var v;          // The member value.                                                          // 20
  var length;                                                                                   // 21
  var innerIndent = outerIndent;                                                                // 22
  var partial;                                                                                  // 23
  var value = holder[key];                                                                      // 24
                                                                                                // 25
  // What happens next depends on the value's type.                                             // 26
                                                                                                // 27
  switch (typeof value) {                                                                       // 28
  case 'string':                                                                                // 29
    return quote(value);                                                                        // 30
  case 'number':                                                                                // 31
    // JSON numbers must be finite. Encode non-finite numbers as null.                          // 32
    return isFinite(value) ? String(value) : 'null';                                            // 33
  case 'boolean':                                                                               // 34
    return String(value);                                                                       // 35
  // If the type is 'object', we might be dealing with an object or an array or                 // 36
  // null.                                                                                      // 37
  case 'object':                                                                                // 38
    // Due to a specification blunder in ECMAScript, typeof null is 'object',                   // 39
    // so watch out for that case.                                                              // 40
    if (!value) {                                                                               // 41
      return 'null';                                                                            // 42
    }                                                                                           // 43
    // Make an array to hold the partial results of stringifying this object value.             // 44
    innerIndent = outerIndent + singleIndent;                                                   // 45
    partial = [];                                                                               // 46
                                                                                                // 47
    // Is the value an array?                                                                   // 48
    if (_.isArray(value) || _.isArguments(value)) {                                             // 49
                                                                                                // 50
      // The value is an array. Stringify every element. Use null as a placeholder              // 51
      // for non-JSON values.                                                                   // 52
                                                                                                // 53
      length = value.length;                                                                    // 54
      for (i = 0; i < length; i += 1) {                                                         // 55
        partial[i] = str(i, value, singleIndent, innerIndent, canonical) || 'null';             // 56
      }                                                                                         // 57
                                                                                                // 58
      // Join all of the elements together, separated with commas, and wrap them in             // 59
      // brackets.                                                                              // 60
                                                                                                // 61
      if (partial.length === 0) {                                                               // 62
        v = '[]';                                                                               // 63
      } else if (innerIndent) {                                                                 // 64
        v = '[\n' + innerIndent + partial.join(',\n' + innerIndent) + '\n' + outerIndent + ']'; // 65
      } else {                                                                                  // 66
        v = '[' + partial.join(',') + ']';                                                      // 67
      }                                                                                         // 68
      return v;                                                                                 // 69
    }                                                                                           // 70
                                                                                                // 71
                                                                                                // 72
    // Iterate through all of the keys in the object.                                           // 73
    var keys = _.keys(value);                                                                   // 74
    if (canonical)                                                                              // 75
      keys = keys.sort();                                                                       // 76
    _.each(keys, function (k) {                                                                 // 77
      v = str(k, value, singleIndent, innerIndent, canonical);                                  // 78
      if (v) {                                                                                  // 79
        partial.push(quote(k) + (innerIndent ? ': ' : ':') + v);                                // 80
      }                                                                                         // 81
    });                                                                                         // 82
                                                                                                // 83
                                                                                                // 84
    // Join all of the member texts together, separated with commas,                            // 85
    // and wrap them in braces.                                                                 // 86
                                                                                                // 87
    if (partial.length === 0) {                                                                 // 88
      v = '{}';                                                                                 // 89
    } else if (innerIndent) {                                                                   // 90
      v = '{\n' + innerIndent + partial.join(',\n' + innerIndent) + '\n' + outerIndent + '}';   // 91
    } else {                                                                                    // 92
      v = '{' + partial.join(',') + '}';                                                        // 93
    }                                                                                           // 94
    return v;                                                                                   // 95
  }                                                                                             // 96
}                                                                                               // 97
                                                                                                // 98
// If the JSON object does not yet have a stringify method, give it one.                        // 99
                                                                                                // 100
EJSON._canonicalStringify = function (value, options) {                                         // 101
  // Make a fake root object containing our value under the key of ''.                          // 102
  // Return the result of stringifying the value.                                               // 103
  options = _.extend({                                                                          // 104
    indent: "",                                                                                 // 105
    canonical: false                                                                            // 106
  }, options);                                                                                  // 107
  if (options.indent === true) {                                                                // 108
    options.indent = "  ";                                                                      // 109
  } else if (typeof options.indent === 'number') {                                              // 110
    var newIndent = "";                                                                         // 111
    for (var i = 0; i < options.indent; i++) {                                                  // 112
      newIndent += ' ';                                                                         // 113
    }                                                                                           // 114
    options.indent = newIndent;                                                                 // 115
  }                                                                                             // 116
  return str('', {'': value}, options.indent, "", options.canonical);                           // 117
};                                                                                              // 118
                                                                                                // 119
//////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

//////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                              //
// packages/ejson/base64.js                                                                     //
//                                                                                              //
//////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                //
// Base 64 encoding                                                                             // 1
                                                                                                // 2
var BASE_64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";         // 3
                                                                                                // 4
var BASE_64_VALS = {};                                                                          // 5
                                                                                                // 6
for (var i = 0; i < BASE_64_CHARS.length; i++) {                                                // 7
  BASE_64_VALS[BASE_64_CHARS.charAt(i)] = i;                                                    // 8
};                                                                                              // 9
                                                                                                // 10
base64Encode = function (array) {                                                               // 11
  var answer = [];                                                                              // 12
  var a = null;                                                                                 // 13
  var b = null;                                                                                 // 14
  var c = null;                                                                                 // 15
  var d = null;                                                                                 // 16
  for (var i = 0; i < array.length; i++) {                                                      // 17
    switch (i % 3) {                                                                            // 18
    case 0:                                                                                     // 19
      a = (array[i] >> 2) & 0x3F;                                                               // 20
      b = (array[i] & 0x03) << 4;                                                               // 21
      break;                                                                                    // 22
    case 1:                                                                                     // 23
      b = b | (array[i] >> 4) & 0xF;                                                            // 24
      c = (array[i] & 0xF) << 2;                                                                // 25
      break;                                                                                    // 26
    case 2:                                                                                     // 27
      c = c | (array[i] >> 6) & 0x03;                                                           // 28
      d = array[i] & 0x3F;                                                                      // 29
      answer.push(getChar(a));                                                                  // 30
      answer.push(getChar(b));                                                                  // 31
      answer.push(getChar(c));                                                                  // 32
      answer.push(getChar(d));                                                                  // 33
      a = null;                                                                                 // 34
      b = null;                                                                                 // 35
      c = null;                                                                                 // 36
      d = null;                                                                                 // 37
      break;                                                                                    // 38
    }                                                                                           // 39
  }                                                                                             // 40
  if (a != null) {                                                                              // 41
    answer.push(getChar(a));                                                                    // 42
    answer.push(getChar(b));                                                                    // 43
    if (c == null)                                                                              // 44
      answer.push('=');                                                                         // 45
    else                                                                                        // 46
      answer.push(getChar(c));                                                                  // 47
    if (d == null)                                                                              // 48
      answer.push('=');                                                                         // 49
  }                                                                                             // 50
  return answer.join("");                                                                       // 51
};                                                                                              // 52
                                                                                                // 53
var getChar = function (val) {                                                                  // 54
  return BASE_64_CHARS.charAt(val);                                                             // 55
};                                                                                              // 56
                                                                                                // 57
var getVal = function (ch) {                                                                    // 58
  if (ch === '=') {                                                                             // 59
    return -1;                                                                                  // 60
  }                                                                                             // 61
  return BASE_64_VALS[ch];                                                                      // 62
};                                                                                              // 63
                                                                                                // 64
EJSON.newBinary = function (len) {                                                              // 65
  if (typeof Uint8Array === 'undefined' || typeof ArrayBuffer === 'undefined') {                // 66
    var ret = [];                                                                               // 67
    for (var i = 0; i < len; i++) {                                                             // 68
      ret.push(0);                                                                              // 69
    }                                                                                           // 70
    ret.$Uint8ArrayPolyfill = true;                                                             // 71
    return ret;                                                                                 // 72
  }                                                                                             // 73
  return new Uint8Array(new ArrayBuffer(len));                                                  // 74
};                                                                                              // 75
                                                                                                // 76
base64Decode = function (str) {                                                                 // 77
  var len = Math.floor((str.length*3)/4);                                                       // 78
  if (str.charAt(str.length - 1) == '=') {                                                      // 79
    len--;                                                                                      // 80
    if (str.charAt(str.length - 2) == '=')                                                      // 81
      len--;                                                                                    // 82
  }                                                                                             // 83
  var arr = EJSON.newBinary(len);                                                               // 84
                                                                                                // 85
  var one = null;                                                                               // 86
  var two = null;                                                                               // 87
  var three = null;                                                                             // 88
                                                                                                // 89
  var j = 0;                                                                                    // 90
                                                                                                // 91
  for (var i = 0; i < str.length; i++) {                                                        // 92
    var c = str.charAt(i);                                                                      // 93
    var v = getVal(c);                                                                          // 94
    switch (i % 4) {                                                                            // 95
    case 0:                                                                                     // 96
      if (v < 0)                                                                                // 97
        throw new Error('invalid base64 string');                                               // 98
      one = v << 2;                                                                             // 99
      break;                                                                                    // 100
    case 1:                                                                                     // 101
      if (v < 0)                                                                                // 102
        throw new Error('invalid base64 string');                                               // 103
      one = one | (v >> 4);                                                                     // 104
      arr[j++] = one;                                                                           // 105
      two = (v & 0x0F) << 4;                                                                    // 106
      break;                                                                                    // 107
    case 2:                                                                                     // 108
      if (v >= 0) {                                                                             // 109
        two = two | (v >> 2);                                                                   // 110
        arr[j++] = two;                                                                         // 111
        three = (v & 0x03) << 6;                                                                // 112
      }                                                                                         // 113
      break;                                                                                    // 114
    case 3:                                                                                     // 115
      if (v >= 0) {                                                                             // 116
        arr[j++] = three | v;                                                                   // 117
      }                                                                                         // 118
      break;                                                                                    // 119
    }                                                                                           // 120
  }                                                                                             // 121
  return arr;                                                                                   // 122
};                                                                                              // 123
                                                                                                // 124
EJSONTest.base64Encode = base64Encode;                                                          // 125
                                                                                                // 126
EJSONTest.base64Decode = base64Decode;                                                          // 127
                                                                                                // 128
//////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);


/* Exports */
if (typeof Package === 'undefined') Package = {};
Package.ejson = {
  EJSON: EJSON,
  EJSONTest: EJSONTest
};

})();
