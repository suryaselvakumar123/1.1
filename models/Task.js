
const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema({
  task: { type: String, required: true },
  priority: { type: String, required: true },
  dueDate: { type: Date, required: true },
  notes: { type: String, required: false },
  file: { type: String, required: false },

});

module.exports = mongoose.model('Task', taskSchema);
