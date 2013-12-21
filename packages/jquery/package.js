Package.describe({
    summary: "jQuery"
});

Package.on_use(function (api) {

    api.add_files('jquery-1.10.2.js', 'client');
   // api.add_files('jquery-1.10.2.min.map', 'client');
});
