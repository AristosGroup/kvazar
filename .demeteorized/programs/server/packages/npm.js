(function () {

/* Imports */
var Meteor = Package.meteor.Meteor;

/* Package-scope variables */
var Async, response;

(function () {

////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                    //
// packages/npm/index.js                                                                              //
//                                                                                                    //
////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                      //
var Future = Npm.require('fibers/future');                                                            // 1
Async = {};                                                                                           // 2
                                                                                                      // 3
Meteor.require = function(moduleName) {                                                               // 4
  var module = Npm.require(moduleName);                                                               // 5
  return module;                                                                                      // 6
};                                                                                                    // 7
                                                                                                      // 8
Async.runSync = Meteor.sync = function(asynFunction) {                                                // 9
  var future = new Future();                                                                          // 10
  var sent = false;                                                                                   // 11
  var payload;                                                                                        // 12
                                                                                                      // 13
  var wrappedAsyncFunction = Meteor.bindEnvironment(asynFunction, function(err) {                     // 14
    console.error('Error inside the Async.runSync: ' + err.message);                                  // 15
    returnFuture(err);                                                                                // 16
  });                                                                                                 // 17
                                                                                                      // 18
  setTimeout(function() {                                                                             // 19
    wrappedAsyncFunction(returnFuture);                                                               // 20
  }, 0);                                                                                              // 21
                                                                                                      // 22
  future.wait();                                                                                      // 23
  sent = true;                                                                                        // 24
                                                                                                      // 25
  function returnFuture(error, result) {                                                              // 26
    if(!sent) {                                                                                       // 27
      payload = { result: result, error: error};                                                      // 28
      future.return();                                                                                // 29
    }                                                                                                 // 30
  }                                                                                                   // 31
                                                                                                      // 32
  return payload;                                                                                     // 33
};                                                                                                    // 34
                                                                                                      // 35
Async.wrap = function(arg1, arg2) {                                                                   // 36
  if(typeof arg1 == 'function') {                                                                     // 37
    var func = arg1;                                                                                  // 38
    return wrapFunction(func);                                                                        // 39
  } else if(typeof arg1 == 'object' && typeof arg2 == 'string') {                                     // 40
    var obj = arg1;                                                                                   // 41
    var funcName = arg2;                                                                              // 42
    return wrapObject(obj, [funcName])[funcName];                                                     // 43
  } else if(typeof arg1 == 'object' &&  arg2 instanceof Array) {                                      // 44
    var obj = arg1;                                                                                   // 45
    var funcNameList = arg2;                                                                          // 46
    return wrapObject(obj, funcNameList);                                                             // 47
  } else {                                                                                            // 48
    throw new Error('unsupported argument list');                                                     // 49
  }                                                                                                   // 50
                                                                                                      // 51
  function wrapObject(obj, funcNameList) {                                                            // 52
    var returnObj = {};                                                                               // 53
    funcNameList.forEach(function(funcName) {                                                         // 54
      if(obj[funcName]) {                                                                             // 55
        var func = obj[funcName].bind(obj);                                                           // 56
        returnObj[funcName] = wrapFunction(func);                                                     // 57
      } else {                                                                                        // 58
        throw new Error('instance method not exists: ' + funcName);                                   // 59
      }                                                                                               // 60
    });                                                                                               // 61
    return returnObj;                                                                                 // 62
  }                                                                                                   // 63
                                                                                                      // 64
  function wrapFunction(func) {                                                                       // 65
    return function() {                                                                               // 66
      var args = arguments;                                                                           // 67
      response = Meteor.sync(function(done) {                                                         // 68
        Array.prototype.push.call(args, done);                                                        // 69
        func.apply(null, args);                                                                       // 70
      });                                                                                             // 71
                                                                                                      // 72
      if(response.error) {                                                                            // 73
        //we need to wrap a new error here something throw error object comes with response does not  // 74
        //print the correct error to the console, if there is not try catch block                     // 75
        var error = new Error(response.error.message);                                                // 76
        for(var key in response.error) {                                                              // 77
          if(error[key] === undefined) {                                                              // 78
            error[key] = response.error[key];                                                         // 79
          }                                                                                           // 80
        }                                                                                             // 81
        throw error;                                                                                  // 82
      } else {                                                                                        // 83
        return response.result;                                                                       // 84
      }                                                                                               // 85
    };                                                                                                // 86
  }                                                                                                   // 87
};                                                                                                    // 88
////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);


/* Exports */
if (typeof Package === 'undefined') Package = {};
Package.npm = {
  Async: Async
};

})();
