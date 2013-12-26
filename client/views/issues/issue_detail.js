Template.issueDetail.helpers({
    currentIssue: function () {
        return Issue.find(Session.get('currentIssueDetailId'));
    },
    markdown_data: function () {
        return Session.get("markdown_data");
    }
});


Template.issueDetail.rendered = function (e) {

    var id = Session.get('currentIssueDetailId');

};


Template.issueDetail.events({

    'keypress, focus textarea.description': function (e) {

        if (e.type != 'focus' && e.keyCode != 13) return;

        Session.set("markdown_data", e.target.value);
    },

    'click a.closeIssueDetail' : function(e)
    {
        e.preventDefault();

        $('li.list-group-item').removeClass('active');
        $('#issue-detail').removeClass('show');

    }
});

