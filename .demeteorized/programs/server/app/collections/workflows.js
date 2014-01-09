(function(){/**
 * Workflow устанавливается для группы в воркспейсе.
 *
 *
 * @see examples in the fixtures
 *
 */


WorkflowStatus = function (data) {
    _.extend(this, data);
};


Workflows = new Meteor.Collection2("workflows", {
    schema: {

        title: {
            type: String,
            label: "Title"

        },

        code: {
            type: String

        },

        defaultStatus: {
            type: String
        },

        status: {
            type: WorkflowStatus,
            optional: true
        },

        isDefault: {
            type: Number
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
        }
    },

    virtualFields: {


    }
});

WorkflowsManager = {
    /**
     * user workflow for current workspace
     */
    userWorkflow: function () {
        var user = Meteor.user();
        var group = GroupsManager.userGroup(user);
        return Workflows.findOne({code:group.workflowCode});
    },

    /**
     * user workflow for  workspace
     * @param user
     */
    userWorkflowForWorkspace: function (user, workspaceId) {
        var group = GroupsManager.userGroupForWorkspace(user, workspaceId);
        return Workflows.findOne({code: group.workflowCode});
    },

    /**
     * get next statuses for a task status and the currentUser
     * @param currentStatus
     *
     */
    nextStatuses: function(currentStatus) {

        var workflow = WorkflowsManager.userWorkflow(Meteor.user());
        var statuses = workflow.status[currentStatus];
        if(!statuses) return false;

        return statuses.map(function(statusCode) {
            return Statuses.findOne({code:statusCode});
        });
    }
};

})();
