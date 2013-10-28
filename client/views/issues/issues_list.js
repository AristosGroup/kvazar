Template.issuesList.helpers({
    issues: function() {
        return Issues.find();
    }
});