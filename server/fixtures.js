if (Statuses.find().count() == 0) {
    Statuses.insert({
        title: 'New',
        default: 1
    });

    Statuses.insert({
        title: 'Approved',
        default: 0

    });

    Statuses.insert({
        title: 'In progress',
        default: 0

    });

    Statuses.insert({
        title: 'In progress',
        default: 0

    });


    Statuses.insert({
        title: 'Complete',
        default: 0

    });
}

