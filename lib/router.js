Router.configure({
    layoutTemplate: 'layout',
    loadingTemplate: 'loading'
  /*  waitOn: function() {
        return [Meteor.subscribe('notifications')]
    }*/
});

IssuesListController = RouteController.extend({
    template: 'focus',
   // increment: 5,
/*    limit: function() {
        return parseInt(this.params.postsLimit) || this.increment;
    },*/
    findOptions: function() {
        return {sort: {order:1}};
    },
    waitOn: function() {
        return Meteor.subscribe('issues', this.findOptions());
    },
    data: function() {
        return {
            issues: Issue.find({}, this.findOptions())
          //  nextPath: this.nextPath()
        };
    }
});


Router.map(function () {

    this.route('issuesList', {
        path: '/',
        controller: IssuesListController
    });

    this.route('issueDetail', {
        path: '/issues/:_id',
        template: 'focus',
        load: function() {
            Session.set('currentIssueId', this.params._id);
            Session.set("markdown_data", '');

          //  this.render();
        }
    });
});

var requireLogin = function() {
    if (! Meteor.user()) {
        if (Meteor.loggingIn())
            this.render(this.loadingTemplate);
        else
            this.render('accessDenied');

        this.stop();
    }
};

Router.before(requireLogin);
Router.before(function() { clearErrors() });


