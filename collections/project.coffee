class @Project extends Minimongoid
  # indicate which collection to use
  @_collection: new Meteor.Collection('projects')

  # model relations
  @belongs_to: [
    {name: 'workspace',class_name: 'Workspace'}
  ]

  error_message: ->
      msg = ''
      for i in @errors
        for key,value of i
          msg += "<strong>#{key}:</strong> #{value}"
      msg





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
