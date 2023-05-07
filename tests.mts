import firebase from "firebase/compat/app";
import "firebase/compat/firestore";
import { expect } from 'chai';
import { Song } from "./src/types/Music";

import {
    createSession,
    joinSession,
    handleMembershipChange,
    setMyUserID,
    setCurrMembers,
    triggerMatchState,
    triggerSendState,
    updateDataStructures,
    addUser,
    createOrJoin
    // Import other functions you want to test here
  } from './src/establishingConnections';
import { query } from "firebase/firestore";

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

async function membershipTests() {
    
}

describe('Firebase Mock Setup', () => {

  describe('handleMembershipChange', async () => {
    it('should change role based on changes to membership doc', async () => {
      const db = firebase.firestore()

      setMyUserID("mockUser1");

      var mockMembershipDoc = {
          alias: "mockRoom",
          users: ["mockuser 1"],
          personDropped: {
            role: '',
            ID: "",
          },
      }

      var collectionReference: firebase.firestore.CollectionReference = db.collection('test')
      var document: firebase.firestore.DocumentReference = await collectionReference.add(mockMembershipDoc)

      var mockSnapshot: firebase.firestore.DocumentSnapshot = {
      data: () => (mockMembershipDoc),
      metadata: {
          hasPendingWrites: false,
          fromCache: false,
          isEqual: () => true,
        },
        
        get: () => true, 
        ref: document,
        id: "mock-id",
        exists: true,
        isEqual: () => true,
    };

    setMyUserID("mockuser 1");
    setCurrMembers([]);
    
    // New person, becomes a proposer
    var roleInfo = await handleMembershipChange(mockSnapshot);
    expect(roleInfo.oldRole).to.equal("NO_ROLE")
    expect(roleInfo.newRole).to.equal("distinguished-proposer")

    setCurrMembers(["mockuser 1"]);

    mockMembershipDoc = {
      alias: "mockRoom",
      users: ["mockuser 1", "mockuser 2"],
      personDropped: {
        role: '',
        ID: "",
      },
    }

    // Another person added, original person stays a proposer
    roleInfo = await handleMembershipChange(mockSnapshot);
    expect(roleInfo.oldRole).to.equal("distinguished-proposer")
    expect(roleInfo.newRole).to.equal("distinguished-proposer")

    setMyUserID("mockuser 2") 
    setCurrMembers(["mockuser 1"]);

    // New person added, becomes an acceptor
    roleInfo = await handleMembershipChange(mockSnapshot);
    expect(roleInfo.oldRole).to.equal("NO_ROLE")
    expect(roleInfo.newRole).to.equal("acceptor")

    setMyUserID("mockuser 3")
    setCurrMembers(["mockuser 1", "mockuser 2"]);

    mockMembershipDoc = {
      alias: "mockRoom",
      users: ["mockuser 1", "mockuser 2", "mockuser 3"],
      personDropped: {
        role: '',
        ID: "",
      },
    }

    // Another new person added, becomes an acceptor
    roleInfo = await handleMembershipChange(mockSnapshot);
    expect(roleInfo.oldRole).to.equal("NO_ROLE")
    expect(roleInfo.newRole).to.equal("acceptor")

    setMyUserID("mockuser 4")
    setCurrMembers(["mockuser 1", "mockuser 2", "mockuser 3"]);

    mockMembershipDoc = {
      alias: "mockRoom",
      users: ["mockuser 1", "mockuser 2", "mockuser 3", "mockuser 4"],
      personDropped: {
        role: '',
        ID: "",
      },
    }

    // New person added, becomes a learner
    roleInfo = await handleMembershipChange(mockSnapshot);
    expect(roleInfo.oldRole).to.equal("NO_ROLE")
    expect(roleInfo.newRole).to.equal("learner")


    setCurrMembers(["mockuser 1", "mockuser 2", "mockuser 3", "mockuser 4"]);

    mockMembershipDoc = {
      alias: "mockRoom",
      users: ["mockuser 1", "mockuser 2", "mockuser 4"],
      personDropped: {
        role: 'acceptor',
        ID: "mockuser 3",
      },
    }

    // Mockuser 3 drops, mockuser 4 becomes an acceptor
    roleInfo = await handleMembershipChange(mockSnapshot);
    expect(roleInfo.oldRole).to.equal("learner")
    expect(roleInfo.newRole).to.equal("acceptor")

    setCurrMembers(["mockuser 1", "mockuser 2", "mockuser 4"]);

    mockMembershipDoc = {
      alias: "mockRoom",
      users: ["mockuser 1", "mockuser 4"],
      personDropped: {
        role: 'acceptor',
        ID: "mockuser 2",
      },
    }

    // Mockuser 2 drops, mockuser 4 remains an acceptor
    roleInfo = await handleMembershipChange(mockSnapshot);
    expect(roleInfo.oldRole).to.equal("acceptor")
    expect(roleInfo.newRole).to.equal("acceptor")

    setCurrMembers(["mockuser 1", "mockuser 4"]);

    mockMembershipDoc = {
      alias: "mockRoom",
      users: ["mockuser 4"],
      personDropped: {
        role: 'distinguished-proposer',
        ID: "mockuser 1",
      },
    }

    // Mockuser 1 drops, mockuser 4 becomes the proposer
    roleInfo = await handleMembershipChange(mockSnapshot);
    expect(roleInfo.oldRole).to.equal("acceptor");
    expect(roleInfo.newRole).to.equal("distinguished-proposer");
     
    });
  });

  describe('handleNewAnswer', () => {
    
  });

  describe('addICECollection', () => {
    
  });

  describe('addUser', () => {
    it('should add a new user to the database and return their id', async () => {
      const id = await addUser();

      const db = firebase.firestore()

      const queryResult = await db.collection('userOffers').doc(id).get();

      expect(queryResult).to.exist;
      expect(queryResult.id).to.equal(id);
      expect(queryResult?.data()?.nothing).to.equal(0);

      // Clean up
      db.collection('userOffers').doc(id).delete();
     
    });
  });

  describe('createOrJoin', () => {
    it('should create or join a session based on if the session already exists', async () => {
      const mockRoom = "mockRoom"
      const shouldCreate = await createOrJoin(mockRoom);
      
      expect(shouldCreate).to.equal("created");

      const shouldJoin = await createOrJoin(mockRoom)

      expect(shouldJoin).to.equal("joined")

      const db = firebase.firestore()

      // Cleanup
      db.collection('sessions').where("alias", "==", mockRoom).get().then((querySnapshot)=>{
        querySnapshot.forEach((doc)=> {
          db.collection('sessions').doc(doc.id).delete();
        })
      });

    });
  });

  describe('createSession', () => {
    it('should create a new session', async () => {
      // Setup
      const roomAlias = "mockAlias";
      const userID = "mockUserID";
      setMyUserID(userID);

      const sessionID = await createSession(roomAlias);

      const db = firebase.firestore();

      const queryResult = await db.collection('sessions').doc(roomAlias).get();

      // Tests
      expect(queryResult).to.exist;
      expect(queryResult.id).to.equal(sessionID);
      expect(queryResult?.data()?.alias).to.equal(roomAlias);
      expect(queryResult?.data()?.users).to.equal([userID]);
      expect(queryResult?.data()?.personDropped.role).to.equal("NO_ROLE");
      expect(queryResult?.data()?.personDropped.ID).to.equal("");

      // Cleanup
      db.collection('sessions').doc(sessionID).delete();

    });
  });

  describe('joinSession', () => {
    it('should join an existing session', async () => {
      // Setup
      const roomAlias = "mockAlias";
      const userID1 = "mockUserID1";
      const userID2 = "mockUserID2";

      setMyUserID(userID1);

      const sessionID = await createSession(roomAlias);

      setMyUserID(userID2);
      
      const currMembers = await joinSession()

      // Tests
      expect(currMembers[0]).to.equal(userID1);
      expect(currMembers[1]).to.equal(userID2);

      const db = firebase.firestore();
      const queryResult = await db.collection('sessions').doc(roomAlias).get();

      expect(queryResult).to.exist;
      expect(queryResult.id).to.equal(sessionID);
      expect(queryResult?.data()?.alias).to.equal(roomAlias);
      expect(queryResult?.data()?.users).to.equal([userID1, userID2]);
      expect(queryResult?.data()?.personDropped.role).to.equal("NO_ROLE");
      expect(queryResult?.data()?.personDropped.ID).to.equal("");

      // Cleanup
      db.collection('sessions').doc(sessionID).delete();

    });
  });

  describe('eventListenerTests', () => {
    it('should send custom events of the following format based on input', () => {
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

      window.addEventListener("updateDataStructures", ((event: CustomEvent) => {
        expect(event.detail.message_type).to.equal(1)
        expect(event.detail.round_type).to.equal(1)
        expect(event.detail.messageID).to.equal("mockUpdateDataStructures")
      }) as EventListener)

      window.addEventListener("sendState", ((event: CustomEvent) => {
        expect(event.detail.userID).to.equal("mockUserID")
      }) as EventListener)

      window.addEventListener("matchState", ((event: CustomEvent) => {
        expect(event.detail.message_type).to.equal(2)
        expect(event.detail.round_type).to.equal(2)
        expect(event.detail.messageID).to.equal("mockMatchState")
      }) as EventListener)

      const mockUpdateDataStructuresMessage: message = {
        message_type: 1,
        round_type: 1,
        messageID: "mockUpdateDataStructures"
      }

     updateDataStructures(mockUpdateDataStructuresMessage);

     const mockSendState = "mockUserID";

     triggerSendState(mockSendState);

     const mockMatchStateMessage: message = {
      message_type: 2,
      round_type: 2,
      messageID: "mockMatchState"
    }

    triggerMatchState(mockMatchStateMessage);

    });
  });
});