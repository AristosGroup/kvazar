// super, super simple
Gravatar = {
    getGravatar: function(user, options) {
        if(user && user.email()){
            var options = options || {};

            var protocol = options.secure ? 'https' : 'http';
            delete options.secure;
            var hash = md5(user.email());
            var url = protocol + '://www.gravatar.com/avatar/' + hash;

            var params = _.map(options, function(val, key) { return key + "=" + val}).join('&');
            if (params !== '')
                url += '?' + params;

            return url;

        }
    }
};