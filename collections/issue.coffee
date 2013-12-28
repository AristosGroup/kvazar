class @Issue extends Minimongoid
  @_collection: new Meteor.Collection('issues')

  @defaults: {
    type: "task" # epic, reminder, bug
  }

  @createNewTaskByContext: (data, context) ->
    status = Status.first({default: 1})
    data.workspace_id = User.current().current_workspace_id
    data.user_id = User.current()._id
    data.status_id = status._id
    data.status_title = status.title
    data.followers = [User.current()._id]
    Issue.create(data);

  @createNewEpic: (data) ->
    status = Status.first({default: 1})
    data.workspace_id = User.current().current_workspace_id
    data.type = "epic"
    data.user_id = User.current()._id
    data.status_id = status._id
    data.status_title = status.title
    data.followers = [User.current()._id]
    Issue.create(data);

