(function () {

/* Imports */
var Meteor = Package.meteor.Meteor;
var _ = Package.underscore._;

/* Package-scope variables */
var HTTP, makeErrorByStatus, encodeParams, encodeString, buildUrl, populateData;

(function () {

/////////////////////////////////////////////////////////////////////////////////////
//                                                                                 //
// packages/http/httpcall_common.js                                                //
//                                                                                 //
/////////////////////////////////////////////////////////////////////////////////////
                                                                                   //
makeErrorByStatus = function(statusCode, content) {                                // 1
  var MAX_LENGTH = 160; // if you change this, also change the appropriate test    // 2
                                                                                   // 3
  var truncate = function(str, length) {                                           // 4
    return str.length > length ? str.slice(0, length) + '...' : str;               // 5
  };                                                                               // 6
                                                                                   // 7
  var message = "failed [" + statusCode + "]";                                     // 8
  if (content)                                                                     // 9
    message += " " + truncate(content.replace(/\n/g, " "), MAX_LENGTH);            // 10
                                                                                   // 11
  return new Error(message);                                                       // 12
};                                                                                 // 13
                                                                                   // 14
encodeParams = function(params) {                                                  // 15
  var buf = [];                                                                    // 16
  _.each(params, function(value, key) {                                            // 17
    if (buf.length)                                                                // 18
      buf.push('&');                                                               // 19
    buf.push(encodeString(key), '=', encodeString(value));                         // 20
  });                                                                              // 21
  return buf.join('').replace(/%20/g, '+');                                        // 22
};                                                                                 // 23
                                                                                   // 24
encodeString = function(str) {                                                     // 25
  return encodeURIComponent(str).replace(/[!'()]/g, escape).replace(/\*/g, "%2A"); // 26
};                                                                                 // 27
                                                                                   // 28
buildUrl = function(before_qmark, from_qmark, opt_query, opt_params) {             // 29
  var url_without_query = before_qmark;                                            // 30
  var query = from_qmark ? from_qmark.slice(1) : null;                             // 31
                                                                                   // 32
  if (typeof opt_query === "string")                                               // 33
    query = String(opt_query);                                                     // 34
                                                                                   // 35
  if (opt_params) {                                                                // 36
    query = query || "";                                                           // 37
    var prms = encodeParams(opt_params);                                           // 38
    if (query && prms)                                                             // 39
      query += '&';                                                                // 40
    query += prms;                                                                 // 41
  }                                                                                // 42
                                                                                   // 43
  var url = url_without_query;                                                     // 44
  if (query !== null)                                                              // 45
    url += ("?"+query);                                                            // 46
                                                                                   // 47
  return url;                                                                      // 48
};                                                                                 // 49
                                                                                   // 50
// Fill in `response.data` if the content-type is JSON.                            // 51
populateData = function(response) {                                                // 52
  // Read Content-Type header, up to a ';' if there is one.                        // 53
  // A typical header might be "application/json; charset=utf-8"                   // 54
  // or just "application/json".                                                   // 55
  var contentType = (response.headers['content-type'] || ';').split(';')[0];       // 56
                                                                                   // 57
  // Only try to parse data as JSON if server sets correct content type.           // 58
  if (_.include(['application/json', 'text/javascript'], contentType)) {           // 59
    try {                                                                          // 60
      response.data = JSON.parse(response.content);                                // 61
    } catch (err) {                                                                // 62
      response.data = null;                                                        // 63
    }                                                                              // 64
  } else {                                                                         // 65
    response.data = null;                                                          // 66
  }                                                                                // 67
};                                                                                 // 68
                                                                                   // 69
HTTP = {};                                                                         // 70
                                                                                   // 71
HTTP.get = function (/* varargs */) {                                              // 72
  return HTTP.call.apply(this, ["GET"].concat(_.toArray(arguments)));              // 73
};                                                                                 // 74
                                                                                   // 75
HTTP.post = function (/* varargs */) {                                             // 76
  return HTTP.call.apply(this, ["POST"].concat(_.toArray(arguments)));             // 77
};                                                                                 // 78
                                                                                   // 79
HTTP.put = function (/* varargs */) {                                              // 80
  return HTTP.call.apply(this, ["PUT"].concat(_.toArray(arguments)));              // 81
};                                                                                 // 82
                                                                                   // 83
HTTP.del = function (/* varargs */) {                                              // 84
  return HTTP.call.apply(this, ["DELETE"].concat(_.toArray(arguments)));           // 85
};                                                                                 // 86
                                                                                   // 87
/////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

/////////////////////////////////////////////////////////////////////////////////////
//                                                                                 //
// packages/http/httpcall_server.js                                                //
//                                                                                 //
/////////////////////////////////////////////////////////////////////////////////////
                                                                                   //
var path = Npm.require('path');                                                    // 1
var request = Npm.require('request');                                              // 2
var url_util = Npm.require('url');                                                 // 3
                                                                                   // 4
// _call always runs asynchronously; HTTP.call, defined below,                     // 5
// wraps _call and runs synchronously when no callback is provided.                // 6
var _call = function(method, url, options, callback) {                             // 7
                                                                                   // 8
  ////////// Process arguments //////////                                          // 9
                                                                                   // 10
  if (! callback && typeof options === "function") {                               // 11
    // support (method, url, callback) argument list                               // 12
    callback = options;                                                            // 13
    options = null;                                                                // 14
  }                                                                                // 15
                                                                                   // 16
  options = options || {};                                                         // 17
                                                                                   // 18
  method = (method || "").toUpperCase();                                           // 19
                                                                                   // 20
  if (! /^https?:\/\//.test(url))                                                  // 21
    throw new Error("url must be absolute and start with http:// or https://");    // 22
                                                                                   // 23
  var url_parts = url_util.parse(url);                                             // 24
                                                                                   // 25
  var headers = {};                                                                // 26
                                                                                   // 27
  var content = options.content;                                                   // 28
  if (options.data) {                                                              // 29
    content = JSON.stringify(options.data);                                        // 30
    headers['Content-Type'] = 'application/json';                                  // 31
  }                                                                                // 32
                                                                                   // 33
                                                                                   // 34
  var params_for_url, params_for_body;                                             // 35
  if (content || method === "GET" || method === "HEAD")                            // 36
    params_for_url = options.params;                                               // 37
  else                                                                             // 38
    params_for_body = options.params;                                              // 39
                                                                                   // 40
  var new_url = buildUrl(                                                          // 41
    url_parts.protocol + "//" + url_parts.host + url_parts.pathname,               // 42
    url_parts.search, options.query, params_for_url);                              // 43
                                                                                   // 44
  if (options.auth) {                                                              // 45
    if (options.auth.indexOf(':') < 0)                                             // 46
      throw new Error('auth option should be of the form "username:password"');    // 47
    headers['Authorization'] = "Basic "+                                           // 48
      (new Buffer(options.auth, "ascii")).toString("base64");                      // 49
  }                                                                                // 50
                                                                                   // 51
  if (params_for_body) {                                                           // 52
    content = encodeParams(params_for_body);                                       // 53
    headers['Content-Type'] = "application/x-www-form-urlencoded";                 // 54
  }                                                                                // 55
                                                                                   // 56
  _.extend(headers, options.headers || {});                                        // 57
                                                                                   // 58
  // wrap callback to add a 'response' property on an error, in case               // 59
  // we have both (http 4xx/5xx error, which has a response payload)               // 60
  callback = (function(callback) {                                                 // 61
    return function(error, response) {                                             // 62
      if (error && response)                                                       // 63
        error.response = response;                                                 // 64
      callback(error, response);                                                   // 65
    };                                                                             // 66
  })(callback);                                                                    // 67
                                                                                   // 68
  // safety belt: only call the callback once.                                     // 69
  callback = _.once(callback);                                                     // 70
                                                                                   // 71
                                                                                   // 72
  ////////// Kickoff! //////////                                                   // 73
                                                                                   // 74
  var req_options = {                                                              // 75
    url: new_url,                                                                  // 76
    method: method,                                                                // 77
    encoding: "utf8",                                                              // 78
    jar: false,                                                                    // 79
    timeout: options.timeout,                                                      // 80
    body: content,                                                                 // 81
    followRedirect: options.followRedirects,                                       // 82
    headers: headers                                                               // 83
  };                                                                               // 84
                                                                                   // 85
  request(req_options, function(error, res, body) {                                // 86
    var response = null;                                                           // 87
                                                                                   // 88
    if (! error) {                                                                 // 89
                                                                                   // 90
      response = {};                                                               // 91
      response.statusCode = res.statusCode;                                        // 92
      response.content = body;                                                     // 93
      response.headers = res.headers;                                              // 94
                                                                                   // 95
      populateData(response);                                                      // 96
                                                                                   // 97
      if (response.statusCode >= 400)                                              // 98
        error = makeErrorByStatus(response.statusCode, response.content);          // 99
    }                                                                              // 100
                                                                                   // 101
    callback(error, response);                                                     // 102
                                                                                   // 103
  });                                                                              // 104
};                                                                                 // 105
                                                                                   // 106
HTTP.call = Meteor._wrapAsync(_call);                                              // 107
                                                                                   // 108
/////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

/////////////////////////////////////////////////////////////////////////////////////
//                                                                                 //
// packages/http/deprecated.js                                                     //
//                                                                                 //
/////////////////////////////////////////////////////////////////////////////////////
                                                                                   //
// The HTTP object used to be called Meteor.http.                                  // 1
// XXX COMPAT WITH 0.6.4                                                           // 2
Meteor.http = HTTP;                                                                // 3
                                                                                   // 4
/////////////////////////////////////////////////////////////////////////////////////

}).call(this);


/* Exports */
if (typeof Package === 'undefined') Package = {};
Package.http = {
  HTTP: HTTP
};

})();
