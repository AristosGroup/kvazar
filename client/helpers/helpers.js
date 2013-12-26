ToggleClass = function(e) {

    e.preventDefault();
    var $this = $(e.target), $class , $target, $tmp, $classes, $targets;
    !$this.data('toggle') && ($this = $this.closest('[data-toggle^="class"]'));
    $class = $this.data()['toggle'];
    $target = $this.data('target') || $this.attr('href');
    $class && ($tmp = $class.split(':')[1]) && ($classes = $tmp.split(','));
    $target && ($targets = $target.split(','));
    $targets && $targets.length && $.each($targets, function( index, value ) {
        ($targets[index] !='#') && $($targets[index]).toggleClass($classes[index]);
    });
    $this.toggleClass('active');
};


Hide = function(el, target) {
    el.removeClass('active');
    target.removeClass('show');

};

Show = function(el, target) {
    el.addClass('active');
    target.addClass('show');
};


/**
 *
 * todo Меню не отрабатывает 2ой раз, так как после апдейта шаблона, в который он вставляется, затирается блок с дропдауном
 * @param e
 * @param dropdown
 * @constructor
 */
KMenu = function(e, dropdown) {
    e.preventDefault();
    var target = e.currentTarget;
    dropdown.detach();
    dropdown.appendTo($(target).parent());
    dropdown.on('click', function(e) {
        e.stopPropagation();
    });
    $(target).dropdown();
};