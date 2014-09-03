
var fs = require("fs");
var path = require("path");

exports.open = open;
exports.ZipFile = ZipFile;
exports.Entry = Entry;
exports.dateToDosDateTime = dateToDosDateTime;

function open(path, callback) {
  if (callback == null) callback = defaultCallback;
  fs.open(path, "w", function(err, fd) {
    if (err) return callback(err);
    callback(null, new ZipFile(fd, {autoClose: true}));
  });
}

function ZipFile(fd, options) {
  this.fd = fd;
  options = options || {autoClose: false};
  this.autoClose = !!options.autoClose;
  this.entries = [];
  this.centralDirectoryBuffers = [];
  this.cursor = 0;
}
ZipFile.prototype.addFile = function(realPath, options, callback) {
  var self = this;
  if (callback == null) callback = defaultCallback;

  var metadataPath = options.metadataPath;
  if (metadataPath == null) {
    if (options.archiveRootPath == null) throw new Error("one of metadataPath or archiveRootPath is required");
    metadataPath = path.relative(options.archiveRootPath, realPath);
  }
  if (metadataPath.indexOf("\\") !== -1) throw new Error("invalid characters in path: " + metadataPath);
  if (/^[a-zA-Z]:/.test(metadataPath) || /^\//.test(metadataPath)) throw new Error("absolute path: " + metadataPath);
  if (metadataPath.split("/").indexOf("..") !== -1) throw new Error("invalid relative path: " + metadataPath);

  var entry = new Entry(metadataPath, options);
  self.entries.push(entry);
  fs.open(realPath, "r", function(err, fd) {
    if (err) return callback(err);
    fs.fstat(fd, function(err, stats) {
      if (err) return callback(err);
      if (!stats.isFile()) return callback(new Error("not a file: " + realPath));
      entry.setLastModDate(stats.mtime);
      entry.setPumper(function(sink) {
        var readStream = fs.createReadStream(null, {fd: fd});
        readStream.on("error", function(err) {
          callback(err);
        });
        readStream.on("data", function(data) {
          sink.write(data);
        });
        readStream.on("end", function() {
          sink.end();
        });
      });
      pumpEntries(self);
    });
  });
};
ZipFile.prototype.addBuffer = function(buffer, options, callback) {
  var self = this;
};

function pumpEntries(self) {
}

function Entry(metadataPath, options) {
  this.fileName = metadataPath;
  if (options.extraFields != null) this.setExtraFields(options.extraFields);
}
Entry.prototype.setExtraFields = function(extraFields) {
  var extraFieldBuffers = [];
  extraFields.forEach(function(extraField) {
    var id = extraField.id;
    var data = extraField.data;
    var headerBuffer = new Buffer(4);
    headerBuffer.writeUInt16LE(id, 0);
    headerBuffer.writeUInt16LE(data.length, 2);
    extraFieldBuffers.push(headerBuffer);
    extraFieldBuffers.push(data);
  });
  this.extraFields = Buffer.concat(extraFieldBuffers);
};
Entry.prototype.setLastModDate = function(date) {
  var dosDateTime = dateToDosDateTime(date);
  this.lastModFileTime = dosDateTime.time;
  this.lastModFileDate = dosDateTime.date;
};
Entry.prototype.setPumper = function(pumper) {
  this.pumper = pumper;
};

function dateToDosDateTime(jsDate) {
  var date = 0;
  date |= jsDate.getDay() & 0x1f; // 1-31
  date |= ((jsDate.getMonth() + 1) & 0xf) << 5; // 0-11, 1-12
  date |= ((jsDate.getYear() - 1980) & 0x7f) << 9; // 0-128, 1980-2108

  var time = 0;
  time |= Math.floor(jsDate.getSecond() / 2); // 0-59, 0-29 (lose odd numbers)
  time |= (jsDate.getMinute() & 0x3f) << 5; // 0-59
  time |= (jsDate.getHour() & 0x1f) << 11; // 0-23

  return {date: date, time: time};
}

function defaultCallback(err) {
  if (err) throw err;
}
