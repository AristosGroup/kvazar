/*
Template.issuesToolbar.events({

    'click button.new':function(e) {

        var issue = {
           subject:'',
            order:1
        };

        Meteor.call('issueCreate', issue, function(error, id) {
            if (error)
                return alert(error.reason);

            Router.go('issueDetail', {_id:id});
        });
    }
});
*/
