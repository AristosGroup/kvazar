!function ($) {

  $(function(){
 	
  	var isRgbaSupport = function(){
		var value = 'rgba(1,1,1,0.5)',
		el = document.createElement('p'),
		result = false;
		try {
			el.style.color = value;
			result = /^rgba/.test(el.style.color);
		} catch(e) {}
		el = null;
		return result;
	};

	var toRgba = function(str, alpha){
		var patt = /^#([\da-fA-F]{2})([\da-fA-F]{2})([\da-fA-F]{2})$/;
		var matches = patt.exec(str);
		return "rgba("+parseInt(matches[1], 16)+","+parseInt(matches[2], 16)+","+parseInt(matches[3], 16)+","+alpha+")";
	};

	// chart js
	var generateSparkline = function($re){
		$(".sparkline").each(function(){
			var $data = $(this).data();
			if($re && !$data.resize) return;
			if($data.type == 'bar'){
				!$data.barColor && ($data.barColor = "#3fcf7f");
				!$data.barSpacing && ($data.barSpacing = 2);
				$(this).next('.axis').find('li').css('width',$data.barWidth+'px').css('margin-right',$data.barSpacing+'px');
			};
			
			($data.type == 'pie') && $data.sliceColors && ($data.sliceColors = eval($data.sliceColors));
			($data.type == 'bar') && $data.stackedBarColor && ($data.stackedBarColor = eval($data.stackedBarColor));
			
			$data.fillColor && ($data.fillColor.indexOf("#") !== -1) && isRgbaSupport() && ($data.fillColor = toRgba($data.fillColor, 0.5));

			$data.valueSpots = {'0:': $data.spotColor};
			$data.minSpotColor = false;
			$(this).sparkline( $data.data || "html", $data);

			if($(this).data("compositeData")){
				var $cdata = {};
				$cdata = $(this).data("compositeConfig");
				$cdata.composite = true;
				$cdata.valueSpots = {'0:': $cdata.spotColor};
				$cdata.fillColor && ($cdata.fillColor.indexOf("#") !== -1) && isRgbaSupport() && ($cdata.fillColor = toRgba($cdata.fillColor, 0.5));
				$(this).sparkline($(this).data("compositeData"), $cdata);
			};
			if($data.type == 'line'){
				$(this).next('.axis').addClass('axis-full');
			};
		});
	};

	var sparkResize;
	$(window).resize(function(e) {
		clearTimeout(sparkResize);
		sparkResize = setTimeout(function(){generateSparkline(true)}, 500);
	});
	generateSparkline(false);

	// easypie
	var updatePie = function($that) {
		var $this = $that, 
		$newValue = Math.round(100*Math.random());	    
	    $this.data('easyPieChart').update($newValue);
	};

    $('.easypiechart').each(function(){
    	var $barColor = $(this).data("barColor") || function($percent) {
            $percent /= 100;
            return "rgb(" + Math.round(255 * (1-$percent)) + ", " + Math.round(255 * $percent) + ", 125)";
        },
		$trackColor = $(this).data("trackColor") || "#c8d2db",
		$scaleColor = $(this).data("scaleColor"),
		$lineWidth = $(this).data("lineWidth") || 12,
		$size = $(this).data("size") || 130,
		$animate = $(this).data("animate") || 1000;

		$(this).easyPieChart({
	        barColor: $barColor,
	        trackColor: $trackColor,
	        scaleColor: $scaleColor,
	        lineCap: 'butt',
	        lineWidth: $lineWidth,
	        size: $size,
	        animate: $animate,
	        onStop: function(){
	        	var $this = this.$el;
	        	$this.data("loop") && setTimeout(function(){ $this.data("loop") && updatePie($this) }, 2000);        	
	        },
	        onStep: function(value) {
	          this.$el.find('span').text(parseInt(value));
	        }
	    });
	});

    $(document).on('click', '[data-toggle^="class:pie"]', function (e) {
    	e && e.preventDefault();
	    var $btn = $(e.target), $loop = $('[data-loop]').data('loop'), $target;
	    !$btn.data('toggle') && ($btn = $btn.closest('[data-toggle^="class"]'));
	    $target = $btn.data('target');
	    !$target && ($target = $btn.closest('[data-loop]'));
		$target.data('loop', !$loop);
		!$loop && updatePie($('[data-loop]'));
	});
    
    // combodate
	$(".combodate").each(function(){ 
		$(this).combodate();
		$(this).next('.combodate').find('select').addClass('form-control');
	});
	// datepicker
	$(".datepicker-input").each(function(){ $(this).datepicker();});
	// dropfile
	$('.dropfile').each(function(){
		var $dropbox = $(this);
		if (typeof window.FileReader === 'undefined') {
		  $('small',this).html('File API & FileReader API not supported').addClass('text-danger');
		  return;
		}

		this.ondragover = function () {$dropbox.addClass('hover'); return false; };
		this.ondragend = function () {$dropbox.removeClass('hover'); return false; };
		this.ondrop = function (e) {
		  e.preventDefault();
		  $dropbox.removeClass('hover').html('');
		  var file = e.dataTransfer.files[0],
		      reader = new FileReader();
		  reader.onload = function (event) {
		  	$dropbox.append($('<img>').attr('src', event.target.result));
		  };
		  reader.readAsDataURL(file);
		  return false;
		};
	});

	// fuelux pillbox
	var addPill = function($input){
		var $text = $input.val(), $pills = $input.closest('.pillbox'), $repeat = false, $repeatPill;
		if($text == "") return;
		$("li", $pills).text(function(i,v){
	        if(v == $text){
	        	$repeatPill = $(this);
	        	$repeat = true;
	        }
	    });
	    if($repeat) {
	    	$repeatPill.fadeOut().fadeIn();
	    	return;
	    };
	    $item = $('<li class="label bg-dark">'+$text+'</li> ');
		$item.insertBefore($input);
		$input.val('');
		$pills.trigger('change', $item);
	};

	$('.pillbox input').on('blur', function() {
		addPill($(this));
	});

	$('.pillbox input').on('keypress', function(e) {
	    if(e.which == 13) {
	        e.preventDefault();
	        addPill($(this));
	    }
	});

	// slider
	$('.slider').each(function(){
		$(this).slider();
	});

	// wizard
	var $nextText;
	$(document).on('click', '[data-wizard]', function (e) {
		var $this   = $(this), href;
	    var $target = $($this.attr('data-target') || (href = $this.attr('href')) && href.replace(/.*(?=#[^\s]+$)/, ''));
	    var option = $this.data('wizard');
	    var item = $target.wizard('selectedItem');
	    var $step = $target.next().find('.step-pane:eq(' + (item.step-1) + ')');
	    !$nextText && ($nextText = $('[data-wizard="next"]').html());
	    var validated = false;
	    $('[data-required="true"]', $step).each(function(){
	    	return (validated = $(this).parsley( 'validate' ));
	    });
	    if($(this).hasClass('btn-next') && !validated){
	    	return false;
	    }else{
	    	$target.wizard(option);
	    	var activeStep = (option=="next") ? (item.step+1) : (item.step-1);
	    	var prev = ($(this).hasClass('btn-prev') && $(this)) || $(this).prev();
	    	var next = ($(this).hasClass('btn-next') && $(this)) || $(this).next();
	    	prev.attr('disabled', (activeStep == 1) ? true : false);
	    	next.html((activeStep < $target.find('li').length) ? $nextText : next.data('last'));
	    }
	});

	if ($.fn.sortable) {
	  $('.sortable').sortable();
	}

	$('.no-touch .slim-scroll').each(function(){
		var $self = $(this), $data = $self.data(), $slimResize;
		$self.slimScroll($data);
		$(window).resize(function(e) {
			clearTimeout($slimResize);
			$slimResize = setTimeout(function(){$self.slimScroll($data);}, 500);
		});
	});

	if ($.support.pjax) {
	  $(document).on('click', 'a[data-pjax]', function(event) {
	  	event.preventDefault();
	    var container = $($(this).data('target'));
	    $.pjax.click(event, {container: container});
	  })
	};

	$('.portlet').each(function(){
		$(".portlet").sortable({
	        connectWith: '.portlet',
            iframeFix: false,
            items: '.portlet-item',
            opacity: 0.8,
            helper: 'original',
            revert: true,
            forceHelperSize: true,
            placeholder: 'sortable-box-placeholder round-all',
            forcePlaceholderSize: true,
            tolerance: 'pointer'
	    });
    });


  });
}(window.jQuery);