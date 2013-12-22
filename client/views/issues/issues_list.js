Handlebars.registerHelper('key_value', function (context, options) {
    var result = [];
    _.each(context, function (value, key, list) {
        result.push({key: key, value: value});
    })
    return result;
});

Template.issuesList.helpers({
    issuesListAll: function () {
        return this.issues;

    }
});


Template.issuesList.events({
    'click li.list-group-item a':function(e) {

        e.preventDefault();
        $('li.list-group-item').removeClass('active');
        Show($(e.target).parents('li.list-group-item'), $('#issue-detail'));

    }
});
