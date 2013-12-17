/*
Workspace = _.extend(Minimongoid, {
    _collection: new Meteor.Collection('workspaces'),

    has_many: [
        {name:'projects',class_name:'Project'},
        {name:'categories',class_name:'Category'},
        {name:'issues',class_name:'Issue'}
    ]

});


Workspace._collection.allow({
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
