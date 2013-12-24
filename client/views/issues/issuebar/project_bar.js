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
    },
    'click .project-remove': function (e) {
        e.preventDefault();

        Project.first({_id: this._id}).destroy();
    }
});


Template.projectBarRow.rendered = function () {


    var options = {
        colors: [General.backgroundColors]
    };
    $(this.find('div.colorpalette')).colorPalette(options)
        .on('selectColor', function (e) {
            var id = $(this).parents('li.filter-row').attr('id');
            Project.first({_id: id}).update({color: e.color});
        });

    $(this.find('a.filter-name-edit')).editable({
        type: 'text',
        title: 'Enter project name',
        success: function (response, newValue) {
            var id = $(this).parents('li.filter-row').attr('id');
            Project.first({_id: id}).update({title: newValue});
        }
    });
};