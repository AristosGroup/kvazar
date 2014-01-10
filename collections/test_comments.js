TestComments = new Meteor.Collection2("test_comments", {
    schema: {


        email: {
            type: String,
            label: "email",
            regEx: SchemaRegEx.Email

        },

        message: {
            type: String,
            label: "Message",
            min: 10

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
    addTestComment: function (attributes) {

        var TestComment = TestComments.insert(attributes);
        return TestComment;

    }});


