const express = require("express");
const { createServer } = require("node:http");
const { join } = require("node:path");
const { Server } = require("socket.io");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");

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

  app.get("/", (req, res) => {
    res.sendFile(join(__dirname, "index.html"));
  });

  io.on("connection", async (socket) => {
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
      io.emit("checked", id, checked, result.lastID);
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
