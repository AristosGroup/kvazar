class @User extends Minimongoid
  # indicate which collection to use
  @_collection: Meteor.users

  @current: ->
    User.init(Meteor.user()) if Meteor.userId()

  @default : {
    issues_view_mode:"quick"
  }


  # return true if user is friends with User where id==user_id
  friendsWith: (user_id) ->
    _.contains @friend_ids, user_id
  # return true if user is friends with the current logged in user
  myFriend: ->
    User.current().friendsWith(@id)


  currentWorkspace: ->
    return Workspace.first({_id: this.current_workspace_id})

  workspaces: ->
    return Workspace.find({members: Meteor.userId()})

  workspacesWhithoutCurrent: ->
    return Workspace.find($and: [
      {members: @id},
      {_id: {$ne: @current_workspace_id}}
    ]);


  # grab the first email off the emails array
  email: ->
    if (@emails and @emails.length) then @emails[0].address else ''


  userName: ->
    email = this.email()
    parts = email.split('@')
    addr = parts[0]
    return addr.charAt(0).toUpperCase() + addr.slice(1)




  shortUserName: ->
    if(@userName().indexOf('.') > 0)
      parts = @userName().split('.')
      user_name = parts[0].charAt(0) + parts[1].charAt(0)
      return user_name.toUpperCase();
    return @userName().charAt(0).toUpperCase()




