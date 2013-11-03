Template.sidebarTags.helpers({
    alltags:function() {
       var tags = Tags.find();
        return tags;
    }
});