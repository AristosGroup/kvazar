Meteor.publish('issues', function (options) {
    return Issue.find({}, options);

});

Meteor.publish('users', function () {
    return User.find({}, {fields: {'current_workspace_id': 1,emails:1}});
});


Meteor.publish('notifications', function () {
    return Notification.find({user_id: this.userId});
});

Meteor.publish('workspaces', function () {
    return Workspace.find({members:this.userId});
});


Meteor.publish('groups', function () {
    return Group.find({members:this.userId});
});

Meteor.publish('projects', function () {
    return Project.find({members:this.userId});
});


Meteor.publish('categories', function () {
    return Category.find({members:this.userId});
});


/**
 * Create a personal workspace for the user, when sign up
 *
 */

User.find().observe({
 added: function(user) {
     var userId=user._id;
     var workspace = Workspace.create({title: 'My workspace', user_id: userId, members: [userId]});
     User.init(user).update({current_workspace_id: workspace._id})
 }
 });


/**
 * Create a group Admins to create workspace
 */
Workspace.find().observe({
    added: function(workspace) {
        var workspaceId=workspace._id;
        var group = Group.create({title: 'Admins', user_id: workspace.user_id, members: [workspace.user_id], workspace_id: workspaceId});

    }
});





