var Client = require('./client');
var EVENTS = require('./events');

function ClientManager(db) {
    this.db                 = db;
    this.TAG                = "ClientManager: ";
}

/** Creates a client if it doesn't exist and returns an auth token for the socket
 * @param {*} clientId
 * @param {*} socket
 */
ClientManager.prototype.create = function(clientId, socket, callback) {
    this.db.exists(clientId, (err, exist) => { 
        if(err) {
            callback(err, null);
            return;
        }

        if(exist === 1) {
            this.db.exists(clientId+"-authed", (err2, authed) => {
                if(authed) {
                    callback(EVENTS.OTHER_SESSION, null);
                }
                else {
                    callback(null, this.acquireLock(clientId, socket));
                }                
            });
        }
        else{            
            callback(null, this.acquireLock(clientId, socket));
        }
    });        
}

ClientManager.prototype.acquireLock = function(clientId, socket) {
    let token = this.makeToken(clientId);
    // give this socket the lock
    this.db.set(clientId, socket.id);
    this.db.expire(clientId, 500);
    // save the socket's token
    this.db.set(socket.id, token);
    this.db.expire(socket.id, 500);
    return token;
}

ClientManager.prototype.makeToken = function(tokenIdentifier) {
    var token = "";
    var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

    for (var i = 0; i < 100; i++)
        token += possible.charAt(Math.floor(Math.random() * possible.length));

    token += Date.now() + "--" + tokenIdentifier;
    this.db.set(tokenIdentifier+"-token", token);
    //this.db.expire(tokenIdentifier+"-token", 500); // expires in 500 seconds, todo: find optimal time
    return token;
}

// returns a promise
ClientManager.prototype.refresh = function(oldToken, callback) {
    let clientId = this.extractClientId(oldToken);
    console.log("clientId: ", clientId);
    this.db.exists(clientId+"-token", (err, reply) => {
        if(err) {
            callback(err, null);
            return;
        }

        if(reply === 1)
            callback(null, this.makeToken(clientId));
        else
            callback("Invalid Token" + reply, null);
    });
}

ClientManager.prototype.disconnect = function(socket) {
    this.db.get(socket.id, (err, token) => {
        if(err) {
            console.error(this.TAG, err);
            return;
        }
        
        if(!token) return;

        let client = this.extractClientId(token);
        this.hasLock(client, socket, (err, hasLock) => {
            if(hasLock) this.relinquishLock(client);        
        });
    })
}

/**
 * Checks if socket has the lock of a client
 */
ClientManager.prototype.hasLock = function(clientId, socket, callback) {
    this.db.get(clientId, (err, lock) => {
        if(err !== null) return callback(err, null);        
        callback(null, lock === socket.id);
    });
}

ClientManager.prototype.relinquishLock = function(clientId) {
    this.db.del(clientId, (err, ok) => {
        if(err) console.error(this.TAG, err);
    })
}

ClientManager.prototype.extractClientId = function(authToken) {
    return authToken.substring(authToken.lastIndexOf('--') + 2);
}

ClientManager.prototype.extractToken = function(authToken) {
    return authToken.substring(0, authToken.lastIndexOf('--'));
}

ClientManager.prototype.getClientById = function(clientId, callback) {
    this.db.hgetall(this.R_CLIENTS, (err, clients) => {
        if(err) {
            callback(err, null);
            return;
        }
            
        if(clients[clientId])
            return clients[clientId];
        return false;
    });
}

ClientManager.prototype.getClientBySocket = function(socket) {
    return this.db.exists(socket.id, (err, hasSocket) => {
        if(hasSocket === 1) {
            return this.db.get(socket.id, (err2, authToken)=> {
                return err === null ? 
                    this.extractClientId(authToken) : null;
            })
        }
        else return null;
    });
}

ClientManager.prototype.authorize = function(webClient, phoneClient) {
    // todo: ensure webClient exists and that roomId is the socket.id of a mobile client
    webClient.roomId = phoneClient.activeSocketId;
    phoneClient.roomId = phoneClient.activeSocketId;

    // web client only has the socket id but hasn't joined it yet
    // todo: ask it to join? or handle it?
}

module.exports = ClientManager;