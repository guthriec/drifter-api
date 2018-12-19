'use strict';

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

var UserSchema = new Schema({
  username: {
    type: String,
    unique: true,
    required: true,
    lowercase: true,
    trim: true,
    match: /([a-z0-9_\-.])+/,
    maxLength: 20
  },
  firstName: {
    type: String,
    default: "",
    maxLength: 20
  },
  lastName: {
    type: String,
    default: "",
    maxLength: 20
  },
  password: {
    type: String,
    required: true,
    select: false
  }
});

module.exports = mongoose.model('User', UserSchema);
