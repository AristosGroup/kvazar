class @Query extends Minimongoid
  # indicate which collection to use
  @_collection: new Meteor.Collection('queries')

  # model relations
  @belongs_to: [
    {name: 'workspace'}
  ]







###

Workspace._collection.allow({
  insert: function(userId, doc) {
// only allow posting if you are logged in
return !! userId;
},

update: function(userId, doc) {
// only allow posting if you are logged in
return true;
}
});

###
