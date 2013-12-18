class @User extends Minimongoid
  # indicate which collection to use
  @_collection: Meteor.users

  @default: {
    defaultWorkspaceId:1,
    currentWorkspaceId:false
  },

  # class methods
  @current: ->
    User.init(Meteor.user()) if Meteor.userId()


  # instance methods
  # return true if user is friends with User where id==user_id
  friendsWith: (user_id) ->
    _.contains @friend_ids, user_id
  # return true if user is friends with the current logged in user
  myFriend: ->
    User.current().friendsWith(@id)


  currentWorkspace: ->
    if(@currentWorkspaceId)
      return Workspace.init(@currentWorkspaceId);
    else
      return Workspace.init(@defaultWorkspaceId);




  # grab the first email off the emails array
  email: ->
    if (@emails and @emails.length) then @emails[0].address else ''
