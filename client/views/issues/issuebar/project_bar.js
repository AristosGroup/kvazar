Template.projectBar.helpers({


    projects: function () {
        var user = User.current();
        var currentWorkspace = User.current().currentWorkspace();
        var projects = currentWorkspace.allProjects();
        return projects;
    }
});


Template.projectBar.events({
    //create new project
    'click .project-new': function (e) {
        e.preventDefault();

        var currentWorkspace = User.current().currentWorkspace();
        var attrs = { workspace_id: currentWorkspace._id};
        var newProject = Project.createNewProject(attrs);
    }
});


Template.projectBarRow.events({
    'click a.filter-edit': function (e) {

        Session.set('filterEditId', this._id);
        Session.set('filterEditType', 'Project');
        KMenu(e, $('#editingFilter'));

    }
});

