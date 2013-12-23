class @Group extends Minimongoid

  @_collection: new Meteor.Collection('groups')


  @belongs_to: [
    {name: 'workspace', class_name: 'Workspace'}
  ]



  allMembers: ->
    User.find({_id: {$in: this.members}}) if(this.members)

  notMembers: ->
    User.find({_id: {$nin: this.members}}) if(this.members)


  addUserToGroup: (user) ->
    @push({members: user._id});

