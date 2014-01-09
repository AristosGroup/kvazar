(function () {

/* Imports */
var Meteor = Package.meteor.Meteor;
var Oauth = Package.oauth.Oauth;
var HTTP = Package.http.HTTP;
var _ = Package.underscore._;
var ServiceConfiguration = Package['service-configuration'].ServiceConfiguration;

/* Package-scope variables */
var Google;

(function () {

//////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                              //
// packages/google/google_server.js                                                             //
//                                                                                              //
//////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                //
Google = {};                                                                                    // 1
                                                                                                // 2
// https://developers.google.com/accounts/docs/OAuth2Login#userinfocall                         // 3
Google.whitelistedFields = ['id', 'email', 'verified_email', 'name', 'given_name',              // 4
                   'family_name', 'picture', 'locale', 'timezone', 'gender'];                   // 5
                                                                                                // 6
                                                                                                // 7
Oauth.registerService('google', 2, null, function(query) {                                      // 8
                                                                                                // 9
  var response = getTokens(query);                                                              // 10
  var accessToken = response.accessToken;                                                       // 11
  var identity = getIdentity(accessToken);                                                      // 12
                                                                                                // 13
  var serviceData = {                                                                           // 14
    accessToken: accessToken,                                                                   // 15
    expiresAt: (+new Date) + (1000 * response.expiresIn)                                        // 16
  };                                                                                            // 17
                                                                                                // 18
  var fields = _.pick(identity, Google.whitelistedFields);                                      // 19
  _.extend(serviceData, fields);                                                                // 20
                                                                                                // 21
  // only set the token in serviceData if it's there. this ensures                              // 22
  // that we don't lose old ones (since we only get this on the first                           // 23
  // log in attempt)                                                                            // 24
  if (response.refreshToken)                                                                    // 25
    serviceData.refreshToken = response.refreshToken;                                           // 26
                                                                                                // 27
  return {                                                                                      // 28
    serviceData: serviceData,                                                                   // 29
    options: {profile: {name: identity.name}}                                                   // 30
  };                                                                                            // 31
});                                                                                             // 32
                                                                                                // 33
// returns an object containing:                                                                // 34
// - accessToken                                                                                // 35
// - expiresIn: lifetime of token in seconds                                                    // 36
// - refreshToken, if this is the first authorization request                                   // 37
var getTokens = function (query) {                                                              // 38
  var config = ServiceConfiguration.configurations.findOne({service: 'google'});                // 39
  if (!config)                                                                                  // 40
    throw new ServiceConfiguration.ConfigError("Service not configured");                       // 41
                                                                                                // 42
  var response;                                                                                 // 43
  try {                                                                                         // 44
    response = HTTP.post(                                                                       // 45
      "https://accounts.google.com/o/oauth2/token", {params: {                                  // 46
        code: query.code,                                                                       // 47
        client_id: config.clientId,                                                             // 48
        client_secret: config.secret,                                                           // 49
        redirect_uri: Meteor.absoluteUrl("_oauth/google?close"),                                // 50
        grant_type: 'authorization_code'                                                        // 51
      }});                                                                                      // 52
  } catch (err) {                                                                               // 53
    throw _.extend(new Error("Failed to complete OAuth handshake with Google. " + err.message), // 54
                   {response: err.response});                                                   // 55
  }                                                                                             // 56
                                                                                                // 57
  if (response.data.error) { // if the http response was a json object with an error attribute  // 58
    throw new Error("Failed to complete OAuth handshake with Google. " + response.data.error);  // 59
  } else {                                                                                      // 60
    return {                                                                                    // 61
      accessToken: response.data.access_token,                                                  // 62
      refreshToken: response.data.refresh_token,                                                // 63
      expiresIn: response.data.expires_in                                                       // 64
    };                                                                                          // 65
  }                                                                                             // 66
};                                                                                              // 67
                                                                                                // 68
var getIdentity = function (accessToken) {                                                      // 69
  try {                                                                                         // 70
    return HTTP.get(                                                                            // 71
      "https://www.googleapis.com/oauth2/v1/userinfo",                                          // 72
      {params: {access_token: accessToken}}).data;                                              // 73
  } catch (err) {                                                                               // 74
    throw _.extend(new Error("Failed to fetch identity from Google. " + err.message),           // 75
                   {response: err.response});                                                   // 76
  }                                                                                             // 77
};                                                                                              // 78
                                                                                                // 79
                                                                                                // 80
Google.retrieveCredential = function(credentialToken) {                                         // 81
  return Oauth.retrieveCredential(credentialToken);                                             // 82
};                                                                                              // 83
                                                                                                // 84
//////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);


/* Exports */
if (typeof Package === 'undefined') Package = {};
Package.google = {
  Google: Google
};

})();
