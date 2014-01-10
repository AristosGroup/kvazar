Template.landing.rendered = function () {

    $('body').data('spy', 'scroll').data('target', '#header').addClass('landing').attr('id', 'home');

    jQuery.extend(jQuery.easing,
        {
            def: 'easeOutQuad',
            easeInOutExpo: function (x, t, b, c, d) {
                if (t == 0) return b;
                if (t == d) return b + c;
                if ((t /= d / 2) < 1) return c / 2 * Math.pow(2, 10 * (t - 1)) + b;
                return c / 2 * (-Math.pow(2, -10 * --t) + 2) + b;
            }
        });


    $('[data-ride="animated"]').appear();
    if (!$('html').hasClass('ie no-ie10')) {
        $('[data-ride="animated"]').addClass('appear');
        $('[data-ride="animated"]').on('appear', function () {
            var $el = $(this), $ani = ($el.data('animation') || 'fadeIn'), $delay;
            if (!$el.hasClass('animated')) {
                $delay = $el.data('delay') || 0;
                setTimeout(function () {
                    $el.removeClass('appear').addClass($ani + " animated");
                }, $delay);
            }
        });
    }

    $(document).on('click.app', 'ul.nav [href^="#"]', function (e) {
        e.preventDefault();
        var $target = this.hash;
        $('html, body').stop().animate({
            'scrollTop': $($target).offset().top
        }, 1000, 'easeInOutExpo', function () {
            window.location.hash = $target;
        });
    });


};


Template.landing.helpers({
    comments: function () {
        return TestComments.find();
    }
});




Template.testCommentForm.TestCommentsForm = function () {


    TestCommentsForm = new AutoForm(TestComments);

    TestCommentsForm.hooks({

        before: {
            insert: function(doc) {
                var email = doc.email;

                if(!Meteor.user())
                {
                    var testUser = Meteor.users.find({'emails.address':email});

                    if(testUser)
                        Meteor.loginWithPassword(testUser);
                    else {
                        Accounts.createUser({email:email,password:Random.id()}, function() {});
                    }
                }


                return doc;
            }
        },
        onSuccess: function(operation, result, template) {

        }
    });

    return TestCommentsForm;
};





