Meteor.Router.add({
    '/': 'issueList',
    '/issues/:_id': {
        to: 'issueDetail',
        and: function(id) {
            Session.set('currentIssueId', id);
            Session.set("markdown_data", '');
        }
    }
});