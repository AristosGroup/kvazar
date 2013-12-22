Template.aside.helpers({
    userAvatar:function() {
        var user  = User.current();

        console.log(Gravatar.getGravatar(user));
        return Gravatar.getGravatar(user);
    }
});