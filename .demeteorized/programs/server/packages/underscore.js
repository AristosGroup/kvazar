(function () {

/* Package-scope variables */
var _, exports;

(function () {

///////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                       //
// packages/underscore/pre.js                                                                            //
//                                                                                                       //
///////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                         //
// Define an object named exports. This will cause underscore.js to put `_` as a                         // 1
// field on it, instead of in the global namespace.  See also post.js.                                   // 2
exports = {};                                                                                            // 3
                                                                                                         // 4
///////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

///////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                       //
// packages/underscore/underscore.js                                                                     //
//                                                                                                       //
///////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                         //
//     Underscore.js 1.5.2                                                                               // 1
//     http://underscorejs.org                                                                           // 2
//     (c) 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors                // 3
//     Underscore may be freely distributed under the MIT license.                                       // 4
                                                                                                         // 5
(function() {                                                                                            // 6
                                                                                                         // 7
  // Baseline setup                                                                                      // 8
  // --------------                                                                                      // 9
                                                                                                         // 10
  // Establish the root object, `window` in the browser, or `exports` on the server.                     // 11
  var root = this;                                                                                       // 12
                                                                                                         // 13
  // Save the previous value of the `_` variable.                                                        // 14
  var previousUnderscore = root._;                                                                       // 15
                                                                                                         // 16
  // Establish the object that gets returned to break out of a loop iteration.                           // 17
  var breaker = {};                                                                                      // 18
                                                                                                         // 19
  // Save bytes in the minified (but not gzipped) version:                                               // 20
  var ArrayProto = Array.prototype, ObjProto = Object.prototype, FuncProto = Function.prototype;         // 21
                                                                                                         // 22
  // Create quick reference variables for speed access to core prototypes.                               // 23
  var                                                                                                    // 24
    push             = ArrayProto.push,                                                                  // 25
    slice            = ArrayProto.slice,                                                                 // 26
    concat           = ArrayProto.concat,                                                                // 27
    toString         = ObjProto.toString,                                                                // 28
    hasOwnProperty   = ObjProto.hasOwnProperty;                                                          // 29
                                                                                                         // 30
  // All **ECMAScript 5** native function implementations that we hope to use                            // 31
  // are declared here.                                                                                  // 32
  var                                                                                                    // 33
    nativeForEach      = ArrayProto.forEach,                                                             // 34
    nativeMap          = ArrayProto.map,                                                                 // 35
    nativeReduce       = ArrayProto.reduce,                                                              // 36
    nativeReduceRight  = ArrayProto.reduceRight,                                                         // 37
    nativeFilter       = ArrayProto.filter,                                                              // 38
    nativeEvery        = ArrayProto.every,                                                               // 39
    nativeSome         = ArrayProto.some,                                                                // 40
    nativeIndexOf      = ArrayProto.indexOf,                                                             // 41
    nativeLastIndexOf  = ArrayProto.lastIndexOf,                                                         // 42
    nativeIsArray      = Array.isArray,                                                                  // 43
    nativeKeys         = Object.keys,                                                                    // 44
    nativeBind         = FuncProto.bind;                                                                 // 45
                                                                                                         // 46
  // Create a safe reference to the Underscore object for use below.                                     // 47
  var _ = function(obj) {                                                                                // 48
    if (obj instanceof _) return obj;                                                                    // 49
    if (!(this instanceof _)) return new _(obj);                                                         // 50
    this._wrapped = obj;                                                                                 // 51
  };                                                                                                     // 52
                                                                                                         // 53
  // Export the Underscore object for **Node.js**, with                                                  // 54
  // backwards-compatibility for the old `require()` API. If we're in                                    // 55
  // the browser, add `_` as a global object via a string identifier,                                    // 56
  // for Closure Compiler "advanced" mode.                                                               // 57
  if (typeof exports !== 'undefined') {                                                                  // 58
    if (typeof module !== 'undefined' && module.exports) {                                               // 59
      exports = module.exports = _;                                                                      // 60
    }                                                                                                    // 61
    exports._ = _;                                                                                       // 62
  } else {                                                                                               // 63
    root._ = _;                                                                                          // 64
  }                                                                                                      // 65
                                                                                                         // 66
  // Current version.                                                                                    // 67
  _.VERSION = '1.5.2';                                                                                   // 68
                                                                                                         // 69
  // Collection Functions                                                                                // 70
  // --------------------                                                                                // 71
                                                                                                         // 72
  // The cornerstone, an `each` implementation, aka `forEach`.                                           // 73
  // Handles objects with the built-in `forEach`, arrays, and raw objects.                               // 74
  // Delegates to **ECMAScript 5**'s native `forEach` if available.                                      // 75
  var each = _.each = _.forEach = function(obj, iterator, context) {                                     // 76
    if (obj == null) return;                                                                             // 77
    if (nativeForEach && obj.forEach === nativeForEach) {                                                // 78
      obj.forEach(iterator, context);                                                                    // 79
    } else if (obj.length === +obj.length) {                                                             // 80
      for (var i = 0, length = obj.length; i < length; i++) {                                            // 81
        if (iterator.call(context, obj[i], i, obj) === breaker) return;                                  // 82
      }                                                                                                  // 83
    } else {                                                                                             // 84
      var keys = _.keys(obj);                                                                            // 85
      for (var i = 0, length = keys.length; i < length; i++) {                                           // 86
        if (iterator.call(context, obj[keys[i]], keys[i], obj) === breaker) return;                      // 87
      }                                                                                                  // 88
    }                                                                                                    // 89
  };                                                                                                     // 90
                                                                                                         // 91
  // Return the results of applying the iterator to each element.                                        // 92
  // Delegates to **ECMAScript 5**'s native `map` if available.                                          // 93
  _.map = _.collect = function(obj, iterator, context) {                                                 // 94
    var results = [];                                                                                    // 95
    if (obj == null) return results;                                                                     // 96
    if (nativeMap && obj.map === nativeMap) return obj.map(iterator, context);                           // 97
    each(obj, function(value, index, list) {                                                             // 98
      results.push(iterator.call(context, value, index, list));                                          // 99
    });                                                                                                  // 100
    return results;                                                                                      // 101
  };                                                                                                     // 102
                                                                                                         // 103
  var reduceError = 'Reduce of empty array with no initial value';                                       // 104
                                                                                                         // 105
  // **Reduce** builds up a single result from a list of values, aka `inject`,                           // 106
  // or `foldl`. Delegates to **ECMAScript 5**'s native `reduce` if available.                           // 107
  _.reduce = _.foldl = _.inject = function(obj, iterator, memo, context) {                               // 108
    var initial = arguments.length > 2;                                                                  // 109
    if (obj == null) obj = [];                                                                           // 110
    if (nativeReduce && obj.reduce === nativeReduce) {                                                   // 111
      if (context) iterator = _.bind(iterator, context);                                                 // 112
      return initial ? obj.reduce(iterator, memo) : obj.reduce(iterator);                                // 113
    }                                                                                                    // 114
    each(obj, function(value, index, list) {                                                             // 115
      if (!initial) {                                                                                    // 116
        memo = value;                                                                                    // 117
        initial = true;                                                                                  // 118
      } else {                                                                                           // 119
        memo = iterator.call(context, memo, value, index, list);                                         // 120
      }                                                                                                  // 121
    });                                                                                                  // 122
    if (!initial) throw new TypeError(reduceError);                                                      // 123
    return memo;                                                                                         // 124
  };                                                                                                     // 125
                                                                                                         // 126
  // The right-associative version of reduce, also known as `foldr`.                                     // 127
  // Delegates to **ECMAScript 5**'s native `reduceRight` if available.                                  // 128
  _.reduceRight = _.foldr = function(obj, iterator, memo, context) {                                     // 129
    var initial = arguments.length > 2;                                                                  // 130
    if (obj == null) obj = [];                                                                           // 131
    if (nativeReduceRight && obj.reduceRight === nativeReduceRight) {                                    // 132
      if (context) iterator = _.bind(iterator, context);                                                 // 133
      return initial ? obj.reduceRight(iterator, memo) : obj.reduceRight(iterator);                      // 134
    }                                                                                                    // 135
    var length = obj.length;                                                                             // 136
    if (length !== +length) {                                                                            // 137
      var keys = _.keys(obj);                                                                            // 138
      length = keys.length;                                                                              // 139
    }                                                                                                    // 140
    each(obj, function(value, index, list) {                                                             // 141
      index = keys ? keys[--length] : --length;                                                          // 142
      if (!initial) {                                                                                    // 143
        memo = obj[index];                                                                               // 144
        initial = true;                                                                                  // 145
      } else {                                                                                           // 146
        memo = iterator.call(context, memo, obj[index], index, list);                                    // 147
      }                                                                                                  // 148
    });                                                                                                  // 149
    if (!initial) throw new TypeError(reduceError);                                                      // 150
    return memo;                                                                                         // 151
  };                                                                                                     // 152
                                                                                                         // 153
  // Return the first value which passes a truth test. Aliased as `detect`.                              // 154
  _.find = _.detect = function(obj, iterator, context) {                                                 // 155
    var result;                                                                                          // 156
    any(obj, function(value, index, list) {                                                              // 157
      if (iterator.call(context, value, index, list)) {                                                  // 158
        result = value;                                                                                  // 159
        return true;                                                                                     // 160
      }                                                                                                  // 161
    });                                                                                                  // 162
    return result;                                                                                       // 163
  };                                                                                                     // 164
                                                                                                         // 165
  // Return all the elements that pass a truth test.                                                     // 166
  // Delegates to **ECMAScript 5**'s native `filter` if available.                                       // 167
  // Aliased as `select`.                                                                                // 168
  _.filter = _.select = function(obj, iterator, context) {                                               // 169
    var results = [];                                                                                    // 170
    if (obj == null) return results;                                                                     // 171
    if (nativeFilter && obj.filter === nativeFilter) return obj.filter(iterator, context);               // 172
    each(obj, function(value, index, list) {                                                             // 173
      if (iterator.call(context, value, index, list)) results.push(value);                               // 174
    });                                                                                                  // 175
    return results;                                                                                      // 176
  };                                                                                                     // 177
                                                                                                         // 178
  // Return all the elements for which a truth test fails.                                               // 179
  _.reject = function(obj, iterator, context) {                                                          // 180
    return _.filter(obj, function(value, index, list) {                                                  // 181
      return !iterator.call(context, value, index, list);                                                // 182
    }, context);                                                                                         // 183
  };                                                                                                     // 184
                                                                                                         // 185
  // Determine whether all of the elements match a truth test.                                           // 186
  // Delegates to **ECMAScript 5**'s native `every` if available.                                        // 187
  // Aliased as `all`.                                                                                   // 188
  _.every = _.all = function(obj, iterator, context) {                                                   // 189
    iterator || (iterator = _.identity);                                                                 // 190
    var result = true;                                                                                   // 191
    if (obj == null) return result;                                                                      // 192
    if (nativeEvery && obj.every === nativeEvery) return obj.every(iterator, context);                   // 193
    each(obj, function(value, index, list) {                                                             // 194
      if (!(result = result && iterator.call(context, value, index, list))) return breaker;              // 195
    });                                                                                                  // 196
    return !!result;                                                                                     // 197
  };                                                                                                     // 198
                                                                                                         // 199
  // Determine if at least one element in the object matches a truth test.                               // 200
  // Delegates to **ECMAScript 5**'s native `some` if available.                                         // 201
  // Aliased as `any`.                                                                                   // 202
  var any = _.some = _.any = function(obj, iterator, context) {                                          // 203
    iterator || (iterator = _.identity);                                                                 // 204
    var result = false;                                                                                  // 205
    if (obj == null) return result;                                                                      // 206
    if (nativeSome && obj.some === nativeSome) return obj.some(iterator, context);                       // 207
    each(obj, function(value, index, list) {                                                             // 208
      if (result || (result = iterator.call(context, value, index, list))) return breaker;               // 209
    });                                                                                                  // 210
    return !!result;                                                                                     // 211
  };                                                                                                     // 212
                                                                                                         // 213
  // Determine if the array or object contains a given value (using `===`).                              // 214
  // Aliased as `include`.                                                                               // 215
  _.contains = _.include = function(obj, target) {                                                       // 216
    if (obj == null) return false;                                                                       // 217
    if (nativeIndexOf && obj.indexOf === nativeIndexOf) return obj.indexOf(target) != -1;                // 218
    return any(obj, function(value) {                                                                    // 219
      return value === target;                                                                           // 220
    });                                                                                                  // 221
  };                                                                                                     // 222
                                                                                                         // 223
  // Invoke a method (with arguments) on every item in a collection.                                     // 224
  _.invoke = function(obj, method) {                                                                     // 225
    var args = slice.call(arguments, 2);                                                                 // 226
    var isFunc = _.isFunction(method);                                                                   // 227
    return _.map(obj, function(value) {                                                                  // 228
      return (isFunc ? method : value[method]).apply(value, args);                                       // 229
    });                                                                                                  // 230
  };                                                                                                     // 231
                                                                                                         // 232
  // Convenience version of a common use case of `map`: fetching a property.                             // 233
  _.pluck = function(obj, key) {                                                                         // 234
    return _.map(obj, function(value){ return value[key]; });                                            // 235
  };                                                                                                     // 236
                                                                                                         // 237
  // Convenience version of a common use case of `filter`: selecting only objects                        // 238
  // containing specific `key:value` pairs.                                                              // 239
  _.where = function(obj, attrs, first) {                                                                // 240
    if (_.isEmpty(attrs)) return first ? void 0 : [];                                                    // 241
    return _[first ? 'find' : 'filter'](obj, function(value) {                                           // 242
      for (var key in attrs) {                                                                           // 243
        if (attrs[key] !== value[key]) return false;                                                     // 244
      }                                                                                                  // 245
      return true;                                                                                       // 246
    });                                                                                                  // 247
  };                                                                                                     // 248
                                                                                                         // 249
  // Convenience version of a common use case of `find`: getting the first object                        // 250
  // containing specific `key:value` pairs.                                                              // 251
  _.findWhere = function(obj, attrs) {                                                                   // 252
    return _.where(obj, attrs, true);                                                                    // 253
  };                                                                                                     // 254
                                                                                                         // 255
  // Return the maximum element or (element-based computation).                                          // 256
  // Can't optimize arrays of integers longer than 65,535 elements.                                      // 257
  // See [WebKit Bug 80797](https://bugs.webkit.org/show_bug.cgi?id=80797)                               // 258
  _.max = function(obj, iterator, context) {                                                             // 259
    if (!iterator && _.isArray(obj) && obj[0] === +obj[0] && obj.length < 65535) {                       // 260
      return Math.max.apply(Math, obj);                                                                  // 261
    }                                                                                                    // 262
    if (!iterator && _.isEmpty(obj)) return -Infinity;                                                   // 263
    var result = {computed : -Infinity, value: -Infinity};                                               // 264
    each(obj, function(value, index, list) {                                                             // 265
      var computed = iterator ? iterator.call(context, value, index, list) : value;                      // 266
      computed > result.computed && (result = {value : value, computed : computed});                     // 267
    });                                                                                                  // 268
    return result.value;                                                                                 // 269
  };                                                                                                     // 270
                                                                                                         // 271
  // Return the minimum element (or element-based computation).                                          // 272
  _.min = function(obj, iterator, context) {                                                             // 273
    if (!iterator && _.isArray(obj) && obj[0] === +obj[0] && obj.length < 65535) {                       // 274
      return Math.min.apply(Math, obj);                                                                  // 275
    }                                                                                                    // 276
    if (!iterator && _.isEmpty(obj)) return Infinity;                                                    // 277
    var result = {computed : Infinity, value: Infinity};                                                 // 278
    each(obj, function(value, index, list) {                                                             // 279
      var computed = iterator ? iterator.call(context, value, index, list) : value;                      // 280
      computed < result.computed && (result = {value : value, computed : computed});                     // 281
    });                                                                                                  // 282
    return result.value;                                                                                 // 283
  };                                                                                                     // 284
                                                                                                         // 285
  // Shuffle an array, using the modern version of the                                                   // 286
  // [Fisher-Yates shuffle](http://en.wikipedia.org/wiki/Fisher–Yates_shuffle).                          // 287
  _.shuffle = function(obj) {                                                                            // 288
    var rand;                                                                                            // 289
    var index = 0;                                                                                       // 290
    var shuffled = [];                                                                                   // 291
    each(obj, function(value) {                                                                          // 292
      rand = _.random(index++);                                                                          // 293
      shuffled[index - 1] = shuffled[rand];                                                              // 294
      shuffled[rand] = value;                                                                            // 295
    });                                                                                                  // 296
    return shuffled;                                                                                     // 297
  };                                                                                                     // 298
                                                                                                         // 299
  // Sample **n** random values from an array.                                                           // 300
  // If **n** is not specified, returns a single random element from the array.                          // 301
  // The internal `guard` argument allows it to work with `map`.                                         // 302
  _.sample = function(obj, n, guard) {                                                                   // 303
    if (arguments.length < 2 || guard) {                                                                 // 304
      return obj[_.random(obj.length - 1)];                                                              // 305
    }                                                                                                    // 306
    return _.shuffle(obj).slice(0, Math.max(0, n));                                                      // 307
  };                                                                                                     // 308
                                                                                                         // 309
  // An internal function to generate lookup iterators.                                                  // 310
  var lookupIterator = function(value) {                                                                 // 311
    return _.isFunction(value) ? value : function(obj){ return obj[value]; };                            // 312
  };                                                                                                     // 313
                                                                                                         // 314
  // Sort the object's values by a criterion produced by an iterator.                                    // 315
  _.sortBy = function(obj, value, context) {                                                             // 316
    var iterator = lookupIterator(value);                                                                // 317
    return _.pluck(_.map(obj, function(value, index, list) {                                             // 318
      return {                                                                                           // 319
        value: value,                                                                                    // 320
        index: index,                                                                                    // 321
        criteria: iterator.call(context, value, index, list)                                             // 322
      };                                                                                                 // 323
    }).sort(function(left, right) {                                                                      // 324
      var a = left.criteria;                                                                             // 325
      var b = right.criteria;                                                                            // 326
      if (a !== b) {                                                                                     // 327
        if (a > b || a === void 0) return 1;                                                             // 328
        if (a < b || b === void 0) return -1;                                                            // 329
      }                                                                                                  // 330
      return left.index - right.index;                                                                   // 331
    }), 'value');                                                                                        // 332
  };                                                                                                     // 333
                                                                                                         // 334
  // An internal function used for aggregate "group by" operations.                                      // 335
  var group = function(behavior) {                                                                       // 336
    return function(obj, value, context) {                                                               // 337
      var result = {};                                                                                   // 338
      var iterator = value == null ? _.identity : lookupIterator(value);                                 // 339
      each(obj, function(value, index) {                                                                 // 340
        var key = iterator.call(context, value, index, obj);                                             // 341
        behavior(result, key, value);                                                                    // 342
      });                                                                                                // 343
      return result;                                                                                     // 344
    };                                                                                                   // 345
  };                                                                                                     // 346
                                                                                                         // 347
  // Groups the object's values by a criterion. Pass either a string attribute                           // 348
  // to group by, or a function that returns the criterion.                                              // 349
  _.groupBy = group(function(result, key, value) {                                                       // 350
    (_.has(result, key) ? result[key] : (result[key] = [])).push(value);                                 // 351
  });                                                                                                    // 352
                                                                                                         // 353
  // Indexes the object's values by a criterion, similar to `groupBy`, but for                           // 354
  // when you know that your index values will be unique.                                                // 355
  _.indexBy = group(function(result, key, value) {                                                       // 356
    result[key] = value;                                                                                 // 357
  });                                                                                                    // 358
                                                                                                         // 359
  // Counts instances of an object that group by a certain criterion. Pass                               // 360
  // either a string attribute to count by, or a function that returns the                               // 361
  // criterion.                                                                                          // 362
  _.countBy = group(function(result, key) {                                                              // 363
    _.has(result, key) ? result[key]++ : result[key] = 1;                                                // 364
  });                                                                                                    // 365
                                                                                                         // 366
  // Use a comparator function to figure out the smallest index at which                                 // 367
  // an object should be inserted so as to maintain order. Uses binary search.                           // 368
  _.sortedIndex = function(array, obj, iterator, context) {                                              // 369
    iterator = iterator == null ? _.identity : lookupIterator(iterator);                                 // 370
    var value = iterator.call(context, obj);                                                             // 371
    var low = 0, high = array.length;                                                                    // 372
    while (low < high) {                                                                                 // 373
      var mid = (low + high) >>> 1;                                                                      // 374
      iterator.call(context, array[mid]) < value ? low = mid + 1 : high = mid;                           // 375
    }                                                                                                    // 376
    return low;                                                                                          // 377
  };                                                                                                     // 378
                                                                                                         // 379
  // Safely create a real, live array from anything iterable.                                            // 380
  _.toArray = function(obj) {                                                                            // 381
    if (!obj) return [];                                                                                 // 382
    if (_.isArray(obj)) return slice.call(obj);                                                          // 383
    if (obj.length === +obj.length) return _.map(obj, _.identity);                                       // 384
    return _.values(obj);                                                                                // 385
  };                                                                                                     // 386
                                                                                                         // 387
  // Return the number of elements in an object.                                                         // 388
  _.size = function(obj) {                                                                               // 389
    if (obj == null) return 0;                                                                           // 390
    return (obj.length === +obj.length) ? obj.length : _.keys(obj).length;                               // 391
  };                                                                                                     // 392
                                                                                                         // 393
  // Array Functions                                                                                     // 394
  // ---------------                                                                                     // 395
                                                                                                         // 396
  // Get the first element of an array. Passing **n** will return the first N                            // 397
  // values in the array. Aliased as `head` and `take`. The **guard** check                              // 398
  // allows it to work with `_.map`.                                                                     // 399
  _.first = _.head = _.take = function(array, n, guard) {                                                // 400
    if (array == null) return void 0;                                                                    // 401
    return (n == null) || guard ? array[0] : slice.call(array, 0, n);                                    // 402
  };                                                                                                     // 403
                                                                                                         // 404
  // Returns everything but the last entry of the array. Especially useful on                            // 405
  // the arguments object. Passing **n** will return all the values in                                   // 406
  // the array, excluding the last N. The **guard** check allows it to work with                         // 407
  // `_.map`.                                                                                            // 408
  _.initial = function(array, n, guard) {                                                                // 409
    return slice.call(array, 0, array.length - ((n == null) || guard ? 1 : n));                          // 410
  };                                                                                                     // 411
                                                                                                         // 412
  // Get the last element of an array. Passing **n** will return the last N                              // 413
  // values in the array. The **guard** check allows it to work with `_.map`.                            // 414
  _.last = function(array, n, guard) {                                                                   // 415
    if (array == null) return void 0;                                                                    // 416
    if ((n == null) || guard) {                                                                          // 417
      return array[array.length - 1];                                                                    // 418
    } else {                                                                                             // 419
      return slice.call(array, Math.max(array.length - n, 0));                                           // 420
    }                                                                                                    // 421
  };                                                                                                     // 422
                                                                                                         // 423
  // Returns everything but the first entry of the array. Aliased as `tail` and `drop`.                  // 424
  // Especially useful on the arguments object. Passing an **n** will return                             // 425
  // the rest N values in the array. The **guard**                                                       // 426
  // check allows it to work with `_.map`.                                                               // 427
  _.rest = _.tail = _.drop = function(array, n, guard) {                                                 // 428
    return slice.call(array, (n == null) || guard ? 1 : n);                                              // 429
  };                                                                                                     // 430
                                                                                                         // 431
  // Trim out all falsy values from an array.                                                            // 432
  _.compact = function(array) {                                                                          // 433
    return _.filter(array, _.identity);                                                                  // 434
  };                                                                                                     // 435
                                                                                                         // 436
  // Internal implementation of a recursive `flatten` function.                                          // 437
  var flatten = function(input, shallow, output) {                                                       // 438
    if (shallow && _.every(input, _.isArray)) {                                                          // 439
      return concat.apply(output, input);                                                                // 440
    }                                                                                                    // 441
    each(input, function(value) {                                                                        // 442
      if (_.isArray(value) || _.isArguments(value)) {                                                    // 443
        shallow ? push.apply(output, value) : flatten(value, shallow, output);                           // 444
      } else {                                                                                           // 445
        output.push(value);                                                                              // 446
      }                                                                                                  // 447
    });                                                                                                  // 448
    return output;                                                                                       // 449
  };                                                                                                     // 450
                                                                                                         // 451
  // Flatten out an array, either recursively (by default), or just one level.                           // 452
  _.flatten = function(array, shallow) {                                                                 // 453
    return flatten(array, shallow, []);                                                                  // 454
  };                                                                                                     // 455
                                                                                                         // 456
  // Return a version of the array that does not contain the specified value(s).                         // 457
  _.without = function(array) {                                                                          // 458
    return _.difference(array, slice.call(arguments, 1));                                                // 459
  };                                                                                                     // 460
                                                                                                         // 461
  // Produce a duplicate-free version of the array. If the array has already                             // 462
  // been sorted, you have the option of using a faster algorithm.                                       // 463
  // Aliased as `unique`.                                                                                // 464
  _.uniq = _.unique = function(array, isSorted, iterator, context) {                                     // 465
    if (_.isFunction(isSorted)) {                                                                        // 466
      context = iterator;                                                                                // 467
      iterator = isSorted;                                                                               // 468
      isSorted = false;                                                                                  // 469
    }                                                                                                    // 470
    var initial = iterator ? _.map(array, iterator, context) : array;                                    // 471
    var results = [];                                                                                    // 472
    var seen = [];                                                                                       // 473
    each(initial, function(value, index) {                                                               // 474
      if (isSorted ? (!index || seen[seen.length - 1] !== value) : !_.contains(seen, value)) {           // 475
        seen.push(value);                                                                                // 476
        results.push(array[index]);                                                                      // 477
      }                                                                                                  // 478
    });                                                                                                  // 479
    return results;                                                                                      // 480
  };                                                                                                     // 481
                                                                                                         // 482
  // Produce an array that contains the union: each distinct element from all of                         // 483
  // the passed-in arrays.                                                                               // 484
  _.union = function() {                                                                                 // 485
    return _.uniq(_.flatten(arguments, true));                                                           // 486
  };                                                                                                     // 487
                                                                                                         // 488
  // Produce an array that contains every item shared between all the                                    // 489
  // passed-in arrays.                                                                                   // 490
  _.intersection = function(array) {                                                                     // 491
    var rest = slice.call(arguments, 1);                                                                 // 492
    return _.filter(_.uniq(array), function(item) {                                                      // 493
      return _.every(rest, function(other) {                                                             // 494
        return _.indexOf(other, item) >= 0;                                                              // 495
      });                                                                                                // 496
    });                                                                                                  // 497
  };                                                                                                     // 498
                                                                                                         // 499
  // Take the difference between one array and a number of other arrays.                                 // 500
  // Only the elements present in just the first array will remain.                                      // 501
  _.difference = function(array) {                                                                       // 502
    var rest = concat.apply(ArrayProto, slice.call(arguments, 1));                                       // 503
    return _.filter(array, function(value){ return !_.contains(rest, value); });                         // 504
  };                                                                                                     // 505
                                                                                                         // 506
  // Zip together multiple lists into a single array -- elements that share                              // 507
  // an index go together.                                                                               // 508
  _.zip = function() {                                                                                   // 509
    var length = _.max(_.pluck(arguments, "length").concat(0));                                          // 510
    var results = new Array(length);                                                                     // 511
    for (var i = 0; i < length; i++) {                                                                   // 512
      results[i] = _.pluck(arguments, '' + i);                                                           // 513
    }                                                                                                    // 514
    return results;                                                                                      // 515
  };                                                                                                     // 516
                                                                                                         // 517
  // Converts lists into objects. Pass either a single array of `[key, value]`                           // 518
  // pairs, or two parallel arrays of the same length -- one of keys, and one of                         // 519
  // the corresponding values.                                                                           // 520
  _.object = function(list, values) {                                                                    // 521
    if (list == null) return {};                                                                         // 522
    var result = {};                                                                                     // 523
    for (var i = 0, length = list.length; i < length; i++) {                                             // 524
      if (values) {                                                                                      // 525
        result[list[i]] = values[i];                                                                     // 526
      } else {                                                                                           // 527
        result[list[i][0]] = list[i][1];                                                                 // 528
      }                                                                                                  // 529
    }                                                                                                    // 530
    return result;                                                                                       // 531
  };                                                                                                     // 532
                                                                                                         // 533
  // If the browser doesn't supply us with indexOf (I'm looking at you, **MSIE**),                       // 534
  // we need this function. Return the position of the first occurrence of an                            // 535
  // item in an array, or -1 if the item is not included in the array.                                   // 536
  // Delegates to **ECMAScript 5**'s native `indexOf` if available.                                      // 537
  // If the array is large and already in sort order, pass `true`                                        // 538
  // for **isSorted** to use binary search.                                                              // 539
  _.indexOf = function(array, item, isSorted) {                                                          // 540
    if (array == null) return -1;                                                                        // 541
    var i = 0, length = array.length;                                                                    // 542
    if (isSorted) {                                                                                      // 543
      if (typeof isSorted == 'number') {                                                                 // 544
        i = (isSorted < 0 ? Math.max(0, length + isSorted) : isSorted);                                  // 545
      } else {                                                                                           // 546
        i = _.sortedIndex(array, item);                                                                  // 547
        return array[i] === item ? i : -1;                                                               // 548
      }                                                                                                  // 549
    }                                                                                                    // 550
    if (nativeIndexOf && array.indexOf === nativeIndexOf) return array.indexOf(item, isSorted);          // 551
    for (; i < length; i++) if (array[i] === item) return i;                                             // 552
    return -1;                                                                                           // 553
  };                                                                                                     // 554
                                                                                                         // 555
  // Delegates to **ECMAScript 5**'s native `lastIndexOf` if available.                                  // 556
  _.lastIndexOf = function(array, item, from) {                                                          // 557
    if (array == null) return -1;                                                                        // 558
    var hasIndex = from != null;                                                                         // 559
    if (nativeLastIndexOf && array.lastIndexOf === nativeLastIndexOf) {                                  // 560
      return hasIndex ? array.lastIndexOf(item, from) : array.lastIndexOf(item);                         // 561
    }                                                                                                    // 562
    var i = (hasIndex ? from : array.length);                                                            // 563
    while (i--) if (array[i] === item) return i;                                                         // 564
    return -1;                                                                                           // 565
  };                                                                                                     // 566
                                                                                                         // 567
  // Generate an integer Array containing an arithmetic progression. A port of                           // 568
  // the native Python `range()` function. See                                                           // 569
  // [the Python documentation](http://docs.python.org/library/functions.html#range).                    // 570
  _.range = function(start, stop, step) {                                                                // 571
    if (arguments.length <= 1) {                                                                         // 572
      stop = start || 0;                                                                                 // 573
      start = 0;                                                                                         // 574
    }                                                                                                    // 575
    step = arguments[2] || 1;                                                                            // 576
                                                                                                         // 577
    var length = Math.max(Math.ceil((stop - start) / step), 0);                                          // 578
    var idx = 0;                                                                                         // 579
    var range = new Array(length);                                                                       // 580
                                                                                                         // 581
    while(idx < length) {                                                                                // 582
      range[idx++] = start;                                                                              // 583
      start += step;                                                                                     // 584
    }                                                                                                    // 585
                                                                                                         // 586
    return range;                                                                                        // 587
  };                                                                                                     // 588
                                                                                                         // 589
  // Function (ahem) Functions                                                                           // 590
  // ------------------                                                                                  // 591
                                                                                                         // 592
  // Reusable constructor function for prototype setting.                                                // 593
  var ctor = function(){};                                                                               // 594
                                                                                                         // 595
  // Create a function bound to a given object (assigning `this`, and arguments,                         // 596
  // optionally). Delegates to **ECMAScript 5**'s native `Function.bind` if                              // 597
  // available.                                                                                          // 598
  _.bind = function(func, context) {                                                                     // 599
    var args, bound;                                                                                     // 600
    if (nativeBind && func.bind === nativeBind) return nativeBind.apply(func, slice.call(arguments, 1)); // 601
    if (!_.isFunction(func)) throw new TypeError;                                                        // 602
    args = slice.call(arguments, 2);                                                                     // 603
    return bound = function() {                                                                          // 604
      if (!(this instanceof bound)) return func.apply(context, args.concat(slice.call(arguments)));      // 605
      ctor.prototype = func.prototype;                                                                   // 606
      var self = new ctor;                                                                               // 607
      ctor.prototype = null;                                                                             // 608
      var result = func.apply(self, args.concat(slice.call(arguments)));                                 // 609
      if (Object(result) === result) return result;                                                      // 610
      return self;                                                                                       // 611
    };                                                                                                   // 612
  };                                                                                                     // 613
                                                                                                         // 614
  // Partially apply a function by creating a version that has had some of its                           // 615
  // arguments pre-filled, without changing its dynamic `this` context.                                  // 616
  _.partial = function(func) {                                                                           // 617
    var args = slice.call(arguments, 1);                                                                 // 618
    return function() {                                                                                  // 619
      return func.apply(this, args.concat(slice.call(arguments)));                                       // 620
    };                                                                                                   // 621
  };                                                                                                     // 622
                                                                                                         // 623
  // Bind all of an object's methods to that object. Useful for ensuring that                            // 624
  // all callbacks defined on an object belong to it.                                                    // 625
  _.bindAll = function(obj) {                                                                            // 626
    var funcs = slice.call(arguments, 1);                                                                // 627
    if (funcs.length === 0) throw new Error("bindAll must be passed function names");                    // 628
    each(funcs, function(f) { obj[f] = _.bind(obj[f], obj); });                                          // 629
    return obj;                                                                                          // 630
  };                                                                                                     // 631
                                                                                                         // 632
  // Memoize an expensive function by storing its results.                                               // 633
  _.memoize = function(func, hasher) {                                                                   // 634
    var memo = {};                                                                                       // 635
    hasher || (hasher = _.identity);                                                                     // 636
    return function() {                                                                                  // 637
      var key = hasher.apply(this, arguments);                                                           // 638
      return _.has(memo, key) ? memo[key] : (memo[key] = func.apply(this, arguments));                   // 639
    };                                                                                                   // 640
  };                                                                                                     // 641
                                                                                                         // 642
  // Delays a function for the given number of milliseconds, and then calls                              // 643
  // it with the arguments supplied.                                                                     // 644
  _.delay = function(func, wait) {                                                                       // 645
    var args = slice.call(arguments, 2);                                                                 // 646
    return setTimeout(function(){ return func.apply(null, args); }, wait);                               // 647
  };                                                                                                     // 648
                                                                                                         // 649
  // Defers a function, scheduling it to run after the current call stack has                            // 650
  // cleared.                                                                                            // 651
  _.defer = function(func) {                                                                             // 652
    return _.delay.apply(_, [func, 1].concat(slice.call(arguments, 1)));                                 // 653
  };                                                                                                     // 654
                                                                                                         // 655
  // Returns a function, that, when invoked, will only be triggered at most once                         // 656
  // during a given window of time. Normally, the throttled function will run                            // 657
  // as much as it can, without ever going more than once per `wait` duration;                           // 658
  // but if you'd like to disable the execution on the leading edge, pass                                // 659
  // `{leading: false}`. To disable execution on the trailing edge, ditto.                               // 660
  _.throttle = function(func, wait, options) {                                                           // 661
    var context, args, result;                                                                           // 662
    var timeout = null;                                                                                  // 663
    var previous = 0;                                                                                    // 664
    options || (options = {});                                                                           // 665
    var later = function() {                                                                             // 666
      previous = options.leading === false ? 0 : new Date;                                               // 667
      timeout = null;                                                                                    // 668
      result = func.apply(context, args);                                                                // 669
    };                                                                                                   // 670
    return function() {                                                                                  // 671
      var now = new Date;                                                                                // 672
      if (!previous && options.leading === false) previous = now;                                        // 673
      var remaining = wait - (now - previous);                                                           // 674
      context = this;                                                                                    // 675
      args = arguments;                                                                                  // 676
      if (remaining <= 0) {                                                                              // 677
        clearTimeout(timeout);                                                                           // 678
        timeout = null;                                                                                  // 679
        previous = now;                                                                                  // 680
        result = func.apply(context, args);                                                              // 681
      } else if (!timeout && options.trailing !== false) {                                               // 682
        timeout = setTimeout(later, remaining);                                                          // 683
      }                                                                                                  // 684
      return result;                                                                                     // 685
    };                                                                                                   // 686
  };                                                                                                     // 687
                                                                                                         // 688
  // Returns a function, that, as long as it continues to be invoked, will not                           // 689
  // be triggered. The function will be called after it stops being called for                           // 690
  // N milliseconds. If `immediate` is passed, trigger the function on the                               // 691
  // leading edge, instead of the trailing.                                                              // 692
  _.debounce = function(func, wait, immediate) {                                                         // 693
    var timeout, args, context, timestamp, result;                                                       // 694
    return function() {                                                                                  // 695
      context = this;                                                                                    // 696
      args = arguments;                                                                                  // 697
      timestamp = new Date();                                                                            // 698
      var later = function() {                                                                           // 699
        var last = (new Date()) - timestamp;                                                             // 700
        if (last < wait) {                                                                               // 701
          timeout = setTimeout(later, wait - last);                                                      // 702
        } else {                                                                                         // 703
          timeout = null;                                                                                // 704
          if (!immediate) result = func.apply(context, args);                                            // 705
        }                                                                                                // 706
      };                                                                                                 // 707
      var callNow = immediate && !timeout;                                                               // 708
      if (!timeout) {                                                                                    // 709
        timeout = setTimeout(later, wait);                                                               // 710
      }                                                                                                  // 711
      if (callNow) result = func.apply(context, args);                                                   // 712
      return result;                                                                                     // 713
    };                                                                                                   // 714
  };                                                                                                     // 715
                                                                                                         // 716
  // Returns a function that will be executed at most one time, no matter how                            // 717
  // often you call it. Useful for lazy initialization.                                                  // 718
  _.once = function(func) {                                                                              // 719
    var ran = false, memo;                                                                               // 720
    return function() {                                                                                  // 721
      if (ran) return memo;                                                                              // 722
      ran = true;                                                                                        // 723
      memo = func.apply(this, arguments);                                                                // 724
      func = null;                                                                                       // 725
      return memo;                                                                                       // 726
    };                                                                                                   // 727
  };                                                                                                     // 728
                                                                                                         // 729
  // Returns the first function passed as an argument to the second,                                     // 730
  // allowing you to adjust arguments, run code before and after, and                                    // 731
  // conditionally execute the original function.                                                        // 732
  _.wrap = function(func, wrapper) {                                                                     // 733
    return function() {                                                                                  // 734
      var args = [func];                                                                                 // 735
      push.apply(args, arguments);                                                                       // 736
      return wrapper.apply(this, args);                                                                  // 737
    };                                                                                                   // 738
  };                                                                                                     // 739
                                                                                                         // 740
  // Returns a function that is the composition of a list of functions, each                             // 741
  // consuming the return value of the function that follows.                                            // 742
  _.compose = function() {                                                                               // 743
    var funcs = arguments;                                                                               // 744
    return function() {                                                                                  // 745
      var args = arguments;                                                                              // 746
      for (var i = funcs.length - 1; i >= 0; i--) {                                                      // 747
        args = [funcs[i].apply(this, args)];                                                             // 748
      }                                                                                                  // 749
      return args[0];                                                                                    // 750
    };                                                                                                   // 751
  };                                                                                                     // 752
                                                                                                         // 753
  // Returns a function that will only be executed after being called N times.                           // 754
  _.after = function(times, func) {                                                                      // 755
    return function() {                                                                                  // 756
      if (--times < 1) {                                                                                 // 757
        return func.apply(this, arguments);                                                              // 758
      }                                                                                                  // 759
    };                                                                                                   // 760
  };                                                                                                     // 761
                                                                                                         // 762
  // Object Functions                                                                                    // 763
  // ----------------                                                                                    // 764
                                                                                                         // 765
  // Retrieve the names of an object's properties.                                                       // 766
  // Delegates to **ECMAScript 5**'s native `Object.keys`                                                // 767
  _.keys = nativeKeys || function(obj) {                                                                 // 768
    if (obj !== Object(obj)) throw new TypeError('Invalid object');                                      // 769
    var keys = [];                                                                                       // 770
    for (var key in obj) if (_.has(obj, key)) keys.push(key);                                            // 771
    return keys;                                                                                         // 772
  };                                                                                                     // 773
                                                                                                         // 774
  // Retrieve the values of an object's properties.                                                      // 775
  _.values = function(obj) {                                                                             // 776
    var keys = _.keys(obj);                                                                              // 777
    var length = keys.length;                                                                            // 778
    var values = new Array(length);                                                                      // 779
    for (var i = 0; i < length; i++) {                                                                   // 780
      values[i] = obj[keys[i]];                                                                          // 781
    }                                                                                                    // 782
    return values;                                                                                       // 783
  };                                                                                                     // 784
                                                                                                         // 785
  // Convert an object into a list of `[key, value]` pairs.                                              // 786
  _.pairs = function(obj) {                                                                              // 787
    var keys = _.keys(obj);                                                                              // 788
    var length = keys.length;                                                                            // 789
    var pairs = new Array(length);                                                                       // 790
    for (var i = 0; i < length; i++) {                                                                   // 791
      pairs[i] = [keys[i], obj[keys[i]]];                                                                // 792
    }                                                                                                    // 793
    return pairs;                                                                                        // 794
  };                                                                                                     // 795
                                                                                                         // 796
  // Invert the keys and values of an object. The values must be serializable.                           // 797
  _.invert = function(obj) {                                                                             // 798
    var result = {};                                                                                     // 799
    var keys = _.keys(obj);                                                                              // 800
    for (var i = 0, length = keys.length; i < length; i++) {                                             // 801
      result[obj[keys[i]]] = keys[i];                                                                    // 802
    }                                                                                                    // 803
    return result;                                                                                       // 804
  };                                                                                                     // 805
                                                                                                         // 806
  // Return a sorted list of the function names available on the object.                                 // 807
  // Aliased as `methods`                                                                                // 808
  _.functions = _.methods = function(obj) {                                                              // 809
    var names = [];                                                                                      // 810
    for (var key in obj) {                                                                               // 811
      if (_.isFunction(obj[key])) names.push(key);                                                       // 812
    }                                                                                                    // 813
    return names.sort();                                                                                 // 814
  };                                                                                                     // 815
                                                                                                         // 816
  // Extend a given object with all the properties in passed-in object(s).                               // 817
  _.extend = function(obj) {                                                                             // 818
    each(slice.call(arguments, 1), function(source) {                                                    // 819
      if (source) {                                                                                      // 820
        for (var prop in source) {                                                                       // 821
          obj[prop] = source[prop];                                                                      // 822
        }                                                                                                // 823
      }                                                                                                  // 824
    });                                                                                                  // 825
    return obj;                                                                                          // 826
  };                                                                                                     // 827
                                                                                                         // 828
  // Return a copy of the object only containing the whitelisted properties.                             // 829
  _.pick = function(obj) {                                                                               // 830
    var copy = {};                                                                                       // 831
    var keys = concat.apply(ArrayProto, slice.call(arguments, 1));                                       // 832
    each(keys, function(key) {                                                                           // 833
      if (key in obj) copy[key] = obj[key];                                                              // 834
    });                                                                                                  // 835
    return copy;                                                                                         // 836
  };                                                                                                     // 837
                                                                                                         // 838
   // Return a copy of the object without the blacklisted properties.                                    // 839
  _.omit = function(obj) {                                                                               // 840
    var copy = {};                                                                                       // 841
    var keys = concat.apply(ArrayProto, slice.call(arguments, 1));                                       // 842
    for (var key in obj) {                                                                               // 843
      if (!_.contains(keys, key)) copy[key] = obj[key];                                                  // 844
    }                                                                                                    // 845
    return copy;                                                                                         // 846
  };                                                                                                     // 847
                                                                                                         // 848
  // Fill in a given object with default properties.                                                     // 849
  _.defaults = function(obj) {                                                                           // 850
    each(slice.call(arguments, 1), function(source) {                                                    // 851
      if (source) {                                                                                      // 852
        for (var prop in source) {                                                                       // 853
          if (obj[prop] === void 0) obj[prop] = source[prop];                                            // 854
        }                                                                                                // 855
      }                                                                                                  // 856
    });                                                                                                  // 857
    return obj;                                                                                          // 858
  };                                                                                                     // 859
                                                                                                         // 860
  // Create a (shallow-cloned) duplicate of an object.                                                   // 861
  _.clone = function(obj) {                                                                              // 862
    if (!_.isObject(obj)) return obj;                                                                    // 863
    return _.isArray(obj) ? obj.slice() : _.extend({}, obj);                                             // 864
  };                                                                                                     // 865
                                                                                                         // 866
  // Invokes interceptor with the obj, and then returns obj.                                             // 867
  // The primary purpose of this method is to "tap into" a method chain, in                              // 868
  // order to perform operations on intermediate results within the chain.                               // 869
  _.tap = function(obj, interceptor) {                                                                   // 870
    interceptor(obj);                                                                                    // 871
    return obj;                                                                                          // 872
  };                                                                                                     // 873
                                                                                                         // 874
  // Internal recursive comparison function for `isEqual`.                                               // 875
  var eq = function(a, b, aStack, bStack) {                                                              // 876
    // Identical objects are equal. `0 === -0`, but they aren't identical.                               // 877
    // See the [Harmony `egal` proposal](http://wiki.ecmascript.org/doku.php?id=harmony:egal).           // 878
    if (a === b) return a !== 0 || 1 / a == 1 / b;                                                       // 879
    // A strict comparison is necessary because `null == undefined`.                                     // 880
    if (a == null || b == null) return a === b;                                                          // 881
    // Unwrap any wrapped objects.                                                                       // 882
    if (a instanceof _) a = a._wrapped;                                                                  // 883
    if (b instanceof _) b = b._wrapped;                                                                  // 884
    // Compare `[[Class]]` names.                                                                        // 885
    var className = toString.call(a);                                                                    // 886
    if (className != toString.call(b)) return false;                                                     // 887
    switch (className) {                                                                                 // 888
      // Strings, numbers, dates, and booleans are compared by value.                                    // 889
      case '[object String]':                                                                            // 890
        // Primitives and their corresponding object wrappers are equivalent; thus, `"5"` is             // 891
        // equivalent to `new String("5")`.                                                              // 892
        return a == String(b);                                                                           // 893
      case '[object Number]':                                                                            // 894
        // `NaN`s are equivalent, but non-reflexive. An `egal` comparison is performed for               // 895
        // other numeric values.                                                                         // 896
        return a != +a ? b != +b : (a == 0 ? 1 / a == 1 / b : a == +b);                                  // 897
      case '[object Date]':                                                                              // 898
      case '[object Boolean]':                                                                           // 899
        // Coerce dates and booleans to numeric primitive values. Dates are compared by their            // 900
        // millisecond representations. Note that invalid dates with millisecond representations         // 901
        // of `NaN` are not equivalent.                                                                  // 902
        return +a == +b;                                                                                 // 903
      // RegExps are compared by their source patterns and flags.                                        // 904
      case '[object RegExp]':                                                                            // 905
        return a.source == b.source &&                                                                   // 906
               a.global == b.global &&                                                                   // 907
               a.multiline == b.multiline &&                                                             // 908
               a.ignoreCase == b.ignoreCase;                                                             // 909
    }                                                                                                    // 910
    if (typeof a != 'object' || typeof b != 'object') return false;                                      // 911
    // Assume equality for cyclic structures. The algorithm for detecting cyclic                         // 912
    // structures is adapted from ES 5.1 section 15.12.3, abstract operation `JO`.                       // 913
    var length = aStack.length;                                                                          // 914
    while (length--) {                                                                                   // 915
      // Linear search. Performance is inversely proportional to the number of                           // 916
      // unique nested structures.                                                                       // 917
      if (aStack[length] == a) return bStack[length] == b;                                               // 918
    }                                                                                                    // 919
    // Objects with different constructors are not equivalent, but `Object`s                             // 920
    // from different frames are.                                                                        // 921
    var aCtor = a.constructor, bCtor = b.constructor;                                                    // 922
    if (aCtor !== bCtor && !(_.isFunction(aCtor) && (aCtor instanceof aCtor) &&                          // 923
                             _.isFunction(bCtor) && (bCtor instanceof bCtor))) {                         // 924
      return false;                                                                                      // 925
    }                                                                                                    // 926
    // Add the first object to the stack of traversed objects.                                           // 927
    aStack.push(a);                                                                                      // 928
    bStack.push(b);                                                                                      // 929
    var size = 0, result = true;                                                                         // 930
    // Recursively compare objects and arrays.                                                           // 931
    if (className == '[object Array]') {                                                                 // 932
      // Compare array lengths to determine if a deep comparison is necessary.                           // 933
      size = a.length;                                                                                   // 934
      result = size == b.length;                                                                         // 935
      if (result) {                                                                                      // 936
        // Deep compare the contents, ignoring non-numeric properties.                                   // 937
        while (size--) {                                                                                 // 938
          if (!(result = eq(a[size], b[size], aStack, bStack))) break;                                   // 939
        }                                                                                                // 940
      }                                                                                                  // 941
    } else {                                                                                             // 942
      // Deep compare objects.                                                                           // 943
      for (var key in a) {                                                                               // 944
        if (_.has(a, key)) {                                                                             // 945
          // Count the expected number of properties.                                                    // 946
          size++;                                                                                        // 947
          // Deep compare each member.                                                                   // 948
          if (!(result = _.has(b, key) && eq(a[key], b[key], aStack, bStack))) break;                    // 949
        }                                                                                                // 950
      }                                                                                                  // 951
      // Ensure that both objects contain the same number of properties.                                 // 952
      if (result) {                                                                                      // 953
        for (key in b) {                                                                                 // 954
          if (_.has(b, key) && !(size--)) break;                                                         // 955
        }                                                                                                // 956
        result = !size;                                                                                  // 957
      }                                                                                                  // 958
    }                                                                                                    // 959
    // Remove the first object from the stack of traversed objects.                                      // 960
    aStack.pop();                                                                                        // 961
    bStack.pop();                                                                                        // 962
    return result;                                                                                       // 963
  };                                                                                                     // 964
                                                                                                         // 965
  // Perform a deep comparison to check if two objects are equal.                                        // 966
  _.isEqual = function(a, b) {                                                                           // 967
    return eq(a, b, [], []);                                                                             // 968
  };                                                                                                     // 969
                                                                                                         // 970
  // Is a given array, string, or object empty?                                                          // 971
  // An "empty" object has no enumerable own-properties.                                                 // 972
  _.isEmpty = function(obj) {                                                                            // 973
    if (obj == null) return true;                                                                        // 974
    if (_.isArray(obj) || _.isString(obj)) return obj.length === 0;                                      // 975
    for (var key in obj) if (_.has(obj, key)) return false;                                              // 976
    return true;                                                                                         // 977
  };                                                                                                     // 978
                                                                                                         // 979
  // Is a given value a DOM element?                                                                     // 980
  _.isElement = function(obj) {                                                                          // 981
    return !!(obj && obj.nodeType === 1);                                                                // 982
  };                                                                                                     // 983
                                                                                                         // 984
  // Is a given value an array?                                                                          // 985
  // Delegates to ECMA5's native Array.isArray                                                           // 986
  _.isArray = nativeIsArray || function(obj) {                                                           // 987
    return toString.call(obj) == '[object Array]';                                                       // 988
  };                                                                                                     // 989
                                                                                                         // 990
  // Is a given variable an object?                                                                      // 991
  _.isObject = function(obj) {                                                                           // 992
    return obj === Object(obj);                                                                          // 993
  };                                                                                                     // 994
                                                                                                         // 995
  // Add some isType methods: isArguments, isFunction, isString, isNumber, isDate, isRegExp.             // 996
  each(['Arguments', 'Function', 'String', 'Number', 'Date', 'RegExp'], function(name) {                 // 997
    _['is' + name] = function(obj) {                                                                     // 998
      return toString.call(obj) == '[object ' + name + ']';                                              // 999
    };                                                                                                   // 1000
  });                                                                                                    // 1001
                                                                                                         // 1002
  // Define a fallback version of the method in browsers (ahem, IE), where                               // 1003
  // there isn't any inspectable "Arguments" type.                                                       // 1004
  if (!_.isArguments(arguments)) {                                                                       // 1005
    _.isArguments = function(obj) {                                                                      // 1006
      return !!(obj && _.has(obj, 'callee'));                                                            // 1007
    };                                                                                                   // 1008
  }                                                                                                      // 1009
                                                                                                         // 1010
  // Optimize `isFunction` if appropriate.                                                               // 1011
  if (typeof (/./) !== 'function') {                                                                     // 1012
    _.isFunction = function(obj) {                                                                       // 1013
      return typeof obj === 'function';                                                                  // 1014
    };                                                                                                   // 1015
  }                                                                                                      // 1016
                                                                                                         // 1017
  // Is a given object a finite number?                                                                  // 1018
  _.isFinite = function(obj) {                                                                           // 1019
    return isFinite(obj) && !isNaN(parseFloat(obj));                                                     // 1020
  };                                                                                                     // 1021
                                                                                                         // 1022
  // Is the given value `NaN`? (NaN is the only number which does not equal itself).                     // 1023
  _.isNaN = function(obj) {                                                                              // 1024
    return _.isNumber(obj) && obj != +obj;                                                               // 1025
  };                                                                                                     // 1026
                                                                                                         // 1027
  // Is a given value a boolean?                                                                         // 1028
  _.isBoolean = function(obj) {                                                                          // 1029
    return obj === true || obj === false || toString.call(obj) == '[object Boolean]';                    // 1030
  };                                                                                                     // 1031
                                                                                                         // 1032
  // Is a given value equal to null?                                                                     // 1033
  _.isNull = function(obj) {                                                                             // 1034
    return obj === null;                                                                                 // 1035
  };                                                                                                     // 1036
                                                                                                         // 1037
  // Is a given variable undefined?                                                                      // 1038
  _.isUndefined = function(obj) {                                                                        // 1039
    return obj === void 0;                                                                               // 1040
  };                                                                                                     // 1041
                                                                                                         // 1042
  // Shortcut function for checking if an object has a given property directly                           // 1043
  // on itself (in other words, not on a prototype).                                                     // 1044
  _.has = function(obj, key) {                                                                           // 1045
    return hasOwnProperty.call(obj, key);                                                                // 1046
  };                                                                                                     // 1047
                                                                                                         // 1048
  // Utility Functions                                                                                   // 1049
  // -----------------                                                                                   // 1050
                                                                                                         // 1051
  // Run Underscore.js in *noConflict* mode, returning the `_` variable to its                           // 1052
  // previous owner. Returns a reference to the Underscore object.                                       // 1053
  _.noConflict = function() {                                                                            // 1054
    root._ = previousUnderscore;                                                                         // 1055
    return this;                                                                                         // 1056
  };                                                                                                     // 1057
                                                                                                         // 1058
  // Keep the identity function around for default iterators.                                            // 1059
  _.identity = function(value) {                                                                         // 1060
    return value;                                                                                        // 1061
  };                                                                                                     // 1062
                                                                                                         // 1063
  // Run a function **n** times.                                                                         // 1064
  _.times = function(n, iterator, context) {                                                             // 1065
    var accum = Array(Math.max(0, n));                                                                   // 1066
    for (var i = 0; i < n; i++) accum[i] = iterator.call(context, i);                                    // 1067
    return accum;                                                                                        // 1068
  };                                                                                                     // 1069
                                                                                                         // 1070
  // Return a random integer between min and max (inclusive).                                            // 1071
  _.random = function(min, max) {                                                                        // 1072
    if (max == null) {                                                                                   // 1073
      max = min;                                                                                         // 1074
      min = 0;                                                                                           // 1075
    }                                                                                                    // 1076
    return min + Math.floor(Math.random() * (max - min + 1));                                            // 1077
  };                                                                                                     // 1078
                                                                                                         // 1079
  // List of HTML entities for escaping.                                                                 // 1080
  var entityMap = {                                                                                      // 1081
    escape: {                                                                                            // 1082
      '&': '&amp;',                                                                                      // 1083
      '<': '&lt;',                                                                                       // 1084
      '>': '&gt;',                                                                                       // 1085
      '"': '&quot;',                                                                                     // 1086
      "'": '&#x27;'                                                                                      // 1087
    }                                                                                                    // 1088
  };                                                                                                     // 1089
  entityMap.unescape = _.invert(entityMap.escape);                                                       // 1090
                                                                                                         // 1091
  // Regexes containing the keys and values listed immediately above.                                    // 1092
  var entityRegexes = {                                                                                  // 1093
    escape:   new RegExp('[' + _.keys(entityMap.escape).join('') + ']', 'g'),                            // 1094
    unescape: new RegExp('(' + _.keys(entityMap.unescape).join('|') + ')', 'g')                          // 1095
  };                                                                                                     // 1096
                                                                                                         // 1097
  // Functions for escaping and unescaping strings to/from HTML interpolation.                           // 1098
  _.each(['escape', 'unescape'], function(method) {                                                      // 1099
    _[method] = function(string) {                                                                       // 1100
      if (string == null) return '';                                                                     // 1101
      return ('' + string).replace(entityRegexes[method], function(match) {                              // 1102
        return entityMap[method][match];                                                                 // 1103
      });                                                                                                // 1104
    };                                                                                                   // 1105
  });                                                                                                    // 1106
                                                                                                         // 1107
  // If the value of the named `property` is a function then invoke it with the                          // 1108
  // `object` as context; otherwise, return it.                                                          // 1109
  _.result = function(object, property) {                                                                // 1110
    if (object == null) return void 0;                                                                   // 1111
    var value = object[property];                                                                        // 1112
    return _.isFunction(value) ? value.call(object) : value;                                             // 1113
  };                                                                                                     // 1114
                                                                                                         // 1115
  // Add your own custom functions to the Underscore object.                                             // 1116
  _.mixin = function(obj) {                                                                              // 1117
    each(_.functions(obj), function(name) {                                                              // 1118
      var func = _[name] = obj[name];                                                                    // 1119
      _.prototype[name] = function() {                                                                   // 1120
        var args = [this._wrapped];                                                                      // 1121
        push.apply(args, arguments);                                                                     // 1122
        return result.call(this, func.apply(_, args));                                                   // 1123
      };                                                                                                 // 1124
    });                                                                                                  // 1125
  };                                                                                                     // 1126
                                                                                                         // 1127
  // Generate a unique integer id (unique within the entire client session).                             // 1128
  // Useful for temporary DOM ids.                                                                       // 1129
  var idCounter = 0;                                                                                     // 1130
  _.uniqueId = function(prefix) {                                                                        // 1131
    var id = ++idCounter + '';                                                                           // 1132
    return prefix ? prefix + id : id;                                                                    // 1133
  };                                                                                                     // 1134
                                                                                                         // 1135
  // By default, Underscore uses ERB-style template delimiters, change the                               // 1136
  // following template settings to use alternative delimiters.                                          // 1137
  _.templateSettings = {                                                                                 // 1138
    evaluate    : /<%([\s\S]+?)%>/g,                                                                     // 1139
    interpolate : /<%=([\s\S]+?)%>/g,                                                                    // 1140
    escape      : /<%-([\s\S]+?)%>/g                                                                     // 1141
  };                                                                                                     // 1142
                                                                                                         // 1143
  // When customizing `templateSettings`, if you don't want to define an                                 // 1144
  // interpolation, evaluation or escaping regex, we need one that is                                    // 1145
  // guaranteed not to match.                                                                            // 1146
  var noMatch = /(.)^/;                                                                                  // 1147
                                                                                                         // 1148
  // Certain characters need to be escaped so that they can be put into a                                // 1149
  // string literal.                                                                                     // 1150
  var escapes = {                                                                                        // 1151
    "'":      "'",                                                                                       // 1152
    '\\':     '\\',                                                                                      // 1153
    '\r':     'r',                                                                                       // 1154
    '\n':     'n',                                                                                       // 1155
    '\t':     't',                                                                                       // 1156
    '\u2028': 'u2028',                                                                                   // 1157
    '\u2029': 'u2029'                                                                                    // 1158
  };                                                                                                     // 1159
                                                                                                         // 1160
  var escaper = /\\|'|\r|\n|\t|\u2028|\u2029/g;                                                          // 1161
                                                                                                         // 1162
  // JavaScript micro-templating, similar to John Resig's implementation.                                // 1163
  // Underscore templating handles arbitrary delimiters, preserves whitespace,                           // 1164
  // and correctly escapes quotes within interpolated code.                                              // 1165
  _.template = function(text, data, settings) {                                                          // 1166
    var render;                                                                                          // 1167
    settings = _.defaults({}, settings, _.templateSettings);                                             // 1168
                                                                                                         // 1169
    // Combine delimiters into one regular expression via alternation.                                   // 1170
    var matcher = new RegExp([                                                                           // 1171
      (settings.escape || noMatch).source,                                                               // 1172
      (settings.interpolate || noMatch).source,                                                          // 1173
      (settings.evaluate || noMatch).source                                                              // 1174
    ].join('|') + '|$', 'g');                                                                            // 1175
                                                                                                         // 1176
    // Compile the template source, escaping string literals appropriately.                              // 1177
    var index = 0;                                                                                       // 1178
    var source = "__p+='";                                                                               // 1179
    text.replace(matcher, function(match, escape, interpolate, evaluate, offset) {                       // 1180
      source += text.slice(index, offset)                                                                // 1181
        .replace(escaper, function(match) { return '\\' + escapes[match]; });                            // 1182
                                                                                                         // 1183
      if (escape) {                                                                                      // 1184
        source += "'+\n((__t=(" + escape + "))==null?'':_.escape(__t))+\n'";                             // 1185
      }                                                                                                  // 1186
      if (interpolate) {                                                                                 // 1187
        source += "'+\n((__t=(" + interpolate + "))==null?'':__t)+\n'";                                  // 1188
      }                                                                                                  // 1189
      if (evaluate) {                                                                                    // 1190
        source += "';\n" + evaluate + "\n__p+='";                                                        // 1191
      }                                                                                                  // 1192
      index = offset + match.length;                                                                     // 1193
      return match;                                                                                      // 1194
    });                                                                                                  // 1195
    source += "';\n";                                                                                    // 1196
                                                                                                         // 1197
    // If a variable is not specified, place data values in local scope.                                 // 1198
    if (!settings.variable) source = 'with(obj||{}){\n' + source + '}\n';                                // 1199
                                                                                                         // 1200
    source = "var __t,__p='',__j=Array.prototype.join," +                                                // 1201
      "print=function(){__p+=__j.call(arguments,'');};\n" +                                              // 1202
      source + "return __p;\n";                                                                          // 1203
                                                                                                         // 1204
    try {                                                                                                // 1205
      render = new Function(settings.variable || 'obj', '_', source);                                    // 1206
    } catch (e) {                                                                                        // 1207
      e.source = source;                                                                                 // 1208
      throw e;                                                                                           // 1209
    }                                                                                                    // 1210
                                                                                                         // 1211
    if (data) return render(data, _);                                                                    // 1212
    var template = function(data) {                                                                      // 1213
      return render.call(this, data, _);                                                                 // 1214
    };                                                                                                   // 1215
                                                                                                         // 1216
    // Provide the compiled function source as a convenience for precompilation.                         // 1217
    template.source = 'function(' + (settings.variable || 'obj') + '){\n' + source + '}';                // 1218
                                                                                                         // 1219
    return template;                                                                                     // 1220
  };                                                                                                     // 1221
                                                                                                         // 1222
  // Add a "chain" function, which will delegate to the wrapper.                                         // 1223
  _.chain = function(obj) {                                                                              // 1224
    return _(obj).chain();                                                                               // 1225
  };                                                                                                     // 1226
                                                                                                         // 1227
  // OOP                                                                                                 // 1228
  // ---------------                                                                                     // 1229
  // If Underscore is called as a function, it returns a wrapped object that                             // 1230
  // can be used OO-style. This wrapper holds altered versions of all the                                // 1231
  // underscore functions. Wrapped objects may be chained.                                               // 1232
                                                                                                         // 1233
  // Helper function to continue chaining intermediate results.                                          // 1234
  var result = function(obj) {                                                                           // 1235
    return this._chain ? _(obj).chain() : obj;                                                           // 1236
  };                                                                                                     // 1237
                                                                                                         // 1238
  // Add all of the Underscore functions to the wrapper object.                                          // 1239
  _.mixin(_);                                                                                            // 1240
                                                                                                         // 1241
  // Add all mutator Array functions to the wrapper.                                                     // 1242
  each(['pop', 'push', 'reverse', 'shift', 'sort', 'splice', 'unshift'], function(name) {                // 1243
    var method = ArrayProto[name];                                                                       // 1244
    _.prototype[name] = function() {                                                                     // 1245
      var obj = this._wrapped;                                                                           // 1246
      method.apply(obj, arguments);                                                                      // 1247
      if ((name == 'shift' || name == 'splice') && obj.length === 0) delete obj[0];                      // 1248
      return result.call(this, obj);                                                                     // 1249
    };                                                                                                   // 1250
  });                                                                                                    // 1251
                                                                                                         // 1252
  // Add all accessor Array functions to the wrapper.                                                    // 1253
  each(['concat', 'join', 'slice'], function(name) {                                                     // 1254
    var method = ArrayProto[name];                                                                       // 1255
    _.prototype[name] = function() {                                                                     // 1256
      return result.call(this, method.apply(this._wrapped, arguments));                                  // 1257
    };                                                                                                   // 1258
  });                                                                                                    // 1259
                                                                                                         // 1260
  _.extend(_.prototype, {                                                                                // 1261
                                                                                                         // 1262
    // Start chaining a wrapped Underscore object.                                                       // 1263
    chain: function() {                                                                                  // 1264
      this._chain = true;                                                                                // 1265
      return this;                                                                                       // 1266
    },                                                                                                   // 1267
                                                                                                         // 1268
    // Extracts the result from a wrapped and chained object.                                            // 1269
    value: function() {                                                                                  // 1270
      return this._wrapped;                                                                              // 1271
    }                                                                                                    // 1272
                                                                                                         // 1273
  });                                                                                                    // 1274
                                                                                                         // 1275
}).call(this);                                                                                           // 1276
                                                                                                         // 1277
///////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

///////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                       //
// packages/underscore/post.js                                                                           //
//                                                                                                       //
///////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                         //
// This exports object was created in pre.js.  Now copy the `_` object from it                           // 1
// into the package-scope variable `_`, which will get exported.                                         // 2
_ = exports._;                                                                                           // 3
                                                                                                         // 4
///////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);


/* Exports */
if (typeof Package === 'undefined') Package = {};
Package.underscore = {
  _: _
};

})();
