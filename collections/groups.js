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

        workflowCode: {
            type: String,
            optional: true

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
        return  Meteor.users.find({_id: {$nin: group.members}});

    },
    /**
     * user group for current workspace
     * @param user
     */
    userGroup: function (user) {
        return Groups.findOne({$and: [
            {workspaceId: user.currentWorkspaceId},
            { members: user._id}
        ]});
    },

    /**
     * user group for  workspace
     * @param user
     */
    userGroupForWorkspace: function (user, workspaceId) {
        return Groups.findOne({$and: {workspaceId: workspaceId, members: user._id}});
    }
};


Meteor.methods({
    createNewGroup: function (attributes) {

        var user = Meteor.user();
        attributes.userId = user._id;
        attributes.members = [user._id];
        attributes.users = [];
        //временно
        attributes.workflowCode = "developer";
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