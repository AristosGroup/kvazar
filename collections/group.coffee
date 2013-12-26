# Members - участники группы, т.е. те кто имеет право просматривать группу, использовать фильтры по группе, добавлять в нее и тд
# Users  - Пользователи, которые относятся к данной группе. Один пользователь - одна группа для воркспейса
#
#


class @Group extends Minimongoid

  @_collection: new Meteor.Collection('groups')


  @belongs_to: [
    {name: 'workspace', class_name: 'Workspace'}
  ]



  allMembers: ->
    return User.find({_id: {$in: @members}}) if(@members)
    return []

  notMembers: ->
    User.find({_id: {$nin: @members}}) if(@members)


  allUsers: ->
    return User.find({_id: {$in: @users}}) if(@users)
    return []

  notUsers: ->
    User.find({_id: {$nin: @users}}) if(@users)


  addUserToGroup: (data) ->
    @push({users: data.user_id})


  @createNewGroup: (data) ->
    data.user_id = User.current()._id
    data.members = [User.current()._id]
    return Group.create(data)

  addMembersToGroup: (data) ->
    @push(members:data.member_id)



