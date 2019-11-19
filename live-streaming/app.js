const fs = require('fs');
const express = require('express');
const https = require('https');
const socketIO = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const debug = require('debug')('myapp:server');

const app = express();

const db = new sqlite3.Database(':memory:');

db.serialize(function() {
  db.run(`CREATE TABLE products(
    liveId TEXT PRIMARY KEY,
    list TEXT NOT NULL
  )`);
});

// db.close();
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

app.get('/', function(req, res, next) {
  db.get(
    'SELECT * FROM products WHERE liveId LIKE "liveroom-1234" LIMIT 1',
    (err, row) => {
      if (row) {
        console.log('Already Exist');
        return;
      }
    }
  );
  res.json({
    status: 'OK'
  });
});

/**
 * socket.io stuff
 */
io.on('connection', socket => {
  socket.on('room', (data, cb) => {
    console.log('calleing ROOM 2222');
    const liveRoom = `liveroom-${data.shopId
      .toString()
      .replace('liveroom-', '')}`;
    const products = JSON.stringify(data.products);
    if (data.sender) {
      db.get(
        'SELECT * FROM products WHERE liveId LIKE ? LIMIT 1',
        [liveRoom],
        (err, row) => {
          if (row) {
            console.log(row);
            return cb(`${liveRoom} already exist!`, null);
          }
        }
      );
    }

    socket.join(liveRoom, () => {
      if (data.sender) {
        db.run('INSERT INTO products(liveId, list) VALUES(?, ?)', [
          liveRoom,
          products
        ]);
        let rooms = Object.keys(io.sockets.adapter.rooms);
        socket.broadcast.emit('roomlist', getRoom(rooms));
      } else {
        db.get(
          'SELECT * FROM products WHERE liveId LIKE ? LIMIT 1',
          [liveRoom],
          (err, row) => {
            if (row) {
              cb(null, { products: JSON.parse(row.list) });
            }
          }
        );
      }
      cb(null, `Connected to ${liveRoom}`);
    });
  });

  socket.on('stream', (shopId, image) => {
    let liveRoom = `liveroom-${shopId}`;
    socket.broadcast.to(liveRoom).emit('stream', image);
  });

  socket.on('message', (shopId, message) => {
    let liveRoom = `liveroom-${shopId}`;
    socket.broadcast.to(liveRoom).emit('message', message);
  });

  socket.on('roomlist', () => {
    console.log('Calling ROOM LIST 111111');
    let rooms = Object.keys(io.sockets.adapter.rooms);
    io.to(socket.id).emit('roomlist', getRoom(rooms));
  });

  socket.on('leaveroom', ({ shopId, sender } = data) => {
    if (sender) {
      let liveRoom = `liveroom-${shopId.toString().replace('liveroom-', '')}`;
      setTimeout(() => {
        db.run('DELETE FROM products WHERE liveId LIKE ?', [liveRoom]);
        io.in(liveRoom)
          .clients(function(error, clients) {
            if (clients.length > 0) {
              console.log('clients in the room: \n');
              console.log(clients);
              clients.forEach(function(socket_id) {
                console.log('removeing room');
                io.sockets.sockets[socket_id].leave(liveRoom);
              });
            }
          });
        let rooms = Object.keys(io.sockets.adapter.rooms);
        socket.broadcast.emit('roomlist', getRoom(rooms));
      }, 500);
    }
  });
});

const getRoom = rooms => rooms.filter(room => room.includes('liveroom'));

/**
 * Listen on provided port, on all network interfaces.
 */
server.listen(port);
server.on('error', onError);
server.on('listening', onListening);

/**
 * Normalize a port into a number, string, or false.
 */
function normalizePort(val) {
  var port = parseInt(val, 10);
  return isNaN(port) ? val : port >= 0 ? port : false;
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
  console.log(`Server Listening on ${port}`);
}
