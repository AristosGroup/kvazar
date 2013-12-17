User = _.extend(Minimongoid, {
    _collection: Meteor.users,

    current: function () {
        var user = null;
        if (Meteor.userId()) {
            user = User.init(Meteor.user());

        }
        return user;
    }
});
