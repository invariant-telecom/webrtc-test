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
    title TEXT NOT NULL,
    list TEXT NOT NULL,
    date number NOT NULL
  )`);
});

// db.close();
// Yes, TLS is required
const serverConfig = {
  key: fs.readFileSync('key.pem'),
  cert: fs.readFileSync('cert.pem')
};

const port = normalizePort(process.env.PORT || '8000');
app.set('port', port);
app.use(express.json());

const server = https.createServer(serverConfig, app);
const io = socketIO(server);

app.get('/', function(req, res, next) {
  res.json({
    status: 'OK'
  });
});

/**
 * socket.io stuff
 */
io.on('connection', socket => {
  socket.on('room', (data, cb) => {
    console.log('incomming data', data);
    const liveRoom = `liveroom-${data.shopId
      .toString()
      .replace('liveroom-', '')}`;

    if (data.sender) {
      db.get(
        'SELECT * FROM products WHERE liveId LIKE ? LIMIT 1',
        [liveRoom],
        (err, row) => {
          if (row) {
            socket.join(liveRoom, () => {
              getRoom(Object.keys(io.sockets.adapter.rooms), (err, result) => {
                socket.broadcast.emit('roomlist', result);
              });
              return cb(null, `Connected to ${liveRoom}`);
            });
          } else {
            socket.join(liveRoom, () => {
              db.run(
                'INSERT INTO products(liveId, title, list, date) VALUES(?, ?, ?, ?)',
                [liveRoom, data.title, JSON.stringify(data.products), data.date]
              );
              getRoom(Object.keys(io.sockets.adapter.rooms), (err, result) => {
                socket.broadcast.emit('roomlist', result);
              });
              return cb(null, `Connected to ${liveRoom}`);
            });
          }
        }
      );
    } else {
      io.in(liveRoom).clients(function(error, clients) {
        if (clients.length > 0) {
          socket.join(liveRoom, () => {
            db.get(
              'SELECT * FROM products WHERE liveId LIKE ? LIMIT 1',
              [liveRoom],
              (err, row) => {
                if (row) {
                  return cb(null, {
                    liveId: row.liveId,
                    title: row.title,
                    products: JSON.parse(row.list),
                    date: row.date
                  });
                }
              }
            );
          });
        }
      });
    }
  });

  socket.on('stream', (shopId, image) => {
    let liveRoom = `liveroom-${shopId.toString().replace('liveroom-', '')}`;
    socket.broadcast.to(liveRoom).emit('stream', image);
  });

  socket.on('message', (shopId, message) => {
    let liveRoom = `liveroom-${shopId}`;
    socket.broadcast.to(liveRoom).emit('message', message);
  });

  socket.on('roomlist', () => {
    getRoom(Object.keys(io.sockets.adapter.rooms), (err, result) => {
      io.to(socket.id).emit('roomlist', result);
    });
  });

  socket.on('leaveroom', ({ shopId, sender } = data) => {
    console.log('leaving room now');
    if (sender) {
      let liveRoom = `liveroom-${shopId.toString().replace('liveroom-', '')}`;
      db.run('DELETE FROM products WHERE liveId LIKE ?', [liveRoom]);
      io.in(liveRoom).clients(function(error, clients) {
        console.log(clients);
        if (clients.length > 0) {
          clients.forEach((socket_id, index) => {
            io.sockets.sockets[socket_id].leave(liveRoom);
            if (clients.length - index === 1) {
              console.log(clients.length - index);
              getRoom(Object.keys(io.sockets.adapter.rooms), (err, result) => {
                socket.broadcast.emit('roomlist', result);
              });
            }
          });
        } else {
          getRoom(Object.keys(io.sockets.adapter.rooms), (err, result) => {
            socket.broadcast.emit('roomlist', result);
          });
        }
      });
    }
  });
});

const getRoom = (rooms, cb) => {
  const filteredRooms = rooms.filter(room => room.includes('liveroom'));
  let roomData = [];
  if (filteredRooms.length !== 0) {
    db.each(
      'SELECT * FROM products WHERE liveId IN ' +
        JSON.stringify(filteredRooms)
          .replace('[', '(')
          .replace(']', ')'),
      (err, row) => {
        const d = {
          liveId: row.liveId,
          title: row.title,
          products: JSON.parse(row.list),
          date: row.date
        };
        roomData.push(d);
        if (roomData.length === filteredRooms.length) {
          cb(null, roomData);
        }
      }
    );
  } else {
    cb(null, roomData);
  }
};

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
