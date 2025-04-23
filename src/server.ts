import express, { Request, Response } from "express";
import pkg from "body-parser";
import "dotenv/config";
const { json, urlencoded } = pkg;
import cors from "cors";
import { google } from "googleapis";

import * as db from "./model";
import { v4 as uuidv4 } from "uuid";
import mongoose from "mongoose";

const app = express();

const PORT = 8080;
const DB_URL =
  `${process.env.DB_HOST}/?retryWrites=true&w=majority&appName=Sandbox`;
  
db.mongoose
  .connect(DB_URL, {
    dbName: "expensely",
    useBigInt64: true,
  })
  .then(() => {
    console.log("Connected to the database!");
  })
  .catch((err) => {
    console.log("Cannot connect to the database!", err);
    process.exit();
  });

app.get("/ping", (req: Request, res: Response) => {
  res.json({ greeting: "Server Is In Good Health!" });
});

app.listen(PORT, () => {
  console.log(
    `🚀 server started at http://localhost:${PORT}, ${process.env.JWT_TOKEN_SECRET}`
  );
  
  // Initialize email cron job
  initializeEmailCronJob().then(() => {
    console.log("Email cron job initialized");
  }).catch((err) => {
    console.error("Failed to initialize email cron job:", err);
  });
});

app.use(json());
app.use(cors());
app.use(urlencoded({ extended: true }));
import { handleGetInvoiceData } from "./utility/getInvoiceData";
import { handleGetEmailExpense } from "./utility/getEmailExpense";
import { initializeEmailCronJob } from "./utility/cronScheduler";
import { generateExpenseReport, sendExpenseReportByEmail, getCurrentMonth } from "./utility/expenseReport";
import { UserModel, ReceiptModel } from "./model";

app.post("/invoice", async (req: Request, res: Response) => {
  try {
    const imageUrl = req.body.imageURL;
    const userId = req.body.userId;
    
    // Process the invoice to get data
    const invoiceData = await handleGetInvoiceData(imageUrl);
    
    // If userId is provided, store the image URL in receipts
    if (userId) {
      // Check if user exists
      const user = await UserModel.findOne({ userId });
      if (user) {
        // Create new receipt with just the image URL
        const newReceipt = new ReceiptModel({
          userId,
          imageUrl,
          date: new Date()
        });
        
        // Save receipt to database
        await newReceipt.save();
        
        // Add receipt info to the response
        invoiceData.receipt = {
          id: newReceipt._id.toString(),
          imageUrl: newReceipt.imageUrl,
          date: newReceipt.date
        };
      }
    }
    
    res.json(invoiceData);
  } catch (error: any) {
    console.error("Error processing invoice:", error);
    res.status(500).json({
      error: "Failed to process invoice",
      message: error.message
    });
  }
});

app.post("/email-expense", async (req: Request, res: Response) => {
  try {
    const { emailText } = req.body;
    if (!emailText) {
      return res.status(400).json({ error: "Email text is required" });
    }

    const expenseData = await handleGetEmailExpense(emailText);
    res.json(expenseData);
  } catch (error) {
    console.error("Error processing email expense:", error);
    res.status(500).json({ error: "Failed to process email expense" });
  }
});

// User Schema


// Google OAuth2 client setup
const auth_ = new google.auth.OAuth2(
  process.env.CLIENT_ID ,
  process.env.CLIENT_SECRET ,
  process.env.REDIRECT_URI
);



// Register or update user
app.post("/user", async (req, res) => {
  try {
    const { id, email, givenName, familyName, name, photo, serverAuthCode } =
      req.body;
      console.log(req.body);

    if (!id || !email || !serverAuthCode) {
      return res
        .status(400)
        .json({ error: "User ID, email, and server auth code are required" });
    }

    // Exchange auth code for tokens
    const { tokens } = await auth_.getToken(serverAuthCode);

    // Find existing user or create new one
    let user = await UserModel.findOne({ userId: id });

    if (!user) {
      user = new UserModel({
        userId: id,
        email,
        givenName,
        familyName,
        name,
        photo,
        expenses: [],
      });
    } else {
      // Update user info
      user.email = email;
      user.givenName = givenName;
      user.familyName = familyName;
      user.name = name;
      user.photo = photo;
    }

    // Update tokens
    user.access_token = tokens.access_token;
    user.refresh_token = tokens.refresh_token;
    user.expiry_date = tokens.expiry_date;

    await user.save();

    res.json({
      user: {
        id: user.userId,
        email: user.email,
        givenName: user.givenName,
        familyName: user.familyName,
        name: user.name,
        photo: user.photo,
      },
      tokens: {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expiry_date: tokens.expiry_date,
      },
    });
  } catch (error) {
    console.error("Error creating/updating user:", error);
    res.status(500).json({ error: "Failed to create/update user" });
  }
});

