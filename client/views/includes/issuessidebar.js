// When adding tag to a todo, ID of the workspace
Session.set('newCategories', []);



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
        var categories = currentWorkspace.categories;

        console.log(categories);
    }
});


Template.issuessidebar.events({
    'click button.workspace-menu':function() {

        bootbox.dialog({
            message: $('#workspaceDialogNew'),
            title: "New workspace",
            buttons: {
                success: {
                    label: "Save Workspace!",
                    className: "btn-success",
                    callback: function() {
                        //Example.show("great success");
                    }
                },
                danger: {
                    label: "Close!",
                    className: "btn-danger",
                    callback: function() {
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
    }
});




Template.workspaceDialogNew.newCategories = function() {
    return  Session.get('newCategories');
};


Template.workspaceDialogNew.events(OkCancelEvents(
    '#workspaceNewCategoryInput',
    {
        ok: function (value) {

            console.log(value);
            var newCategories = Session.get('newCategories');
            newCategories.push({title:value});

            Session.set('newCategories', newCategories);
        },
        cancel: function () {
            Session.set('workspaceCategory_tag', null);
        }
    }));





