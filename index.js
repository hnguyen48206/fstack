require("dotenv").config();
const express = require('express');
var cors = require('cors')
var app = module.exports = express();
const bodyParser = require('body-parser');
const { errors } = require('celebrate');
var morgan = require("morgan");
var compression = require("compression");
var helmet = require("helmet");

//Routers
var home_router = require('./routers/home');
var email_router = require('./routers/email');

app.use(helmet()); //For extra network security
app.use(errors()); //For handling celebrate error
app.use(compression()); //For transport data compression
app.use(morgan("common")); //For logging
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use('/home',home_router);
app.use('/email',email_router);


var corsOptions = {
  "origin": "*",
  "methods": ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE"],
  "preflightContinue": false,
  "optionsSuccessStatus": 204
}
app.use(cors(corsOptions))
app.listen(process.env.PORT || 3000, () => {
  console.info('Server is running on PORT:', process.env.PORT || 3000);
});




