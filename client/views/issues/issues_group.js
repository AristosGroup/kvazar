Template.issuesGroup.helpers({

    group:function() {
        var id = this.key;
      //  console.log(id);
        var status =  Statuses.findOne(id);
        console.log(status);
        return status;
    }

});