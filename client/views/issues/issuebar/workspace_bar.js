Template.workspaceBar.helpers({
    currentWorkspace: function (/* route names */) {

        var user = Meteor.user();
        if (user)
            return CurrentWorkspace();

    },

    userWorkspaces: function () {

        UsersManager.workspacesWhithoutCurrent(Meteor.user());
    }

});