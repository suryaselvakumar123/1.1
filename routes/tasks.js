const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Task = require('../models/Task');
const nodemailer = require('nodemailer');
const moment = require('moment');
const cron = require('node-cron');
const router = express.Router();
require('dotenv').config();


const transporter = nodemailer.createTransport({
  host: 'smtp.mailgun.org',
  port: 587,
  auth: {
    user: process.env.MAILGUN_USER,  
    pass: process.env.MAILGUN_PASS,  
  }
});


const sendTaskEmail = async (action, taskDetails) => {
  const mailOptions = {
    from: process.env.EMAIL_FROM,
    to: process.env.EMAIL_TO,
    subject: `Task ${action.charAt(0).toUpperCase() + action.slice(1)} Notification`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Task ${action.charAt(0).toUpperCase() + action.slice(1)} Notification</h2>
        <div style="background-color: #f4f4f4; padding: 15px; border-radius: 5px;">
          <p><strong>Task:</strong> ${taskDetails.task}</p>
          <p><strong>Priority:</strong> ${taskDetails.priority}</p>
          <p><strong>Due Date:</strong> ${moment(taskDetails.dueDate).format('MMMM Do, YYYY h:mm A')}</p>
          ${taskDetails.notes ? `<p><strong>Notes:</strong> ${taskDetails.notes}</p>` : ''}
          <p><strong>Action:</strong> ${action.toUpperCase()}</p>
        </div>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Email sent for ${action} task`);
  } catch (error) {
    console.error(`Error sending email for ${action} task:`, error);
  }
};


const scheduleTaskReminders = (taskDetails) => {
  const dueDate = moment(taskDetails.dueDate);
  const now = moment();

  
  const oneHourBefore = dueDate.clone().subtract(1, 'hours');
  const twentyFourHoursBefore = dueDate.clone().subtract(24, 'hours');

  const toCronExpression = (time) => {
    
    if (time.isAfter(now)) {
      return `${time.minutes()} ${time.hours()} ${time.date()} ${time.month() + 1} *`;
    }
    return null;
  };


  const oneHourCron = toCronExpression(oneHourBefore);
  const twentyFourHourCron = toCronExpression(twentyFourHoursBefore);

  if (oneHourCron) {
    cron.schedule(oneHourCron, async () => {
      try {
        await sendTaskEmail('reminder', taskDetails);
        console.log(`Reminder email sent for task: ${taskDetails.task} (1 hour before due date)`);
      } catch (error) {
        console.error(`Error sending reminder for task ${taskDetails.task} (1 hour before due date):`, error);
      }
    });
  }

  if (twentyFourHourCron) {
    cron.schedule(twentyFourHourCron, async () => {
      try {
        await sendTaskEmail('reminder', taskDetails);
        console.log(`Reminder email sent for task: ${taskDetails.task} (24 hours before due date)`);
      } catch (error) {
        console.error(`Error sending reminder for task ${taskDetails.task} (24 hours before due date):`, error);
      }
    });
  }
};

const uploadsDir = './uploads';
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

const upload = multer({ storage });


router.post('/', upload.single('file'), async (req, res) => {
  const { task, priority, dueDate, notes, reminderEmail } = req.body;
  const file = req.file ? req.file.path : null;

  const newTask = new Task({
    task,
    priority,
    dueDate,
    notes,
    file,
    reminderEmail,
  });

  try {
    const savedTask = await newTask.save();

    
    setImmediate(async () => {
      try {
        await sendTaskEmail('added', savedTask);
        scheduleTaskReminders(savedTask);
      } catch (error) {
        console.error('Error processing task notifications and reminders:', error);
      }
    });

    console.log('Task saved:', savedTask);
    res.status(201).json(savedTask);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});


router.put('/:id', upload.single('file'), async (req, res) => {
  const { id } = req.params;
  const { task, priority, dueDate, notes, reminderEmail } = req.body;
  const file = req.file ? req.file.path : null;

  try {
    const existingTask = await Task.findById(id);

    const updatedTask = await Task.findByIdAndUpdate(
      id,
      {
        task: task || existingTask.task,
        priority: priority || existingTask.priority,
        dueDate: dueDate || existingTask.dueDate,
        notes: notes || existingTask.notes,
        file: file || existingTask.file,
        reminderEmail: reminderEmail || existingTask.reminderEmail,
      },
      { new: true }
    );

    
    if (dueDate) {
      setImmediate(async () => {
        try {
          await sendTaskEmail('updated', updatedTask);
          scheduleTaskReminders(updatedTask);
        } catch (error) {
          console.error('Error processing task update notifications:', error);
        }
      });
    }

    res.json(updatedTask);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});


router.get('/', async (req, res) => {
  try {
    const tasks = await Task.find();
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


router.get('/:date', async (req, res) => {
  const { date } = req.params;
  try {
    const tasks = await Task.find({ dueDate: date });
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const deletedTask = await Task.findById(id);
    await Task.findByIdAndDelete(id);

   
    setImmediate(async () => {
      try {
        await sendTaskEmail('deleted', deletedTask); 
      } catch (error) {
        console.error('Error processing task deletion notification:', error);
      }
    });

    res.status(204).json({ message: 'Task deleted' });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

module.exports = router;
