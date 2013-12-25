Meteor.publish('issues', function (options) {
    //todo возращать задачи только назначенные этому пользователю или если он подписан на них.
    return Issue.find({}, options);

});

Meteor.publish('users', function () {
    return User.find({}, {fields: {'current_workspace_id': 1}});
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
 * Создаем личный воркспейс для юзера, при его регистрации
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
 * Создаем гуппу админов, при создании воркспейса
 */
Workspace.find().observe({
    added: function(workspace) {
        var workspaceId=workspace._id;

        var group = Group.create({title: 'Admins', user_id: workspace.user_id, members: [workspace.user_id], workspace_id: workspaceId});

    }
});





