(function () {

/* Imports */
var Meteor = Package.meteor.Meteor;
var _ = Package.underscore._;
var EJSON = Package.ejson.EJSON;
var MongoInternals = Package['mongo-livedata'].MongoInternals;
var LocalCollection = Package.minimongo.LocalCollection;
var Deps = Package.deps.Deps;

/* Package-scope variables */
var CollectionHooks;

(function () {

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                               //
// packages/collection-hooks/collection-hooks.js                                                                 //
//                                                                                                               //
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                 //
// Relevant AOP terminology:                                                                                     // 1
// Aspect: User code that runs before/after (hook)                                                               // 2
// Advice: Wrapper code that knows when to call user code (aspects)                                              // 3
// Pointcut: before/after                                                                                        // 4
                                                                                                                 // 5
var advices = {};                                                                                                // 6
var currentUserId;                                                                                               // 7
var constructor = Meteor.Collection;                                                                             // 8
                                                                                                                 // 9
function getUserId() {                                                                                           // 10
  var userId;                                                                                                    // 11
                                                                                                                 // 12
  if (Meteor.isClient) {                                                                                         // 13
    Deps.nonreactive(function () {                                                                               // 14
      userId = Meteor.userId && Meteor.userId();                                                                 // 15
    });                                                                                                          // 16
  }                                                                                                              // 17
                                                                                                                 // 18
  if (Meteor.isServer) {                                                                                         // 19
    try {                                                                                                        // 20
      // Will throw an error unless within method call.                                                          // 21
      // Attempt to recover gracefully by catching:                                                              // 22
      userId = Meteor.userId && Meteor.userId();                                                                 // 23
    } catch (e) {}                                                                                               // 24
                                                                                                                 // 25
    if (!userId) {                                                                                               // 26
        userId = currentUserId;                                                                                  // 27
    }                                                                                                            // 28
  }                                                                                                              // 29
                                                                                                                 // 30
  return userId;                                                                                                 // 31
}                                                                                                                // 32
                                                                                                                 // 33
CollectionHooks = {};                                                                                            // 34
                                                                                                                 // 35
CollectionHooks.extendCollectionInstance = function (self) {                                                     // 36
  // Offer a public API to allow the user to define aspects                                                      // 37
  // Example: collection.before.insert(func);                                                                    // 38
  _.each(["before", "after"], function (pointcut) {                                                              // 39
    _.each(advices, function (advice, method) {                                                                  // 40
      Meteor._ensure(self, pointcut, method);                                                                    // 41
      Meteor._ensure(self, "_aspects", method);                                                                  // 42
                                                                                                                 // 43
      self._aspects[method][pointcut] = [];                                                                      // 44
      self[pointcut][method] = function (aspect) {                                                               // 45
        var len = self._aspects[method][pointcut].push(aspect);                                                  // 46
        return {                                                                                                 // 47
          replace: function (aspect) {                                                                           // 48
            self._aspects[method][pointcut].splice(len - 1, 1, aspect);                                          // 49
          },                                                                                                     // 50
          remove: function () {                                                                                  // 51
            self._aspects[method][pointcut].splice(len - 1, 1);                                                  // 52
          }                                                                                                      // 53
        };                                                                                                       // 54
      };                                                                                                         // 55
    });                                                                                                          // 56
  });                                                                                                            // 57
                                                                                                                 // 58
  // Wrap mutator methods, letting the defined advice do the work                                                // 59
  _.each(advices, function (advice, method) {                                                                    // 60
    var _super = Meteor.isClient ? self[method] : self._collection[method];                                      // 61
                                                                                                                 // 62
    (Meteor.isClient ? self : self._collection)[method] = function () {                                          // 63
      return advice.call(this,                                                                                   // 64
        getUserId(),                                                                                             // 65
        _super,                                                                                                  // 66
        self._aspects[method] || {},                                                                             // 67
        function (doc) {                                                                                         // 68
          return  _.isFunction(self._transform)                                                                  // 69
                  ? function (d) { return self._transform(d || doc); }                                           // 70
                  : function (d) { return d || doc; };                                                           // 71
        },                                                                                                       // 72
        _.toArray(arguments)                                                                                     // 73
      );                                                                                                         // 74
    };                                                                                                           // 75
  });                                                                                                            // 76
};                                                                                                               // 77
                                                                                                                 // 78
CollectionHooks.defineAdvice = function (method, advice) {                                                       // 79
  advices[method] = advice;                                                                                      // 80
};                                                                                                               // 81
                                                                                                                 // 82
CollectionHooks.getDocs = function (collection, selector, options) {                                             // 83
  var self = this;                                                                                               // 84
                                                                                                                 // 85
  var findOptions = {transform: null, reactive: false}; // added reactive: false                                 // 86
                                                                                                                 // 87
  /*                                                                                                             // 88
  // No "fetch" support at this time.                                                                            // 89
  if (!self._validators.fetchAllFields) {                                                                        // 90
    findOptions.fields = {};                                                                                     // 91
    _.each(self._validators.fetch, function(fieldName) {                                                         // 92
      findOptions.fields[fieldName] = 1;                                                                         // 93
    });                                                                                                          // 94
  }                                                                                                              // 95
  */                                                                                                             // 96
                                                                                                                 // 97
  // Bit of a magic condition here... only "update" passes options, so this is                                   // 98
  // only relevant to when update calls getDocs:                                                                 // 99
  if (options) {                                                                                                 // 100
    // This was added because in our case, we are potentially iterating over                                     // 101
    // multiple docs. If multi isn't enabled, force a limit (almost like                                         // 102
    // findOne), as the default for update without multi enabled is to affect                                    // 103
    // only the first matched document:                                                                          // 104
    if (!options.multi) {                                                                                        // 105
      findOptions.limit = 1;                                                                                     // 106
    }                                                                                                            // 107
  }                                                                                                              // 108
                                                                                                                 // 109
  // Unlike validators, we iterate over multiple docs, so use                                                    // 110
  // find instead of findOne:                                                                                    // 111
  return collection.find(selector, findOptions);                                                                 // 112
};                                                                                                               // 113
                                                                                                                 // 114
Meteor.Collection = function () {                                                                                // 115
  var ret = constructor.apply(this, arguments);                                                                  // 116
  CollectionHooks.extendCollectionInstance(this);                                                                // 117
  return ret;                                                                                                    // 118
};                                                                                                               // 119
                                                                                                                 // 120
Meteor.Collection.prototype = Object.create(constructor.prototype);                                              // 121
                                                                                                                 // 122
for (var func in constructor) {                                                                                  // 123
  if (constructor.hasOwnProperty(func)) {                                                                        // 124
    Meteor.Collection[func] = constructor[func];                                                                 // 125
  }                                                                                                              // 126
}                                                                                                                // 127
                                                                                                                 // 128
if (Meteor.isServer) {                                                                                           // 129
  var _publish = Meteor.publish;                                                                                 // 130
  Meteor.publish = function (name, func) {                                                                       // 131
    return _publish.call(this, name, function () {                                                               // 132
      currentUserId = this && this.userId;                                                                       // 133
      var ret = func.apply(this, arguments);                                                                     // 134
      currentUserId = undefined;                                                                                 // 135
      return ret;                                                                                                // 136
    });                                                                                                          // 137
  };                                                                                                             // 138
}                                                                                                                // 139
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                               //
// packages/collection-hooks/insert.js                                                                           //
//                                                                                                               //
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                 //
CollectionHooks.defineAdvice("insert", function (userId, _super, aspects, getTransform, args) {                  // 1
  var self = this;                                                                                               // 2
  var ctx = {context: self, _super: _super, args: args};                                                         // 3
  var async = _.isFunction(_.last(args));                                                                        // 4
  var abort, ret;                                                                                                // 5
                                                                                                                 // 6
  // args[0] : doc                                                                                               // 7
  // args[1] : callback                                                                                          // 8
                                                                                                                 // 9
  // before                                                                                                      // 10
  _.each(aspects.before, function (aspect) {                                                                     // 11
    var r = aspect.call(_.extend({transform: getTransform(args[0])}, ctx), userId, args[0]);                     // 12
    if (r === false) abort = true;                                                                               // 13
  });                                                                                                            // 14
                                                                                                                 // 15
  if (abort) return false;                                                                                       // 16
                                                                                                                 // 17
  function after(id, err) {                                                                                      // 18
    var doc = args[0];                                                                                           // 19
    if (id) {                                                                                                    // 20
      doc = EJSON.clone(args[0]);                                                                                // 21
      doc._id = id;                                                                                              // 22
    }                                                                                                            // 23
    var lctx = _.extend({transform: getTransform(doc), _id: id, err: err}, ctx);                                 // 24
    _.each(aspects.after, function (aspect) {                                                                    // 25
      aspect.call(lctx, userId, doc);                                                                            // 26
    });                                                                                                          // 27
    return id;                                                                                                   // 28
  }                                                                                                              // 29
                                                                                                                 // 30
  if (async) {                                                                                                   // 31
    return _super.call(self, args[0], function (err, obj) {                                                      // 32
      after(obj && obj[0] && obj[0]._id || obj, err);                                                            // 33
      return args[1].apply(this, arguments);                                                                     // 34
    });                                                                                                          // 35
  } else {                                                                                                       // 36
    ret = _super.apply(self, args);                                                                              // 37
    return after(ret && ret[0] && ret[0]._id || ret);                                                            // 38
  }                                                                                                              // 39
});                                                                                                              // 40
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                               //
// packages/collection-hooks/update.js                                                                           //
//                                                                                                               //
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                 //
CollectionHooks.defineAdvice("update", function (userId, _super, aspects, getTransform, args) {                  // 1
  var self = this;                                                                                               // 2
  var ctx = {context: self, _super: _super, args: args};                                                         // 3
  var async = _.isFunction(_.last(args));                                                                        // 4
  var docs, fields, abort, prev = {};                                                                            // 5
  var collection = _.has(self, "_collection") ? self._collection : self;                                         // 6
                                                                                                                 // 7
  // args[0] : selector                                                                                          // 8
  // args[1] : mutator                                                                                           // 9
  // args[2] : options (optional)                                                                                // 10
  // args[3] : callback                                                                                          // 11
                                                                                                                 // 12
  if (_.isFunction(args[2])) {                                                                                   // 13
    args[3] = args[2];                                                                                           // 14
    args[2] = {};                                                                                                // 15
  }                                                                                                              // 16
                                                                                                                 // 17
  fields = getFields(args[1]);                                                                                   // 18
  docs = CollectionHooks.getDocs.call(self, collection, args[0], args[2]).fetch();                               // 19
                                                                                                                 // 20
  // copy originals for convenience for the "after" pointcut                                                     // 21
  if (aspects.after) {                                                                                           // 22
    prev.mutator = EJSON.clone(args[1]);                                                                         // 23
    prev.options = EJSON.clone(args[2]);                                                                         // 24
    prev.docs = {};                                                                                              // 25
    _.each(docs, function (doc) {                                                                                // 26
      prev.docs[doc._id] = EJSON.clone(doc);                                                                     // 27
    });                                                                                                          // 28
  }                                                                                                              // 29
                                                                                                                 // 30
  // before                                                                                                      // 31
  _.each(aspects.before, function (aspect) {                                                                     // 32
    _.each(docs, function (doc) {                                                                                // 33
      var r = aspect.call(_.extend({transform: getTransform(doc)}, ctx), userId, doc, fields, args[1], args[2]); // 34
      if (r === false) abort = true;                                                                             // 35
    });                                                                                                          // 36
  });                                                                                                            // 37
                                                                                                                 // 38
  if (abort) return false;                                                                                       // 39
                                                                                                                 // 40
  function after(affected, err) {                                                                                // 41
    var fields = getFields(args[1]);                                                                             // 42
    var docs = CollectionHooks.getDocs.call(self, collection, args[0], args[2]).fetch();                         // 43
                                                                                                                 // 44
    _.each(aspects.after, function (aspect) {                                                                    // 45
      _.each(docs, function (doc) {                                                                              // 46
        aspect.call(_.extend({                                                                                   // 47
          transform: getTransform(doc),                                                                          // 48
          previous: prev.docs[doc._id],                                                                          // 49
          affected: affected,                                                                                    // 50
          err: err                                                                                               // 51
        }, ctx), userId, doc, fields, prev.mutator, prev.options);                                               // 52
      });                                                                                                        // 53
    });                                                                                                          // 54
  }                                                                                                              // 55
                                                                                                                 // 56
  if (async) {                                                                                                   // 57
    return _super.call(self, args[0], args[1], args[2], function (err, affected) {                               // 58
      after(affected, err);                                                                                      // 59
      return args[3].apply(this, arguments);                                                                     // 60
    });                                                                                                          // 61
  } else {                                                                                                       // 62
    var affected = _super.apply(self, args);                                                                     // 63
    after(affected);                                                                                             // 64
    return affected;                                                                                             // 65
  }                                                                                                              // 66
});                                                                                                              // 67
                                                                                                                 // 68
// This function contains a snippet of code pulled and modified from:                                            // 69
// ~/.meteor/packages/mongo-livedata/collection.js:632-668                                                       // 70
// It's contained in these utility functions to make updates easier for us in                                    // 71
// case this code changes.                                                                                       // 72
var getFields = function (mutator) {                                                                             // 73
  // compute modified fields                                                                                     // 74
  var fields = [];                                                                                               // 75
  _.each(mutator, function (params, op) {                                                                        // 76
    _.each(_.keys(params), function (field) {                                                                    // 77
      // treat dotted fields as if they are replacing their                                                      // 78
      // top-level part                                                                                          // 79
      if (field.indexOf('.') !== -1)                                                                             // 80
        field = field.substring(0, field.indexOf('.'));                                                          // 81
                                                                                                                 // 82
      // record the field we are trying to change                                                                // 83
      if (!_.contains(fields, field))                                                                            // 84
        fields.push(field);                                                                                      // 85
    });                                                                                                          // 86
  });                                                                                                            // 87
                                                                                                                 // 88
  return fields;                                                                                                 // 89
};                                                                                                               // 90
                                                                                                                 // 91
// This function contains a snippet of code pulled and modified from:                                            // 92
// ~/.meteor/packages/mongo-livedata/collection.js                                                               // 93
// It's contained in these utility functions to make updates easier for us in                                    // 94
// case this code changes.                                                                                       // 95
var getFields = function (mutator) {                                                                             // 96
  // compute modified fields                                                                                     // 97
  var fields = [];                                                                                               // 98
                                                                                                                 // 99
  _.each(mutator, function (params, op) {                                                                        // 100
    //====ADDED START=======================                                                                     // 101
    if (_.contains(["$set", "$unset", "$inc", "$push", "$pull", "$pop", "$rename", "$pullAll", "$addToSet", "$bit"], op)) {
    //====ADDED END=========================                                                                     // 103
      _.each(_.keys(params), function (field) {                                                                  // 104
        // treat dotted fields as if they are replacing their                                                    // 105
        // top-level part                                                                                        // 106
        if (field.indexOf('.') !== -1)                                                                           // 107
          field = field.substring(0, field.indexOf('.'));                                                        // 108
                                                                                                                 // 109
        // record the field we are trying to change                                                              // 110
        if (!_.contains(fields, field))                                                                          // 111
          fields.push(field);                                                                                    // 112
      });                                                                                                        // 113
    //====ADDED START=======================                                                                     // 114
    } else {                                                                                                     // 115
      fields.push(op);                                                                                           // 116
    }                                                                                                            // 117
    //====ADDED END=========================                                                                     // 118
  });                                                                                                            // 119
                                                                                                                 // 120
  return fields;                                                                                                 // 121
};                                                                                                               // 122
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                               //
// packages/collection-hooks/remove.js                                                                           //
//                                                                                                               //
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                 //
CollectionHooks.defineAdvice("remove", function (userId, _super, aspects, getTransform, args) {                  // 1
  var self = this;                                                                                               // 2
  var ctx = {context: self, _super: _super, args: args};                                                         // 3
  var async = _.isFunction(_.last(args));                                                                        // 4
  var docs, abort, prev = [];                                                                                    // 5
  var collection = _.has(self, "_collection") ? self._collection : self;                                         // 6
                                                                                                                 // 7
  // args[0] : selector                                                                                          // 8
  // args[1] : callback                                                                                          // 9
                                                                                                                 // 10
  var docs = CollectionHooks.getDocs.call(self, collection, args[0]).fetch();                                    // 11
                                                                                                                 // 12
  // copy originals for convenience for the "after" pointcut                                                     // 13
  if (aspects.after) {                                                                                           // 14
    _.each(docs, function (doc) {                                                                                // 15
      prev.push(EJSON.clone(doc));                                                                               // 16
    });                                                                                                          // 17
  }                                                                                                              // 18
                                                                                                                 // 19
  // before                                                                                                      // 20
  _.each(aspects.before, function (aspect) {                                                                     // 21
    _.each(docs, function (doc) {                                                                                // 22
      var r = aspect.call(_.extend({transform: getTransform(doc)}, ctx), userId, doc);                           // 23
      if (r === false) abort = true;                                                                             // 24
    });                                                                                                          // 25
  });                                                                                                            // 26
                                                                                                                 // 27
  if (abort) return false;                                                                                       // 28
                                                                                                                 // 29
  function after(err) {                                                                                          // 30
    _.each(aspects.after, function (aspect) {                                                                    // 31
      _.each(prev, function (doc) {                                                                              // 32
        aspect.call(_.extend({transform: getTransform(doc), err: err}, ctx), userId, doc);                       // 33
      });                                                                                                        // 34
    });                                                                                                          // 35
  }                                                                                                              // 36
                                                                                                                 // 37
  if (async) {                                                                                                   // 38
    return _super.call(self, args[0], function (err) {                                                           // 39
      after(err);                                                                                                // 40
      return args[1].apply(this, arguments);                                                                     // 41
    });                                                                                                          // 42
  } else {                                                                                                       // 43
    var result = _super.apply(self, args);                                                                       // 44
    after();                                                                                                     // 45
    return result;                                                                                               // 46
  }                                                                                                              // 47
});                                                                                                              // 48
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                               //
// packages/collection-hooks/find.js                                                                             //
//                                                                                                               //
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                 //
CollectionHooks.defineAdvice("find", function (userId, _super, aspects, getTransform, args) {                    // 1
  var self = this;                                                                                               // 2
  var ctx = {context: self, _super: _super, args: args};                                                         // 3
  var ret, abort;                                                                                                // 4
                                                                                                                 // 5
  // args[0] : selector                                                                                          // 6
  // args[1] : options                                                                                           // 7
                                                                                                                 // 8
  // before                                                                                                      // 9
  _.each(aspects.before, function (aspect) {                                                                     // 10
    var r = aspect.call(ctx, userId, args[0], args[1]);                                                          // 11
    if (r === false) abort = true;                                                                               // 12
  });                                                                                                            // 13
                                                                                                                 // 14
  if (abort) return false;                                                                                       // 15
                                                                                                                 // 16
  function after(cursor) {                                                                                       // 17
    _.each(aspects.after, function (aspect) {                                                                    // 18
      aspect.call(ctx, userId, args[0], args[1], cursor);                                                        // 19
    });                                                                                                          // 20
  }                                                                                                              // 21
                                                                                                                 // 22
  ret = _super.apply(self, args);                                                                                // 23
  after(ret);                                                                                                    // 24
                                                                                                                 // 25
  return ret;                                                                                                    // 26
});                                                                                                              // 27
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                               //
// packages/collection-hooks/findone.js                                                                          //
//                                                                                                               //
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                 //
CollectionHooks.defineAdvice("findOne", function (userId, _super, aspects, getTransform, args) {                 // 1
  var self = this;                                                                                               // 2
  var ctx = {context: self, _super: _super, args: args};                                                         // 3
  var ret, abort;                                                                                                // 4
                                                                                                                 // 5
  // args[0] : selector                                                                                          // 6
  // args[1] : options                                                                                           // 7
                                                                                                                 // 8
  // before                                                                                                      // 9
  _.each(aspects.before, function (aspect) {                                                                     // 10
    var r = aspect.call(ctx, userId, args[0], args[1]);                                                          // 11
    if (r === false) abort = true;                                                                               // 12
  });                                                                                                            // 13
                                                                                                                 // 14
  if (abort) return false;                                                                                       // 15
                                                                                                                 // 16
  function after(doc) {                                                                                          // 17
    _.each(aspects.after, function (aspect) {                                                                    // 18
      aspect.call(ctx, userId, args[0], args[1], doc);                                                           // 19
    });                                                                                                          // 20
  }                                                                                                              // 21
                                                                                                                 // 22
  ret = _super.apply(self, args);                                                                                // 23
  after(ret);                                                                                                    // 24
                                                                                                                 // 25
  return ret;                                                                                                    // 26
});                                                                                                              // 27
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                               //
// packages/collection-hooks/users-compat.js                                                                     //
//                                                                                                               //
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                 //
if (Meteor.users) {                                                                                              // 1
  CollectionHooks.extendCollectionInstance(Meteor.users);                                                        // 2
}                                                                                                                // 3
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);


/* Exports */
if (typeof Package === 'undefined') Package = {};
Package['collection-hooks'] = {
  CollectionHooks: CollectionHooks
};

})();
