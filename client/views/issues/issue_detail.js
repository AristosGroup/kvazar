Template.issueDetail.helpers({
    currentIssue: function () {
        return Issue.find(Session.get('currentIssueDetailId'));
    },

    detailOpen: function () {
        return Session.get("currentIssueDetailId") ?
            "show" : "";
    },

    markdown_data: function () {
        return Session.get("markdown_data");
    },

    followers: function () {

    },

    status: function () {

    },

    statusAction: function () {

    },

    projects: function () {

    },

    assignedTo: function () {

    },

    createdAt: function () {
        var day = moment.unix(this.createdAt / 1000);
        return moment(day, "YYYYMMDD").fromNow();

    }
});


Template.issueDetail.rendered = function (e) {

    //  var id = Session.get('currentIssueDetailId');

};


Template.issueDetail.events({

    'keypress, focus textarea.description': function (e) {

        if (e.type != 'focus' && e.keyCode != 13) return;

        Session.set("markdown_data", e.target.value);
    },

    'click a.closeIssueDetail': function (e) {
        e.preventDefault();
        Session.set('currentIssueDetailId', null);

    }
});

