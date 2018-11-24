'use strict';

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

var MessageSchema = new Schema({
  payload: String,
  resources: [{ type: Schema.Types.ObjectId, ref: 'Resource' }],
  sender: { type: Schema.Types.ObjectId, ref: 'User' },
  recipient: { type: Schema.Types.ObjectId, ref: 'User' }
});

module.exports = mongoose.model('Message', MessageSchema);
