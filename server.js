require('dotenv').config();

require('./passport');
require('./database');

const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const passport = require('passport');
const AWS = require('aws-sdk');
const crypto = require('crypto');

const User = require('./model/user');
const Resource = require('./model/resource');
const Message = require('./model/message');

// Set up AWS

AWS.config = new AWS.Config();
AWS.config.accessKeyId = process.env.AWS_ACCESS_KEY_ID;
AWS.config.secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
AWS.config.apiVersions = {
  "s3": "2006-03-01"
}

var s3 = new AWS.S3();

var app = express();

app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));
app.use(bodyParser.json({extended: true, limit: '50mb'}));
app.use(passport.initialize());

app.get('/messages',
        passport.authenticate('jwt', {session: false}),
        function(req, res) {
  console.log("Getting messages for user: ", req.user);
  Message.find({ recipient: req.user._id }, function(err, messages) {
    if (err) {
      console.log(err);
      res.status(500).send("Error retrieving messages");
    } else {
      res.status(200).json(messages);
    }
  });
});

app.post('/messages',
         passport.authenticate('jwt', {session: false}),
         function(req, res) {
  User.findOne({ username: req.body.recipient }, function(err, recipient) {
    if (err) {
      console.log(err);
      res.status(500).send("Couldn't get user by name");
    } else {
      console.log("message recipient: ", recipient)
      Message.create({
        sender: req.user._id,
        recipient: recipient._id,
        payload: req.body.payload,
        resources: req.body.resourceIds
      }, function(err, message) {
        if (err) {
          console.log(err);
          res.status(500).send("Error creating message");
        } else {
          res.status(201).json(message);
        }
      });
    }
  });

});

app.delete('/messages/:messageId',
passport.authenticate('jwt', {session: false}),
function(req, res) {
  Message.findById(req.params.messageId, function(err, message) {
    if(err) {
      console.log(err);
      res.status(500).send("Error retrieving specified message");
    } else {
      var isAuthorized = false;
      var authorizedDeleters = [];
      authorizedDeleters.push(message.recipient);
      authorizedDeleters.push(message.sender);
      for (var i=0; i < authorizedDeleters.length; i++) {
        if (req.user._id.equals(authorizedDeleters[i])) {
          isAuthorized = true;
        }
      }
      if (!isAuthorized) {
        res.status(401).send("Unauthorized");
      }
      Message.deleteOne({ _id: message._id }, function(err) {
        if (err) {
          console.log(err);
          res.status(500).send("Error deleting specified message");
        } else {
          res.status(200).json({success: true});
        }
      });
    }
  });
});

app.get('/messages/:messageId/resources',
        passport.authenticate('jwt', {session: false}),
        function(req, res) {
  Message.findById(req.params.messageId, function(err, message) {
    if (err) {
      console.log(err);
      res.status(500).send("Error finding that message");
    } else if (!(req.user._id.equals(message.recipient))) {
      res.status(401).send("Unauthorized");
    } else {
      Resource.find({"_id": { "$in": message.resources}}, function(resourceErr, resources) {
        if (resourceErr) {
          console.log("resourceError");
          res.status(500).send("Error retrieiving resources for message");
        } else {
          var s3Promises = [];
          for (var i=0; i < resources.length; i++) {
            var resource = resources[i]
            console.log(resource);
            console.log(resource.key);
            var s3Promise = new Promise(function(resolve, reject) {
              var s3Params = {
                Bucket: 'drifter-images',
                Key: resource.key.toString()
              };
              s3.getObject(s3Params, function(err, data) {
                if (err) {
                  console.log("S3 DOWNLOAD ERROR: ", err);
                  reject("Resource download error: " + err.toString());
                } else {
                  resolve({resource: resource, data: data});
                }
              });  
            })
            s3Promises.push(s3Promise);
          }
          Promise.all(s3Promises).then(function(values) {
            resArr = [];
            for (var i=0; i < values.length; i++) {
              var value = values[i]
              resArr.push({resourceId: value.resource._id, data: value.data.Body.toString()});
            }
            res.status(200).send(resArr);
          })
        }
      });
    }
  });
});

app.post('/resources',
         passport.authenticate('jwt', {session: false}),
         function(req, res) {
  console.log("in resource post!!")
  var data = req.body.data;
  const key = req.user._id + '-' + crypto.randomBytes(12).toString("hex");
  var s3Params = {
    'Bucket': 'drifter-images',
    'Key': key,
    'Body': data
  };
  s3.upload(s3Params, function(err, data) {
    if (err) {
      console.log("S3 UPLOAD ERROR: ", err);
      res.status(500).send("Resource Upload Error");
    } else {
      Resource.create({
        key: key,
        creator: req.user._id
      }, function(err, resource) {
        if (err) {
          console.log(err);
          res.status(500).send("Resource Creation Error");
        } else {
          res.status(200).json({success: true, resourceId: resource._id});
        }
      });
    }
  });
});

app.delete('/current-user',
            passport.authenticate('jwt', {session: false}),
            function(req, res) {
  res.json({ message: 'can\'t find current user'})
})

function signAndSendJWT(res, user) {
  var token = jwt.sign({id: user._id}, process.env.JWT_SECRET, {
    expiresIn: 60*60*24
  });
  console.log("Signing JWT for user: ", user);
  console.log("JWT: ", token);
  res.status(200).json({auth: true, token: token});
}

app.post('/login',
  passport.authenticate('local', {session: false}),
  function(req, res, next) {
    signAndSendJWT(res, req.user._id);
  }
)

app.post('/register', function(req, res) {
  var hashedPassword = bcrypt.hashSync(req.body.password, 12);
  User.create({
    username: req.body.username,
    password: hashedPassword
  }, function(err, user) {
    if (err) {
      console.log(err);
      var resCode = 500;
      var message = "Internal error registering user.";
      if (err.code == 11000) {
        resCode = 422
        message = "User already registered."
      }
      return res.status(resCode).send(message);
    } else {
      signAndSendJWT(res, user);
    }
  });
})

app.get('/users', function(req, res) {
  var usernameQuery = req.query.q;
  var dbQuery = {
    username: {$regex: usernameQuery, $options: "i"}
  };
  User.find(dbQuery, function(err, users) {
    if (err) {
      console.log(err);
      var resCode = 500;
      var message = "Internal error finding users."
      return res.status(resCode).send(message)
    } else {
      return res.status(200).json(users)
    }
  });
})

app.use(require('forest-express-mongoose').init({
  modelsDir: __dirname + '/model',
  envSecret: process.env.FOREST_ENV_SECRET,
  authSecret: process.env.FOREST_AUTH_SECRET,
  mongoose: mongoose
}));

var server = app.listen(3000, () => {
  console.log('server is running at:', server.address());
});
