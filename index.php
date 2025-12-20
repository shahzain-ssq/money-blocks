<?php
// Redirect root requests to the public front-end.
header('Location: /public/');
http_response_code(302);
exit;
