Handlebars.registerHelper('key_value', function (context, options) {
    var result = [];
    _.each(context, function (value, key, list) {
        result.push({key: key, value: value});
    })
    return result;
});

Template.issuesList.helpers({
    issues: function () {
        var issues = Issue.find({}, {sort: {order: 1}});

        return issues;
    }
});
