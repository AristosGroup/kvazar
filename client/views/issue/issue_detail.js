Template.issueDetail.helpers({
    currentIssue: function () {
        return Issues.findOne(Session.get('currentIssueId'));
    },
    markdown_data: function () {
        return Session.get("markdown_data");
    },
    statusObj: function () {


        return  Statuses.findOne(this.status);
    },

    tagsString: function () {
        var tags = this.tags;

        if (!tags) return '';
        var str = tags.join(',');
        return str;
    }
});


Template.issueDetail.rendered = function (e) {

    var id = Session.get('currentIssueId');


    $('div.row.active').removeClass('active');
    var $issueRow = $('#issue_item_' + id);

    $issueRow.addClass('active');
    $issueRow.find('input').focus();


    /**
     * tags
     */
    var $this = this;


    var alltags = Tags.find().fetch();
    alltags = _.map(alltags, function (tag, key) {
        return tag.title;
    });
    var tags = $($this.find('input.tags'));
    tags.select2({tags: alltags

    }).change(
        function (e) {
            Issues.update(id, {$set: {tags: e.val}});
            Meteor.call('tagsUpdate', e.added, e.removed, function (error, result) {  } );
        }
    );


};


Template.issueDetail.events({

    'keypress, focus textarea.description': function (e) {

        if (e.type != 'focus' && e.keyCode != 13) return;

        Session.set("markdown_data", e.target.value);
    }
});

