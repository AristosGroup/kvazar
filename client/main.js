//Meteor.subscribe('workspaces');
//Meteor.subscribe('tags');
//Meteor.subscribe('statuses');

Meteor.startup(function(){

});

// Validation errors are available through reactive methods
if (Meteor.isClient) {
    Meteor.startup(function() {
        Deps.autorun(function() {
            var context = Groups.namedContext();
            if (!context.isValid()) {
                console.log(context.invalidKeys());
            }
        });
    });
}

