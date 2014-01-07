Session.set('groupEditId', null);


Template.groupBar.helpers({


    groups: function () {
        var currentWorkspace = CurrentWorkspace();
        return WorkspaceManager.allGroups(currentWorkspace);
    }
});


Template.groupBarRow.helpers({
    userName: function () {
        var user = Meteor.user();
        return UsersManager.userName(user);
    },

    avatar: function () {
        var user = Meteor.user();
        return UsersManager.getGravatar(user);
    },

    users: function () {
        return GroupsManager.allUsers(Groups.findOne(this._id));
    }
});

Template.groupBarRow.events({
    'click a.group-edit': function (e) {


        Session.set('groupEditId', this._id);
        Session.set('filterEditType', 'Group');

    }
});


Template.newGroupDropdown.events({

    'click a.group-add': function (e) {
        e.preventDefault();
        var currentWorkspace = CurrentWorkspace();
        var attrs = {workspaceId: currentWorkspace._id, title: $('#new-group-name').val()};


        Meteor.call('createNewGroup', attrs, function (error, id) {
            if (error)
                return alert(error.reason);

        });

        //  $('#newGroupDropdown').parent().removeClass('open');


    }
});

Template.newGroupDropdown.rendered = function () {
    $(this.find('.dropdown-menu')).on('click', function (e) {
        e.stopPropagation();
    });
};


Template.groupEditDropdown.helpers({
    notUsers: function () {
        var groupId = Session.get('groupEditId');
        if (groupId)
            return GroupsManager.notUsers(Groups.findOne(groupId));
        else return [];
    },

    userName: function () {
        var user = Meteor.user();

        return UsersManager.userName(user);

    },
    avatar: function () {
        var user = Meteor.user();

        return UsersManager.getGravatar(user);
    }
});

Template.groupEditDropdown.rendered = function () {
    $(this.find('.dropdown-menu')).on('click', function (e) {
        e.stopPropagation();
    });
    var format = function (data) {
        var user = Meteor.users.findOne(data.id);
        return "<img class='thumb-xs img-circle' src='" + UsersManager.getGravatar(user) + "'/>" + ' ' + UsersManager.userName(user);
    };

    $("#members-group-select").select2({
        formatResult: format,
        formatSelection: format,
        escapeMarkup: function (m) {
            return m;
        }
    });
};

Template.groupEditDropdown.events({
    'click a.user-group-add': function (e) {
        e.preventDefault();

        var userId = $("#members-group-select").select2('val');
        var user = Meteor.users.findOne(userId);
        var group = Groups.findOne(this._id);

        Meteor.call('addUserToGroup', group, user, function (error, id) {
            if (error)
                return alert(error.reason);

        });

        // $('#groupEditDropdown').parent().removeClass('open');
    }
});



