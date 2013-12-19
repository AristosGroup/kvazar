// Load the application once the DOM is ready, using `jQuery.ready`:
$(function(){

  // Task Model
  // ----------

  var Comment = Backbone.Model.extend({
    defaults: function() {
      return {
        _id  : "",
        desc : "",
        date : Date.now()
      };
    }
  });

  CommentList = Backbone.Collection.extend({ 
    model : Comment, 
    localStorage: new Backbone.LocalStorage("tasks-comment-app"),
  });

  var CommentItemView = Backbone.View.extend({

    //... is a list tag.
    tagName:  "li",
    className: "list-group-item hover",

    // Cache the template function for a single item.
    template: _.template($('#item-c-template').html()),

    // The DOM events specific to an item.
    events: {
      "click .destroy"  : "clear",
    },

    // The View listens for changes to its model, re-rendering. 
    initialize: function() {
      this.listenTo(this.model, 'change', this.render);
      this.listenTo(this.model, 'destroy', this.remove);
    },

    // Re-render the titles of the item.
    render: function() {
      this.$el.html(this.template(this.model.toJSON()));
      return this;
    },

    // Remove the item, destroy the model.
    clear: function(e) {
      this.model.destroy();
    }

  });

  var Task = Backbone.Model.extend({

    // Default attributes for the item.
    defaults: function() {
      return {
        id      :  Tasks.nextId(),
        name    :  "New task",
        desc    :  "",
        date    :  Date.now(),
        done    : false
      };
    },

    initialize: function () {
        this.comments = new CommentList();
    },

    // Toggle the `done` state of this task item.
    toggle: function() {
      this.save({done: !this.get("done")});
    }

  });

  // Task Collection
  // ---------------

  // The collection of tasks is backed by *localStorage* instead of a remote server

  var TaskList = Backbone.Collection.extend({

    // Reference to this collection's model.
    model: Task,

    // Save all of the items under namespace.
    localStorage: new Backbone.LocalStorage("tasks-app"),

    // We keep in sequential id, despite being saved by unordered
    // GUID in the database. This generates the next id number for new items.
    nextId: function() {
      if (!this.length) return 1;
      return this.last().get('id') + 1;
    },

    // sorted by their original insertion id.
    comparator: function(task) {
      return task.get("id");
    },

    // Filter down the list of all task items that are finished.
    done: function() {
      return this.where({done: true});
    },

    // Filter down the list to only task items that are still not finished.
    remaining: function() {
      return this.without.apply(this, this.done());
    },

    search : function(str){
      // if(str == "") return this;
      
      var pattern = new RegExp(str, "gi");
      return _(this.filter(function(data) {
          data.trigger('show');
          if (pattern.test(data.get("desc")) == false) {
            data.trigger('hide');
          };
      }));
    }

  });

  // Create our global collection.
  var Tasks = new TaskList;

  // Item View
  // --------------

  // The DOM element for a item...
  var TaskItemView = Backbone.View.extend({

    //... is a list tag.
    tagName:  "li",
    className: "list-group-item hover",

    // Cache the template function for a single item.
    template: _.template($('#item-template').html()),

    // The DOM events specific to an item.
    events: {
      "click .destroy"  : "clear",
      "click"           : "select",
      "click .toggle"   : "toggleDone",
      "click .view"     : "edit",
      "keypress .edit"  : "updateOnEnter",
      "blur .edit"      : "close"
    },

    // The View listens for changes to its model, re-rendering. 
    initialize: function() {
      this.listenTo(this.model, 'change', this.render);
      this.listenTo(this.model, 'destroy', this.remove);
      this.listenTo(this.model, 'select', this.select);
      this.listenTo(this.model, 'hide', this.hide);
      this.listenTo(this.model, 'show', this.show);
    },

    // Re-render the titles of the item.
    render: function() {
      this.$el.html(this.template(this.model.toJSON()));
      this.$el.toggleClass('done', this.model.get('done'));
      this.input = this.$('.edit');
      return this;
    },

    // Toggle the `"done"` state of the model.
    toggleDone: function() {
      this.model.toggle();
    },

    // Switch this view into `"editing"` mode, displaying the input field.
    edit: function() {
      this.$el.addClass("editing");
      this.input.focus();
    },

    // Close the `"editing"` mode, saving changes to the todo.
    close: function() {
      var value = this.input.val();
      if (!value) {
        this.clear();
      } else {
        this.model.save({name: value});
        this.$el.removeClass("editing");
      }
    },

    // If you hit `enter`, we're through editing the item.
    updateOnEnter: function(e) {
      if (e.keyCode == 13) this.close();
    },

    // Remove the item, destroy the model.
    clear: function(e) {
      this.model.destroy();
      window.history.back();
    },

    // Click to select
    select: function(){
      this.$el.parent().find('.active').removeClass('active');
      this.$el.addClass('active');
      app.navigate("tasks/"+this.model.get('id'), {trigger: true});
    },

    hide: function(){
      this.$el.addClass('hide');
    },

    show: function(){
      this.$el.removeClass('hide');
    }

  });


  // list view

  var TaskListView = Backbone.View.extend({

    // Instead of generating a new element, bind to the existing skeleton of
    el: $("#task-list"),

    // At initialization we bind to the relevant events on the 
    // collection, when items are added or changed. Kick things off by
    // loading any preexistings that might be saved in *localStorage*.
    initialize: function() {

      this.listenTo(Tasks, 'add', this.addOne);
      this.listenTo(Tasks, 'reset', this.addAll);
      this.listenTo(Tasks, 'all', this.render);

      Tasks.fetch();
      if(Tasks.length == 0){
        this.populateData();
      }
    },

    // Re-rendering the App just means refreshing the statistics -- the rest
    // of the app doesn't change.
    render: function() {

    },

    // Add a single item to the list by creating a view for it, and
    // appending its element to the `<ul>`.
    addOne: function(task) {
      var view = new TaskItemView({model: task});
      this.$el.prepend(view.render().el);
    },

    // Add all items in the collection at once.
    addAll: function() {
      Tasks.each(this.addOne, this);
    },

    populateData: function () {
      Tasks.create();
    }

  });

  // task detail
  var TaskView = Backbone.View.extend({
    el: $("#task-detail"),

    // Cache the template function
    template: _.template($('#task-template').html()),

    // The DOM events specific to the textarea.
    events: {
      "keyup textarea"        : "updateOnKeyup",
      "click #task-c-btn"     : "addComment",
      "keypress #task-c-input": "createOnEnter",
    },

    initialize:function () {      
      this.listenTo(this.model.comments, 'add', this.addOne);
      this.listenTo(this.model.comments, 'reset', this.addAll);
      this.listenTo(this.model.comments, 'all', this.render);

      var self = this;
      _.delay( function(){self.model.comments.fetch({reset: true});} , 500);

      this.$el.html(this.template(this.model.toJSON()));
    },

    addOne: function(comment) {
      var view = new CommentItemView({model: comment});
      this.$('#task-comment').prepend(view.render().el);
    },

    // Add all items in the collection at once.
    addAll: function() {
      _.each( this.model.comments.where({_id: this.model.get('id')}), this.addOne, this);
    },

    createOnEnter: function(e) {
      if (e.keyCode != 13) return;
      this.addComment();
    },

    addComment: function(){
      this.input = this.$("#task-c-input");
      if (!this.input.val()) return;
      this.model.comments.create({_id: this.model.get('id'), desc: this.input.val()});
      this.input.val('');
    },

    // update the model when update
    updateOnKeyup: function(e){
      var desc = $(e.target).val();
      this.model.save({desc: desc});
    },

    close:function () {
      this.model.comments.unbind();
      this.$el.unbind();
      this.$el.empty();
    }

  });

  // task app view to contorl other things
  var TaskAppView = Backbone.View.extend({    
    el: $('#taskapp'),

    // Delegated events for creating new items, and clearing completed ones.
    events: {
      "click #new-task"   : "create",
      "keyup #search-task": "search",
      "click #toggle-all": "toggleAllComplete"
    },

    initialize: function() {
      this.allCheckbox = this.$("#toggle-all")[0];
    },

    create: function(e) {
      var task = Tasks.create();
      task.trigger('select');
    },

    search: function(){
      Tasks.search($('#search-task').val());
    },

    toggleAllComplete: function () {
      var done = this.allCheckbox.checked;
      Tasks.each(function (task) { task.save({'done': done}); });
    }

  });
  
  var AppRouter = Backbone.Router.extend({
    routes: {
      "" : "list",
      "tasks/:id" : "details"
    },

    initialize: function () {
      new TaskAppView;      
    },

    list: function() {
      if(this.taskListView) return;
      this.taskListView = new TaskListView;
      var self = this;
      if(!this.requiredId){
        _.delay(function(){self.taskListView.$el.children().first().trigger('click')},500);
      }
    },
    
    details: function(id) {
      this.requiredId = id;
      this.list();
      // close the task detail view
      if (this.taskView) this.taskView.close();
      // get the task
      this.task = Tasks.get(id);
      if(this.task){
        this.task.trigger('select');
        this.taskView = new TaskView({model: this.task});
      }      
    }
  });

  // Finally, we kick things off by creating the **App**.
  var app = new AppRouter();
  Backbone.history.start();

});