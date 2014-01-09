Template.ganalytics.rendered = function() {
    if(!isGanalyticsLoaded) {
        window['GoogleAnalyticsObject']='ga';
        window['ga']=window['ga']||function(){
            (window['ga'].q=window['ga'].q||[]).push(arguments)
        }, window['ga'].l=1*new Date();

        var myGAJs = document.createElement('script'),
            s = document.getElementsByTagName('script')[0];
        myGAJs.type ='text/javascript';
        myGAJs.async = true;
        myGAJs.src = '//www.google-analytics.com/analytics.js';

        myScriptLoader(myGAJs, function funcEventLoaded() {
            isGanalyticsLoaded = true;
            ga('create', 'UA-47005586-1', 'kvazarjs.com');
            ga('send', 'pageview');
        });
        s.parentNode.insertBefore(myGAJs, s);
    }
}
