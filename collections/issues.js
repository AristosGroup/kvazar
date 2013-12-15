Issue = _.extend( Commentable,{
_collection: new Meteor.Collection('issues'),


belongs_to: [
    {name: 'assignedTo', class_name: 'User'},
    {name: 'author', class_name: 'User'}
]
});


Issues = Issue._collection;


Issue._collection.allow({
    insert: function(userId, doc) {
        // only allow posting if you are logged in
        return true;
    },

    update: function(userId, doc) {
        // only allow posting if you are logged in
        return true;
    }
});


Meteor.methods({
    issueCreate: function(postAttributes) {
        var user = Meteor.user();
         //   postWithSameLink = Issues.findOne({url: postAttributes.url});

        // ensure the user is logged in
        if (!user)
            throw new Meteor.Error(401, "You need to login to post new stories");


        // pick out the whitelisted keys
        var post = _.extend(_.pick(postAttributes, 'order', 'subject'), {
            userId: user._id,
          //  author: user.profile.name,
            submitted: new Date().getTime(),
            status:1
        });

        var issueId = Issues.insert(post);

        Issues.update({order: {$gte: postAttributes.order}},
            {$inc: {order: 1}},
            {multi: true});

        return issueId;
    }
});

