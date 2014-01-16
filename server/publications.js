Meteor.publish('testComments', function (opts) {
    return TestComments.find({}, opts);
});

Meteor.publish('reports', function () {
    return Reports.find({});

});


Meteor.publish('tasks', function (options) {
    return Tasks.find({}, options);

});

Meteor.publish('statuses', function () {
    return Statuses.find({});

});

Meteor.publish('workflows', function () {
    return Workflows.find();
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
    var workspace = Workspaces.insert({title: 'Personal', userId: userId, members: [userId]});
    user.currentWorkspaceId = workspace;

    if (Groups.find({workspaceId: workspace}).count() < 1)
        Groups.insert({title: 'Admins', userId: userId, members: [userId], users: [userId], workspaceId: workspace, workflowCode: 'manager'});

    return user;
});


Twit = new TwitMaker({
    consumer_key: 'qqYFPykEqnLVS5Pj1QA9A',
    consumer_secret: 'ePNNysJf1fwDEOKrH5uIR0qNLbNMNuvy1pwBdK3PX0',
    access_token: '1160113094-0LOhKA6ayx2GfzPRAuOA6oB0uvrDzwQLYQIRnUP',
    access_token_secret: 'UFyAsUkggvgIundxdBMj3ev6kIYu4A322UrsR7lhNGcYi'
});


var stream = Twit.stream('statuses/filter', { track: '#EXADirectioners' });

function handle_message(msg) {
  //  return TestComments.insert({email: 'twitterRobot@test.ru', message: msg.text});

}

bound_handle_message = Meteor.bindEnvironment(handle_message, function(e) {
    console.log("exception! " + e);
});

stream.on('tweet', function (tweet) {
    bound_handle_message(tweet);
});








