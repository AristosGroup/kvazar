Workspaces = new Meteor.Collection2("workspaces", {
    schema: {

        title: {
            type: String,
            label: "Title"

        },
        userId: {
            type: String,
            label: "user Id"

        },

        color: {
            type: String,
            label: "Color"


        },

        members: {
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
    },

    virtualFields: {


    }
});

WorkspaceManager = {
    allProjects: function (workspace) {
        return Projects.find({workspaceId: workspace._id});
    },

    allCategories: function (workspace) {
        return Categories.find({workspaceId:  workspace._id});
    },

    allMembers: function (workspace) {
        if (workspace.members)
            return Meteor.users.find({_id: {$in: workspace.members}});

    },

    notMembers: function (workspace) {
        return Meteor.users.find({_id: {$nin: workspace.members}});

    },

    allGroups: function (workspace) {
        return Groups.find({workspaceId: workspace._id});

    }
};