Template.issueDetail.helpers({
    currentIssue: function() {
        return Issues.findOne(Session.get('currentIssueId'));
    }
});