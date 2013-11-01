Template.issueDetail.helpers({
    currentIssue: function () {
        return Issues.findOne(Session.get('currentIssueId'));
    },
    markdown_data: function () {
        return Session.get("markdown_data");
    }
});



Template.issueDetail.rendered = function () {

    var id = Session.get('currentIssueId');

    console.log('render #issue_item_' + id);

    $('div.row.active').removeClass('active');
    var $issueRow = $('#issue_item_' + id);

    $issueRow.addClass('active');
    $issueRow.find('input').focus();


};


Template.issueDetail.events({

    'keypress, focus textarea.description': function (e) {

        if (e.type != 'focus' && e.keyCode != 13) return;

        Session.set("markdown_data", e.target.value);
    }
});

