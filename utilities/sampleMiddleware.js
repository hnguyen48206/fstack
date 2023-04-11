module.exports = function (options) {
    return function (req, res, next) {
      // Implement the middleware function based on the options object
      try{
        console.log(options);
      }catch{
        throw new Error('Error')
      }
      next()
    }
  }