// Add expense
app.post("/expense", async (req, res) => {
  try {
    const { userId, month, head, amount, icon, type, time } = req.body;

    if (!userId || !month || !head || !amount || !type || !time) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const user = await UserModel.findOne({ userId });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const newExpense = {
      id: uuidv4(),
      month,
      head,
      amount,
      icon,
      type,
      time: new Date(time),
    };

    user.expenses.push(newExpense);
    await user.save();

    res.json({ message: "Expense added", expense: newExpense });
  } catch (error) {
    console.error("Error adding expense:", error);
    res.status(500).json({ error: "Failed to add expense" });
  }
});

// Bulk add expenses
app.post("/expenses/bulk", async (req, res) => {
  try {
    const { userId, expenses } = req.body;

    console.log(req.body);

    if (!userId || !Array.isArray(expenses) || expenses.length === 0) {
      return res.status(400).json({ error: "User ID and non-empty expenses array are required" });
    }

    const user = await UserModel.findOne({ userId });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Validate each expense item
    const validExpenses = [];
    const invalidExpenses = [];

    for (const expense of expenses) {
      const { month, head, amount, icon, type, time } = expense;

      if (!month || !head || !amount || !type || !time) {
        invalidExpenses.push(expense);
        continue;
      }

      // Create new expense with UUID
      const newExpense = {
        id: uuidv4(),
        month,
        head,
        icon: icon || "",
        amount: Number(amount),
        type,
        time: new Date(time),
      };

      validExpenses.push(newExpense);
    }

    // Add valid expenses to user
    if (validExpenses.length > 0) {
      user.expenses.push(...validExpenses);
      await user.save();
    }

    res.json({
      message: `${validExpenses.length} expenses added successfully`,
      addedExpenses: validExpenses,
      failedExpenses: invalidExpenses,
      totalAdded: validExpenses.length,
      totalFailed: invalidExpenses.length
    });
  } catch (error) {
    console.error("Error bulk adding expenses:", error);
    res.status(500).json({ error: "Failed to bulk add expenses" });
  }
});

// Get all expenses
app.get("/expenses/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { month = 'March', startDate, endDate } = req.query;

    console.log(`Fetching expenses for user: ${userId}${month ? `, month: ${month}` : ''}${startDate ? `, from: ${startDate}` : ''}${endDate ? `, to: ${endDate}` : ''}`);
    
    const user = await UserModel.findOne({ userId });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Create a copy of expenses to avoid modifying the original array
    let expensesToReturn = [...user.expenses];
    
    // If date range is provided, filter expenses by date range
    if (startDate || endDate) {
      const start = startDate ? new Date(startDate as string).getTime() : 0;
      const end = endDate ? new Date(endDate as string).getTime() : Date.now();
      
      expensesToReturn = expensesToReturn.filter(expense => {
        const expenseTime = new Date(expense.time).getTime();
        return expenseTime >= start && expenseTime <= end;
      });
      
      console.log(`Filtered by date range: ${startDate || 'beginning'} to ${endDate || 'now'}, found ${expensesToReturn.length} expenses`);
    }
    // If only month is provided (and no date range), filter expenses by month
    else if (month && typeof month === 'string') {
      expensesToReturn = expensesToReturn.filter(expense => expense.month === month);
    }
    
    // Sort expenses by time in descending order (newest first)
    expensesToReturn.sort((a, b) => {
      const dateA = new Date(a.time).getTime();
      const dateB = new Date(b.time).getTime();
      return dateB - dateA; // Descending order (newest first)
    });
    
    // Return the sorted expenses
    res.json(expensesToReturn);
  } catch (error) {
    console.error("Error fetching expenses:", error);
    res.status(500).json({ error: "Failed to fetch expenses" });
  }
});

// Exchange auth code for tokens
app.post("/auth/token", async (req, res) => {
  try {
    const { authCode, userId } = req.body;

    if (!authCode || !userId) {
      return res.status(400).json({ error: "Auth code and user ID required" });
    }

    // Exchange auth code for tokens
    const { tokens } = await auth_.getToken(authCode);

    // Store tokens in DB
    await UserModel.findOneAndUpdate(
      { userId },
      {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expiry_date: tokens.expiry_date,
      },
      { upsert: true, new: true }
    );

    res.json({ message: "Tokens stored successfully", tokens });
  } catch (error) {
    console.error("Error getting tokens:", error);
    res.status(500).json({ error: "Failed to get tokens" });
  }
});

