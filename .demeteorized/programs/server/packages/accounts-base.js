(function () {

/* Imports */
var Meteor = Package.meteor.Meteor;
var _ = Package.underscore._;
var check = Package.check.check;
var Match = Package.check.Match;
var Random = Package.random.Random;
var ServiceConfiguration = Package['service-configuration'].ServiceConfiguration;
var EJSON = Package.ejson.EJSON;
var DDP = Package.livedata.DDP;
var DDPServer = Package.livedata.DDPServer;
var MongoInternals = Package['mongo-livedata'].MongoInternals;

/* Package-scope variables */
var Accounts, EXPIRE_TOKENS_INTERVAL_MS, CONNECTION_CLOSE_DELAY_MS, getTokenLifetimeMs, loginHandlers, maybeStopExpireTokensInterval;

(function () {

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                               //
// packages/accounts-base/accounts_common.js                                                                     //
//                                                                                                               //
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                 //
Accounts = {};                                                                                                   // 1
                                                                                                                 // 2
// Currently this is read directly by packages like accounts-password                                            // 3
// and accounts-ui-unstyled.                                                                                     // 4
Accounts._options = {};                                                                                          // 5
                                                                                                                 // 6
// how long (in days) until a login token expires                                                                // 7
var DEFAULT_LOGIN_EXPIRATION_DAYS = 90;                                                                          // 8
// Clients don't try to auto-login with a token that is going to expire within                                   // 9
// .1 * DEFAULT_LOGIN_EXPIRATION_DAYS, capped at MIN_TOKEN_LIFETIME_CAP_SECS.                                    // 10
// Tries to avoid abrupt disconnects from expiring tokens.                                                       // 11
var MIN_TOKEN_LIFETIME_CAP_SECS = 3600; // one hour                                                              // 12
// how often (in milliseconds) we check for expired tokens                                                       // 13
EXPIRE_TOKENS_INTERVAL_MS = 600 * 1000; // 10 minutes                                                            // 14
// how long we wait before logging out clients when Meteor.logoutOtherClients is                                 // 15
// called                                                                                                        // 16
CONNECTION_CLOSE_DELAY_MS = 10 * 1000;                                                                           // 17
                                                                                                                 // 18
// Set up config for the accounts system. Call this on both the client                                           // 19
// and the server.                                                                                               // 20
//                                                                                                               // 21
// XXX we should add some enforcement that this is called on both the                                            // 22
// client and the server. Otherwise, a user can                                                                  // 23
// 'forbidClientAccountCreation' only on the client and while it looks                                           // 24
// like their app is secure, the server will still accept createUser                                             // 25
// calls. https://github.com/meteor/meteor/issues/828                                                            // 26
//                                                                                                               // 27
// @param options {Object} an object with fields:                                                                // 28
// - sendVerificationEmail {Boolean}                                                                             // 29
//     Send email address verification emails to new users created from                                          // 30
//     client signups.                                                                                           // 31
// - forbidClientAccountCreation {Boolean}                                                                       // 32
//     Do not allow clients to create accounts directly.                                                         // 33
// - restrictCreationByEmailDomain {Function or String}                                                          // 34
//     Require created users to have an email matching the function or                                           // 35
//     having the string as domain.                                                                              // 36
// - loginExpirationInDays {Number}                                                                              // 37
//     Number of days since login until a user is logged out (login token                                        // 38
//     expires).                                                                                                 // 39
//                                                                                                               // 40
Accounts.config = function(options) {                                                                            // 41
  // We don't want users to accidentally only call Accounts.config on the                                        // 42
  // client, where some of the options will have partial effects (eg removing                                    // 43
  // the "create account" button from accounts-ui if forbidClientAccountCreation                                 // 44
  // is set, or redirecting Google login to a specific-domain page) without                                      // 45
  // having their full effects.                                                                                  // 46
  if (Meteor.isServer) {                                                                                         // 47
    __meteor_runtime_config__.accountsConfigCalled = true;                                                       // 48
  } else if (!__meteor_runtime_config__.accountsConfigCalled) {                                                  // 49
    // XXX would be nice to "crash" the client and replace the UI with an error                                  // 50
    // message, but there's no trivial way to do this.                                                           // 51
    Meteor._debug("Accounts.config was called on the client but not on the " +                                   // 52
                  "server; some configuration options may not take effect.");                                    // 53
  }                                                                                                              // 54
                                                                                                                 // 55
  // validate option keys                                                                                        // 56
  var VALID_KEYS = ["sendVerificationEmail", "forbidClientAccountCreation",                                      // 57
                    "restrictCreationByEmailDomain", "loginExpirationInDays"];                                   // 58
  _.each(_.keys(options), function (key) {                                                                       // 59
    if (!_.contains(VALID_KEYS, key)) {                                                                          // 60
      throw new Error("Accounts.config: Invalid key: " + key);                                                   // 61
    }                                                                                                            // 62
  });                                                                                                            // 63
                                                                                                                 // 64
  // set values in Accounts._options                                                                             // 65
  _.each(VALID_KEYS, function (key) {                                                                            // 66
    if (key in options) {                                                                                        // 67
      if (key in Accounts._options) {                                                                            // 68
        throw new Error("Can't set `" + key + "` more than once");                                               // 69
      } else {                                                                                                   // 70
        Accounts._options[key] = options[key];                                                                   // 71
      }                                                                                                          // 72
    }                                                                                                            // 73
  });                                                                                                            // 74
                                                                                                                 // 75
  // If the user set loginExpirationInDays to null, then we need to clear the                                    // 76
  // timer that periodically expires tokens.                                                                     // 77
  if (Meteor.isServer)                                                                                           // 78
    maybeStopExpireTokensInterval();                                                                             // 79
};                                                                                                               // 80
                                                                                                                 // 81
// Users table. Don't use the normal autopublish, since we want to hide                                          // 82
// some fields. Code to autopublish this is in accounts_server.js.                                               // 83
// XXX Allow users to configure this collection name.                                                            // 84
//                                                                                                               // 85
Meteor.users = new Meteor.Collection("users", {_preventAutopublish: true});                                      // 86
// There is an allow call in accounts_server that restricts this                                                 // 87
// collection.                                                                                                   // 88
                                                                                                                 // 89
// loginServiceConfiguration and ConfigError are maintained for backwards compatibility                          // 90
Accounts.loginServiceConfiguration = ServiceConfiguration.configurations;                                        // 91
Accounts.ConfigError = ServiceConfiguration.ConfigError;                                                         // 92
                                                                                                                 // 93
// Thrown when the user cancels the login process (eg, closes an oauth                                           // 94
// popup, declines retina scan, etc)                                                                             // 95
Accounts.LoginCancelledError = function(description) {                                                           // 96
  this.message = description;                                                                                    // 97
};                                                                                                               // 98
                                                                                                                 // 99
// This is used to transmit specific subclass errors over the wire. We should                                    // 100
// come up with a more generic way to do this (eg, with some sort of symbolic                                    // 101
// error code rather than a number).                                                                             // 102
Accounts.LoginCancelledError.numericError = 0x8acdc2f;                                                           // 103
Accounts.LoginCancelledError.prototype = new Error();                                                            // 104
Accounts.LoginCancelledError.prototype.name = 'Accounts.LoginCancelledError';                                    // 105
                                                                                                                 // 106
getTokenLifetimeMs = function () {                                                                               // 107
  return (Accounts._options.loginExpirationInDays ||                                                             // 108
          DEFAULT_LOGIN_EXPIRATION_DAYS) * 24 * 60 * 60 * 1000;                                                  // 109
};                                                                                                               // 110
                                                                                                                 // 111
Accounts._tokenExpiration = function (when) {                                                                    // 112
  // We pass when through the Date constructor for backwards compatibility;                                      // 113
  // `when` used to be a number.                                                                                 // 114
  return new Date((new Date(when)).getTime() + getTokenLifetimeMs());                                            // 115
};                                                                                                               // 116
                                                                                                                 // 117
Accounts._tokenExpiresSoon = function (when) {                                                                   // 118
  var minLifetimeMs = .1 * getTokenLifetimeMs();                                                                 // 119
  var minLifetimeCapMs = MIN_TOKEN_LIFETIME_CAP_SECS * 1000;                                                     // 120
  if (minLifetimeMs > minLifetimeCapMs)                                                                          // 121
    minLifetimeMs = minLifetimeCapMs;                                                                            // 122
  return new Date() > (new Date(when) - minLifetimeMs);                                                          // 123
};                                                                                                               // 124
                                                                                                                 // 125
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                               //
// packages/accounts-base/accounts_server.js                                                                     //
//                                                                                                               //
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                 //
///                                                                                                              // 1
/// CURRENT USER                                                                                                 // 2
///                                                                                                              // 3
                                                                                                                 // 4
Meteor.userId = function () {                                                                                    // 5
  // This function only works if called inside a method. In theory, it                                           // 6
  // could also be called from publish statements, since they also                                               // 7
  // have a userId associated with them. However, given that publish                                             // 8
  // functions aren't reactive, using any of the infomation from                                                 // 9
  // Meteor.user() in a publish function will always use the value                                               // 10
  // from when the function first runs. This is likely not what the                                              // 11
  // user expects. The way to make this work in a publish is to do                                               // 12
  // Meteor.find(this.userId()).observe and recompute when the user                                              // 13
  // record changes.                                                                                             // 14
  var currentInvocation = DDP._CurrentInvocation.get();                                                          // 15
  if (!currentInvocation)                                                                                        // 16
    throw new Error("Meteor.userId can only be invoked in method calls. Use this.userId in publish functions."); // 17
  return currentInvocation.userId;                                                                               // 18
};                                                                                                               // 19
                                                                                                                 // 20
Meteor.user = function () {                                                                                      // 21
  var userId = Meteor.userId();                                                                                  // 22
  if (!userId)                                                                                                   // 23
    return null;                                                                                                 // 24
  return Meteor.users.findOne(userId);                                                                           // 25
};                                                                                                               // 26
                                                                                                                 // 27
///                                                                                                              // 28
/// LOGIN HANDLERS                                                                                               // 29
///                                                                                                              // 30
                                                                                                                 // 31
// The main entry point for auth packages to hook in to login.                                                   // 32
//                                                                                                               // 33
// @param handler {Function} A function that receives an options object                                          // 34
// (as passed as an argument to the `login` method) and returns one of:                                          // 35
// - `undefined`, meaning don't handle;                                                                          // 36
// - {id: userId, token: *, tokenExpires: *}, if the user logged in                                              // 37
//   successfully. tokenExpires is optional and intends to provide a hint to the                                 // 38
//   client as to when the token will expire. If not provided, the client will                                   // 39
//   call Accounts._tokenExpiration, passing it the date that it received the                                    // 40
//   token.                                                                                                      // 41
// - throw an error, if the user failed to log in.                                                               // 42
//                                                                                                               // 43
Accounts.registerLoginHandler = function(handler) {                                                              // 44
  loginHandlers.push(handler);                                                                                   // 45
};                                                                                                               // 46
                                                                                                                 // 47
// list of all registered handlers.                                                                              // 48
loginHandlers = [];                                                                                              // 49
                                                                                                                 // 50
                                                                                                                 // 51
// Try all of the registered login handlers until one of them doesn'                                             // 52
// return `undefined`, meaning it handled this call to `login`. Return                                           // 53
// that return value, which ought to be a {id/token} pair.                                                       // 54
var tryAllLoginHandlers = function (options) {                                                                   // 55
  for (var i = 0; i < loginHandlers.length; ++i) {                                                               // 56
    var handler = loginHandlers[i];                                                                              // 57
    var result = handler(options);                                                                               // 58
    if (result !== undefined)                                                                                    // 59
      return result;                                                                                             // 60
  }                                                                                                              // 61
                                                                                                                 // 62
  throw new Meteor.Error(400, "Unrecognized options for login request");                                         // 63
};                                                                                                               // 64
                                                                                                                 // 65
                                                                                                                 // 66
// Actual methods for login and logout. This is the entry point for                                              // 67
// clients to actually log in.                                                                                   // 68
Meteor.methods({                                                                                                 // 69
  // @returns {Object|null}                                                                                      // 70
  //   If successful, returns {token: reconnectToken, id: userId}                                                // 71
  //   If unsuccessful (for example, if the user closed the oauth login popup),                                  // 72
  //     returns null                                                                                            // 73
  login: function(options) {                                                                                     // 74
    // Login handlers should really also check whatever field they look at in                                    // 75
    // options, but we don't enforce it.                                                                         // 76
    check(options, Object);                                                                                      // 77
    var result = tryAllLoginHandlers(options);                                                                   // 78
    if (result !== null) {                                                                                       // 79
      this.setUserId(result.id);                                                                                 // 80
      Accounts._setLoginToken(this.connection.id, result.token);                                                 // 81
    }                                                                                                            // 82
    return result;                                                                                               // 83
  },                                                                                                             // 84
                                                                                                                 // 85
  logout: function() {                                                                                           // 86
    var token = Accounts._getLoginToken(this.connection.id);                                                     // 87
    Accounts._setLoginToken(this.connection.id, null);                                                           // 88
    if (token && this.userId)                                                                                    // 89
      removeLoginToken(this.userId, token);                                                                      // 90
    this.setUserId(null);                                                                                        // 91
  },                                                                                                             // 92
                                                                                                                 // 93
  // Delete all the current user's tokens and close all open connections logged                                  // 94
  // in as this user. Returns a fresh new login token that this client can                                       // 95
  // use. Tests set Accounts._noConnectionCloseDelayForTest to delete tokens                                     // 96
  // immediately instead of using a delay.                                                                       // 97
  //                                                                                                             // 98
  // @returns {Object} Object with token and tokenExpires keys.                                                  // 99
  logoutOtherClients: function () {                                                                              // 100
    var self = this;                                                                                             // 101
    var user = Meteor.users.findOne(self.userId, {                                                               // 102
      fields: {                                                                                                  // 103
        "services.resume.loginTokens": true                                                                      // 104
      }                                                                                                          // 105
    });                                                                                                          // 106
    if (user) {                                                                                                  // 107
      // Save the current tokens in the database to be deleted in                                                // 108
      // CONNECTION_CLOSE_DELAY_MS ms. This gives other connections in the                                       // 109
      // caller's browser time to find the fresh token in localStorage. We save                                  // 110
      // the tokens in the database in case we crash before actually deleting                                    // 111
      // them.                                                                                                   // 112
      var tokens = user.services.resume.loginTokens;                                                             // 113
      var newToken = Accounts._generateStampedLoginToken();                                                      // 114
      var userId = self.userId;                                                                                  // 115
      Meteor.users.update(self.userId, {                                                                         // 116
        $set: {                                                                                                  // 117
          "services.resume.loginTokensToDelete": tokens,                                                         // 118
          "services.resume.haveLoginTokensToDelete": true                                                        // 119
        },                                                                                                       // 120
        $push: { "services.resume.loginTokens": newToken }                                                       // 121
      });                                                                                                        // 122
      Meteor.setTimeout(function () {                                                                            // 123
        // The observe on Meteor.users will take care of closing the connections                                 // 124
        // associated with `tokens`.                                                                             // 125
        deleteSavedTokens(userId, tokens);                                                                       // 126
      }, Accounts._noConnectionCloseDelayForTest ? 0 :                                                           // 127
                        CONNECTION_CLOSE_DELAY_MS);                                                              // 128
      // We do not set the login token on this connection, but instead the                                       // 129
      // observe closes the connection and the client will reconnect with the                                    // 130
      // new token.                                                                                              // 131
      return {                                                                                                   // 132
        token: newToken.token,                                                                                   // 133
        tokenExpires: Accounts._tokenExpiration(newToken.when)                                                   // 134
      };                                                                                                         // 135
    } else {                                                                                                     // 136
      throw new Error("You are not logged in.");                                                                 // 137
    }                                                                                                            // 138
  }                                                                                                              // 139
});                                                                                                              // 140
                                                                                                                 // 141
///                                                                                                              // 142
/// ACCOUNT DATA                                                                                                 // 143
///                                                                                                              // 144
                                                                                                                 // 145
// connectionId -> {connection, loginToken, srpChallenge}                                                        // 146
var accountData = {};                                                                                            // 147
                                                                                                                 // 148
Accounts._getAccountData = function (connectionId, field) {                                                      // 149
  var data = accountData[connectionId];                                                                          // 150
  return data && data[field];                                                                                    // 151
};                                                                                                               // 152
                                                                                                                 // 153
Accounts._setAccountData = function (connectionId, field, value) {                                               // 154
  var data = accountData[connectionId];                                                                          // 155
                                                                                                                 // 156
  // safety belt. shouldn't happen. accountData is set in onConnection,                                          // 157
  // we don't have a connectionId until it is set.                                                               // 158
  if (!data)                                                                                                     // 159
    return;                                                                                                      // 160
                                                                                                                 // 161
  if (value === undefined)                                                                                       // 162
    delete data[field];                                                                                          // 163
  else                                                                                                           // 164
    data[field] = value;                                                                                         // 165
};                                                                                                               // 166
                                                                                                                 // 167
Meteor.server.onConnection(function (connection) {                                                               // 168
  accountData[connection.id] = {connection: connection};                                                         // 169
  connection.onClose(function () {                                                                               // 170
    removeConnectionFromToken(connection.id);                                                                    // 171
    delete accountData[connection.id];                                                                           // 172
  });                                                                                                            // 173
});                                                                                                              // 174
                                                                                                                 // 175
                                                                                                                 // 176
///                                                                                                              // 177
/// RECONNECT TOKENS                                                                                             // 178
///                                                                                                              // 179
/// support reconnecting using a meteor login token                                                              // 180
                                                                                                                 // 181
// token -> list of connection ids                                                                               // 182
var connectionsByLoginToken = {};                                                                                // 183
                                                                                                                 // 184
// test hook                                                                                                     // 185
Accounts._getTokenConnections = function (token) {                                                               // 186
  return connectionsByLoginToken[token];                                                                         // 187
};                                                                                                               // 188
                                                                                                                 // 189
// Remove the connection from the list of open connections for the token.                                        // 190
var removeConnectionFromToken = function (connectionId) {                                                        // 191
  var token = Accounts._getLoginToken(connectionId);                                                             // 192
  if (token) {                                                                                                   // 193
    connectionsByLoginToken[token] = _.without(                                                                  // 194
      connectionsByLoginToken[token],                                                                            // 195
      connectionId                                                                                               // 196
    );                                                                                                           // 197
    if (_.isEmpty(connectionsByLoginToken[token]))                                                               // 198
      delete connectionsByLoginToken[token];                                                                     // 199
  }                                                                                                              // 200
};                                                                                                               // 201
                                                                                                                 // 202
Accounts._getLoginToken = function (connectionId) {                                                              // 203
  return Accounts._getAccountData(connectionId, 'loginToken');                                                   // 204
};                                                                                                               // 205
                                                                                                                 // 206
Accounts._setLoginToken = function (connectionId, newToken) {                                                    // 207
  removeConnectionFromToken(connectionId);                                                                       // 208
                                                                                                                 // 209
  Accounts._setAccountData(connectionId, 'loginToken', newToken);                                                // 210
                                                                                                                 // 211
  if (newToken) {                                                                                                // 212
    if (! _.has(connectionsByLoginToken, newToken))                                                              // 213
      connectionsByLoginToken[newToken] = [];                                                                    // 214
    connectionsByLoginToken[newToken].push(connectionId);                                                        // 215
  }                                                                                                              // 216
};                                                                                                               // 217
                                                                                                                 // 218
// Close all open connections associated with any of the tokens in                                               // 219
// `tokens`.                                                                                                     // 220
var closeConnectionsForTokens = function (tokens) {                                                              // 221
  _.each(tokens, function (token) {                                                                              // 222
    if (_.has(connectionsByLoginToken, token)) {                                                                 // 223
      // safety belt. close should defer potentially yielding callbacks.                                         // 224
      Meteor._noYieldsAllowed(function () {                                                                      // 225
        _.each(connectionsByLoginToken[token], function (connectionId) {                                         // 226
          var connection = Accounts._getAccountData(connectionId, 'connection');                                 // 227
          if (connection)                                                                                        // 228
            connection.close();                                                                                  // 229
        });                                                                                                      // 230
      });                                                                                                        // 231
    }                                                                                                            // 232
  });                                                                                                            // 233
};                                                                                                               // 234
                                                                                                                 // 235
                                                                                                                 // 236
// Login handler for resume tokens.                                                                              // 237
Accounts.registerLoginHandler(function(options) {                                                                // 238
  if (!options.resume)                                                                                           // 239
    return undefined;                                                                                            // 240
                                                                                                                 // 241
  check(options.resume, String);                                                                                 // 242
  var user = Meteor.users.findOne({                                                                              // 243
    "services.resume.loginTokens.token": ""+options.resume                                                       // 244
  });                                                                                                            // 245
                                                                                                                 // 246
  if (!user) {                                                                                                   // 247
    throw new Meteor.Error(403, "You've been logged out by the server. " +                                       // 248
    "Please login again.");                                                                                      // 249
  }                                                                                                              // 250
                                                                                                                 // 251
  var token = _.find(user.services.resume.loginTokens, function (token) {                                        // 252
    return token.token === options.resume;                                                                       // 253
  });                                                                                                            // 254
                                                                                                                 // 255
  var tokenExpires = Accounts._tokenExpiration(token.when);                                                      // 256
  if (new Date() >= tokenExpires)                                                                                // 257
    throw new Meteor.Error(403, "Your session has expired. Please login again.");                                // 258
                                                                                                                 // 259
  return {                                                                                                       // 260
    token: options.resume,                                                                                       // 261
    tokenExpires: tokenExpires,                                                                                  // 262
    id: user._id                                                                                                 // 263
  };                                                                                                             // 264
});                                                                                                              // 265
                                                                                                                 // 266
// Semi-public. Used by other login methods to generate tokens.                                                  // 267
//                                                                                                               // 268
Accounts._generateStampedLoginToken = function () {                                                              // 269
  return {token: Random.id(), when: (new Date)};                                                                 // 270
};                                                                                                               // 271
                                                                                                                 // 272
// Deletes the given loginToken from the database. This will cause all                                           // 273
// connections associated with the token to be closed.                                                           // 274
var removeLoginToken = function (userId, loginToken) {                                                           // 275
  Meteor.users.update(userId, {                                                                                  // 276
    $pull: {                                                                                                     // 277
      "services.resume.loginTokens": { "token": loginToken }                                                     // 278
    }                                                                                                            // 279
  });                                                                                                            // 280
};                                                                                                               // 281
                                                                                                                 // 282
///                                                                                                              // 283
/// TOKEN EXPIRATION                                                                                             // 284
///                                                                                                              // 285
                                                                                                                 // 286
var expireTokenInterval;                                                                                         // 287
                                                                                                                 // 288
// Deletes expired tokens from the database and closes all open connections                                      // 289
// associated with these tokens.                                                                                 // 290
//                                                                                                               // 291
// Exported for tests. Also, the arguments are only used by                                                      // 292
// tests. oldestValidDate is simulate expiring tokens without waiting                                            // 293
// for them to actually expire. userId is used by tests to only expire                                           // 294
// tokens for the test user.                                                                                     // 295
var expireTokens = Accounts._expireTokens = function (oldestValidDate, userId) {                                 // 296
  var tokenLifetimeMs = getTokenLifetimeMs();                                                                    // 297
                                                                                                                 // 298
  // when calling from a test with extra arguments, you must specify both!                                       // 299
  if ((oldestValidDate && !userId) || (!oldestValidDate && userId)) {                                            // 300
    throw new Error("Bad test. Must specify both oldestValidDate and userId.");                                  // 301
  }                                                                                                              // 302
                                                                                                                 // 303
  oldestValidDate = oldestValidDate ||                                                                           // 304
    (new Date(new Date() - tokenLifetimeMs));                                                                    // 305
  var userFilter = userId ? {_id: userId} : {};                                                                  // 306
                                                                                                                 // 307
                                                                                                                 // 308
  // Backwards compatible with older versions of meteor that stored login token                                  // 309
  // timestamps as numbers.                                                                                      // 310
  Meteor.users.update(_.extend(userFilter, {                                                                     // 311
    $or: [                                                                                                       // 312
      { "services.resume.loginTokens.when": { $lt: oldestValidDate } },                                          // 313
      { "services.resume.loginTokens.when": { $lt: +oldestValidDate } }                                          // 314
    ]                                                                                                            // 315
  }), {                                                                                                          // 316
    $pull: {                                                                                                     // 317
      "services.resume.loginTokens": {                                                                           // 318
        $or: [                                                                                                   // 319
          { when: { $lt: oldestValidDate } },                                                                    // 320
          { when: { $lt: +oldestValidDate } }                                                                    // 321
        ]                                                                                                        // 322
      }                                                                                                          // 323
    }                                                                                                            // 324
  }, { multi: true });                                                                                           // 325
  // The observe on Meteor.users will take care of closing connections for                                       // 326
  // expired tokens.                                                                                             // 327
};                                                                                                               // 328
                                                                                                                 // 329
maybeStopExpireTokensInterval = function () {                                                                    // 330
  if (_.has(Accounts._options, "loginExpirationInDays") &&                                                       // 331
      Accounts._options.loginExpirationInDays === null &&                                                        // 332
      expireTokenInterval) {                                                                                     // 333
    Meteor.clearInterval(expireTokenInterval);                                                                   // 334
    expireTokenInterval = null;                                                                                  // 335
  }                                                                                                              // 336
};                                                                                                               // 337
                                                                                                                 // 338
expireTokenInterval = Meteor.setInterval(expireTokens,                                                           // 339
                                         EXPIRE_TOKENS_INTERVAL_MS);                                             // 340
                                                                                                                 // 341
///                                                                                                              // 342
/// CREATE USER HOOKS                                                                                            // 343
///                                                                                                              // 344
                                                                                                                 // 345
var onCreateUserHook = null;                                                                                     // 346
Accounts.onCreateUser = function (func) {                                                                        // 347
  if (onCreateUserHook)                                                                                          // 348
    throw new Error("Can only call onCreateUser once");                                                          // 349
  else                                                                                                           // 350
    onCreateUserHook = func;                                                                                     // 351
};                                                                                                               // 352
                                                                                                                 // 353
// XXX see comment on Accounts.createUser in passwords_server about adding a                                     // 354
// second "server options" argument.                                                                             // 355
var defaultCreateUserHook = function (options, user) {                                                           // 356
  if (options.profile)                                                                                           // 357
    user.profile = options.profile;                                                                              // 358
  return user;                                                                                                   // 359
};                                                                                                               // 360
                                                                                                                 // 361
// Called by accounts-password                                                                                   // 362
Accounts.insertUserDoc = function (options, user) {                                                              // 363
  // - clone user document, to protect from modification                                                         // 364
  // - add createdAt timestamp                                                                                   // 365
  // - prepare an _id, so that you can modify other collections (eg                                              // 366
  // create a first task for every new user)                                                                     // 367
  //                                                                                                             // 368
  // XXX If the onCreateUser or validateNewUser hooks fail, we might                                             // 369
  // end up having modified some other collection                                                                // 370
  // inappropriately. The solution is probably to have onCreateUser                                              // 371
  // accept two callbacks - one that gets called before inserting                                                // 372
  // the user document (in which you can modify its contents), and                                               // 373
  // one that gets called after (in which you should change other                                                // 374
  // collections)                                                                                                // 375
  user = _.extend({createdAt: new Date(), _id: Random.id()}, user);                                              // 376
                                                                                                                 // 377
  var result = {};                                                                                               // 378
  if (options.generateLoginToken) {                                                                              // 379
    var stampedToken = Accounts._generateStampedLoginToken();                                                    // 380
    result.token = stampedToken.token;                                                                           // 381
    result.tokenExpires = Accounts._tokenExpiration(stampedToken.when);                                          // 382
    Meteor._ensure(user, 'services', 'resume');                                                                  // 383
    if (_.has(user.services.resume, 'loginTokens'))                                                              // 384
      user.services.resume.loginTokens.push(stampedToken);                                                       // 385
    else                                                                                                         // 386
      user.services.resume.loginTokens = [stampedToken];                                                         // 387
  }                                                                                                              // 388
                                                                                                                 // 389
  var fullUser;                                                                                                  // 390
  if (onCreateUserHook) {                                                                                        // 391
    fullUser = onCreateUserHook(options, user);                                                                  // 392
                                                                                                                 // 393
    // This is *not* part of the API. We need this because we can't isolate                                      // 394
    // the global server environment between tests, meaning we can't test                                        // 395
    // both having a create user hook set and not having one set.                                                // 396
    if (fullUser === 'TEST DEFAULT HOOK')                                                                        // 397
      fullUser = defaultCreateUserHook(options, user);                                                           // 398
  } else {                                                                                                       // 399
    fullUser = defaultCreateUserHook(options, user);                                                             // 400
  }                                                                                                              // 401
                                                                                                                 // 402
  _.each(validateNewUserHooks, function (hook) {                                                                 // 403
    if (!hook(fullUser))                                                                                         // 404
      throw new Meteor.Error(403, "User validation failed");                                                     // 405
  });                                                                                                            // 406
                                                                                                                 // 407
  try {                                                                                                          // 408
    result.id = Meteor.users.insert(fullUser);                                                                   // 409
  } catch (e) {                                                                                                  // 410
    // XXX string parsing sucks, maybe                                                                           // 411
    // https://jira.mongodb.org/browse/SERVER-3069 will get fixed one day                                        // 412
    if (e.name !== 'MongoError') throw e;                                                                        // 413
    var match = e.err.match(/^E11000 duplicate key error index: ([^ ]+)/);                                       // 414
    if (!match) throw e;                                                                                         // 415
    if (match[1].indexOf('$emails.address') !== -1)                                                              // 416
      throw new Meteor.Error(403, "Email already exists.");                                                      // 417
    if (match[1].indexOf('username') !== -1)                                                                     // 418
      throw new Meteor.Error(403, "Username already exists.");                                                   // 419
    // XXX better error reporting for services.facebook.id duplicate, etc                                        // 420
    throw e;                                                                                                     // 421
  }                                                                                                              // 422
                                                                                                                 // 423
  return result;                                                                                                 // 424
};                                                                                                               // 425
                                                                                                                 // 426
var validateNewUserHooks = [];                                                                                   // 427
Accounts.validateNewUser = function (func) {                                                                     // 428
  validateNewUserHooks.push(func);                                                                               // 429
};                                                                                                               // 430
                                                                                                                 // 431
// XXX Find a better place for this utility function                                                             // 432
// Like Perl's quotemeta: quotes all regexp metacharacters. See                                                  // 433
//   https://github.com/substack/quotemeta/blob/master/index.js                                                  // 434
var quotemeta = function (str) {                                                                                 // 435
    return String(str).replace(/(\W)/g, '\\$1');                                                                 // 436
};                                                                                                               // 437
                                                                                                                 // 438
// Helper function: returns false if email does not match company domain from                                    // 439
// the configuration.                                                                                            // 440
var testEmailDomain = function (email) {                                                                         // 441
  var domain = Accounts._options.restrictCreationByEmailDomain;                                                  // 442
  return !domain ||                                                                                              // 443
    (_.isFunction(domain) && domain(email)) ||                                                                   // 444
    (_.isString(domain) &&                                                                                       // 445
      (new RegExp('@' + quotemeta(domain) + '$', 'i')).test(email));                                             // 446
};                                                                                                               // 447
                                                                                                                 // 448
// Validate new user's email or Google/Facebook/GitHub account's email                                           // 449
Accounts.validateNewUser(function (user) {                                                                       // 450
  var domain = Accounts._options.restrictCreationByEmailDomain;                                                  // 451
  if (!domain)                                                                                                   // 452
    return true;                                                                                                 // 453
                                                                                                                 // 454
  var emailIsGood = false;                                                                                       // 455
  if (!_.isEmpty(user.emails)) {                                                                                 // 456
    emailIsGood = _.any(user.emails, function (email) {                                                          // 457
      return testEmailDomain(email.address);                                                                     // 458
    });                                                                                                          // 459
  } else if (!_.isEmpty(user.services)) {                                                                        // 460
    // Find any email of any service and check it                                                                // 461
    emailIsGood = _.any(user.services, function (service) {                                                      // 462
      return service.email && testEmailDomain(service.email);                                                    // 463
    });                                                                                                          // 464
  }                                                                                                              // 465
                                                                                                                 // 466
  if (emailIsGood)                                                                                               // 467
    return true;                                                                                                 // 468
                                                                                                                 // 469
  if (_.isString(domain))                                                                                        // 470
    throw new Meteor.Error(403, "@" + domain + " email required");                                               // 471
  else                                                                                                           // 472
    throw new Meteor.Error(403, "Email doesn't match the criteria.");                                            // 473
});                                                                                                              // 474
                                                                                                                 // 475
///                                                                                                              // 476
/// MANAGING USER OBJECTS                                                                                        // 477
///                                                                                                              // 478
                                                                                                                 // 479
// Updates or creates a user after we authenticate with a 3rd party.                                             // 480
//                                                                                                               // 481
// @param serviceName {String} Service name (eg, twitter).                                                       // 482
// @param serviceData {Object} Data to store in the user's record                                                // 483
//        under services[serviceName]. Must include an "id" field                                                // 484
//        which is a unique identifier for the user in the service.                                              // 485
// @param options {Object, optional} Other options to pass to insertUserDoc                                      // 486
//        (eg, profile)                                                                                          // 487
// @returns {Object} Object with token and id keys, like the result                                              // 488
//        of the "login" method.                                                                                 // 489
//                                                                                                               // 490
Accounts.updateOrCreateUserFromExternalService = function(                                                       // 491
  serviceName, serviceData, options) {                                                                           // 492
  options = _.clone(options || {});                                                                              // 493
                                                                                                                 // 494
  if (serviceName === "password" || serviceName === "resume")                                                    // 495
    throw new Error(                                                                                             // 496
      "Can't use updateOrCreateUserFromExternalService with internal service "                                   // 497
        + serviceName);                                                                                          // 498
  if (!_.has(serviceData, 'id'))                                                                                 // 499
    throw new Error(                                                                                             // 500
      "Service data for service " + serviceName + " must include id");                                           // 501
                                                                                                                 // 502
  // Look for a user with the appropriate service user id.                                                       // 503
  var selector = {};                                                                                             // 504
  var serviceIdKey = "services." + serviceName + ".id";                                                          // 505
                                                                                                                 // 506
  // XXX Temporary special case for Twitter. (Issue #629)                                                        // 507
  //   The serviceData.id will be a string representation of an integer.                                         // 508
  //   We want it to match either a stored string or int representation.                                         // 509
  //   This is to cater to earlier versions of Meteor storing twitter                                            // 510
  //   user IDs in number form, and recent versions storing them as strings.                                     // 511
  //   This can be removed once migration technology is in place, and twitter                                    // 512
  //   users stored with integer IDs have been migrated to string IDs.                                           // 513
  if (serviceName === "twitter" && !isNaN(serviceData.id)) {                                                     // 514
    selector["$or"] = [{},{}];                                                                                   // 515
    selector["$or"][0][serviceIdKey] = serviceData.id;                                                           // 516
    selector["$or"][1][serviceIdKey] = parseInt(serviceData.id, 10);                                             // 517
  } else {                                                                                                       // 518
    selector[serviceIdKey] = serviceData.id;                                                                     // 519
  }                                                                                                              // 520
                                                                                                                 // 521
  var user = Meteor.users.findOne(selector);                                                                     // 522
                                                                                                                 // 523
  if (user) {                                                                                                    // 524
    // We *don't* process options (eg, profile) for update, but we do replace                                    // 525
    // the serviceData (eg, so that we keep an unexpired access token and                                        // 526
    // don't cache old email addresses in serviceData.email).                                                    // 527
    // XXX provide an onUpdateUser hook which would let apps update                                              // 528
    //     the profile too                                                                                       // 529
    var stampedToken = Accounts._generateStampedLoginToken();                                                    // 530
    var setAttrs = {};                                                                                           // 531
    _.each(serviceData, function(value, key) {                                                                   // 532
      setAttrs["services." + serviceName + "." + key] = value;                                                   // 533
    });                                                                                                          // 534
                                                                                                                 // 535
    // XXX Maybe we should re-use the selector above and notice if the update                                    // 536
    //     touches nothing?                                                                                      // 537
    Meteor.users.update(                                                                                         // 538
      user._id,                                                                                                  // 539
      {$set: setAttrs,                                                                                           // 540
       $push: {'services.resume.loginTokens': stampedToken}});                                                   // 541
    return {                                                                                                     // 542
      token: stampedToken.token,                                                                                 // 543
      id: user._id,                                                                                              // 544
      tokenExpires: Accounts._tokenExpiration(stampedToken.when)                                                 // 545
    };                                                                                                           // 546
  } else {                                                                                                       // 547
    // Create a new user with the service data. Pass other options through to                                    // 548
    // insertUserDoc.                                                                                            // 549
    user = {services: {}};                                                                                       // 550
    user.services[serviceName] = serviceData;                                                                    // 551
    options.generateLoginToken = true;                                                                           // 552
    return Accounts.insertUserDoc(options, user);                                                                // 553
  }                                                                                                              // 554
};                                                                                                               // 555
                                                                                                                 // 556
                                                                                                                 // 557
///                                                                                                              // 558
/// PUBLISHING DATA                                                                                              // 559
///                                                                                                              // 560
                                                                                                                 // 561
// Publish the current user's record to the client.                                                              // 562
Meteor.publish(null, function() {                                                                                // 563
  if (this.userId) {                                                                                             // 564
    return Meteor.users.find(                                                                                    // 565
      {_id: this.userId},                                                                                        // 566
      {fields: {profile: 1, username: 1, emails: 1}});                                                           // 567
  } else {                                                                                                       // 568
    return null;                                                                                                 // 569
  }                                                                                                              // 570
}, /*suppress autopublish warning*/{is_auto: true});                                                             // 571
                                                                                                                 // 572
// If autopublish is on, publish these user fields. Login service                                                // 573
// packages (eg accounts-google) add to these by calling                                                         // 574
// Accounts.addAutopublishFields Notably, this isn't implemented with                                            // 575
// multiple publishes since DDP only merges only across top-level                                                // 576
// fields, not subfields (such as 'services.facebook.accessToken')                                               // 577
var autopublishFields = {                                                                                        // 578
  loggedInUser: ['profile', 'username', 'emails'],                                                               // 579
  otherUsers: ['profile', 'username']                                                                            // 580
};                                                                                                               // 581
                                                                                                                 // 582
// Add to the list of fields or subfields to be automatically                                                    // 583
// published if autopublish is on. Must be called from top-level                                                 // 584
// code (ie, before Meteor.startup hooks run).                                                                   // 585
//                                                                                                               // 586
// @param opts {Object} with:                                                                                    // 587
//   - forLoggedInUser {Array} Array of fields published to the logged-in user                                   // 588
//   - forOtherUsers {Array} Array of fields published to users that aren't logged in                            // 589
Accounts.addAutopublishFields = function(opts) {                                                                 // 590
  autopublishFields.loggedInUser.push.apply(                                                                     // 591
    autopublishFields.loggedInUser, opts.forLoggedInUser);                                                       // 592
  autopublishFields.otherUsers.push.apply(                                                                       // 593
    autopublishFields.otherUsers, opts.forOtherUsers);                                                           // 594
};                                                                                                               // 595
                                                                                                                 // 596
if (Package.autopublish) {                                                                                       // 597
  // Use Meteor.startup to give other packages a chance to call                                                  // 598
  // addAutopublishFields.                                                                                       // 599
  Meteor.startup(function () {                                                                                   // 600
    // ['profile', 'username'] -> {profile: 1, username: 1}                                                      // 601
    var toFieldSelector = function(fields) {                                                                     // 602
      return _.object(_.map(fields, function(field) {                                                            // 603
        return [field, 1];                                                                                       // 604
      }));                                                                                                       // 605
    };                                                                                                           // 606
                                                                                                                 // 607
    Meteor.server.publish(null, function () {                                                                    // 608
      if (this.userId) {                                                                                         // 609
        return Meteor.users.find(                                                                                // 610
          {_id: this.userId},                                                                                    // 611
          {fields: toFieldSelector(autopublishFields.loggedInUser)});                                            // 612
      } else {                                                                                                   // 613
        return null;                                                                                             // 614
      }                                                                                                          // 615
    }, /*suppress autopublish warning*/{is_auto: true});                                                         // 616
                                                                                                                 // 617
    // XXX this publish is neither dedup-able nor is it optimized by our special                                 // 618
    // treatment of queries on a specific _id. Therefore this will have O(n^2)                                   // 619
    // run-time performance every time a user document is changed (eg someone                                    // 620
    // logging in). If this is a problem, we can instead write a manual publish                                  // 621
    // function which filters out fields based on 'this.userId'.                                                 // 622
    Meteor.server.publish(null, function () {                                                                    // 623
      var selector;                                                                                              // 624
      if (this.userId)                                                                                           // 625
        selector = {_id: {$ne: this.userId}};                                                                    // 626
      else                                                                                                       // 627
        selector = {};                                                                                           // 628
                                                                                                                 // 629
      return Meteor.users.find(                                                                                  // 630
        selector,                                                                                                // 631
        {fields: toFieldSelector(autopublishFields.otherUsers)});                                                // 632
    }, /*suppress autopublish warning*/{is_auto: true});                                                         // 633
  });                                                                                                            // 634
}                                                                                                                // 635
                                                                                                                 // 636
// Publish all login service configuration fields other than secret.                                             // 637
Meteor.publish("meteor.loginServiceConfiguration", function () {                                                 // 638
  return ServiceConfiguration.configurations.find({}, {fields: {secret: 0}});                                    // 639
}, {is_auto: true}); // not techincally autopublish, but stops the warning.                                      // 640
                                                                                                                 // 641
// Allow a one-time configuration for a login service. Modifications                                             // 642
// to this collection are also allowed in insecure mode.                                                         // 643
Meteor.methods({                                                                                                 // 644
  "configureLoginService": function (options) {                                                                  // 645
    check(options, Match.ObjectIncluding({service: String}));                                                    // 646
    // Don't let random users configure a service we haven't added yet (so                                       // 647
    // that when we do later add it, it's set up with their configuration                                        // 648
    // instead of ours).                                                                                         // 649
    // XXX if service configuration is oauth-specific then this code should                                      // 650
    //     be in accounts-oauth; if it's not then the registry should be                                         // 651
    //     in this package                                                                                       // 652
    if (!(Accounts.oauth                                                                                         // 653
          && _.contains(Accounts.oauth.serviceNames(), options.service))) {                                      // 654
      throw new Meteor.Error(403, "Service unknown");                                                            // 655
    }                                                                                                            // 656
    if (ServiceConfiguration.configurations.findOne({service: options.service}))                                 // 657
      throw new Meteor.Error(403, "Service " + options.service + " already configured");                         // 658
    ServiceConfiguration.configurations.insert(options);                                                         // 659
  }                                                                                                              // 660
});                                                                                                              // 661
                                                                                                                 // 662
                                                                                                                 // 663
///                                                                                                              // 664
/// RESTRICTING WRITES TO USER OBJECTS                                                                           // 665
///                                                                                                              // 666
                                                                                                                 // 667
Meteor.users.allow({                                                                                             // 668
  // clients can modify the profile field of their own document, and                                             // 669
  // nothing else.                                                                                               // 670
  update: function (userId, user, fields, modifier) {                                                            // 671
    // make sure it is our record                                                                                // 672
    if (user._id !== userId)                                                                                     // 673
      return false;                                                                                              // 674
                                                                                                                 // 675
    // user can only modify the 'profile' field. sets to multiple                                                // 676
    // sub-keys (eg profile.foo and profile.bar) are merged into entry                                           // 677
    // in the fields list.                                                                                       // 678
    if (fields.length !== 1 || fields[0] !== 'profile')                                                          // 679
      return false;                                                                                              // 680
                                                                                                                 // 681
    return true;                                                                                                 // 682
  },                                                                                                             // 683
  fetch: ['_id'] // we only look at _id.                                                                         // 684
});                                                                                                              // 685
                                                                                                                 // 686
/// DEFAULT INDEXES ON USERS                                                                                     // 687
Meteor.users._ensureIndex('username', {unique: 1, sparse: 1});                                                   // 688
Meteor.users._ensureIndex('emails.address', {unique: 1, sparse: 1});                                             // 689
Meteor.users._ensureIndex('services.resume.loginTokens.token',                                                   // 690
                          {unique: 1, sparse: 1});                                                               // 691
// For taking care of logoutOtherClients calls that crashed before the tokens                                    // 692
// were deleted.                                                                                                 // 693
Meteor.users._ensureIndex('services.resume.haveLoginTokensToDelete',                                             // 694
                          { sparse: 1 });                                                                        // 695
// For expiring login tokens                                                                                     // 696
Meteor.users._ensureIndex("services.resume.loginTokens.when", { sparse: 1 });                                    // 697
                                                                                                                 // 698
///                                                                                                              // 699
/// CLEAN UP FOR `logoutOtherClients`                                                                            // 700
///                                                                                                              // 701
                                                                                                                 // 702
var deleteSavedTokens = function (userId, tokensToDelete) {                                                      // 703
  if (tokensToDelete) {                                                                                          // 704
    Meteor.users.update(userId, {                                                                                // 705
      $unset: {                                                                                                  // 706
        "services.resume.haveLoginTokensToDelete": 1,                                                            // 707
        "services.resume.loginTokensToDelete": 1                                                                 // 708
      },                                                                                                         // 709
      $pullAll: {                                                                                                // 710
        "services.resume.loginTokens": tokensToDelete                                                            // 711
      }                                                                                                          // 712
    });                                                                                                          // 713
  }                                                                                                              // 714
};                                                                                                               // 715
                                                                                                                 // 716
Meteor.startup(function () {                                                                                     // 717
  // If we find users who have saved tokens to delete on startup, delete them                                    // 718
  // now. It's possible that the server could have crashed and come back up                                      // 719
  // before new tokens are found in localStorage, but this shouldn't happen very                                 // 720
  // often. We shouldn't put a delay here because that would give a lot of power                                 // 721
  // to an attacker with a stolen login token and the ability to crash the                                       // 722
  // server.                                                                                                     // 723
  var users = Meteor.users.find({                                                                                // 724
    "services.resume.haveLoginTokensToDelete": true                                                              // 725
  }, {                                                                                                           // 726
    "services.resume.loginTokensToDelete": 1                                                                     // 727
  });                                                                                                            // 728
  users.forEach(function (user) {                                                                                // 729
    deleteSavedTokens(user._id, user.services.resume.loginTokensToDelete);                                       // 730
  });                                                                                                            // 731
});                                                                                                              // 732
                                                                                                                 // 733
///                                                                                                              // 734
/// LOGGING OUT DELETED USERS                                                                                    // 735
///                                                                                                              // 736
                                                                                                                 // 737
var closeTokensForUser = function (userTokens) {                                                                 // 738
  closeConnectionsForTokens(_.pluck(userTokens, "token"));                                                       // 739
};                                                                                                               // 740
                                                                                                                 // 741
// Like _.difference, but uses EJSON.equals to compute which values to return.                                   // 742
var differenceObj = function (array1, array2) {                                                                  // 743
  return _.filter(array1, function (array1Value) {                                                               // 744
    return ! _.some(array2, function (array2Value) {                                                             // 745
      return EJSON.equals(array1Value, array2Value);                                                             // 746
    });                                                                                                          // 747
  });                                                                                                            // 748
};                                                                                                               // 749
                                                                                                                 // 750
Meteor.users.find({}, { fields: { "services.resume": 1 }}).observe({                                             // 751
  changed: function (newUser, oldUser) {                                                                         // 752
    var removedTokens = [];                                                                                      // 753
    if (newUser.services && newUser.services.resume &&                                                           // 754
        oldUser.services && oldUser.services.resume) {                                                           // 755
      removedTokens = differenceObj(oldUser.services.resume.loginTokens || [],                                   // 756
                                    newUser.services.resume.loginTokens || []);                                  // 757
    } else if (oldUser.services && oldUser.services.resume) {                                                    // 758
      removedTokens = oldUser.services.resume.loginTokens || [];                                                 // 759
    }                                                                                                            // 760
    closeTokensForUser(removedTokens);                                                                           // 761
  },                                                                                                             // 762
  removed: function (oldUser) {                                                                                  // 763
    if (oldUser.services && oldUser.services.resume)                                                             // 764
      closeTokensForUser(oldUser.services.resume.loginTokens || []);                                             // 765
  }                                                                                                              // 766
});                                                                                                              // 767
                                                                                                                 // 768
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                               //
// packages/accounts-base/url_server.js                                                                          //
//                                                                                                               //
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                 //
// XXX These should probably not actually be public?                                                             // 1
                                                                                                                 // 2
Accounts.urls = {};                                                                                              // 3
                                                                                                                 // 4
Accounts.urls.resetPassword = function (token) {                                                                 // 5
  return Meteor.absoluteUrl('#/reset-password/' + token);                                                        // 6
};                                                                                                               // 7
                                                                                                                 // 8
Accounts.urls.verifyEmail = function (token) {                                                                   // 9
  return Meteor.absoluteUrl('#/verify-email/' + token);                                                          // 10
};                                                                                                               // 11
                                                                                                                 // 12
Accounts.urls.enrollAccount = function (token) {                                                                 // 13
  return Meteor.absoluteUrl('#/enroll-account/' + token);                                                        // 14
};                                                                                                               // 15
                                                                                                                 // 16
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);


/* Exports */
if (typeof Package === 'undefined') Package = {};
Package['accounts-base'] = {
  Accounts: Accounts
};

})();
