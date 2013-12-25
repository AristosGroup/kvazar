$.fn.editable.defaults.mode = 'inline';

Template.issueBar.helpers({


});

Template.memberSelectOption.helpers({
    user_name: function () {
        var user = User.init(this);
        return user.userName();
    },

    avatar: function () {
        var user = User.init(this);
        return Gravatar.getGravatar(user);
    }
});


Template.issueBar.events({
    //чтобы не закрывалось меню при клике на элементы формы
    'click .dropdown-menu header': function (e) {
        e.stopPropagation();
    }
});
