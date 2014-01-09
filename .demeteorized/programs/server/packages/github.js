(function () {

/* Imports */
var Meteor = Package.meteor.Meteor;
var Oauth = Package.oauth.Oauth;
var HTTP = Package.http.HTTP;
var ServiceConfiguration = Package['service-configuration'].ServiceConfiguration;

/* Package-scope variables */
var Github;

(function () {

/////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                 //
// packages/github/github_server.js                                                                //
//                                                                                                 //
/////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                   //
Github = {};                                                                                       // 1
                                                                                                   // 2
Oauth.registerService('github', 2, null, function(query) {                                         // 3
                                                                                                   // 4
  var accessToken = getAccessToken(query);                                                         // 5
  var identity = getIdentity(accessToken);                                                         // 6
                                                                                                   // 7
  return {                                                                                         // 8
    serviceData: {                                                                                 // 9
      id: identity.id,                                                                             // 10
      accessToken: accessToken,                                                                    // 11
      email: identity.email,                                                                       // 12
      username: identity.login                                                                     // 13
    },                                                                                             // 14
    options: {profile: {name: identity.name}}                                                      // 15
  };                                                                                               // 16
});                                                                                                // 17
                                                                                                   // 18
// http://developer.github.com/v3/#user-agent-required                                             // 19
var userAgent = "Meteor";                                                                          // 20
if (Meteor.release)                                                                                // 21
  userAgent += "/" + Meteor.release;                                                               // 22
                                                                                                   // 23
var getAccessToken = function (query) {                                                            // 24
  var config = ServiceConfiguration.configurations.findOne({service: 'github'});                   // 25
  if (!config)                                                                                     // 26
    throw new ServiceConfiguration.ConfigError("Service not configured");                          // 27
                                                                                                   // 28
  var response;                                                                                    // 29
  try {                                                                                            // 30
    response = HTTP.post(                                                                          // 31
      "https://github.com/login/oauth/access_token", {                                             // 32
        headers: {                                                                                 // 33
          Accept: 'application/json',                                                              // 34
          "User-Agent": userAgent                                                                  // 35
        },                                                                                         // 36
        params: {                                                                                  // 37
          code: query.code,                                                                        // 38
          client_id: config.clientId,                                                              // 39
          client_secret: config.secret,                                                            // 40
          redirect_uri: Meteor.absoluteUrl("_oauth/github?close"),                                 // 41
          state: query.state                                                                       // 42
        }                                                                                          // 43
      });                                                                                          // 44
  } catch (err) {                                                                                  // 45
    throw _.extend(new Error("Failed to complete OAuth handshake with Github. " + err.message),    // 46
                   {response: err.response});                                                      // 47
  }                                                                                                // 48
  if (response.data.error) { // if the http response was a json object with an error attribute     // 49
    throw new Error("Failed to complete OAuth handshake with GitHub. " + response.data.error);     // 50
  } else {                                                                                         // 51
    return response.data.access_token;                                                             // 52
  }                                                                                                // 53
};                                                                                                 // 54
                                                                                                   // 55
var getIdentity = function (accessToken) {                                                         // 56
  try {                                                                                            // 57
    return HTTP.get(                                                                               // 58
      "https://api.github.com/user", {                                                             // 59
        headers: {"User-Agent": userAgent}, // http://developer.github.com/v3/#user-agent-required // 60
        params: {access_token: accessToken}                                                        // 61
      }).data;                                                                                     // 62
  } catch (err) {                                                                                  // 63
    throw _.extend(new Error("Failed to fetch identity from Github. " + err.message),              // 64
                   {response: err.response});                                                      // 65
  }                                                                                                // 66
};                                                                                                 // 67
                                                                                                   // 68
                                                                                                   // 69
Github.retrieveCredential = function(credentialToken) {                                            // 70
  return Oauth.retrieveCredential(credentialToken);                                                // 71
};                                                                                                 // 72
                                                                                                   // 73
/////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);


/* Exports */
if (typeof Package === 'undefined') Package = {};
Package.github = {
  Github: Github
};

})();
