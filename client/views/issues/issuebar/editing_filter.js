Session.set('filterEditType', null);
Session.set('filterEditId', null);

Template.editingFilter.helpers({
    title: function () {
        if (Session.get('filterEditId')) {
            var Obj = currentEditingFilterObj();
            return Obj.title;
        }

        return null;
    },

    filterName: function() {
        return Session.get('filterEditType');
    }
});


Template.editingFilter.events({
    'click .filter-remove': function (e) {
        e.preventDefault();
        currentEditingFilterObj().destroy();
        Session.set('filterEditId', null);
        Session.set('filterEditType', null);

    }
});

Template.editingFilter.rendered = function () {
    var options = {
        colors: [General.backgroundColors]
    };
    $(this.find('div.colorpalette')).colorPalette(options)
        .on('selectColor', function (e) {

            var Obj = currentEditingFilterObj();

            Obj.update({color: e.color});
        });

    $(this.find('a.filter-name-edit')).editable({
        type: 'text',
        title: 'Enter category name',
        success: function (response, newValue) {

            var Obj = currentEditingFilterObj();
            Obj.update({title: newValue});
        }
    });
};

currentEditingFilterObj = function () {
    return window[Session.get('filterEditType')].first(Session.get('filterEditId'));
};