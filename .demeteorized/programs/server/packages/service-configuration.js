(function () {

/* Imports */
var Meteor = Package.meteor.Meteor;
var MongoInternals = Package['mongo-livedata'].MongoInternals;

/* Package-scope variables */
var ServiceConfiguration;

(function () {

////////////////////////////////////////////////////////////////////////////////////////
//                                                                                    //
// packages/service-configuration/service_configuration_common.js                     //
//                                                                                    //
////////////////////////////////////////////////////////////////////////////////////////
                                                                                      //
if (typeof ServiceConfiguration === 'undefined') {                                    // 1
  ServiceConfiguration = {};                                                          // 2
}                                                                                     // 3
                                                                                      // 4
                                                                                      // 5
// Table containing documents with configuration options for each                     // 6
// login service                                                                      // 7
ServiceConfiguration.configurations = new Meteor.Collection(                          // 8
  "meteor_accounts_loginServiceConfiguration", {_preventAutopublish: true});          // 9
// Leave this collection open in insecure mode. In theory, someone could              // 10
// hijack your oauth connect requests to a different endpoint or appId,               // 11
// but you did ask for 'insecure'. The advantage is that it is much                   // 12
// easier to write a configuration wizard that works only in insecure                 // 13
// mode.                                                                              // 14
                                                                                      // 15
                                                                                      // 16
// Thrown when trying to use a login service which is not configured                  // 17
ServiceConfiguration.ConfigError = function(description) {                            // 18
  this.message = description;                                                         // 19
};                                                                                    // 20
ServiceConfiguration.ConfigError.prototype = new Error();                             // 21
ServiceConfiguration.ConfigError.prototype.name = 'ServiceConfiguration.ConfigError'; // 22
                                                                                      // 23
////////////////////////////////////////////////////////////////////////////////////////

}).call(this);


/* Exports */
if (typeof Package === 'undefined') Package = {};
Package['service-configuration'] = {
  ServiceConfiguration: ServiceConfiguration
};

})();
