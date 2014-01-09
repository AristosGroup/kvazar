(function () {

/* Imports */
var Meteor = Package.meteor.Meteor;
var _ = Package.underscore._;
var Random = Package.random.Random;
var check = Package.check.check;
var Match = Package.check.Match;
var WebApp = Package.webapp.WebApp;
var main = Package.webapp.main;
var WebAppInternals = Package.webapp.WebAppInternals;
var Accounts = Package['accounts-base'].Accounts;
var Oauth = Package.oauth.Oauth;

(function () {

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                 //
// packages/accounts-oauth/oauth_common.js                                                                         //
//                                                                                                                 //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                   //
Accounts.oauth = {};                                                                                               // 1
                                                                                                                   // 2
var services = {};                                                                                                 // 3
                                                                                                                   // 4
// Helper for registering OAuth based accounts packages.                                                           // 5
// On the server, adds an index to the user collection.                                                            // 6
Accounts.oauth.registerService = function (name) {                                                                 // 7
  if (_.has(services, name))                                                                                       // 8
    throw new Error("Duplicate service: " + name);                                                                 // 9
  services[name] = true;                                                                                           // 10
                                                                                                                   // 11
  if (Meteor.server) {                                                                                             // 12
    // Accounts.updateOrCreateUserFromExternalService does a lookup by this id,                                    // 13
    // so this should be a unique index. You might want to add indexes for other                                   // 14
    // fields returned by your service (eg services.github.login) but you can do                                   // 15
    // that in your app.                                                                                           // 16
    Meteor.users._ensureIndex('services.' + name + '.id',                                                          // 17
                              {unique: 1, sparse: 1});                                                             // 18
  }                                                                                                                // 19
};                                                                                                                 // 20
                                                                                                                   // 21
Accounts.oauth.serviceNames = function () {                                                                        // 22
  return _.keys(services);                                                                                         // 23
};                                                                                                                 // 24
                                                                                                                   // 25
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                 //
// packages/accounts-oauth/oauth_server.js                                                                         //
//                                                                                                                 //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                   //
// Listen to calls to `login` with an oauth option set. This is where                                              // 1
// users actually get logged in to meteor via oauth.                                                               // 2
Accounts.registerLoginHandler(function (options) {                                                                 // 3
  if (!options.oauth)                                                                                              // 4
    return undefined; // don't handle                                                                              // 5
                                                                                                                   // 6
  check(options.oauth, {credentialToken: String});                                                                 // 7
                                                                                                                   // 8
  if (!Oauth.hasCredential(options.oauth.credentialToken)) {                                                       // 9
    // OAuth credentialToken is not recognized, which could be either because the popup                            // 10
    // was closed by the user before completion, or some sort of error where                                       // 11
    // the oauth provider didn't talk to our server correctly and closed the                                       // 12
    // popup somehow.                                                                                              // 13
    //                                                                                                             // 14
    // we assume it was user canceled, and report it as such, using a                                              // 15
    // Meteor.Error which the client can recognize. this will mask failures                                        // 16
    // where things are misconfigured such that the server doesn't see the                                         // 17
    // request but does close the window. This seems unlikely.                                                     // 18
    throw new Meteor.Error(Accounts.LoginCancelledError.numericError,                                              // 19
                           'No matching login attempt found');                                                     // 20
  }                                                                                                                // 21
  var result = Oauth.retrieveCredential(options.oauth.credentialToken);                                            // 22
  if (result instanceof Error)                                                                                     // 23
    // We tried to login, but there was a fatal error. Report it back                                              // 24
    // to the user.                                                                                                // 25
    throw result;                                                                                                  // 26
  else                                                                                                             // 27
    return Accounts.updateOrCreateUserFromExternalService(result.serviceName, result.serviceData, result.options); // 28
});                                                                                                                // 29
                                                                                                                   // 30
                                                                                                                   // 31
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);


/* Exports */
if (typeof Package === 'undefined') Package = {};
Package['accounts-oauth'] = {};

})();
