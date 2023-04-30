mdc.ripple.MDCRipple.attachTo(document.querySelector(".mdc-button"));

// import '@firebase/firestore-types'

/*

    Proposed database schema:

    {
        name: {
            offer: RTCSessionDescriptionInit,
        }
    }

    New schema:
    sessions collection/table has per entry:
    {
        members: [user1_ID, user2_ID, ...]
    }

    userOffers collection/table has per entry:
    {
      offers: [(userID, offer1), (userID, offer2), ...],
      answers: [answer1, answer2, ...],
      ICECollection (user userIDs as keys): LocalIceCollection, RemoteIceCollection
    }
    
    * The LocalIceCollection will contain the new ICE candidates we add
    * We use collection.doc(userID) to create entries with custom keys
    
    Message schema:
    {
        round_type: int
        ranking_val: int
        message_type: int
        timestamp: optional timestamp
        song: optional string
        must_accept: optional bool
        index: optional int
    }
    
*/

const answererCandidateString = "answererCandidates";
const offererCandidateString = "offererCandidates";

// Global state
var username = "";
var myUserID = "";
var sessionId = "";
var consensusMajority = 0; // Number of acceptors is floor((consensusMajority - 1)/2) + 1
var queue = []; // Array of songs

// Role strings
const DISTINGUISHED_PROPOSER = "distingushed-proposer";
const ACCEPTOR = "acceptor";
const LEARNER = "learner";
const NO_ROLE = "none";

// Message types
const PAUSE = 1;
const PLAY = 2;
const ADD = 3;
const REMOVE = 4;
const SCRUB = 5;
const SKIP = 6;

// Round types
const PREPARE = 7;
const ACCEPT = 8;
const PROMISE = 9;
const CANT_PROMISE = 10;
const ACCEPTED = 11;
const REQUEST = 12;
const LEARN = 13;

// TODO: Mutexes

// Consensus globals
var lastPrepareRankingVal = 0;
var lastAcceptedRankingVal = 0;
var myRole = NO_ROLE;

// For proposer
var ranking_val = 1;
var roundInProgress = false;
var messageQueue = [];
var promises = 0
var acceptances = 0

// For learner
var lastLearned = 0;

// Default configuration - Change these if you have a different STUN or TURN server.
const configuration = {
  iceServers: [
    {
      urls: ["stun:stun1.l.google.com:19302", "stun:stun2.l.google.com:19302"],
    },
  ],
  iceCandidatePoolSize: 10,
};

// Will be used to bind html elements to our functions I assume lol
function init() {
  document.querySelector("#cameraBtn").addEventListener("click", addUser);
  document.querySelector("#createBtn").addEventListener("click", createSession);
  document.querySelector("#joinBtn").addEventListener("click", joinRoom);
  document.querySelector("#messageBtn").addEventListener("click", toySendMessage);
  roomDialog = new mdc.dialog.MDCDialog(document.querySelector("#room-dialog"));
}

async function toySendMessage() {
  let message = document.querySelector("#message-test-id").value;
  console.log("about to send message ", message);

  for (let userID in userToConnection) {
    console.log("Sending message over ", userToConnection[userID].dataChannel.label);
    userToConnection[userID].dataChannel.send(JSON.stringify(message));
  }
}


// dictionary from userID -> peerConnection
var userToConnection = {};
var currMembers = new Set();

// Creates user entry in database
async function addUser() {
  console.log("adding user");
  const db = firebase.firestore();
  const userRef = await db.collection("userOffers").add({nothing: 0});
  // const userRef = await db.collection("userOffers").doc();
  userRef.collection("offers").onSnapshot((snapshot) => {
    snapshot.docChanges().forEach(handleNewOffer);
  });
  userRef.collection("answers").onSnapshot((snapshot) => {
    snapshot.docChanges().forEach(handleNewAnswer);
  });
  myUserID = userRef.id;
  console.log("I am user", myUserID);
}

