var express = require('express');
var router = express.Router()
const { celebrate, Joi } = require('celebrate');

router.use((req, res, next) => {
    next()
})
router.post('/emailValidate',
celebrate({
    body: Joi.object({
      email: Joi.string().required().email()
        })
  }),
async (req, res, next) => {
    const postData = req.body;
    res.send(`This email is valid ${postData.email}`);
});
module.exports = router
