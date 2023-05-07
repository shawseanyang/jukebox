import firebase from "firebase/compat/app";
import "firebase/compat/firestore";
import { UrlWithStringQuery } from "url";
import { Song } from "./types/Music";
import {Mutex} from 'async-mutex';
import { release } from "os";

/*

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

// Initalize firebase app
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY || '',
  authDomain: "jukebox-eecb0.firebaseapp.com",
  databaseURL: "https://jukebox-eecb0-default-rtdb.firebaseio.com",
  projectId: "jukebox-eecb0",
  storageBucket: "jukebox-eecb0.appspot.com",
  messagingSenderId: "975391862639",
  appId: process.env.FIREBASE_APP_ID || '',
  measurementId: "G-QRXSJFRWHJ"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// For connection setup
const answererCandidateString : string = "answererCandidates";
const offererCandidateString : string = "offererCandidates";

// Global state of the session
var myUserID : string = "";
var sessionId : string = "";
var consensusMajority : number = 0; // Number of acceptors is floor((consensusMajority - 1)/2) + 1
var currMembers: Set<string> = new Set();
const membership_mutex : Mutex = new Mutex();

// For sending messages and keeping track of connections
var userToConnection: {[id: string]: RTCPeerConnection} = {};
var userToDataChannel: {[id: string]: RTCDataChannel} = {};

// Role strings
const DISTINGUISHED_PROPOSER = "distingushed-proposer";
const ACCEPTOR = "acceptor";
const LEARNER = "learner";
const NO_ROLE = "none";

// Message interface
interface message {
  message_type: number;
  round_type: number;
  messageID?: string;
  ranking_val?: number;
  timestamp?: number;
  song?: Song | null;
  must_accept?: boolean;
  index?: number;
  joiningMember?: string;
  queue?: Song[];
  isPlaying?: boolean;
  player?: Spotify.Player | null;
}

// Consensus globals
var lastPrepareRankingVal = 0;
const last_prepare_ranking_val_mutex = new Mutex();
var lastAcceptedRankingVal = 0;
const last_accepted_ranking_val_mutex = new Mutex();
var myRole = NO_ROLE;
const roleMutex = new Mutex;

// For proposer
var ranking_val = 1;
const ranking_val_mutex = new Mutex();
var roundInProgress = false;
const round_in_progress_mutex = new Mutex();
var messageQueue: message[] = [];
const message_queue_mutex = new Mutex();
var promises = 0;
const promises_mutex = new Mutex();
var acceptances = 0;
const acceptances_mutex = new Mutex();

// For acceptor and learner
var messageIDInt = 0
var operationsInProgressQueue: message[] = [];

// For learner
var lastLearned = 0;
const last_learned_mutex = new Mutex();

// Message types
const TOGGLE = 1;
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
const JOINING = 14;

// Default RTCPeerConnection configuration
const configuration = {
  iceServers: [
    {
      urls: ["stun:stun1.l.google.com:19302", "stun:stun2.l.google.com:19302"],
    },
  ],
  iceCandidatePoolSize: 10,
};

// Creates user entry in database
async function addUser() {
  console.log("Adding user");

  // Get user document and subscribe to changes for connection purposes
  const db = firebase.firestore();
  const userRef = await db.collection("userOffers").add({ nothing: 0 });
  myUserID = userRef.id;

  userRef.collection("offers").onSnapshot((snapshot) => {
    snapshot.docChanges().forEach(handleNewOffer);
  });

  userRef.collection("answers").onSnapshot((snapshot) => {
    snapshot.docChanges().forEach(handleNewAnswer);
  });

  console.log("I am user", myUserID);
  return myUserID
}

// Creates a session by adding an entry to the sessions table. This ID will be used
//    to join the session.
// Also adds an entry to the userOffers table which will be
//    used as a way to send and receive offers
async function createOrJoin(roomAlias: string) {
  // Create user before opening room
  await addUser();

  const db = firebase.firestore();

  // Determine if the session already exists and join/create a session as necessary
  db.collection("sessions")
    .where("alias", "==", roomAlias)
    .get().then((querySnapshot) => {
      querySnapshot.forEach((doc) => {
        sessionId = doc.id;
      });
      if (sessionId != '') {
        joinSession();
        return "joined";
      } else {
        createSession(roomAlias)
        return "created";
      }
  
      
    })
}

// Creates a new session with the roomAlias
async function createSession(roomAlias: string) {
  // Set role as distinguished proposer if creating session
  myRole = DISTINGUISHED_PROPOSER;

  // Add new session to database
  const db = firebase.firestore();

  const sessionEntry = {
    alias: roomAlias,
    users: [myUserID],
    personDropped: {
      role: NO_ROLE,
      ID: "",
    },
  };

  membership_mutex.acquire().then((release)=>{
    currMembers.add(myUserID);
    consensusMajority = 0;
    release();
  })

  const sessionRef = await db.collection("sessions").add(sessionEntry);

  // Subscribe to changes to the membership of the session
  sessionRef.onSnapshot(handleMembershipChange);
  sessionId = sessionRef.id;

  return sessionId
}

// Join session that corresponds with the room alias. This in turn gives
//    the user access to the session's entry in the Sessions table which
//    has the ID of all the users in it. Can then iterate over user IDs
//    and send them all offers to create peer connections and data channels
async function joinSession() {
  // Get info for the session
  const db = firebase.firestore();
  const sessionRef = db.collection("sessions").doc(`${sessionId}`);
  const sessionSnapshot = await sessionRef.get();
  console.log("Got session:", sessionSnapshot.exists);

  // Get user info
  if (sessionSnapshot.exists) {
    for (let ID of sessionSnapshot?.data()?.users) {
      console.log(`Found user ${ID} in session!`);
      sendPeerConnectionOffer(ID);
    }

  }

  // Update session membership doc with yourself
  const userList = sessionSnapshot?.data()?.users;
  userList.push(myUserID);

  sessionRef
    .update({
      users: userList,
    })
    .then(() => {
      console.log("Membership updated!");
    });
  
  // Set globals
  membership_mutex.acquire().then((release)=>{
    currMembers = new Set(userList);
    currMembers.add(myUserID);
    consensusMajority = Math.floor((currMembers.size - 1) / 2) + 1;
    release();
  })

  // Subscribe to changes in the membership of the session
  sessionRef.onSnapshot(handleMembershipChange);

  return currMembers;
}

// Sends offers to connect from the new joiner of a session to people in the session
async function sendPeerConnectionOffer(ID : string) {
  const db = firebase.firestore();

  // Make a new connection
  const peerConnection = new RTCPeerConnection(configuration);
  userToConnection[ID] = peerConnection;

  // Use the connection to make a data channel
  console.log(`Creating data channel with ${ID}.`);
  const dataChannel = userToConnection[ID].createDataChannel(
    `${myUserID}-${ID} data channel`
  );
  userToDataChannel[ID] = dataChannel;

  // Add event handler for error, open, close and message
  userToDataChannel[ID].onerror = () => {
    console.log(`Data channel to ${ID} had error.`);
    userToDataChannel[ID].close();
  };
  userToDataChannel[ID].onopen = () => {
    console.log(`Data channel to ${ID} is open`);
  };
  userToDataChannel[ID].onclose = () => {
    console.log(`Data channel to ${ID} is closed`);
  };

  // Make the data channel listen for messages
  userToDataChannel[ID].onmessage = handleNewMessage;

  registerPeerConnectionListeners(ID);

  // Create an offer to connect with someone, add the offer to their offer document
  const offer = await userToConnection[ID].createOffer();
  await userToConnection[ID].setLocalDescription(offer);
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

// Pass in the ID of a peer connection to add event listeners to that connection
function registerPeerConnectionListeners(ID: string) {
  userToConnection[ID].addEventListener(
    "icegatheringstatechange",
    () => {
      console.log(
        `ICE gathering state changed: ${userToConnection[ID].iceGatheringState}`
      );
    }
  );

  userToConnection[ID].addEventListener(
    "connectionstatechange",
    async () => {
      const db = firebase.firestore();
      switch (userToConnection[ID].connectionState) {
        case "connecting":
          console.log(`Connecting to ${ID}`);
          break;
        case "connected":
          console.log(`Connected to ${ID}`);
          break;
        case "failed":
          // Attempt to reconnect if the connection failed
          console.log(
            `Connection to ${ID} failed. One or more of ICE transports has failed`
          );
          console.log(`Attempting to reconnect with ${ID}`);
          userToConnection[ID].close();
          delete userToConnection[ID];
          sendPeerConnectionOffer(ID);
          currMembers.delete(ID);
          break;
        case "disconnected":
          // Remove person if disconnected. Update the group membership doc so others can disconnect them too
          console.log(`Disconnected from ${ID}`);
          const sessionRef = db.collection("sessions").doc(`${sessionId}`);
          const sessionSnapshot = await sessionRef.get();
          const sessionMembers = sessionSnapshot?.data()?.users;

          const idxToRemove = sessionMembers.indexOf(ID);
          if (idxToRemove > -1) {
            sessionMembers.splice(idxToRemove, 1);
          }
          
          // Determine role of person removed
          var roleRemoved;
          if (idxToRemove === 0) {
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
              role: roleRemoved,
            },
          });
          console.log(`Removed user ${ID}`);
          
          // Clean up conenction information
          if (ID in userToConnection) {
            if (userToDataChannel[ID].readyState === "open") {
              userToDataChannel[ID].close();
            }
            userToConnection[ID].close();
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
    }
  );

  userToConnection[ID].addEventListener(
    "signalingstatechange",
    () => {
      console.log(
        `Signaling state change: ${userToConnection[ID].signalingState}`
      );
    }
  );

  userToConnection[ID].addEventListener(
    "iceconnectionstatechange ",
    () => {
      console.log(
        `ICE connection state change: ${userToConnection[ID].iceConnectionState}`
      );
    }
  );
}

// For a client to handle a new offer for connection
async function handleNewOffer(change: firebase.firestore.DocumentChange) {
  // Making a peerconnection for the new offer
  const db = firebase.firestore();
  const offer = {
    type: change.doc.data().type,
    sdp: change.doc.data().sdp,
  };
  const otherUserID = change.doc.data().id;
  console.log(`New offer from ${otherUserID}: `, offer);
  const peerConnection = new RTCPeerConnection(configuration);
  userToConnection[otherUserID] = peerConnection;

  registerPeerConnectionListeners(otherUserID);

  // Creating a data channel between current client and the client proposing 
  //  a connection when the other client attempts to create a data channel
  userToConnection[otherUserID].addEventListener(
    "datachannel",
    async (event) => {
      console.log("New data channel: ", event);
      const dataChannel = event.channel;
      userToDataChannel[otherUserID] = dataChannel;

      // Add event handler for error, close, open and message
      userToDataChannel[otherUserID].onerror = () => {
        console.log(`Data channel to ${otherUserID} had error.`);
        userToDataChannel[otherUserID].close();
      };
      userToDataChannel[otherUserID].onopen = () => {
        console.log(`Data channel to ${otherUserID} is open`);
        if (myRole === DISTINGUISHED_PROPOSER) {
          triggerSendState(otherUserID);
        }
      };
      userToDataChannel[otherUserID].onclose = () => {
        console.log(`Data channel to ${otherUserID} is closed`);
      };
      userToDataChannel[otherUserID].onmessage = handleNewMessage;

      console.log("Added listener: ", dataChannel);
    }
  );

  await userToConnection[otherUserID].setRemoteDescription(
    offer
  );

  const answer = await userToConnection[
    otherUserID
  ].createAnswer();

  await userToConnection[otherUserID].setLocalDescription(
    answer
  );
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

  membership_mutex.acquire().then((release)=>{
    currMembers.add(otherUserID);
    consensusMajority = Math.floor((currMembers.size - 1) / 2) + 1;
    release();
  })
}

async function handleNewAnswer(change: firebase.firestore.DocumentChange) {
  const answerObj = {
    type: change.doc.data().type,
    sdp: change.doc.data().sdp,
  };
  const otherUserID = change.doc.data().id;

  console.log(`New answer from ${otherUserID}: `, answerObj);
  await userToConnection[otherUserID].setRemoteDescription(
    answerObj
  );
  await addICECollection(
    myUserID,
    otherUserID,
    otherUserID,
    offererCandidateString,
    answererCandidateString
  );

}

async function addICECollection(
  offererUserID : string,
  answererUserID : string,
  peerConnectionID: string,
  localName : string,
  remoteName : string
) {
  const db = firebase.firestore();
  const entryRef = await db
    .collection("sessions")
    .doc(`${sessionId}`)
    .collection("ICECollections")
    .doc(`${offererUserID}${answererUserID}`);

  const candidatesCollection = entryRef.collection(localName);
  userToConnection[peerConnectionID].addEventListener(
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
        await userToConnection[peerConnectionID].addIceCandidate(
          data
        );
      }
    });
  });
}

// Handles changes in session membership
async function handleMembershipChange(snapshot: firebase.firestore.DocumentSnapshot) {
  const memberList = snapshot?.data()?.users;
  const droppedRole = snapshot?.data()?.personDropped.role;
  const id = snapshot?.data()?.personDropped.ID;
  console.log("Update to group membership.");
  console.log(`Person dropped: ${id}`);

  let myNewRole = "";

  // Recalculates role
  for (let i = 0; i<memberList.length; i++) {
    let member = memberList[i];
    if (member === myUserID) {
      if (i === 0) {
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
      if (userToDataChannel[id].readyState === "open") {
        userToDataChannel[id].close();
      }
      userToConnection[id].close();
      currMembers.delete(id);
      delete userToConnection[id];
    }

    switch (myNewRole) {
      // If I'm now a proposer, I could've been either an acceptor or a proposer already
      case DISTINGUISHED_PROPOSER:
        switch (myRole) {
          case DISTINGUISHED_PROPOSER:
            const currConsensusMajority = consensusMajority;
            round_in_progress_mutex.acquire().then((releaseRoundInProgress)=>{
              if (droppedRole == ACCEPTOR && roundInProgress) {
                promises_mutex.acquire().then((releasePromises)=>{
                  if (promises >= currConsensusMajority) {
                    // Person dropped while an accept round was in progress
                    message_queue_mutex.acquire().then((releaseMessageQueue)=>{
                      messageQueue[0].round_type = ACCEPT;
                      messageQueue[0].must_accept = true;
                      sendMessage(messageQueue[0], ACCEPTOR);
                      releaseMessageQueue();
                    })
                  } else if (promises < currConsensusMajority) {
                    // Person dropped while a prepare round was in progress
                    //  Restart last round with a higher ranking_val
                    ranking_val_mutex.acquire().then((releaseRankingVal)=>{
                      ranking_val++;
                      releaseRankingVal();
                    })
                    startRound();
                  }
                  releasePromises();
                })
              }
              releaseRoundInProgress();
            })

            break;
          case ACCEPTOR:
            last_prepare_ranking_val_mutex.acquire().then(function(release){
              resetProposerGlobals(lastPrepareRankingVal);
              release();
            })

            messageQueue = [...operationsInProgressQueue];
            operationsInProgressQueue = [];

            break;
          default:
            console.log("Had no valid former role:", myRole);
        }

        break;
      case ACCEPTOR:
        // Send operations that were in progress when the last proposer failed to the new proposer
        if (droppedRole === DISTINGUISHED_PROPOSER) {
          for (let operation of operationsInProgressQueue) {
            sendMessage(operation, DISTINGUISHED_PROPOSER);
          }
        }
        break;
      case LEARNER:
        // Send operations that were in progress when the last proposer failed to the new proposer
        if (droppedRole === DISTINGUISHED_PROPOSER) {
          for (let operation of operationsInProgressQueue) {
            sendMessage(operation, DISTINGUISHED_PROPOSER);
          }
        }
        break;
      default:
        console.log(
          "Invalid role assignment, you're calculating roles incorrectly"
        );
    }

    // Remove person from data structures
    currMembers = new Set(memberList);
  } else if (memberList.length > currMembers.size) {
  }

  var oldRole;
  roleMutex.acquire().then((release)=>{
    oldRole = myRole;
    myRole = myNewRole;
    release();
  })

  membership_mutex.acquire().then((release) => {
    consensusMajority = Math.floor((memberList.size - 1) / 2) + 1;
    release();
  })

  return { newRole: myNewRole, oldRole: oldRole};

}

// Resets globals relevant to being a proposer
function resetProposerGlobals(lastRankingVal : number) {
  ranking_val_mutex.acquire().then((release)=>{
    ranking_val = lastRankingVal + 1;
    release();
  })
  
  round_in_progress_mutex.acquire().then((release)=>{
    roundInProgress = false;
    release();
  })
  
  message_queue_mutex.acquire().then((release)=>{
    messageQueue = [];
    release();
  })
  
  promises_mutex.acquire().then((release)=>{
    promises = 0;
    release();
  })
  
  acceptances_mutex.acquire().then((release)=>{
    acceptances = 0;
    release();
  })
  
}

// Sends a message to the specified recipient class (DISTINGUISHED_PROPOSER|ACCEPTOR|LEARNER)
async function sendMessage(message: message, recipient : string) {
  // let message = document.querySelector("#message-test-id").value;
  console.log(`about to send message ${JSON.stringify(message)} to recipient ${recipient} with ranking val ${message.ranking_val} and message type ${message.message_type}`);

  const sessionMembersArray : string[] = Array.from(currMembers);
  console.log("Current members: ", sessionMembersArray);

  for (let i = 0; i < sessionMembersArray.length; i++) {
    let ID : string = sessionMembersArray[i];

    if (i === 0 && recipient === DISTINGUISHED_PROPOSER) {
      console.log("Sending message to proposer");
      userToDataChannel[ID].send(JSON.stringify(message));
    } else if (
      i > 0 &&
      i < Math.floor((sessionMembersArray.length - 1) / 2) + 2 &&
      recipient === ACCEPTOR
    ) {
      console.log("Sending message to acceptor");
      userToDataChannel[ID].send(JSON.stringify(message));
    } else if (
      i > Math.floor((sessionMembersArray.length - 1) / 2) + 1 &&
      i < sessionMembersArray.length &&
      recipient === LEARNER
    ) {
      console.log("Sending message to learner");
      userToDataChannel[ID].send(JSON.stringify(message));
    }
  }
}

// Called when a data channel receives a new message
async function handleNewMessage(event: MessageEvent) {
  var message = JSON.parse(event.data);
  console.log(`new message of ${JSON.stringify(message)} with ranking val ${message.ranking_val} and message type ${message.message_type}`);

  // Handle according to role
  switch (myRole) {
    case DISTINGUISHED_PROPOSER:
      switch (message.round_type) {
        case REQUEST:
         message_queue_mutex.acquire().then((release)=>{
            // Add requests for operations to the queue
            messageQueue.push(message);

            // Starts consensus round if there isn't already anything in the queue
            if (messageQueue.length === 1) {
              startRound();
            }

            release();
          })
          break;

        case PROMISE:
          ranking_val_mutex.acquire().then((releaseRankingVal)=>{
            if (message.ranking_val === ranking_val) {
              promises_mutex.acquire().then((releasePromises)=>{
                promises++;
                const currConsensusMajority = consensusMajority;
                if (promises === currConsensusMajority) {
                  message.round_type = ACCEPT;
                  sendMessage(message, ACCEPTOR);
    
                  updateDataStructures(message);
                  promises = 0;
                }
                releasePromises();
              })
            }
            releaseRankingVal();
          })
          break;

        case CANT_PROMISE:
          // Update ranking val and start round again with a higher ranking val
          ranking_val_mutex.acquire().then((release) => {
            ranking_val = message.ranking_val + 1;
            message.ranking_val = ranking_val;
            release();
          })

          message.message_type = PREPARE;
          sendMessage(message, ACCEPTOR);
          break;

        case ACCEPTED:
          ranking_val_mutex.acquire().then((releaseRankingVal) => {
            if (message.ranking_val === ranking_val) {
              acceptances_mutex.acquire().then((releaseAcceptances) => {
                acceptances++;
                const currConsensusMajority = consensusMajority;
                if (acceptances === currConsensusMajority) {
                  acceptances = 0;

                  // Remove accepted message from queue
                  message_queue_mutex.acquire().then((releaseMessageQueue)=>{
                    messageQueue.shift();

                    // Increase ranking val to prepare for the next round
                    ranking_val++;

                    round_in_progress_mutex.acquire().then((releaseRoundInProgress) => {
                      roundInProgress = false;
                      releaseRoundInProgress();
                    })
                    // Start consensus round with next message, if it exists
                    if (messageQueue.length > 0) {
                      startRound();
                    }
                    releaseMessageQueue();
                  })
                  
                }
                releaseAcceptances();
              })
            }
            releaseRankingVal();
          })
          break;

        default:
          console.log(
            "Unrecognized round type for proposer:",
            message.round_type
          );
      }
      break;

    case ACCEPTOR:
      switch (message.round_type) {
        case PREPARE:
          last_prepare_ranking_val_mutex.acquire().then(function(release) {
            if (lastPrepareRankingVal > message.ranking_val) {
              message.round_type = CANT_PROMISE;
              message.ranking_val = lastPrepareRankingVal;
              sendMessage(message, DISTINGUISHED_PROPOSER);
            } else if (lastPrepareRankingVal < message.ranking_val) {
              // This number is higher than the last last number I promised to vote on, so I'll promise to vote on this
              lastPrepareRankingVal = message.ranking_val;
              message.round_type = PROMISE;
              sendMessage(message, DISTINGUISHED_PROPOSER);
            }
            
            release();
          })
          break;
        case ACCEPT:
          // Check if this is the round I agreed to vote on and that I haven't voted on it already

          last_prepare_ranking_val_mutex.acquire().then((releasePrepareMutex) => {
            last_accepted_ranking_val_mutex.acquire().then((releaseAcceptMutex) => {
              if (
                lastPrepareRankingVal === message.ranking_val &&
                message.ranking_val != lastAcceptedRankingVal
              ) {
                message.round_type = ACCEPTED;
    
                sendMessage(message, DISTINGUISHED_PROPOSER);
                lastAcceptedRankingVal = message.ranking_val;
    
                // If message type was valid, update data strucutres and notify learners
                if (
                  message.message_type === TOGGLE ||
                  message.message_type === PLAY ||
                  message.message_type === ADD ||
                  message.message_type === REMOVE ||
                  message.message_type === SCRUB ||
                  message.message_type === SKIP
                ) {
                  updateDataStructures(message);
                  message.round_type = LEARN;
                  sendMessage(message, LEARNER);

                  // Remove message from operations in progress queue
                  for (let i = operationsInProgressQueue.length-1; i>-1; i--) {
                    let operation = operationsInProgressQueue[i];
                    if (message.messageID === operation.messageID) {
                      operationsInProgressQueue.splice(i,1);
                    }
                  }
                }
              } else if (message.must_accept) {
                message.round_type = ACCEPTED;
    
                sendMessage(message, DISTINGUISHED_PROPOSER);
                updateDataStructures(message);


                lastPrepareRankingVal = message.ranking_val;
                lastAcceptedRankingVal = message.ranking_val;
    
              }

              releaseAcceptMutex();

            })
            
            releasePrepareMutex();

          })
          break;
        case JOINING:
          console.log("Triggering joiner match state event");
          triggerMatchState(message);

          break;
        default:
          console.log(
            "Unrecognized round type for acceptor:",
            message.round_type
          );
      }
      break;
    case LEARNER:
      switch (message.round_type) {
        case LEARN:
          // Learner updates data structures if they haven't already
          last_learned_mutex.acquire().then((release) => {
            if (message.ranking_val !== lastLearned) {
              updateDataStructures(message);
              lastLearned = message.ranking_val;
            }

            release();
          })

          for (let i = operationsInProgressQueue.length-1; i>-1; i--) {
            let operation = operationsInProgressQueue[i];
            if (message.messageID === operation.messageID) {
              operationsInProgressQueue.splice(i,1);
            }
          }

          break;
        case JOINING:
          console.log("Triggering joiner match state event");
          triggerMatchState(message);
  
          break;
        default:
          console.log(
            "Unrecognized round type for learner:",
            message.round_type
          );
      }
      break;
    default:
      console.log("Received a new message, but current client has no role");
      break;
  }
}

// This function is called by UI when a client wants to initiate an action.å
//  The client passes in the metadata for the action they want to initiate as per
//  the message schema above
async function initiateMessage(message: message) {
  console.log("Message initiated:", message)

  switch (myRole) {
    case DISTINGUISHED_PROPOSER:
      if (message.message_type === JOINING) {
        // Sends proposer's state to the new joining person
        userToDataChannel[message.joiningMember || ''].send(JSON.stringify(message));

      } else if (currMembers.size === 1) {
        // Updates data structures right away if no one else is in the session
        updateDataStructures(message);

      } else {

        // Adds message to queue
        message_queue_mutex.acquire().then((release)=>{
          messageQueue.push(message);

          // Starts round if that message is the only message in the queue
          if (messageQueue.length === 1) {
            startRound();
          }
          release();
        })
    
      } 
      
      break;
    case ACCEPTOR:
      // Tells the proposer to attempt to achieve consensus on an operation
      message.round_type = REQUEST;
      message.messageID = myUserID + messageIDInt.toString();
      operationsInProgressQueue.push(message);
      messageIDInt++;
      sendMessage(message, DISTINGUISHED_PROPOSER);
      break;
    case LEARNER:
      // Tells the proposer to attempt to achieve consensus on an operation
      message.round_type = REQUEST;
      message.messageID = myUserID + messageIDInt.toString();
      operationsInProgressQueue.push(message);
      messageIDInt++;
      sendMessage(message, DISTINGUISHED_PROPOSER);
      break;
    default:
      console.log("Attempted to initiate message, but the client has no role");
      break;
  }
}

// For proposer to handle consensus
function startRound() {
  console.log("Consensus round started")
  round_in_progress_mutex.acquire().then((release) => {
    roundInProgress = true;
    release();
  })
  messageQueue[0].ranking_val = ranking_val;
  messageQueue[0].round_type = PREPARE;
  sendMessage(messageQueue[0], ACCEPTOR);
}

// Tells the React client to update its state
function updateDataStructures(message: message) {
  console.log(`Updating data structures with ranking val ${message.ranking_val} and message type ${message.message_type}`)

  // Custom event for broadcasting updates
  const event = new CustomEvent("updateDataStructures", {detail: message});
  window.dispatchEvent(event);

}

// Tells the React client to send its state to the consensus/group membership code when a new person joins
function triggerSendState(userID : string) {
  console.log(`Starting to send state to new member ${userID}`);

  // Custom event for broadcasting updates
  const event = new CustomEvent("sendState", {detail: userID});
  window.dispatchEvent(event);
}

// Tells the React client to update its state to match the state in the message
function triggerMatchState(message : message) {
  const event = new CustomEvent("matchState", {detail: message});
  window.dispatchEvent(event);
}

function setMyUserID(newId: string) {
  myUserID = newId;
}

function setCurrMembers(newCurrMembers: string[]) {
  currMembers = new Set(newCurrMembers);
}

export { createOrJoin, initiateMessage, TOGGLE, PLAY, ADD, SCRUB, REMOVE, SKIP, JOINING, handleNewOffer,
  handleNewAnswer, handleMembershipChange,
  addICECollection,
  sendMessage,
  sendPeerConnectionOffer,
  createSession, joinSession, setMyUserID, setCurrMembers, myRole, triggerMatchState, triggerSendState, updateDataStructures, addUser};
