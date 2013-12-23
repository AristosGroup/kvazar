class @Workspace extends Minimongoid

  @_collection: new Meteor.Collection('workspaces')

  @has_many: [
    {name: 'categories', foreign_key: 'workspace_id'},
    {name: 'projects', foreign_key: 'workspace_id'}
    {name: 'groups', foreign_key: 'workspace_id'}
  ]

  allProjects: ->
    return Project.find({workspace_id: this._id});

  allCategories: ->
    return Category.find({workspace_id: this._id});

  allMembers: ->
    return User.find({_id: {$in: this.members}}) if(this.members)

  notMembers: ->
    return User.find({_id: {$nin: this.members}}) if(this.members)

  allGroups: ->
    return Group.find({workspace_id: this._id});

