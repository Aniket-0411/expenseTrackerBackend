import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import { handleGetEmailExpense } from "./getEmailExpense";
import mongoose from "mongoose";

// Define a schema for tracking processed emails
interface ProcessedEmail {
  messageId: string;
  userId: string;
  processedAt: Date;
}

const ProcessedEmailSchema = new mongoose.Schema<ProcessedEmail>({
  messageId: { type: String, required: true },
  userId: { type: String, required: true },
  processedAt: { type: Date, default: Date.now },
});

// Create a compound index to ensure uniqueness of messageId per user
ProcessedEmailSchema.index({ messageId: 1, userId: 1 }, { unique: true });

const ProcessedEmailModel = mongoose.model<ProcessedEmail>(
  "ProcessedEmail",
  ProcessedEmailSchema
);

/**
 * Reads emails from a specific sender for a user
 * @param userId The user ID
 * @param auth OAuth2Client for authentication
 * @param fromEmail The email address to filter by(onlineSbiCard@sbicard.com, alerts@hdfc.com)
 * @param maxResults Maximum number of emails to fetch
 * @returns Array of processed email expenses
 */
export async function readEmailsFromSender(
  userId: string,
  auth: OAuth2Client,
  fromEmail: string = "onlinebanking@ealerts.bankofamerica.com,harbanstoor01@gmail.com",
  maxResults: number = 20
) {
  try {
    const gmail = google.gmail({ version: "v1", auth });

    // Format the email addresses for Gmail API query
    // Gmail API uses OR operator for multiple email addresses
    const emailAddresses = fromEmail.split(",").map((email) => email.trim());
    const emailQuery = emailAddresses
      .map((email) => `from:${email}`)
      .join(" OR ");

    // Query for emails from any of the specified senders
    const response = await gmail.users.messages.list({
      userId: "me",
      q: emailQuery,
      maxResults,
    });

    const messages = response.data.messages || [];
    console.log(
      `Found ${messages.length} emails from [${emailAddresses.join(", ")}]`
    );

    if (messages.length === 0) {
      return [];
    }

    const processedExpenses = [];

    for (const message of messages) {
      // Check if this email has already been processed
      const existingProcessed = await ProcessedEmailModel.findOne({
        messageId: message.id,
        userId,
      });

      if (existingProcessed) {
        console.log(`Email ${message.id} already processed, skipping`);
        continue;
      }
      try {
        // Get the full message
        const fullMessage = await gmail.users.messages.get({
          userId: "me",
          id: message.id as string,
        });

        // Extract email body
        const emailBody = extractEmailBody(fullMessage.data);

        console.log(`Processing email ${message.id}🍌🍌🍌🍌🍌🍌`, emailBody);

        if (emailBody) {
          try {
            // Process the email to extract expense data
            const expenseData = await handleGetEmailExpense(emailBody);

            // Mark as processed in database
            await new ProcessedEmailModel({
              messageId: message.id,
              userId,
              processedAt: new Date(),
            }).save();

            // // Mark the email as read
            // await gmail.users.messages.modify({
            //   userId: 'me',
            //   id: message.id as string,
            //   requestBody: {
            //     removeLabelIds: ['UNREAD']
            //   }
            // });

            // Add to results
            processedExpenses.push({
              messageId: message.id,
              expense: expenseData,
            });

            console.log(`Successfully processed email ${message.id}`);
            console.log(JSON.stringify(expenseData, null, 2));
          } catch (error) {
            console.error(`Error processing email ${message.id}:`, error);
          }
        }
      } catch (error) {
        console.error(`Error processing email📧❌🆔 ${message.id}:`, error);
      }
    }

    return processedExpenses;
  } catch (error) {
    console.error("Error reading emails:", error);
    throw error;
  }
}

/**
 * Extracts the email body from Gmail API response
 */
function extractEmailBody(message: any): string | null {
  console.log("Extracting email body", message);
  if (!message.payload) {
    return null;
  }

  // Check for plain text parts
  if (message.payload.parts) {
    for (const part of message.payload.parts) {
      if (part.mimeType === "text/plain" && part.body && part.body.data) {
        return Buffer.from(part.body.data, "base64").toString("utf-8");
      }
    }
  }

  // If no plain text found, try to get the body directly
  if (message.payload.body && message.payload.body.data) {
    return Buffer.from(message.payload.body.data, "base64").toString("utf-8");
  }

  // If still not found, try to recursively check nested parts
  if (message.payload.parts) {
    for (const part of message.payload.parts) {
      if (part.parts) {
        for (const nestedPart of part.parts) {
          if (
            nestedPart.mimeType === "text/plain" &&
            nestedPart.body &&
            nestedPart.body.data
          ) {
            return Buffer.from(nestedPart.body.data, "base64").toString(
              "utf-8"
            );
          }
        }
      }
    }
  }

  return null;
}
