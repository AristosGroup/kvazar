Categories = new Meteor.Collection2("categories", {

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
    createCategory: function (attributes) {

        var user = Meteor.user();
        attributes.userId = user._id;
        attributes.members = [user._id];
        //todo перенести в autoValue
        if (!attributes.title) attributes.title = 'New category';
        if (!attributes.color) attributes.color = '#f3f5f9';
        attributes.members = [user._id];
        var category = Categories.insert(attributes);
        return category;

    },

    updateCategory: function (categoryId, attributes) {
        return Categories.update(categoryId, {$set: attributes});
    },

    deleteCategory: function (categoryId) {
        Tasks.update({categoryId: categoryId}, { $set: { categoryId: null} }, true);
        return Categories.remove(categoryId);

    }
});