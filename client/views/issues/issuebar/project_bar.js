Session.set('projectNewColor', null);

Template.projectBar.helpers({


    projects: function () {
        var currentWorkspace = CurrentWorkspace();
        var projects = WorkspaceManager.allProjects(currentWorkspace);
        return projects;
    }
});


Template.projectBar.events({

});


Template.projectBarRow.events({
    'click a.filter-edit': function (e) {

        Session.set('projectEditId', this._id);

    }
});


Template.projectAddDropdown.rendered = function () {
    $(this.find('.dropdown-menu')).on('click', function(e) {
        e.stopPropagation();
    });

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

        var currentWorkspace = CurrentWorkspace();
        var attrs = {workspaceId: currentWorkspace._id, color: Session.get('projectNewColor'), title: $('#new-project-name').val()};

        Meteor.call('createProject', attrs, function (error, id) {
            if (error)
                return alert(error.reason);

        });

        $('#projectAddDropdown').parent().removeClass('open');
    }
});

Template.projectEditDropdown.rendered = function () {


    var options = {
        colors: [General.backgroundColors]
    };



    $(this.find('div.colorpalette')).colorPalette(options)
        .on('selectColor', function (e) {
            var id = Session.get('projectEditId');

            Meteor.call('updateProject', id, {color: e.color}, function (error, id) {
                if (error)
                    return alert(error.reason);

            });


        });

    $(this.find('a.filter-name-edit')).editable({
        type: 'text',
        success: function (response, newValue) {
            var id = Session.get('projectEditId');

            Meteor.call('updateProject', id, {title: newValue}, function (error, id) {
                if (error)
                    return alert(error.reason);

            });

        }
    });
};

Template.projectEditDropdown.events({
    'click .filter-remove': function (e) {
        e.preventDefault();
        Meteor.call('deleteProject', Session.get('projectEditId'), function (error, id) {
            if (error)
                return alert(error.reason);

        });
        Session.set('projectEditId', null);

    }
});

Template.projectEditDropdown.helpers({
    title: function () {
        return this.title;
    }
});


