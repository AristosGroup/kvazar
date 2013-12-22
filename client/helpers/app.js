
// data-shift api
!function ($) {

    "use strict"; // jshint ;_;

    /* SHIFT CLASS DEFINITION
     * ====================== */

    var Shift = function (element) {
        this.$element = $(element)
        this.$prev = this.$element.prev()
        !this.$prev.length && (this.$parent = this.$element.parent())
    }

    Shift.prototype = {
        constructor: Shift

        , init:function(){
            var $el = this.$element
                , method = $el.data()['toggle'].split(':')[1]
                , $target = $el.data('target')
            $el.hasClass('in') || $el[method]($target).addClass('in')
        }
        , reset :function(){
            this.$parent && this.$parent['prepend'](this.$element)
            !this.$parent && this.$element['insertAfter'](this.$prev)
            this.$element.removeClass('in')
        }
    }

    /* SHIFT PLUGIN DEFINITION
     * ======================= */

    $.fn.shift = function (option) {
        return this.each(function () {
            var $this = $(this)
                , data = $this.data('shift')
            if (!data) $this.data('shift', (data = new Shift(this)))
            if (typeof option == 'string') data[option]()
        })
    }

    $.fn.shift.Constructor = Shift
}(window.jQuery);

Date.now = Date.now || function() { return +new Date; };

!function ($) {

    $(function(){

        // toogle fullscreen
        $(document).on('click', "[data-toggle=fullscreen]", function(e){
            if (screenfull.enabled) {
                screenfull.request();
            }
        });

        // placeholder
        $('input[placeholder], textarea[placeholder]').placeholder();

        // popover
        $("[data-toggle=popover]").popover();
        $(document).on('click', '.popover-title .close', function(e){
            var $target = $(e.target), $popover = $target.closest('.popover').prev();
            $popover && $popover.popover('hide');
        });

        // ajax modal
        $('[data-toggle="ajaxModal"]').on('click',
            function(e) {
                $('#ajaxModal').remove();
                e.preventDefault();
                var $this = $(this)
                    , $remote = $this.data('remote') || $this.attr('href')
                    , $modal = $('<div class="modal" id="ajaxModal"><div class="modal-body"></div></div>');
                $('body').append($modal);
                $modal.modal();
                $modal.load($remote);
            }
        );
        // dropdown menu
        $.fn.dropdown.Constructor.prototype.change = function(e){
            e.preventDefault();
            var $item = $(e.target), $select, $checked = false, $menu, $label;
            !$item.is('a') && ($item = $item.closest('a'));
            $menu = $item.closest('.dropdown-menu');
            $label = $menu.parent().find('.dropdown-label');
            $labelHolder = $label.text();
            $select = $item.find('input');
            $checked = $select.is(':checked');
            if($select.is(':disabled')) return;
            if($select.attr('type') == 'radio' && $checked) return;
            if($select.attr('type') == 'radio') $menu.find('li').removeClass('active');
            $item.parent().removeClass('active');
            !$checked && $item.parent().addClass('active');
            $select.prop("checked", !$select.prop("checked"));

            $items = $menu.find('li > a > input:checked');
            if ($items.length) {
                $text = [];
                $items.each(function () {
                    var $str = $(this).parent().text();
                    $str && $text.push($.trim($str));
                });

                $text = $text.length < 4 ? $text.join(', ') : $text.length + ' selected';
                $label.html($text);
            }else{
                $label.html($label.data('placeholder'));
            }
        }
        $(document).on('click.dropdown-menu', '.dropdown-select > li > a', $.fn.dropdown.Constructor.prototype.change);

        // tooltip
        $("[data-toggle=tooltip]").tooltip();



        // panel toggle
        $(document).on('click', '.panel-toggle', function(e){
            e && e.preventDefault();
            var $this = $(e.target), $class = 'collapse' , $target;
            if (!$this.is('a')) $this = $this.closest('a');
            $target = $this.closest('.panel');
            $target.find('.panel-body').toggleClass($class);
            $this.toggleClass('active');
        });

        // carousel
        $('.carousel.auto').carousel();

        // button loading
        $(document).on('click.button.data-api', '[data-loading-text]', function (e) {
            var $this = $(e.target);
            $this.is('i') && ($this = $this.parent());
            $this.button('loading');
        });

        var scrollToTop = function(){
            !location.hash && setTimeout(function () {
                if (!pageYOffset) window.scrollTo(0, 0);
            }, 1000);
        };

        var $window = $(window);
        // mobile
        var mobile = function(option){
            if(option == 'reset'){
                $('[data-toggle^="shift"]').shift('reset');
                return true;
            }
            scrollToTop();
            $('[data-toggle^="shift"]').shift('init');
            return true;
        };
        // unmobile
        $window.width() < 768 && mobile();
        // resize
        var $resize;
        $window.resize(function() {
            clearTimeout($resize);
            $resize = setTimeout(function(){
                $window.width() < 767 && mobile();
                $window.width() >= 768 && mobile('reset') && fixVbox();
            }, 500);
        });

        // fix vbox
        var fixVbox = function(){
            $('.vbox > footer').prev('section').addClass('w-f');
            $('.ie11 .vbox').each(function(){
                $(this).height($(this).parent().height());
            });
        }
        fixVbox();

        // collapse nav
        $(document).on('click', '[data-ride^="collapse"] a', function (e) {
            var $this = $(e.target), $active;
            $this.is('a') || ($this = $this.closest('a'));
            if( $('.nav-vertical').length ){
                return;
            }

            $active = $this.parent().siblings( ".active" );
            $active && $active.find('> a').toggleClass('active') && $active.toggleClass('active').find('> ul:visible').slideUp(200);

            ($this.hasClass('active') && $this.next().slideUp(200)) || $this.next().slideDown(200);
            $this.toggleClass('active').parent().toggleClass('active');

            $this.next().is('ul') && e.preventDefault();
        });

    });
}(window.jQuery);