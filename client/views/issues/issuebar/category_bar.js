Session.set('categoryNewColor', null);


Template.categoryBar.helpers({

    categories: function () {

        var currentWorkspace = CurrentWorkspace();
        var categories = WorkspaceManager.allCategories(currentWorkspace);
        return categories;


    }
});


Template.categoryBar.events({

});


Template.categoryBarRow.events({
    'click a.filter-edit': function (e) {

        Session.set('categoryEditId', this._id);


    }
});

Template.categoryBarRow.rendered = function () {

};


Template.categoryAddDropdown.rendered = function () {
    $(this.find('.dropdown-menu')).on('click', function(e) {
        e.stopPropagation();
    });
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

        var currentWorkspace = CurrentWorkspace();
        var attrs = {workspaceId: currentWorkspace._id, color: Session.get('categoryNewColor'), title: $('#new-category-name').val()};

        Meteor.call('createCategory', attrs, function (error, id) {
            if (error)
                return alert(error.reason);

        });

        $('#categoryAddDropdown').parent().removeClass('open');
    }
});


Template.categoryEditDropdown.rendered = function () {


    var options = {
        colors: [General.backgroundColors]
    };



    $(this.find('div.colorpalette')).colorPalette(options)
        .on('selectColor', function (e) {
            var id = Session.get('categoryEditId');

            Meteor.call('updateCategory', id, {color: e.color}, function (error, id) {
                if (error)
                    return alert(error.reason);

            });


        });

    $(this.find('a.filter-name-edit')).editable({
        type: 'text',
        title: 'Enter category name',
        success: function (response, newValue) {
            var id = Session.get('categoryEditId');

            Meteor.call('updateCategory', id, {title: newValue}, function (error, id) {
                if (error)
                    return alert(error.reason);

            });

        }
    });
};

Template.categoryEditDropdown.events({
    'click .filter-remove': function (e) {
        e.preventDefault();
        Meteor.call('deleteCategory', Session.get('categoryEditId'), function (error, id) {
            if (error)
                return alert(error.reason);

        });
        Session.set('categoryEditId', null);

    }
});

Template.categoryEditDropdown.helpers({
    title: function () {
        return this.title;
    }
});


