'use strict';

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

var ResourceSchema = new Schema({
  key: String,
  creator: { type: Schema.Types.ObjectId, ref: 'User' }
});

module.exports = mongoose.model('Resource', ResourceSchema);
