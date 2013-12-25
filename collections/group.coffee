class @Group extends Minimongoid

  @_collection: new Meteor.Collection('groups')


  @belongs_to: [
    {name: 'workspace', class_name: 'Workspace'}
  ]



  allMembers: ->
    User.find({_id: {$in: @members}}) if(@members)

  notMembers: ->
    User.find({_id: {$nin: @members}}) if(@members)


  addUserToGroup: (user) ->
    @push({members: user._id})


  @createNewGroup: (data) ->
    data.user_id = User.current()._id
   # data.members = [User.current()._id]
    return Group.create(data)

  addMembersToGroup: (data) ->
    @push(members:data.member_id)



