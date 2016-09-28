/*                 _       _
                 | |     | |
  _ __   ___   __| |_   _| |_   _ ___
 | '_ \ / _ \ / _` | | | | | | | / __|
 | | | | (_) | (_| | |_| | | |_| \__ \
 |_| |_|\___/ \__,_|\__,_|_|\__,_|___/
 @nodulus open source | ©Roi ben haim  ®2016
 */
/// <reference path="./typings/main.d.ts" />
"use strict";
var util = require('util');
var fs = require('fs');
var path = require('path');
var config = require("@nodulus/config").config;
var ObjectID = require("mongodb").ObjectID;
var assert = require('assert');
var dal = (function () {
    function dal() {
    }
    dal.prototype.mongoOperator = function (key) {
        var ops = {
            "=": "$eq",
            "!=": "$ne",
            ">": "$gt",
            ">=": "$gte",
            "<": "$lt",
            "<=": "$lte",
            "in": "$in"
        };
        if (ops[key] === undefined)
            return key;
        return ops[key];
    };
    dal.prototype.parse = function (str, params) {
        var res = { queryMode: null, collection: "", where: {}, values: {}, limit: 0 };
        var x = str.split(" ");
        res.queryMode = x[0].trim();
        if (x[2] == "SET") {
            res.values = { "$set": {} };
            var pairs = str.substring(str.indexOf("SET") + 3).split(",");
            for (var j = 0; j < pairs.length; j++) {
                var triple = pairs[j].split("=");
                res.values["$set"][triple[0].trim()] = params[triple[0].trim()];
            }
        }
        for (var i = 0; i < x.length; i++) {
            if (x[i] == "UPDATE")
                res.collection = x[i + 1];
            if (x[i] == "FROM")
                res.collection = x[i + 1];
            if (x[i] == "INTO") {
                res.collection = x[i + 1];
                res.values = params;
            }
            if (x[i] == "WHERE") {
                var conditionPoint = res.where;
                if (res.queryMode != "UPDATE") {
                    conditionPoint["$query"] = {};
                    conditionPoint = conditionPoint["$query"];
                }
                var pairs = str.substring(str.indexOf("WHERE") + 6).split("AND");
                for (var j = 0; j < pairs.length; j++) {
                    var triple = pairs[j].split("@");
                    if (triple.length < 2)
                        continue;
                    var cleankey = triple[1].replace(';', '').trim();
                    if (cleankey === "$limit")
                        res.limit = params[cleankey];
                    var operator = this.mongoOperator(triple[0].replace(cleankey, '').trim());
                    if (operator !== "^^") {
                        conditionPoint[cleankey] = {};
                        conditionPoint[cleankey][operator] = params[cleankey];
                        if (params[cleankey] == "false")
                            conditionPoint[cleankey][operator] = false;
                        if (params[cleankey] == "true")
                            conditionPoint[cleankey][operator] = true;
                    }
                    else {
                        res.where[cleankey] = params[cleankey];
                    }
                }
            }
        }
        return res;
    };
    dal.prototype.getAll = function (callback) {
        var url = config.appSettings.database.mongodb.host;
        var Db = require('mongodb').Db;
        var Server = require('mongodb').Server;
        var db = new Db('scripter', new Server('localhost', 27017));
        // Establish connection to db
        db.open(function (err, db1) {
            assert.equal(null, err);
            // Return the information of a all collections, using the callback format
            db.collections(function (err, items) {
                assert.ok(items.length > 0);
                var fitems = [];
                for (var i = 0; i < items.length; i++) {
                    fitems.push(items[i].s.name);
                }
                callback(fitems);
            });
        });
    };
    dal.prototype.getCollection = function (name, callback) {
        this.query("SELECT * FROM " + name, {}, callback);
    };
    dal.prototype.getSingle = function (name, id, callback) {
        this.connect(function (err, db) {
            assert.equal(null, err);
            if (config.appSettings.database.mongodb.useObjectId) {
                id = ObjectID(id);
            }
            var url = config.appSettings.database.mongodb.host;
            db.collection(name).findOne({ "_id": id }, function (err, doc) {
                if (err !== null || doc === null)
                    callback({ "error": "not found" });
                else
                    callback(doc);
            });
        });
    };
    dal.prototype.connect = function (callback) {
        var _this = this;
        var url = config.appSettings.database.mongodb.host;
        var MongoClient = require('mongodb').MongoClient;
        if (!this.db || this.db === null) {
            MongoClient.connect(url, function (err, db) {
                _this.db = db;
                callback(err, db);
            });
        }
        else {
            callback(null, this.db);
        }
    };
    dal.prototype.saveSchema = function (name, schema, callback) {
        this.query("INSERT INTO schemas name=@name, schema=@schema", { "name": name, "schema": schema }, callback);
    };
    dal.prototype.getSchema = function (name, callback) {
        this.query("SELECT * FROM schemas WHERE name=@name", { "name": name }, callback);
    };
    //function _insertOrUpdate(queryStr, params, callback) {
    //    var oQuery = parse(queryStr, params);
    //    var url = config.appSettings().mongodb.host;
    //    var MongoClient = require('mongodb').MongoClient;
    //    collection.insert({ hello: 'world_no_safe' });
    //}
    dal.prototype.deleteCollection = function (collection, id, callback) {
        var url = config.appSettings.database.mongodb.host;
        var MongoClient = require('mongodb').MongoClient;
        this.connect(function (err, db) {
            assert.equal(null, err);
            db.collection(collection).findAndRemove({ "id": id }, function (err, doc) {
                assert.equal(null, err);
                callback(doc);
            });
        });
    };
    dal.prototype.addToSet = function (id, collection, propertyName, pushObject, callback) {
        this.connect(function (err, db) {
            assert.equal(null, err);
            var pusher = {};
            pusher[propertyName] = pushObject;
            if (config.appSettings.database.mongodb.useObjectId) {
                id = ObjectID(id);
            }
            db.collection(collection).update({ _id: id }, { $addToSet: pusher }, function (err, data) {
                callback(data);
            });
        });
    };
    dal.prototype.pushObject = function (id, collection, propertyName, pushObject, callback) {
        this.connect(function (err, db) {
            assert.equal(null, err);
            var pusher = {};
            pusher[propertyName] = pushObject;
            if (config.appSettings.database.mongodb.useObjectId) {
                id = ObjectID(id);
            }
            db.collection(collection).update({ _id: id }, { $push: pusher }, function (err, data) {
                callback(data);
            });
        });
    };
    dal.prototype.pullObject = function (id, collection, propertyName, pullObject, callback) {
        this.connect(function (err, db) {
            assert.equal(null, err);
            var puller = {};
            puller[propertyName] = pullObject;
            if (config.appSettings.database.mongodb.useObjectId) {
                id = ObjectID(id);
            }
            db.collection(collection).update({ _id: id }, { $pull: puller }, function (err, data) {
                callback(data);
            });
        });
    };
    dal.prototype.getSet = function (idArr, collection, callback) {
        if (typeof (idArr) == "string")
            idArr = [idArr];
        if (config.appSettings.database.mongodb.useObjectId) {
            for (var i = 0; i < idArr.length; i++) {
                if (idArr[i] && idArr[i] !== 'null') {
                    try {
                        idArr[i] = ObjectID(idArr[i]);
                    }
                    catch (e) {
                        console.log(e, idArr[i]);
                    }
                }
            }
        }
        this.connect(function (err, db) {
            assert.equal(null, err);
            db.collection(collection).find({ _id: { "$in": idArr } }).toArray(function (err, data) {
                callback(data);
            });
        });
    };
    dal.prototype.query = function (queryStr, params, callback) {
        var oQuery = this.parse(queryStr, params);
        //if (oQuery.where["$query"]["_id"] !== undefined) {
        //    oQuery.where["$query"]["_id"] = { ObjectID(oQuery.where["_id"]);
        //}
        this.connect(function (err, db) {
            assert.equal(null, err);
            switch (oQuery.queryMode) {
                case "INSERT":
                    if (!oQuery.values["_id"]) {
                        if (config.appSettings.database.mongodb.useObjectId) {
                            if (oQuery.values["_id"] === undefined) {
                                oQuery.values["_id"] = new ObjectID();
                            }
                            else if (typeof (oQuery.values["_id"] == "string")) {
                                oQuery.values["_id"] = new ObjectID(oQuery.values["_id"]);
                            }
                        }
                        else {
                            oQuery.values["_id"] = require("node-uuid").v4();
                        }
                    }
                    db.collection(oQuery.collection).save(oQuery.values, function (err, result) {
                        //if (result.result.upserted !== undefined || result.result.nModified == 1) {
                        //    sendToArchive(oQuery, result);
                        //}
                        assert.equal(err, null);
                        console.log("inserted document from " + oQuery.collection);
                        callback(result);
                    });
                    break;
                case "DELETE":
                    if (config.appSettings.database.mongodb.useObjectId) {
                        if (oQuery.where["$query"]["_id"] !== undefined) {
                            oQuery.where["$query"]["_id"]["$eq"] = ObjectID(oQuery.where["$query"]["_id"]["$eq"]);
                        }
                    }
                    db.collection(oQuery.collection).remove(oQuery.where["$query"], function (err, result) {
                        //if (result.result.ok == 1) {
                        //    sendToArchive(oQuery, result);
                        //}
                        assert.equal(err, null);
                        console.log("deleted document from " + oQuery.collection);
                        callback(result);
                    });
                    break;
                case "UPDATE":
                    if (config.appSettings.database.mongodb.useObjectId) {
                        if (oQuery.where && oQuery.where._id && oQuery.where._id.$eq) {
                            oQuery.where._id.$eq = ObjectID(oQuery.where._id.$eq);
                        }
                    }
                    db.collection(oQuery.collection).update(oQuery.where, oQuery.values, function (err, result) {
                        assert.equal(err, null);
                        console.log("updated document from " + oQuery.collection);
                        var cursor = db.collection(oQuery.collection).find(oQuery.where);
                        var retArr = [];
                        cursor.each(function (err, doc) {
                            assert.equal(err, null);
                            if (doc != null) {
                                retArr.push(doc);
                            }
                            else {
                                callback(retArr);
                            }
                        });
                    });
                    break;
                case "SELECT":
                    var retArr = [];
                    var cursor;
                    var whereFlag = false;
                    for (var i in oQuery.where)
                        whereFlag = true;
                    if (whereFlag) {
                        if (config.appSettings.database.mongodb.useObjectId) {
                            if (oQuery.where && oQuery.where.$query._id && oQuery.where.$query._id.$eq) {
                                oQuery.where.$query._id.$eq = ObjectID(oQuery.where.$query._id.$eq);
                            }
                        }
                        cursor = db.collection(oQuery.collection).find(oQuery.where);
                    }
                    else
                        cursor = db.collection(oQuery.collection).find();
                    if (oQuery.limit === undefined)
                        oQuery.limit = 0;
                    cursor.limit(oQuery.limit).each(function (err, doc) {
                        assert.equal(err, null);
                        if (doc != null) {
                            retArr.push(doc);
                        }
                        else {
                            callback(retArr);
                        }
                    });
                    break;
            }
        });
    };
    dal.prototype.sendToArchive = function (data, res) {
        //if (res.result.upserted !== undefined)
        //    data.docIdentifier = res.result.upserted[0]._id;
        //socket.emit('dbchanges', data);
    };
    //      var searchCommand = new SearchCommand();
    //var specialCommand = new SpecialCommand();
    //var aggregateCommand = new AggregateCommand();
    dal.prototype.get = function (entity, searchCommand, specialCommand, aggregateCommand, callback) {
        this.connect(function (err, db) {
            if (db === null) {
                return callback(err);
            }
            db.collection(entity).ensureIndex({ "$**": "text" }, { name: "TextIndex" });
            if (specialCommand.$skip && specialCommand.$limit) {
                //get the item count
                db.collection(entity).find(searchCommand.$query).count(function (err, countResult) {
                    db.collection(entity).find(searchCommand, aggregateCommand.$project).skip(Number(specialCommand.$skip)).limit(Number(specialCommand.$limit)).toArray(function (err, result) {
                        var data = { items: result, count: countResult };
                        callback(data);
                    });
                });
            }
            else {
                if (searchCommand.$query && searchCommand.$query["_id"]) {
                    if (config.appSettings.database.mongodb.useObjectId) {
                        searchCommand.$query["_id"] = ObjectID(searchCommand.$query["_id"]);
                    }
                }
                db.collection(entity).find(searchCommand).toArray(function (err, result) {
                    var data = { items: result !== null ? result : [], count: result !== null ? result.length : 0 };
                    return callback(data);
                });
            }
        });
    };
    return dal;
}());
exports.dal = dal;
