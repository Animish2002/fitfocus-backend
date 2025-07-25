const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT;

// Middleware
app.use(
  cors({
    // origin: "http://localhost:5173/", // Allow only this domain
    // methods: "GET,POST,PUT,DELETE", // Specify allowed HTTP methods
    // credentials: true, // Allow credentials (cookies, authorization headers, etc.)
  })
);

app.use(express.json());

app.get("/", (req, res) => {
  res.send("API is running...");
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
//Animish@0602
