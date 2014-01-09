(function () {

/* Imports */
var Meteor = Package.meteor.Meteor;
var ReactiveDict = Package['reactive-dict'].ReactiveDict;
var Deps = Package.deps.Deps;
var _ = Package.underscore._;
var EJSON = Package.ejson.EJSON;
var WebApp = Package.webapp.WebApp;
var main = Package.webapp.main;
var WebAppInternals = Package.webapp.WebAppInternals;

/* Package-scope variables */
var RouteController, Route, Router, Utils, IronRouteController, IronRouter, ServerRouter, paramParts;

(function () {

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                //
// packages/iron-router/lib/utils.js                                                                              //
//                                                                                                                //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                  //
/**                                                                                                               // 1
 * Utility methods available privately to the package.                                                            // 2
 */                                                                                                               // 3
                                                                                                                  // 4
Utils = {};                                                                                                       // 5
                                                                                                                  // 6
/**                                                                                                               // 7
 * Returns global on node or window in the browser.                                                               // 8
 */                                                                                                               // 9
                                                                                                                  // 10
Utils.global = function () {                                                                                      // 11
  if (typeof window !== 'undefined')                                                                              // 12
    return window;                                                                                                // 13
  else if (typeof global !== 'undefined')                                                                         // 14
    return global;                                                                                                // 15
  else                                                                                                            // 16
    return null;                                                                                                  // 17
};                                                                                                                // 18
                                                                                                                  // 19
/**                                                                                                               // 20
 * Given the name of a property, resolves to the value. Works with namespacing                                    // 21
 * too. If first parameter is already a value that isn't a string it's returned                                   // 22
 * immediately.                                                                                                   // 23
 *                                                                                                                // 24
 * Examples:                                                                                                      // 25
 *  'SomeClass' => window.SomeClass || global.someClass                                                           // 26
 *  'App.namespace.SomeClass' => window.App.namespace.SomeClass                                                   // 27
 *                                                                                                                // 28
 * @param {String|Object} nameOrValue                                                                             // 29
 */                                                                                                               // 30
                                                                                                                  // 31
Utils.resolveValue = function (nameOrValue) {                                                                     // 32
  var global = Utils.global()                                                                                     // 33
    , parts                                                                                                       // 34
    , ptr;                                                                                                        // 35
                                                                                                                  // 36
  if (_.isString(nameOrValue)) {                                                                                  // 37
    parts = nameOrValue.split('.')                                                                                // 38
    ptr = global;                                                                                                 // 39
    for (var i = 0; i < parts.length; i++) {                                                                      // 40
      ptr = ptr[parts[i]];                                                                                        // 41
      if (!ptr)                                                                                                   // 42
        return undefined;                                                                                         // 43
    }                                                                                                             // 44
  } else {                                                                                                        // 45
    ptr = nameOrValue;                                                                                            // 46
  }                                                                                                               // 47
                                                                                                                  // 48
  // final position of ptr should be the resolved value                                                           // 49
  return ptr;                                                                                                     // 50
};                                                                                                                // 51
                                                                                                                  // 52
Utils.hasOwnProperty = function (obj, key) {                                                                      // 53
  var prop = {}.hasOwnProperty;                                                                                   // 54
  return prop.call(obj, key);                                                                                     // 55
};                                                                                                                // 56
                                                                                                                  // 57
/**                                                                                                               // 58
 * Don't mess with this function. It's exactly the same as the compiled                                           // 59
 * coffeescript mechanism. If you change it we can't guarantee that our code                                      // 60
 * will work when used with Coffeescript. One exception is putting in a runtime                                   // 61
 * check that both child and parent are of type Function.                                                         // 62
 */                                                                                                               // 63
                                                                                                                  // 64
Utils.inherits = function (child, parent) {                                                                       // 65
  if (Utils.typeOf(child) !== '[object Function]')                                                                // 66
    throw new Error('First parameter to Utils.inherits must be a function');                                      // 67
                                                                                                                  // 68
  if (Utils.typeOf(parent) !== '[object Function]')                                                               // 69
    throw new Error('Second parameter to Utils.inherits must be a function');                                     // 70
                                                                                                                  // 71
  for (var key in parent) {                                                                                       // 72
    if (Utils.hasOwnProperty(parent, key))                                                                        // 73
      child[key] = parent[key];                                                                                   // 74
  }                                                                                                               // 75
                                                                                                                  // 76
  function ctor () {                                                                                              // 77
    this.constructor = child;                                                                                     // 78
  }                                                                                                               // 79
                                                                                                                  // 80
  ctor.prototype = parent.prototype;                                                                              // 81
  child.prototype = new ctor();                                                                                   // 82
  child.__super__ = parent.prototype;                                                                             // 83
  return child;                                                                                                   // 84
};                                                                                                                // 85
                                                                                                                  // 86
Utils.toArray = function (obj) {                                                                                  // 87
  if (!obj)                                                                                                       // 88
    return [];                                                                                                    // 89
  else if (Utils.typeOf(obj) !== '[object Array]')                                                                // 90
    return [obj];                                                                                                 // 91
  else                                                                                                            // 92
    return obj;                                                                                                   // 93
};                                                                                                                // 94
                                                                                                                  // 95
Utils.typeOf = function (obj) {                                                                                   // 96
  if (obj && obj.typeName)                                                                                        // 97
    return obj.typeName;                                                                                          // 98
  else                                                                                                            // 99
    return Object.prototype.toString.call(obj);                                                                   // 100
};                                                                                                                // 101
                                                                                                                  // 102
Utils.extend = function (Super, definition, onBeforeExtendPrototype) {                                            // 103
  if (arguments.length === 1)                                                                                     // 104
    definition = Super;                                                                                           // 105
  else {                                                                                                          // 106
    definition = definition || {};                                                                                // 107
    definition.extend = Super;                                                                                    // 108
  }                                                                                                               // 109
                                                                                                                  // 110
  return Utils.create(definition, {                                                                               // 111
    onBeforeExtendPrototype: onBeforeExtendPrototype                                                              // 112
  });                                                                                                             // 113
};                                                                                                                // 114
                                                                                                                  // 115
Utils.create = function (definition, options) {                                                                   // 116
  var Constructor                                                                                                 // 117
    , extendFrom                                                                                                  // 118
    , savedPrototype;                                                                                             // 119
                                                                                                                  // 120
  options = options || {};                                                                                        // 121
  definition = definition || {};                                                                                  // 122
                                                                                                                  // 123
  if (Utils.hasOwnProperty(definition, 'constructor'))                                                            // 124
    Constructor = definition.constructor;                                                                         // 125
  else {                                                                                                          // 126
    Constructor = function () {                                                                                   // 127
      if (Constructor.__super__ && Constructor.__super__.constructor)                                             // 128
        return Constructor.__super__.constructor.apply(this, arguments);                                          // 129
    }                                                                                                             // 130
  }                                                                                                               // 131
                                                                                                                  // 132
  extendFrom = definition.extend;                                                                                 // 133
                                                                                                                  // 134
  if (definition.extend) delete definition.extend;                                                                // 135
                                                                                                                  // 136
  var inherit = function (Child, Super, prototype) {                                                              // 137
    Utils.inherits(Child, Utils.resolveValue(Super));                                                             // 138
    if (prototype) _.extend(Child.prototype, prototype);                                                          // 139
  };                                                                                                              // 140
                                                                                                                  // 141
  if (extendFrom) {                                                                                               // 142
    inherit(Constructor, extendFrom);                                                                             // 143
  }                                                                                                               // 144
                                                                                                                  // 145
  if (options.onBeforeExtendPrototype)                                                                            // 146
    options.onBeforeExtendPrototype.call(Constructor, definition);                                                // 147
                                                                                                                  // 148
  _.extend(Constructor.prototype, definition);                                                                    // 149
                                                                                                                  // 150
  return Constructor;                                                                                             // 151
};                                                                                                                // 152
                                                                                                                  // 153
/**                                                                                                               // 154
 * Assert that the given condition is truthy.                                                                     // 155
 *                                                                                                                // 156
 * @param {Boolean} condition The boolean condition to test for truthiness.                                       // 157
 * @param {String} msg The error message to show if the condition is falsy.                                       // 158
 */                                                                                                               // 159
                                                                                                                  // 160
Utils.assert = function (condition, msg) {                                                                        // 161
  if (!condition)                                                                                                 // 162
    throw new Error(msg);                                                                                         // 163
};                                                                                                                // 164
                                                                                                                  // 165
Utils.warn = function (condition, msg) {                                                                          // 166
  if (!condition)                                                                                                 // 167
    console && console.warn && console.warn(msg);                                                                 // 168
};                                                                                                                // 169
                                                                                                                  // 170
Utils.capitalize = function (str) {                                                                               // 171
  return str.charAt(0).toUpperCase() + str.slice(1, str.length);                                                  // 172
};                                                                                                                // 173
                                                                                                                  // 174
Utils.classify = function (str) {                                                                                 // 175
  var re = /_|-|\./;                                                                                              // 176
  return _.map(str.split(re), function (word) {                                                                   // 177
    return Utils.capitalize(word);                                                                                // 178
  }).join('');                                                                                                    // 179
};                                                                                                                // 180
                                                                                                                  // 181
Utils.pick = function (/* args */) {                                                                              // 182
  var args = _.toArray(arguments)                                                                                 // 183
    , arg;                                                                                                        // 184
  for (var i = 0; i < args.length; i++) {                                                                         // 185
    arg = args[i];                                                                                                // 186
    if (typeof arg !== 'undefined' && arg !== null)                                                               // 187
      return arg;                                                                                                 // 188
  }                                                                                                               // 189
                                                                                                                  // 190
  return null;                                                                                                    // 191
};                                                                                                                // 192
                                                                                                                  // 193
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                //
// packages/iron-router/lib/route.js                                                                              //
//                                                                                                                //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                  //
/*                                                                                                                // 1
 * Inspiration and some code for the compilation of routes comes from pagejs.                                     // 2
 * The original has been modified to better handle hash fragments, and to store                                   // 3
 * the regular expression on the Route instance. Also, the resolve method has                                     // 4
 * been added to return a resolved path given a parameters object.                                                // 5
 */                                                                                                               // 6
                                                                                                                  // 7
Route = function (router, name, options) {                                                                        // 8
  var path;                                                                                                       // 9
                                                                                                                  // 10
  Utils.assert(router instanceof IronRouter);                                                                     // 11
                                                                                                                  // 12
  Utils.assert(_.isString(name),                                                                                  // 13
    'Route constructor requires a name as the second parameter');                                                 // 14
                                                                                                                  // 15
  if (_.isFunction(options))                                                                                      // 16
    options = { handler: options };                                                                               // 17
                                                                                                                  // 18
  options = this.options = options || {};                                                                         // 19
  path = options.path || ('/' + name);                                                                            // 20
                                                                                                                  // 21
  this.router = router;                                                                                           // 22
  this.originalPath = path;                                                                                       // 23
                                                                                                                  // 24
  if (_.isString(this.originalPath) && this.originalPath.charAt(0) !== '/')                                       // 25
    this.originalPath = '/' + this.originalPath;                                                                  // 26
                                                                                                                  // 27
  this.name = name;                                                                                               // 28
  this.where = options.where || 'client';                                                                         // 29
  this.controller = options.controller;                                                                           // 30
                                                                                                                  // 31
  if (typeof options.reactive !== 'undefined')                                                                    // 32
    this.isReactive = options.reactive;                                                                           // 33
  else                                                                                                            // 34
    this.isReactive = true;                                                                                       // 35
                                                                                                                  // 36
  this.compile();                                                                                                 // 37
};                                                                                                                // 38
                                                                                                                  // 39
Route.prototype = {                                                                                               // 40
  constructor: Route,                                                                                             // 41
                                                                                                                  // 42
  /**                                                                                                             // 43
   * Compile the path.                                                                                            // 44
   *                                                                                                              // 45
   *  @return {Route}                                                                                             // 46
   *  @api public                                                                                                 // 47
   */                                                                                                             // 48
                                                                                                                  // 49
  compile: function () {                                                                                          // 50
    var self = this                                                                                               // 51
      , path                                                                                                      // 52
      , options = self.options;                                                                                   // 53
                                                                                                                  // 54
    this.keys = [];                                                                                               // 55
                                                                                                                  // 56
    if (self.originalPath instanceof RegExp) {                                                                    // 57
      self.re = self.originalPath;                                                                                // 58
    } else {                                                                                                      // 59
      path = self.originalPath                                                                                    // 60
        .replace(/(.)\/$/, '$1')                                                                                  // 61
        .concat(options.strict ? '' : '/?')                                                                       // 62
        .replace(/\/\(/g, '(?:/')                                                                                 // 63
        .replace(/#/, '/?#')                                                                                      // 64
        .replace(                                                                                                 // 65
          /(\/)?(\.)?:(\w+)(?:(\(.*?\)))?(\?)?/g,                                                                 // 66
          function (match, slash, format, key, capture, optional){                                                // 67
            self.keys.push({ name: key, optional: !! optional });                                                 // 68
            slash = slash || '';                                                                                  // 69
            return ''                                                                                             // 70
              + (optional ? '' : slash)                                                                           // 71
              + '(?:'                                                                                             // 72
              + (optional ? slash : '')                                                                           // 73
              + (format || '')                                                                                    // 74
              + (capture || (format && '([^/.]+?)' || '([^/]+?)')) + ')'                                          // 75
              + (optional || '');                                                                                 // 76
          }                                                                                                       // 77
        )                                                                                                         // 78
        .replace(/([\/.])/g, '\\$1')                                                                              // 79
        .replace(/\*/g, '(.*)');                                                                                  // 80
                                                                                                                  // 81
      self.re = new RegExp('^' + path + '$', options.sensitive ? '' : 'i');                                       // 82
    }                                                                                                             // 83
                                                                                                                  // 84
    return this;                                                                                                  // 85
  },                                                                                                              // 86
                                                                                                                  // 87
  /**                                                                                                             // 88
   * Returns an array of parameters given a path. The array may have named                                        // 89
   * properties in addition to indexed values.                                                                    // 90
   *                                                                                                              // 91
   * @param {String} path                                                                                         // 92
   * @return {Array}                                                                                              // 93
   * @api public                                                                                                  // 94
   */                                                                                                             // 95
                                                                                                                  // 96
  params: function (path) {                                                                                       // 97
    if (!path) return null;                                                                                       // 98
                                                                                                                  // 99
    var params = []                                                                                               // 100
      , m = this.exec(path)                                                                                       // 101
      , queryString                                                                                               // 102
      , keys = this.keys                                                                                          // 103
      , key                                                                                                       // 104
      , value;                                                                                                    // 105
                                                                                                                  // 106
    if (!m)                                                                                                       // 107
      throw new Error('The route named "' + this.name + '" does not match the path "' + path + '"');              // 108
                                                                                                                  // 109
    for (var i = 1, len = m.length; i < len; ++i) {                                                               // 110
      key = keys[i - 1];                                                                                          // 111
      value = typeof m[i] == 'string' ? decodeURIComponent(m[i]) : m[i];                                          // 112
      if (key) {                                                                                                  // 113
        params[key.name] = params[key.name] !== undefined ?                                                       // 114
          params[key.name] : value;                                                                               // 115
      } else                                                                                                      // 116
        params.push(value);                                                                                       // 117
    }                                                                                                             // 118
                                                                                                                  // 119
    path = decodeURI(path);                                                                                       // 120
                                                                                                                  // 121
    queryString = path.split('?')[1];                                                                             // 122
    if (queryString)                                                                                              // 123
      queryString = queryString.split('#')[0];                                                                    // 124
                                                                                                                  // 125
    params.hash = path.split('#')[1];                                                                             // 126
                                                                                                                  // 127
    if (queryString) {                                                                                            // 128
      _.each(queryString.split('&'), function (paramString) {                                                     // 129
        paramParts = paramString.split('=');                                                                      // 130
        params[paramParts[0]] = decodeURIComponent(paramParts[1]);                                                // 131
      });                                                                                                         // 132
    }                                                                                                             // 133
                                                                                                                  // 134
    return params;                                                                                                // 135
  },                                                                                                              // 136
                                                                                                                  // 137
  normalizePath: function (path) {                                                                                // 138
    var origin = Meteor.absoluteUrl();                                                                            // 139
                                                                                                                  // 140
    path = path.replace(origin, '');                                                                              // 141
                                                                                                                  // 142
    var queryStringIndex = path.indexOf('?');                                                                     // 143
    path = ~queryStringIndex ? path.slice(0, queryStringIndex) : path;                                            // 144
                                                                                                                  // 145
    var hashIndex = path.indexOf('#');                                                                            // 146
    path = ~hashIndex ? path.slice(0, hashIndex) : path;                                                          // 147
                                                                                                                  // 148
    if (path.charAt(0) !== '/')                                                                                   // 149
      path = '/' + path;                                                                                          // 150
                                                                                                                  // 151
    return path;                                                                                                  // 152
  },                                                                                                              // 153
                                                                                                                  // 154
  /**                                                                                                             // 155
   * Returns true if the path matches and false otherwise.                                                        // 156
   *                                                                                                              // 157
   * @param {String} path                                                                                         // 158
   * @return {Boolean}                                                                                            // 159
   * @api public                                                                                                  // 160
   */                                                                                                             // 161
  test: function (path) {                                                                                         // 162
    return this.re.test(this.normalizePath(path));                                                                // 163
  },                                                                                                              // 164
                                                                                                                  // 165
  exec: function (path) {                                                                                         // 166
    return this.re.exec(this.normalizePath(path));                                                                // 167
  },                                                                                                              // 168
                                                                                                                  // 169
  resolve: function (params, options) {                                                                           // 170
    var value                                                                                                     // 171
      , isValueDefined                                                                                            // 172
      , result                                                                                                    // 173
      , wildCardCount = 0                                                                                         // 174
      , path = this.originalPath                                                                                  // 175
      , hash                                                                                                      // 176
      , query                                                                                                     // 177
      , isMissingParams = false;                                                                                  // 178
                                                                                                                  // 179
    options = options || {};                                                                                      // 180
    params = params || [];                                                                                        // 181
    query = options.query;                                                                                        // 182
    hash = options.hash;                                                                                          // 183
                                                                                                                  // 184
    if (path instanceof RegExp) {                                                                                 // 185
      throw new Error('Cannot currently resolve a regular expression path');                                      // 186
    } else {                                                                                                      // 187
      path = this.originalPath                                                                                    // 188
        .replace(                                                                                                 // 189
          /(\/)?(\.)?:(\w+)(?:(\(.*?\)))?(\?)?/g,                                                                 // 190
          function (match, slash, format, key, capture, optional, offset) {                                       // 191
            slash = slash || '';                                                                                  // 192
            value = params[key];                                                                                  // 193
            isValueDefined = typeof value !== 'undefined';                                                        // 194
                                                                                                                  // 195
            if (optional && !isValueDefined) {                                                                    // 196
              value = '';                                                                                         // 197
            } else if (!isValueDefined) {                                                                         // 198
              isMissingParams = true;                                                                             // 199
              console.warn('You called Route.prototype.resolve with a missing parameter. "' + key + '" not found in params');
              return;                                                                                             // 201
              //throw new Error('You called Route.prototype.resolve with a missing parameter. "' + key + '" not found in params');
            }                                                                                                     // 203
                                                                                                                  // 204
            value = _.isFunction(value) ? value.call(params) : value;                                             // 205
            var escapedValue = _.map(String(value).split('/'), function (segment) {                               // 206
              return encodeURIComponent(segment);                                                                 // 207
            }).join('/');                                                                                         // 208
            return slash + escapedValue                                                                           // 209
          }                                                                                                       // 210
        )                                                                                                         // 211
        .replace(                                                                                                 // 212
          /\*/g,                                                                                                  // 213
          function (match) {                                                                                      // 214
            if (typeof params[wildCardCount] === 'undefined') {                                                   // 215
              throw new Error(                                                                                    // 216
                'You are trying to access a wild card parameter at index ' +                                      // 217
                wildCardCount +                                                                                   // 218
                ' but the value of params at that index is undefined');                                           // 219
            }                                                                                                     // 220
                                                                                                                  // 221
            var paramValue = String(params[wildCardCount++]);                                                     // 222
            return _.map(paramValue.split('/'), function (segment) {                                              // 223
              return encodeURIComponent(segment);                                                                 // 224
            }).join('/');                                                                                         // 225
          }                                                                                                       // 226
        );                                                                                                        // 227
                                                                                                                  // 228
      if (_.isObject(query)) {                                                                                    // 229
        query = _.map(_.pairs(query), function (queryPart) {                                                      // 230
          return queryPart[0] + '=' + encodeURIComponent(queryPart[1]);                                           // 231
        }).join('&');                                                                                             // 232
                                                                                                                  // 233
        if (query && query.length)                                                                                // 234
          path = path + '/?' + query;                                                                             // 235
      }                                                                                                           // 236
                                                                                                                  // 237
      if (hash) {                                                                                                 // 238
        hash = encodeURI(hash.replace('#', ''));                                                                  // 239
        path = query ?                                                                                            // 240
          path + '#' + hash : path + '/#' + hash;                                                                 // 241
      }                                                                                                           // 242
    }                                                                                                             // 243
                                                                                                                  // 244
    // Because of optional possibly empty segments we normalize path here                                         // 245
    path = path.replace(/\/+/g, '/'); // Multiple / -> one /                                                      // 246
    path = path.replace(/^(.+)\/$/g, '$1'); // Removal of trailing /                                              // 247
                                                                                                                  // 248
    return isMissingParams ? null : path;                                                                         // 249
  },                                                                                                              // 250
                                                                                                                  // 251
  path: function (params, options) {                                                                              // 252
    return this.resolve(params, options);                                                                         // 253
  },                                                                                                              // 254
                                                                                                                  // 255
  url: function (params, options) {                                                                               // 256
    var path = this.path(params, options);                                                                        // 257
    if (path[0] === '/')                                                                                          // 258
      path = path.slice(1, path.length);                                                                          // 259
    return Meteor.absoluteUrl() + path;                                                                           // 260
  },                                                                                                              // 261
                                                                                                                  // 262
  getController: function (path, options) {                                                                       // 263
    var self = this;                                                                                              // 264
    var handler                                                                                                   // 265
      , controllerClass                                                                                           // 266
      , controller                                                                                                // 267
      , action                                                                                                    // 268
      , routeName;                                                                                                // 269
                                                                                                                  // 270
    var resolveValue = Utils.resolveValue;                                                                        // 271
    var classify = Utils.classify;                                                                                // 272
    var toArray = Utils.toArray;                                                                                  // 273
                                                                                                                  // 274
    var findController = function (name) {                                                                        // 275
      var controller = resolveValue(name);                                                                        // 276
      if (typeof controller === 'undefined') {                                                                    // 277
        throw new Error(                                                                                          // 278
          'controller "' + name + '" is not defined');                                                            // 279
      }                                                                                                           // 280
                                                                                                                  // 281
      return controller;                                                                                          // 282
    };                                                                                                            // 283
                                                                                                                  // 284
    options = _.extend({}, this.router.options, this.options, options || {}, {                                    // 285
      before: toArray(this.options.before),                                                                       // 286
      after: toArray(this.options.after),                                                                         // 287
      unload: toArray(this.options.unload),                                                                       // 288
      waitOn: toArray(this.router.options.waitOn)                                                                 // 289
        .concat(toArray(this.options.waitOn)),                                                                    // 290
      path: path,                                                                                                 // 291
      route: this,                                                                                                // 292
      router: this.router,                                                                                        // 293
      params: this.params(path)                                                                                   // 294
    });                                                                                                           // 295
                                                                                                                  // 296
    // case 1: controller option is defined on the route                                                          // 297
    if (this.controller) {                                                                                        // 298
      controllerClass = _.isString(this.controller) ?                                                             // 299
        findController(this.controller) : this.controller;                                                        // 300
      controller = new controllerClass(options);                                                                  // 301
      return controller;                                                                                          // 302
    }                                                                                                             // 303
                                                                                                                  // 304
    // case 2: intelligently find the controller class in global namespace                                        // 305
    routeName = this.name;                                                                                        // 306
                                                                                                                  // 307
    if (routeName) {                                                                                              // 308
      controllerClass = resolveValue(classify(routeName + 'Controller'));                                         // 309
                                                                                                                  // 310
      if (controllerClass) {                                                                                      // 311
        controller = new controllerClass(options);                                                                // 312
        return controller;                                                                                        // 313
      }                                                                                                           // 314
    }                                                                                                             // 315
                                                                                                                  // 316
    // case 3: nothing found so create an anonymous controller                                                    // 317
    return new RouteController(options);                                                                          // 318
  }                                                                                                               // 319
};                                                                                                                // 320
                                                                                                                  // 321
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                //
// packages/iron-router/lib/route_controller.js                                                                   //
//                                                                                                                //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                  //
/*****************************************************************************/                                   // 1
/* IronRouteController */                                                                                         // 2
/*****************************************************************************/                                   // 3
                                                                                                                  // 4
/**                                                                                                               // 5
 * Base class for client and server RouteController.                                                              // 6
 */                                                                                                               // 7
                                                                                                                  // 8
IronRouteController = function (options) {                                                                        // 9
  var self = this;                                                                                                // 10
                                                                                                                  // 11
  options = this.options = options || {};                                                                         // 12
                                                                                                                  // 13
  var getOption = function (key) {                                                                                // 14
    return Utils.pick(self.options[key], self[key]);                                                              // 15
  };                                                                                                              // 16
                                                                                                                  // 17
  this.router = options.router;                                                                                   // 18
  this.route = options.route;                                                                                     // 19
  this.path = options.path;                                                                                       // 20
  this.params = options.params || [];                                                                             // 21
  this.where = options.where || 'client';                                                                         // 22
  this.action = options.action || this.action;                                                                    // 23
  this.hooks = {};                                                                                                // 24
                                                                                                                  // 25
  options.load = Utils.toArray(options.load);                                                                     // 26
  options.before = Utils.toArray(options.before);                                                                 // 27
  options.after = Utils.toArray(options.after);                                                                   // 28
  options.unload = Utils.toArray(options.unload);                                                                 // 29
};                                                                                                                // 30
                                                                                                                  // 31
IronRouteController.prototype = {                                                                                 // 32
  constructor: IronRouteController,                                                                               // 33
                                                                                                                  // 34
  runHooks: function (hookName, more) {                                                                           // 35
    var ctor = this.constructor                                                                                   // 36
      , more = Utils.toArray(more);                                                                               // 37
                                                                                                                  // 38
    var collectInheritedHooks = function (ctor) {                                                                 // 39
      var hooks = [];                                                                                             // 40
                                                                                                                  // 41
      if (ctor.__super__)                                                                                         // 42
        hooks = hooks.concat(collectInheritedHooks(ctor.__super__.constructor));                                  // 43
                                                                                                                  // 44
      return Utils.hasOwnProperty(ctor.prototype, hookName) ?                                                     // 45
        hooks.concat(ctor.prototype[hookName]) : hooks;                                                           // 46
    };                                                                                                            // 47
                                                                                                                  // 48
    var prototypeHooks = collectInheritedHooks(this.constructor);                                                 // 49
    var routeHooks = this.options[hookName];                                                                      // 50
    var globalHooks =                                                                                             // 51
      this.route ? this.router.getHooks(hookName, this.route.name) : [];                                          // 52
                                                                                                                  // 53
    var allHooks = globalHooks.concat(routeHooks).concat(prototypeHooks).concat(more);                            // 54
                                                                                                                  // 55
    for (var i = 0, hook; hook = allHooks[i]; i++) {                                                              // 56
      if (this.stopped)                                                                                           // 57
        break;                                                                                                    // 58
      hook.call(this);                                                                                            // 59
    }                                                                                                             // 60
  },                                                                                                              // 61
                                                                                                                  // 62
  run: function () {                                                                                              // 63
    throw new Error('not implemented');                                                                           // 64
  },                                                                                                              // 65
                                                                                                                  // 66
  action: function () {                                                                                           // 67
    throw new Error('not implemented');                                                                           // 68
  },                                                                                                              // 69
                                                                                                                  // 70
  stop: function() {                                                                                              // 71
    this.stopped = true;                                                                                          // 72
  }                                                                                                               // 73
};                                                                                                                // 74
                                                                                                                  // 75
_.extend(IronRouteController, {                                                                                   // 76
  /**                                                                                                             // 77
   * Inherit from IronRouteController                                                                             // 78
   *                                                                                                              // 79
   * @param {Object} definition Prototype properties for inherited class.                                         // 80
   */                                                                                                             // 81
                                                                                                                  // 82
  extend: function (definition) {                                                                                 // 83
    return Utils.extend(this, definition, function (definition) {                                                 // 84
      var klass = this;                                                                                           // 85
                                                                                                                  // 86
      /*                                                                                                          // 87
        Allow calling a class method from javascript, directly in the subclass                                    // 88
        definition.                                                                                               // 89
                                                                                                                  // 90
        Instead of this:                                                                                          // 91
          MyController = RouteController.extend({...});                                                           // 92
          MyController.before(function () {});                                                                    // 93
                                                                                                                  // 94
        You can do:                                                                                               // 95
          MyController = RouteController.extend({                                                                 // 96
            before: function () {}                                                                                // 97
          });                                                                                                     // 98
                                                                                                                  // 99
        And in Coffeescript you can do:                                                                           // 100
         MyController extends RouteController                                                                     // 101
           @before function () {}                                                                                 // 102
       */                                                                                                         // 103
    });                                                                                                           // 104
  }                                                                                                               // 105
});                                                                                                               // 106
                                                                                                                  // 107
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                //
// packages/iron-router/lib/router.js                                                                             //
//                                                                                                                //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                  //
/*****************************************************************************/                                   // 1
/* IronRouter */                                                                                                  // 2
/*****************************************************************************/                                   // 3
IronRouter = function (options) {                                                                                 // 4
  var self = this;                                                                                                // 5
                                                                                                                  // 6
  this.configure(options);                                                                                        // 7
                                                                                                                  // 8
  /**                                                                                                             // 9
   * The routes array which doubles as a named route index by adding                                              // 10
   * properties to the array.                                                                                     // 11
   *                                                                                                              // 12
   * @api public                                                                                                  // 13
   */                                                                                                             // 14
  this.routes = [];                                                                                               // 15
                                                                                                                  // 16
  this._globalHooks = {};                                                                                         // 17
  _.each(IronRouter.HOOK_TYPES, function(type) { self._globalHooks[type] = []; });                                // 18
};                                                                                                                // 19
                                                                                                                  // 20
IronRouter.HOOK_TYPES = ['load', 'before', 'after', 'unload'];                                                    // 21
                                                                                                                  // 22
IronRouter.prototype = {                                                                                          // 23
  constructor: IronRouter,                                                                                        // 24
                                                                                                                  // 25
  /**                                                                                                             // 26
   * Configure instance with options. This can be called at any time. If the                                      // 27
   * instance options object hasn't been created yet it is created here.                                          // 28
   *                                                                                                              // 29
   * @param {Object} options                                                                                      // 30
   * @return {IronRouter}                                                                                         // 31
   * @api public                                                                                                  // 32
   */                                                                                                             // 33
                                                                                                                  // 34
  configure: function (options) {                                                                                 // 35
    var self = this;                                                                                              // 36
                                                                                                                  // 37
    this.options = this.options || {};                                                                            // 38
    _.extend(this.options, options);                                                                              // 39
                                                                                                                  // 40
    // e.g. before: fn OR before: [fn1, fn2]                                                                      // 41
    _.each(IronRouter.HOOK_TYPES, function(type) {                                                                // 42
      if (self.options[type]) {                                                                                   // 43
        _.each(Utils.toArray(self.options[type]), function(hook) {                                                // 44
          self.addHook(type, hook);                                                                               // 45
        });                                                                                                       // 46
                                                                                                                  // 47
        delete self.options[type];                                                                                // 48
      }                                                                                                           // 49
    });                                                                                                           // 50
                                                                                                                  // 51
    return this;                                                                                                  // 52
  },                                                                                                              // 53
                                                                                                                  // 54
                                                                                                                  // 55
  /**                                                                                                             // 56
   *                                                                                                              // 57
   * Add a hook to all routes. The hooks will apply to all routes,                                                // 58
   * unless you name routes to include or exclude via `only` and `except` options                                 // 59
   *                                                                                                              // 60
   * @param {String} [type] one of 'load', 'unload', 'before' or 'after'                                          // 61
   * @param {Object} [options] Options to controll the hooks [optional]                                           // 62
   * @param {Function} [hook] Callback to run                                                                     // 63
   * @return {IronRouter}                                                                                         // 64
   * @api public                                                                                                  // 65
   *                                                                                                              // 66
   */                                                                                                             // 67
                                                                                                                  // 68
  addHook: function(type, hook, options) {                                                                        // 69
    options = options || {}                                                                                       // 70
                                                                                                                  // 71
    if (options.only)                                                                                             // 72
      options.only = Utils.toArray(options.only);                                                                 // 73
    if (options.except)                                                                                           // 74
      options.except = Utils.toArray(options.except);                                                             // 75
                                                                                                                  // 76
    this._globalHooks[type].push({options: options, hook: hook});                                                 // 77
                                                                                                                  // 78
    return this;                                                                                                  // 79
  },                                                                                                              // 80
                                                                                                                  // 81
  load: function(hook, options) {                                                                                 // 82
    return this.addHook('load', hook, options);                                                                   // 83
  },                                                                                                              // 84
                                                                                                                  // 85
  before: function(hook, options) {                                                                               // 86
    return this.addHook('before', hook, options);                                                                 // 87
  },                                                                                                              // 88
                                                                                                                  // 89
  after: function(hook, options) {                                                                                // 90
    return this.addHook('after', hook, options);                                                                  // 91
  },                                                                                                              // 92
                                                                                                                  // 93
  unload: function(hook, options) {                                                                               // 94
    return this.addHook('unload', hook, options);                                                                 // 95
  },                                                                                                              // 96
                                                                                                                  // 97
  /**                                                                                                             // 98
   *                                                                                                              // 99
   * Fetch the list of global hooks that apply to the given route name.                                           // 100
   * Hooks are defined by the .addHook() function above.                                                          // 101
   *                                                                                                              // 102
   * @param {String} [type] one of 'load', 'unload', 'before' or 'after'                                          // 103
   * @param {String} [name] the name of the route we are interested in                                            // 104
   * @return {[Function]} [hooks] an array of hooks to run                                                        // 105
   * @api public                                                                                                  // 106
   *                                                                                                              // 107
   */                                                                                                             // 108
                                                                                                                  // 109
  getHooks: function(type, name) {                                                                                // 110
    var hooks = [];                                                                                               // 111
                                                                                                                  // 112
    _.each(this._globalHooks[type], function(hook) {                                                              // 113
      var options = hook.options;                                                                                 // 114
                                                                                                                  // 115
      if (options.except && _.include(options.except, name))                                                      // 116
        return;                                                                                                   // 117
                                                                                                                  // 118
      if (options.only && ! _.include(options.only, name))                                                        // 119
        return;                                                                                                   // 120
                                                                                                                  // 121
      hooks.push(hook.hook);                                                                                      // 122
    });                                                                                                           // 123
                                                                                                                  // 124
    return hooks;                                                                                                 // 125
  },                                                                                                              // 126
                                                                                                                  // 127
                                                                                                                  // 128
  /**                                                                                                             // 129
   * Convenience function to define a bunch of routes at once. In the future we                                   // 130
   * might call the callback with a custom dsl.                                                                   // 131
   *                                                                                                              // 132
   * Example:                                                                                                     // 133
   *  Router.map(function () {                                                                                    // 134
   *    this.route('posts');                                                                                      // 135
   *  });                                                                                                         // 136
   *                                                                                                              // 137
   *  @param {Function} cb                                                                                        // 138
   *  @return {IronRouter}                                                                                        // 139
   *  @api public                                                                                                 // 140
   */                                                                                                             // 141
                                                                                                                  // 142
  map: function (cb) {                                                                                            // 143
    Utils.assert(_.isFunction(cb),                                                                                // 144
           'map requires a function as the first parameter');                                                     // 145
    cb.call(this);                                                                                                // 146
    return this;                                                                                                  // 147
  },                                                                                                              // 148
                                                                                                                  // 149
  /**                                                                                                             // 150
   * Define a new route. You must name the route, but as a second parameter you                                   // 151
   * can either provide an object of options or a Route instance.                                                 // 152
   *                                                                                                              // 153
   * @param {String} name The name of the route                                                                   // 154
   * @param {Object} [options] Options to pass along to the route                                                 // 155
   * @return {Route}                                                                                              // 156
   * @api public                                                                                                  // 157
   */                                                                                                             // 158
                                                                                                                  // 159
  route: function (name, options) {                                                                               // 160
    var route;                                                                                                    // 161
                                                                                                                  // 162
    Utils.assert(_.isString(name), 'name is a required parameter');                                               // 163
                                                                                                                  // 164
    if (options instanceof Route)                                                                                 // 165
      route = options;                                                                                            // 166
    else                                                                                                          // 167
      route = new Route(this, name, options);                                                                     // 168
                                                                                                                  // 169
    this.routes[name] = route;                                                                                    // 170
    this.routes.push(route);                                                                                      // 171
    return route;                                                                                                 // 172
  },                                                                                                              // 173
                                                                                                                  // 174
  path: function (routeName, params, options) {                                                                   // 175
    var route = this.routes[routeName];                                                                           // 176
    Utils.warn(route,                                                                                             // 177
     'You called Router.path for a route named ' + routeName + ' but that that route doesn\'t seem to exist. Are you sure you created it?');
    return route && route.path(params, options);                                                                  // 179
  },                                                                                                              // 180
                                                                                                                  // 181
  url: function (routeName, params, options) {                                                                    // 182
    var route = this.routes[routeName];                                                                           // 183
    Utils.warn(route,                                                                                             // 184
      'You called Router.url for a route named "' + routeName + '" but that route doesn\'t seem to exist. Are you sure you created it?');
    return route && route.url(params, options);                                                                   // 186
  },                                                                                                              // 187
                                                                                                                  // 188
  dispatch: function (path, options, cb) {                                                                        // 189
    var self = this                                                                                               // 190
      , routes = self.routes                                                                                      // 191
      , route                                                                                                     // 192
      , controller                                                                                                // 193
      , where = Meteor.isClient ? 'client' : 'server'                                                             // 194
      , i = 0;                                                                                                    // 195
                                                                                                                  // 196
    function next () {                                                                                            // 197
      route = routes[i++];                                                                                        // 198
                                                                                                                  // 199
      if (!route) {                                                                                               // 200
        return self.onRouteNotFound(path, options);                                                               // 201
      }                                                                                                           // 202
                                                                                                                  // 203
      if (route.test(path)) {                                                                                     // 204
        if (route.where !== where)                                                                                // 205
          return self.onUnhandled(path, options);                                                                 // 206
                                                                                                                  // 207
        var controller = route.getController(path, options);                                                      // 208
        self.run(controller, cb);                                                                                 // 209
      } else {                                                                                                    // 210
        next();                                                                                                   // 211
      }                                                                                                           // 212
    }                                                                                                             // 213
                                                                                                                  // 214
    next();                                                                                                       // 215
  },                                                                                                              // 216
                                                                                                                  // 217
  run: function (controller, cb) {                                                                                // 218
    throw new Error('run not implemented');                                                                       // 219
  },                                                                                                              // 220
                                                                                                                  // 221
  onUnhandled: function (path, options) {                                                                         // 222
    throw new Error('onUnhandled not implemented');                                                               // 223
  },                                                                                                              // 224
                                                                                                                  // 225
  onRouteNotFound: function (path, options) {                                                                     // 226
    throw new Error('Oh no! No route found for path: "' + path + '"');                                            // 227
  }                                                                                                               // 228
};                                                                                                                // 229
                                                                                                                  // 230
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                //
// packages/iron-router/lib/server/route_controller.js                                                            //
//                                                                                                                //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                  //
RouteController = Utils.extend(IronRouteController, {                                                             // 1
  constructor: function () {                                                                                      // 2
    RouteController.__super__.constructor.apply(this, arguments);                                                 // 3
    this.request = this.options.request;                                                                          // 4
    this.response = this.options.response;                                                                        // 5
    this.next = this.options.next;                                                                                // 6
  },                                                                                                              // 7
                                                                                                                  // 8
  run: function () {                                                                                              // 9
    var self = this                                                                                               // 10
      , args = _.toArray(arguments);                                                                              // 11
                                                                                                                  // 12
    try {                                                                                                         // 13
      var action = _.isFunction(this.action) ? this.action : this[this.action];                                   // 14
                                                                                                                  // 15
      Utils.assert(action,                                                                                        // 16
        "Uh oh, you don't seem to have an action named \"" + this.action + "\" defined on your RouteController"); // 17
                                                                                                                  // 18
      this.stopped = false;                                                                                       // 19
                                                                                                                  // 20
      this.runHooks('before');                                                                                    // 21
                                                                                                                  // 22
      if (this.stopped) {                                                                                         // 23
        this.isFirstRun = false;                                                                                  // 24
        return;                                                                                                   // 25
      }                                                                                                           // 26
                                                                                                                  // 27
      action.call(this);                                                                                          // 28
      this.runHooks('after');                                                                                     // 29
      this.isFirstRun = false;                                                                                    // 30
    } finally {                                                                                                   // 31
      this.response.end();                                                                                        // 32
    }                                                                                                             // 33
  },                                                                                                              // 34
                                                                                                                  // 35
  action: function () {                                                                                           // 36
    this.response.end();                                                                                          // 37
  }                                                                                                               // 38
});                                                                                                               // 39
                                                                                                                  // 40
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                //
// packages/iron-router/lib/server/router.js                                                                      //
//                                                                                                                //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                  //
var connect = Npm.require('connect');                                                                             // 1
var Fiber = Npm.require('fibers');                                                                                // 2
                                                                                                                  // 3
var root = global;                                                                                                // 4
                                                                                                                  // 5
var connectHandlers                                                                                               // 6
  , connect;                                                                                                      // 7
                                                                                                                  // 8
if (typeof __meteor_bootstrap__.app !== 'undefined') {                                                            // 9
  connectHandlers = __meteor_bootstrap__.app;                                                                     // 10
} else {                                                                                                          // 11
  connectHandlers = WebApp.connectHandlers;                                                                       // 12
}                                                                                                                 // 13
                                                                                                                  // 14
ServerRouter = Utils.extend(IronRouter, {                                                                         // 15
  constructor: function (options) {                                                                               // 16
    var self = this;                                                                                              // 17
    ServerRouter.__super__.constructor.apply(this, arguments);                                                    // 18
    Meteor.startup(function () {                                                                                  // 19
      setTimeout(function () {                                                                                    // 20
        if (self.options.autoStart !== false)                                                                     // 21
          self.start();                                                                                           // 22
      });                                                                                                         // 23
    });                                                                                                           // 24
  },                                                                                                              // 25
                                                                                                                  // 26
  start: function () {                                                                                            // 27
    connectHandlers                                                                                               // 28
      .use(connect.query())                                                                                       // 29
      .use(connect.bodyParser())                                                                                  // 30
      .use(_.bind(this.onRequest, this));                                                                         // 31
  },                                                                                                              // 32
                                                                                                                  // 33
  onRequest: function (req, res, next) {                                                                          // 34
    var self = this;                                                                                              // 35
    Fiber(function () {                                                                                           // 36
      self.dispatch(req.url, {                                                                                    // 37
        request: req,                                                                                             // 38
        response: res,                                                                                            // 39
        next: next                                                                                                // 40
      });                                                                                                         // 41
    }).run();                                                                                                     // 42
  },                                                                                                              // 43
                                                                                                                  // 44
  run: function (controller, cb) {                                                                                // 45
    var self = this;                                                                                              // 46
    var where = Meteor.isClient ? 'client' : 'server';                                                            // 47
                                                                                                                  // 48
    Utils.assert(controller, 'run requires a controller');                                                        // 49
                                                                                                                  // 50
    // one last check to see if we should handle the route here                                                   // 51
    if (controller.where != where) {                                                                              // 52
      self.onUnhandled(controller.path, controller.options);                                                      // 53
      return;                                                                                                     // 54
    }                                                                                                             // 55
                                                                                                                  // 56
    if (this._currentController)                                                                                  // 57
      this._currentController.runHooks('unload');                                                                 // 58
                                                                                                                  // 59
    this._currentController = controller;                                                                         // 60
    controller.runHooks('load');                                                                                  // 61
    controller.run();                                                                                             // 62
                                                                                                                  // 63
    if (controller == this._currentController) {                                                                  // 64
      cb && cb(controller);                                                                                       // 65
    }                                                                                                             // 66
  },                                                                                                              // 67
                                                                                                                  // 68
  stop: function () {                                                                                             // 69
  },                                                                                                              // 70
                                                                                                                  // 71
  onUnhandled: function (path, options) {                                                                         // 72
    options.next();                                                                                               // 73
  },                                                                                                              // 74
                                                                                                                  // 75
  onRouteNotFound: function (path, options) {                                                                     // 76
    options.next();                                                                                               // 77
  }                                                                                                               // 78
});                                                                                                               // 79
                                                                                                                  // 80
Router = new ServerRouter;                                                                                        // 81
                                                                                                                  // 82
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);


/* Exports */
if (typeof Package === 'undefined') Package = {};
Package['iron-router'] = {
  RouteController: RouteController,
  Route: Route,
  Router: Router,
  Utils: Utils,
  IronRouteController: IronRouteController,
  IronRouter: IronRouter,
  ServerRouter: ServerRouter
};

})();
