Session.set('currentTaskDetailId', null);

Template.tasksList.helpers({
    tasksListAll: function () {
        return this.tasks;

    }
});


Template.tasksList.events({


    //quick task create
    'keydown #new-simple-task': function (e) {

        //submit quick task
        if (jwerty.is('enter', e)) {
            e.preventDefault();
            var val = $(e.currentTarget).val();
            Meteor.call('createTask', {subject: val}, function (error, id) {
                $(e.currentTarget).val('');
                Session.set('currentTaskDetailId', id);
            });


        }
    },

    //keydown on the listTask section
    'keydown section.vbox': function (e) {
        var current = $('#' + Session.get('currentTaskDetailId'));

        //activate next task in the list
        if (jwerty.is('↓', e)) {
            var newId = current.next().attr('id');
            if (newId)
                Session.set('currentTaskDetailId', newId);
            e.preventDefault();

        }
        //activate prev task in the list

        if (jwerty.is('↑', e)) {
            var newId = current.prev().attr('id');
            if (newId)
                Session.set('currentTaskDetailId', newId);
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


Template.tasksList.rendered = function () {

    //focus to the quick task input
    $('#new-simple-task').focus();

    $('.sortable').sortable({
    }).bind('sortupdate', function (e, ui) {
            console.log(ui.item);
            console.log(ui.oldIndex);
            console.log(ui.newIndex);
        });
};


Template.taskListItem.events({
    //oped task detail sidebar
    'click li.list-group-item a': function (e) {
        e.preventDefault();
        Session.set('currentTaskDetailId', this._id);
        $(e.currentTarget).focus();

        $('#new-simple-task').blur();
    }

});


Template.taskListItem.helpers({
    isActive: function () {
        return Session.equals("currentTaskDetailId", this._id) ?
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
