$(document).ready( function(){

	theMonths = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
	theDays = ["S", "M", "T", "W", "T", "F", "S"];

    $('#calendar').calendar({
        months: theMonths,
        days: theDays,
        req_ajax: {
            type: 'get',
            url: 'js/calendar/json.php'
        },
        popover_options:{
            placement: 'top',
            html: true
        }
    });
});