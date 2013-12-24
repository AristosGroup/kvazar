Template.workspaceBar.helpers({
    currentWorkspace: function (/* route names */) {

        var user = User.current();
        if (user)
            return user.currentWorkspace();

    },

    userWorkspaces: function () {

        var user = User.current();
        return user.workspacesWhithoutCurrent();
    }

});