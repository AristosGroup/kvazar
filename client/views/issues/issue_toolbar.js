Template.issuesToolbar.events({

    'click button.new':function(e) {



        Meteor.call('issueCreate', function(error, id) {
            if (error)
                return alert(error.reason);

            Meteor.Router.to('issueDetail', id);
        });
    }
});