// Creates a session by adding an entry to the sessions table. This ID will be used
//    to join the session.
// Also adds an entry to the userOffers table which will be
//    used as a way to send and receive offers
async function createSession() {
  // Set role as distinguished proposer if creating session
  myRole = DISTINGUISHED_PROPOSER;

  const db = firebase.firestore();

  const sessionEntry = {
    users: [myUserID],
    personDropped: {
      role: NO_ROLE,
      ID: "",
    },
  };

  const sessionRef = await db.collection("sessions").add(sessionEntry);
  sessionRef.onSnapshot(handleMembershipChange);

  document.querySelector(
    "#currentRoom"
  ).innerText = `Current room is ${sessionRef.id} - You are the caller!`;
  sessionId = sessionRef.id;
}

function joinRoom() {
  document.querySelector("#createBtn").disabled = true;
  document.querySelector("#joinBtn").disabled = true;

  document.querySelector("#confirmJoinBtn").addEventListener(
    "click",
    async () => {
      sessionId = document.querySelector("#room-id").value;
      console.log("Join room: ", sessionId);
      document.querySelector(
        "#currentRoom"
      ).innerText = `Current room is ${sessionId}!`;
      await joinSession();
    },
    { once: true }
  );
  roomDialog.open();
}

// Join session by inputting the session ID. This in turn gives the user
//    access to the session's entry in the Sessions table which has the
//    ID of all the users in it. Can then iterate over user IDs and send
//    them all offers to create peer connections and data channels
async function joinSession() {
  // TODO: need to get roomID from user
  // Need to get SessionID from user

  const db = firebase.firestore();
  const sessionRef = db.collection("sessions").doc(`${sessionId}`);
  const sessionSnapshot = await sessionRef.get();
  console.log("Got session:", sessionSnapshot.exists);

  if (sessionSnapshot.exists) {
    // iterate over all users in the session
    for (let ID of sessionSnapshot.data().users) {
      console.log(`Found user ${ID} in session!`);
      sendPeerConnectionOffer(ID);
    }
  }
  const userList = sessionSnapshot.data().users;
  userList.push(myUserID);
  sessionRef.update({
    users: userList,
  }).then(() => {
    console.log("Membership updated!");
  });
  sessionRef.onSnapshot(handleMembershipChange);
}

async function sendPeerConnectionOffer(ID) {
  const db = firebase.firestore();
  const peerConnection = new RTCPeerConnection(configuration);
  userToConnection[ID] = {};
  userToConnection[ID].peerConnection = peerConnection;

  console.log(`Creating data channel with ${ID}.`);
  const dataChannel = userToConnection[ID].peerConnection.createDataChannel(
    `${myUserID}-${ID} data channel`
  );
  userToConnection[ID].dataChannel = dataChannel;

  // Add event handler for error, open, close and message
  userToConnection[ID].dataChannel.onerror = () => {
    console.log(`Data channel to ${ID} had error.`);
    userToConnection[ID].dataChannel.close();
  }
  userToConnection[ID].dataChannel.onopen = () => {
    console.log(`Data channel to ${ID} is open`)
  };
  userToConnection[ID].dataChannel.onclose = () => {
    console.log(`Data channel to ${ID} is closed`)
  };
  userToConnection[ID].dataChannel.onmessage = handleNewMessage;

  console.log("Added listener: ", dataChannel);

  registerPeerConnectionListeners(ID);

  const offer = await userToConnection[ID].peerConnection.createOffer();
  await userToConnection[ID].peerConnection.setLocalDescription(offer);
  console.log("Created offer:", offer);

  const userRef = db.collection("userOffers").doc(`${ID}`);
  const userSnapshot = await userRef.get();
  console.log(`Got snapshot of document for ${ID}: `, userSnapshot.exists);

  if (userSnapshot.exists) {
    const offerObj = {
      id: myUserID,
      type: offer.type,
      sdp: offer.sdp,
    };
    console.log(`Adding offer ${offerObj} to offers collection of ${ID}`);
    userRef.collection("offers").doc(myUserID).set(offerObj);
  }
}


