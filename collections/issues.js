Issues = new Meteor.Collection('issues');

Issues.allow({
    insert: function(userId, doc) {
        // only allow posting if you are logged in
        return !! userId;
    }
});