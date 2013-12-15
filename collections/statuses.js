Status = _.extend(Minimongoid, {
    _collection: new Meteor.Collection('statuses')

});


Status._collection.allow({
    insert: function(userId, doc) {
        // only allow posting if you are logged in
        return !! userId;
    },

    update: function(userId, doc) {
        // only allow posting if you are logged in
        return true;
    }
});