// Pass in the ID of a peer connection
function registerPeerConnectionListeners(ID) {
  userToConnection[ID].peerConnection.addEventListener("icegatheringstatechange", () => {
    console.log(
      `ICE gathering state changed: ${userToConnection[ID].peerConnection.iceGatheringState}`
    );
  });

  userToConnection[ID].peerConnection.addEventListener("connectionstatechange", async () => {
    const db = firebase.firestore();
    switch(userToConnection[ID].peerConnection.connectionState) {
      case "connecting":
        console.log(`Connecting to ${ID}`);
        break;
      case "connected":
        console.log(`Connected to ${ID}`)
        break;
      case "failed":
        console.log(`Connection to ${ID} failed. One or more of ICE transports has failed`);
        console.log(`Attempting to reconnect with ${ID}`);
        userToConnection[ID].peerConnection.close();
        delete userToConnection[ID];
        sendPeerConnectionOffer(ID);
        currMembers.delete(ID);
        // TODO: restart connection stuff?
        break;
      case "disconnected":
        console.log(`Disconnected from ${ID}`);
        const sessionRef = db.collection("sessions").doc(`${sessionId}`);
        const sessionSnapshot = await sessionRef.get();
        const sessionMembers = sessionSnapshot.data().users;
        
        const idxToRemove = sessionMembers.indexOf(ID);
        if (idxToRemove > -1) {
          sessionMembers.splice(idxToRemove, 1);
        }
        
        var roleRemoved;
        if (idxToRemove == 0) {
          roleRemoved = DISTINGUISHED_PROPOSER;
        } else if (idxToRemove < Math.floor((currMembers.size - 1) / 2) + 2) {
          roleRemoved = ACCEPTOR;
        } else {
          roleRemoved = LEARNER;
        }

        await sessionRef.update({
          users: sessionMembers,
          personDropped: {
            ID: ID,
            role: roleRemoved
          }
        });
        console.log(`Removed user ${ID}`);
        
        if (ID in userToConnection) {
          if (userToConnection[ID].dataChannel.readyState === "open") {
            userToConnection[ID].dataChannel.close();
          }
          userToConnection[ID].peerConnection.close();
          delete userToConnection[ID];
        }
        currMembers.delete(ID);
        break;
      case "closed":
        console.log(`Closed peer connection to ${ID}`);
        break;
      default:
        break;
    }

    // TODO, consensus round to see if connection is down for everyone
  });

  userToConnection[ID].peerConnection.addEventListener("signalingstatechange", () => {
    console.log(
      `Signaling state change: ${userToConnection[ID].peerConnection.signalingState}`
    );
  });

  userToConnection[ID].peerConnection.addEventListener("iceconnectionstatechange ", () => {
    console.log(
      `ICE connection state change: ${userToConnection[ID].peerConnection.iceConnectionState}`
    );
  });
}

