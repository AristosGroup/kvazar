class @Workspace extends Minimongoid

  @_collection: new Meteor.Collection('workspaces')

  @has_many: [
    {name: 'categories', foreign_key: 'workspace_id'},
    {name: 'projects', foreign_key: 'workspace_id'}
  ]

  allProjects: ->
    return Project.find({workspace_id: this._id});

  allCategories: ->
    return Category.find({workspace_id: this._id});

  allMembers: ->
    return User.find({_id: {$in: this.members}});

  notMembers: ->
    return User.find({_id: {$nin: this.members}});


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
