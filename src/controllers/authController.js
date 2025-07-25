const { PrismaClient } = require("@prisma/client");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const JWT_SECRET = process.env.JWT_SECRET;
const nodemailer = require("nodemailer");

const prisma = new PrismaClient();

const userManagement = {
  async register(req, res) {
    try {
      const { name, email, age, password } = req.body;

      if (!prisma.user) {
        return res.status(500).json({
          message: "Database client not properly initialized",
        });
      }

      const existingUser = await prisma.user.findUnique({
        where: { email },
      });

      if (existingUser) {
        return res.status(400).json({
          message: "User with this email already exists",
        });
      }

      const hashedPassword = crypto
        .createHash("sha256")
        .update(password)
        .digest("hex");

      const user = await prisma.user.create({
        data: {
          name,
          email,
          age,
          password: hashedPassword,
        },
      });

      return res.status(201).json({
        message: "User registered successfully",
        user,
      });
    } catch {}
  },
};

module.exports = userManagement;
