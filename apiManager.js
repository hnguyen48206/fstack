var express = require('express');
var router = express.Router()
const news_scraper = require('./news_scraper.js')
const { v4: uuidv4 } = require('uuid');
const emailValidator = require("email-validator");


router.use((req, res, next) => {
    next()
})

router.get('/news', (req, res, next) => {
    news_scraper.getNews('https://tuoitre.vn/tin-moi-nhat.htm').then(result => {
        res.send(result)
    }).catch(err => {
        console.log(err)
        res.send('Failed to get news')
    })
})

router.post('/thaibinhnews/:type', (req, res, next) => {
    if (req.params.type == 'general' || req.params.type == 'medic' || req.params.type == 'edu') {
        news_scraper.getThaibinhNews(req.params.type).then(result => {
            res.status(200).json({ data: result })
        }).catch(err => {
            console.log(err)
            res.status(500).send('Failed to get news')
        })
    }
    else
        res.status(500).send('News type is not valid')
})

router.post('/songcongnews/:type', (req, res, next) => {
    if (req.params.type == 'general' || req.params.type == 'medic' || req.params.type == 'edu') {
        news_scraper.getSongCongNews(req.params.type).then(result => {
            res.status(200).json({ data: result })
        }).catch(err => {
            console.log(err)
            res.status(500).send('Failed to get news')
        })
    }
    else
        res.status(500).send('News type is not valid')
})

router.post('/caobangnews/:type', (req, res, next) => {
    if (req.params.type == 'general') {
        news_scraper.getCaoBangNews(req.params.type).then(result => {
            res.status(200).json({ data: result })
        }).catch(err => {
            console.log(err)
            res.status(500).send('Failed to get news')
        })
    }
    else
        res.status(500).send('News type is not valid')
})

router.get('/news/:page', (req, res, next) => {
    console.log(req.params.page)
    if (Number.isInteger(parseInt(req.params.page))) {
        news_scraper.getMoreNews('https://tuoitre.vn/timeline/0/trang-' + req.params.page + '.htm').then(result => {
            res.send(result)
        }).catch(err => {
            console.log(err)
            res.send('Failed to get more news')
        })
    }
    else {
        res.send('Page number is not valid')
    }
})

router.post('/emailValidate', async (req, res, next) => {
    const postData = req.body;
    if (postData.email) {
        console.info('/emailValidate call success ');
        res.json({ 'status': emailValidator.validate(postData.email) });
    } else {
        console.warn('/emailValidate wrong input ');
        res.status(500).json({ 'status': 'wrong input' });
    }
});


/////////////////////////////////////////////// CronJob scheduler////////////////////////////////
const { ToadScheduler } = require('toad-scheduler')
const cronJobsManager = require('./cronjobsMangers.js')
// A Middleware to handle cronjib
const scheduler = new ToadScheduler()

router.post('/setAutoNewsScrapping', async (req, res, next) => {
    const postData = req.body;
    postData['jobID'] = uuidv4();
    console.log(postData.jobID)
    cronJobsManager.autoNewsScrappingtoDBEvery(postData, scheduler).then(result => {
        res.status(200).send('Set cron job ' + postData.jobID + ' OK')
    })
        .catch(err => {
            res.status(500).send('Set cron job ' + postData.jobID + ' Fail')
        })
});

router.get('/removeCronJob/:jobID', (req, res, next) => {
    if (cronJobsManager.cancelCronJob(req.params.jobID, scheduler))
        res.status(200).send('Remove cron job ' + req.params.jobID + ' OK')
    else
        res.status(500).send('Remove cron job ' + req.params.jobID + ' Fail')
})

//create another express app just for proxy processing
// const appProxy = express()
// const { createProxyMiddleware } = require('http-proxy-middleware');

// appProxy.use('*', createProxyMiddleware({ target: 'http://thainguyen.edu.vn/', changeOrigin: true }));

// appProxy.listen(3500);

