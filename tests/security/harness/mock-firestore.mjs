/**
 * Mock Firestore & Security Rules Evaluation Harness
 * In-memory database with atomic transactions and rule validation simulator.
 */

export class MockFirestore {
  constructor() {
    this.collections = new Map();
  }

  _getCol(name) {
    if (!this.collections.has(name)) {
      this.collections.set(name, new Map());
    }
    return this.collections.get(name);
  }

  doc(path) {
    const segments = path.split('/').filter(Boolean);
    const colName = segments[0];
    const docId = segments[1];
    const subCol = segments[2];
    const subDocId = segments[3];

    const col = this._getCol(colName);
    return {
      id: docId,
      path,
      get: async () => {
        const data = col.get(docId);
        return {
          id: docId,
          exists: data !== undefined,
          data: () => (data !== undefined ? JSON.parse(JSON.stringify(data)) : undefined),
        };
      },
      set: async (data, options = {}) => {
        if (options.merge && col.has(docId)) {
          col.set(docId, { ...col.get(docId), ...data });
        } else {
          col.set(docId, JSON.parse(JSON.stringify(data)));
        }
      },
      update: async (data) => {
        if (!col.has(docId)) throw new Error(`Document ${path} not found for update`);
        const existing = col.get(docId);
        col.set(docId, { ...existing, ...data });
      },
      delete: async () => {
        col.delete(docId);
      },
    };
  }

  collection(colName) {
    const col = this._getCol(colName);
    const createQuery = (filters = [], orderBys = [], limitCount = null) => ({
      doc: (docId) => this.doc(`${colName}/${docId}`),
      where: (field, op, value) => createQuery([...filters, { field, op, value }], orderBys, limitCount),
      orderBy: (field, direction = 'asc') => createQuery(filters, [...orderBys, { field, direction }], limitCount),
      limit: (n) => createQuery(filters, orderBys, n),
      get: async () => {
        let results = [];
        for (const [id, data] of col.entries()) {
          let match = true;
          for (const f of filters) {
            if (f.op === '==' && data[f.field] !== f.value) match = false;
            if (f.op === 'in' && (!Array.isArray(f.value) || !f.value.includes(data[f.field]))) match = false;
          }
          if (match) {
            results.push({
              id,
              exists: true,
              data: () => JSON.parse(JSON.stringify(data)),
              ref: this.doc(`${colName}/${id}`),
            });
          }
        }
        for (const o of orderBys) {
          results.sort((a, b) => {
            const da = a.data()[o.field];
            const db = b.data()[o.field];
            if (da < db) return o.direction === 'desc' ? 1 : -1;
            if (da > db) return o.direction === 'desc' ? -1 : 1;
            return 0;
          });
        }
        if (limitCount !== null) {
          results = results.slice(0, limitCount);
        }
        return {
          empty: results.length === 0,
          size: results.length,
          docs: results,
        };
      },
    });
    return createQuery();
  }

  async runTransaction(updateFunction) {
    const transactionContext = {
      get: async (docRef) => docRef.get(),
      set: (docRef, data, options) => docRef.set(data, options),
      update: (docRef, data) => docRef.update(data),
      delete: (docRef) => docRef.delete(),
    };
    return updateFunction(transactionContext);
  }

  clear() {
    this.collections.clear();
  }
}

/**
 * Firestore Security Rules Evaluator matching firestore.rules specification
 */
export class FirestoreRulesEvaluator {
  constructor(db) {
    this.db = db;
    this.OWNER_WALLET = '11111111111111111111111111111111';
  }

  isValidUsername(username) {
    return (
      typeof username === 'string' &&
      username.length >= 3 &&
      username.length <= 15 &&
      /^[a-zA-Z0-9_]{3,15}$/.test(username)
    );
  }

  async isOwner(auth) {
    if (!auth || !auth.uid) return false;
    const userDoc = await this.db.doc(`users/${auth.uid}`).get();
    return userDoc.exists && userDoc.data()?.walletAddress === this.OWNER_WALLET;
  }

  async isAdmin(auth) {
    if (!auth || !auth.uid) return false;
    if (await this.isOwner(auth)) return true;
    const userDoc = await this.db.doc(`users/${auth.uid}`).get();
    if (!userDoc.exists) return false;
    const data = userDoc.data();
    return data?.isAdmin === true || data?.role === 'admin';
  }

