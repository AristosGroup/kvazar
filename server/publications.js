Meteor.publish('issues', function (options) {
    return Issues.find({}, options);

});

Meteor.publish('statuses', function () {
    return Statuses.find({});

});

Meteor.publish('users', function () {
    return Meteor.users.find({}, {fields: {'currentWorkspaceId': 1, emails: 1, profile: 1}});
});


Meteor.publish('notifications', function () {
    return Notifications.find({userId: this.userId});
});

Meteor.publish('workspaces', function () {
    return Workspaces.find({members: this.userId});
});


Meteor.publish('groups', function () {
    return Groups.find({members: this.userId});
});

Meteor.publish('projects', function () {
    return Projects.find({members: this.userId});
});


Meteor.publish('categories', function () {
    return Categories.find({members: this.userId});
});


Accounts.onCreateUser(function (options, user) {
    var userId = user._id;
    var workspace = Workspaces.insert({title: 'My workspace', userId: userId, members: [userId]});
    user.currentWorkspaceId = workspace;

    if (Groups.find({workspaceId: workspace}).count() < 1)
        Groups.insert({title: 'Admins', userId: userId, members: [userId], users: [userId], workspaceId: workspace});

    return user;
});






