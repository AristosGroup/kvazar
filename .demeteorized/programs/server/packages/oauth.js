(function () {

/* Imports */
var Meteor = Package.meteor.Meteor;
var RoutePolicy = Package.routepolicy.RoutePolicy;
var WebApp = Package.webapp.WebApp;
var main = Package.webapp.main;
var WebAppInternals = Package.webapp.WebAppInternals;
var _ = Package.underscore._;
var ServiceConfiguration = Package['service-configuration'].ServiceConfiguration;

/* Package-scope variables */
var Oauth, OauthTest, middleware;

(function () {

//////////////////////////////////////////////////////////////////////////////////////////
//                                                                                      //
// packages/oauth/oauth_server.js                                                       //
//                                                                                      //
//////////////////////////////////////////////////////////////////////////////////////////
                                                                                        //
var Fiber = Npm.require('fibers');                                                      // 1
var url = Npm.require('url');                                                           // 2
                                                                                        // 3
Oauth = {};                                                                             // 4
OauthTest = {};                                                                         // 5
                                                                                        // 6
RoutePolicy.declare('/_oauth/', 'network');                                             // 7
                                                                                        // 8
var registeredServices = {};                                                            // 9
                                                                                        // 10
// Internal: Maps from service version to handler function. The                         // 11
// 'oauth1' and 'oauth2' packages manipulate this directly to register                  // 12
// for callbacks.                                                                       // 13
//                                                                                      // 14
Oauth._requestHandlers = {};                                                            // 15
                                                                                        // 16
                                                                                        // 17
// Register a handler for an OAuth service. The handler will be called                  // 18
// when we get an incoming http request on /_oauth/{serviceName}. This                  // 19
// handler should use that information to fetch data about the user                     // 20
// logging in.                                                                          // 21
//                                                                                      // 22
// @param name {String} e.g. "google", "facebook"                                       // 23
// @param version {Number} OAuth version (1 or 2)                                       // 24
// @param urls   For OAuth1 only, specify the service's urls                            // 25
// @param handleOauthRequest {Function(oauthBinding|query)}                             // 26
//   - (For OAuth1 only) oauthBinding {OAuth1Binding} bound to the appropriate provider // 27
//   - (For OAuth2 only) query {Object} parameters passed in query string               // 28
//   - return value is:                                                                 // 29
//     - {serviceData:, (optional options:)} where serviceData should end               // 30
//       up in the user's services[name] field                                          // 31
//     - `null` if the user declined to give permissions                                // 32
//                                                                                      // 33
Oauth.registerService = function (name, version, urls, handleOauthRequest) {            // 34
  if (registeredServices[name])                                                         // 35
    throw new Error("Already registered the " + name + " OAuth service");               // 36
                                                                                        // 37
  registeredServices[name] = {                                                          // 38
    serviceName: name,                                                                  // 39
    version: version,                                                                   // 40
    urls: urls,                                                                         // 41
    handleOauthRequest: handleOauthRequest                                              // 42
  };                                                                                    // 43
};                                                                                      // 44
                                                                                        // 45
// For test cleanup.                                                                    // 46
OauthTest.unregisterService = function (name) {                                         // 47
  delete registeredServices[name];                                                      // 48
};                                                                                      // 49
                                                                                        // 50
                                                                                        // 51
// When we get an incoming OAuth http request we complete the oauth                     // 52
// handshake, account and token setup before responding.  The                           // 53
// results are stored in this map which is then read when the login                     // 54
// method is called. Maps credentialToken --> return value of `login`                   // 55
//                                                                                      // 56
// NB: the oauth1 and oauth2 packages manipulate this directly. might                   // 57
// be nice for them to have a setter instead                                            // 58
//                                                                                      // 59
// XXX we should periodically clear old entries                                         // 60
//                                                                                      // 61
Oauth._loginResultForCredentialToken = {};                                              // 62
                                                                                        // 63
Oauth.hasCredential = function(credentialToken) {                                       // 64
  return _.has(Oauth._loginResultForCredentialToken, credentialToken);                  // 65
}                                                                                       // 66
                                                                                        // 67
Oauth.retrieveCredential = function(credentialToken) {                                  // 68
  var result = Oauth._loginResultForCredentialToken[credentialToken];                   // 69
  delete Oauth._loginResultForCredentialToken[credentialToken];                         // 70
  return result;                                                                        // 71
}                                                                                       // 72
                                                                                        // 73
// Listen to incoming OAuth http requests                                               // 74
WebApp.connectHandlers.use(function(req, res, next) {                                   // 75
  // Need to create a Fiber since we're using synchronous http calls and nothing        // 76
  // else is wrapping this in a fiber automatically                                     // 77
  Fiber(function () {                                                                   // 78
    middleware(req, res, next);                                                         // 79
  }).run();                                                                             // 80
});                                                                                     // 81
                                                                                        // 82
middleware = function (req, res, next) {                                                // 83
  // Make sure to catch any exceptions because otherwise we'd crash                     // 84
  // the runner                                                                         // 85
  try {                                                                                 // 86
    var serviceName = oauthServiceName(req);                                            // 87
    if (!serviceName) {                                                                 // 88
      // not an oauth request. pass to next middleware.                                 // 89
      next();                                                                           // 90
      return;                                                                           // 91
    }                                                                                   // 92
                                                                                        // 93
    var service = registeredServices[serviceName];                                      // 94
                                                                                        // 95
    // Skip everything if there's no service set by the oauth middleware                // 96
    if (!service)                                                                       // 97
      throw new Error("Unexpected OAuth service " + serviceName);                       // 98
                                                                                        // 99
    // Make sure we're configured                                                       // 100
    ensureConfigured(serviceName);                                                      // 101
                                                                                        // 102
    var handler = Oauth._requestHandlers[service.version];                              // 103
    if (!handler)                                                                       // 104
      throw new Error("Unexpected OAuth version " + service.version);                   // 105
    handler(service, req.query, res);                                                   // 106
  } catch (err) {                                                                       // 107
    // if we got thrown an error, save it off, it will get passed to                    // 108
    // the approporiate login call (if any) and reported there.                         // 109
    //                                                                                  // 110
    // The other option would be to display it in the popup tab that                    // 111
    // is still open at this point, ignoring the 'close' or 'redirect'                  // 112
    // we were passed. But then the developer wouldn't be able to                       // 113
    // style the error or react to it in any way.                                       // 114
    if (req.query.state && err instanceof Error)                                        // 115
      Oauth._loginResultForCredentialToken[req.query.state] = err;                      // 116
                                                                                        // 117
    // XXX the following is actually wrong. if someone wants to                         // 118
    // redirect rather than close once we are done with the OAuth                       // 119
    // flow, as supported by                                                            // 120
    // Oauth_renderOauthResults, this will still                                        // 121
    // close the popup instead. Once we fully support the redirect                      // 122
    // flow (by supporting that in places such as                                       // 123
    // packages/facebook/facebook_client.js) we should revisit this.                    // 124
    //                                                                                  // 125
    // close the popup. because nobody likes them just hanging                          // 126
    // there.  when someone sees this multiple times they might                         // 127
    // think to check server logs (we hope?)                                            // 128
    closePopup(res);                                                                    // 129
  }                                                                                     // 130
};                                                                                      // 131
                                                                                        // 132
OauthTest.middleware = middleware;                                                      // 133
                                                                                        // 134
// Handle /_oauth/* paths and extract the service name                                  // 135
//                                                                                      // 136
// @returns {String|null} e.g. "facebook", or null if this isn't an                     // 137
// oauth request                                                                        // 138
var oauthServiceName = function (req) {                                                 // 139
  // req.url will be "/_oauth/<service name>?<action>"                                  // 140
  var barePath = req.url.substring(0, req.url.indexOf('?'));                            // 141
  var splitPath = barePath.split('/');                                                  // 142
                                                                                        // 143
  // Any non-oauth request will continue down the default                               // 144
  // middlewares.                                                                       // 145
  if (splitPath[1] !== '_oauth')                                                        // 146
    return null;                                                                        // 147
                                                                                        // 148
  // Find service based on url                                                          // 149
  var serviceName = splitPath[2];                                                       // 150
  return serviceName;                                                                   // 151
};                                                                                      // 152
                                                                                        // 153
// Make sure we're configured                                                           // 154
var ensureConfigured = function(serviceName) {                                          // 155
  if (!ServiceConfiguration.configurations.findOne({service: serviceName})) {           // 156
    throw new ServiceConfiguration.ConfigError("Service not configured");               // 157
  };                                                                                    // 158
};                                                                                      // 159
                                                                                        // 160
// Internal: used by the oauth1 and oauth2 packages                                     // 161
Oauth._renderOauthResults = function(res, query) {                                      // 162
  // We support ?close and ?redirect=URL. Any other query should                        // 163
  // just serve a blank page                                                            // 164
  if ('close' in query) { // check with 'in' because we don't set a value               // 165
    closePopup(res);                                                                    // 166
  } else if (query.redirect) {                                                          // 167
    // Only redirect to URLs on the same domain as this app.                            // 168
    // XXX No code in core uses this code path right now.                               // 169
    var redirectHostname = url.parse(query.redirect).hostname;                          // 170
    var appHostname = url.parse(Meteor.absoluteUrl()).hostname;                         // 171
    if (appHostname === redirectHostname) {                                             // 172
      // We rely on node to make sure the header is really only a single header         // 173
      // (not, for example, a url with a newline and then another header).              // 174
      res.writeHead(302, {'Location': query.redirect});                                 // 175
    } else {                                                                            // 176
      res.writeHead(400);                                                               // 177
    }                                                                                   // 178
    res.end();                                                                          // 179
  } else {                                                                              // 180
    res.writeHead(200, {'Content-Type': 'text/html'});                                  // 181
    res.end('', 'utf-8');                                                               // 182
  }                                                                                     // 183
};                                                                                      // 184
                                                                                        // 185
var closePopup = function(res) {                                                        // 186
  res.writeHead(200, {'Content-Type': 'text/html'});                                    // 187
  var content =                                                                         // 188
        '<html><head><script>window.close()</script></head></html>';                    // 189
  res.end(content, 'utf-8');                                                            // 190
};                                                                                      // 191
                                                                                        // 192
//////////////////////////////////////////////////////////////////////////////////////////

}).call(this);


/* Exports */
if (typeof Package === 'undefined') Package = {};
Package.oauth = {
  Oauth: Oauth,
  OauthTest: OauthTest
};

})();
