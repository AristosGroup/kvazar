Projects = new Meteor.Collection2("projects", {

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

        color: {
            type: String,
            label: "Color",
            optional: true

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
    }
});


Meteor.methods({
    createProject: function (attributes) {

        var user = Meteor.user();
        attributes.userId = user._id;
        attributes.members = [user._id];
        //todo перенести в autoValue
        if (!attributes.title) attributes.title = 'New project';
        if (!attributes.color) attributes.color = '#f3f5f9';
        attributes.members = [user._id];
        var project = Projects.insert(attributes);
        return project;

    },

    updateProject: function (projectId, attributes) {
        return Projects.update(projectId, {$set: attributes});
    },

    deleteProject: function (projectId) {
        Tasks.update({projectsId: projectId}, { $pull: { projectsId: projectId} }, true);
        return Projects.remove(projectId);

    }
});