  /**
   * Evaluate user creation rule on users/{userId}
   */
  async evaluateUserCreate({ auth, userId, incomingData }) {
    if (!auth || !auth.uid) return { allowed: false, reason: 'Unauthenticated' };
    if (auth.uid !== userId) return { allowed: false, reason: 'Auth UID mismatch' };

    const allowedKeys = ['walletAddress', 'username', 'createdAt', 'avatarUrl', 'bannerUrl', 'isTestUser'];
    const keys = Object.keys(incomingData);
    const hasOnlyAllowedKeys = keys.every((k) => allowedKeys.includes(k));
    if (!hasOnlyAllowedKeys) {
      return { allowed: false, reason: 'Unauthorized fields present in user document (keys.hasOnly violation)' };
    }

    if (!incomingData.username || !this.isValidUsername(incomingData.username)) {
      return { allowed: false, reason: 'Invalid username format or length' };
    }

    if (
      incomingData.walletAddress !== null &&
      incomingData.walletAddress !== undefined &&
      (typeof incomingData.walletAddress !== 'string' || incomingData.walletAddress.length > 100)
    ) {
      return { allowed: false, reason: 'Invalid walletAddress' };
    }

    return { allowed: true };
  }

  /**
   * Evaluate user update rule on users/{userId}
   */
  async evaluateUserUpdate({ auth, userId, existingData, incomingData }) {
    if (!auth || !auth.uid) return { allowed: false, reason: 'Unauthenticated' };
    const isOwnerUser = await this.isOwner(auth);

    // Calculate changed keys
    const changedKeys = Object.keys(incomingData).filter(
      (k) => incomingData[k] !== existingData[k]
    );

    // Owner can change admin/role
    if (isOwnerUser) {
      const allowedOwnerKeys = ['isAdmin', 'role', 'avatarUrl', 'bannerUrl', 'walletAddress', 'username'];
      if (changedKeys.every((k) => allowedOwnerKeys.includes(k))) {
        return { allowed: true };
      }
    }

    // Normal user update
    if (auth.uid === userId) {
      const allowedUserKeys = ['avatarUrl', 'bannerUrl', 'walletAddress', 'username'];
      const hasOnlyAllowed = changedKeys.every((k) => allowedUserKeys.includes(k));
      if (!hasOnlyAllowed) {
        return { allowed: false, reason: 'Cannot mutate privileged or restricted fields (e.g. isAdmin, role)' };
      }
      if (incomingData.username && !this.isValidUsername(incomingData.username)) {
        return { allowed: false, reason: 'Invalid username' };
      }
      return { allowed: true };
    }

    return { allowed: false, reason: 'Unauthorized user update' };
  }

  /**
   * Evaluate username document create on usernames/{username}
   */
  async evaluateUsernameCreate({ auth, username, incomingData }) {
    if (!auth || !auth.uid) return { allowed: false, reason: 'Unauthenticated' };
    if (!this.isValidUsername(username)) {
      return { allowed: false, reason: 'Username must match ^[a-zA-Z0-9_]{3,15}$' };
    }
    if (incomingData.uid !== auth.uid) {
      return { allowed: false, reason: 'UID in payload must match auth.uid' };
    }
    const keys = Object.keys(incomingData);
    if (keys.length !== 1 || keys[0] !== 'uid') {
      return { allowed: false, reason: 'Document must only contain { uid }' };
    }
    return { allowed: true };
  }

  /**
   * Evaluate game create rule on games/{gameId}
   */
  async evaluateGameCreate({ auth, gameId, incomingData }) {
    if (!auth || !auth.uid) return { allowed: false, reason: 'Unauthenticated' };
    if (incomingData.player1 !== auth.uid) {
      return { allowed: false, reason: 'Creator must be player1' };
    }
    if (incomingData.status !== 'waiting') {
      return { allowed: false, reason: 'Initial status must be waiting' };
    }
    if (
      typeof incomingData.wager !== 'number' ||
      isNaN(incomingData.wager) ||
      incomingData.wager < 0 ||
      incomingData.wager > 100
    ) {
      return { allowed: false, reason: 'Wager must be a number between 0 and 100' };
    }
    if (incomingData.wagerCurrency === 'FREE' && incomingData.wager !== 0) {
      return { allowed: false, reason: 'Free game wager must be 0' };
    }
    return { allowed: true };
  }

