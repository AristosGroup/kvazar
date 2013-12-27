Router.configure({
    layoutTemplate: 'layout',
    loadingTemplate: 'loading',
    waitOn: function () {
        return [
            Meteor.subscribe('notifications'),
            Meteor.subscribe('users')

        ]
    }
});

IssuesListController = RouteController.extend({
    template: 'focus',
    // increment: 5,
    /*    limit: function() {
     return parseInt(this.params.postsLimit) || this.increment;
     },*/
    findOptions: function () {
        return {sort: {order: 1}};
    },


    waitOn: function () {

        return [
            Meteor.subscribe('workspaces'),
            Meteor.subscribe('projects'),
            Meteor.subscribe('categories'),
            Meteor.subscribe('groups'),
            Meteor.subscribe('statuses'),
            Meteor.subscribe('issues', this.findOptions())
        ]
    },
    data: function () {
        return {
            issues: Issue.find({}, this.findOptions())
        };
    }
});


Router.map(function () {

    this.route('dashboard', {
        path: '/',
        controller: IssuesListController
    });

    this.route('myWork', {
        path: '/myWork',
        controller: IssuesListController
    });

    this.route('focus', {
        path: '/focus',
        controller: IssuesListController
    });

    this.route('tracker', {
        path: '/tracker',
        controller: IssuesListController
    });

    this.route('roadmap', {
        path: '/roadmap',
        controller: IssuesListController
    });

    this.route('reports', {
        path: '/reports',
        controller: IssuesListController
    });


    this.route('users', {
        path: '/users',
        controller: IssuesListController
    });


    this.route('issue', {
        path: '/issues/:_id',
        template: 'focus',
        load: function () {
            Session.set('currentIssueId', this.params._id);
            Session.set("markdown_data", '');

            //  this.render();
        }
    });
});

var requireLogin = function () {
    if (!Meteor.user()) {
        if (Meteor.loggingIn())
            this.render(this.loadingTemplate);
        else
            this.render('accessDenied');

        this.stop();
    }
};

Router.before(requireLogin);
Router.before(function () {
    clearErrors()
});


