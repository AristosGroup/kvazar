Meteor.publish('issues', function (options) {
    //todo возращать задачи только назначенные этому пользователю или если он подписан на них.
    return Issue.find({}, options);

});

Meteor.publish('users', function () {
    return User.find({},{fields: {'current_workspace_id':1}});
});



Meteor.publish('notifications', function () {
    return Notification.find({userId: this.userId});
});

Meteor.publish('workspaces', function () {
    return Workspace.find();
});

Meteor.publish('projects', function () {
    return Project.find();
});


Meteor.publish('categories', function () {
    return Category.find();
});


/**
 * Создаем личный воркспейс для юзера, при его регистрации
 * @param userId
 */
Hooks.onCreateUser = function (userId) {
    var workspace = Workspace.create({title: 'My workspace', user_id: userId, members: [userId]});
    User.first({_id:userId}).update({current_workspace_id: workspace._id})
};

/*Posts.find().observe({
    added: function(post) {
        // when 'added' callback fires, add HTML element
        $('ul').append('<li id="' + post._id + '">' + post.title + '</li>');
    },
    changed: function(post) {
        // when 'changed' callback fires, modify HTML element's text
        $('ul li#' + post._id).text(post.title);
    },
    removed: function(post) {
        // when 'removed' callback fires, remove HTML element
        $('ul li#' + post._id).remove();
    }
});*/