// Refresh access token
app.post("/auth/refresh", async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: "User ID required" });

    const user = await UserModel.findOne({ userId });
    if (!user || !user.refresh_token) {
      return res.status(400).json({ error: "Refresh token not found" });
    }

    auth_.setCredentials({ refresh_token: user.refresh_token });

    const { credentials } = await auth_.refreshAccessToken();

    await UserModel.findOneAndUpdate(
      { userId },
      {
        access_token: credentials.access_token,
        expiry_date: credentials.expiry_date,
      }
    );

    res.json({
      message: "Token refreshed",
      access_token: credentials.access_token,
    });
  } catch (error) {
    console.error("Error refreshing token:", error);
    res.status(500).json({ error: "Failed to refresh token" });
  }
});

// Update expense
app.put("/expense/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, month, head, amount, icon, type, time } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    const user = await UserModel.findOne({ userId });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Find the expense index in the user's expenses array
    const expenseIndex = user.expenses.findIndex(expense => expense.id === id);

    if (expenseIndex === -1) {
      return res.status(404).json({ error: "Expense not found" });
    }

    // Update the expense with new values, keeping existing values if not provided
    const updatedExpense = {
      id,
      month: month || user.expenses[expenseIndex].month,
      head: head || user.expenses[expenseIndex].head,
      amount: amount !== undefined ? amount : user.expenses[expenseIndex].amount,
      icon: icon !== undefined ? icon : user.expenses[expenseIndex].icon,
      type: type || user.expenses[expenseIndex].type,
      time: time ? new Date(time) : user.expenses[expenseIndex].time,
    };

    // Replace the old expense with the updated one
    user.expenses[expenseIndex] = updatedExpense;
    await user.save();

    res.json({ message: "Expense updated successfully", expense: updatedExpense });
  } catch (error) {
    console.error("Error updating expense:", error);
    res.status(500).json({ error: "Failed to update expense" });
  }
});

// Generate expense report PDF
app.get("/expense-report/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    const filePath = await generateExpenseReport(userId);
    
    // Send the file as a download
    res.download(filePath, (err) => {
      if (err) {
        console.error("Error sending file:", err);
        // Only send error if headers haven't been sent yet
        if (!res.headersSent) {
          res.status(500).json({ error: "Failed to send expense report" });
        }
      }
    });
  } catch (error: any) {
    console.error("Error generating expense report:", error);
    res.status(500).json({ 
      error: "Failed to generate expense report", 
      message: error.message 
    });
  }
});

// Send expense report by email
app.post("/expense-report/email", async (req, res) => {
  try {
    const { userId, email } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }
    
    const result = await sendExpenseReportByEmail(userId, email);
    
    if (result.success) {
      res.json({ 
        message: result.message,
        month: getCurrentMonth()
      });
    } else {
      res.status(400).json({ 
        error: "Failed to send expense report", 
        message: result.message 
      });
    }
  } catch (error: any) {
    console.error("Error sending expense report by email:", error);
    res.status(500).json({ 
      error: "Failed to send expense report", 
      message: error.message
    });
  }
});

// Get all invoice images for a user
app.get("/invoice-images/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    // Check if user exists
    const user = await UserModel.findOne({ userId });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Get all receipts for the user
    const receipts = await ReceiptModel.find({ userId }).sort({ date: -1 });

    // Extract just the image URLs and minimal info
    const invoiceImages = receipts.map(receipt => ({
      id: receipt._id.toString(),
      imageUrl: receipt.imageUrl,
      date: receipt.date
    }));

    res.json(invoiceImages);
  } catch (error: any) {
    console.error("Error fetching invoice images:", error);
    res.status(500).json({
      error: "Failed to fetch invoice images",
      message: error.message
    });
  }
});

// Delete expense
app.delete("/expense/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    const user = await UserModel.findOne({ userId });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Find the expense index
    const expenseIndex = user.expenses.findIndex(expense => expense.id === id);

    if (expenseIndex === -1) {
      return res.status(404).json({ error: "Expense not found" });
    }

    // Remove the expense from the array
    user.expenses.splice(expenseIndex, 1);
    await user.save();

    res.json({ message: "Expense deleted successfully", expenseId: id });
  } catch (error) {
    console.error("Error deleting expense:", error);
    res.status(500).json({ error: "Failed to delete expense" });
  }
});
