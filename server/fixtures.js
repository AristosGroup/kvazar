if (Status.find().count() == 0) {
    Status.create({
        title: 'New',
        default:1
    });

    Status.create({
        title: 'Approved'
    });

    Status.create({
        title: 'In progress'
    });

    Status.create({
        title: 'In progress'
    });


    Status.create({
        title: 'Complete'
    });
}