  /**
   * Evaluate game update rule on games/{gameId} (Join, Move, Heartbeat)
   */
  async evaluateGameUpdate({ auth, gameId, existingData, incomingData }) {
    if (!auth || !auth.uid) return { allowed: false, reason: 'Unauthenticated' };
    if (existingData.status === 'finished') {
      return { allowed: false, reason: 'Cannot update finished game' };
    }

    // Joining game action
    if (existingData.status === 'waiting' && ['active', 'joining'].includes(incomingData.status)) {
      // Must not mutate player1 or wager
      if (incomingData.player1 !== existingData.player1) {
        return { allowed: false, reason: 'Cannot mutate player1 upon join' };
      }
      if (incomingData.wager !== existingData.wager || incomingData.wagerCurrency !== existingData.wagerCurrency) {
        return { allowed: false, reason: 'Cannot mutate wager upon join' };
      }
      if (existingData.p1DepositTx && incomingData.p1DepositTx !== existingData.p1DepositTx) {
        return { allowed: false, reason: 'Cannot alter host deposit signature' };
      }
      if (incomingData.turn && ![existingData.player1, auth.uid].includes(incomingData.turn)) {
        return { allowed: false, reason: 'Turn upon join must be set to player1 or joiner' };
      }
      const allowedJoinKeys = [
        'player2',
        'player2Name',
        'player2Avatar',
        'player2IsTest',
        'player2Wallet',
        'p2DepositTx',
        'players',
        'status',
        'turn',
        'escrowStatus',
        'updatedAt',
      ];
      const changedKeys = Object.keys(incomingData).filter((k) => incomingData[k] !== existingData[k]);
      if (!changedKeys.every((k) => allowedJoinKeys.includes(k))) {
        return { allowed: false, reason: 'Invalid fields modified during join' };
      }
      return { allowed: true };
    }

    // Move or Finish action
    if (existingData.status === 'active') {
      const isParticipant = existingData.player1 === auth.uid || existingData.player2 === auth.uid;
      if (!isParticipant) {
        return { allowed: false, reason: 'Only match participants can make moves or heartbeats' };
      }
      const allowedActiveKeys = [
        'board',
        'turn',
        'updatedAt',
        'status',
        'winner',
        'player1Heartbeat',
        'player2Heartbeat',
      ];
      const changedKeys = Object.keys(incomingData).filter((k) => incomingData[k] !== existingData[k]);
      if (!changedKeys.every((k) => allowedActiveKeys.includes(k))) {
        return { allowed: false, reason: 'Cannot modify immutable game fields (e.g. player1, wager) during active game' };
      }
      return { allowed: true };
    }

    return { allowed: false, reason: 'Invalid game update state transition' };
  }

  /**
   * Evaluate message create rule on games/{gameId}/messages/{messageId}
   */
  async evaluateMessageCreate({ auth, gameId, gameData, messageData }) {
    if (!auth || !auth.uid) return { allowed: false, reason: 'Unauthenticated' };
    if (messageData.senderId !== auth.uid) {
      return { allowed: false, reason: 'Sender ID must match auth UID' };
    }
    if (!gameData) {
      return { allowed: false, reason: 'Target game does not exist' };
    }
    const isParticipant = gameData.player1 === auth.uid || gameData.player2 === auth.uid;
    const admin = await this.isAdmin(auth);
    if (!isParticipant && !admin) {
      return { allowed: false, reason: 'Only match participants can send messages' };
    }
    if (
      typeof messageData.text !== 'string' ||
      messageData.text.trim().length === 0 ||
      messageData.text.length > 200
    ) {
      return { allowed: false, reason: 'Message length must be between 1 and 200 characters' };
    }
    return { allowed: true };
  }

  /**
   * Evaluate read/list rule on admin_history/{historyId}
   */
  async evaluateAdminHistoryRead({ auth }) {
    if (!auth || !auth.uid) return { allowed: false, reason: 'Unauthenticated' };
    const isAdminUser = await this.isAdmin(auth);
    if (!isAdminUser) {
      return { allowed: false, reason: 'Permission denied: Only administrators can read admin_history' };
    }
    return { allowed: true };
  }

  /**
   * Evaluate write rule on admin_history/{historyId} (create/update/delete)
   */
  async evaluateAdminHistoryWrite({ auth }) {
    // Client write is strictly prohibited; all records are server-authoritative
    return { allowed: false, reason: 'Client writes to admin_history are forbidden' };
  }
}
