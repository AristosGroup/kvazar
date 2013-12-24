Template.groupBar.helpers({


    groups: function () {
        var user = User.current();
        var currentWorkspace = User.current().currentWorkspace();
        var groups = currentWorkspace.allGroups();

        return groups;
    },

    notMembers : function () {
        var user = User.current();
        var currentWorkspace = User.current().currentWorkspace();
        var members = currentWorkspace.notMembers();

        return members;
    }
});

Template.groupBarRow.helpers({
    user_name: function () {
        var user = User.init(this);
        return user.userName();
    },

    avatar: function () {
        var user = User.init(this);
        return Gravatar.getGravatar(user);
    }
});

Template.groupBarRow.rendered = function() {

};



