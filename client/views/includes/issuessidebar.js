// When adding tag to a todo, ID of the workspace
Session.set('newCategories', []);


var activateInput = function (input) {
    input.focus();
    input.select();
};

var OkCancelEvents = function (selector, callbacks) {
    var ok = callbacks.ok || function () {
    };
    var cancel = callbacks.cancel || function () {
    };

    var events = {};
    events['keyup ' + selector + ', keydown ' + selector + ', focusout ' + selector] =
        function (evt) {


            if (evt.type === "keydown" && evt.which === 27) {
                // escape = cancel
                cancel.call(this, evt);

            } else if (evt.type === "keyup" && evt.which === 13 ||
                evt.type === "focusout") {
                // blur/return/enter = ok/submit if non-empty
                var value = String(evt.target.value || "");
                if (value)
                    ok.call(this, value, evt);
                else
                    cancel.call(this, evt);

            }


        };

    return events;
};

Template.issuessidebar.helpers({
    currentWorkspace: function (/* route names */) {

        var user = User.current();

        if (user)
            return user.currentWorkspace();

    },

    userWorkspaces: function () {

        var user = User.current();
        return user.workspacesWhithoutCurrent();
    },

    categories: function () {
        var user = User.current();
        var currentWorkspace = User.current().currentWorkspace();
        var categories = currentWorkspace.allCategories();

        return categories;
    },

    projects: function () {
        var user = User.current();
        var currentWorkspace = User.current().currentWorkspace();
        var projects = currentWorkspace.allProjects();

        console.log(projects);

        return projects;
    }
});


Template.issuessidebar.events({
    'click #workspace-new': function () {

        bootbox.dialog({
            message: $('#workspaceDialogNew'),
            title: "New workspace",
            buttons: {
                success: {
                    label: "Save Workspace!",
                    className: "btn-success",
                    callback: function () {
                        //Example.show("great success");
                    }
                },
                danger: {
                    label: "Close!",
                    className: "btn-danger",
                    callback: function () {
                        var title = $('#WorkspaceNewTitle').val();

                        Workspace.create({
                            title: title,
                            members: [
                                Meteor.userId()
                            ]
                        });
                    }
                }
            }
        });
    },

    //чтобы не закрывалось меню при клике на элементы формы
    'click .dropdown-menu header': function (e) {
        e.stopPropagation();
    },

    //create new project
    'click .project-new': function (e) {
        e.preventDefault();

        var currentWorkspace = User.current().currentWorkspace();
        console.log(currentWorkspace._id);
        var attrs = {title: 'New project', workspace_id: currentWorkspace._id, color: '#f3f5f9'};

        var newProject = Project.create(attrs);





    }
});


Template.workspaceDialogNew.newCategories = function () {
    return  Session.get('newCategories');
};


Template.workspaceDialogNew.events(OkCancelEvents(
    '#workspaceNewCategoryInput',
    {
        ok: function (value) {

            console.log(value);
            var newCategories = Session.get('newCategories');
            newCategories.push({title: value});

            Session.set('newCategories', newCategories);
        },
        cancel: function () {
            Session.set('workspaceCategory_tag', null);
        }
    }));


Template.issuessidebar.rendered = function (e) {


    $.fn.editable.defaults.mode = 'inline';

    var options = {
        colors: [General.backgroundColors]
    };
    $('div.colorpalette').colorPalette(options)
        .on('selectColor', function (e) {


            var id = $(this).parents('li.project-row').attr('id');
            Project.first({_id:id}).update({color: e.color});
        });

    $('a.project-name-edit').editable({
        type: 'text',
        title: 'Enter project name',
        success: function (response, newValue) {
          var id = $(this).parents('li.project-row').attr('id');
          Project.first({_id:id}).update({title:newValue});
        }
    });



};


Template.projectBar.rendered = function(e)
{
    $('.checkbox-custom > input').each(function () {

        var $this = $(this);
        if ($this.data('checkbox')) return;
        $this.checkbox($this.data());
    });
};