// const proxyTable = {
//   'edu.localhost:3500': 'http://thainguyen.edu.vn', 
//   'general.localhost:3500': 'http://songcong.thainguyen.gov.vn', 
//   'medic.localhost:3500': 'http://soytethainguyen.gov.vn',
// };

// const options = {
//   target: 'http://localhost:3500',
//   router: proxyTable,
//   changeOrigin: true
// };

// const proxyserver = createProxyMiddleware(options);
// appProxy.use(proxyserver)
// appProxy.listen(3500)



///////////////////////////////MongoDBtest///////////////////////////////////////


const dbManager = require('./mongoDB/connectionManager.js')
//busboy is a middleware to handle parsing data sent through multipart form-data
const Busboy = require('busboy');
const { ObjectID } = require('bson');
global.gfs = null
global.dbClient = null
global.startDBConnection = () => {
    dbManager.dbConnectionInit().then(client => {
        // res is DB client
        dbClient = client
        dbManager.gridFsInit(client).then(res => {
            gfs = res
        }).catch(err => { console.log(err) })
    })
        .catch(err => {
            DBError = err
            console.log(err)
        });
}


//////////////////////////////////////////GRID Fs operations///////////////////////////////
router.post('/uploadfile', function (req, res) {

    var busboy = new Busboy({ headers: req.headers });

    busboy.on('file', function (fieldname, file, filename, encoding, mimetype) {
        console.log('got file', filename, mimetype, encoding);
        var writeStream
        try {
            writeStream = gfs.createWriteStream({
                filename: filename,
                content_type: mimetype,
            });
        } catch (error) {
            console.log(error)
        }
        if (writeStream != null) {
            writeStream.on('close', (file) => {
                //All the info of the uploaded file has been return. Storing the fileID to your data model for later use. 
                console.log(file)
            });
            file.pipe(writeStream);
        }
    }).on('finish', function () {
        // show a link to the uploaded file
        res.status(200).send('uploaded successfully');
    });
    req.pipe(busboy);
});

router.get('/downloadFileByFileName/:filename', function (req, res) {
    //download file using file name. 
    let filename = req.params.filename
    console.log('filename:' + filename)
    gfs.exist({ filename: filename }, (err, file) => {
        if (err || !file) {
            res.status(404).send('File Not Found');
            return
        }
        var readstream = gfs.createReadStream({ filename: filename });
        readstream.pipe(res);
    });
});

router.get('/downloadFileByFileID/:fileID', function (req, res) {
    //download file using file name. 
    var file_id = req.params.fileID;

    gfs.files.find({ _id: new ObjectID(file_id) }).toArray(function (err, files) {
        if (err) {
            res.json(err);
        }
        if (files.length > 0) {
            var mime = files[0].contentType;
            var filename = files[0].filename;
            res.set('Content-Type', mime);
            // res.set('Content-Disposition', "inline; filename=" + filename);
            var read_stream = gfs.createReadStream({ _id: file_id });
            read_stream.pipe(res);
        } else {
            res.status(404).json('File Not Found');
        }
    });
});

router.get('/deleteFileByFileID/:fileID', function (req, res) {
    //download file using file name. 
    var file_id = req.params.fileID;
    gfs.remove({ _id: new ObjectID(file_id) }, (err, gridStore) => {
        if (err) {
            res.status(404).send('File Not Found');
            return
        }
        else {
            res.status(200).send('File ID:' + file_id + 'has been removed from Database');
        }
    });
});

router.get('/manuallyTriggerDatabaseConnection', function (req, res) {

    // This api is used in cased you need to start or restart connection to mongoDB. And even a sleeping cloud server.
    dbManager.dbConnectionInit().then(client => {
        dbClient = client;
        dbManager.gridFsInit(client).then(res => {
            gfs = res
        }).catch(err => { console.log(err) })
        res.status(200).send('DB kết nối ổn')

    })
        .catch(err => {
            console.log(err)
            res.status(500).json({ errorMessage: 'Fail' })
        });

});

module.exports = router