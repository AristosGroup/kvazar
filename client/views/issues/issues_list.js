Session.set('currentIssueDetailId', null);

Template.issuesList.helpers({
    issuesListAll: function () {
        return this.issues;

    }
});


Template.issuesList.events({


    //quick task create
    'keydown #new-simple-issue': function (e) {

        //submit quick task
        if (jwerty.is('enter', e)) {
            e.preventDefault();
            var val = $(e.currentTarget).val();
            Meteor.call('createTask', {subject: val}, function (error, id) {
                $(e.currentTarget).val('');
                Session.set('currentIssueDetailId', id);
            });


        }
    },

    //keydown on the listIssue section
    'keydown section.vbox': function (e) {
        var current = $('#' + Session.get('currentIssueDetailId'));

        //activate next issue in the list
        if (jwerty.is('↓', e)) {
            var newId = current.next().attr('id');
            if (newId)
                Session.set('currentIssueDetailId', newId);
            e.preventDefault();

        }
        //activate prev issue in the list

        if (jwerty.is('↑', e)) {
            var newId = current.prev().attr('id');
            if (newId)
                Session.set('currentIssueDetailId', newId);
            e.preventDefault();

        }

        if (jwerty.is('←', e)) {

            e.preventDefault();

        }

        if (jwerty.is('→', e)) {

            e.preventDefault();

        }


    }
});


Template.issuesList.rendered = function () {

    //focus to the quick task input
    $('#new-simple-issue').focus();

    $('.sortable').sortable({
    }).bind('sortupdate', function (e, ui) {
            console.log(ui.item);
            console.log(ui.oldIndex);
            console.log(ui.newIndex);
        });
};


Template.issueListItem.events({
    //oped issue detail sidebar
    'click li.list-group-item a': function (e) {
        e.preventDefault();
        Session.set('currentIssueDetailId', this._id);
        $(e.currentTarget).focus();

        $('#new-simple-issue').blur();
    }

});


Template.issueListItem.helpers({
    isActive: function () {
        return Session.equals("currentIssueDetailId", this._id) ?
            "active" : "";

    },

    categoryColor: function () {
        return General.backgroundColors[Math.floor(Math.random() * General.backgroundColors.length)];
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
