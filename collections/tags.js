Tags = new Meteor.Collection2('tags' ,{
    schema: {}
});

Tags.allow({
    insert: function (userId, doc) {
        // only allow posting if you are logged in
        return true;
    },

    update: function (userId, doc) {
        // only allow posting if you are logged in
        return true;
    }
});


Meteor.methods({
    tagsUpdate: function (tagsadded, tagsremoved) {
        var user = Meteor.user();

        // ensure the user is logged in
        if (!user)
            throw new Meteor.Error(401, "You need to login to post new stories");


        if (tagsremoved)
            Tags.update({title: tagsremoved.id}, {$inc: {count: -1}});


        if (tagsadded) {
            var newtag = Tags.find({title: tagsadded.id});


            if (newtag.count() > 0)
                Tags.update({title: tagsadded.id}, {$inc: {count: 1}});
            else {

                var newtag = {
                    title: tagsadded.id,
                    background: 'rgb(60, 104, 187)',
                    color: 'rgb(182, 195, 219)',
                    count: 1
                };
                Tags.insert(newtag);
            }

        }

        // console.log(tagsadded);
        //console.log(tagsremoved);

        return tagsadded;
    }
});

