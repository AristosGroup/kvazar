Session.set('categoryNewColor', null);

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

        KMenu(e, $('#categoryAddDropdown'));
    }


});


Template.categoryBarRow.events({
    'click a.filter-edit': function (e) {

        Session.set('filterEditId', this._id);
        Session.set('filterEditType', 'Category');
        KMenu(e, $('#editingFilter'));

    }
});


Template.categoryAddDropdown.rendered = function () {
    var options = {
        colors: [General.backgroundColors]
    };
    $(this.find('div.colorpalette')).colorPalette(options)
        .on('selectColor', function (e) {
            Session.set('categoryNewColor', e.color);

        });

};

Template.categoryAddDropdown.events({
    'click a.category-add': function (e) {
        e.preventDefault();

        var currentWorkspace = User.current().currentWorkspace();
        var attrs = {workspace_id: currentWorkspace._id, color: Session.get('categoryNewColor'), title:$('#new-category-name').val()};
        var newCategory = Category.createNewCategory(attrs);

        $('#categoryAddDropdown').parent().removeClass('open');
    }
});


