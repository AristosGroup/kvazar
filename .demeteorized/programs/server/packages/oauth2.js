(function () {

/* Imports */
var Meteor = Package.meteor.Meteor;
var ServiceConfiguration = Package['service-configuration'].ServiceConfiguration;
var Oauth = Package.oauth.Oauth;

(function () {

///////////////////////////////////////////////////////////////////////
//                                                                   //
// packages/oauth2/oauth2_server.js                                  //
//                                                                   //
///////////////////////////////////////////////////////////////////////
                                                                     //
// connect middleware                                                // 1
Oauth._requestHandlers['2'] = function (service, query, res) {       // 2
  // check if user authorized access                                 // 3
  if (!query.error) {                                                // 4
    // Prepare the login results before returning.  This way the     // 5
    // subsequent call to the `login` method will be immediate.      // 6
                                                                     // 7
    // Run service-specific handler.                                 // 8
    var oauthResult = service.handleOauthRequest(query);             // 9
                                                                     // 10
    // Add the login result to the result map                        // 11
    Oauth._loginResultForCredentialToken[query.state] = {            // 12
          serviceName: service.serviceName,                          // 13
          serviceData: oauthResult.serviceData,                      // 14
          options: oauthResult.options                               // 15
        };                                                           // 16
  }                                                                  // 17
                                                                     // 18
  // Either close the window, redirect, or render nothing            // 19
  // if all else fails                                               // 20
  Oauth._renderOauthResults(res, query);                             // 21
};                                                                   // 22
                                                                     // 23
///////////////////////////////////////////////////////////////////////

}).call(this);


/* Exports */
if (typeof Package === 'undefined') Package = {};
Package.oauth2 = {};

})();