async function handleNewOffer(change) {
  const db = firebase.firestore();
  const offer = {
    type: change.doc.data().type,
    sdp: change.doc.data().sdp
  };
  const otherUserID = change.doc.data().id;
  console.log(`New offer from ${otherUserID}: `, offer);
  const peerConnection = new RTCPeerConnection(configuration);
  userToConnection[otherUserID] = {};
  userToConnection[otherUserID].peerConnection = peerConnection;
  registerPeerConnectionListeners(otherUserID);

  // Creating a data channel
  userToConnection[otherUserID].peerConnection.addEventListener(
    "datachannel",
    async (event) => {
      console.log("New data channel: ", event);
      const dataChannel = event.channel;
      userToConnection[otherUserID].dataChannel = dataChannel;

      // Add event handler for error, close, open and message
      userToConnection[otherUserID].dataChannel.onerror = () => {
        console.log(`Data channel to ${otherUserID} had error.`);
        userToConnection[otherUserID].dataChannel.close();
      }
      userToConnection[otherUserID].dataChannel.onopen = () => {
        console.log(`Data channel to ${otherUserID} is open`)
      };
      userToConnection[otherUserID].dataChannel.onclose = () => {
        console.log(`Data channel to ${otherUserID} is closed`)
      };
      userToConnection[otherUserID].dataChannel.onmessage = handleNewMessage;
      
      console.log("Added listener: ", dataChannel);
    }
  );

  await userToConnection[otherUserID].peerConnection.setRemoteDescription(offer);
  const answer = await userToConnection[otherUserID].peerConnection.createAnswer();
  await userToConnection[otherUserID].peerConnection.setLocalDescription(answer);
  console.log("Set remote and local descriptions.");

  await addICECollection(
    otherUserID,
    myUserID,
    otherUserID,
    answererCandidateString,
    offererCandidateString
  );

  const otherUserRef = db.collection("userOffers").doc(`${otherUserID}`);
  const otherUserSnapshot = await otherUserRef.get();
  if (otherUserSnapshot.exists) {
    const answerObj = {
      id: myUserID,
      type: answer.type,
      sdp: answer.sdp,
    };
    console.log(`Adding answer ${answerObj} to ${otherUserID}`);
    otherUserRef.collection("answers").doc(myUserID).set(answerObj);
  }
  currMembers.add(otherUserID);
  consensusMajority = Math.floor((currMembers.size - 1) / 2) + 1;
}

async function handleNewAnswer(change) {
  const db = firebase.firestore();
  const answerObj = {
    type: change.doc.data().type,
    sdp: change.doc.data().sdp
  };
  const otherUserID = change.doc.data().id;

  console.log(`New answer from ${otherUserID}: `, answerObj);
  await userToConnection[otherUserID].peerConnection.setRemoteDescription(answerObj);
  await addICECollection(myUserID, otherUserID, otherUserID, offererCandidateString, answererCandidateString);
  currMembers.add(otherUserID);
  consensusMajority = Math.floor((currMembers.size - 1) / 2) + 1;
}

async function addICECollection(
  offererUserID,
  answererUserID,
  peerConnectionID,
  localName,
  remoteName) {
  const db = firebase.firestore();
  const entryRef = await db
    .collection("sessions")
    .doc(`${sessionId}`)
    .collection("ICECollections")
    .doc(`${offererUserID}${answererUserID}`);

  const candidatesCollection = entryRef.collection(localName);
  userToConnection[peerConnectionID].peerConnection.addEventListener(
    "icecandidate",
    (event) => {
      if (!event.candidate) {
        console.log("Got final candidate!");
        return;
      }
      console.log("Got candidate: ", event.candidate);
      candidatesCollection.add(event.candidate.toJSON());
    }
  );

  entryRef.collection(remoteName).onSnapshot((snapshot) => {
    snapshot.docChanges().forEach(async (change) => {
      if (change.type === "added") {
        let data = change.doc.data();
        console.log(`Got new remote ICE candidate: ${JSON.stringify(data)}`);
        await userToConnection[peerConnectionID].peerConnection.addIceCandidate(data);
      }
    });
  });
}

