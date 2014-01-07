Statuses = new Meteor.Collection2("statuses", {

    schema: {
        title: {
            type: String,
            label: "Title"

        },

        default: {
            type: Number,
            label: "user Id"

        }
    }
});


Meteor.methods({

});