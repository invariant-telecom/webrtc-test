const fs = require("fs");
const express = require('express');
const https = require('https');
const socketIO = require('socket.io');
const debug = require("debug")("myapp:server");

const app = express();

// Yes, TLS is required
const serverConfig = {
  key: fs.readFileSync('key.pem'),
  cert: fs.readFileSync('cert.pem')
};

const port = normalizePort(process.env.PORT || '3232');
app.set('port', port);
app.use(express.json());

const server = https.createServer(serverConfig, app);
const io = socketIO(server);

app.get("/", function (req, res, next) {
  res.json({
    status: 'OK'
  });
});

/**
 * socket.io stuff
 */
io.on("connection", socket => {
  console.log('Socket Connected!');
})

/**
 * Listen on provided port, on all network interfaces.
 */
server.listen(port);
server.on("error", onError);
server.on("listening", onListening);

/**
 * Normalize a port into a number, string, or false.
 */
function normalizePort(val) {
  var port = parseInt(val, 10);
  return isNaN(port)
    ? val : port >= 0
    ? port : false;
}

/**
 * Event listener for HTTP server "error" event.
 */
function onError(error) {
  if (error.syscall !== 'listen') {
    throw error;
  }

  var bind = typeof port === 'string' ? 'Pipe ' + port : 'Port ' + port;

  // handle specific listen errors with friendly messages
  switch (error.code) {
    case 'EACCES':
      console.error(bind + ' requires elevated privileges');
      process.exit(1);
      break;
    case 'EADDRINUSE':
      console.error(bind + ' is already in use');
      process.exit(1);
      break;
    default:
      throw error;
  }
}

/**
 * Event listener for HTTP server "listening" event.
 */
function onListening() {
  var addr = server.address();
  var bind = typeof addr === 'string' ? 'pipe ' + addr : 'port ' + addr.port;
  debug('Listening on ' + bind);
}
