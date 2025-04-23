import mongoose from "mongoose";

const ReceiptSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true
  },
  imageUrl: {
    type: String,
    required: true
  },
  date: {
    type: Date,
    default: Date.now
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

export const ReceiptModel = mongoose.model("Receipt", ReceiptSchema);
