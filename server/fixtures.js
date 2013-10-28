if (Issues.find().count() === 0) {
    Issues.insert( { type: 1, subject: 'Related Products', description: 'Desc Related Products', projects: [1], status: 1, assigned_to: 1, followers: [1, 2], tags: [1,2] } );

    Issues.insert( { id: 2, type: 1, subject: 'Mass Compare', description: 'Desc Mass Compare', projects: [1, 2], status: 2, assigned_to: 2, followers: [2], tags: [2,3]   });


}