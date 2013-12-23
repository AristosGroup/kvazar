$.fn.editable.defaults.mode = 'inline';

Template.issuessidebar.helpers({
    currentWorkspace: function (/* route names */) {

        var user = User.current();
        if (user)
            return user.currentWorkspace();

    },

    userWorkspaces: function () {

        var user = User.current();
        return user.workspacesWhithoutCurrent();
    },

    categories: function () {
        var user = User.current();
        var currentWorkspace = User.current().currentWorkspace();
        var categories = currentWorkspace.allCategories();
        return categories;
    },

    projects: function () {
        var user = User.current();
        var currentWorkspace = User.current().currentWorkspace();
        var projects = currentWorkspace.allProjects();
        return projects;
    },

    members: function () {
        var user = User.current();
        var currentWorkspace = User.current().currentWorkspace();
        var members = currentWorkspace.allMembers();

        return members;
    },

    notMembers : function () {
        var user = User.current();
        var currentWorkspace = User.current().currentWorkspace();
        var members = currentWorkspace.notMembers();

        return members;
    }


});

Template.memberSelectOption.helpers({
    user_name: function () {
        var user = User.init(this);
        return user.userName();
    },

    avatar: function () {
        var user = User.init(this);
        return Gravatar.getGravatar(user);
    }
});


Template.issuessidebar.events({
    /*    'click #workspace-new': function () {

     bootbox.dialog({
     message: $('#workspaceDialogNew'),
     title: "New workspace",
     buttons: {
     success: {
     label: "Save Workspace!",
     className: "btn-success",
     callback: function () {
     //Example.show("great success");
     }
     },
     danger: {
     label: "Close!",
     className: "btn-danger",
     callback: function () {
     var title = $('#WorkspaceNewTitle').val();

     Workspace.create({
     title: title,
     members: [
     Meteor.userId()
     ]
     });
     }
     }
     }
     });
     },*/

    //чтобы не закрывалось меню при клике на элементы формы
    'click .dropdown-menu header': function (e) {
        e.stopPropagation();
    },

    //create new project
    'click .project-new': function (e) {
        e.preventDefault();

        var currentWorkspace = User.current().currentWorkspace();
        var attrs = { workspace_id: currentWorkspace._id};
        var newProject = Project.createNewProject(attrs);
    },
    'click .project-remove': function (e) {
        e.preventDefault();

        Project.first({_id: this._id}).destroy();
    },


    //create new project
    'click .category-new': function (e) {
        e.preventDefault();

        var currentWorkspace = User.current().currentWorkspace();
        var attrs = {workspace_id: currentWorkspace._id};
        var newCategory = Category.createNewCategory(attrs);
    },
    'click .category-remove': function (e) {
        e.preventDefault();

        Category.first({_id: this._id}).destroy();
    }
});


Template.issuessidebar.rendered = function() {
    $("#members-workspace-select").select2({

        escapeMarkup: function(m) { return m; }
    });
}


//todo избавить от дублирования кода

Template.projectBar.rendered = function () {

    $(this.findAll('.checkbox-custom > input')).each(function () {
        var $this = $(this);
        if ($this.data('checkbox')) return;
        $this.checkbox($this.data());
    });

    var options = {
        colors: [General.backgroundColors]
    };
    $(this.find('div.colorpalette')).colorPalette(options)
        .on('selectColor', function (e) {


            var id = $(this).parents('li.filter-row').attr('id');
            Project.first({_id: id}).update({color: e.color});
        });

    $(this.find('a.filter-name-edit')).editable({
        type: 'text',
        title: 'Enter project name',
        success: function (response, newValue) {
            var id = $(this).parents('li.filter-row').attr('id');
            Project.first({_id: id}).update({title: newValue});
        }
    });
};


Template.categoryBar.rendered = function () {
    $(this.findAll('.checkbox-custom > input')).each(function () {

        var $this = $(this);
        if ($this.data('checkbox')) return;
        $this.checkbox($this.data());
    });

    var options = {
        colors: [General.backgroundColors]
    };
    $(this.find('div.colorpalette')).colorPalette(options)
        .on('selectColor', function (e) {


            var id = $(this).parents('li.filter-row').attr('id');
            Category.first({_id: id}).update({color: e.color});
        });

    $(this.find('a.filter-name-edit')).editable({
        type: 'text',
        title: 'Enter category name',
        success: function (response, newValue) {
            var id = $(this).parents('li.filter-row').attr('id');
            Category.first({_id: id}).update({title: newValue});
        }
    });
};


Template.memberBar.rendered = function() {
    $(this.findAll('.checkbox-custom > input')).each(function () {

        var $this = $(this);
        if ($this.data('checkbox')) return;
        $this.checkbox($this.data());
    });



};


Template.memberBar.helpers({
    user_name: function () {
        var user = User.init(this);
        return user.userName();
    },

    avatar: function () {
        var user = User.init(this);
        return Gravatar.getGravatar(user);
    }
});








