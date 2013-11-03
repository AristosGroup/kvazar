Handlebars.registerHelper('key_value', function (context, options) {
    var result = [];
    _.each(context, function (value, key, list) {
        result.push({key: key, value: value});
    })
    return result;
});

Template.issuesList.helpers({
    issues: function () {
        var issues = Issues.find({}, {sort: {order: 1}});
        var res = _.groupBy(issues.fetch(), function (item) {
            return item.status;
        });
        return res;
    }
});
