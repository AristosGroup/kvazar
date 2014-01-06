class @Workspace extends Minimongoid

  @_collection: new Meteor.Collection('workspaces')

  @has_many: [
    {name: 'categories', foreign_key: 'workspace_id'},
    {name: 'projects', foreign_key: 'workspace_id'}
    {name: 'groups', foreign_key: 'workspace_id'}
  ]


  @after_create: (obj) ->
    if(Group.find({workspace_id:obj._id}).count() < 1)
      Group.create({title: 'Admins', user_id: obj.user_id, members: [obj.user_id], users: [obj.user_id], workspace_id: obj._id})
    return obj

  allProjects: ->
    return Projects.find({workspace_id: this._id});

  allCategories: ->
    return Category.find({workspace_id: this._id});

  allMembers: ->
    return User.find({_id: {$in: this.members}}) if(this.members)

  notMembers: ->
    return User.find({_id: {$nin: @members}})


  allGroups: ->
    return Group.find({workspace_id: this._id});

