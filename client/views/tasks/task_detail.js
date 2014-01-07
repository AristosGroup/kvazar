Template.taskDetail.helpers({
    currentTask: function () {
        return Tasks.findOne(Session.get('currentTaskDetailId'));
    },

    detailOpen: function () {
        return Session.get("currentTaskDetailId") ?
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

    }
});


Template.taskDetail.rendered = function (e) {

    var task = Tasks.findOne(Session.get('currentTaskDetailId'));

    if (!task) return;

    $('#projects').editable({

        value: task.projectsId,
        escape: false,
        viewseparator: ' ',
        /*@TODO deps autorn*/
        source: WorkspaceManager.allProjects(CurrentWorkspace()).map(function (project) {
            project.text = project.title;
            project.id = project._id;
            return project
        }),
        select2: {
            multiple: true,

            formatResult: function (item) {
                return '<span style="color: ' + item.color + '">' + item.title + '</span>';
            },
            formatSelection: function (item) {
                return '<span class="label btn-primary" style="background: ' + item.color + '">' + item.title + '</span>';

            },
            escapeMarkup: function (m) {
                return m;
            }
        }


    });

    //  Deps.autorun(function() {

    // $('#categories').editable('disable');
    $('#categories').editable({

        value: task.categoryId,
        escape: false,
        viewseparator: ' ',

        source: WorkspaceManager.allCategories(CurrentWorkspace()).map(function (project) {
            project.text = project.title;
            project.id = project._id;
            return project
        }),
        select2: {


            formatResult: function (item) {
                return '<span style="color: ' + item.color + '">' + item.title + '</span>';
            },
            formatSelection: function (item) {
                return '<span class="label btn-primary" style="background: ' + item.color + '">' + item.title + '</span>';

            },
            escapeMarkup: function (m) {
                return m;
            }
        }


    });
    //  });


    $('#projects').on('save', function (e, params) {
        // task.changeProjects(params.newValue);


        Meteor.call('updateTask', task, {projectsId: params.newValue}, function (error, id) {
            if (error)
                return alert(error.reason);

        });

    });

    $('#categories').on('save', function (e, params) {

        Meteor.call('updateTask', task, {categoryId: params.newValue}, function (error, id) {
            if (error)
                return alert(error.reason);

        });
    });


    //  var id = Session.get('currentTaskDetailId');

};


Template.taskDetail.events({

    'keypress, focus textarea.description': function (e) {

        if (e.type != 'focus' && e.keyCode != 13) return;

        Session.set("markdown_data", e.target.value);
    },

    'click a.closeTaskDetail': function (e) {
        e.preventDefault();
        Session.set('currentTaskDetailId', null);

    }
});

