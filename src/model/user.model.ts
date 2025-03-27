import mongoose from "mongoose";
const UserSchema = new mongoose.Schema({
  userId: String,
  email: String,
  givenName: String,
  familyName: String,
  name: String,
  photo: String,
  access_token: String,
  refresh_token: String,
  expiry_date: Number,
  expenses: [
    {
      id: String,
      month: String,
      head: String,
      amount: Number,
      icon: String,
      type: {
        type: String,
        enum: [
          "food",
          "rent",
          "travel",
          "utility",
          "entertainment",
          "shopping",
          "health",
          "education",
          "gift",
          "fitness",
          "investment",
          "unknown",
        ],
      },
      time: Date,
    },
  ],
});

export const UserModel = mongoose.model("User", UserSchema);