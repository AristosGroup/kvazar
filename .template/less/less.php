<?php
	set_time_limit(0);
	require_once("lessc.inc.php");
	$input = $_SERVER['REQUEST_URI'];
	// see if it from direct request
	if(strpos($input, '?')){
		$q = explode("?", $input);
		$input = $q[1];
	}
	$lc = new lessc($input);
	try{
		header("Content-Type: text/css");
		print $lc->parse();
	} catch (exception $ex){
		print "LESSC Error:";
		print $ex->getMessage();
	}
?>