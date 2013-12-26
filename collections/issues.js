/*
Issue = _.extend(Minimongoid, {
    _collection: new Meteor.Collection('issues'),

    isValid:function() {
        return true;
    }
*/

/*
    defaults: {
        subject: '',
        description:'',
        order:0*/
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
/*});*/


//Issues = Issue._collection;


Issue._collection.allow({
    insert: function (userId, doc) {
        // only allow posting if you are logged in
        return true;
    },

    remove: function (userId, doc) {
        // only allow posting if you are logged in
        return true;
    },


    update: function (userId, doc) {
        // only allow posting if you are logged in
        return true;
    }
});

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