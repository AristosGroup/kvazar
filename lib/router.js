Router.configure({
    layoutTemplate: 'layout',
    loadingTemplate: 'loading',
    waitOn: function () {
        return [
            Meteor.subscribe('notifications'),
            Meteor.subscribe('users'),
            Meteor.subscribe('statuses'),
            Meteor.subscribe('workflows')

        ]
    }
});

TasksListController = RouteController.extend({
    template: 'myWork',
    // increment: 5,
    /*    limit: function() {
     return parseInt(this.params.postsLimit) || this.increment;
     },*/
    findOptions: function () {
        return {};
    },


    waitOn: function () {

        return [
            Meteor.subscribe('workspaces'),
            Meteor.subscribe('projects'),
            Meteor.subscribe('categories'),
            Meteor.subscribe('groups'),
            Meteor.subscribe('tasks', this.findOptions())
        ]
    },
    data: function () {
        return {
            tasks: Tasks.find({}, this.findOptions())
        };
    }
});

FocusController = TasksListController.extend({
    template: 'focus'
});

Mywork = TasksListController.extend({
    template: 'myWork'
});

Dashboard = TasksListController.extend({
    template: 'myWork'
});

Roadmap = TasksListController.extend({
    template: 'roadmap'
});

/*
TaskListDetailController = TasksListController.extend({

    data: function () {
        return {
            tasks: Task.find({}, this.findOptions()),
            task: Task.first({_id: this.params._id})
        };
    }, before: [
        function () {
            Session.set('currentTaskDetailId', this.params._id);
        }
    ],
    unload: function () {
        // This is called when you navigate to a new route
        Session.set('currentTaskDetailId', null);
    }

});*/


Router.map(function () {

    this.route('dashboard', {
        path: '/',
        controller: Dashboard
    });

    this.route('myWork', {
        path: '/myWork',
        controller: TasksListController
    });

/*
    this.route('myWorkDetail', {
        path: '/myWork/:_id',
        controller: TaskListDetailController,
        disableProgress : true
    });
*/

    this.route('focus', {
        path: '/focus',
        controller: FocusController
    });

    this.route('tracker', {
        path: '/tracker',
        controller: TasksListController
    });

    this.route('roadmap', {
        path: '/roadmap',
        controller: TasksListController
    });

    this.route('reports', {
        path: '/reports',
        controller: TasksListController
    });


    this.route('users', {
        path: '/users',
        controller: TasksListController
    });


    this.route('task', {
        path: '/tasks/:_id',
        template: 'focus',
        load: function () {
            Session.set('currentTaskId', this.params._id);
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


