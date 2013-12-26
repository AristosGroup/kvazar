Session.set('groupEditId', null);


Template.groupBar.helpers({


    groups: function () {
        var user = User.current();
        var currentWorkspace = User.current().currentWorkspace();
        var groups = currentWorkspace.allGroups();

        return groups;
    }
});

Template.groupBar.events({
    'click a.group-new': function (e) {
        KMenu(e, $('#newGroupDropdown'));
    }
});


Template.groupBarRow.helpers({
    userName: function () {
        var user = User.init(this);
        return user.userName();
    },

    avatar: function () {
        var user = User.init(this);
        return Gravatar.getGravatar(user);
    },

    users: function () {
        return Group.first(this._id).allUsers();
    }
});

Template.groupBarRow.events({
    'click a.group-edit': function (e) {


        Session.set('groupEditId', this._id);
        Session.set('filterEditType', 'Group');
        KMenu(e, $('#groupEditDropdown'));

    }
});


Template.newGroupDropdown.events({
    'click a.group-add': function (e) {
        e.preventDefault();
        var currentWorkspace = User.current().currentWorkspace();
        var attrs = {workspace_id: currentWorkspace._id, title: $('#new-group-name').val()};
        var newGroup = Group.createNewGroup(attrs);
        $('#newGroupDropdown').parent().removeClass('open');


    }
});


Template.groupEditDropdown.helpers({
    notUsers: function () {
        var groupId = Session.get('groupEditId');
        return Group.first(groupId).notUsers();
    },

    userName: function () {
        return User.init(this).userName();
    },
    avatar: function () {
        var user = User.init(this);
        return Gravatar.getGravatar(user);
    }
});

Template.groupEditDropdown.rendered = function () {
    var format = function (data) {
        var user = User.first(data.id);
        return "<img class='thumb-xs img-circle' src='" + Gravatar.getGravatar(user) + "'/>" + ' ' + user.userName();
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

        var attrs = {user_id: $("#members-group-select").select2('val')};
        var newMember = Group.first(this._id).addUserToGroup(attrs);
        $('#groupEditDropdown').parent().removeClass('open');
    }
});



