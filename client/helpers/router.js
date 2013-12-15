

Router.map(function () {

    this.route('issueList', {
        path: '/',
        template: 'issueList'
    });

    this.route('issueDetail', {
        path: '/issues/:_id',
        template: 'issueDetail',
        load: function() {
            Session.set('currentIssueId', this.params._id);
            Session.set("markdown_data", '');
        }
    });
});


