Meteor.publish('issues', function() {
    //todo возращать задачи только назначенные этому пользователю или если он подписан на них.
    /**
     *   return Issues.find({'author':'Tom'}, {fields: {
    date: false
  }});
     */
    return Issue.find({}, {sort: {order: 1}});

});


Meteor.publish('tags', function() {
    //todo возращать задачи только назначенные этому пользователю или если он подписан на них.
    /**
     *   return Issues.find({'author':'Tom'}, {fields: {
    date: false
  }});
     */
    return Tags.find();

});


Meteor.publish('statuses', function() {
    //todo возращать задачи только назначенные этому пользователю или если он подписан на них.
    /**
     *   return Issues.find({'author':'Tom'}, {fields: {
    date: false
  }});
     */
    return Status.find();

});