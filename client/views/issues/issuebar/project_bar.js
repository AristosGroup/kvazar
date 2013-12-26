Session.set('projectNewColor', null);

Template.projectBar.helpers({


    projects: function () {
        var user = User.current();
        var currentWorkspace = User.current().currentWorkspace();
        var projects = currentWorkspace.allProjects();
        return projects;
    }
});


Template.projectBar.events({

    'click .project-new': function (e) {
        e.preventDefault();

        KMenu(e, $('#projectAddDropdown'));
    }
});


Template.projectBarRow.events({
    'click a.filter-edit': function (e) {

        Session.set('filterEditId', this._id);
        Session.set('filterEditType', 'Project');
        KMenu(e, $('#editingFilter'));

    }
});


Template.projectAddDropdown.rendered = function () {
    var options = {
        colors: [General.backgroundColors]
    };
    $(this.find('div.colorpalette')).colorPalette(options)
        .on('selectColor', function (e) {
            Session.set('projectNewColor', e.color);

        });

};

Template.projectAddDropdown.events({
    'click a.project-add': function (e) {
        e.preventDefault();

        var currentWorkspace = User.current().currentWorkspace();
        var attrs = {workspace_id: currentWorkspace._id, color: Session.get('projectNewColor'), title:$('#new-project-name').val()};
        var newProject = Project.createNewProject(attrs);

        $('#projectAddDropdown').parent().removeClass('open');
    }
});


