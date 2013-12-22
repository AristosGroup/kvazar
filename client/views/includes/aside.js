Template.aside.helpers({
    userAvatar:function() {
        var user  = User.current();

        console.log(Gravatar.getGravatar(user));
        return Gravatar.getGravatar(user);
    }
});


Template.aside.events({
    'click #toggle-nav' : function(e) {
        e.preventDefault();
        $('#nav').toggleClass('nav-vertical');

    }
});