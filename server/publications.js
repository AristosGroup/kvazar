Meteor.publish('issues', function() {
    //todo возращать задачи только назначенные этому пользователю или если он подписан на них.
    /**
     *   return Issues.find({'author':'Tom'}, {fields: {
    date: false
  }});
     */
    return Issues.find();
});