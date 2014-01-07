Template.aside.helpers({
    userAvatar: function () {
        var user = Meteor.user();

        return UsersManager.getGravatar(user);
    },

    activeRouteClass: function (/* route names */) {
        var args = Array.prototype.slice.call(arguments, 0);
        args.pop();

        var active = _.any(args, function (name) {
            return Router.current().route.name === name
        });

        return active && 'active';
    }
});


Template.aside.events({
    'click #toggle-nav': function (e) {
        e.preventDefault();
        $('#nav').toggleClass('nav-vertical');

    },
    'click a.logout': function (e) {
        e.preventDefault();
        Meteor.logout();
    }
});