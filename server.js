const express = require("express");
const { createServer } = require("node:http");
const { join } = require("node:path");
const { Server } = require("socket.io");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");
const authRouter = require("./routes/auth");
// var logger = require("morgan");
var session = require("express-session");
var passport = require("passport");
var SQLiteStore = require("connect-sqlite3")(session);

async function main() {
  const db = await open({
    filename: "checkbox.db",
    driver: sqlite3.Database,
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS checkboxes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_offset TEXT UNIQUE,
        checkboxID INTEGER,
        isChecked BOOLEAN
    );
  `);

  const app = express();
  const server = createServer(app);
  const io = new Server(server);

  app.use(express.static(join(__dirname)));

  const sessionMiddleware = session({
    secret: "keyboard cat",
    resave: true,
    saveUninitialized: false,
    store: new SQLiteStore({ db: "sessions.db", dir: "./" }),
  });

  app.use(sessionMiddleware);

  app.use(passport.authenticate("session"));
  app.use("/", authRouter);

  app.get("/", (req, res) => {
    if (!req.user) {
      return res.redirect("/login");
    }
    res.sendFile(join(__dirname, "index.html"));
  });

  function onlyForHandshake(middleware) {
    return (req, res, next) => {
      const isHandshake = req._query.sid === undefined;
      if (isHandshake) {
        middleware(req, res, next);
      } else {
        next();
      }
    };
  }

  io.engine.use(onlyForHandshake(sessionMiddleware));
  io.engine.use(onlyForHandshake(passport.session()));
  io.engine.use(
    onlyForHandshake((req, res, next) => {
      if (req.user) {
        next();
      } else {
        res.writeHead(401);
        res.end();
      }
    })
  );

  io.on("connection", async (socket) => {
    const userId = socket.request.user.id;
    socket.join(`user:${userId}`);

    socket.on("checked", async (id, checked, clientOffset, callback) => {
      let result;
      try {
        result = await db.run(
          "INSERT INTO checkboxes (checkboxID, isChecked, client_offset) VALUES (?, ?, ?)",
          id,
          checked,
          clientOffset
        );
      } catch (e) {
        if (e.errno === 19 /* SQLITE_CONSTRAINT */) {
          callback();
        } else {
          // nothing to do, just let the client retry
        }
        return;
      }
      io.to(`user:${userId}`).emit("checked", id, checked, result.lastID);
      // acknowledge the event
      callback();
    });

    if (!socket.recovered) {
      // if the connection state recovery was not successful
      try {
        await db.each(
          "SELECT id, isChecked, checkboxID FROM checkboxes WHERE id > ?",
          [socket.handshake.auth.serverOffset || 0],
          (_err, row) => {
            socket.emit("checked", row.checkboxID, row.isChecked, row.id);
          }
        );
      } catch (e) {
        // something went wrong
      }
    }
  });

  server.listen(3000, () => {
    console.log(`app running at http://localhost:3000`);
  });
}

main();
