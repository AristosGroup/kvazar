(function () {

/* Imports */
var Meteor = Package.meteor.Meteor;

/* Package-scope variables */
var moment;

(function () {

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                    //
// packages/moment/lib/moment/moment.js                                                                               //
//                                                                                                                    //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                      //
//! moment.js                                                                                                         // 1
//! version : 2.2.1                                                                                                   // 2
//! authors : Tim Wood, Iskren Chernev, Moment.js contributors                                                        // 3
//! license : MIT                                                                                                     // 4
//! momentjs.com                                                                                                      // 5
                                                                                                                      // 6
(function (undefined) {                                                                                               // 7
                                                                                                                      // 8
    /************************************                                                                             // 9
        Constants                                                                                                     // 10
    ************************************/                                                                             // 11
                                                                                                                      // 12
    var moment,                                                                                                       // 13
        VERSION = "2.2.1",                                                                                            // 14
        round = Math.round, i,                                                                                        // 15
        // internal storage for language config files                                                                 // 16
        languages = {},                                                                                               // 17
                                                                                                                      // 18
        // check for nodeJS                                                                                           // 19
        hasModule = (typeof module !== 'undefined' && module.exports),                                                // 20
                                                                                                                      // 21
        // ASP.NET json date format regex                                                                             // 22
        aspNetJsonRegex = /^\/?Date\((\-?\d+)/i,                                                                      // 23
        aspNetTimeSpanJsonRegex = /(\-)?(?:(\d*)\.)?(\d+)\:(\d+)\:(\d+)\.?(\d{3})?/,                                  // 24
                                                                                                                      // 25
        // format tokens                                                                                              // 26
        formattingTokens = /(\[[^\[]*\])|(\\)?(Mo|MM?M?M?|Do|DDDo|DD?D?D?|ddd?d?|do?|w[o|w]?|W[o|W]?|YYYYY|YYYY|YY|gg(ggg?)?|GG(GGG?)?|e|E|a|A|hh?|HH?|mm?|ss?|SS?S?|X|zz?|ZZ?|.)/g,
        localFormattingTokens = /(\[[^\[]*\])|(\\)?(LT|LL?L?L?|l{1,4})/g,                                             // 28
                                                                                                                      // 29
        // parsing token regexes                                                                                      // 30
        parseTokenOneOrTwoDigits = /\d\d?/, // 0 - 99                                                                 // 31
        parseTokenOneToThreeDigits = /\d{1,3}/, // 0 - 999                                                            // 32
        parseTokenThreeDigits = /\d{3}/, // 000 - 999                                                                 // 33
        parseTokenFourDigits = /\d{1,4}/, // 0 - 9999                                                                 // 34
        parseTokenSixDigits = /[+\-]?\d{1,6}/, // -999,999 - 999,999                                                  // 35
        parseTokenWord = /[0-9]*['a-z\u00A0-\u05FF\u0700-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF]+|[\u0600-\u06FF\/]+(\s*?[\u0600-\u06FF]+){1,2}/i, // any word (or two) characters or numbers including two/three word month in arabic.
        parseTokenTimezone = /Z|[\+\-]\d\d:?\d\d/i, // +00:00 -00:00 +0000 -0000 or Z                                 // 37
        parseTokenT = /T/i, // T (ISO seperator)                                                                      // 38
        parseTokenTimestampMs = /[\+\-]?\d+(\.\d{1,3})?/, // 123456789 123456789.123                                  // 39
                                                                                                                      // 40
        // preliminary iso regex                                                                                      // 41
        // 0000-00-00 + T + 00 or 00:00 or 00:00:00 or 00:00:00.000 + +00:00 or +0000                                 // 42
        isoRegex = /^\s*\d{4}-\d\d-\d\d((T| )(\d\d(:\d\d(:\d\d(\.\d\d?\d?)?)?)?)?([\+\-]\d\d:?\d\d)?)?/,              // 43
        isoFormat = 'YYYY-MM-DDTHH:mm:ssZ',                                                                           // 44
                                                                                                                      // 45
        // iso time formats and regexes                                                                               // 46
        isoTimes = [                                                                                                  // 47
            ['HH:mm:ss.S', /(T| )\d\d:\d\d:\d\d\.\d{1,3}/],                                                           // 48
            ['HH:mm:ss', /(T| )\d\d:\d\d:\d\d/],                                                                      // 49
            ['HH:mm', /(T| )\d\d:\d\d/],                                                                              // 50
            ['HH', /(T| )\d\d/]                                                                                       // 51
        ],                                                                                                            // 52
                                                                                                                      // 53
        // timezone chunker "+10:00" > ["10", "00"] or "-1530" > ["-15", "30"]                                        // 54
        parseTimezoneChunker = /([\+\-]|\d\d)/gi,                                                                     // 55
                                                                                                                      // 56
        // getter and setter names                                                                                    // 57
        proxyGettersAndSetters = 'Date|Hours|Minutes|Seconds|Milliseconds'.split('|'),                                // 58
        unitMillisecondFactors = {                                                                                    // 59
            'Milliseconds' : 1,                                                                                       // 60
            'Seconds' : 1e3,                                                                                          // 61
            'Minutes' : 6e4,                                                                                          // 62
            'Hours' : 36e5,                                                                                           // 63
            'Days' : 864e5,                                                                                           // 64
            'Months' : 2592e6,                                                                                        // 65
            'Years' : 31536e6                                                                                         // 66
        },                                                                                                            // 67
                                                                                                                      // 68
        unitAliases = {                                                                                               // 69
            ms : 'millisecond',                                                                                       // 70
            s : 'second',                                                                                             // 71
            m : 'minute',                                                                                             // 72
            h : 'hour',                                                                                               // 73
            d : 'day',                                                                                                // 74
            w : 'week',                                                                                               // 75
            W : 'isoweek',                                                                                            // 76
            M : 'month',                                                                                              // 77
            y : 'year'                                                                                                // 78
        },                                                                                                            // 79
                                                                                                                      // 80
        // format function strings                                                                                    // 81
        formatFunctions = {},                                                                                         // 82
                                                                                                                      // 83
        // tokens to ordinalize and pad                                                                               // 84
        ordinalizeTokens = 'DDD w W M D d'.split(' '),                                                                // 85
        paddedTokens = 'M D H h m s w W'.split(' '),                                                                  // 86
                                                                                                                      // 87
        formatTokenFunctions = {                                                                                      // 88
            M    : function () {                                                                                      // 89
                return this.month() + 1;                                                                              // 90
            },                                                                                                        // 91
            MMM  : function (format) {                                                                                // 92
                return this.lang().monthsShort(this, format);                                                         // 93
            },                                                                                                        // 94
            MMMM : function (format) {                                                                                // 95
                return this.lang().months(this, format);                                                              // 96
            },                                                                                                        // 97
            D    : function () {                                                                                      // 98
                return this.date();                                                                                   // 99
            },                                                                                                        // 100
            DDD  : function () {                                                                                      // 101
                return this.dayOfYear();                                                                              // 102
            },                                                                                                        // 103
            d    : function () {                                                                                      // 104
                return this.day();                                                                                    // 105
            },                                                                                                        // 106
            dd   : function (format) {                                                                                // 107
                return this.lang().weekdaysMin(this, format);                                                         // 108
            },                                                                                                        // 109
            ddd  : function (format) {                                                                                // 110
                return this.lang().weekdaysShort(this, format);                                                       // 111
            },                                                                                                        // 112
            dddd : function (format) {                                                                                // 113
                return this.lang().weekdays(this, format);                                                            // 114
            },                                                                                                        // 115
            w    : function () {                                                                                      // 116
                return this.week();                                                                                   // 117
            },                                                                                                        // 118
            W    : function () {                                                                                      // 119
                return this.isoWeek();                                                                                // 120
            },                                                                                                        // 121
            YY   : function () {                                                                                      // 122
                return leftZeroFill(this.year() % 100, 2);                                                            // 123
            },                                                                                                        // 124
            YYYY : function () {                                                                                      // 125
                return leftZeroFill(this.year(), 4);                                                                  // 126
            },                                                                                                        // 127
            YYYYY : function () {                                                                                     // 128
                return leftZeroFill(this.year(), 5);                                                                  // 129
            },                                                                                                        // 130
            gg   : function () {                                                                                      // 131
                return leftZeroFill(this.weekYear() % 100, 2);                                                        // 132
            },                                                                                                        // 133
            gggg : function () {                                                                                      // 134
                return this.weekYear();                                                                               // 135
            },                                                                                                        // 136
            ggggg : function () {                                                                                     // 137
                return leftZeroFill(this.weekYear(), 5);                                                              // 138
            },                                                                                                        // 139
            GG   : function () {                                                                                      // 140
                return leftZeroFill(this.isoWeekYear() % 100, 2);                                                     // 141
            },                                                                                                        // 142
            GGGG : function () {                                                                                      // 143
                return this.isoWeekYear();                                                                            // 144
            },                                                                                                        // 145
            GGGGG : function () {                                                                                     // 146
                return leftZeroFill(this.isoWeekYear(), 5);                                                           // 147
            },                                                                                                        // 148
            e : function () {                                                                                         // 149
                return this.weekday();                                                                                // 150
            },                                                                                                        // 151
            E : function () {                                                                                         // 152
                return this.isoWeekday();                                                                             // 153
            },                                                                                                        // 154
            a    : function () {                                                                                      // 155
                return this.lang().meridiem(this.hours(), this.minutes(), true);                                      // 156
            },                                                                                                        // 157
            A    : function () {                                                                                      // 158
                return this.lang().meridiem(this.hours(), this.minutes(), false);                                     // 159
            },                                                                                                        // 160
            H    : function () {                                                                                      // 161
                return this.hours();                                                                                  // 162
            },                                                                                                        // 163
            h    : function () {                                                                                      // 164
                return this.hours() % 12 || 12;                                                                       // 165
            },                                                                                                        // 166
            m    : function () {                                                                                      // 167
                return this.minutes();                                                                                // 168
            },                                                                                                        // 169
            s    : function () {                                                                                      // 170
                return this.seconds();                                                                                // 171
            },                                                                                                        // 172
            S    : function () {                                                                                      // 173
                return ~~(this.milliseconds() / 100);                                                                 // 174
            },                                                                                                        // 175
            SS   : function () {                                                                                      // 176
                return leftZeroFill(~~(this.milliseconds() / 10), 2);                                                 // 177
            },                                                                                                        // 178
            SSS  : function () {                                                                                      // 179
                return leftZeroFill(this.milliseconds(), 3);                                                          // 180
            },                                                                                                        // 181
            Z    : function () {                                                                                      // 182
                var a = -this.zone(),                                                                                 // 183
                    b = "+";                                                                                          // 184
                if (a < 0) {                                                                                          // 185
                    a = -a;                                                                                           // 186
                    b = "-";                                                                                          // 187
                }                                                                                                     // 188
                return b + leftZeroFill(~~(a / 60), 2) + ":" + leftZeroFill(~~a % 60, 2);                             // 189
            },                                                                                                        // 190
            ZZ   : function () {                                                                                      // 191
                var a = -this.zone(),                                                                                 // 192
                    b = "+";                                                                                          // 193
                if (a < 0) {                                                                                          // 194
                    a = -a;                                                                                           // 195
                    b = "-";                                                                                          // 196
                }                                                                                                     // 197
                return b + leftZeroFill(~~(10 * a / 6), 4);                                                           // 198
            },                                                                                                        // 199
            z : function () {                                                                                         // 200
                return this.zoneAbbr();                                                                               // 201
            },                                                                                                        // 202
            zz : function () {                                                                                        // 203
                return this.zoneName();                                                                               // 204
            },                                                                                                        // 205
            X    : function () {                                                                                      // 206
                return this.unix();                                                                                   // 207
            }                                                                                                         // 208
        };                                                                                                            // 209
                                                                                                                      // 210
    function padToken(func, count) {                                                                                  // 211
        return function (a) {                                                                                         // 212
            return leftZeroFill(func.call(this, a), count);                                                           // 213
        };                                                                                                            // 214
    }                                                                                                                 // 215
    function ordinalizeToken(func, period) {                                                                          // 216
        return function (a) {                                                                                         // 217
            return this.lang().ordinal(func.call(this, a), period);                                                   // 218
        };                                                                                                            // 219
    }                                                                                                                 // 220
                                                                                                                      // 221
    while (ordinalizeTokens.length) {                                                                                 // 222
        i = ordinalizeTokens.pop();                                                                                   // 223
        formatTokenFunctions[i + 'o'] = ordinalizeToken(formatTokenFunctions[i], i);                                  // 224
    }                                                                                                                 // 225
    while (paddedTokens.length) {                                                                                     // 226
        i = paddedTokens.pop();                                                                                       // 227
        formatTokenFunctions[i + i] = padToken(formatTokenFunctions[i], 2);                                           // 228
    }                                                                                                                 // 229
    formatTokenFunctions.DDDD = padToken(formatTokenFunctions.DDD, 3);                                                // 230
                                                                                                                      // 231
                                                                                                                      // 232
    /************************************                                                                             // 233
        Constructors                                                                                                  // 234
    ************************************/                                                                             // 235
                                                                                                                      // 236
    function Language() {                                                                                             // 237
                                                                                                                      // 238
    }                                                                                                                 // 239
                                                                                                                      // 240
    // Moment prototype object                                                                                        // 241
    function Moment(config) {                                                                                         // 242
        extend(this, config);                                                                                         // 243
    }                                                                                                                 // 244
                                                                                                                      // 245
    // Duration Constructor                                                                                           // 246
    function Duration(duration) {                                                                                     // 247
        var years = duration.years || duration.year || duration.y || 0,                                               // 248
            months = duration.months || duration.month || duration.M || 0,                                            // 249
            weeks = duration.weeks || duration.week || duration.w || 0,                                               // 250
            days = duration.days || duration.day || duration.d || 0,                                                  // 251
            hours = duration.hours || duration.hour || duration.h || 0,                                               // 252
            minutes = duration.minutes || duration.minute || duration.m || 0,                                         // 253
            seconds = duration.seconds || duration.second || duration.s || 0,                                         // 254
            milliseconds = duration.milliseconds || duration.millisecond || duration.ms || 0;                         // 255
                                                                                                                      // 256
        // store reference to input for deterministic cloning                                                         // 257
        this._input = duration;                                                                                       // 258
                                                                                                                      // 259
        // representation for dateAddRemove                                                                           // 260
        this._milliseconds = +milliseconds +                                                                          // 261
            seconds * 1e3 + // 1000                                                                                   // 262
            minutes * 6e4 + // 1000 * 60                                                                              // 263
            hours * 36e5; // 1000 * 60 * 60                                                                           // 264
        // Because of dateAddRemove treats 24 hours as different from a                                               // 265
        // day when working around DST, we need to store them separately                                              // 266
        this._days = +days +                                                                                          // 267
            weeks * 7;                                                                                                // 268
        // It is impossible translate months into days without knowing                                                // 269
        // which months you are are talking about, so we have to store                                                // 270
        // it separately.                                                                                             // 271
        this._months = +months +                                                                                      // 272
            years * 12;                                                                                               // 273
                                                                                                                      // 274
        this._data = {};                                                                                              // 275
                                                                                                                      // 276
        this._bubble();                                                                                               // 277
    }                                                                                                                 // 278
                                                                                                                      // 279
                                                                                                                      // 280
    /************************************                                                                             // 281
        Helpers                                                                                                       // 282
    ************************************/                                                                             // 283
                                                                                                                      // 284
                                                                                                                      // 285
    function extend(a, b) {                                                                                           // 286
        for (var i in b) {                                                                                            // 287
            if (b.hasOwnProperty(i)) {                                                                                // 288
                a[i] = b[i];                                                                                          // 289
            }                                                                                                         // 290
        }                                                                                                             // 291
        return a;                                                                                                     // 292
    }                                                                                                                 // 293
                                                                                                                      // 294
    function absRound(number) {                                                                                       // 295
        if (number < 0) {                                                                                             // 296
            return Math.ceil(number);                                                                                 // 297
        } else {                                                                                                      // 298
            return Math.floor(number);                                                                                // 299
        }                                                                                                             // 300
    }                                                                                                                 // 301
                                                                                                                      // 302
    // left zero fill a number                                                                                        // 303
    // see http://jsperf.com/left-zero-filling for performance comparison                                             // 304
    function leftZeroFill(number, targetLength) {                                                                     // 305
        var output = number + '';                                                                                     // 306
        while (output.length < targetLength) {                                                                        // 307
            output = '0' + output;                                                                                    // 308
        }                                                                                                             // 309
        return output;                                                                                                // 310
    }                                                                                                                 // 311
                                                                                                                      // 312
    // helper function for _.addTime and _.subtractTime                                                               // 313
    function addOrSubtractDurationFromMoment(mom, duration, isAdding, ignoreUpdateOffset) {                           // 314
        var milliseconds = duration._milliseconds,                                                                    // 315
            days = duration._days,                                                                                    // 316
            months = duration._months,                                                                                // 317
            minutes,                                                                                                  // 318
            hours;                                                                                                    // 319
                                                                                                                      // 320
        if (milliseconds) {                                                                                           // 321
            mom._d.setTime(+mom._d + milliseconds * isAdding);                                                        // 322
        }                                                                                                             // 323
        // store the minutes and hours so we can restore them                                                         // 324
        if (days || months) {                                                                                         // 325
            minutes = mom.minute();                                                                                   // 326
            hours = mom.hour();                                                                                       // 327
        }                                                                                                             // 328
        if (days) {                                                                                                   // 329
            mom.date(mom.date() + days * isAdding);                                                                   // 330
        }                                                                                                             // 331
        if (months) {                                                                                                 // 332
            mom.month(mom.month() + months * isAdding);                                                               // 333
        }                                                                                                             // 334
        if (milliseconds && !ignoreUpdateOffset) {                                                                    // 335
            moment.updateOffset(mom);                                                                                 // 336
        }                                                                                                             // 337
        // restore the minutes and hours after possibly changing dst                                                  // 338
        if (days || months) {                                                                                         // 339
            mom.minute(minutes);                                                                                      // 340
            mom.hour(hours);                                                                                          // 341
        }                                                                                                             // 342
    }                                                                                                                 // 343
                                                                                                                      // 344
    // check if is an array                                                                                           // 345
    function isArray(input) {                                                                                         // 346
        return Object.prototype.toString.call(input) === '[object Array]';                                            // 347
    }                                                                                                                 // 348
                                                                                                                      // 349
    // compare two arrays, return the number of differences                                                           // 350
    function compareArrays(array1, array2) {                                                                          // 351
        var len = Math.min(array1.length, array2.length),                                                             // 352
            lengthDiff = Math.abs(array1.length - array2.length),                                                     // 353
            diffs = 0,                                                                                                // 354
            i;                                                                                                        // 355
        for (i = 0; i < len; i++) {                                                                                   // 356
            if (~~array1[i] !== ~~array2[i]) {                                                                        // 357
                diffs++;                                                                                              // 358
            }                                                                                                         // 359
        }                                                                                                             // 360
        return diffs + lengthDiff;                                                                                    // 361
    }                                                                                                                 // 362
                                                                                                                      // 363
    function normalizeUnits(units) {                                                                                  // 364
        return units ? unitAliases[units] || units.toLowerCase().replace(/(.)s$/, '$1') : units;                      // 365
    }                                                                                                                 // 366
                                                                                                                      // 367
                                                                                                                      // 368
    /************************************                                                                             // 369
        Languages                                                                                                     // 370
    ************************************/                                                                             // 371
                                                                                                                      // 372
                                                                                                                      // 373
    extend(Language.prototype, {                                                                                      // 374
                                                                                                                      // 375
        set : function (config) {                                                                                     // 376
            var prop, i;                                                                                              // 377
            for (i in config) {                                                                                       // 378
                prop = config[i];                                                                                     // 379
                if (typeof prop === 'function') {                                                                     // 380
                    this[i] = prop;                                                                                   // 381
                } else {                                                                                              // 382
                    this['_' + i] = prop;                                                                             // 383
                }                                                                                                     // 384
            }                                                                                                         // 385
        },                                                                                                            // 386
                                                                                                                      // 387
        _months : "January_February_March_April_May_June_July_August_September_October_November_December".split("_"), // 388
        months : function (m) {                                                                                       // 389
            return this._months[m.month()];                                                                           // 390
        },                                                                                                            // 391
                                                                                                                      // 392
        _monthsShort : "Jan_Feb_Mar_Apr_May_Jun_Jul_Aug_Sep_Oct_Nov_Dec".split("_"),                                  // 393
        monthsShort : function (m) {                                                                                  // 394
            return this._monthsShort[m.month()];                                                                      // 395
        },                                                                                                            // 396
                                                                                                                      // 397
        monthsParse : function (monthName) {                                                                          // 398
            var i, mom, regex;                                                                                        // 399
                                                                                                                      // 400
            if (!this._monthsParse) {                                                                                 // 401
                this._monthsParse = [];                                                                               // 402
            }                                                                                                         // 403
                                                                                                                      // 404
            for (i = 0; i < 12; i++) {                                                                                // 405
                // make the regex if we don't have it already                                                         // 406
                if (!this._monthsParse[i]) {                                                                          // 407
                    mom = moment.utc([2000, i]);                                                                      // 408
                    regex = '^' + this.months(mom, '') + '|^' + this.monthsShort(mom, '');                            // 409
                    this._monthsParse[i] = new RegExp(regex.replace('.', ''), 'i');                                   // 410
                }                                                                                                     // 411
                // test the regex                                                                                     // 412
                if (this._monthsParse[i].test(monthName)) {                                                           // 413
                    return i;                                                                                         // 414
                }                                                                                                     // 415
            }                                                                                                         // 416
        },                                                                                                            // 417
                                                                                                                      // 418
        _weekdays : "Sunday_Monday_Tuesday_Wednesday_Thursday_Friday_Saturday".split("_"),                            // 419
        weekdays : function (m) {                                                                                     // 420
            return this._weekdays[m.day()];                                                                           // 421
        },                                                                                                            // 422
                                                                                                                      // 423
        _weekdaysShort : "Sun_Mon_Tue_Wed_Thu_Fri_Sat".split("_"),                                                    // 424
        weekdaysShort : function (m) {                                                                                // 425
            return this._weekdaysShort[m.day()];                                                                      // 426
        },                                                                                                            // 427
                                                                                                                      // 428
        _weekdaysMin : "Su_Mo_Tu_We_Th_Fr_Sa".split("_"),                                                             // 429
        weekdaysMin : function (m) {                                                                                  // 430
            return this._weekdaysMin[m.day()];                                                                        // 431
        },                                                                                                            // 432
                                                                                                                      // 433
        weekdaysParse : function (weekdayName) {                                                                      // 434
            var i, mom, regex;                                                                                        // 435
                                                                                                                      // 436
            if (!this._weekdaysParse) {                                                                               // 437
                this._weekdaysParse = [];                                                                             // 438
            }                                                                                                         // 439
                                                                                                                      // 440
            for (i = 0; i < 7; i++) {                                                                                 // 441
                // make the regex if we don't have it already                                                         // 442
                if (!this._weekdaysParse[i]) {                                                                        // 443
                    mom = moment([2000, 1]).day(i);                                                                   // 444
                    regex = '^' + this.weekdays(mom, '') + '|^' + this.weekdaysShort(mom, '') + '|^' + this.weekdaysMin(mom, '');
                    this._weekdaysParse[i] = new RegExp(regex.replace('.', ''), 'i');                                 // 446
                }                                                                                                     // 447
                // test the regex                                                                                     // 448
                if (this._weekdaysParse[i].test(weekdayName)) {                                                       // 449
                    return i;                                                                                         // 450
                }                                                                                                     // 451
            }                                                                                                         // 452
        },                                                                                                            // 453
                                                                                                                      // 454
        _longDateFormat : {                                                                                           // 455
            LT : "h:mm A",                                                                                            // 456
            L : "MM/DD/YYYY",                                                                                         // 457
            LL : "MMMM D YYYY",                                                                                       // 458
            LLL : "MMMM D YYYY LT",                                                                                   // 459
            LLLL : "dddd, MMMM D YYYY LT"                                                                             // 460
        },                                                                                                            // 461
        longDateFormat : function (key) {                                                                             // 462
            var output = this._longDateFormat[key];                                                                   // 463
            if (!output && this._longDateFormat[key.toUpperCase()]) {                                                 // 464
                output = this._longDateFormat[key.toUpperCase()].replace(/MMMM|MM|DD|dddd/g, function (val) {         // 465
                    return val.slice(1);                                                                              // 466
                });                                                                                                   // 467
                this._longDateFormat[key] = output;                                                                   // 468
            }                                                                                                         // 469
            return output;                                                                                            // 470
        },                                                                                                            // 471
                                                                                                                      // 472
        isPM : function (input) {                                                                                     // 473
            // IE8 Quirks Mode & IE7 Standards Mode do not allow accessing strings like arrays                        // 474
            // Using charAt should be more compatible.                                                                // 475
            return ((input + '').toLowerCase().charAt(0) === 'p');                                                    // 476
        },                                                                                                            // 477
                                                                                                                      // 478
        _meridiemParse : /[ap]\.?m?\.?/i,                                                                             // 479
        meridiem : function (hours, minutes, isLower) {                                                               // 480
            if (hours > 11) {                                                                                         // 481
                return isLower ? 'pm' : 'PM';                                                                         // 482
            } else {                                                                                                  // 483
                return isLower ? 'am' : 'AM';                                                                         // 484
            }                                                                                                         // 485
        },                                                                                                            // 486
                                                                                                                      // 487
        _calendar : {                                                                                                 // 488
            sameDay : '[Today at] LT',                                                                                // 489
            nextDay : '[Tomorrow at] LT',                                                                             // 490
            nextWeek : 'dddd [at] LT',                                                                                // 491
            lastDay : '[Yesterday at] LT',                                                                            // 492
            lastWeek : '[Last] dddd [at] LT',                                                                         // 493
            sameElse : 'L'                                                                                            // 494
        },                                                                                                            // 495
        calendar : function (key, mom) {                                                                              // 496
            var output = this._calendar[key];                                                                         // 497
            return typeof output === 'function' ? output.apply(mom) : output;                                         // 498
        },                                                                                                            // 499
                                                                                                                      // 500
        _relativeTime : {                                                                                             // 501
            future : "in %s",                                                                                         // 502
            past : "%s ago",                                                                                          // 503
            s : "a few seconds",                                                                                      // 504
            m : "a minute",                                                                                           // 505
            mm : "%d minutes",                                                                                        // 506
            h : "an hour",                                                                                            // 507
            hh : "%d hours",                                                                                          // 508
            d : "a day",                                                                                              // 509
            dd : "%d days",                                                                                           // 510
            M : "a month",                                                                                            // 511
            MM : "%d months",                                                                                         // 512
            y : "a year",                                                                                             // 513
            yy : "%d years"                                                                                           // 514
        },                                                                                                            // 515
        relativeTime : function (number, withoutSuffix, string, isFuture) {                                           // 516
            var output = this._relativeTime[string];                                                                  // 517
            return (typeof output === 'function') ?                                                                   // 518
                output(number, withoutSuffix, string, isFuture) :                                                     // 519
                output.replace(/%d/i, number);                                                                        // 520
        },                                                                                                            // 521
        pastFuture : function (diff, output) {                                                                        // 522
            var format = this._relativeTime[diff > 0 ? 'future' : 'past'];                                            // 523
            return typeof format === 'function' ? format(output) : format.replace(/%s/i, output);                     // 524
        },                                                                                                            // 525
                                                                                                                      // 526
        ordinal : function (number) {                                                                                 // 527
            return this._ordinal.replace("%d", number);                                                               // 528
        },                                                                                                            // 529
        _ordinal : "%d",                                                                                              // 530
                                                                                                                      // 531
        preparse : function (string) {                                                                                // 532
            return string;                                                                                            // 533
        },                                                                                                            // 534
                                                                                                                      // 535
        postformat : function (string) {                                                                              // 536
            return string;                                                                                            // 537
        },                                                                                                            // 538
                                                                                                                      // 539
        week : function (mom) {                                                                                       // 540
            return weekOfYear(mom, this._week.dow, this._week.doy).week;                                              // 541
        },                                                                                                            // 542
        _week : {                                                                                                     // 543
            dow : 0, // Sunday is the first day of the week.                                                          // 544
            doy : 6  // The week that contains Jan 1st is the first week of the year.                                 // 545
        }                                                                                                             // 546
    });                                                                                                               // 547
                                                                                                                      // 548
    // Loads a language definition into the `languages` cache.  The function                                          // 549
    // takes a key and optionally values.  If not in the browser and no values                                        // 550
    // are provided, it will load the language file module.  As a convenience,                                        // 551
    // this function also returns the language values.                                                                // 552
    function loadLang(key, values) {                                                                                  // 553
        values.abbr = key;                                                                                            // 554
        if (!languages[key]) {                                                                                        // 555
            languages[key] = new Language();                                                                          // 556
        }                                                                                                             // 557
        languages[key].set(values);                                                                                   // 558
        return languages[key];                                                                                        // 559
    }                                                                                                                 // 560
                                                                                                                      // 561
    // Remove a language from the `languages` cache. Mostly useful in tests.                                          // 562
    function unloadLang(key) {                                                                                        // 563
        delete languages[key];                                                                                        // 564
    }                                                                                                                 // 565
                                                                                                                      // 566
    // Determines which language definition to use and returns it.                                                    // 567
    //                                                                                                                // 568
    // With no parameters, it will return the global language.  If you                                                // 569
    // pass in a language key, such as 'en', it will return the                                                       // 570
    // definition for 'en', so long as 'en' has already been loaded using                                             // 571
    // moment.lang.                                                                                                   // 572
    function getLangDefinition(key) {                                                                                 // 573
        if (!key) {                                                                                                   // 574
            return moment.fn._lang;                                                                                   // 575
        }                                                                                                             // 576
        if (!languages[key] && hasModule) {                                                                           // 577
            try {                                                                                                     // 578
                require('./lang/' + key);                                                                             // 579
            } catch (e) {                                                                                             // 580
                // call with no params to set to default                                                              // 581
                return moment.fn._lang;                                                                               // 582
            }                                                                                                         // 583
        }                                                                                                             // 584
        return languages[key] || moment.fn._lang;                                                                     // 585
    }                                                                                                                 // 586
                                                                                                                      // 587
                                                                                                                      // 588
    /************************************                                                                             // 589
        Formatting                                                                                                    // 590
    ************************************/                                                                             // 591
                                                                                                                      // 592
                                                                                                                      // 593
    function removeFormattingTokens(input) {                                                                          // 594
        if (input.match(/\[.*\]/)) {                                                                                  // 595
            return input.replace(/^\[|\]$/g, "");                                                                     // 596
        }                                                                                                             // 597
        return input.replace(/\\/g, "");                                                                              // 598
    }                                                                                                                 // 599
                                                                                                                      // 600
    function makeFormatFunction(format) {                                                                             // 601
        var array = format.match(formattingTokens), i, length;                                                        // 602
                                                                                                                      // 603
        for (i = 0, length = array.length; i < length; i++) {                                                         // 604
            if (formatTokenFunctions[array[i]]) {                                                                     // 605
                array[i] = formatTokenFunctions[array[i]];                                                            // 606
            } else {                                                                                                  // 607
                array[i] = removeFormattingTokens(array[i]);                                                          // 608
            }                                                                                                         // 609
        }                                                                                                             // 610
                                                                                                                      // 611
        return function (mom) {                                                                                       // 612
            var output = "";                                                                                          // 613
            for (i = 0; i < length; i++) {                                                                            // 614
                output += array[i] instanceof Function ? array[i].call(mom, format) : array[i];                       // 615
            }                                                                                                         // 616
            return output;                                                                                            // 617
        };                                                                                                            // 618
    }                                                                                                                 // 619
                                                                                                                      // 620
    // format date using native date object                                                                           // 621
    function formatMoment(m, format) {                                                                                // 622
                                                                                                                      // 623
        format = expandFormat(format, m.lang());                                                                      // 624
                                                                                                                      // 625
        if (!formatFunctions[format]) {                                                                               // 626
            formatFunctions[format] = makeFormatFunction(format);                                                     // 627
        }                                                                                                             // 628
                                                                                                                      // 629
        return formatFunctions[format](m);                                                                            // 630
    }                                                                                                                 // 631
                                                                                                                      // 632
    function expandFormat(format, lang) {                                                                             // 633
        var i = 5;                                                                                                    // 634
                                                                                                                      // 635
        function replaceLongDateFormatTokens(input) {                                                                 // 636
            return lang.longDateFormat(input) || input;                                                               // 637
        }                                                                                                             // 638
                                                                                                                      // 639
        while (i-- && (localFormattingTokens.lastIndex = 0,                                                           // 640
                    localFormattingTokens.test(format))) {                                                            // 641
            format = format.replace(localFormattingTokens, replaceLongDateFormatTokens);                              // 642
        }                                                                                                             // 643
                                                                                                                      // 644
        return format;                                                                                                // 645
    }                                                                                                                 // 646
                                                                                                                      // 647
                                                                                                                      // 648
    /************************************                                                                             // 649
        Parsing                                                                                                       // 650
    ************************************/                                                                             // 651
                                                                                                                      // 652
                                                                                                                      // 653
    // get the regex to find the next token                                                                           // 654
    function getParseRegexForToken(token, config) {                                                                   // 655
        switch (token) {                                                                                              // 656
        case 'DDDD':                                                                                                  // 657
            return parseTokenThreeDigits;                                                                             // 658
        case 'YYYY':                                                                                                  // 659
            return parseTokenFourDigits;                                                                              // 660
        case 'YYYYY':                                                                                                 // 661
            return parseTokenSixDigits;                                                                               // 662
        case 'S':                                                                                                     // 663
        case 'SS':                                                                                                    // 664
        case 'SSS':                                                                                                   // 665
        case 'DDD':                                                                                                   // 666
            return parseTokenOneToThreeDigits;                                                                        // 667
        case 'MMM':                                                                                                   // 668
        case 'MMMM':                                                                                                  // 669
        case 'dd':                                                                                                    // 670
        case 'ddd':                                                                                                   // 671
        case 'dddd':                                                                                                  // 672
            return parseTokenWord;                                                                                    // 673
        case 'a':                                                                                                     // 674
        case 'A':                                                                                                     // 675
            return getLangDefinition(config._l)._meridiemParse;                                                       // 676
        case 'X':                                                                                                     // 677
            return parseTokenTimestampMs;                                                                             // 678
        case 'Z':                                                                                                     // 679
        case 'ZZ':                                                                                                    // 680
            return parseTokenTimezone;                                                                                // 681
        case 'T':                                                                                                     // 682
            return parseTokenT;                                                                                       // 683
        case 'MM':                                                                                                    // 684
        case 'DD':                                                                                                    // 685
        case 'YY':                                                                                                    // 686
        case 'HH':                                                                                                    // 687
        case 'hh':                                                                                                    // 688
        case 'mm':                                                                                                    // 689
        case 'ss':                                                                                                    // 690
        case 'M':                                                                                                     // 691
        case 'D':                                                                                                     // 692
        case 'd':                                                                                                     // 693
        case 'H':                                                                                                     // 694
        case 'h':                                                                                                     // 695
        case 'm':                                                                                                     // 696
        case 's':                                                                                                     // 697
            return parseTokenOneOrTwoDigits;                                                                          // 698
        default :                                                                                                     // 699
            return new RegExp(token.replace('\\', ''));                                                               // 700
        }                                                                                                             // 701
    }                                                                                                                 // 702
                                                                                                                      // 703
    function timezoneMinutesFromString(string) {                                                                      // 704
        var tzchunk = (parseTokenTimezone.exec(string) || [])[0],                                                     // 705
            parts = (tzchunk + '').match(parseTimezoneChunker) || ['-', 0, 0],                                        // 706
            minutes = +(parts[1] * 60) + ~~parts[2];                                                                  // 707
                                                                                                                      // 708
        return parts[0] === '+' ? -minutes : minutes;                                                                 // 709
    }                                                                                                                 // 710
                                                                                                                      // 711
    // function to convert string input to date                                                                       // 712
    function addTimeToArrayFromToken(token, input, config) {                                                          // 713
        var a, datePartArray = config._a;                                                                             // 714
                                                                                                                      // 715
        switch (token) {                                                                                              // 716
        // MONTH                                                                                                      // 717
        case 'M' : // fall through to MM                                                                              // 718
        case 'MM' :                                                                                                   // 719
            if (input != null) {                                                                                      // 720
                datePartArray[1] = ~~input - 1;                                                                       // 721
            }                                                                                                         // 722
            break;                                                                                                    // 723
        case 'MMM' : // fall through to MMMM                                                                          // 724
        case 'MMMM' :                                                                                                 // 725
            a = getLangDefinition(config._l).monthsParse(input);                                                      // 726
            // if we didn't find a month name, mark the date as invalid.                                              // 727
            if (a != null) {                                                                                          // 728
                datePartArray[1] = a;                                                                                 // 729
            } else {                                                                                                  // 730
                config._isValid = false;                                                                              // 731
            }                                                                                                         // 732
            break;                                                                                                    // 733
        // DAY OF MONTH                                                                                               // 734
        case 'D' : // fall through to DD                                                                              // 735
        case 'DD' :                                                                                                   // 736
            if (input != null) {                                                                                      // 737
                datePartArray[2] = ~~input;                                                                           // 738
            }                                                                                                         // 739
            break;                                                                                                    // 740
        // DAY OF YEAR                                                                                                // 741
        case 'DDD' : // fall through to DDDD                                                                          // 742
        case 'DDDD' :                                                                                                 // 743
            if (input != null) {                                                                                      // 744
                datePartArray[1] = 0;                                                                                 // 745
                datePartArray[2] = ~~input;                                                                           // 746
            }                                                                                                         // 747
            break;                                                                                                    // 748
        // YEAR                                                                                                       // 749
        case 'YY' :                                                                                                   // 750
            datePartArray[0] = ~~input + (~~input > 68 ? 1900 : 2000);                                                // 751
            break;                                                                                                    // 752
        case 'YYYY' :                                                                                                 // 753
        case 'YYYYY' :                                                                                                // 754
            datePartArray[0] = ~~input;                                                                               // 755
            break;                                                                                                    // 756
        // AM / PM                                                                                                    // 757
        case 'a' : // fall through to A                                                                               // 758
        case 'A' :                                                                                                    // 759
            config._isPm = getLangDefinition(config._l).isPM(input);                                                  // 760
            break;                                                                                                    // 761
        // 24 HOUR                                                                                                    // 762
        case 'H' : // fall through to hh                                                                              // 763
        case 'HH' : // fall through to hh                                                                             // 764
        case 'h' : // fall through to hh                                                                              // 765
        case 'hh' :                                                                                                   // 766
            datePartArray[3] = ~~input;                                                                               // 767
            break;                                                                                                    // 768
        // MINUTE                                                                                                     // 769
        case 'm' : // fall through to mm                                                                              // 770
        case 'mm' :                                                                                                   // 771
            datePartArray[4] = ~~input;                                                                               // 772
            break;                                                                                                    // 773
        // SECOND                                                                                                     // 774
        case 's' : // fall through to ss                                                                              // 775
        case 'ss' :                                                                                                   // 776
            datePartArray[5] = ~~input;                                                                               // 777
            break;                                                                                                    // 778
        // MILLISECOND                                                                                                // 779
        case 'S' :                                                                                                    // 780
        case 'SS' :                                                                                                   // 781
        case 'SSS' :                                                                                                  // 782
            datePartArray[6] = ~~ (('0.' + input) * 1000);                                                            // 783
            break;                                                                                                    // 784
        // UNIX TIMESTAMP WITH MS                                                                                     // 785
        case 'X':                                                                                                     // 786
            config._d = new Date(parseFloat(input) * 1000);                                                           // 787
            break;                                                                                                    // 788
        // TIMEZONE                                                                                                   // 789
        case 'Z' : // fall through to ZZ                                                                              // 790
        case 'ZZ' :                                                                                                   // 791
            config._useUTC = true;                                                                                    // 792
            config._tzm = timezoneMinutesFromString(input);                                                           // 793
            break;                                                                                                    // 794
        }                                                                                                             // 795
                                                                                                                      // 796
        // if the input is null, the date is not valid                                                                // 797
        if (input == null) {                                                                                          // 798
            config._isValid = false;                                                                                  // 799
        }                                                                                                             // 800
    }                                                                                                                 // 801
                                                                                                                      // 802
    // convert an array to a date.                                                                                    // 803
    // the array should mirror the parameters below                                                                   // 804
    // note: all values past the year are optional and will default to the lowest possible value.                     // 805
    // [year, month, day , hour, minute, second, millisecond]                                                         // 806
    function dateFromArray(config) {                                                                                  // 807
        var i, date, input = [], currentDate;                                                                         // 808
                                                                                                                      // 809
        if (config._d) {                                                                                              // 810
            return;                                                                                                   // 811
        }                                                                                                             // 812
                                                                                                                      // 813
        // Default to current date.                                                                                   // 814
        // * if no year, month, day of month are given, default to today                                              // 815
        // * if day of month is given, default month and year                                                         // 816
        // * if month is given, default only year                                                                     // 817
        // * if year is given, don't default anything                                                                 // 818
        currentDate = currentDateArray(config);                                                                       // 819
        for (i = 0; i < 3 && config._a[i] == null; ++i) {                                                             // 820
            config._a[i] = input[i] = currentDate[i];                                                                 // 821
        }                                                                                                             // 822
                                                                                                                      // 823
        // Zero out whatever was not defaulted, including time                                                        // 824
        for (; i < 7; i++) {                                                                                          // 825
            config._a[i] = input[i] = (config._a[i] == null) ? (i === 2 ? 1 : 0) : config._a[i];                      // 826
        }                                                                                                             // 827
                                                                                                                      // 828
        // add the offsets to the time to be parsed so that we can have a clean array for checking isValid            // 829
        input[3] += ~~((config._tzm || 0) / 60);                                                                      // 830
        input[4] += ~~((config._tzm || 0) % 60);                                                                      // 831
                                                                                                                      // 832
        date = new Date(0);                                                                                           // 833
                                                                                                                      // 834
        if (config._useUTC) {                                                                                         // 835
            date.setUTCFullYear(input[0], input[1], input[2]);                                                        // 836
            date.setUTCHours(input[3], input[4], input[5], input[6]);                                                 // 837
        } else {                                                                                                      // 838
            date.setFullYear(input[0], input[1], input[2]);                                                           // 839
            date.setHours(input[3], input[4], input[5], input[6]);                                                    // 840
        }                                                                                                             // 841
                                                                                                                      // 842
        config._d = date;                                                                                             // 843
    }                                                                                                                 // 844
                                                                                                                      // 845
    function dateFromObject(config) {                                                                                 // 846
        var o = config._i;                                                                                            // 847
                                                                                                                      // 848
        if (config._d) {                                                                                              // 849
            return;                                                                                                   // 850
        }                                                                                                             // 851
                                                                                                                      // 852
        config._a = [                                                                                                 // 853
            o.years || o.year || o.y,                                                                                 // 854
            o.months || o.month || o.M,                                                                               // 855
            o.days || o.day || o.d,                                                                                   // 856
            o.hours || o.hour || o.h,                                                                                 // 857
            o.minutes || o.minute || o.m,                                                                             // 858
            o.seconds || o.second || o.s,                                                                             // 859
            o.milliseconds || o.millisecond || o.ms                                                                   // 860
        ];                                                                                                            // 861
                                                                                                                      // 862
        dateFromArray(config);                                                                                        // 863
    }                                                                                                                 // 864
                                                                                                                      // 865
    function currentDateArray(config) {                                                                               // 866
        var now = new Date();                                                                                         // 867
        if (config._useUTC) {                                                                                         // 868
            return [                                                                                                  // 869
                now.getUTCFullYear(),                                                                                 // 870
                now.getUTCMonth(),                                                                                    // 871
                now.getUTCDate()                                                                                      // 872
            ];                                                                                                        // 873
        } else {                                                                                                      // 874
            return [now.getFullYear(), now.getMonth(), now.getDate()];                                                // 875
        }                                                                                                             // 876
    }                                                                                                                 // 877
                                                                                                                      // 878
    // date from string and format string                                                                             // 879
    function makeDateFromStringAndFormat(config) {                                                                    // 880
        // This array is used to make a Date, either with `new Date` or `Date.UTC`                                    // 881
        var lang = getLangDefinition(config._l),                                                                      // 882
            string = '' + config._i,                                                                                  // 883
            i, parsedInput, tokens;                                                                                   // 884
                                                                                                                      // 885
        tokens = expandFormat(config._f, lang).match(formattingTokens);                                               // 886
                                                                                                                      // 887
        config._a = [];                                                                                               // 888
                                                                                                                      // 889
        for (i = 0; i < tokens.length; i++) {                                                                         // 890
            parsedInput = (getParseRegexForToken(tokens[i], config).exec(string) || [])[0];                           // 891
            if (parsedInput) {                                                                                        // 892
                string = string.slice(string.indexOf(parsedInput) + parsedInput.length);                              // 893
            }                                                                                                         // 894
            // don't parse if its not a known token                                                                   // 895
            if (formatTokenFunctions[tokens[i]]) {                                                                    // 896
                addTimeToArrayFromToken(tokens[i], parsedInput, config);                                              // 897
            }                                                                                                         // 898
        }                                                                                                             // 899
                                                                                                                      // 900
        // add remaining unparsed input to the string                                                                 // 901
        if (string) {                                                                                                 // 902
            config._il = string;                                                                                      // 903
        }                                                                                                             // 904
                                                                                                                      // 905
        // handle am pm                                                                                               // 906
        if (config._isPm && config._a[3] < 12) {                                                                      // 907
            config._a[3] += 12;                                                                                       // 908
        }                                                                                                             // 909
        // if is 12 am, change hours to 0                                                                             // 910
        if (config._isPm === false && config._a[3] === 12) {                                                          // 911
            config._a[3] = 0;                                                                                         // 912
        }                                                                                                             // 913
        // return                                                                                                     // 914
        dateFromArray(config);                                                                                        // 915
    }                                                                                                                 // 916
                                                                                                                      // 917
    // date from string and array of format strings                                                                   // 918
    function makeDateFromStringAndArray(config) {                                                                     // 919
        var tempConfig,                                                                                               // 920
            tempMoment,                                                                                               // 921
            bestMoment,                                                                                               // 922
                                                                                                                      // 923
            scoreToBeat = 99,                                                                                         // 924
            i,                                                                                                        // 925
            currentScore;                                                                                             // 926
                                                                                                                      // 927
        for (i = 0; i < config._f.length; i++) {                                                                      // 928
            tempConfig = extend({}, config);                                                                          // 929
            tempConfig._f = config._f[i];                                                                             // 930
            makeDateFromStringAndFormat(tempConfig);                                                                  // 931
            tempMoment = new Moment(tempConfig);                                                                      // 932
                                                                                                                      // 933
            currentScore = compareArrays(tempConfig._a, tempMoment.toArray());                                        // 934
                                                                                                                      // 935
            // if there is any input that was not parsed                                                              // 936
            // add a penalty for that format                                                                          // 937
            if (tempMoment._il) {                                                                                     // 938
                currentScore += tempMoment._il.length;                                                                // 939
            }                                                                                                         // 940
                                                                                                                      // 941
            if (currentScore < scoreToBeat) {                                                                         // 942
                scoreToBeat = currentScore;                                                                           // 943
                bestMoment = tempMoment;                                                                              // 944
            }                                                                                                         // 945
        }                                                                                                             // 946
                                                                                                                      // 947
        extend(config, bestMoment);                                                                                   // 948
    }                                                                                                                 // 949
                                                                                                                      // 950
    // date from iso format                                                                                           // 951
    function makeDateFromString(config) {                                                                             // 952
        var i,                                                                                                        // 953
            string = config._i,                                                                                       // 954
            match = isoRegex.exec(string);                                                                            // 955
                                                                                                                      // 956
        if (match) {                                                                                                  // 957
            // match[2] should be "T" or undefined                                                                    // 958
            config._f = 'YYYY-MM-DD' + (match[2] || " ");                                                             // 959
            for (i = 0; i < 4; i++) {                                                                                 // 960
                if (isoTimes[i][1].exec(string)) {                                                                    // 961
                    config._f += isoTimes[i][0];                                                                      // 962
                    break;                                                                                            // 963
                }                                                                                                     // 964
            }                                                                                                         // 965
            if (parseTokenTimezone.exec(string)) {                                                                    // 966
                config._f += " Z";                                                                                    // 967
            }                                                                                                         // 968
            makeDateFromStringAndFormat(config);                                                                      // 969
        } else {                                                                                                      // 970
            config._d = new Date(string);                                                                             // 971
        }                                                                                                             // 972
    }                                                                                                                 // 973
                                                                                                                      // 974
    function makeDateFromInput(config) {                                                                              // 975
        var input = config._i,                                                                                        // 976
            matched = aspNetJsonRegex.exec(input);                                                                    // 977
                                                                                                                      // 978
        if (input === undefined) {                                                                                    // 979
            config._d = new Date();                                                                                   // 980
        } else if (matched) {                                                                                         // 981
            config._d = new Date(+matched[1]);                                                                        // 982
        } else if (typeof input === 'string') {                                                                       // 983
            makeDateFromString(config);                                                                               // 984
        } else if (isArray(input)) {                                                                                  // 985
            config._a = input.slice(0);                                                                               // 986
            dateFromArray(config);                                                                                    // 987
        } else if (input instanceof Date) {                                                                           // 988
            config._d = new Date(+input);                                                                             // 989
        } else if (typeof(input) === 'object') {                                                                      // 990
            dateFromObject(config);                                                                                   // 991
        } else {                                                                                                      // 992
            config._d = new Date(input);                                                                              // 993
        }                                                                                                             // 994
    }                                                                                                                 // 995
                                                                                                                      // 996
                                                                                                                      // 997
    /************************************                                                                             // 998
        Relative Time                                                                                                 // 999
    ************************************/                                                                             // 1000
                                                                                                                      // 1001
                                                                                                                      // 1002
    // helper function for moment.fn.from, moment.fn.fromNow, and moment.duration.fn.humanize                         // 1003
    function substituteTimeAgo(string, number, withoutSuffix, isFuture, lang) {                                       // 1004
        return lang.relativeTime(number || 1, !!withoutSuffix, string, isFuture);                                     // 1005
    }                                                                                                                 // 1006
                                                                                                                      // 1007
    function relativeTime(milliseconds, withoutSuffix, lang) {                                                        // 1008
        var seconds = round(Math.abs(milliseconds) / 1000),                                                           // 1009
            minutes = round(seconds / 60),                                                                            // 1010
            hours = round(minutes / 60),                                                                              // 1011
            days = round(hours / 24),                                                                                 // 1012
            years = round(days / 365),                                                                                // 1013
            args = seconds < 45 && ['s', seconds] ||                                                                  // 1014
                minutes === 1 && ['m'] ||                                                                             // 1015
                minutes < 45 && ['mm', minutes] ||                                                                    // 1016
                hours === 1 && ['h'] ||                                                                               // 1017
                hours < 22 && ['hh', hours] ||                                                                        // 1018
                days === 1 && ['d'] ||                                                                                // 1019
                days <= 25 && ['dd', days] ||                                                                         // 1020
                days <= 45 && ['M'] ||                                                                                // 1021
                days < 345 && ['MM', round(days / 30)] ||                                                             // 1022
                years === 1 && ['y'] || ['yy', years];                                                                // 1023
        args[2] = withoutSuffix;                                                                                      // 1024
        args[3] = milliseconds > 0;                                                                                   // 1025
        args[4] = lang;                                                                                               // 1026
        return substituteTimeAgo.apply({}, args);                                                                     // 1027
    }                                                                                                                 // 1028
                                                                                                                      // 1029
                                                                                                                      // 1030
    /************************************                                                                             // 1031
        Week of Year                                                                                                  // 1032
    ************************************/                                                                             // 1033
                                                                                                                      // 1034
                                                                                                                      // 1035
    // firstDayOfWeek       0 = sun, 6 = sat                                                                          // 1036
    //                      the day of the week that starts the week                                                  // 1037
    //                      (usually sunday or monday)                                                                // 1038
    // firstDayOfWeekOfYear 0 = sun, 6 = sat                                                                          // 1039
    //                      the first week is the week that contains the first                                        // 1040
    //                      of this day of the week                                                                   // 1041
    //                      (eg. ISO weeks use thursday (4))                                                          // 1042
    function weekOfYear(mom, firstDayOfWeek, firstDayOfWeekOfYear) {                                                  // 1043
        var end = firstDayOfWeekOfYear - firstDayOfWeek,                                                              // 1044
            daysToDayOfWeek = firstDayOfWeekOfYear - mom.day(),                                                       // 1045
            adjustedMoment;                                                                                           // 1046
                                                                                                                      // 1047
                                                                                                                      // 1048
        if (daysToDayOfWeek > end) {                                                                                  // 1049
            daysToDayOfWeek -= 7;                                                                                     // 1050
        }                                                                                                             // 1051
                                                                                                                      // 1052
        if (daysToDayOfWeek < end - 7) {                                                                              // 1053
            daysToDayOfWeek += 7;                                                                                     // 1054
        }                                                                                                             // 1055
                                                                                                                      // 1056
        adjustedMoment = moment(mom).add('d', daysToDayOfWeek);                                                       // 1057
        return {                                                                                                      // 1058
            week: Math.ceil(adjustedMoment.dayOfYear() / 7),                                                          // 1059
            year: adjustedMoment.year()                                                                               // 1060
        };                                                                                                            // 1061
    }                                                                                                                 // 1062
                                                                                                                      // 1063
                                                                                                                      // 1064
    /************************************                                                                             // 1065
        Top Level Functions                                                                                           // 1066
    ************************************/                                                                             // 1067
                                                                                                                      // 1068
    function makeMoment(config) {                                                                                     // 1069
        var input = config._i,                                                                                        // 1070
            format = config._f;                                                                                       // 1071
                                                                                                                      // 1072
        if (input === null || input === '') {                                                                         // 1073
            return null;                                                                                              // 1074
        }                                                                                                             // 1075
                                                                                                                      // 1076
        if (typeof input === 'string') {                                                                              // 1077
            config._i = input = getLangDefinition().preparse(input);                                                  // 1078
        }                                                                                                             // 1079
                                                                                                                      // 1080
        if (moment.isMoment(input)) {                                                                                 // 1081
            config = extend({}, input);                                                                               // 1082
            config._d = new Date(+input._d);                                                                          // 1083
        } else if (format) {                                                                                          // 1084
            if (isArray(format)) {                                                                                    // 1085
                makeDateFromStringAndArray(config);                                                                   // 1086
            } else {                                                                                                  // 1087
                makeDateFromStringAndFormat(config);                                                                  // 1088
            }                                                                                                         // 1089
        } else {                                                                                                      // 1090
            makeDateFromInput(config);                                                                                // 1091
        }                                                                                                             // 1092
                                                                                                                      // 1093
        return new Moment(config);                                                                                    // 1094
    }                                                                                                                 // 1095
                                                                                                                      // 1096
    moment = function (input, format, lang) {                                                                         // 1097
        return makeMoment({                                                                                           // 1098
            _i : input,                                                                                               // 1099
            _f : format,                                                                                              // 1100
            _l : lang,                                                                                                // 1101
            _isUTC : false                                                                                            // 1102
        });                                                                                                           // 1103
    };                                                                                                                // 1104
                                                                                                                      // 1105
    // creating with utc                                                                                              // 1106
    moment.utc = function (input, format, lang) {                                                                     // 1107
        return makeMoment({                                                                                           // 1108
            _useUTC : true,                                                                                           // 1109
            _isUTC : true,                                                                                            // 1110
            _l : lang,                                                                                                // 1111
            _i : input,                                                                                               // 1112
            _f : format                                                                                               // 1113
        }).utc();                                                                                                     // 1114
    };                                                                                                                // 1115
                                                                                                                      // 1116
    // creating with unix timestamp (in seconds)                                                                      // 1117
    moment.unix = function (input) {                                                                                  // 1118
        return moment(input * 1000);                                                                                  // 1119
    };                                                                                                                // 1120
                                                                                                                      // 1121
    // duration                                                                                                       // 1122
    moment.duration = function (input, key) {                                                                         // 1123
        var isDuration = moment.isDuration(input),                                                                    // 1124
            isNumber = (typeof input === 'number'),                                                                   // 1125
            duration = (isDuration ? input._input : (isNumber ? {} : input)),                                         // 1126
            matched = aspNetTimeSpanJsonRegex.exec(input),                                                            // 1127
            sign,                                                                                                     // 1128
            ret;                                                                                                      // 1129
                                                                                                                      // 1130
        if (isNumber) {                                                                                               // 1131
            if (key) {                                                                                                // 1132
                duration[key] = input;                                                                                // 1133
            } else {                                                                                                  // 1134
                duration.milliseconds = input;                                                                        // 1135
            }                                                                                                         // 1136
        } else if (matched) {                                                                                         // 1137
            sign = (matched[1] === "-") ? -1 : 1;                                                                     // 1138
            duration = {                                                                                              // 1139
                y: 0,                                                                                                 // 1140
                d: ~~matched[2] * sign,                                                                               // 1141
                h: ~~matched[3] * sign,                                                                               // 1142
                m: ~~matched[4] * sign,                                                                               // 1143
                s: ~~matched[5] * sign,                                                                               // 1144
                ms: ~~matched[6] * sign                                                                               // 1145
            };                                                                                                        // 1146
        }                                                                                                             // 1147
                                                                                                                      // 1148
        ret = new Duration(duration);                                                                                 // 1149
                                                                                                                      // 1150
        if (isDuration && input.hasOwnProperty('_lang')) {                                                            // 1151
            ret._lang = input._lang;                                                                                  // 1152
        }                                                                                                             // 1153
                                                                                                                      // 1154
        return ret;                                                                                                   // 1155
    };                                                                                                                // 1156
                                                                                                                      // 1157
    // version number                                                                                                 // 1158
    moment.version = VERSION;                                                                                         // 1159
                                                                                                                      // 1160
    // default format                                                                                                 // 1161
    moment.defaultFormat = isoFormat;                                                                                 // 1162
                                                                                                                      // 1163
    // This function will be called whenever a moment is mutated.                                                     // 1164
    // It is intended to keep the offset in sync with the timezone.                                                   // 1165
    moment.updateOffset = function () {};                                                                             // 1166
                                                                                                                      // 1167
    // This function will load languages and then set the global language.  If                                        // 1168
    // no arguments are passed in, it will simply return the current global                                           // 1169
    // language key.                                                                                                  // 1170
    moment.lang = function (key, values) {                                                                            // 1171
        if (!key) {                                                                                                   // 1172
            return moment.fn._lang._abbr;                                                                             // 1173
        }                                                                                                             // 1174
        key = key.toLowerCase();                                                                                      // 1175
        key = key.replace('_', '-');                                                                                  // 1176
        if (values) {                                                                                                 // 1177
            loadLang(key, values);                                                                                    // 1178
        } else if (values === null) {                                                                                 // 1179
            unloadLang(key);                                                                                          // 1180
            key = 'en';                                                                                               // 1181
        } else if (!languages[key]) {                                                                                 // 1182
            getLangDefinition(key);                                                                                   // 1183
        }                                                                                                             // 1184
        moment.duration.fn._lang = moment.fn._lang = getLangDefinition(key);                                          // 1185
    };                                                                                                                // 1186
                                                                                                                      // 1187
    // returns language data                                                                                          // 1188
    moment.langData = function (key) {                                                                                // 1189
        if (key && key._lang && key._lang._abbr) {                                                                    // 1190
            key = key._lang._abbr;                                                                                    // 1191
        }                                                                                                             // 1192
        return getLangDefinition(key);                                                                                // 1193
    };                                                                                                                // 1194
                                                                                                                      // 1195
    // compare moment object                                                                                          // 1196
    moment.isMoment = function (obj) {                                                                                // 1197
        return obj instanceof Moment;                                                                                 // 1198
    };                                                                                                                // 1199
                                                                                                                      // 1200
    // for typechecking Duration objects                                                                              // 1201
    moment.isDuration = function (obj) {                                                                              // 1202
        return obj instanceof Duration;                                                                               // 1203
    };                                                                                                                // 1204
                                                                                                                      // 1205
                                                                                                                      // 1206
    /************************************                                                                             // 1207
        Moment Prototype                                                                                              // 1208
    ************************************/                                                                             // 1209
                                                                                                                      // 1210
                                                                                                                      // 1211
    extend(moment.fn = Moment.prototype, {                                                                            // 1212
                                                                                                                      // 1213
        clone : function () {                                                                                         // 1214
            return moment(this);                                                                                      // 1215
        },                                                                                                            // 1216
                                                                                                                      // 1217
        valueOf : function () {                                                                                       // 1218
            return +this._d + ((this._offset || 0) * 60000);                                                          // 1219
        },                                                                                                            // 1220
                                                                                                                      // 1221
        unix : function () {                                                                                          // 1222
            return Math.floor(+this / 1000);                                                                          // 1223
        },                                                                                                            // 1224
                                                                                                                      // 1225
        toString : function () {                                                                                      // 1226
            return this.format("ddd MMM DD YYYY HH:mm:ss [GMT]ZZ");                                                   // 1227
        },                                                                                                            // 1228
                                                                                                                      // 1229
        toDate : function () {                                                                                        // 1230
            return this._offset ? new Date(+this) : this._d;                                                          // 1231
        },                                                                                                            // 1232
                                                                                                                      // 1233
        toISOString : function () {                                                                                   // 1234
            return formatMoment(moment(this).utc(), 'YYYY-MM-DD[T]HH:mm:ss.SSS[Z]');                                  // 1235
        },                                                                                                            // 1236
                                                                                                                      // 1237
        toArray : function () {                                                                                       // 1238
            var m = this;                                                                                             // 1239
            return [                                                                                                  // 1240
                m.year(),                                                                                             // 1241
                m.month(),                                                                                            // 1242
                m.date(),                                                                                             // 1243
                m.hours(),                                                                                            // 1244
                m.minutes(),                                                                                          // 1245
                m.seconds(),                                                                                          // 1246
                m.milliseconds()                                                                                      // 1247
            ];                                                                                                        // 1248
        },                                                                                                            // 1249
                                                                                                                      // 1250
        isValid : function () {                                                                                       // 1251
            if (this._isValid == null) {                                                                              // 1252
                if (this._a) {                                                                                        // 1253
                    this._isValid = !compareArrays(this._a, (this._isUTC ? moment.utc(this._a) : moment(this._a)).toArray());
                } else {                                                                                              // 1255
                    this._isValid = !isNaN(this._d.getTime());                                                        // 1256
                }                                                                                                     // 1257
            }                                                                                                         // 1258
            return !!this._isValid;                                                                                   // 1259
        },                                                                                                            // 1260
                                                                                                                      // 1261
        invalidAt: function () {                                                                                      // 1262
            var i, arr1 = this._a, arr2 = (this._isUTC ? moment.utc(this._a) : moment(this._a)).toArray();            // 1263
            for (i = 6; i >= 0 && arr1[i] === arr2[i]; --i) {                                                         // 1264
                // empty loop body                                                                                    // 1265
            }                                                                                                         // 1266
            return i;                                                                                                 // 1267
        },                                                                                                            // 1268
                                                                                                                      // 1269
        utc : function () {                                                                                           // 1270
            return this.zone(0);                                                                                      // 1271
        },                                                                                                            // 1272
                                                                                                                      // 1273
        local : function () {                                                                                         // 1274
            this.zone(0);                                                                                             // 1275
            this._isUTC = false;                                                                                      // 1276
            return this;                                                                                              // 1277
        },                                                                                                            // 1278
                                                                                                                      // 1279
        format : function (inputString) {                                                                             // 1280
            var output = formatMoment(this, inputString || moment.defaultFormat);                                     // 1281
            return this.lang().postformat(output);                                                                    // 1282
        },                                                                                                            // 1283
                                                                                                                      // 1284
        add : function (input, val) {                                                                                 // 1285
            var dur;                                                                                                  // 1286
            // switch args to support add('s', 1) and add(1, 's')                                                     // 1287
            if (typeof input === 'string') {                                                                          // 1288
                dur = moment.duration(+val, input);                                                                   // 1289
            } else {                                                                                                  // 1290
                dur = moment.duration(input, val);                                                                    // 1291
            }                                                                                                         // 1292
            addOrSubtractDurationFromMoment(this, dur, 1);                                                            // 1293
            return this;                                                                                              // 1294
        },                                                                                                            // 1295
                                                                                                                      // 1296
        subtract : function (input, val) {                                                                            // 1297
            var dur;                                                                                                  // 1298
            // switch args to support subtract('s', 1) and subtract(1, 's')                                           // 1299
            if (typeof input === 'string') {                                                                          // 1300
                dur = moment.duration(+val, input);                                                                   // 1301
            } else {                                                                                                  // 1302
                dur = moment.duration(input, val);                                                                    // 1303
            }                                                                                                         // 1304
            addOrSubtractDurationFromMoment(this, dur, -1);                                                           // 1305
            return this;                                                                                              // 1306
        },                                                                                                            // 1307
                                                                                                                      // 1308
        diff : function (input, units, asFloat) {                                                                     // 1309
            var that = this._isUTC ? moment(input).zone(this._offset || 0) : moment(input).local(),                   // 1310
                zoneDiff = (this.zone() - that.zone()) * 6e4,                                                         // 1311
                diff, output;                                                                                         // 1312
                                                                                                                      // 1313
            units = normalizeUnits(units);                                                                            // 1314
                                                                                                                      // 1315
            if (units === 'year' || units === 'month') {                                                              // 1316
                // average number of days in the months in the given dates                                            // 1317
                diff = (this.daysInMonth() + that.daysInMonth()) * 432e5; // 24 * 60 * 60 * 1000 / 2                  // 1318
                // difference in months                                                                               // 1319
                output = ((this.year() - that.year()) * 12) + (this.month() - that.month());                          // 1320
                // adjust by taking difference in days, average number of days                                        // 1321
                // and dst in the given months.                                                                       // 1322
                output += ((this - moment(this).startOf('month')) -                                                   // 1323
                        (that - moment(that).startOf('month'))) / diff;                                               // 1324
                // same as above but with zones, to negate all dst                                                    // 1325
                output -= ((this.zone() - moment(this).startOf('month').zone()) -                                     // 1326
                        (that.zone() - moment(that).startOf('month').zone())) * 6e4 / diff;                           // 1327
                if (units === 'year') {                                                                               // 1328
                    output = output / 12;                                                                             // 1329
                }                                                                                                     // 1330
            } else {                                                                                                  // 1331
                diff = (this - that);                                                                                 // 1332
                output = units === 'second' ? diff / 1e3 : // 1000                                                    // 1333
                    units === 'minute' ? diff / 6e4 : // 1000 * 60                                                    // 1334
                    units === 'hour' ? diff / 36e5 : // 1000 * 60 * 60                                                // 1335
                    units === 'day' ? (diff - zoneDiff) / 864e5 : // 1000 * 60 * 60 * 24, negate dst                  // 1336
                    units === 'week' ? (diff - zoneDiff) / 6048e5 : // 1000 * 60 * 60 * 24 * 7, negate dst            // 1337
                    diff;                                                                                             // 1338
            }                                                                                                         // 1339
            return asFloat ? output : absRound(output);                                                               // 1340
        },                                                                                                            // 1341
                                                                                                                      // 1342
        from : function (time, withoutSuffix) {                                                                       // 1343
            return moment.duration(this.diff(time)).lang(this.lang()._abbr).humanize(!withoutSuffix);                 // 1344
        },                                                                                                            // 1345
                                                                                                                      // 1346
        fromNow : function (withoutSuffix) {                                                                          // 1347
            return this.from(moment(), withoutSuffix);                                                                // 1348
        },                                                                                                            // 1349
                                                                                                                      // 1350
        calendar : function () {                                                                                      // 1351
            var diff = this.diff(moment().zone(this.zone()).startOf('day'), 'days', true),                            // 1352
                format = diff < -6 ? 'sameElse' :                                                                     // 1353
                diff < -1 ? 'lastWeek' :                                                                              // 1354
                diff < 0 ? 'lastDay' :                                                                                // 1355
                diff < 1 ? 'sameDay' :                                                                                // 1356
                diff < 2 ? 'nextDay' :                                                                                // 1357
                diff < 7 ? 'nextWeek' : 'sameElse';                                                                   // 1358
            return this.format(this.lang().calendar(format, this));                                                   // 1359
        },                                                                                                            // 1360
                                                                                                                      // 1361
        isLeapYear : function () {                                                                                    // 1362
            var year = this.year();                                                                                   // 1363
            return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;                                          // 1364
        },                                                                                                            // 1365
                                                                                                                      // 1366
        isDST : function () {                                                                                         // 1367
            return (this.zone() < this.clone().month(0).zone() ||                                                     // 1368
                this.zone() < this.clone().month(5).zone());                                                          // 1369
        },                                                                                                            // 1370
                                                                                                                      // 1371
        day : function (input) {                                                                                      // 1372
            var day = this._isUTC ? this._d.getUTCDay() : this._d.getDay();                                           // 1373
            if (input != null) {                                                                                      // 1374
                if (typeof input === 'string') {                                                                      // 1375
                    input = this.lang().weekdaysParse(input);                                                         // 1376
                    if (typeof input !== 'number') {                                                                  // 1377
                        return this;                                                                                  // 1378
                    }                                                                                                 // 1379
                }                                                                                                     // 1380
                return this.add({ d : input - day });                                                                 // 1381
            } else {                                                                                                  // 1382
                return day;                                                                                           // 1383
            }                                                                                                         // 1384
        },                                                                                                            // 1385
                                                                                                                      // 1386
        month : function (input) {                                                                                    // 1387
            var utc = this._isUTC ? 'UTC' : '',                                                                       // 1388
                dayOfMonth;                                                                                           // 1389
                                                                                                                      // 1390
            if (input != null) {                                                                                      // 1391
                if (typeof input === 'string') {                                                                      // 1392
                    input = this.lang().monthsParse(input);                                                           // 1393
                    if (typeof input !== 'number') {                                                                  // 1394
                        return this;                                                                                  // 1395
                    }                                                                                                 // 1396
                }                                                                                                     // 1397
                                                                                                                      // 1398
                dayOfMonth = this.date();                                                                             // 1399
                this.date(1);                                                                                         // 1400
                this._d['set' + utc + 'Month'](input);                                                                // 1401
                this.date(Math.min(dayOfMonth, this.daysInMonth()));                                                  // 1402
                                                                                                                      // 1403
                moment.updateOffset(this);                                                                            // 1404
                return this;                                                                                          // 1405
            } else {                                                                                                  // 1406
                return this._d['get' + utc + 'Month']();                                                              // 1407
            }                                                                                                         // 1408
        },                                                                                                            // 1409
                                                                                                                      // 1410
        startOf: function (units) {                                                                                   // 1411
            units = normalizeUnits(units);                                                                            // 1412
            // the following switch intentionally omits break keywords                                                // 1413
            // to utilize falling through the cases.                                                                  // 1414
            switch (units) {                                                                                          // 1415
            case 'year':                                                                                              // 1416
                this.month(0);                                                                                        // 1417
                /* falls through */                                                                                   // 1418
            case 'month':                                                                                             // 1419
                this.date(1);                                                                                         // 1420
                /* falls through */                                                                                   // 1421
            case 'week':                                                                                              // 1422
            case 'isoweek':                                                                                           // 1423
            case 'day':                                                                                               // 1424
                this.hours(0);                                                                                        // 1425
                /* falls through */                                                                                   // 1426
            case 'hour':                                                                                              // 1427
                this.minutes(0);                                                                                      // 1428
                /* falls through */                                                                                   // 1429
            case 'minute':                                                                                            // 1430
                this.seconds(0);                                                                                      // 1431
                /* falls through */                                                                                   // 1432
            case 'second':                                                                                            // 1433
                this.milliseconds(0);                                                                                 // 1434
                /* falls through */                                                                                   // 1435
            }                                                                                                         // 1436
                                                                                                                      // 1437
            // weeks are a special case                                                                               // 1438
            if (units === 'week') {                                                                                   // 1439
                this.weekday(0);                                                                                      // 1440
            } else if (units === 'isoweek') {                                                                         // 1441
                this.isoWeekday(1);                                                                                   // 1442
            }                                                                                                         // 1443
                                                                                                                      // 1444
            return this;                                                                                              // 1445
        },                                                                                                            // 1446
                                                                                                                      // 1447
        endOf: function (units) {                                                                                     // 1448
            units = normalizeUnits(units);                                                                            // 1449
            return this.startOf(units).add((units === 'isoweek' ? 'week' : units), 1).subtract('ms', 1);              // 1450
        },                                                                                                            // 1451
                                                                                                                      // 1452
        isAfter: function (input, units) {                                                                            // 1453
            units = typeof units !== 'undefined' ? units : 'millisecond';                                             // 1454
            return +this.clone().startOf(units) > +moment(input).startOf(units);                                      // 1455
        },                                                                                                            // 1456
                                                                                                                      // 1457
        isBefore: function (input, units) {                                                                           // 1458
            units = typeof units !== 'undefined' ? units : 'millisecond';                                             // 1459
            return +this.clone().startOf(units) < +moment(input).startOf(units);                                      // 1460
        },                                                                                                            // 1461
                                                                                                                      // 1462
        isSame: function (input, units) {                                                                             // 1463
            units = typeof units !== 'undefined' ? units : 'millisecond';                                             // 1464
            return +this.clone().startOf(units) === +moment(input).startOf(units);                                    // 1465
        },                                                                                                            // 1466
                                                                                                                      // 1467
        min: function (other) {                                                                                       // 1468
            other = moment.apply(null, arguments);                                                                    // 1469
            return other < this ? this : other;                                                                       // 1470
        },                                                                                                            // 1471
                                                                                                                      // 1472
        max: function (other) {                                                                                       // 1473
            other = moment.apply(null, arguments);                                                                    // 1474
            return other > this ? this : other;                                                                       // 1475
        },                                                                                                            // 1476
                                                                                                                      // 1477
        zone : function (input) {                                                                                     // 1478
            var offset = this._offset || 0;                                                                           // 1479
            if (input != null) {                                                                                      // 1480
                if (typeof input === "string") {                                                                      // 1481
                    input = timezoneMinutesFromString(input);                                                         // 1482
                }                                                                                                     // 1483
                if (Math.abs(input) < 16) {                                                                           // 1484
                    input = input * 60;                                                                               // 1485
                }                                                                                                     // 1486
                this._offset = input;                                                                                 // 1487
                this._isUTC = true;                                                                                   // 1488
                if (offset !== input) {                                                                               // 1489
                    addOrSubtractDurationFromMoment(this, moment.duration(offset - input, 'm'), 1, true);             // 1490
                }                                                                                                     // 1491
            } else {                                                                                                  // 1492
                return this._isUTC ? offset : this._d.getTimezoneOffset();                                            // 1493
            }                                                                                                         // 1494
            return this;                                                                                              // 1495
        },                                                                                                            // 1496
                                                                                                                      // 1497
        zoneAbbr : function () {                                                                                      // 1498
            return this._isUTC ? "UTC" : "";                                                                          // 1499
        },                                                                                                            // 1500
                                                                                                                      // 1501
        zoneName : function () {                                                                                      // 1502
            return this._isUTC ? "Coordinated Universal Time" : "";                                                   // 1503
        },                                                                                                            // 1504
                                                                                                                      // 1505
        hasAlignedHourOffset : function (input) {                                                                     // 1506
            if (!input) {                                                                                             // 1507
                input = 0;                                                                                            // 1508
            }                                                                                                         // 1509
            else {                                                                                                    // 1510
                input = moment(input).zone();                                                                         // 1511
            }                                                                                                         // 1512
                                                                                                                      // 1513
            return (this.zone() - input) % 60 === 0;                                                                  // 1514
        },                                                                                                            // 1515
                                                                                                                      // 1516
        daysInMonth : function () {                                                                                   // 1517
            return moment.utc([this.year(), this.month() + 1, 0]).date();                                             // 1518
        },                                                                                                            // 1519
                                                                                                                      // 1520
        dayOfYear : function (input) {                                                                                // 1521
            var dayOfYear = round((moment(this).startOf('day') - moment(this).startOf('year')) / 864e5) + 1;          // 1522
            return input == null ? dayOfYear : this.add("d", (input - dayOfYear));                                    // 1523
        },                                                                                                            // 1524
                                                                                                                      // 1525
        weekYear : function (input) {                                                                                 // 1526
            var year = weekOfYear(this, this.lang()._week.dow, this.lang()._week.doy).year;                           // 1527
            return input == null ? year : this.add("y", (input - year));                                              // 1528
        },                                                                                                            // 1529
                                                                                                                      // 1530
        isoWeekYear : function (input) {                                                                              // 1531
            var year = weekOfYear(this, 1, 4).year;                                                                   // 1532
            return input == null ? year : this.add("y", (input - year));                                              // 1533
        },                                                                                                            // 1534
                                                                                                                      // 1535
        week : function (input) {                                                                                     // 1536
            var week = this.lang().week(this);                                                                        // 1537
            return input == null ? week : this.add("d", (input - week) * 7);                                          // 1538
        },                                                                                                            // 1539
                                                                                                                      // 1540
        isoWeek : function (input) {                                                                                  // 1541
            var week = weekOfYear(this, 1, 4).week;                                                                   // 1542
            return input == null ? week : this.add("d", (input - week) * 7);                                          // 1543
        },                                                                                                            // 1544
                                                                                                                      // 1545
        weekday : function (input) {                                                                                  // 1546
            var weekday = (this._d.getDay() + 7 - this.lang()._week.dow) % 7;                                         // 1547
            return input == null ? weekday : this.add("d", input - weekday);                                          // 1548
        },                                                                                                            // 1549
                                                                                                                      // 1550
        isoWeekday : function (input) {                                                                               // 1551
            // behaves the same as moment#day except                                                                  // 1552
            // as a getter, returns 7 instead of 0 (1-7 range instead of 0-6)                                         // 1553
            // as a setter, sunday should belong to the previous week.                                                // 1554
            return input == null ? this.day() || 7 : this.day(this.day() % 7 ? input : input - 7);                    // 1555
        },                                                                                                            // 1556
                                                                                                                      // 1557
        get : function (units) {                                                                                      // 1558
            units = normalizeUnits(units);                                                                            // 1559
            return this[units.toLowerCase()]();                                                                       // 1560
        },                                                                                                            // 1561
                                                                                                                      // 1562
        set : function (units, value) {                                                                               // 1563
            units = normalizeUnits(units);                                                                            // 1564
            this[units.toLowerCase()](value);                                                                         // 1565
        },                                                                                                            // 1566
                                                                                                                      // 1567
        // If passed a language key, it will set the language for this                                                // 1568
        // instance.  Otherwise, it will return the language configuration                                            // 1569
        // variables for this instance.                                                                               // 1570
        lang : function (key) {                                                                                       // 1571
            if (key === undefined) {                                                                                  // 1572
                return this._lang;                                                                                    // 1573
            } else {                                                                                                  // 1574
                this._lang = getLangDefinition(key);                                                                  // 1575
                return this;                                                                                          // 1576
            }                                                                                                         // 1577
        }                                                                                                             // 1578
    });                                                                                                               // 1579
                                                                                                                      // 1580
    // helper for adding shortcuts                                                                                    // 1581
    function makeGetterAndSetter(name, key) {                                                                         // 1582
        moment.fn[name] = moment.fn[name + 's'] = function (input) {                                                  // 1583
            var utc = this._isUTC ? 'UTC' : '';                                                                       // 1584
            if (input != null) {                                                                                      // 1585
                this._d['set' + utc + key](input);                                                                    // 1586
                moment.updateOffset(this);                                                                            // 1587
                return this;                                                                                          // 1588
            } else {                                                                                                  // 1589
                return this._d['get' + utc + key]();                                                                  // 1590
            }                                                                                                         // 1591
        };                                                                                                            // 1592
    }                                                                                                                 // 1593
                                                                                                                      // 1594
    // loop through and add shortcuts (Month, Date, Hours, Minutes, Seconds, Milliseconds)                            // 1595
    for (i = 0; i < proxyGettersAndSetters.length; i ++) {                                                            // 1596
        makeGetterAndSetter(proxyGettersAndSetters[i].toLowerCase().replace(/s$/, ''), proxyGettersAndSetters[i]);    // 1597
    }                                                                                                                 // 1598
                                                                                                                      // 1599
    // add shortcut for year (uses different syntax than the getter/setter 'year' == 'FullYear')                      // 1600
    makeGetterAndSetter('year', 'FullYear');                                                                          // 1601
                                                                                                                      // 1602
    // add plural methods                                                                                             // 1603
    moment.fn.days = moment.fn.day;                                                                                   // 1604
    moment.fn.months = moment.fn.month;                                                                               // 1605
    moment.fn.weeks = moment.fn.week;                                                                                 // 1606
    moment.fn.isoWeeks = moment.fn.isoWeek;                                                                           // 1607
                                                                                                                      // 1608
    // add aliased format methods                                                                                     // 1609
    moment.fn.toJSON = moment.fn.toISOString;                                                                         // 1610
                                                                                                                      // 1611
    /************************************                                                                             // 1612
        Duration Prototype                                                                                            // 1613
    ************************************/                                                                             // 1614
                                                                                                                      // 1615
                                                                                                                      // 1616
    extend(moment.duration.fn = Duration.prototype, {                                                                 // 1617
                                                                                                                      // 1618
        _bubble : function () {                                                                                       // 1619
            var milliseconds = this._milliseconds,                                                                    // 1620
                days = this._days,                                                                                    // 1621
                months = this._months,                                                                                // 1622
                data = this._data,                                                                                    // 1623
                seconds, minutes, hours, years;                                                                       // 1624
                                                                                                                      // 1625
            // The following code bubbles up values, see the tests for                                                // 1626
            // examples of what that means.                                                                           // 1627
            data.milliseconds = milliseconds % 1000;                                                                  // 1628
                                                                                                                      // 1629
            seconds = absRound(milliseconds / 1000);                                                                  // 1630
            data.seconds = seconds % 60;                                                                              // 1631
                                                                                                                      // 1632
            minutes = absRound(seconds / 60);                                                                         // 1633
            data.minutes = minutes % 60;                                                                              // 1634
                                                                                                                      // 1635
            hours = absRound(minutes / 60);                                                                           // 1636
            data.hours = hours % 24;                                                                                  // 1637
                                                                                                                      // 1638
            days += absRound(hours / 24);                                                                             // 1639
            data.days = days % 30;                                                                                    // 1640
                                                                                                                      // 1641
            months += absRound(days / 30);                                                                            // 1642
            data.months = months % 12;                                                                                // 1643
                                                                                                                      // 1644
            years = absRound(months / 12);                                                                            // 1645
            data.years = years;                                                                                       // 1646
        },                                                                                                            // 1647
                                                                                                                      // 1648
        weeks : function () {                                                                                         // 1649
            return absRound(this.days() / 7);                                                                         // 1650
        },                                                                                                            // 1651
                                                                                                                      // 1652
        valueOf : function () {                                                                                       // 1653
            return this._milliseconds +                                                                               // 1654
              this._days * 864e5 +                                                                                    // 1655
              (this._months % 12) * 2592e6 +                                                                          // 1656
              ~~(this._months / 12) * 31536e6;                                                                        // 1657
        },                                                                                                            // 1658
                                                                                                                      // 1659
        humanize : function (withSuffix) {                                                                            // 1660
            var difference = +this,                                                                                   // 1661
                output = relativeTime(difference, !withSuffix, this.lang());                                          // 1662
                                                                                                                      // 1663
            if (withSuffix) {                                                                                         // 1664
                output = this.lang().pastFuture(difference, output);                                                  // 1665
            }                                                                                                         // 1666
                                                                                                                      // 1667
            return this.lang().postformat(output);                                                                    // 1668
        },                                                                                                            // 1669
                                                                                                                      // 1670
        add : function (input, val) {                                                                                 // 1671
            // supports only 2.0-style add(1, 's') or add(moment)                                                     // 1672
            var dur = moment.duration(input, val);                                                                    // 1673
                                                                                                                      // 1674
            this._milliseconds += dur._milliseconds;                                                                  // 1675
            this._days += dur._days;                                                                                  // 1676
            this._months += dur._months;                                                                              // 1677
                                                                                                                      // 1678
            this._bubble();                                                                                           // 1679
                                                                                                                      // 1680
            return this;                                                                                              // 1681
        },                                                                                                            // 1682
                                                                                                                      // 1683
        subtract : function (input, val) {                                                                            // 1684
            var dur = moment.duration(input, val);                                                                    // 1685
                                                                                                                      // 1686
            this._milliseconds -= dur._milliseconds;                                                                  // 1687
            this._days -= dur._days;                                                                                  // 1688
            this._months -= dur._months;                                                                              // 1689
                                                                                                                      // 1690
            this._bubble();                                                                                           // 1691
                                                                                                                      // 1692
            return this;                                                                                              // 1693
        },                                                                                                            // 1694
                                                                                                                      // 1695
        get : function (units) {                                                                                      // 1696
            units = normalizeUnits(units);                                                                            // 1697
            return this[units.toLowerCase() + 's']();                                                                 // 1698
        },                                                                                                            // 1699
                                                                                                                      // 1700
        as : function (units) {                                                                                       // 1701
            units = normalizeUnits(units);                                                                            // 1702
            return this['as' + units.charAt(0).toUpperCase() + units.slice(1) + 's']();                               // 1703
        },                                                                                                            // 1704
                                                                                                                      // 1705
        lang : moment.fn.lang                                                                                         // 1706
    });                                                                                                               // 1707
                                                                                                                      // 1708
    function makeDurationGetter(name) {                                                                               // 1709
        moment.duration.fn[name] = function () {                                                                      // 1710
            return this._data[name];                                                                                  // 1711
        };                                                                                                            // 1712
    }                                                                                                                 // 1713
                                                                                                                      // 1714
    function makeDurationAsGetter(name, factor) {                                                                     // 1715
        moment.duration.fn['as' + name] = function () {                                                               // 1716
            return +this / factor;                                                                                    // 1717
        };                                                                                                            // 1718
    }                                                                                                                 // 1719
                                                                                                                      // 1720
    for (i in unitMillisecondFactors) {                                                                               // 1721
        if (unitMillisecondFactors.hasOwnProperty(i)) {                                                               // 1722
            makeDurationAsGetter(i, unitMillisecondFactors[i]);                                                       // 1723
            makeDurationGetter(i.toLowerCase());                                                                      // 1724
        }                                                                                                             // 1725
    }                                                                                                                 // 1726
                                                                                                                      // 1727
    makeDurationAsGetter('Weeks', 6048e5);                                                                            // 1728
    moment.duration.fn.asMonths = function () {                                                                       // 1729
        return (+this - this.years() * 31536e6) / 2592e6 + this.years() * 12;                                         // 1730
    };                                                                                                                // 1731
                                                                                                                      // 1732
                                                                                                                      // 1733
    /************************************                                                                             // 1734
        Default Lang                                                                                                  // 1735
    ************************************/                                                                             // 1736
                                                                                                                      // 1737
                                                                                                                      // 1738
    // Set default language, other languages will inherit from English.                                               // 1739
    moment.lang('en', {                                                                                               // 1740
        ordinal : function (number) {                                                                                 // 1741
            var b = number % 10,                                                                                      // 1742
                output = (~~ (number % 100 / 10) === 1) ? 'th' :                                                      // 1743
                (b === 1) ? 'st' :                                                                                    // 1744
                (b === 2) ? 'nd' :                                                                                    // 1745
                (b === 3) ? 'rd' : 'th';                                                                              // 1746
            return number + output;                                                                                   // 1747
        }                                                                                                             // 1748
    });                                                                                                               // 1749
                                                                                                                      // 1750
    /* EMBED_LANGUAGES */                                                                                             // 1751
                                                                                                                      // 1752
    /************************************                                                                             // 1753
        Exposing Moment                                                                                               // 1754
    ************************************/                                                                             // 1755
                                                                                                                      // 1756
                                                                                                                      // 1757
    // CommonJS module is defined                                                                                     // 1758
    if (hasModule) {                                                                                                  // 1759
        module.exports = moment;                                                                                      // 1760
    }                                                                                                                 // 1761
    /*global ender:false */                                                                                           // 1762
    if (typeof ender === 'undefined') {                                                                               // 1763
        // here, `this` means `window` in the browser, or `global` on the server                                      // 1764
        // add `moment` as a global object via a string identifier,                                                   // 1765
        // for Closure Compiler "advanced" mode                                                                       // 1766
        this['moment'] = moment;                                                                                      // 1767
    }                                                                                                                 // 1768
    /*global define:false */                                                                                          // 1769
    if (typeof define === "function" && define.amd) {                                                                 // 1770
        define("moment", [], function () {                                                                            // 1771
            return moment;                                                                                            // 1772
        });                                                                                                           // 1773
    }                                                                                                                 // 1774
}).call(this);                                                                                                        // 1775
                                                                                                                      // 1776
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                    //
// packages/moment/export-moment.js                                                                                   //
//                                                                                                                    //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                      //
//This file exposes moment so that it works with Meteor 0.6.5's package system.                                       // 1
if (typeof Package !== "undefined") {                                                                                 // 2
  moment = this.moment;                                                                                               // 3
}                                                                                                                     // 4
                                                                                                                      // 5
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);


/* Exports */
if (typeof Package === 'undefined') Package = {};
Package.moment = {
  moment: moment
};

})();
