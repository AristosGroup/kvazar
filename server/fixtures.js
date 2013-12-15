/*


if (Status.find().count() === 0) {
    Statuses.insert({
        title: 'New',
        default:1
    });

    Statuses.insert({
        title: 'Approved'
    });

    Statuses.insert({
        title: 'Complete'
    });
}

if (Tags.find().count() === 0) {
    Tags.insert({
        title: 'Design',
        background: 'rgb(60, 104, 187)',
        color: 'rgb(182, 195, 219)',
        count:0
    });

    Tags.insert({
        title: 'Dev',
        background: 'rgb(60, 104, 187)',
        color: 'rgb(182, 195, 219)',
        count:0


    });

    Tags.insert({
        title: 'Marketing',
        background: 'rgb(60, 104, 187)',
        color: 'rgb(182, 195, 219)',
        count:0


    });
}


if (Issues.find().count() === 0) {
    Issues.insert({ type: 1, "userId": "pw2SfDi8SS5veBHN3", subject: 'Related Products', description: 'Desc Related Products', status: Statuses.findOne({title:'New'})._id, order: 1 });

    Issues.insert({  "userId": "NFEcCL4iWvRaw3mtT", type: 1, subject: 'Mass Compare', description: 'Desc Mass Compare', status: Statuses.findOne({title:'Complete'})._id, order: 2   });


}*/
