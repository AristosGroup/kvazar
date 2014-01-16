//TestCommentsSC = new Meteor.SmartCollection("test_comments");
Reports = new Meteor.Collection2("reports", {


    schema: {


        title: {
            type: String


        },

        value: {
            type: Number


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


Reports.allow({
    insert: function(userId, doc) {
        // only allow posting if you are logged in
        return true;
    },

    update: function(userId, doc) {
        // only allow posting if you are logged in
        return true;
    },

    remove: function(userId, doc) {
        // only allow posting if you are logged in
        return true;
    }
});





