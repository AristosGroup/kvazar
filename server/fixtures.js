if (Statuses.find().count() === 0) {
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
    Issues.insert({ type: 1, "userId": "pw2SfDi8SS5veBHN3", subject: 'Related Products', description: 'Desc Related Products', projects: [1], status: Statuses.findOne({title:'New'})._id, assigned_to: 1, followers: [1, 2], order: 1 });

    Issues.insert({  "userId": "NFEcCL4iWvRaw3mtT", type: 1, subject: 'Mass Compare', description: 'Desc Mass Compare', projects: [1, 2], status: Statuses.findOne({title:'Complete'})._id, assigned_to: 2, followers: [2], order: 2   });


    Meteor.users.insert({
        "createdAt": 'ISODate("2013-11-02T10:22:36.776Z")',
        "services": {
            "github": {
                "id": 376536,
                "accessToken": "bdf1a00f0cebf28ab26ae3521315f14a1cb7ee33",
                "email": "mrakobesov@gmail.com",
                "username": "pirrat"
            },
            "resume": {
                "loginTokens": [
                    {
                        "token": "gLxCFTAXXWnhyaNTb",
                        "when": 'ISODate("2013-11-02T10:22:36.776Z")'
                    }
                ]
            }
        },
        "profile": {
            "name": "Aleksey Kuznetsov"
        }
    });

}