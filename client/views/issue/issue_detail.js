Handlebars.registerHelper('user_avatar', function (options) {
  var user = options.hash.user;
   // console.log(options.hash.user);

  var avatarSize = options.hash.avatarSize;

    loadAvatar = function() {

        var self = this;
        var url  =gravatarUrl();


        var img = $("<img/>")
            .load(function() {
                self.$().append(img);
            })
            .error(function() {
                self.$().append('<span class="avatar" style="width:'+avatarSize+'px; height:'+avatarSize+'px; background: #4285f4"></span>');
            })
            .attr("src", url);

        return img;


    };

    gravatarUrl =  function() {

        var
            email = 'mrakobesov@gmail.com',
            size = avatarSize;



        return 'http://www.gravatar.com/avatar/' + email + '?s=' + size+'&d=404';
    };


    return loadAvatar();
});



Template.issueDetail.helpers({
    currentIssue: function () {
        return Issue.find(Session.get('currentIssueId'));
    },
    markdown_data: function () {
        return Session.get("markdown_data");
    },
    statusObj: function () {
        return  Status.find(this.status);
    },

    tagsString: function () {
        var tags = this.tags;

        if (!tags) return '';
        var str = tags.join(',');
        return str;
    },

    assignedTo:function () {
        if(this.assigned_to)
        {
            return Meteor.users.find(this.assigned_to);
        } else {
            return false;
        }
    }
});


Template.issueDetail.rendered = function (e) {

    var id = Session.get('currentIssueId');


    $('div.row.active').removeClass('active');
    var $issueRow = $('#issue_item_' + id);

    $issueRow.addClass('active');
    $issueRow.find('input').focus();


    /**
     * tags
     */
    var $this = this;


    var alltags = Tags.find().fetch();
    alltags = _.map(alltags, function (tag, key) {
        return tag.title;
    });
    var tags = $($this.find('input.tags'));
    tags.select2({tags: alltags

    }).change(
        function (e) {
            Issues.update(id, {$set: {tags: e.val}});
            Meteor.call('tagsUpdate', e.added, e.removed, function (error, result) {  } );
        }
    );


};


Template.issueDetail.events({

    'keypress, focus textarea.description': function (e) {

        if (e.type != 'focus' && e.keyCode != 13) return;

        Session.set("markdown_data", e.target.value);
    }
});

