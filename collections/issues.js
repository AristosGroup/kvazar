Issue = _.extend(Minimongoid, {
    _collection: new Meteor.Collection('issues'),


    defaults: {
        subject: '',
        description:'',
        order:0
        // history:[]
        // comments:[]
        // points:[]
        // startTime:[] - запуск задачи в работу
        // endTime:[] - полное окончание работы
        // timeline - шкала с отображением всех стартов и стопов, для расчета реального времени и тд
        // realpoints - реальная оценка задачи
        //prognozEnd  -прогнозируемая дата завершения
    }

/*
    belongs_to: [
        {name: 'assignedTo', class_name: 'User'},
        {name: 'author', class_name: 'User'},
        {name: 'workspace', class_name: 'Workspace'},
        {name: 'category', class_name: 'Category'},
        {name: 'status', class_name: 'Status'}
    ],

    has_many: [
        {name: 'projects', class_name: 'Project'},
        {name: 'followers', class_name: 'User'}
    ],

    has_and_belongs_to_many: [
        {name: 'subtasks'}

    ]*/
});


Issues = Issue._collection;


Issue._collection.allow({
    insert: function (userId, doc) {
        // only allow posting if you are logged in
        return true;
    },

    update: function (userId, doc) {
        // only allow posting if you are logged in
        return true;
    }
});


Meteor.methods({
    issueCreate: function (postAttributes) {
        var user = Meteor.user();
        //   postWithSameLink = Issues.findOne({url: postAttributes.url});

        // ensure the user is logged in
        if (!user)
            throw new Meteor.Error(401, "You need to login to post new stories");


        // pick out the whitelisted keys
        var post = _.extend(_.pick(postAttributes, 'order', 'subject'), {
           // userId: user._id,
            //  author: user.profile.name,
           // submitted: new Date().getTime(),
           // status: 1
        });

        var issue = Issue.create(post);

        console.log(issue);


        var issueId = issue._id;
     /*   Issues.update({order: {$gte: postAttributes.order}},
            {$inc: {order: 1}},
            {multi: true});*/

        return issueId;
    }
});

