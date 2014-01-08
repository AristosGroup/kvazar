if (Statuses.find().count() == 0) {
    Statuses.insert({
        title: 'New',
        code: 'new'
    });

    Statuses.insert({
        title: 'Approved',
        code: 'approved'

    });

    Statuses.insert({
        title: 'In focus',
        code: 'in_focus'


    });

    Statuses.insert({
        title: 'Started',
        code: 'started'

    });


    Statuses.insert({
        title: 'paused',
        code: 'paused'

    });


    Statuses.insert({
        title: 'finished',
        code: 'finished'

    });

    Statuses.insert({
        title: 'complete',
        code: 'complete'

    });

    Statuses.insert({
        title: 'closed',
        code: 'closed'

    });


    Workflows.insert({
        title: 'manager',
        code: 'manager',
        isDefault: 0,
        defaultStatus: 'approved',

        status: new WorkflowStatus({
            new: ['approved', 'closed'],
            approved: ['in_focus', 'started', 'closed'],
            in_focus: ['started', 'closed'],
            started: ['finished', 'paused', 'closed'],
            paused: ['started', 'finished', 'closed'],
            finished: ['complete', 'in_focus', 'closed']
        })

    });

    Workflows.insert({
        title: 'developer',
        code: 'developer',
        isDefault: 0,
        defaultStatus: 'approved',

        status: new WorkflowStatus({
            in_focus: ['started'],
            started: ['finished', 'paused'],
            paused: ['started', 'finished'],
            finished: ['started']
        })

    });


    Workflows.insert({
        title: 'viewer',
        code: 'viewer',
        isDefault: 1,
        defaultStatus: 'new',

        status: new WorkflowStatus({
            new: ['closed']
        })

    });
}

