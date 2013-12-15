Template.issueItem.helpers({

    domain: function() {
        var a = document.createElement('a');
        a.href = this.url;
        return a.hostname;
    },

    statusObj: function() {

        return  Status.find(this.status);
    }
});



Template.issueItem.events({

    'click span.points': function(e) {
        e.preventDefault();




    },

    'click input': function(e) {
        e.preventDefault();



        Router.go('issueDetail',{_id: this._id}) ;
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

            var neworder = this.order+1;

            Issues.update(this._id, {$set: {subject: e.target.value}}, function(error) {
                if (error) {
                    // display the error to the user
                    alert(error.reason);
                } else {
                    var issue = {
                        subject:'',
                        order:neworder
                    };

                    Meteor.call('issueCreate', issue, function(error, id) {
                        if (error)
                            return alert(error.reason);

                        Router.go('issueDetail', {_id:id});
                    });
                }
            });
        }
    }
});