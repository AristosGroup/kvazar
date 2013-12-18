Template.notifications.helpers({
  notifications: function() {
    return Notification.find({userId: Meteor.userId(), read: false});
  },
  notificationCount: function(){
  	return Notification.find({userId: Meteor.userId(), read: false}).count();
  }
});

Template.notification.helpers({
  notificationPostPath: function() {
    return Router.routes.postPage.path({_id: this.postId});
  }
});

Template.notification.events({
  'click a': function() {
    Notification.update(this._id, {$set: {read: true}});
  }
});