Tasks = new Meteor.Collection2("tasks", {
    schema: {
        subject: {
            type: String,
            label: "Subject"

        },

        description: {
            type: String,
            label: "Description",
            optional: true

        },

        "status.id": {
            type: String,
            optional: true
        },
        "status.title": {
            type: String,
            optional: true
        },

        "status.color": {
            type: String,
            optional: true
        },

        order: {
            type: Number,
            optional: true
        },

        projectsId: {
            type: [String],
            optional: true
        },

        workspaceId: {
            type: String
        },

        categoryId: {
            type: String,
            optional: true
        },

        assignedToId: {
            type: String,
            optional: true
        },

        authorId: {
            type: String,
            optional: true
        },

        ownerId: {
            type: String,
            optional: true
        },

        followersId: {
            type: [String],
            optional: true
        },

        createdAt: {
            type: Date,
            autoValue: function () {
                if (this.isInsert) {
                    return new Date;
                } else if (this.isUpsert) {
                    return {$setOnInsert: new Date};
                } else {
                    this.unset();
                }
            },
            denyUpdate: true
        },
        // Force value to be current date (on server) upon update
        // and don't allow it to be set upon insert.
        updatedAt: {
            type: Date,
            autoValue: function () {
                if (this.isUpdate) {
                    return new Date();
                }
            },
            denyInsert: true,
            optional: true
        },

        isDeleted: {
            type: Boolean,
            optional: true
        }
    },

    virtualFields: {

        createdAtfromNow: function (task) {
            var day = moment.unix(task.createdAt / 1000);
            return moment(day, "YYYYMMDD").fromNow();
        }

    }
});

TasksManager = {
    projectsByTask: function (task) {
        return Projects.find({_id:  task.projects_id});
    },

    categoryByTask: function (task) {
        return Categories.findOne({_id: task.category_id});
    }


};

Meteor.methods({
    createTask: function (attributes) {

        var user = Meteor.user();
        // ensure the user is logged in
        if (!user)
            throw new Meteor.Error(401, "You need to login to post new stories");

        // ensure the task has a subject
        if (!attributes.subject)
            throw new Meteor.Error(422, 'Please fill in a headline');

        attributes.workspaceId = user.currentWorkspaceId;
        attributes.authorId = user._id;
        attributes.ownerId = user._id;

        var task = Tasks.insert(attributes);

        return task;
    },

    updateTask: function (task, attributes) {

        var user = Meteor.user();
        // ensure the user is logged in
        if (!user)
            throw new Meteor.Error(401, "You need to login to post new stories");

        return Tasks.update(task._id, {$set: attributes});
    }
});


/*
 defaults: {

 // history:[]
 // comments:[]
 // points:[]
 // startTime:[] - запуск задачи в работу
 // endTime:[] - полное окончание работы
 // timeline - шкала с отображением всех стартов и стопов, для расчета реального времени и тд
 // realpoints - реальная оценка задачи
 //prognozEnd  -прогнозируемая дата завершения
 //  }

 /*

 /**
 * Assuming you have a unique order_column column in your database:

 To add a new row at position x:

 Lock tables
 update all rows where position >= x and add 1
 Then insert the new row at position x
 Unlock tables


 To swap positions x and y:

 UPDATE table SET x=(@temp:=x), x = y, y = @temp;
 (source)

 To remove a row at position x:

 Lock tables
 Remove row at position x
 update all rows where position > x and subtract 1
 Unlock tables
 **/


/**
 *
 @createNewTaskByContext: (data, context) ->
 status = Status.first({default: 1})
 data.workspaceId = User.current().currentWorkspaceId
 data.user_id = User.current()._id
 data.owner_id = User.current()._id
 data.status_id = status._id
 data.status_title = status.title
 data.followers = [User.current()._id]
 Task.create(data);

 @createNewEpic: (data) ->
 status = Status.first({default: 1})
 data.workspaceId = User.current().currentWorkspaceId
 data.type = "epic"
 data.user_id = User.current()._id
 data.status_id = status._id
 data.status_title = status.title
 data.followers = [User.current()._id]
 Task.create(data);


 projects : () ->
 Project.find({_id:@projects_id});

 category : () ->
 Category.find({_id:@category_id});

 changeCategory : (category) ->
 @save({category_id:category})

 changeProjects : (projects) ->
 @save({projects_id:projects})
 **/