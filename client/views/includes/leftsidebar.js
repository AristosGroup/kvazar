// When adding tag to a todo, ID of the workspace
Session.setDefault('workspaceCategory_tag', null);

var activateInput = function (input) {
    input.focus();
    input.select();
};

var OkCancelEvents = function (selector, callbacks) {
    var ok = callbacks.ok || function () {};
    var cancel = callbacks.cancel || function () {};

    var events = {};
    events['keyup '+selector+', keydown '+selector+', focusout '+selector] =
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

Template.leftsidebar.helpers({
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
        var categories = currentWorkspace.categories;

        console.log(categories);
    }
});

Template.workspaceDialogNew.workspaceCategory_tag = function () {
    return Session.equals('workspaceCategory_tag', 1);
};


Template.workspaceDialogNew.events({
    'click #workspaceNewCategoriesFormAdd': function (evt, tmpl) {
        Session.set('workspaceCategory_tag', 1);
        console.log('xx');

        //Deps.flush(); // update DOM before focus
       // activateInput(tmpl.find("#workspaceNewCategoryInput"));
    },

    'click .btn-primary': function () {

        var title = $('#WorkspaceNewTitle').val();

        Workspace.create({
            title: title,
            members: [
                Meteor.userId()
            ]
        });


        $('#workspaceDialogNewModal').modal('hide');

    }
});


Template.workspaceDialogNew.events(OkCancelEvents(
    '#workspaceNewCategoryInput',
    {
        ok: function (value) {
            //Todos.update(this._id, {$addToSet: {tags: value}});
            console.log('xx');
            Session.set('workspaceCategory_tag', null);
        },
        cancel: function () {
            Session.set('workspaceCategory_tag', null);
        }
    }));





