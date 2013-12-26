Session.set('currentIssueDetailId', null);

Template.issuesList.helpers({
    issuesListAll: function () {
        return this.issues;

    }
});


Template.issuesList.events({
    'click li.list-group-item a': function (e) {

        e.preventDefault();
        $('li.list-group-item').removeClass('active');
        Show($(e.target).parents('li.list-group-item'), $('#issue-detail'));

    },

    //добвление "быстрой" задачи
    'keydown #new-simple-issue': function (e) {



        //сабмит
        if (jwerty.is('enter', e)) {
            e.preventDefault();
            var val = $(e.currentTarget).val();
            var context = {};
            Issue.createNewByContext({subject: val}, context);
            $(e.currentTarget).val('');


        }
    }
});


Template.issuesList.rendered = function () {

    //фокус на форму быстрого добавления задачи
    $('#new-simple-issue').focus();

    $('.sortable').sortable({
    }).bind('sortupdate', function (e, ui) {
            console.log(ui.item);
            console.log(ui.oldIndex);
            console.log(ui.newIndex);
        });
};


Template.issueListItem.events({
    'click li.list-group-item a': function (e) {

        e.preventDefault();
        Session.set('currentIssueDetailId', this._id);

        $('li.list-group-item').removeClass('active');
        Show($(e.target).parents('li.list-group-item'), $('#issue-detail'));


    }
});


Template.issueListItem.helpers({
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

    }


});
