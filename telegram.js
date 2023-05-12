const TelegramBot = require('node-telegram-bot-api');
const token = process.env.TELE_TOKEN || null;
var bot = null;
const diskInfo = require('node-disk-info');
const si = require('systeminformation');
var botErrMessage = `Xin lỗi. Hệ thống đã gặp lỗi, xin vui lòng thử lại.`;
var currentDiskstatus_data, currentCPUStatus_data, currentDockerStatus_data, currentRAMStatus_data = null;
var currentDiskstatus, currentSystemStatus, currentDockerStatus, currentRAMStatus, currentCPUStatus = '';
var inform_interval;
var auto_interval;
const db = require('./dbManager.js');
global.listOfClients = [];
global.clientWhiteList = [];

async function initTele() {
    if (token != null) {
        try {
            bot = new TelegramBot(token, { polling: true });
            await initDB();

            auto_interval = setInterval(() => {
                autoCheck();
            }, process.env.AUTO_CHECK_INTERVAL);


            //at this time, bot is live. So we can run cronjobs to get system status periodically
            inform_interval = setInterval(() => {
                send_logs_periodically();
            }, process.env.CLIENT_INFORM_INTERVAL);

            //process individual message from clients
            bot.on('message', (msg) => {
                console.log('Got tele client message!');

                let sql = `select * from Users where TeleID="${msg.chat.id}"`
                runSelectQuery(sql).then(res => {
                    if (res.length == 0) {
                        runquery(`INSERT INTO Users (TeleID)
                        VALUES (?)`,
                            [msg.chat.id]).then(res => {
                                console.log('Insert new client ok.')
                                global.listOfClients.push(msg.chat.id);
                            });
                    }
                }).catch(err => {
                    console.log(err)
                });

                switch (msg.text.toString().toLowerCase()) {
                    case 'hi':
                        showGuideline(msg.chat.id);
                        break;
                    case 'system status':
                        get_currentSystemStatus(msg.chat.id, true);
                        break;
                    case 'disks status':
                        get_currentDiskstatus(msg.chat.id, true);
                        break;
                    case 'services status':
                        get_currentDockerStatus(msg.chat.id, true)
                        break;
                    case 'all status':
                        get_all(msg.chat.id, true)
                        break;
                    case 'stop auto':
                        stopSendingAutoMessage(msg.chat.id);
                        break;
                    case 'start auto':
                        startSendingAutoMessage(msg.chat.id);
                        break;
                    case 'unsubscribe':
                        removeUser(msg.chat.id);
                        break;
                    case 'system restart':
                        break;
                    default:
                        break;
                }
            });

        } catch (error) {
            console.log(error)
        }
    }
}
async function initDB() {
    await runquery(`CREATE TABLE IF NOT EXISTS Users
    (
      ID INTEGER PRIMARY KEY AUTOINCREMENT,
      TeleID   VARCHAR(50) NOT NULL,
      WhiteList INT NOT NULL DEFAULT 0
    );`);

    await runquery(`CREATE TABLE IF NOT EXISTS Servers
    (
      ServerName VARCHAR(50) PRIMARY KEY,
      IPAddress  VARCHAR(50) DEFAULT NULL
    );`);

    await runquery(`CREATE TABLE IF NOT EXISTS ServersLog
    (
      ID INTEGER PRIMARY KEY AUTOINCREMENT,
      Type VARCHAR(50) NOT NULL,
      Content TEXT DEFAULT NULL,
      ServerName VARCHAR(50) NOT NULL,
      CreatedOn DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (ServerName) REFERENCES Servers(ServerName)
    );`);

    let users = await runSelectQuery(`select * from Users`);
    if (users)
        users.forEach(user => {
            if (user.WhiteList == 0)
                global.listOfClients.push(user.TeleID)
            else
                global.clientWhiteList.push(user.TeleID)
        });

    let localhost = await runSelectQuery(`select * from Servers where ServerName='gateway'`);
    if (localhost) {
        if (localhost.length == 0)
            runquery(`INSERT INTO Servers (ServerName, IPAddress)
                        VALUES (?,?)`,
                ['gateway', process.env.GATEWAY_IP || '0.0.0.0']).then(res => {
                    console.log('Insert new gateway server ok.')
                });
    }
    return Promise.resolve(true);
}
function writeLogs(serverName, type, logs) {
    runquery(`INSERT INTO ServersLog (Type, Content, ServerName)
    VALUES (?,?,?)`,
        [type, logs, serverName]).then(res => {
            console.log('Write log ok.')
        });
    //Nếu là server khác ghi logs thì bắn thông báo lập tức
    try {
        if(serverName!='gateway')
        {
            console.log('here')
            let fullMessage = `*************************** ${type.toUpperCase()} OVER LIMIT ****************************** \n
            ********* SERVER: ${serverName} *********\n
            `;
            fullMessage = fullMessage + JSON.stringify(JSON.parse(logs), null, '\t') + '\n';
            global.listOfClients.forEach(clientID => {
                bot.sendMessage(clientID, fullMessage);
            });
            global.clientWhiteList.forEach(clientID => {
                bot.sendMessage(clientID, fullMessage);
            })
        }
    } catch (error) {
        console.log(error)
    }

}
function clearLogs(serverName) {
    console.log(serverName)
    runquery(`DELETE FROM ServersLog WHERE ServerName = ?`, [serverName]).then(res => {
        console.log('Clear log ok.')
    });
}
async function getLogs(serverName, fromDate = null, toDate = null) {
    let data
    console.log(serverName, fromDate, toDate)
    if (fromDate == null && toDate == null)
        data = await runSelectQuery(`SELECT * FROM ServersLog WHERE ServerName=?`, [serverName]);
    else if (fromDate != null && toDate != null)
        data = await runSelectQuery(`SELECT * FROM ServersLog WHERE ServerName=? AND (CreatedOn BETWEEN ? AND ?) `, [serverName, fromDate, toDate]);
    else if (fromDate != null && toDate == null)
        data = await runSelectQuery(`SELECT * FROM ServersLog WHERE ServerName=? AND CreatedOn > ? `, [serverName, fromDate]);
    else
        data = await runSelectQuery(`SELECT * FROM ServersLog WHERE ServerName=? AND CreatedOn < ? `, [serverName, toDate]);
    if (data)
        return Promise.resolve(data)
    else
        return Promise.reject(false)
}
async function createServer(serverName, ip = null) {
    let server = await runSelectQuery(`select * from Servers where ServerName='${serverName}'`);
    if (server) {
        if (server.length == 0) {
            await runquery(`INSERT INTO Servers (ServerName, IPAddress)
                        VALUES (?,?)`,
                [serverName, ip]);
            return Promise.resolve(true)
        }
        else
            Promise.resolve(false)
    }
    else
        Promise.resolve(false)
}
async function deleteServer(serverName) {
    let server = await runquery(`DELETE FROM Servers where ServerName='${serverName}' and ServerName!='gateway'`);
    if (server) {
        Promise.resolve(true)
    }
    else
        Promise.resolve(false)
}
function showGuideline(clientID) {
    let text =
        `<b>Các câu lệnh của hệ thống</b>\n
    <b><i>hi</i></b> : hiển thị hướng dẫn.\n
    <b><i>system status</i></b> : trạng thái cpus và ram.\n
    <b><i>disks status</i></b> : trạng thái các ổ đĩa.\n
    <b><i>services status</i></b> : trạng thái các dịch vụ app.\n
    <b><i>all status</i></b> : tất cả các trạng thái.\n
    <b><i>stop auto</i></b> : dừng nhận tin nhắn định kỳ (tin cảnh báo vẫn nhận được).\n
    <b><i>start auto</i></b> : nhận tin nhắn định kỳ.\n
    <b><i>unsubscribe</i></b> : ngưng nhận tất cả các tin báo (để khôi phục dịch vụ, gõ lệnh hi).\n
    `
    bot.sendMessage(clientID, text, { parse_mode: "HTML" });
}
async function removeUser(clientID) {
    global.listOfClients = global.listOfClients.filter(client => client != clientID)
    global.clientWhiteList = global.clientWhiteList.filter(client => client != clientID)
    await runquery(
        `DELETE FROM Users WHERE TeleID = ?`,
        [clientID]
    )
}
async function autoCheck() {
    await Promise.all(
        [
            get_currentSystemStatus(null, false),
            get_currentDiskstatus(null, false),
            get_currentDockerStatus(null, false)
        ])

    if (currentCPUStatus_data != null) {
        let tmp = Object.assign({}, currentCPUStatus_data);
        console.log('-------------------------------',currentCPUStatus_data)
        let currentTotalLoad = 0;
        let fullMessage = `*************************** CPUs OVER ${process.env.CPU_UPPER_LIMIT}% ****************************** \n
        ********* SERVER: GATEWAY - ${process.env.GATEWAY_IP} *********\n
        `;
        for (var i = 0; i < currentCPUStatus_data.cpus.length; i++) {
            currentTotalLoad = currentTotalLoad + currentCPUStatus_data.cpus[i].load
            let validKeys = ['load', 'loadUser', 'loadSystem'];
            Object.keys(currentCPUStatus_data.cpus[i]).forEach((key) => validKeys.includes(key) || delete currentCPUStatus_data.cpus[i][key]);
            fullMessage = fullMessage + JSON.stringify(currentCPUStatus_data.cpus[i], null, '\t') + '\n';
        }
        if (currentTotalLoad > process.env.CPU_UPPER_LIMIT) {
            
            writeLogs('gateway', 'cpus', JSON.stringify(tmp));
            global.listOfClients.forEach(clientID => {
                bot.sendMessage(clientID, fullMessage);
            });
            global.clientWhiteList.forEach(clientID => {
                bot.sendMessage(clientID, fullMessage);
            })
        }
    }
    if (currentDiskstatus_data != null) {
        let fullMessage = `*************************** DISKs OVER ${process.env.DISK_UPPER_LIMIT}% ****************************** \n
        ********* SERVER: GATEWAY - ${process.env.GATEWAY_IP} *********\n
        `;
        currentDiskstatus_data.forEach(disk => {
            if (parseFloat(disk._capacity) > process.env.DISK_UPPER_LIMIT) {
                fullMessage = fullMessage + JSON.stringify(disk, null, '\t') + '\n';
            }
        });
        global.listOfClients.forEach(clientID => {
            bot.sendMessage(clientID, fullMessage);
        });
        global.clientWhiteList.forEach(clientID => {
            bot.sendMessage(clientID, fullMessage);
        })
        writeLogs('gateway', 'disks', JSON.stringify(currentDiskstatus_data));
    }
    if (currentRAMStatus_data != null) {
        if (currentRAMStatus_data.used_by_percent > process.env.RAM_UPPER_LIMIT) {
            let fullMessage = `*************************** RAM OVER ${process.env.RAM_UPPER_LIMIT}% ****************************** \n
            ********* SERVER: GATEWAY - ${process.env.GATEWAY_IP} *********\n
            `;
            fullMessage = fullMessage + JSON.stringify(currentRAMStatus_data, null, '\t') + '\n';
            global.listOfClients.forEach(clientID => {
                bot.sendMessage(clientID, fullMessage);
            });
            global.clientWhiteList.forEach(clientID => {
                bot.sendMessage(clientID, fullMessage);
            })
            writeLogs('gateway', 'ram', JSON.stringify(currentRAMStatus_data));
        }
    }
    // if (currentDockerStatus_data != null) {
    // writeLogs('gateway', 'services', JSON.stringify(currentDockerStatus_data));
    // }
    cleanMessage();
    cleanData();
}
async function stopSendingAutoMessage(clientID) {
    if (!global.clientWhiteList.includes(clientID)) {
        global.clientWhiteList.push(clientID);
        await runquery(
            `UPDATE Users SET WhiteList = ? WHERE TeleID = ?`,
            [1, clientID]
        )
    }
    global.listOfClients = global.listOfClients.filter(client => client != clientID)


}
async function startSendingAutoMessage(clientID) {
    global.clientWhiteList = global.clientWhiteList.filter(client => client != clientID)
    if (!global.listOfClients.includes(clientID)) {
        global.listOfClients.push(clientID);
        await runquery(
            `UPDATE Users SET WhiteList = ? WHERE TeleID = ?`,
            [0, clientID]
        )
    }
}
async function send_logs_periodically() {
    get_currentSystemStatus(null, false);
    get_currentDiskstatus(null, false);
    get_currentDockerStatus(null, false);

    await Promise.all(
        [
            get_currentSystemStatus(null, false),
            get_currentDiskstatus(null, false),
            get_currentDockerStatus(null, false)
        ])
    if (currentDiskstatus != '' && currentDockerStatus != '' && currentSystemStatus != '')
        global.listOfClients.forEach(clientID => {
            bot.sendMessage(clientID, currentDiskstatus);
            bot.sendMessage(clientID, currentSystemStatus);
            bot.sendMessage(clientID, currentDockerStatus);
        });
    // else
    //     bot.sendMessage(clientID, botErrMessage);
    cleanMessage();
}
function get_all(clientID, isSend) {
    get_currentSystemStatus(clientID, false);
    get_currentDiskstatus(clientID, false);
    get_currentDockerStatus(clientID, false);
    if (isSend) {
        setTimeout(() => {
            if (currentDiskstatus != '' && currentDockerStatus != '' && currentSystemStatus != '') {
                bot.sendMessage(clientID, currentDiskstatus);
                bot.sendMessage(clientID, currentSystemStatus);
                bot.sendMessage(clientID, currentDockerStatus);
            }
            else
                bot.sendMessage(clientID, botErrMessage);
            cleanMessage();
        }, 5000);
    }
}
async function get_currentDiskstatus(clientID, isSend) {
    try {
        let disks = await diskInfo.getDiskInfo();
        currentDiskstatus_data = disks;
        if (disks) {
            let fullMessage = `------------------------------------ DISKs ---------------------------------- \n
            --------- SERVER: GATEWAY - ${process.env.GATEWAY_IP} ---------\n
            `;
            for (var i = 0; i < disks.length; i++) {
                fullMessage = fullMessage + JSON.stringify(disks[i], null, '\t') + '\n';
            }

            currentDiskstatus = fullMessage;
            if (isSend) {
                bot.sendMessage(clientID, fullMessage);
                cleanMessage();
            }
        }
    } catch (error) {
        console.log(error);
        if (isSend) {
            bot.sendMessage(clientID, botErrMessage);
            cleanMessage();
        }
    }
    return Promise.resolve(true)
}
async function get_currentSystemStatus(clientID, isSend) {
    try {
        //get CPUs info
        let data = await si.currentLoad();
        currentCPUStatus_data = Object.create(data);
        let cpuMessage = ''
        for (var i = 0; i < data.cpus.length; i++) {
            let validKeys = ['load', 'loadUser', 'loadSystem'];
            Object.keys(data.cpus[i]).forEach((key) => validKeys.includes(key) || delete data.cpus[i][key]);
            cpuMessage = cpuMessage + JSON.stringify(data.cpus[i], null, '\t') + '\n';
        }
        currentCPUStatus = cpuMessage;
        //get RAM info
        data = await si.mem();
        data['used_by_percent'] = Math.round(data.used / data.total * 100);
        currentRAMStatus_data = Object.create(data);
        currentRAMStatus = JSON.stringify(data, null, '\t')
        let fullMessage = `--------- SERVER: GATEWAY - ${process.env.GATEWAY_IP} ---------\n` +
            '------------------------------------ CPU ---------------------------------- \n' +
            cpuMessage + '\n' +
            '------------------------------------ RAM ---------------------------------- \n' +
            currentRAMStatus;
        currentSystemStatus = fullMessage;
        if (isSend)
            bot.sendMessage(clientID, fullMessage);
    } catch (error) {
        console.log(error);
        if (isSend)
            bot.sendMessage(clientID, botErrMessage);
    }
    if (isSend)
        cleanMessage();
    return Promise.resolve(true)

}
async function get_currentDockerStatus(clientID, isSend) {
    try {
        let data = await si.dockerContainers(true);
        currentDockerStatus_data = data.slice();
        let fullMessage = `------------------------------------ SERVICES ---------------------------------- \n
        ` + `--------- SERVER: GATEWAY - ${process.env.GATEWAY_IP} ---------\n`;
        let validKeys = ['name', 'createdAt', 'startedAt', 'finishedAt', 'state', 'restartCount'];
        for (var i = 0; i < data.length; i++) {
            Object.keys(data[i]).forEach((key) => validKeys.includes(key) || delete data[i][key]);
            fullMessage = fullMessage + JSON.stringify(data[i], null, '\t') + '\n';
        }
        if (isSend)
            bot.sendMessage(clientID, fullMessage);
        currentDockerStatus = fullMessage;

    } catch (error) {
        console.log(error)
        if (isSend)
            bot.sendMessage(clientID, botErrMessage);
    }
    if (isSend)
        cleanMessage();

    return Promise.resolve(true)

}
function cleanMessage() {
    currentDiskstatus = ''
    currentDockerStatus = ''
    currentSystemStatus = ''
    currentCPUStatus = ''
    currentRAMStatus = ''
}
function cleanData() {
    currentCPUStatus_data = currentDiskstatus_data = currentDockerStatus_data = currentRAMStatus_data = null
}
function runquery(sql, params = []) {
    // console.log(sql)
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) {   //Trường hợp lỗi
                console.log('Error running sql ' + sql)
                console.log(err)
                reject(err)
            } else {   //Trường hợp chạy query thành công
                resolve({ id: this.lastID })   //Trả về kết quả là một object có id lấy từ DB.
            }
        })
    })
}
function runSelectQuery(sql, params = []) {
    // console.log(sql)
    return new Promise((resolve, reject) => {
        db.all(sql, params, (error, row) => {
            if (error) {
                console.log('Error running sql ' + sql)
                reject(err)
            }
            else
                resolve(row);
        })
    })
}

initTele();
module.exports = {
    bot: bot,
    initTele: initTele,
    writeLogs: writeLogs,
    clearLogs: clearLogs,
    getLogs: getLogs,
    createServer: createServer,
    deleteServer:deleteServer
};

