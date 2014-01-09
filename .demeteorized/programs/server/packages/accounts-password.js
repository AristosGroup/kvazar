(function () {

/* Imports */
var Meteor = Package.meteor.Meteor;
var Accounts = Package['accounts-base'].Accounts;
var SRP = Package.srp.SRP;
var Email = Package.email.Email;
var Random = Package.random.Random;
var check = Package.check.check;
var Match = Package.check.Match;
var _ = Package.underscore._;
var DDP = Package.livedata.DDP;
var DDPServer = Package.livedata.DDPServer;

(function () {

////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                            //
// packages/accounts-password/email_templates.js                                              //
//                                                                                            //
////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                              //
Accounts.emailTemplates = {                                                                   // 1
  from: "Meteor Accounts <no-reply@meteor.com>",                                              // 2
  siteName: Meteor.absoluteUrl().replace(/^https?:\/\//, '').replace(/\/$/, ''),              // 3
                                                                                              // 4
  resetPassword: {                                                                            // 5
    subject: function(user) {                                                                 // 6
      return "How to reset your password on " + Accounts.emailTemplates.siteName;             // 7
    },                                                                                        // 8
    text: function(user, url) {                                                               // 9
      var greeting = (user.profile && user.profile.name) ?                                    // 10
            ("Hello " + user.profile.name + ",") : "Hello,";                                  // 11
      return greeting + "\n"                                                                  // 12
        + "\n"                                                                                // 13
        + "To reset your password, simply click the link below.\n"                            // 14
        + "\n"                                                                                // 15
        + url + "\n"                                                                          // 16
        + "\n"                                                                                // 17
        + "Thanks.\n";                                                                        // 18
    }                                                                                         // 19
  },                                                                                          // 20
  verifyEmail: {                                                                              // 21
    subject: function(user) {                                                                 // 22
      return "How to verify email address on " + Accounts.emailTemplates.siteName;            // 23
    },                                                                                        // 24
    text: function(user, url) {                                                               // 25
      var greeting = (user.profile && user.profile.name) ?                                    // 26
            ("Hello " + user.profile.name + ",") : "Hello,";                                  // 27
      return greeting + "\n"                                                                  // 28
        + "\n"                                                                                // 29
        + "To verify your account email, simply click the link below.\n"                      // 30
        + "\n"                                                                                // 31
        + url + "\n"                                                                          // 32
        + "\n"                                                                                // 33
        + "Thanks.\n";                                                                        // 34
    }                                                                                         // 35
  },                                                                                          // 36
  enrollAccount: {                                                                            // 37
    subject: function(user) {                                                                 // 38
      return "An account has been created for you on " + Accounts.emailTemplates.siteName;    // 39
    },                                                                                        // 40
    text: function(user, url) {                                                               // 41
      var greeting = (user.profile && user.profile.name) ?                                    // 42
            ("Hello " + user.profile.name + ",") : "Hello,";                                  // 43
      return greeting + "\n"                                                                  // 44
        + "\n"                                                                                // 45
        + "To start using the service, simply click the link below.\n"                        // 46
        + "\n"                                                                                // 47
        + url + "\n"                                                                          // 48
        + "\n"                                                                                // 49
        + "Thanks.\n";                                                                        // 50
    }                                                                                         // 51
  }                                                                                           // 52
};                                                                                            // 53
                                                                                              // 54
////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                            //
// packages/accounts-password/password_server.js                                              //
//                                                                                            //
////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                              //
///                                                                                           // 1
/// LOGIN                                                                                     // 2
///                                                                                           // 3
                                                                                              // 4
// Users can specify various keys to identify themselves with.                                // 5
// @param user {Object} with one of `id`, `username`, or `email`.                             // 6
// @returns A selector to pass to mongo to get the user record.                               // 7
                                                                                              // 8
var selectorFromUserQuery = function (user) {                                                 // 9
  if (user.id)                                                                                // 10
    return {_id: user.id};                                                                    // 11
  else if (user.username)                                                                     // 12
    return {username: user.username};                                                         // 13
  else if (user.email)                                                                        // 14
    return {"emails.address": user.email};                                                    // 15
  throw new Error("shouldn't happen (validation missed something)");                          // 16
};                                                                                            // 17
                                                                                              // 18
// XXX maybe this belongs in the check package                                                // 19
var NonEmptyString = Match.Where(function (x) {                                               // 20
  check(x, String);                                                                           // 21
  return x.length > 0;                                                                        // 22
});                                                                                           // 23
                                                                                              // 24
var userQueryValidator = Match.Where(function (user) {                                        // 25
  check(user, {                                                                               // 26
    id: Match.Optional(NonEmptyString),                                                       // 27
    username: Match.Optional(NonEmptyString),                                                 // 28
    email: Match.Optional(NonEmptyString)                                                     // 29
  });                                                                                         // 30
  if (_.keys(user).length !== 1)                                                              // 31
    throw new Match.Error("User property must have exactly one field");                       // 32
  return true;                                                                                // 33
});                                                                                           // 34
                                                                                              // 35
// Step 1 of SRP password exchange. This puts an `M` value in the                             // 36
// session data for this connection. If a client later sends the same                         // 37
// `M` value to a method on this connection, it proves they know the                          // 38
// password for this user. We can then prove we know the password to                          // 39
// them by sending our `HAMK` value.                                                          // 40
//                                                                                            // 41
// @param request {Object} with fields:                                                       // 42
//   user: either {username: (username)}, {email: (email)}, or {id: (userId)}                 // 43
//   A: hex encoded int. the client's public key for this exchange                            // 44
// @returns {Object} with fields:                                                             // 45
//   identity: random string ID                                                               // 46
//   salt: random string ID                                                                   // 47
//   B: hex encoded int. server's public key for this exchange                                // 48
Meteor.methods({beginPasswordExchange: function (request) {                                   // 49
  check(request, {                                                                            // 50
    user: userQueryValidator,                                                                 // 51
    A: String                                                                                 // 52
  });                                                                                         // 53
  var selector = selectorFromUserQuery(request.user);                                         // 54
                                                                                              // 55
  var user = Meteor.users.findOne(selector);                                                  // 56
  if (!user)                                                                                  // 57
    throw new Meteor.Error(403, "User not found");                                            // 58
                                                                                              // 59
  if (!user.services || !user.services.password ||                                            // 60
      !user.services.password.srp)                                                            // 61
    throw new Meteor.Error(403, "User has no password set");                                  // 62
                                                                                              // 63
  var verifier = user.services.password.srp;                                                  // 64
  var srp = new SRP.Server(verifier);                                                         // 65
  var challenge = srp.issueChallenge({A: request.A});                                         // 66
                                                                                              // 67
  // Save results so we can verify them later.                                                // 68
  Accounts._setAccountData(this.connection.id, 'srpChallenge',                                // 69
    { userId: user._id, M: srp.M, HAMK: srp.HAMK }                                            // 70
  );                                                                                          // 71
  return challenge;                                                                           // 72
}});                                                                                          // 73
                                                                                              // 74
// Handler to login with password via SRP. Checks the `M` value set by                        // 75
// beginPasswordExchange.                                                                     // 76
Accounts.registerLoginHandler(function (options) {                                            // 77
  if (!options.srp)                                                                           // 78
    return undefined; // don't handle                                                         // 79
  check(options.srp, {M: String});                                                            // 80
                                                                                              // 81
  // we're always called from within a 'login' method, so this should                         // 82
  // be safe.                                                                                 // 83
  var currentInvocation = DDP._CurrentInvocation.get();                                       // 84
  var serialized = Accounts._getAccountData(currentInvocation.connection.id, 'srpChallenge'); // 85
  if (!serialized || serialized.M !== options.srp.M)                                          // 86
    throw new Meteor.Error(403, "Incorrect password");                                        // 87
  // Only can use challenges once.                                                            // 88
  Accounts._setAccountData(currentInvocation.connection.id, 'srpChallenge', undefined);       // 89
                                                                                              // 90
  var userId = serialized.userId;                                                             // 91
  var user = Meteor.users.findOne(userId);                                                    // 92
  // Was the user deleted since the start of this challenge?                                  // 93
  if (!user)                                                                                  // 94
    throw new Meteor.Error(403, "User not found");                                            // 95
  var stampedLoginToken = Accounts._generateStampedLoginToken();                              // 96
  Meteor.users.update(                                                                        // 97
    userId, {$push: {'services.resume.loginTokens': stampedLoginToken}});                     // 98
                                                                                              // 99
  return {                                                                                    // 100
    token: stampedLoginToken.token,                                                           // 101
    tokenExpires: Accounts._tokenExpiration(stampedLoginToken.when),                          // 102
    id: userId,                                                                               // 103
    HAMK: serialized.HAMK                                                                     // 104
  };                                                                                          // 105
});                                                                                           // 106
                                                                                              // 107
// Handler to login with plaintext password.                                                  // 108
//                                                                                            // 109
// The meteor client doesn't use this, it is for other DDP clients who                        // 110
// haven't implemented SRP. Since it sends the password in plaintext                          // 111
// over the wire, it should only be run over SSL!                                             // 112
//                                                                                            // 113
// Also, it might be nice if servers could turn this off. Or maybe it                         // 114
// should be opt-in, not opt-out? Accounts.config option?                                     // 115
Accounts.registerLoginHandler(function (options) {                                            // 116
  if (!options.password || !options.user)                                                     // 117
    return undefined; // don't handle                                                         // 118
                                                                                              // 119
  check(options, {user: userQueryValidator, password: String});                               // 120
                                                                                              // 121
  var selector = selectorFromUserQuery(options.user);                                         // 122
  var user = Meteor.users.findOne(selector);                                                  // 123
  if (!user)                                                                                  // 124
    throw new Meteor.Error(403, "User not found");                                            // 125
                                                                                              // 126
  if (!user.services || !user.services.password ||                                            // 127
      !user.services.password.srp)                                                            // 128
    throw new Meteor.Error(403, "User has no password set");                                  // 129
                                                                                              // 130
  // Just check the verifier output when the same identity and salt                           // 131
  // are passed. Don't bother with a full exchange.                                           // 132
  var verifier = user.services.password.srp;                                                  // 133
  var newVerifier = SRP.generateVerifier(options.password, {                                  // 134
    identity: verifier.identity, salt: verifier.salt});                                       // 135
                                                                                              // 136
  if (verifier.verifier !== newVerifier.verifier)                                             // 137
    throw new Meteor.Error(403, "Incorrect password");                                        // 138
                                                                                              // 139
  var stampedLoginToken = Accounts._generateStampedLoginToken();                              // 140
  Meteor.users.update(                                                                        // 141
    user._id, {$push: {'services.resume.loginTokens': stampedLoginToken}});                   // 142
                                                                                              // 143
  return {                                                                                    // 144
    token: stampedLoginToken.token,                                                           // 145
    tokenExpires: Accounts._tokenExpiration(stampedLoginToken.when),                          // 146
    id: user._id                                                                              // 147
  };                                                                                          // 148
});                                                                                           // 149
                                                                                              // 150
                                                                                              // 151
///                                                                                           // 152
/// CHANGING                                                                                  // 153
///                                                                                           // 154
                                                                                              // 155
// Let the user change their own password if they know the old                                // 156
// password. Checks the `M` value set by beginPasswordExchange.                               // 157
Meteor.methods({changePassword: function (options) {                                          // 158
  if (!this.userId)                                                                           // 159
    throw new Meteor.Error(401, "Must be logged in");                                         // 160
  check(options, {                                                                            // 161
    // If options.M is set, it means we went through a challenge with the old                 // 162
    // password. For now, we don't allow changePassword without knowing the old               // 163
    // password.                                                                              // 164
    M: String,                                                                                // 165
    srp: Match.Optional(SRP.matchVerifier),                                                   // 166
    password: Match.Optional(String)                                                          // 167
  });                                                                                         // 168
                                                                                              // 169
  var serialized = Accounts._getAccountData(this.connection.id, 'srpChallenge');              // 170
  if (!serialized || serialized.M !== options.M)                                              // 171
    throw new Meteor.Error(403, "Incorrect password");                                        // 172
  if (serialized.userId !== this.userId)                                                      // 173
    // No monkey business!                                                                    // 174
    throw new Meteor.Error(403, "Incorrect password");                                        // 175
  // Only can use challenges once.                                                            // 176
  Accounts._setAccountData(this.connection.id, 'srpChallenge', undefined);                    // 177
                                                                                              // 178
  var verifier = options.srp;                                                                 // 179
  if (!verifier && options.password) {                                                        // 180
    verifier = SRP.generateVerifier(options.password);                                        // 181
  }                                                                                           // 182
  if (!verifier)                                                                              // 183
    throw new Meteor.Error(400, "Invalid verifier");                                          // 184
                                                                                              // 185
  // XXX this should invalidate all login tokens other than the current one                   // 186
  // (or it should assign a new login token, replacing existing ones)                         // 187
  Meteor.users.update({_id: this.userId},                                                     // 188
                      {$set: {'services.password.srp': verifier}});                           // 189
                                                                                              // 190
  var ret = {passwordChanged: true};                                                          // 191
  if (serialized)                                                                             // 192
    ret.HAMK = serialized.HAMK;                                                               // 193
  return ret;                                                                                 // 194
}});                                                                                          // 195
                                                                                              // 196
                                                                                              // 197
// Force change the users password.                                                           // 198
Accounts.setPassword = function (userId, newPassword) {                                       // 199
  var user = Meteor.users.findOne(userId);                                                    // 200
  if (!user)                                                                                  // 201
    throw new Meteor.Error(403, "User not found");                                            // 202
  var newVerifier = SRP.generateVerifier(newPassword);                                        // 203
                                                                                              // 204
  Meteor.users.update({_id: user._id}, {                                                      // 205
    $set: {'services.password.srp': newVerifier}});                                           // 206
};                                                                                            // 207
                                                                                              // 208
                                                                                              // 209
///                                                                                           // 210
/// RESETTING VIA EMAIL                                                                       // 211
///                                                                                           // 212
                                                                                              // 213
// Method called by a user to request a password reset email. This is                         // 214
// the start of the reset process.                                                            // 215
Meteor.methods({forgotPassword: function (options) {                                          // 216
  check(options, {email: String});                                                            // 217
                                                                                              // 218
  var user = Meteor.users.findOne({"emails.address": options.email});                         // 219
  if (!user)                                                                                  // 220
    throw new Meteor.Error(403, "User not found");                                            // 221
                                                                                              // 222
  Accounts.sendResetPasswordEmail(user._id, options.email);                                   // 223
}});                                                                                          // 224
                                                                                              // 225
// send the user an email with a link that when opened allows the user                        // 226
// to set a new password, without the old password.                                           // 227
//                                                                                            // 228
Accounts.sendResetPasswordEmail = function (userId, email) {                                  // 229
  // Make sure the user exists, and email is one of their addresses.                          // 230
  var user = Meteor.users.findOne(userId);                                                    // 231
  if (!user)                                                                                  // 232
    throw new Error("Can't find user");                                                       // 233
  // pick the first email if we weren't passed an email.                                      // 234
  if (!email && user.emails && user.emails[0])                                                // 235
    email = user.emails[0].address;                                                           // 236
  // make sure we have a valid email                                                          // 237
  if (!email || !_.contains(_.pluck(user.emails || [], 'address'), email))                    // 238
    throw new Error("No such email for user.");                                               // 239
                                                                                              // 240
  var token = Random.id();                                                                    // 241
  var when = new Date();                                                                      // 242
  Meteor.users.update(userId, {$set: {                                                        // 243
    "services.password.reset": {                                                              // 244
      token: token,                                                                           // 245
      email: email,                                                                           // 246
      when: when                                                                              // 247
    }                                                                                         // 248
  }});                                                                                        // 249
                                                                                              // 250
  var resetPasswordUrl = Accounts.urls.resetPassword(token);                                  // 251
  Email.send({                                                                                // 252
    to: email,                                                                                // 253
    from: Accounts.emailTemplates.from,                                                       // 254
    subject: Accounts.emailTemplates.resetPassword.subject(user),                             // 255
    text: Accounts.emailTemplates.resetPassword.text(user, resetPasswordUrl)});               // 256
};                                                                                            // 257
                                                                                              // 258
// send the user an email informing them that their account was created, with                 // 259
// a link that when opened both marks their email as verified and forces them                 // 260
// to choose their password. The email must be one of the addresses in the                    // 261
// user's emails field, or undefined to pick the first email automatically.                   // 262
//                                                                                            // 263
// This is not called automatically. It must be called manually if you                        // 264
// want to use enrollment emails.                                                             // 265
//                                                                                            // 266
Accounts.sendEnrollmentEmail = function (userId, email) {                                     // 267
  // XXX refactor! This is basically identical to sendResetPasswordEmail.                     // 268
                                                                                              // 269
  // Make sure the user exists, and email is in their addresses.                              // 270
  var user = Meteor.users.findOne(userId);                                                    // 271
  if (!user)                                                                                  // 272
    throw new Error("Can't find user");                                                       // 273
  // pick the first email if we weren't passed an email.                                      // 274
  if (!email && user.emails && user.emails[0])                                                // 275
    email = user.emails[0].address;                                                           // 276
  // make sure we have a valid email                                                          // 277
  if (!email || !_.contains(_.pluck(user.emails || [], 'address'), email))                    // 278
    throw new Error("No such email for user.");                                               // 279
                                                                                              // 280
                                                                                              // 281
  var token = Random.id();                                                                    // 282
  var when = new Date();                                                                      // 283
  Meteor.users.update(userId, {$set: {                                                        // 284
    "services.password.reset": {                                                              // 285
      token: token,                                                                           // 286
      email: email,                                                                           // 287
      when: when                                                                              // 288
    }                                                                                         // 289
  }});                                                                                        // 290
                                                                                              // 291
  var enrollAccountUrl = Accounts.urls.enrollAccount(token);                                  // 292
  Email.send({                                                                                // 293
    to: email,                                                                                // 294
    from: Accounts.emailTemplates.from,                                                       // 295
    subject: Accounts.emailTemplates.enrollAccount.subject(user),                             // 296
    text: Accounts.emailTemplates.enrollAccount.text(user, enrollAccountUrl)                  // 297
  });                                                                                         // 298
};                                                                                            // 299
                                                                                              // 300
                                                                                              // 301
// Take token from sendResetPasswordEmail or sendEnrollmentEmail, change                      // 302
// the users password, and log them in.                                                       // 303
Meteor.methods({resetPassword: function (token, newVerifier) {                                // 304
  check(token, String);                                                                       // 305
  check(newVerifier, SRP.matchVerifier);                                                      // 306
                                                                                              // 307
  var user = Meteor.users.findOne({                                                           // 308
    "services.password.reset.token": ""+token});                                              // 309
  if (!user)                                                                                  // 310
    throw new Meteor.Error(403, "Token expired");                                             // 311
  var email = user.services.password.reset.email;                                             // 312
  if (!_.include(_.pluck(user.emails || [], 'address'), email))                               // 313
    throw new Meteor.Error(403, "Token has invalid email address");                           // 314
                                                                                              // 315
  var stampedLoginToken = Accounts._generateStampedLoginToken();                              // 316
                                                                                              // 317
  // NOTE: We're about to invalidate tokens on the user, who we might be                      // 318
  // logged in as. Make sure to avoid logging ourselves out if this                           // 319
  // happens. But also make sure not to leave the connection in a state                       // 320
  // of having a bad token set if things fail.                                                // 321
  var oldToken = Accounts._getLoginToken(this.connection.id);                                 // 322
  Accounts._setLoginToken(this.connection.id, null);                                          // 323
                                                                                              // 324
  try {                                                                                       // 325
    // Update the user record by:                                                             // 326
    // - Changing the password verifier to the new one                                        // 327
    // - Replacing all valid login tokens with new ones (changing                             // 328
    //   password should invalidate existing sessions).                                       // 329
    // - Forgetting about the reset token that was just used                                  // 330
    // - Verifying their email, since they got the password reset via email.                  // 331
    Meteor.users.update({_id: user._id, 'emails.address': email}, {                           // 332
      $set: {'services.password.srp': newVerifier,                                            // 333
             'services.resume.loginTokens': [stampedLoginToken],                              // 334
             'emails.$.verified': true},                                                      // 335
      $unset: {'services.password.reset': 1}                                                  // 336
    });                                                                                       // 337
  } catch (err) {                                                                             // 338
    // update failed somehow. reset to old token.                                             // 339
    Accounts._setLoginToken(this.connection.id, oldToken);                                    // 340
    throw err;                                                                                // 341
  }                                                                                           // 342
                                                                                              // 343
  Accounts._setLoginToken(this.connection.id, stampedLoginToken.token);                       // 344
  this.setUserId(user._id);                                                                   // 345
                                                                                              // 346
  return {                                                                                    // 347
    token: stampedLoginToken.token,                                                           // 348
    tokenExpires: Accounts._tokenExpiration(stampedLoginToken.when),                          // 349
    id: user._id                                                                              // 350
  };                                                                                          // 351
}});                                                                                          // 352
                                                                                              // 353
///                                                                                           // 354
/// EMAIL VERIFICATION                                                                        // 355
///                                                                                           // 356
                                                                                              // 357
                                                                                              // 358
// send the user an email with a link that when opened marks that                             // 359
// address as verified                                                                        // 360
//                                                                                            // 361
Accounts.sendVerificationEmail = function (userId, address) {                                 // 362
  // XXX Also generate a link using which someone can delete this                             // 363
  // account if they own said address but weren't those who created                           // 364
  // this account.                                                                            // 365
                                                                                              // 366
  // Make sure the user exists, and address is one of their addresses.                        // 367
  var user = Meteor.users.findOne(userId);                                                    // 368
  if (!user)                                                                                  // 369
    throw new Error("Can't find user");                                                       // 370
  // pick the first unverified address if we weren't passed an address.                       // 371
  if (!address) {                                                                             // 372
    var email = _.find(user.emails || [],                                                     // 373
                       function (e) { return !e.verified; });                                 // 374
    address = (email || {}).address;                                                          // 375
  }                                                                                           // 376
  // make sure we have a valid address                                                        // 377
  if (!address || !_.contains(_.pluck(user.emails || [], 'address'), address))                // 378
    throw new Error("No such email address for user.");                                       // 379
                                                                                              // 380
                                                                                              // 381
  var tokenRecord = {                                                                         // 382
    token: Random.id(),                                                                       // 383
    address: address,                                                                         // 384
    when: new Date()};                                                                        // 385
  Meteor.users.update(                                                                        // 386
    {_id: userId},                                                                            // 387
    {$push: {'services.email.verificationTokens': tokenRecord}});                             // 388
                                                                                              // 389
  var verifyEmailUrl = Accounts.urls.verifyEmail(tokenRecord.token);                          // 390
  Email.send({                                                                                // 391
    to: address,                                                                              // 392
    from: Accounts.emailTemplates.from,                                                       // 393
    subject: Accounts.emailTemplates.verifyEmail.subject(user),                               // 394
    text: Accounts.emailTemplates.verifyEmail.text(user, verifyEmailUrl)                      // 395
  });                                                                                         // 396
};                                                                                            // 397
                                                                                              // 398
// Take token from sendVerificationEmail, mark the email as verified,                         // 399
// and log them in.                                                                           // 400
Meteor.methods({verifyEmail: function (token) {                                               // 401
  check(token, String);                                                                       // 402
                                                                                              // 403
  var user = Meteor.users.findOne(                                                            // 404
    {'services.email.verificationTokens.token': token});                                      // 405
  if (!user)                                                                                  // 406
    throw new Meteor.Error(403, "Verify email link expired");                                 // 407
                                                                                              // 408
  var tokenRecord = _.find(user.services.email.verificationTokens,                            // 409
                           function (t) {                                                     // 410
                             return t.token == token;                                         // 411
                           });                                                                // 412
  if (!tokenRecord)                                                                           // 413
    throw new Meteor.Error(403, "Verify email link expired");                                 // 414
                                                                                              // 415
  var emailsRecord = _.find(user.emails, function (e) {                                       // 416
    return e.address == tokenRecord.address;                                                  // 417
  });                                                                                         // 418
  if (!emailsRecord)                                                                          // 419
    throw new Meteor.Error(403, "Verify email link is for unknown address");                  // 420
                                                                                              // 421
  // Log the user in with a new login token.                                                  // 422
  var stampedLoginToken = Accounts._generateStampedLoginToken();                              // 423
                                                                                              // 424
  // By including the address in the query, we can use 'emails.$' in the                      // 425
  // modifier to get a reference to the specific object in the emails                         // 426
  // array. See                                                                               // 427
  // http://www.mongodb.org/display/DOCS/Updating/#Updating-The%24positionaloperator)         // 428
  // http://www.mongodb.org/display/DOCS/Updating#Updating-%24pull                            // 429
  Meteor.users.update(                                                                        // 430
    {_id: user._id,                                                                           // 431
     'emails.address': tokenRecord.address},                                                  // 432
    {$set: {'emails.$.verified': true},                                                       // 433
     $pull: {'services.email.verificationTokens': {token: token}},                            // 434
     $push: {'services.resume.loginTokens': stampedLoginToken}});                             // 435
                                                                                              // 436
  this.setUserId(user._id);                                                                   // 437
  Accounts._setLoginToken(this.connection.id, stampedLoginToken.token);                       // 438
  return {                                                                                    // 439
    token: stampedLoginToken.token,                                                           // 440
    tokenExpires: Accounts._tokenExpiration(stampedLoginToken.when),                          // 441
    id: user._id                                                                              // 442
  };                                                                                          // 443
}});                                                                                          // 444
                                                                                              // 445
                                                                                              // 446
                                                                                              // 447
///                                                                                           // 448
/// CREATING USERS                                                                            // 449
///                                                                                           // 450
                                                                                              // 451
// Shared createUser function called from the createUser method, both                         // 452
// if originates in client or server code. Calls user provided hooks,                         // 453
// does the actual user insertion.                                                            // 454
//                                                                                            // 455
// returns an object with id: userId, and (if options.generateLoginToken is                   // 456
// set) token: loginToken.                                                                    // 457
var createUser = function (options) {                                                         // 458
  // Unknown keys allowed, because a onCreateUserHook can take arbitrary                      // 459
  // options.                                                                                 // 460
  check(options, Match.ObjectIncluding({                                                      // 461
    generateLoginToken: Boolean,                                                              // 462
    username: Match.Optional(String),                                                         // 463
    email: Match.Optional(String),                                                            // 464
    password: Match.Optional(String),                                                         // 465
    srp: Match.Optional(SRP.matchVerifier)                                                    // 466
  }));                                                                                        // 467
                                                                                              // 468
  var username = options.username;                                                            // 469
  var email = options.email;                                                                  // 470
  if (!username && !email)                                                                    // 471
    throw new Meteor.Error(400, "Need to set a username or email");                           // 472
                                                                                              // 473
  // Raw password. The meteor client doesn't send this, but a DDP                             // 474
  // client that didn't implement SRP could send this. This should                            // 475
  // only be done over SSL.                                                                   // 476
  if (options.password) {                                                                     // 477
    if (options.srp)                                                                          // 478
      throw new Meteor.Error(400, "Don't pass both password and srp in options");             // 479
    options.srp = SRP.generateVerifier(options.password);                                     // 480
  }                                                                                           // 481
                                                                                              // 482
  var user = {services: {}};                                                                  // 483
  if (options.srp)                                                                            // 484
    user.services.password = {srp: options.srp}; // XXX validate verifier                     // 485
  if (username)                                                                               // 486
    user.username = username;                                                                 // 487
  if (email)                                                                                  // 488
    user.emails = [{address: email, verified: false}];                                        // 489
                                                                                              // 490
  return Accounts.insertUserDoc(options, user);                                               // 491
};                                                                                            // 492
                                                                                              // 493
// method for create user. Requests come from the client.                                     // 494
Meteor.methods({createUser: function (options) {                                              // 495
  // createUser() above does more checking.                                                   // 496
  check(options, Object);                                                                     // 497
  options.generateLoginToken = true;                                                          // 498
  if (Accounts._options.forbidClientAccountCreation)                                          // 499
    throw new Meteor.Error(403, "Signups forbidden");                                         // 500
                                                                                              // 501
  // Create user. result contains id and token.                                               // 502
  var result = createUser(options);                                                           // 503
  // safety belt. createUser is supposed to throw on error. send 500 error                    // 504
  // instead of sending a verification email with empty userid.                               // 505
  if (!result.id)                                                                             // 506
    throw new Error("createUser failed to insert new user");                                  // 507
                                                                                              // 508
  // If `Accounts._options.sendVerificationEmail` is set, register                            // 509
  // a token to verify the user's primary email, and send it to                               // 510
  // that address.                                                                            // 511
  if (options.email && Accounts._options.sendVerificationEmail)                               // 512
    Accounts.sendVerificationEmail(result.id, options.email);                                 // 513
                                                                                              // 514
  // client gets logged in as the new user afterwards.                                        // 515
  this.setUserId(result.id);                                                                  // 516
  Accounts._setLoginToken(this.connection.id, result.token);                                  // 517
  return result;                                                                              // 518
}});                                                                                          // 519
                                                                                              // 520
// Create user directly on the server.                                                        // 521
//                                                                                            // 522
// Unlike the client version, this does not log you in as this user                           // 523
// after creation.                                                                            // 524
//                                                                                            // 525
// returns userId or throws an error if it can't create                                       // 526
//                                                                                            // 527
// XXX add another argument ("server options") that gets sent to onCreateUser,                // 528
// which is always empty when called from the createUser method? eg, "admin:                  // 529
// true", which we want to prevent the client from setting, but which a custom                // 530
// method calling Accounts.createUser could set?                                              // 531
//                                                                                            // 532
Accounts.createUser = function (options, callback) {                                          // 533
  options = _.clone(options);                                                                 // 534
  options.generateLoginToken = false;                                                         // 535
                                                                                              // 536
  // XXX allow an optional callback?                                                          // 537
  if (callback) {                                                                             // 538
    throw new Error("Accounts.createUser with callback not supported on the server yet.");    // 539
  }                                                                                           // 540
                                                                                              // 541
  var userId = createUser(options).id;                                                        // 542
                                                                                              // 543
  return userId;                                                                              // 544
};                                                                                            // 545
                                                                                              // 546
///                                                                                           // 547
/// PASSWORD-SPECIFIC INDEXES ON USERS                                                        // 548
///                                                                                           // 549
Meteor.users._ensureIndex('emails.validationTokens.token',                                    // 550
                          {unique: 1, sparse: 1});                                            // 551
Meteor.users._ensureIndex('services.password.reset.token',                                    // 552
                          {unique: 1, sparse: 1});                                            // 553
                                                                                              // 554
////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);


/* Exports */
if (typeof Package === 'undefined') Package = {};
Package['accounts-password'] = {};

})();
