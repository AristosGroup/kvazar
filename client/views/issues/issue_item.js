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
    }
});