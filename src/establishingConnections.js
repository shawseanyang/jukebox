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
var groupMembers = 0; // Number of acceptors is floor((groupMembers - 1)/2) + 1
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
const REQUEST = 9;
const LEARN = 10;

// Consensus globals
var lastPrepareRankingVal = 0;
var lastAcceptedRankingVal = 0;
var myRole = NO_ROLE;

// For proposer
var ranking_val = 1;
var roundInProgress = false;
var messageQueue = [];

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
  document.querySelector("#messageBtn").addEventListener("click", sendMessage);
  roomDialog = new mdc.dialog.MDCDialog(document.querySelector("#room-dialog"));
}


// dictionary from userID -> peerConnection
var userToConnection = {};
var currMembers = new Set();

// Creates user entry in database
async function addUser() {
  console.log("adding user");
  const db = firebase.firestore();
  const entry = {
    offers: {},
    answers: {},
  };
  const userRef = await db.collection("userOffers").add(entry);
  userRef.onSnapshot(handleConnectionUpdate);
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
        const offers = userSnapshot.data().offers;
        const offerObj = {
          type: offer.type,
          sdp: offer.sdp,
        };
        offers[myUserID] = offerObj;
        console.log("Their offers are: ", offers);
        userRef
          .update({
            offers: offers,
          })
          .then(() => {
            console.log("Document updated successfully!");
          });
      }
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

