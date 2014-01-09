(function () {

/* Imports */
var Meteor = Package.meteor.Meteor;
var Log = Package.logging.Log;
var _ = Package.underscore._;
var RoutePolicy = Package.routepolicy.RoutePolicy;

/* Package-scope variables */
var WebApp, main, WebAppInternals;

(function () {

/////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                         //
// packages/webapp/webapp_server.js                                                                        //
//                                                                                                         //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                           //
////////// Requires //////////                                                                             // 1
                                                                                                           // 2
var fs = Npm.require("fs");                                                                                // 3
var http = Npm.require("http");                                                                            // 4
var os = Npm.require("os");                                                                                // 5
var path = Npm.require("path");                                                                            // 6
var url = Npm.require("url");                                                                              // 7
var crypto = Npm.require("crypto");                                                                        // 8
                                                                                                           // 9
var connect = Npm.require('connect');                                                                      // 10
var optimist = Npm.require('optimist');                                                                    // 11
var useragent = Npm.require('useragent');                                                                  // 12
var send = Npm.require('send');                                                                            // 13
                                                                                                           // 14
var SHORT_SOCKET_TIMEOUT = 5*1000;                                                                         // 15
var LONG_SOCKET_TIMEOUT = 120*1000;                                                                        // 16
                                                                                                           // 17
WebApp = {};                                                                                               // 18
WebAppInternals = {};                                                                                      // 19
                                                                                                           // 20
var bundledJsCssPrefix;                                                                                    // 21
                                                                                                           // 22
var makeAppNamePathPrefix = function (appName) {                                                           // 23
  return encodeURIComponent(appName).replace(/\./g, '_');                                                  // 24
};                                                                                                         // 25
// Keepalives so that when the outer server dies unceremoniously and                                       // 26
// doesn't kill us, we quit ourselves. A little gross, but better than                                     // 27
// pidfiles.                                                                                               // 28
// XXX This should really be part of the boot script, not the webapp package.                              // 29
//     Or we should just get rid of it, and rely on containerization.                                      // 30
                                                                                                           // 31
var initKeepalive = function () {                                                                          // 32
  var keepaliveCount = 0;                                                                                  // 33
                                                                                                           // 34
  process.stdin.on('data', function (data) {                                                               // 35
    keepaliveCount = 0;                                                                                    // 36
  });                                                                                                      // 37
                                                                                                           // 38
  process.stdin.resume();                                                                                  // 39
                                                                                                           // 40
  setInterval(function () {                                                                                // 41
    keepaliveCount ++;                                                                                     // 42
    if (keepaliveCount >= 3) {                                                                             // 43
      console.log("Failed to receive keepalive! Exiting.");                                                // 44
      process.exit(1);                                                                                     // 45
    }                                                                                                      // 46
  }, 3000);                                                                                                // 47
};                                                                                                         // 48
                                                                                                           // 49
                                                                                                           // 50
var sha1 = function (contents) {                                                                           // 51
  var hash = crypto.createHash('sha1');                                                                    // 52
  hash.update(contents);                                                                                   // 53
  return hash.digest('hex');                                                                               // 54
};                                                                                                         // 55
                                                                                                           // 56
// #BrowserIdentification                                                                                  // 57
//                                                                                                         // 58
// We have multiple places that want to identify the browser: the                                          // 59
// unsupported browser page, the appcache package, and, eventually                                         // 60
// delivering browser polyfills only as needed.                                                            // 61
//                                                                                                         // 62
// To avoid detecting the browser in multiple places ad-hoc, we create a                                   // 63
// Meteor "browser" object. It uses but does not expose the npm                                            // 64
// useragent module (we could choose a different mechanism to identify                                     // 65
// the browser in the future if we wanted to).  The browser object                                         // 66
// contains                                                                                                // 67
//                                                                                                         // 68
// * `name`: the name of the browser in camel case                                                         // 69
// * `major`, `minor`, `patch`: integers describing the browser version                                    // 70
//                                                                                                         // 71
// Also here is an early version of a Meteor `request` object, intended                                    // 72
// to be a high-level description of the request without exposing                                          // 73
// details of connect's low-level `req`.  Currently it contains:                                           // 74
//                                                                                                         // 75
// * `browser`: browser identification object described above                                              // 76
// * `url`: parsed url, including parsed query params                                                      // 77
//                                                                                                         // 78
// As a temporary hack there is a `categorizeRequest` function on WebApp which                             // 79
// converts a connect `req` to a Meteor `request`. This can go away once smart                             // 80
// packages such as appcache are being passed a `request` object directly when                             // 81
// they serve content.                                                                                     // 82
//                                                                                                         // 83
// This allows `request` to be used uniformly: it is passed to the html                                    // 84
// attributes hook, and the appcache package can use it when deciding                                      // 85
// whether to generate a 404 for the manifest.                                                             // 86
//                                                                                                         // 87
// Real routing / server side rendering will probably refactor this                                        // 88
// heavily.                                                                                                // 89
                                                                                                           // 90
                                                                                                           // 91
// e.g. "Mobile Safari" => "mobileSafari"                                                                  // 92
var camelCase = function (name) {                                                                          // 93
  var parts = name.split(' ');                                                                             // 94
  parts[0] = parts[0].toLowerCase();                                                                       // 95
  for (var i = 1;  i < parts.length;  ++i) {                                                               // 96
    parts[i] = parts[i].charAt(0).toUpperCase() + parts[i].substr(1);                                      // 97
  }                                                                                                        // 98
  return parts.join('');                                                                                   // 99
};                                                                                                         // 100
                                                                                                           // 101
var identifyBrowser = function (req) {                                                                     // 102
  var userAgent = useragent.lookup(req.headers['user-agent']);                                             // 103
  return {                                                                                                 // 104
    name: camelCase(userAgent.family),                                                                     // 105
    major: +userAgent.major,                                                                               // 106
    minor: +userAgent.minor,                                                                               // 107
    patch: +userAgent.patch                                                                                // 108
  };                                                                                                       // 109
};                                                                                                         // 110
                                                                                                           // 111
WebApp.categorizeRequest = function (req) {                                                                // 112
  return {                                                                                                 // 113
    browser: identifyBrowser(req),                                                                         // 114
    url: url.parse(req.url, true)                                                                          // 115
  };                                                                                                       // 116
};                                                                                                         // 117
                                                                                                           // 118
// HTML attribute hooks: functions to be called to determine any attributes to                             // 119
// be added to the '<html>' tag. Each function is passed a 'request' object (see                           // 120
// #BrowserIdentification) and should return a string,                                                     // 121
var htmlAttributeHooks = [];                                                                               // 122
var htmlAttributes = function (template, request) {                                                        // 123
  var attributes = '';                                                                                     // 124
  _.each(htmlAttributeHooks || [], function (hook) {                                                       // 125
    var attribute = hook(request);                                                                         // 126
    if (attribute !== null && attribute !== undefined && attribute !== '')                                 // 127
      attributes += ' ' + attribute;                                                                       // 128
  });                                                                                                      // 129
  return template.replace('##HTML_ATTRIBUTES##', attributes);                                              // 130
};                                                                                                         // 131
WebApp.addHtmlAttributeHook = function (hook) {                                                            // 132
  htmlAttributeHooks.push(hook);                                                                           // 133
};                                                                                                         // 134
                                                                                                           // 135
// Serve app HTML for this URL?                                                                            // 136
var appUrl = function (url) {                                                                              // 137
  if (url === '/favicon.ico' || url === '/robots.txt')                                                     // 138
    return false;                                                                                          // 139
                                                                                                           // 140
  // NOTE: app.manifest is not a web standard like favicon.ico and                                         // 141
  // robots.txt. It is a file name we have chosen to use for HTML5                                         // 142
  // appcache URLs. It is included here to prevent using an appcache                                       // 143
  // then removing it from poisoning an app permanently. Eventually,                                       // 144
  // once we have server side routing, this won't be needed as                                             // 145
  // unknown URLs with return a 404 automatically.                                                         // 146
  if (url === '/app.manifest')                                                                             // 147
    return false;                                                                                          // 148
                                                                                                           // 149
  // Avoid serving app HTML for declared routes such as /sockjs/.                                          // 150
  if (RoutePolicy.classify(url))                                                                           // 151
    return false;                                                                                          // 152
                                                                                                           // 153
  // we currently return app HTML on all URLs by default                                                   // 154
  return true;                                                                                             // 155
};                                                                                                         // 156
                                                                                                           // 157
                                                                                                           // 158
// Calculate a hash of all the client resources downloaded by the                                          // 159
// browser, including the application HTML, runtime config, code, and                                      // 160
// static files.                                                                                           // 161
//                                                                                                         // 162
// This hash *must* change if any resources seen by the browser                                            // 163
// change, and ideally *doesn't* change for any server-only changes                                        // 164
// (but the second is a performance enhancement, not a hard                                                // 165
// requirement).                                                                                           // 166
                                                                                                           // 167
var calculateClientHash = function () {                                                                    // 168
  var hash = crypto.createHash('sha1');                                                                    // 169
  hash.update(JSON.stringify(__meteor_runtime_config__), 'utf8');                                          // 170
  _.each(WebApp.clientProgram.manifest, function (resource) {                                              // 171
    if (resource.where === 'client' || resource.where === 'internal') {                                    // 172
      hash.update(resource.path);                                                                          // 173
      hash.update(resource.hash);                                                                          // 174
    }                                                                                                      // 175
  });                                                                                                      // 176
  return hash.digest('hex');                                                                               // 177
};                                                                                                         // 178
                                                                                                           // 179
                                                                                                           // 180
// We need to calculate the client hash after all packages have loaded                                     // 181
// to give them a chance to populate __meteor_runtime_config__.                                            // 182
//                                                                                                         // 183
// Calculating the hash during startup means that packages can only                                        // 184
// populate __meteor_runtime_config__ during load, not during startup.                                     // 185
//                                                                                                         // 186
// Calculating instead it at the beginning of main after all startup                                       // 187
// hooks had run would allow packages to also populate                                                     // 188
// __meteor_runtime_config__ during startup, but that's too late for                                       // 189
// autoupdate because it needs to have the client hash at startup to                                       // 190
// insert the auto update version itself into                                                              // 191
// __meteor_runtime_config__ to get it to the client.                                                      // 192
//                                                                                                         // 193
// An alternative would be to give autoupdate a "post-start,                                               // 194
// pre-listen" hook to allow it to insert the auto update version at                                       // 195
// the right moment.                                                                                       // 196
                                                                                                           // 197
Meteor.startup(function () {                                                                               // 198
  WebApp.clientHash = calculateClientHash();                                                               // 199
});                                                                                                        // 200
                                                                                                           // 201
                                                                                                           // 202
                                                                                                           // 203
// When we have a request pending, we want the socket timeout to be long, to                               // 204
// give ourselves a while to serve it, and to allow sockjs long polls to                                   // 205
// complete.  On the other hand, we want to close idle sockets relatively                                  // 206
// quickly, so that we can shut down relatively promptly but cleanly, without                              // 207
// cutting off anyone's response.                                                                          // 208
WebApp._timeoutAdjustmentRequestCallback = function (req, res) {                                           // 209
  // this is really just req.socket.setTimeout(LONG_SOCKET_TIMEOUT);                                       // 210
  req.setTimeout(LONG_SOCKET_TIMEOUT);                                                                     // 211
  // Insert our new finish listener to run BEFORE the existing one which removes                           // 212
  // the response from the socket.                                                                         // 213
  var finishListeners = res.listeners('finish');                                                           // 214
  // XXX Apparently in Node 0.12 this event is now called 'prefinish'.                                     // 215
  // https://github.com/joyent/node/commit/7c9b6070                                                        // 216
  res.removeAllListeners('finish');                                                                        // 217
  res.on('finish', function () {                                                                           // 218
    res.setTimeout(SHORT_SOCKET_TIMEOUT);                                                                  // 219
  });                                                                                                      // 220
  _.each(finishListeners, function (l) { res.on('finish', l); });                                          // 221
};                                                                                                         // 222
                                                                                                           // 223
var runWebAppServer = function () {                                                                        // 224
  var shuttingDown = false;                                                                                // 225
  // read the control for the client we'll be serving up                                                   // 226
  var clientJsonPath = path.join(__meteor_bootstrap__.serverDir,                                           // 227
                                 __meteor_bootstrap__.configJson.client);                                  // 228
  var clientDir = path.dirname(clientJsonPath);                                                            // 229
  var clientJson = JSON.parse(fs.readFileSync(clientJsonPath, 'utf8'));                                    // 230
                                                                                                           // 231
  if (clientJson.format !== "browser-program-pre1")                                                        // 232
    throw new Error("Unsupported format for client assets: " +                                             // 233
                    JSON.stringify(clientJson.format));                                                    // 234
                                                                                                           // 235
  // webserver                                                                                             // 236
  var app = connect();                                                                                     // 237
                                                                                                           // 238
  // Strip off the path prefix, if it exists.                                                              // 239
  app.use(function (request, response, next) {                                                             // 240
    var pathPrefix = __meteor_runtime_config__.ROOT_URL_PATH_PREFIX;                                       // 241
    var url = Npm.require('url').parse(request.url);                                                       // 242
    var pathname = url.pathname;                                                                           // 243
    // check if the path in the url starts with the path prefix (and the part                              // 244
    // after the path prefix must start with a / if it exists.)                                            // 245
    if (pathPrefix && pathname.substring(0, pathPrefix.length) === pathPrefix &&                           // 246
       (pathname.length == pathPrefix.length                                                               // 247
        || pathname.substring(pathPrefix.length, pathPrefix.length + 1) === "/")) {                        // 248
      request.url = request.url.substring(pathPrefix.length);                                              // 249
      next();                                                                                              // 250
    } else if (pathname === "/favicon.ico" || pathname === "/robots.txt") {                                // 251
      next();                                                                                              // 252
    } else if (pathPrefix) {                                                                               // 253
      response.writeHead(404);                                                                             // 254
      response.write("Unknown path");                                                                      // 255
      response.end();                                                                                      // 256
    } else {                                                                                               // 257
      next();                                                                                              // 258
    }                                                                                                      // 259
  });                                                                                                      // 260
  // Parse the query string into res.query. Used by oauth_server, but it's                                 // 261
  // generally pretty handy..                                                                              // 262
  app.use(connect.query());                                                                                // 263
                                                                                                           // 264
  // Auto-compress any json, javascript, or text.                                                          // 265
  app.use(connect.compress());                                                                             // 266
                                                                                                           // 267
  var getItemPathname = function (itemUrl) {                                                               // 268
    return decodeURIComponent(url.parse(itemUrl).pathname);                                                // 269
  };                                                                                                       // 270
                                                                                                           // 271
  var staticFiles = {};                                                                                    // 272
  _.each(clientJson.manifest, function (item) {                                                            // 273
    if (item.url && item.where === "client") {                                                             // 274
      staticFiles[getItemPathname(item.url)] = {                                                           // 275
        path: item.path,                                                                                   // 276
        cacheable: item.cacheable,                                                                         // 277
        // Link from source to its map                                                                     // 278
        sourceMapUrl: item.sourceMapUrl                                                                    // 279
      };                                                                                                   // 280
                                                                                                           // 281
      if (item.sourceMap) {                                                                                // 282
        // Serve the source map too, under the specified URL. We assume all                                // 283
        // source maps are cacheable.                                                                      // 284
        staticFiles[getItemPathname(item.sourceMapUrl)] = {                                                // 285
          path: item.sourceMap,                                                                            // 286
          cacheable: true                                                                                  // 287
        };                                                                                                 // 288
      }                                                                                                    // 289
    }                                                                                                      // 290
  });                                                                                                      // 291
                                                                                                           // 292
  // Serve static files from the manifest.                                                                 // 293
  // This is inspired by the 'static' middleware.                                                          // 294
  app.use(function (req, res, next) {                                                                      // 295
    if ('GET' != req.method && 'HEAD' != req.method) {                                                     // 296
      next();                                                                                              // 297
      return;                                                                                              // 298
    }                                                                                                      // 299
    var pathname = connect.utils.parseUrl(req).pathname;                                                   // 300
                                                                                                           // 301
    try {                                                                                                  // 302
      pathname = decodeURIComponent(pathname);                                                             // 303
    } catch (e) {                                                                                          // 304
      next();                                                                                              // 305
      return;                                                                                              // 306
    }                                                                                                      // 307
                                                                                                           // 308
    if (pathname === "/meteor_runtime_config.js" &&                                                        // 309
        ! WebAppInternals.inlineScriptsAllowed()) {                                                        // 310
      res.writeHead(200, { 'Content-type': 'application/javascript' });                                    // 311
      res.write("__meteor_runtime_config__ = " +                                                           // 312
                JSON.stringify(__meteor_runtime_config__) + ";");                                          // 313
      res.end();                                                                                           // 314
      return;                                                                                              // 315
    }                                                                                                      // 316
                                                                                                           // 317
    if (!_.has(staticFiles, pathname)) {                                                                   // 318
      next();                                                                                              // 319
      return;                                                                                              // 320
    }                                                                                                      // 321
                                                                                                           // 322
    // We don't need to call pause because, unlike 'static', once we call into                             // 323
    // 'send' and yield to the event loop, we never call another handler with                              // 324
    // 'next'.                                                                                             // 325
                                                                                                           // 326
    var info = staticFiles[pathname];                                                                      // 327
                                                                                                           // 328
    // Cacheable files are files that should never change. Typically                                       // 329
    // named by their hash (eg meteor bundled js and css files).                                           // 330
    // We cache them ~forever (1yr).                                                                       // 331
    //                                                                                                     // 332
    // We cache non-cacheable files anyway. This isn't really correct, as users                            // 333
    // can change the files and changes won't propagate immediately. However, if                           // 334
    // we don't cache them, browsers will 'flicker' when rerendering                                       // 335
    // images. Eventually we will probably want to rewrite URLs of static assets                           // 336
    // to include a query parameter to bust caches. That way we can both get                               // 337
    // good caching behavior and allow users to change assets without delay.                               // 338
    // https://github.com/meteor/meteor/issues/773                                                         // 339
    var maxAge = info.cacheable                                                                            // 340
          ? 1000 * 60 * 60 * 24 * 365                                                                      // 341
          : 1000 * 60 * 60 * 24;                                                                           // 342
                                                                                                           // 343
    // Set the X-SourceMap header, which current Chrome understands.                                       // 344
    // (The files also contain '//#' comments which FF 24 understands and                                  // 345
    // Chrome doesn't understand yet.)                                                                     // 346
    //                                                                                                     // 347
    // Eventually we should set the SourceMap header but the current version of                            // 348
    // Chrome and no version of FF supports it.                                                            // 349
    //                                                                                                     // 350
    // To figure out if your version of Chrome should support the SourceMap                                // 351
    // header,                                                                                             // 352
    //   - go to chrome://version. Let's say the Chrome version is                                         // 353
    //      28.0.1500.71 and the Blink version is 537.36 (@153022)                                         // 354
    //   - go to http://src.chromium.org/viewvc/blink/branches/chromium/1500/Source/core/inspector/InspectorPageAgent.cpp?view=log
    //     where the "1500" is the third part of your Chrome version                                       // 356
    //   - find the first revision that is no greater than the "153022"                                    // 357
    //     number.  That's probably the first one and it probably has                                      // 358
    //     a message of the form "Branch 1500 - blink@r149738"                                             // 359
    //   - If *that* revision number (149738) is at least 151755,                                          // 360
    //     then Chrome should support SourceMap (not just X-SourceMap)                                     // 361
    // (The change is https://codereview.chromium.org/15832007)                                            // 362
    //                                                                                                     // 363
    // You also need to enable source maps in Chrome: open dev tools, click                                // 364
    // the gear in the bottom right corner, and select "enable source maps".                               // 365
    //                                                                                                     // 366
    // Firefox 23+ supports source maps but doesn't support either header yet,                             // 367
    // so we include the '//#' comment for it:                                                             // 368
    //   https://bugzilla.mozilla.org/show_bug.cgi?id=765993                                               // 369
    // In FF 23 you need to turn on `devtools.debugger.source-maps-enabled`                                // 370
    // in `about:config` (it is on by default in FF 24).                                                   // 371
    if (info.sourceMapUrl)                                                                                 // 372
      res.setHeader('X-SourceMap', info.sourceMapUrl);                                                     // 373
                                                                                                           // 374
    send(req, path.join(clientDir, info.path))                                                             // 375
      .maxage(maxAge)                                                                                      // 376
      .hidden(true)  // if we specified a dotfile in the manifest, serve it                                // 377
      .on('error', function (err) {                                                                        // 378
        Log.error("Error serving static file " + err);                                                     // 379
        res.writeHead(500);                                                                                // 380
        res.end();                                                                                         // 381
      })                                                                                                   // 382
      .on('directory', function () {                                                                       // 383
        Log.error("Unexpected directory " + info.path);                                                    // 384
        res.writeHead(500);                                                                                // 385
        res.end();                                                                                         // 386
      })                                                                                                   // 387
      .pipe(res);                                                                                          // 388
  });                                                                                                      // 389
                                                                                                           // 390
  // Packages and apps can add handlers to this via WebApp.connectHandlers.                                // 391
  // They are inserted before our default handler.                                                         // 392
  var packageAndAppHandlers = connect();                                                                   // 393
  app.use(packageAndAppHandlers);                                                                          // 394
                                                                                                           // 395
  var suppressConnectErrors = false;                                                                       // 396
  // connect knows it is an error handler because it has 4 arguments instead of                            // 397
  // 3. go figure.  (It is not smart enough to find such a thing if it's hidden                            // 398
  // inside packageAndAppHandlers.)                                                                        // 399
  app.use(function (err, req, res, next) {                                                                 // 400
    if (!err || !suppressConnectErrors || !req.headers['x-suppress-error']) {                              // 401
      next(err);                                                                                           // 402
      return;                                                                                              // 403
    }                                                                                                      // 404
    res.writeHead(err.status, { 'Content-Type': 'text/plain' });                                           // 405
    res.end("An error message");                                                                           // 406
  });                                                                                                      // 407
                                                                                                           // 408
  // Will be updated by main before we listen.                                                             // 409
  var boilerplateHtml = null;                                                                              // 410
  app.use(function (req, res, next) {                                                                      // 411
    if (! appUrl(req.url))                                                                                 // 412
      return next();                                                                                       // 413
                                                                                                           // 414
    if (!boilerplateHtml)                                                                                  // 415
      throw new Error("boilerplateHtml should be set before listening!");                                  // 416
                                                                                                           // 417
                                                                                                           // 418
    var headers = {                                                                                        // 419
      'Content-Type':  'text/html; charset=utf-8'                                                          // 420
    };                                                                                                     // 421
    if (shuttingDown)                                                                                      // 422
      headers['Connection'] = 'Close';                                                                     // 423
                                                                                                           // 424
    var request = WebApp.categorizeRequest(req);                                                           // 425
                                                                                                           // 426
    res.writeHead(200, headers);                                                                           // 427
                                                                                                           // 428
    var requestSpecificHtml = htmlAttributes(boilerplateHtml, request);                                    // 429
    res.write(requestSpecificHtml);                                                                        // 430
    res.end();                                                                                             // 431
    return undefined;                                                                                      // 432
  });                                                                                                      // 433
                                                                                                           // 434
  // Return 404 by default, if no other handlers serve this URL.                                           // 435
  app.use(function (req, res) {                                                                            // 436
    res.writeHead(404);                                                                                    // 437
    res.end();                                                                                             // 438
  });                                                                                                      // 439
                                                                                                           // 440
                                                                                                           // 441
  var httpServer = http.createServer(app);                                                                 // 442
  var onListeningCallbacks = [];                                                                           // 443
                                                                                                           // 444
  // After 5 seconds w/o data on a socket, kill it.  On the other hand, if                                 // 445
  // there's an outstanding request, give it a higher timeout instead (to avoid                            // 446
  // killing long-polling requests)                                                                        // 447
  httpServer.setTimeout(SHORT_SOCKET_TIMEOUT);                                                             // 448
                                                                                                           // 449
  // Do this here, and then also in livedata/stream_server.js, because                                     // 450
  // stream_server.js kills all the current request handlers when installing its                           // 451
  // own.                                                                                                  // 452
  httpServer.on('request', WebApp._timeoutAdjustmentRequestCallback);                                      // 453
                                                                                                           // 454
                                                                                                           // 455
  // For now, handle SIGHUP here.  Later, this should be in some centralized                               // 456
  // Meteor shutdown code.                                                                                 // 457
  process.on('SIGHUP', Meteor.bindEnvironment(function () {                                                // 458
    shuttingDown = true;                                                                                   // 459
    // tell others with websockets open that we plan to close this.                                        // 460
    // XXX: Eventually, this should be done with a standard meteor shut-down                               // 461
    // logic path.                                                                                         // 462
    httpServer.emit('meteor-closing');                                                                     // 463
    httpServer.close( function () {                                                                        // 464
      process.exit(0);                                                                                     // 465
    });                                                                                                    // 466
    // Ideally we will close before this hits.                                                             // 467
    Meteor.setTimeout(function () {                                                                        // 468
      Log.warn("Closed by SIGHUP but one or more HTTP requests may not have finished.");                   // 469
      process.exit(1);                                                                                     // 470
    }, 5000);                                                                                              // 471
  }, function (err) {                                                                                      // 472
    console.log(err);                                                                                      // 473
    process.exit(1);                                                                                       // 474
  }));                                                                                                     // 475
                                                                                                           // 476
  // start up app                                                                                          // 477
  _.extend(WebApp, {                                                                                       // 478
    connectHandlers: packageAndAppHandlers,                                                                // 479
    httpServer: httpServer,                                                                                // 480
    // metadata about the client program that we serve                                                     // 481
    clientProgram: {                                                                                       // 482
      manifest: clientJson.manifest                                                                        // 483
      // XXX do we need a "root: clientDir" field here? it used to be here but                             // 484
      // was unused.                                                                                       // 485
    },                                                                                                     // 486
    // For testing.                                                                                        // 487
    suppressConnectErrors: function () {                                                                   // 488
      suppressConnectErrors = true;                                                                        // 489
    },                                                                                                     // 490
    onListening: function (f) {                                                                            // 491
      if (onListeningCallbacks)                                                                            // 492
        onListeningCallbacks.push(f);                                                                      // 493
      else                                                                                                 // 494
        f();                                                                                               // 495
    },                                                                                                     // 496
    // Hack: allow http tests to call connect.basicAuth without making them                                // 497
    // Npm.depends on another copy of connect. (That would be fine if we could                             // 498
    // have test-only NPM dependencies but is overkill here.)                                              // 499
    __basicAuth__: connect.basicAuth                                                                       // 500
  });                                                                                                      // 501
                                                                                                           // 502
  // Let the rest of the packages (and Meteor.startup hooks) insert connect                                // 503
  // middlewares and update __meteor_runtime_config__, then keep going to set up                           // 504
  // actually serving HTML.                                                                                // 505
  main = function (argv) {                                                                                 // 506
    // main happens post startup hooks, so we don't need a Meteor.startup() to                             // 507
    // ensure this happens after the galaxy package is loaded.                                             // 508
    var AppConfig = Package["application-configuration"].AppConfig;                                        // 509
    argv = optimist(argv).boolean('keepalive').argv;                                                       // 510
                                                                                                           // 511
    var boilerplateHtmlPath = path.join(clientDir, clientJson.page);                                       // 512
    boilerplateHtml = fs.readFileSync(boilerplateHtmlPath, 'utf8');                                        // 513
                                                                                                           // 514
    // Include __meteor_runtime_config__ in the app html, as an inline script if                           // 515
    // it's not forbidden by CSP.                                                                          // 516
    if (WebAppInternals.inlineScriptsAllowed()) {                                                          // 517
      boilerplateHtml = boilerplateHtml.replace(                                                           // 518
          /##RUNTIME_CONFIG##/,                                                                            // 519
        "<script type='text/javascript'>__meteor_runtime_config__ = " +                                    // 520
          JSON.stringify(__meteor_runtime_config__) + ";</script>");                                       // 521
    } else {                                                                                               // 522
      boilerplateHtml = boilerplateHtml.replace(                                                           // 523
        /##RUNTIME_CONFIG##/,                                                                              // 524
        "<script type='text/javascript' src='##ROOT_URL_PATH_PREFIX##/meteor_runtime_config.js'></script>" // 525
      );                                                                                                   // 526
    }                                                                                                      // 527
    boilerplateHtml = boilerplateHtml.replace(                                                             // 528
        /##ROOT_URL_PATH_PREFIX##/g,                                                                       // 529
      __meteor_runtime_config__.ROOT_URL_PATH_PREFIX || "");                                               // 530
                                                                                                           // 531
    boilerplateHtml = boilerplateHtml.replace(                                                             // 532
        /##BUNDLED_JS_CSS_PREFIX##/g,                                                                      // 533
      bundledJsCssPrefix ||                                                                                // 534
        __meteor_runtime_config__.ROOT_URL_PATH_PREFIX || "");                                             // 535
                                                                                                           // 536
    // only start listening after all the startup code has run.                                            // 537
    var localPort = parseInt(process.env.PORT) || 0;                                                       // 538
    var host = process.env.BIND_IP;                                                                        // 539
    var localIp = host || '0.0.0.0';                                                                       // 540
    httpServer.listen(localPort, localIp, Meteor.bindEnvironment(function() {                              // 541
      if (argv.keepalive || true)                                                                          // 542
        console.log("LISTENING"); // must match run.js                                                     // 543
      var proxyBinding;                                                                                    // 544
                                                                                                           // 545
      AppConfig.configurePackage('webapp', function (configuration) {                                      // 546
        if (proxyBinding)                                                                                  // 547
          proxyBinding.stop();                                                                             // 548
        if (configuration && configuration.proxy) {                                                        // 549
          var proxyServiceName = process.env.ADMIN_APP ? "adminProxy" : "proxy";                           // 550
                                                                                                           // 551
          // TODO: We got rid of the place where this checks the app's                                     // 552
          // configuration, because this wants to be configured for some things                            // 553
          // on a per-job basis.  Discuss w/ teammates.                                                    // 554
          proxyBinding = AppConfig.configureService(proxyServiceName, function (proxyService) {            // 555
            if (proxyService.providers.proxy) {                                                            // 556
              var proxyConf;                                                                               // 557
              if (process.env.ADMIN_APP) {                                                                 // 558
                proxyConf = {                                                                              // 559
                  securePort: 44333,                                                                       // 560
                  insecurePort: 9414,                                                                      // 561
                  bindHost: "localhost",                                                                   // 562
                  bindPathPrefix: "/" + makeAppNamePathPrefix(process.env.GALAXY_APP)                      // 563
                };                                                                                         // 564
              } else {                                                                                     // 565
                proxyConf = configuration.proxy;                                                           // 566
              }                                                                                            // 567
              Log("Attempting to bind to proxy at " + proxyService.providers.proxy);                       // 568
              console.log(proxyConf);                                                                      // 569
              WebAppInternals.bindToProxy(_.extend({                                                       // 570
                proxyEndpoint: proxyService.providers.proxy                                                // 571
              }, proxyConf), proxyServiceName);                                                            // 572
            }                                                                                              // 573
          });                                                                                              // 574
        }                                                                                                  // 575
      });                                                                                                  // 576
                                                                                                           // 577
      var callbacks = onListeningCallbacks;                                                                // 578
      onListeningCallbacks = null;                                                                         // 579
      _.each(callbacks, function (x) { x(); });                                                            // 580
                                                                                                           // 581
    }, function (e) {                                                                                      // 582
      console.error("Error listening:", e);                                                                // 583
      console.error(e && e.stack);                                                                         // 584
    }));                                                                                                   // 585
                                                                                                           // 586
    if (argv.keepalive)                                                                                    // 587
      initKeepalive();                                                                                     // 588
    return 'DAEMON';                                                                                       // 589
  };                                                                                                       // 590
};                                                                                                         // 591
                                                                                                           // 592
                                                                                                           // 593
var proxy;                                                                                                 // 594
WebAppInternals.bindToProxy = function (proxyConfig, proxyServiceName) {                                   // 595
  var securePort = proxyConfig.securePort || 4433;                                                         // 596
  var insecurePort = proxyConfig.insecurePort || 8080;                                                     // 597
  var bindPathPrefix = proxyConfig.bindPathPrefix || "";                                                   // 598
  // XXX also support galaxy-based lookup                                                                  // 599
  if (!proxyConfig.proxyEndpoint)                                                                          // 600
    throw new Error("missing proxyEndpoint");                                                              // 601
  if (!proxyConfig.bindHost)                                                                               // 602
    throw new Error("missing bindHost");                                                                   // 603
  if (!process.env.GALAXY_JOB)                                                                             // 604
    throw new Error("missing $GALAXY_JOB");                                                                // 605
  if (!process.env.GALAXY_APP)                                                                             // 606
    throw new Error("missing $GALAXY_APP");                                                                // 607
  if (!process.env.LAST_START)                                                                             // 608
    throw new Error("missing $LAST_START");                                                                // 609
                                                                                                           // 610
  // XXX rename pid argument to bindTo.                                                                    // 611
  var pid = {                                                                                              // 612
    job: process.env.GALAXY_JOB,                                                                           // 613
    lastStarted: +(process.env.LAST_START),                                                                // 614
    app: process.env.GALAXY_APP                                                                            // 615
  };                                                                                                       // 616
  var myHost = os.hostname();                                                                              // 617
                                                                                                           // 618
  var ddpBindTo = {                                                                                        // 619
    ddpUrl: 'ddp://' + proxyConfig.bindHost + ':' + securePort + bindPathPrefix + '/',                     // 620
    insecurePort: insecurePort                                                                             // 621
  };                                                                                                       // 622
                                                                                                           // 623
  // This is run after packages are loaded (in main) so we can use                                         // 624
  // Follower.connect.                                                                                     // 625
  if (proxy) {                                                                                             // 626
    proxy.reconnect({                                                                                      // 627
      url: proxyConfig.proxyEndpoint                                                                       // 628
    });                                                                                                    // 629
  } else {                                                                                                 // 630
    proxy = Package["follower-livedata"].Follower.connect(                                                 // 631
      proxyConfig.proxyEndpoint, {                                                                         // 632
        group: proxyServiceName                                                                            // 633
      }                                                                                                    // 634
    );                                                                                                     // 635
  }                                                                                                        // 636
                                                                                                           // 637
  var route = process.env.ROUTE;                                                                           // 638
  var host = route.split(":")[0];                                                                          // 639
  var port = +route.split(":")[1];                                                                         // 640
                                                                                                           // 641
  var completedBindings = {                                                                                // 642
    ddp: false,                                                                                            // 643
    http: false,                                                                                           // 644
    https: proxyConfig.securePort !== null ? false : undefined                                             // 645
  };                                                                                                       // 646
                                                                                                           // 647
  var bindingDoneCallback = function (binding) {                                                           // 648
    return function (err, resp) {                                                                          // 649
      if (err)                                                                                             // 650
        throw err;                                                                                         // 651
                                                                                                           // 652
      completedBindings[binding] = true;                                                                   // 653
      var completedAll = _.every(_.keys(completedBindings), function (binding) {                           // 654
        return (completedBindings[binding] ||                                                              // 655
          completedBindings[binding] === undefined);                                                       // 656
      });                                                                                                  // 657
      if (completedAll)                                                                                    // 658
        Log("Bound to proxy.");                                                                            // 659
      return completedAll;                                                                                 // 660
    };                                                                                                     // 661
  };                                                                                                       // 662
                                                                                                           // 663
  proxy.call('bindDdp', {                                                                                  // 664
    pid: pid,                                                                                              // 665
    bindTo: ddpBindTo,                                                                                     // 666
    proxyTo: {                                                                                             // 667
      host: host,                                                                                          // 668
      port: port,                                                                                          // 669
      pathPrefix: bindPathPrefix + '/websocket'                                                            // 670
    }                                                                                                      // 671
  }, bindingDoneCallback("ddp"));                                                                          // 672
  proxy.call('bindHttp', {                                                                                 // 673
    pid: pid,                                                                                              // 674
    bindTo: {                                                                                              // 675
      host: proxyConfig.bindHost,                                                                          // 676
      port: insecurePort,                                                                                  // 677
      pathPrefix: bindPathPrefix                                                                           // 678
    },                                                                                                     // 679
    proxyTo: {                                                                                             // 680
      host: host,                                                                                          // 681
      port: port,                                                                                          // 682
      pathPrefix: bindPathPrefix                                                                           // 683
    }                                                                                                      // 684
  }, bindingDoneCallback("http"));                                                                         // 685
  if (proxyConfig.securePort !== null) {                                                                   // 686
    proxy.call('bindHttp', {                                                                               // 687
      pid: pid,                                                                                            // 688
      bindTo: {                                                                                            // 689
        host: proxyConfig.bindHost,                                                                        // 690
        port: securePort,                                                                                  // 691
        pathPrefix: bindPathPrefix,                                                                        // 692
        ssl: true                                                                                          // 693
      },                                                                                                   // 694
      proxyTo: {                                                                                           // 695
        host: host,                                                                                        // 696
        port: port,                                                                                        // 697
        pathPrefix: bindPathPrefix                                                                         // 698
      }                                                                                                    // 699
    }, bindingDoneCallback("https"));                                                                      // 700
  }                                                                                                        // 701
};                                                                                                         // 702
                                                                                                           // 703
runWebAppServer();                                                                                         // 704
                                                                                                           // 705
                                                                                                           // 706
var inlineScriptsAllowed = true;                                                                           // 707
                                                                                                           // 708
WebAppInternals.inlineScriptsAllowed = function () {                                                       // 709
  return inlineScriptsAllowed;                                                                             // 710
};                                                                                                         // 711
                                                                                                           // 712
WebAppInternals.setInlineScriptsAllowed = function (value) {                                               // 713
  inlineScriptsAllowed = value;                                                                            // 714
};                                                                                                         // 715
                                                                                                           // 716
WebAppInternals.setBundledJsCssPrefix = function (prefix) {                                                // 717
  bundledJsCssPrefix = prefix;                                                                             // 718
};                                                                                                         // 719
                                                                                                           // 720
/////////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);


/* Exports */
if (typeof Package === 'undefined') Package = {};
Package.webapp = {
  WebApp: WebApp,
  main: main,
  WebAppInternals: WebAppInternals
};

})();
