Meteor.publish('issues', function(options) {
    //todo возращать задачи только назначенные этому пользователю или если он подписан на них.
    /**
     *   return Issues.find({'author':'Tom'}, {fields: {
    date: false
  }});
     */
    return Issue.find({}, options);

});


Meteor.publish('notifications', function() {
    return Notification.find({userId: this.userId});
});

