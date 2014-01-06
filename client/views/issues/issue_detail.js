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

    if(!issue) return;

    $('#projects').editable({

        value:issue.projectsId,
        escape: false,
        viewseparator: ' ',
        /*@TODO deps autorn*/
        source: User.current().currentWorkspace().allProjects().map(function (project) {
            project.text = project.title;
            project.id = project._id;
            return project
        }),
        select2: {
            multiple: true,

            formatResult: function (item) {
                return '<span style="color: '+item.color+'">' + item.title + '</span>';
            },
            formatSelection: function (item) {
                return '<span class="label btn-primary" style="background: '+item.color+'">' + item.title + '</span>';

            },
            escapeMarkup: function (m) {
                return m;
            }
        }


    });

  //  Deps.autorun(function() {

       // $('#categories').editable('disable');
        $('#categories').editable({

            value:issue.category_id,
            escape: false,
            viewseparator: ' ',

            source: User.current().currentWorkspace().allCategories().map(function (project) {
                project.text = project.title;
                project.id = project._id;
                return project
            }),
            select2: {


                formatResult: function (item) {
                    return '<span style="color: '+item.color+'">' + item.title + '</span>';
                },
                formatSelection: function (item) {
                    return '<span class="label btn-primary" style="background: '+item.color+'">' + item.title + '</span>';

                },
                escapeMarkup: function (m) {
                    return m;
                }
            }


        });
  //  });


    $('#projects').on('save', function(e, params) {
       // issue.changeProjects(params.newValue);

        Issues.update(issue._id, {$set:{projectsId:params.newValue}}, function(error, result) {
            //The update will fail, error will be set,
            //and result will be undefined because "copies" is required.
            //
            //The list of errors is available by calling Books.simpleSchema().namedContext().invalidKeys()
        });
    });

    $('#categories').on('save', function(e, params) {
        issue.changeCategory(params.newValue);
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

