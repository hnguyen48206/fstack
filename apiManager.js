var express = require('express');
var router = express.Router()
const news_scraper = require('./news_scraper.js')
const { v4: uuidv4 } = require('uuid');
const validator = require('validator');


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
        //Validator only takes string as an input param, so remember to convert everything to string first
        res.json({ 'status': validator.isEmail(postData.email + '') });
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
    //Limit file size to 6MB only and the maximum number of files is only one at a time
    var busboy = new Busboy({
        headers: req.headers, limits: {
            fileSize: 6 * 1024 * 1024,
            files:1
        }
    });

    var limit_reach = false;

    busboy.on('file', function (fieldname, file, filename, encoding, mimetype) {
        console.log('got file', filename, mimetype, encoding);
        //This is where you want to check filetype to make sure before going any further

        // If the file is larger than the set limit, then destroy the streaming
        //There is a bug in gridfs regarding Destroy method, workaround's here: https://github.com/aheckmann/gridfs-stream/issues/153
        file.on('limit', function () {            
            writeStream.destroy(new Error('Destroyed the stream cause File was too large'))
            limit_reach = true;
            res.status(500).send('Destroyed the stream cause File was too large');
        });

        var writeStream
        try {
            //Remove Vietnamese characters and spaces
            let nameAfterProcessed = removeAccents(filename).replace(/\s/g, "")
            console.log(nameAfterProcessed)

            writeStream = gfs.createWriteStream({
                filename: nameAfterProcessed,
                content_type: mimetype,
            });
        } catch (error) {
            console.log(error)
        }
        if (writeStream != null) {
            writeStream.on('error', (err) => {
                //This event will be fired after the stream has been destroyed and before emitting Close event below
                console.log(err)
            });
            writeStream.on('close', (file) => {
                //All the info of the uploaded file has been return (both in success or fail)
                //Storing the fileID to your data model for later use. 
                console.log(file)
                //check if File has been sucessfully uploaded or the stream was canceled by any reason.
                if(limit_reach)
                {
                    //Delete all unessary chunks in grid fs chunks using fileID
                    deleteUnfinishedUploadedFile(file._id)
                }
            });
            file.pipe(writeStream);
        }
    }).on('finish', function () {
        // show a link to the uploaded file
        if (!limit_reach)
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
    //download file using file ID. 
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
    //delete file by FileID
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
        res.status(200).send('DB k???t n???i ???n')
    })
        .catch(err => {
            console.log(err)
            res.status(500).json({ errorMessage: 'Fail' })
        });

});

function removeAccents(str) {
    var AccentsMap = [
        "a??????????????????????????????????????????????",
        "A??????????????????????????????????????????????",
        "d??", "D??",
        "e??????????????????????????????",
        "E??????????????????????????????",
        "i????????????",
        "I????????????",
        "o??????????????????????????????????????????????",
        "O??????????????????????????????????????????????",
        "u?????????????????????????????",
        "U?????????????????????????????",
        "y??????????????",
        "Y??????????????"
    ];
    for (var i = 0; i < AccentsMap.length; i++) {
        var re = new RegExp('[' + AccentsMap[i].substr(1) + ']', 'g');
        var char = AccentsMap[i][0];
        str = str.replace(re, char);
    }
    return str;
}

function deleteUnfinishedUploadedFile(file_id)
{
    gfs.remove({ _id: new ObjectID(file_id) }, (err, gridStore) => {
        if (err) {
            console.log(`File ID: ${file_id} UnusedFile has been removed`)
        }
        else {
            console.log(`File ID: ${file_id} UnusedFile has been removed unsucessfully`)
        }
    });
}

module.exports = router
