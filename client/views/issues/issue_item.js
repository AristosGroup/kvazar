Template.issueItem.helpers({

    domain: function() {
        var a = document.createElement('a');
        a.href = this.url;
        return a.hostname;
    }
});



Template.issueItem.events({
    'click input': function(e) {
        e.preventDefault();


        Meteor.Router.to('issueDetail', this._id);
    },
    'focusout input' :function(e,template){


        Issues.update(this._id, {$set: {subject: e.target.value}}, function(error) {
            if (error) {
                // display the error to the user
                alert(error.reason);
            } else {
               // Meteor.Router.to('postPage', currentPostId);
            }
        });
    },
    'keydown input':function(e) {
        if(jwerty.is('enter', e))
        {
            Issues.update(this._id, {$set: {subject: e.target.value}}, function(error) {
                if (error) {
                    // display the error to the user
                    alert(error.reason);
                } else {


                    Meteor.call('issueCreate', function(error, id) {
                        if (error)
                            return alert(error.reason);

                        Meteor.Router.to('issueDetail', id);
                    });
                }
            });
        }
    }
});