class @Workspace extends Minimongoid
  # indicate which collection to use
  @_collection: new Meteor.Collection('workspaces')

  @has_many: [
    {name: 'categories', foreign_key: 'workspace_id'},
    {name: 'projects', foreign_key: 'workspace_id'},
  ]

  allProjects: ->
    return Project.find({workspace_id:this._id});

  allCategories: ->
    return Category.find({workspace_id:this._id});






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
