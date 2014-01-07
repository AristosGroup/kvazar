Groups = new Meteor.Collection2("groups", {

    schema: {
        title: {
            type: String,
            label: "Title"

        },

        userId: {
            type: String,
            label: "user Id"

        },


        workspaceId: {
            type: String,
            label: "user Id"

        },

        members: {
            type: [String],
            label: "Members"

        },

        users: {
            type: [String],
            label: "Members"

        },

        createdAt: {
            type: Date,
            autoValue: function () {
                if (this.isInsert) {
                    return new Date;
                } else if (this.isUpsert) {
                    return {$setOnInsert: new Date};
                } else {
                    this.unset();
                }
            },
            denyUpdate: true
        },
        // Force value to be current date (on server) upon update
        // and don't allow it to be set upon insert.
        updatedAt: {
            type: Date,
            autoValue: function () {
                if (this.isUpdate) {
                    return new Date();
                }
            },
            denyInsert: true,
            optional: true
        }
    }
});

GroupsManager = {
    allMembers: function (group) {
        if (group.members)  return Meteor.users.find({_id: {$in: group.members}});
        return [];
    },

    notMembers: function (group) {
        return  Meteor.users.find({_id: {$nin: group.members}});

    },

    allUsers: function (group) {
        if (group.users)  return Meteor.users.find({_id: {$in: group.users}});
        return [];
    },

    notUsers: function (group) {
        return  Meteor.users.find({_id: {$nin: group.users}});

    }
};


Meteor.methods({
    createNewGroup: function (attributes) {

        var user = Meteor.user();
        attributes.userId = user._id;
        attributes.members = [user._id];
        attributes.users = [];
        var group = Groups.insert(attributes);
        return group;

    },

    addUserToGroup: function (group, user) {

        Groups.update(group._id, {$addToSet: {members: user._id}});
        Workspaces.update(group.workspaceId, {$addToSet: {members: user._id}});

        Groups.update({users: user._id}, {$pull: {users: user._id}}, true);

        return Groups.update(group._id, {$addToSet: {users: user._id}});
    },

    addMembersToGroup: function (group, user) {

        Workspaces.update(group.workspaceId, {$addToSet: {members: user._id}});

        return Groups.update(group._id, {$addToSet: {members: user._id}});


    }
});