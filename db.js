const sqlite3 = require("sqlite3").verbose();
const path = require("path");

// Ruta absoluta a sessions.db
const dbPath = path.join(__dirname, "sessions.db");

// Crea una nueva instancia de la base de datos
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("Error al conectar con la base de datos:", err.message);
  } else {
    console.log("Conectado a la base de datos sessions.db");

    // Crear la tabla federated_credentials si no existe
    db.run(
      `CREATE TABLE IF NOT EXISTS federated_credentials (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL,
      provider TEXT NOT NULL,
      subject TEXT NOT NULL,
      UNIQUE (provider, subject)
    )`,
      (err) => {
        if (err) {
          console.error(
            "Error al crear la tabla federated_credentials:",
            err.message
          );
        } else {
          console.log("Tabla federated_credentials asegurada");
        }
      }
    );

    // Crear la tabla users si no existe
    db.run(
      `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL
    )`,
      (err) => {
        if (err) {
          console.error("Error al crear la tabla users:", err.message);
        } else {
          console.log("Tabla users asegurada");
        }
      }
    );
  }
});

module.exports = db;
