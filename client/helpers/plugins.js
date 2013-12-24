$(document)
    .on('click.fuelux.checkbox', function() {
        $('.checkbox-custom > input').each(function () {

            var $this = $(this);
            if ($this.data('checkbox')) return;
            $this.checkbox($this.data());
        });
    });



