let Client = require("ssh2-sftp-client");

const winston = require("./config/winston");
const fs = require("fs");
const path = require("path");

var CronJob = require("cron").CronJob;

const { promisify } = require("util");
const mv = promisify(fs.rename);
require("dotenv").config();
var queueDirectorylist = [];
var referenceDirectorylist = [];

const moveFile = async (original, target) => {
  try {
    await mv(original, target);

    winston.info(`move completed at ${new Date()}`);
    return true;
  } catch (err) {
    winston.info(`Error moving  the file ${err}  - ${new Date()}`);
  }
};

const sftpcLient = new Client();

const uploadFile = async (localFile, remoteFile) => {
  winston.info(`Uploading ${localFile} to ${remoteFile} at ${new Date()}`);
  try {
    await sftpcLient.put(localFile, remoteFile);

    winston.info(`Upload completed at ${new Date()}`);
    return true;
  } catch (err) {
    winston.info(`Error on uploading the file ${localFile}  - ${new Date()}`);
  }
};

const listQueueDirectory = async () => {
  try {
    const tempdirectory = await sftpcLient.list("/");
    queueDirectorylist = tempdirectory.map((x) => x.name);
    return true;
  } catch (err) {
    winston.info(`List directory ${err}`);
  }
};

const listreferenceDirectory = async (pathToDirectory) => {
  const tempReferenceDirectory = fs
    .readdirSync(pathToDirectory, { withFileTypes: true })
    .filter((item) => item.isDirectory())
    .map((item) => item.name);
  referenceDirectorylist = tempReferenceDirectory;
  return true;
};
const connectclient = async () => {
  var config = {
    host: process.env.SFTPHOST,
    port: process.env.SFTPPORT,
    username: process.env.SFTPUSERNAME,
    password: process.env.SFTPPASSWORD,
  };
  try {
    winston.info(`Connection initiated at ${new Date()}`);
    await sftpcLient.connect(config);
    return true;
  } catch (err) {
    winston.info(`Error while connecting client${err}`);
  }
};
const disconnect = async () => {
  console.log('Closed')
  try {
    await sftpcLient.end();
    winston.info(`Disconnected -  ${new Date()}`);
    return true;
  } catch (err) {
    winston.info(`Error while Disconnection`);
  }
};

const createDirectory = async (directory) => {
  try {
    await sftpcLient.mkdir(directory);
    await listQueueDirectory();
    return true;
  } catch (err) {
    return err;
  }
};

const createReferenceDirectory = async (directory, path) => {
  try {
    if (!fs.existsSync(`${directory}`)) {
      fs.mkdirSync(`${directory}`);
    }
    await listreferenceDirectory(path);
    return true;
  } catch (err) {
    return err;
  }
};
const connectclientInfo = async () => {
  console.log('Initiated')
  await connectclient();
  await listQueueDirectory();

  function* walkSync(dir) {
    const files = fs.readdirSync(dir, { withFileTypes: true });
    for (const file of files) {
      if (file.isDirectory()) {
        yield* walkSync(path.join(dir, file.name));
      } else {
        yield path.join(dir, file.name);
      }
    }
  }

  for (const filePath of walkSync(process.env.SFTPPATH)) {
    const localpath = filePath.slice(0, filePath.indexOf("Queue"));
    await listreferenceDirectory(`${localpath}\\Reference\\`);
    const rpath = filePath.slice(filePath.indexOf("Queue") + 6).split("\\")[0];
    const fname = filePath.slice(filePath.lastIndexOf("\\") + 1);

    if (!queueDirectorylist.includes(rpath)) {
      await createDirectory(`/${rpath}`);
    }
    if (!referenceDirectorylist.includes(rpath)) {
      await createReferenceDirectory(
        `${localpath}\\Reference\\${rpath}`,
        `${localpath}\\Reference\\`
      );
    }
    await uploadFile(filePath, `/${rpath}/${fname}`);
    await moveFile(filePath, `${localpath}Reference\\${rpath}\\${fname}`);
  }

  await disconnect();
};
connectclientInfo();


var job = new CronJob("*/10 * * * *", function () {
  console.log(`cron triggered- ${new Date()}`);
  connectclientInfo();
});
 

job.start();

