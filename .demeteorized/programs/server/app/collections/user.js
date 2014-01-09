(function(){Meteor.users.allow({
    insert: function (userId, doc) {
        // only allow posting if you are logged in
        return true;
    },

    update: function (userId, doc) {
        // only allow posting if you are logged in
        return true;
    }
});

UsersManager = {

    email: function (user) {
        if (user.emails && user.emails.length) {
            return user.emails[0].address;
        } else {
            return '';
        }
    },

    userName: function (user) {
        var addr, email, parts;
        email = UsersManager.email(user);
        parts = email.split('@');
        addr = parts[0];
        return addr.charAt(0).toUpperCase() + addr.slice(1);
    },
    shortUserName: function (user) {
        var parts, user_name;
        if (this.userName(user).indexOf('.') > 0) {
            parts = this.userName(user).split('.');
            user_name = parts[0].charAt(0) + parts[1].charAt(0);
            return user_name.toUpperCase();
        }
        return this.userName(user).charAt(0).toUpperCase();
    },

    getGravatar: function (user, options) {

        if(!user) return '/images/avatar_default.jpg';

        var email = this.email(user);

        if (user && this.email(user)) {
            var options = options || {};

            var protocol = options.secure ? 'https' : 'http';
            delete options.secure;
            var hash = CryptoJS.MD5(this.email(user)).toString();
            var url = protocol + '://www.gravatar.com/avatar/' + hash;

            var params = _.map(options,function (val, key) {
                return key + "=" + val
            }).join('&');
            if (params !== '')
                url += '?' + params;

            return url;

        }
    },


    friendsWith: function (user, user_id) {
        return _.contains(user.friendIds, user_id);
    },

    myFriend: function (user) {
        return User.current().friendsWith(user._id);
    },

    currentWorkspaceForUser: function (user) {
        return Workspaces.findOne({
            _id: user.currentWorkspaceId
        });
    },

    workspaces: function (user) {
        return Workspaces.find({
            members: user._id
        });
    },

    workspacesWhithoutCurrent: function (user) {
        return Workspaces.find({
            $and: [
                {
                    members: user.id
                },
                {
                    _id: {
                        $ne: user.currentWorkspaceId
                    }
                }
            ]
        });
    }


};

CurrentWorkspace = function () {
    return UsersManager.currentWorkspaceForUser(Meteor.user());
};


})();
