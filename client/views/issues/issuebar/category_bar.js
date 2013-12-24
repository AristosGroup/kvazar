Template.categoryBar.helpers({

    categories: function () {
        var user = User.current();
        var currentWorkspace = User.current().currentWorkspace();
        var categories = currentWorkspace.allCategories();
        return categories;
    }
});


Template.categoryBar.events({
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



Template.categoryBarRow.rendered = function () {

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