// Pass in the ID of a peer connection
function registerPeerConnectionListeners(ID) {
  userToConnection[ID].peerConnection.addEventListener("icegatheringstatechange", () => {
    console.log(
      `ICE gathering state changed: ${userToConnection[ID].peerConnection.iceGatheringState}`
    );
  });

  userToConnection[ID].peerConnection.addEventListener("connectionstatechange", async () => {
    console.log(`Connection state change: ${userToConnection[ID].peerConnection.connectionState}`);
    const db = firebase.firestore();
    switch(userToConnection[ID].peerConnection.connectionState) {
      case "connecting":
        console.log(`Connecting to ${ID}`);
        break;
      case "connected":
        console.log(`Connected to ${ID}`)
        break;
      case "failed":
        console.log(`One or more of ICE transports on connection with ${ID} has failed`);
      case "disconnected":
        // TODO: Add "disconnected" case so that we remove entry, close datachannels and peerConnections, etc.
        console.log(`Disconnected from ${ID}`);
        userToConnection[ID].dataChannel.close();
        userToConnection[ID].peerConnection.close();
        currMembers.delete(ID);
        const sessionMembers = await db.collection("sessions").doc(`${sessionId}`).data().users;
        const idxToRemove = sessionMembers.indexOf(ID);
        if (idxToRemove > -1) {
          sessionMembers.splice(idxToRemove, 1);
        }
        await db.collection("sessions").doc(`${sessionId}`).update({
          users: sessionMembers
        });
        console.log(`Removed user ${ID}`);
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

// Runs when a new person joins a session and attempts to form a connection
async function handleConnectionUpdate(snapshot) {
  console.log("Update to connections (answers/offers)");
  if (snapshot.exists) {
    const db = firebase.firestore();
    const offerDict = snapshot.data().offers;
    console.log("Offers list is now: ", offerDict);

    // iterate over list of offers (usually of length 1)
    for (let otherUserID in offerDict) {

      // Don't handle same offer twice
      if (currMembers.has(otherUserID)) {
        console.log(`Already connected to ${otherUserID}, not handling offer`);
        continue;
      }
      
      const offer = offerDict[otherUserID];
      
      // Creates new peer connection for the offer
      const peerConnection = new RTCPeerConnection(configuration);
      userToConnection[otherUserID] = {};
      userToConnection[otherUserID].peerConnection = peerConnection;
      
      // Registers listeners for connection being established
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
        
      console.log("Offer:", offer);
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
      
      // Notify other user of our answer
      const otherUserRef = db.collection("userOffers").doc(`${otherUserID}`);
      const otherUserSnapshot = await otherUserRef.get();
      if (otherUserSnapshot.exists) {
        const theirAnswers = otherUserSnapshot.data().answers;
        const answerObj = {
          type: answer.type,
          sdp: answer.sdp,
        };
        theirAnswers[myUserID] = answerObj;
        console.log("Their answers: ", theirAnswers);
        await otherUserRef.update({
          answers: theirAnswers,
        });
        console.log("Document updated successfully!");
      }
      currMembers.add(otherUserID);
      groupMembers = currMembers.size;
    }
    console.log("Finished with all offers.");
    
    // iterate over answers
    var answerDict = snapshot.data().answers;
    for (let ID in answerDict) {
      
      // Don't accept an answer twice
      if (currMembers.has(ID)) {
        console.log(`Already connected to ${ID}, not handling answer`);
        continue;
      }
      
      console.log(`New answer from ${ID}: `, answerDict[ID]);
      console.log(`userToConnection[${ID}]: `, userToConnection[ID].peerConnection);
      await userToConnection[ID].peerConnection.setRemoteDescription(answerDict[ID]);
      await addICECollection(
        myUserID,
        ID,
        ID,
        offererCandidateString,
        answererCandidateString
      );
      currMembers.add(ID);
      groupMembers = currMembers.size;
    }
    console.log("Finished with all answers.");
  } else {
    console.log(
      `User with ID ${myUserID} got an offer update but snapshot did not exist.`
    );
  }
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
  console.log("Update to group membership");
  const memberList = snapshot.data().users;
  const role = snapshot.data().personDropped.role;
  const id = snapshot.data().personDropped.ID;

  if (memberList.length < groupMembers) {
    // TODO: handle losing members
    // Check if my role needs to be changed based on my index

    for (let i in memberList) {
      let member = memberList[i];
      if (member == myUserID) {
        if (i == 0) {
          myRole = DISTINGUISHED_PROPOSER;
        } else if (i < Math.floor(memberList.length) + 2) {
          myRole = ACCEPTOR;
        } else {
          myRole = LEARNER;
        }

        break;
      }
    }

    // If new role is proposer, do things based on membership changes

    // If proposer left and you are not a proposer, send new proposer queued changes

    // Remove person from data structures
  }
  groupMembers = memberList.length;
  // TODO: add logic to handle changes to group membership
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
      
    } else if (i > 0 && i < Math.floor(sessionMembersArray.length) + 2 && recipient == ACCEPTOR) {
      console.log("Sending message to acceptor");
      userToConnection[ID].dataChannel.send(JSON.stringify(message));

    } else if (i > Math.floor(sessionMembersArray.length) + 1 && i < sessionMembersArray.length && recipient == LEARNER) {
      console.log("Sending message to learner");
      userToConnection[ID].dataChannel.send(JSON.stringify(message));
      
    }
      
      
  }
}

async function handleNewMessage(event) {
  console.log(`new message of ${event.data}`);
  // TODO: implement!!

  var message = JSON.parse(event.data);

  switch (myRole) {
    case DISTINGUISHED_PROPOSER:
      if (message.round_type == REQUEST) {
        messageQueue.push(message);
      }
      break;
    case ACCEPTOR:
      if (message.round_type == PREPARE) {
        if (lastPrepareRankingVal > message.ranking_val) {
          // TODO: send message back about how I agreed to vote on something higher
        } else if (
          lastAcceptedRankingVal === lastPrepareRankingVal &&
          lastAcceptedRankingVal < message.ranking_val
        ) {
          // TODO: send message back agreeing to vote on this ballot
        } else if (true) {
        }
        // lastAccepted < message.ranking_val
        //       var agreedToVoteOn = 0;
        // var lastAccepted = 0;
        // var myRole = NO_ROLE;
    
        // // For proposer
        // var ranking_val = 1;
      } else if (message.round == ACCEPT) {
        switch (message.type) {
          case PAUSE:
            // TODO: implement
            break;
          case PLAY:
            // TODO: implement
            break;
          case PAUSE:
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
      break;
    case LEARNER:
      break;
    default:
      console.log("Received a new message, but client has no role")
      break;
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

// This function is called by UI when a client wants to initiate an action
async function initiateMessage(message) {

  switch (myRole) {
    case DISTINGUISHED_PROPOSER:
      messageQueue.push(message);
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

async function removeMessageFromQueue() {
  
}

init();
