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

        color: {
            type: String,
            label: "Color"

        },

        members : {
            type: [String],
            label: "Members"

        }
    }
});