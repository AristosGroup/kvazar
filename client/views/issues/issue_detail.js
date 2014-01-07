Template.issueDetail.helpers({
    currentIssue: function () {
        return Issues.findOne(Session.get('currentIssueDetailId'));
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

    }
});


Template.issueDetail.rendered = function (e) {

    var issue = Issues.findOne(Session.get('currentIssueDetailId'));

    if (!issue) return;

    $('#projects').editable({

        value: issue.projectsId,
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

        value: issue.categoryId,
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
        // issue.changeProjects(params.newValue);


        Meteor.call('updateTask', issue, {projectsId: params.newValue}, function (error, id) {
            if (error)
                return alert(error.reason);

        });

    });

    $('#categories').on('save', function (e, params) {

        Meteor.call('updateTask', issue, {categoryId: params.newValue}, function (error, id) {
            if (error)
                return alert(error.reason);

        });
    });


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

