import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import nodemailer from 'nodemailer';
import { UserModel } from '../model';

// Interface for category-wise expense summary
interface CategoryExpenseSummary {
  category: string;
  totalAmount: number;
  count: number;
  expenses: Array<{
    id: string;
    head: string;
    amount: number;
    time: Date;
  }>;
}

/**
 * Get the current month name
 * @returns Current month name (e.g., "March")
 */
export const getCurrentMonth = (): string => {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const currentDate = new Date();
  return months[currentDate.getMonth()];
};

/**
 * Generate a category-wise expense report for a user for the current month
 * @param userId User ID
 * @returns Path to the generated PDF file
 */
export const generateExpenseReport = async (userId: string): Promise<string> => {
  try {
    // Find user and their expenses
    const user = await UserModel.findOne({ userId });
    if (!user) {
      throw new Error('User not found');
    }

    const currentMonth = getCurrentMonth();
    
    // Filter expenses for the current month
    const currentMonthExpenses = user.expenses.filter(expense => 
      expense.month === currentMonth
    );

    if (currentMonthExpenses.length === 0) {
      throw new Error(`No expenses found for ${currentMonth}`);
    }

    // Group expenses by category
    const categoryMap = new Map<string, CategoryExpenseSummary>();
    
    currentMonthExpenses.forEach(expense => {
      const category = expense.type;
      
      if (!categoryMap.has(category)) {
        categoryMap.set(category, {
          category,
          totalAmount: 0,
          count: 0,
          expenses: []
        });
      }
      
      const categoryData = categoryMap.get(category)!;
      categoryData.totalAmount += expense.amount;
      categoryData.count += 1;
      categoryData.expenses.push({
        id: expense.id,
        head: expense.head,
        amount: expense.amount,
        time: expense.time
      });
    });

    // Convert map to array and sort by total amount (descending)
    const categorySummaries = Array.from(categoryMap.values())
      .sort((a, b) => b.totalAmount - a.totalAmount);

    // Calculate total expense
    const totalExpense = categorySummaries.reduce(
      (sum, category) => sum + category.totalAmount, 0
    );

    // Create PDF document
    const doc = new PDFDocument({ margin: 50 });
    
    // Create directory for reports if it doesn't exist
    const reportsDir = path.join(process.cwd(), 'reports');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir);
    }
    
    const fileName = `${user.name.replace(/\s+/g, '_')}_${currentMonth}_Expense_Report.pdf`;
    const filePath = path.join(reportsDir, fileName);
    
    // Pipe PDF to file
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);
    
    // Add content to PDF
    doc.fontSize(25).text(`${currentMonth} Expense Report`, { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Generated for: ${user.name} (${user.email})`, { align: 'center' });
    doc.moveDown();
    doc.fontSize(14).text(`Total Expense: $${totalExpense.toFixed(2)}`, { align: 'center' });
    doc.moveDown(2);
    
    // Add category-wise summary
    doc.fontSize(16).text('Category-wise Summary', { underline: true });
    doc.moveDown();
    
    categorySummaries.forEach((category, index) => {
      doc.fontSize(14).text(`${index + 1}. ${category.category.charAt(0).toUpperCase() + category.category.slice(1)}`);
      doc.fontSize(12).text(`Total: $${category.totalAmount.toFixed(2)} (${category.count} expenses)`);
      doc.moveDown();
      
      // Add table header
      doc.fontSize(10);
      doc.text('Description', 50, doc.y, { width: 200 });
      doc.text('Amount', 250, doc.y, { width: 100 });
      doc.text('Date', 350, doc.y, { width: 150 });
      doc.moveDown(0.5);
      
      // Add a line
      doc.moveTo(50, doc.y)
         .lineTo(550, doc.y)
         .stroke();
      doc.moveDown(0.5);
      
      // Add expense details
      category.expenses.forEach(expense => {
        const date = new Date(expense.time).toLocaleDateString();
        doc.text(expense.head, 50, doc.y, { width: 200 });
        doc.text(`$${expense.amount.toFixed(2)}`, 250, doc.y, { width: 100 });
        doc.text(date, 350, doc.y, { width: 150 });
        doc.moveDown();
      });
      
      doc.moveDown();
    });
    
    // Finalize PDF
    doc.end();
    
    return new Promise((resolve, reject) => {
      stream.on('finish', () => {
        resolve(filePath);
      });
      
      stream.on('error', (err) => {
        reject(err);
      });
    });
    
  } catch (error) {
    console.error('Error generating expense report:', error);
    throw error;
  }
};

/**
 * Send expense report via email
 * @param userId User ID
 * @param email Email address to send the report to
 * @returns Object containing success status and message
 */
export const sendExpenseReportByEmail = async (
  userId: string, 
  email?: string
): Promise<{ success: boolean; message: string; filePath?: string }> => {
  try {
    // Generate the expense report
    const filePath = await generateExpenseReport(userId);
    
    // Get user info
    const user = await UserModel.findOne({ userId });
    if (!user) {
      throw new Error('User not found');
    }
    
    // Use provided email or default to user's email
    const recipientEmail = email || user.email;
    if (!recipientEmail) {
      throw new Error('No email address provided');
    }
    
    const currentMonth = getCurrentMonth();
    
    // Create email transporter
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER || 'your-email@gmail.com',
        pass: process.env.EMAIL_PASSWORD || 'your-app-password'
      }
    });
    
    // Email content
    const mailOptions = {
      from: process.env.EMAIL_USER || 'your-email@gmail.com',
      to: recipientEmail,
      subject: `${currentMonth} Expense Report - Expensely`,
      text: `Dear ${user.name},\n\nPlease find attached your expense report for ${currentMonth}.\n\nRegards,\nExpensely Team`,
      attachments: [
        {
          filename: path.basename(filePath),
          path: filePath
        }
      ]
    };
    
    // Send email
    await transporter.sendMail(mailOptions);
    
    return {
      success: true,
      message: `Expense report sent to ${recipientEmail}`,
      filePath
    };
    
  } catch (error: any) {
    console.error('Error sending expense report by email:', error);
    return {
      success: false,
      message: error.message || 'Failed to send expense report'
    };
  }
};
