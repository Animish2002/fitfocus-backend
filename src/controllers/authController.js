const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const prisma = new PrismaClient();

const authController = {
  async register(req, res) {
    try {
      const { name, email, age, password } = req.body;

      if (!email || !password) {
        return res
          .status(400)
          .json({ message: "Email and password are required." });
      }

      const existingUser = await prisma.user.findUnique({
        where: { email },
      });

      if (existingUser) {
        return res.status(400).json({
          message: "User with this email already exists.",
        });
      }

      const salt = await bcrypt.genSalt(10); // Generate a salt
      const hashedPassword = await bcrypt.hash(password, salt); // Hash the password

      const userData = {
        name,
        email,
        password: hashedPassword,
      };

      if (typeof age === "number" && !isNaN(age)) {
        userData.age = age;
      } else if (age !== undefined && age !== null && age !== "") {
        console.warn(`Received non-numeric age for user ${email}: ${age}`);
      }

      const user = await prisma.user.create({
        data: userData,
      });

      const token = jwt.sign(
        { userId: user.id, email: user.email },
        process.env.JWT_SECRET,
        {
          expiresIn: "1h",
        }
      );

      return res.status(201).json({
        message: "User registered successfully",
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          age: user.age,
        },
        token,
      });
    } catch (error) {
      console.error("Error during user registration:", error);
      return res.status(500).json({
        message:
          "An unexpected error occurred during registration. Please try again.",
        error: error.message,
      });
    }
  },

  async login(req, res) {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res
          .status(400)
          .json({ message: "Email and password are required." });
      }

      const user = await prisma.user.findUnique({
        where: { email },
      });

      if (!user) {
        return res.status(401).json({ message: "Invalid credentials." });
      }

      const isPasswordValid = await bcrypt.compare(password, user.password);

      if (!isPasswordValid) {
        return res.status(401).json({ message: "Invalid credentials." });
      }

      const token = jwt.sign(
        { userId: user.id, email: user.email },
        process.env.JWT_SECRET,
        {
          expiresIn: "1h",
        }
      );

      res.status(200).json({
        message: "Logged in successfully",
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
        },
        token,
      });
    } catch (error) {
      console.error("Error during login:", error);
      res
        .status(500)
        .json({ message: "An unexpected error occurred during login." });
    }
  },

  async logout(req, res) {
    try {
      res.status(200).json({ message: "Logged out successfully" });
    } catch (error) {
      console.error("Error during logout:", error);
      res
        .status(500)
        .json({ message: "An unexpected error occurred during logout." });
    }
  },


};

module.exports = authController;
