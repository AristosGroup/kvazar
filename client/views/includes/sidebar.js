Template.sidebar.helpers({
    currentWorkspace: function(/* route names */) {

        var user = User.current();



        if(user)
            return user.currentWorkspace();

    }
});


Template.workspaceDialogNew.events({

    'click .btn-primary': function () {

        var title = $('#WorkspaceNewTitle').val();

        Workspace.create({
            title:title,
            members:[
                Meteor.userId()
            ]
        });


        $('#workspaceDialogNewModal').modal('hide');

    }
});



