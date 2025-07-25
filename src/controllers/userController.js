const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

const userController = {
  async getProfile(req, res) {
    try {
      const userId = req.params.id;
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });
      if (!user) {
        return res.status(404).json({ message: "User not found." });
      }
      res.status(200).json({ user });
    } catch (error) {
      console.error("Error during user by id:", error);
      res
        .status(500)
        .json({ message: "An unexpected error occurred during user by id." });
    }
  },

  async editProfile(req, res) {
    try {
      const userId = req.params.id;
      const { name, email, age, bodyweight, bmi } = req.body;

      const updateData = {};
      if (name !== undefined) updateData.name = name;
      if (email !== undefined) updateData.email = email;

      if (age !== undefined) {
        if (typeof age === "number" && !isNaN(age)) {
          updateData.age = age;
        } else if (age === null || age === "") {
          updateData.age = null;
        } else {
          return res
            .status(400)
            .json({ message: "Age must be a number or null." });
        }
      }

      // Handle bodyweight and bmi: ensure they are numbers or null
      if (bodyweight !== undefined) {
        if (typeof bodyweight === "number" && !isNaN(bodyweight)) {
          updateData.bodyweight = bodyweight;
        } else if (bodyweight === null || bodyweight === "") {
          updateData.bodyweight = null;
        } else {
          return res
            .status(400)
            .json({ message: "Bodyweight must be a number or null." });
        }
      }

      if (bmi !== undefined) {
        if (typeof bmi === "number" && !isNaN(bmi)) {
          updateData.bmi = bmi;
        } else if (bmi === null || bmi === "") {
          updateData.bmi = null;
        } else {
          return res
            .status(400)
            .json({ message: "BMI must be a number or null." });
        }
      }

      if (req.body.password !== undefined) {
        return res
          .status(400)
          .json({ message: "Password cannot be updated via this endpoint." });
      }

      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: updateData,
        select: {
          id: true,
          name: true,
          email: true,
          age: true,
          bodyweight: true,
          bmi: true,
          updatedAt: true,
        },
      });

      res.status(200).json({
        message: "Profile updated successfully.",
        user: updatedUser,
      });
    } catch (error) {
      console.error("Error updating user profile:", error);
      if (error.code === "P2002" && error.meta?.target?.includes("email")) {
        return res.status(409).json({
          message: "This email is already in use by another account.",
        });
      }
      return res.status(500).json({
        message: "An unexpected error occurred while updating profile.",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  },
};

module.exports = userController;
