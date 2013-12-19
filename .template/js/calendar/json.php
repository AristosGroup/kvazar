<?php
$month = isset($_GET['month']) ? $_GET['month'] : date('n');
$year = isset($_GET['year']) ? $_GET['year'] : date('Y');

$array = array(
  array(
    "5/$month/$year", 
    'Popover!', 
    '#', 
    '#51a351', 
    '<img src="http://bit.ly/XRpKAE" />',
  ),
  array(
    "8/$month/$year", 
    'Popover!', 
    '#', 
    '#51a351', 
    '<img src="http://bit.ly/XRpKAE" />'
  ),
  array(
    "18/$month/$year", 
    'octocat!', 
    'https://github.com/logos', 
    'red', 
    'new github logo <img src="http://git.io/Xmayvg" />'
  ),
  array(
    "19/$month/$year", 
    'github drinkup', 
    'https://github.com/blog/category/drinkup', 
    'blue'
  )
);

header('Content-Type: application/json');
echo json_encode($array);
exit;
?>