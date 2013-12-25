class @Project extends Minimongoid

  @_collection: new Meteor.Collection('projects')


  @belongs_to: [
    {name: 'workspace', class_name: 'Workspace'}
  ]

  error_message: ->
      msg = ''
      for i in @errors
        for key,value of i
          msg += "<strong>#{key}:</strong> #{value}"
      msg


  @createNewProject: (data) ->
    data.user_id = User.current()._id
    data.members = [User.current()._id]
    data.title  = 'New project' if(!data.title)
    data.color  = '#f3f5f9' if(!data.color)
    return Project.create(data);





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
