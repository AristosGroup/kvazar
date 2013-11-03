Template.issuesToolbar.events({

    'click button.new':function(e) {

        var issue = {
           subject:''
        };

        Meteor.call('issueCreate', issue, function(error, id) {
            if (error)
                return alert(error.reason);

            Meteor.Router.to('issueDetail', id);
        });
    }
});
