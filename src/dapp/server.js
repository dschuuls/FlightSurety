const express = require('express'),
      app = express();
app.use(express.static(__dirname + '/public'));
app.listen(8000);
console.log('dApp served @ http://localhost:8000');
