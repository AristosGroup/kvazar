class @Category extends Minimongoid
  # indicate which collection to use
  @_collection: new Meteor.Collection('categories')

  # model relations
  @belongs_to: [
    {name: 'workspace'}
  ]


  @createNewCategory: (data) ->
    data.user_id = User.current()._id
    data.title  = 'New category' if(!data.title)
    data.color  = '#f3f5f9' if(!data.color)
    return Category.create(data);






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
