Meteor.publish('issues', function(options) {
    //todo возращать задачи только назначенные этому пользователю или если он подписан на них.
    return Issue.find({}, options);

});


Meteor.publish('notifications', function() {
    return Notification.find({userId: this.userId});
});

Meteor.publish('workspaces', function() {
    return Workspace.find();
});

Meteor.publish('projects', function() {
    return Project.find();
});

/**
 * Создаем личный воркспейс для юзера, при его регистрации
 * @param userId
 */
Hooks.onCreateUser = function (userId) {
    Workspace.create({title:'My workspace', userId:userId, members:[userId]});
};


