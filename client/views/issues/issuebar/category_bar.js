Template.categoryBar.helpers({

    categories: function () {
        var user = User.current();
        var currentWorkspace = User.current().currentWorkspace();
        var categories = currentWorkspace.allCategories();
        return categories;
    }
});


Template.categoryBar.events({

    'click .category-new': function (e) {
        e.preventDefault();

        var currentWorkspace = User.current().currentWorkspace();
        var attrs = {workspace_id: currentWorkspace._id};
        var newCategory = Category.createNewCategory(attrs);
    }


});


Template.categoryBarRow.events({
    'click a.filter-edit': function (e) {

        Session.set('filterEditId', this._id);
        Session.set('filterEditType', 'Category');
        KMenu(e, $('#editingFilter'));

    }
});


