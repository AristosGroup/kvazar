/*
Category = _.extend(Minimongoid, {
    _collection: new Meteor.Collection('categories'),

    belongs_to: [
        {name: 'workspace', class_name: 'Workspace'}

    ]


});


Category._collection.allow({
    insert: function(userId, doc) {
        // only allow posting if you are logged in
        return !! userId;
    },

    update: function(userId, doc) {
        // only allow posting if you are logged in
        return true;
    }
});



*/
