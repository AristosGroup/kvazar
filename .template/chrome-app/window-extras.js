var WindowExtras = {};

WindowExtras.mainWebview = null;

WindowExtras.init = function(){
    WindowExtras.mainWebview = document.getElementById('the_webview');
    WindowExtras.mainWebview.setAttribute('src', 'http://flatfull.com/themes/todo/index.html');
}

window.addEventListener('load', WindowExtras.init, false);