async function handleMembershipChange(snapshot) {
  const memberList = snapshot.data().users;
  const role = snapshot.data().personDropped.role;
  const id = snapshot.data().personDropped.ID;
  console.log("Update to group membership.");
  console.log(`Person dropped: ${id}`);

  let myNewRole = ''

  for (let i in memberList) {
    let member = memberList[i];
    if (member == myUserID) {
      if (i == 0) {
        myNewRole = DISTINGUISHED_PROPOSER;
      } else if (i < Math.floor((memberList.length - 1) / 2) + 2) {
        myNewRole = ACCEPTOR;
      } else {
        myNewRole = LEARNER;
      }
      break;
    }
  }

  if (memberList.length < currMembers.size) {
    // Check if my role needs to be changed based on my index
    
    // Drop member from everything
    if (id in userToConnection) {
      if (userToConnection[id].dataChannel.readyState === "open") {
        userToConnection[id].dataChannel.close();
      }
      userToConnection[id].peerConnection.close();
      currMembers.delete(id);
      delete userToConnection[id];
    }

    switch (myNewRole) {
      case DISTINGUISHED_PROPOSER:

        // If I previously was something else, sets relevant globals
        switch (myRole) {
          case DISTINGUISHED_PROPOSER:
            
            break;
          case ACCEPTOR:
            resetProposerGlobals(lastPrepareRankingVal)
            break;
          case LEARNER:
            resetProposerGlobals(lastLearned)
            break;
          default:
            console.log("Had no valid former role")
        }

        break;
      case ACCEPTOR:
        break;
      case LEARNER:
        break;
      default:
        console.log("Invalid role assignment, you're calculating roles incorrectly");
    }



    // TODO: handle losing members
    // TODO: handle gaining members
    // TODO: if there's a role change, reset new role things

    // If new role is proposer, do things based on membership changes

    // If proposer left and you are not a proposer, send new proposer queued changes

    // Remove person from data structures
    currMembers = Set(memberList);
  } else if (memberList.length > currMembers.size) {
    
  }
  consensusMajority = Math.floor((memberList.size - 1) / 2) + 1;
}

function resetProposerGlobals(lastRankingVal) {
  ranking_val = lastRankingVal + 1;
  roundInProgress = false;
  messageQueue = [];
  promises = 0;
  acceptances = 0;
}

// Sends a message to the specified recipient class (DISTINGUISHED_PROPOSER|ACCEPTOR|LEARNER)
async function sendMessage(message, recipient) {
  // let message = document.querySelector("#message-test-id").value;
  console.log("about to send message ", message);

  const sessionMembersArray = Array.from(currMembers);

  for (let i = 0; i < sessionMembersArray.length; i++) {
    let ID = sessionMembersArray[i];

    if (i = 0 && recipient == DISTINGUISHED_PROPOSER) {
      console.log("Sending message to proposer");
      userToConnection[ID].dataChannel.send(JSON.stringify(message));
      
    } else if (i > 0 && i < Math.floor((sessionMembersArray.length - 1) / 2) + 2 && recipient == ACCEPTOR) {
      console.log("Sending message to acceptor");
      userToConnection[ID].dataChannel.send(JSON.stringify(message));

    } else if (i > Math.floor((sessionMembersArray.length - 1) / 2) + 1 && i < sessionMembersArray.length && recipient == LEARNER) {
      console.log("Sending message to learner");
      userToConnection[ID].dataChannel.send(JSON.stringify(message));
      
    }
      
  }
}

// Called when a data channel receives a new message
async function handleNewMessage(event) {
  var message = JSON.parse(event.data);
  console.log(`new message of ${message}`);

  // Handle according to role
  switch (myRole) {
    case DISTINGUISHED_PROPOSER:
      switch (message.round_type) {
        case REQUEST:
          // Add requests for operations to the queue
          messageQueue.push(message);

          // Starts consensus round if there isn't already anything in the queue
          if (messageQueue.length == 1) {
            startRound();
          }
          break;
        
        case PROMISE:
          if (message.ranking_val == ranking_val) {
            promises++
            if (promises == consensusMajority) {
              message.round_type = ACCEPT;
              sendMessage(message, ACCEPTOR);
              promises = 0;
            }
          }
          break;
        
        case CANT_PROMISE:
          // Update ranking val and start round again with a higher ranking val
          ranking_val = message.ranking_val + 1;

          message.ranking_val = ranking_val;
          message.message_type = PREPARE;
          sendMessage(message, ACCEPTOR);
          break;
        
        case ACCEPTED:
          if (message.ranking_val == ranking_val) {
            acceptances++;
            if (acceptances == consensusMajority) {
              acceptances = 0;

              // Remove accepted message from queue
              messagesQueue.shift();

              // Increase ranking val to prepare for the next round
              ranking_val++;

              roundInProgress = false;

              // Start consensus round with next message, if it exists
              if (messagesQueue.length > 0) {
                startRound();
              }

              
            }
          }
          break;
        
        default:
          console.log("Unrecognized round type for proposer:", message.round_type);
      }
      break;
    
    case ACCEPTOR:
      switch (message.round_type) {
        case PREPARE:
          if (lastPrepareRankingVal > message.ranking_val) {
            message.round_type = CANT_PROMISE;
            message.ranking_val = lastPrepareRankingVal;
            sendMessage(message, DISTINGUISHED_PROPOSER);
          } else if (
            lastPrepareRankingVal < message.ranking_val
          ) {
            // This number is higher than the last last number I promised to vote on, so I'll promise to vote on this
            lastPrepareRankingVal = message.ranking_val
            message.round_type = PROMISE;
            sendMessage(message, DISTINGUISHED_PROPOSER);
            
          }
          break;
        case ACCEPT:
          // Check if this is the round I agreed to vote on
          if (lastPrepareRankingVal == message.ranking_val) {
            
            message.round_type = ACCEPTED;

            sendMessage(message, DISTINGUISHED_PROPOSER);
            updateDataStructures(message);
            lastAcceptedRankingVal = message.ranking_val

            // If message type was valid, notify learners
            if (message.message_type == PAUSE || message.message_type == PLAY || message.message_type == ADD || message.message_type == REMOVE || message.message_type == SCRUB || message.message_type == SKIP) {
              message.round_type = LEARN;
              sendMessage(message, LEARNER);
            }
          }
          break;
        default:
          console.log("Unrecognized round type for acceptor:", message.round_type);
      }
      break;
    case LEARNER:
      switch (message.round_type) {
        case LEARN:
          // Learner updates data structures if they haven't already
          // TODO: Add mutex
          if (message.ranking_val != lastLearned) {
            updateDataStructures(message);
            lastLearned = message.ranking_val;
          }
          break;
        default:
          console.log("Unrecognized round type for learner:", message.round_type);
      }
      break;
    default:
      console.log("Received a new message, but current client has no role")
      break;
  }

  
}

// TODO: Modify local data structures based on the message's operation
function updateDataStructures(message) {
  switch (message.message_type) {
    case PAUSE:
      break;
    case PLAY:
      break;
    case ADD:
      break;
    case REMOVE:
      break;
    case SCRUB:
      break;
    case SKIP:
      break;
    default:
      console.log("Unknown message type:", message.type);
  }
}

/*
  Message Schema: 

    {
        message_type: int
        round_type: optional int
        ranking_val: optional int
        timestamp: optional timestamp
        song: optional string
        must_accept: optional bool
        index: optional int
    }
*/

// This function is called by UI when a client wants to initiate an action.å
//  The client passes in the metadata for the action they want to initiate as per 
//  the message schema above
async function initiateMessage(message) {

  switch (myRole) {
    case DISTINGUISHED_PROPOSER:
      messageQueue.push(message);
      if (messageQueue.length == 1) {
        startRound();
      }
      break;
    case ACCEPTOR:
      message.round_type = REQUEST;
      sendMessage(message, DISTINGUISHED_PROPOSER);
      break;
    case LEARNER:
      message.round_type = REQUEST;
      sendMessage(message, DISTINGUISHED_PROPOSER);
      break;
    default:
      console.log("Attempted to initiate message, but the client has no role");
      break;
  }

} 

// For proposer to handle consensus
async function startRound() {
  roundInProgress = true;
  messageQueue[0].ranking_val = ranking_val;
  messageQueue[0].round_type = PREPARE;
  sendMessage(messagesQueue[0], ACCEPTOR);
  
}

// For proposer
// var ranking_val = 1;
// var roundInProgress = false;
// var messageQueue = [];
// var promises = 0
// var acceptances = 0

init();
