const { useState, useEffect } = React;

// ============================================
// INDEXEDDB - STOCKAGE PERSISTANT
// ============================================

const DB_NAME = 'PairingW40K';
const DB_VERSION = 1;
const STORE_NAME = 'appData';

const openDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
};

const saveToIndexedDB = async (key, value) => {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put({ id: key, data: value, timestamp: Date.now() });
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    return true;
  } catch (error) {
    console.error('Erreur sauvegarde IndexedDB:', error);
    return false;
  }
};

const loadFromIndexedDB = async (key) => {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(key);
    const result = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return result?.data || null;
  } catch (error) {
    console.error('Erreur chargement IndexedDB:', error);
    return null;
  }
};

// ============================================
// STRUCTURES DE DONNÉES
// ============================================

const SYMBOLS = ['++', '+', '=', '-', '--'];

const SYMBOL_CONFIG = {
  '++': { label: 'Très favorable', median: 17.5 },
  '+':  { label: 'Favorable', median: 12.5 },
  '=':  { label: 'Équilibré', median: 10 },
  '-':  { label: 'Défavorable', median: 7.5 },
  '--': { label: 'Très défavorable', median: 2.5 },
};

const PHASES = {
  1: { name: 'Défenseur 1', description: 'Chaque équipe choisit 1 défenseur' },
  2: { name: 'Attaquants', description: 'Chaque équipe choisit 2 attaquants' },
  3: { name: 'Assignation Défenseur 1', description: 'Chaque équipe assigne 1 attaquant adverse' },
  4: { name: 'Défenseur 2', description: 'Chaque équipe choisit 1 défenseur parmi les 4 restants' },
  5: { name: 'Attaquants + Oubliés', description: 'Chaque équipe choisit 2 attaquants' },
  6: { name: 'Assignation Finale', description: 'Assignation du défenseur 2' },
};

// ============================================
// FONCTIONS UTILITAIRES
// ============================================

const symbolToScore = (symbol) => SYMBOL_CONFIG[symbol]?.median || 10;

const getSymbolColor = (symbol) => {
  const colors = {
    '++': 'bg-green-600 text-white',
    '+': 'bg-green-400 text-white',
    '=': 'bg-gray-400 text-white',
    '-': 'bg-red-400 text-white',
    '--': 'bg-red-600 text-white',
  };
  return colors[symbol] || 'bg-gray-300';
};

const getResultColor = (score) => {
  if (score >= 66) return 'text-green-400';
  if (score >= 55) return 'text-yellow-400';
  return 'text-red-400';
};

const getResultLabel = (score) => {
  if (score >= 66) return 'Victoire';
  if (score >= 55) return 'Égalité';
  return 'Défaite';
};

// Génère toutes les permutations d'un tableau
const permutations = (arr) => {
  if (arr.length <= 1) return [arr];
  const result = [];
  for (let i = 0; i < arr.length; i++) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
    const restPerms = permutations(rest);
    for (const perm of restPerms) {
      result.push([arr[i], ...perm]);
    }
  }
  return result;
};

// Calcule le score d'un pairing complet (tableau de 6 indices adverses, position = notre joueur)
const calculatePairingScore = (pairing, matrix) => {
  let score = 0;
  for (let ourIdx = 0; ourIdx < 6; ourIdx++) {
    const theirIdx = pairing[ourIdx];
    score += symbolToScore(getMatrixValue(matrix, ourIdx, theirIdx));
  }
  return score;
};

// Calcule les statistiques min/max/moyenne de tous les pairings possibles
const calculatePairingStats = (matrix) => {
  const allPairings = permutations([0, 1, 2, 3, 4, 5]);
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  
  for (const pairing of allPairings) {
    const score = calculatePairingScore(pairing, matrix);
    min = Math.min(min, score);
    max = Math.max(max, score);
    sum += score;
  }
  
  return {
    min,
    max,
    avg: sum / allPairings.length,
    total: allPairings.length
  };
};

// Calcule la note de performance (0-100) basée sur la position relative
const calculatePerformanceRating = (score, min, max) => {
  if (max === min) return 50;
  return ((score - min) / (max - min)) * 100;
};

// Retourne la lettre de note basée sur le rating
const getPerformanceGrade = (rating) => {
  if (rating >= 90) return { grade: 'S', color: 'text-purple-400', label: 'Exceptionnel' };
  if (rating >= 75) return { grade: 'A', color: 'text-green-400', label: 'Excellent' };
  if (rating >= 60) return { grade: 'B', color: 'text-blue-400', label: 'Bon' };
  if (rating >= 45) return { grade: 'C', color: 'text-yellow-400', label: 'Correct' };
  if (rating >= 30) return { grade: 'D', color: 'text-orange-400', label: 'Insuffisant' };
  return { grade: 'E', color: 'text-red-400', label: 'Mauvais' };
};

// Calcule la distribution des pairings possibles selon l'état actuel + sélection en cours
const calculatePairingDistribution = (state, matrix, currentSelectionUs = [], currentSelectionThem = []) => {
  const distribution = { defeat: 0, draw: 0, victory: 0, total: 0 };
  
  if (!state || state.phase === 'finished') {
    return distribution;
  }
  
  // Score déjà accumulé par les duels fixés
  let fixedScore = 0;
  const fixedUs = new Set();
  const fixedThem = new Set();
  
  for (const duel of state.fixedDuels) {
    fixedScore += symbolToScore(getMatrixValue(matrix, duel.us, duel.them));
    fixedUs.add(duel.us);
    fixedThem.add(duel.them);
  }
  
  // Joueurs restants
  const remainingUs = [0, 1, 2, 3, 4, 5].filter(i => !fixedUs.has(i));
  const remainingThem = [0, 1, 2, 3, 4, 5].filter(i => !fixedThem.has(i));
  
  if (remainingUs.length === 0) {
    return distribution;
  }
  
  // Construire les contraintes : pour chaque joueur "nous", quels adversaires sont possibles ?
  const allowedOpponents = {};
  for (const us of remainingUs) {
    allowedOpponents[us] = new Set(remainingThem);
  }
  
  // Récupérer les valeurs actuelles du state
  let defender = state.us?.defender;
  let defenderThem = state.them?.defender;
  let attackersUs = state.us?.attackers || [];
  let attackersThem = state.them?.attackers || [];
  
  // IMPORTANT: Prendre en compte la sélection en cours pour simuler l'état après validation
  if (state.phase === 1 && currentSelectionUs.length === 1 && currentSelectionThem.length === 1) {
    // Simulation: les défenseurs seraient ceux sélectionnés
    defender = currentSelectionUs[0];
    defenderThem = currentSelectionThem[0];
  } else if (state.phase === 2 && currentSelectionUs.length === 2 && currentSelectionThem.length === 2) {
    // Simulation: les attaquants seraient ceux sélectionnés
    attackersUs = [...currentSelectionUs];
    attackersThem = [...currentSelectionThem];
  } else if (state.phase === 4 && currentSelectionUs.length === 1 && currentSelectionThem.length === 1) {
    // Simulation: les défenseurs 2 seraient ceux sélectionnés
    defender = currentSelectionUs[0];
    defenderThem = currentSelectionThem[0];
  } else if (state.phase === 5 && currentSelectionUs.length === 2 && currentSelectionThem.length === 2) {
    // Simulation: les attaquants 2 seraient ceux sélectionnés
    attackersUs = [...currentSelectionUs];
    attackersThem = [...currentSelectionThem];
  }
  
  // Appliquer les contraintes selon la phase (avec les valeurs simulées si sélection en cours)
  
  // Phase 1 : Les défenseurs ne peuvent pas s'affronter
  if (state.phase === 1 && defender !== null && defenderThem !== null) {
    if (allowedOpponents[defender]) {
      allowedOpponents[defender].delete(defenderThem);
    }
  }
  
  // Phase 2-3 : Le défenseur doit affronter un des 2 attaquants adverses
  if ((state.phase === 2 || state.phase === 3) && defender !== null && attackersThem.length === 2) {
    if (allowedOpponents[defender]) {
      allowedOpponents[defender] = new Set(attackersThem.filter(t => remainingThem.includes(t)));
    }
    // Leur défenseur doit affronter un de nos attaquants
    if (defenderThem !== null && attackersUs.length === 2) {
      for (const us of remainingUs) {
        if (!attackersUs.includes(us) && us !== defender) {
          allowedOpponents[us].delete(defenderThem);
        }
      }
    }
  }
  
  // Phase 4 : Les défenseurs 2 ne peuvent pas s'affronter
  if (state.phase === 4 && defender !== null && defenderThem !== null) {
    if (allowedOpponents[defender]) {
      allowedOpponents[defender].delete(defenderThem);
    }
  }
  
  // Phase 5-6 : Le défenseur 2 doit affronter un des 2 attaquants adverses
  if ((state.phase === 5 || state.phase === 6) && defender !== null && attackersThem.length === 2) {
    if (allowedOpponents[defender]) {
      allowedOpponents[defender] = new Set(attackersThem.filter(t => remainingThem.includes(t)));
    }
    // Leur défenseur doit affronter un de nos attaquants
    if (defenderThem !== null && attackersUs.length === 2) {
      for (const us of remainingUs) {
        if (!attackersUs.includes(us) && us !== defender) {
          allowedOpponents[us].delete(defenderThem);
        }
      }
    }
  }
  
  // Générer tous les pairings possibles pour les joueurs restants
  const themPerms = permutations(remainingThem);
  
  for (const themPerm of themPerms) {
    // themPerm[i] = adversaire du remainingUs[i]
    let valid = true;
    
    for (let i = 0; i < remainingUs.length; i++) {
      const us = remainingUs[i];
      const them = themPerm[i];
      if (!allowedOpponents[us].has(them)) {
        valid = false;
        break;
      }
    }
    
    if (!valid) continue;
    
    // Calculer le score de ce pairing
    let score = fixedScore;
    for (let i = 0; i < remainingUs.length; i++) {
      score += symbolToScore(getMatrixValue(matrix, remainingUs[i], themPerm[i]));
    }
    
    distribution.total++;
    if (score < 55) {
      distribution.defeat++;
    } else if (score <= 65) {
      distribution.draw++;
    } else {
      distribution.victory++;
    }
  }
  
  return distribution;
};

const combinations = (arr, k) => {
  if (!arr || arr.length === 0) return [];
  if (k === 1) return arr.map(x => [x]);
  if (k === arr.length) return [arr];
  if (k > arr.length) return [];
  const result = [];
  for (let i = 0; i <= arr.length - k; i++) {
    const head = arr[i];
    const tailCombos = combinations(arr.slice(i + 1), k - 1);
    for (const combo of tailCombos) {
      result.push([head, ...combo]);
    }
  }
  return result;
};

// ============================================
// DONNÉES PAR DÉFAUT - IDs DÉTERMINISTES
// ============================================

const createDefaultData = () => ({
  myTeam: {
    name: 'Mon Équipe',
    players: Array.from({ length: 6 }, (_, i) => ({
      id: `us_${i}`,
      pseudo: `Joueur ${i + 1}`,
      faction: '',
      factionShort: '',
      detachment: '',
    })),
  },
  opponents: Array.from({ length: 5 }, (_, i) => ({
    name: `Adversaire ${i + 1}`,
    players: Array.from({ length: 6 }, (_, j) => ({
      id: `opp${i}_${j}`,
      pseudo: '',
      faction: '',
      factionShort: '',
      detachment: '',
      armyList: '',
    })),
    matrix: Array.from({ length: 6 }, () => Array(6).fill('=')),
    isConfigured: false,
  })),
  rounds: Array.from({ length: 5 }, (_, i) => ({
    id: i,
    name: `Ronde ${i + 1}`,
    opponentIndex: null,
    scenario: '',
    deployment: '',
    pairingResult: null,
    duelScores: null,
  })),
  selectedOpponentIndex: 0,
  selectedRoundIndex: null, // null par défaut = pairing libre
});

// ============================================
// IMPORT / EXPORT JSON
// ============================================

const exportToJSON = (data) => {
  const exportData = {
    version: '1.0',
    exportDate: new Date().toISOString(),
    myTeam: {
      name: data.myTeam.name,
      players: data.myTeam.players.map(p => ({
        pseudo: p.pseudo,
        faction: p.faction,
        factionShort: p.factionShort,
        detachment: p.detachment || undefined,
      })),
    },
    opponents: data.opponents
      .filter(opp => opp.isConfigured)
      .map(opp => ({
        name: opp.name,
        players: opp.players.map(p => ({
          pseudo: p.pseudo || undefined,
          faction: p.faction,
          factionShort: p.factionShort,
          detachment: p.detachment || undefined,
          armyList: p.armyList || undefined,
        })),
        matrix: opp.matrix,
      })),
  };
  
  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `pairing_export.json`;
  a.click();
  URL.revokeObjectURL(url);
};

const importFromJSON = (jsonString) => {
  try {
    const imported = JSON.parse(jsonString);
    if (!imported.myTeam || !imported.opponents) {
      throw new Error('Format invalide');
    }
    
    // Créer les données avec des IDs DÉTERMINISTES basés sur la position
    const newData = {
      myTeam: {
        name: imported.myTeam.name,
        players: imported.myTeam.players.map((p, i) => ({
          id: `us_${i}`, // ID déterministe
          pseudo: p.pseudo || `Joueur ${i + 1}`,
          faction: p.faction || '',
          factionShort: p.factionShort || '',
          detachment: p.detachment || '',
        })),
      },
      opponents: Array.from({ length: 5 }, (_, i) => {
        const importedOpp = imported.opponents[i];
        if (importedOpp) {
          return {
            name: importedOpp.name,
            players: importedOpp.players.map((p, j) => ({
              id: `opp${i}_${j}`, // ID déterministe
              pseudo: p.pseudo || '',
              faction: p.faction || '',
              factionShort: p.factionShort || '',
              detachment: p.detachment || '',
              armyList: p.armyList || '',
            })),
            matrix: importedOpp.matrix,
            isConfigured: true,
          };
        }
        return {
          name: `Adversaire ${i + 1}`,
          players: Array.from({ length: 6 }, (_, j) => ({
            id: `opp${i}_${j}`,
            pseudo: '',
            faction: '',
            factionShort: '',
            detachment: '',
            armyList: '',
          })),
          matrix: Array.from({ length: 6 }, () => Array(6).fill('=')),
          isConfigured: false,
        };
      }),
      // Toujours initialiser les rounds
      rounds: Array.from({ length: 5 }, (_, i) => ({
        id: i,
        name: `Ronde ${i + 1}`,
        opponentIndex: null,
        scenario: '',
        deployment: '',
        pairingResult: null,
        duelScores: null,
      })),
      selectedOpponentIndex: 0,
      selectedRoundIndex: null,
    };
    
    return { success: true, data: newData };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

// ============================================
// CONVERSION MATRICE - INDEX BASED (pas IDs)
// ============================================

const getMatrixValue = (matrix, ourIndex, theirIndex) => {
  if (!matrix || !matrix[ourIndex]) return '=';
  return matrix[ourIndex][theirIndex] || '=';
};

// ============================================
// MOTEUR MAXIMIN
// ============================================

const generateLegalMoves = (state, side) => {
  const phase = state.phase;
  const sideState = side === 'us' ? state.us : state.them;
  
  if (!sideState || !sideState.available) return [];
  
  if (phase === 1 || phase === 4) {
    return sideState.available.map(idx => [idx]);
  }
  if (phase === 2 || phase === 5) {
    const available = sideState.available.filter(idx => idx !== sideState.defender);
    return combinations(available, 2);
  }
  if (phase === 3 || phase === 6) {
    const opposing = side === 'us' ? state.them : state.us;
    if (!opposing || !opposing.attackers) return [];
    return opposing.attackers.map(idx => [idx]);
  }
  return [];
};

const applyMove = (state, usMove, themMove) => {
  const newState = JSON.parse(JSON.stringify(state));
  
  // Initialiser pairingDetails si nécessaire
  if (!newState.pairingDetails) {
    newState.pairingDetails = { cycle1: {}, cycle2: {} };
  }
  
  if (state.phase === 1) {
    newState.us.defender = usMove[0];
    newState.them.defender = themMove[0];
    // Stocker les défenseurs du cycle 1
    newState.pairingDetails.cycle1.usDefender = usMove[0];
    newState.pairingDetails.cycle1.themDefender = themMove[0];
    newState.phase = 2;
  } else if (state.phase === 2) {
    newState.us.attackers = [...usMove];
    newState.them.attackers = [...themMove];
    // Stocker les attaquants du cycle 1
    newState.pairingDetails.cycle1.usAttackers = [...usMove];
    newState.pairingDetails.cycle1.themAttackers = [...themMove];
    newState.phase = 3;
  } else if (state.phase === 3) {
    const theirChosen = usMove[0];
    const ourChosen = themMove[0];
    // Stocker les attaquants choisis du cycle 1
    newState.pairingDetails.cycle1.themChosenAttacker = theirChosen;
    newState.pairingDetails.cycle1.usChosenAttacker = ourChosen;
    newState.fixedDuels.push({ us: newState.us.defender, them: theirChosen, type: 'defense', table: null });
    newState.fixedDuels.push({ us: ourChosen, them: newState.them.defender, type: 'attack', table: null });
    newState.us.available = newState.us.available.filter(idx => idx !== newState.us.defender && idx !== ourChosen);
    newState.them.available = newState.them.available.filter(idx => idx !== newState.them.defender && idx !== theirChosen);
    newState.us.defender = null;
    newState.us.attackers = [];
    newState.them.defender = null;
    newState.them.attackers = [];
    newState.phase = 4;
  } else if (state.phase === 4) {
    newState.us.defender = usMove[0];
    newState.them.defender = themMove[0];
    // Stocker les défenseurs du cycle 2
    newState.pairingDetails.cycle2.usDefender = usMove[0];
    newState.pairingDetails.cycle2.themDefender = themMove[0];
    newState.phase = 5;
  } else if (state.phase === 5) {
    newState.us.attackers = [...usMove];
    newState.them.attackers = [...themMove];
    // Stocker les attaquants du cycle 2
    newState.pairingDetails.cycle2.usAttackers = [...usMove];
    newState.pairingDetails.cycle2.themAttackers = [...themMove];
    const ourForgotten = newState.us.available.find(idx => idx !== newState.us.defender && !newState.us.attackers.includes(idx));
    const theirForgotten = newState.them.available.find(idx => idx !== newState.them.defender && !newState.them.attackers.includes(idx));
    // Stocker les oubliés
    newState.pairingDetails.forgotten = { us: ourForgotten, them: theirForgotten };
    newState.fixedDuels.push({ us: ourForgotten, them: theirForgotten, type: 'forgotten', table: null });
    newState.us.available = newState.us.available.filter(idx => idx !== ourForgotten);
    newState.them.available = newState.them.available.filter(idx => idx !== theirForgotten);
    newState.phase = 6;
  } else if (state.phase === 6) {
    const theirChosen2 = usMove[0];
    const ourChosen2 = themMove[0];
    // Stocker les attaquants choisis du cycle 2
    newState.pairingDetails.cycle2.themChosenAttacker = theirChosen2;
    newState.pairingDetails.cycle2.usChosenAttacker = ourChosen2;
    newState.fixedDuels.push({ us: newState.us.defender, them: theirChosen2, type: 'defense', table: null });
    newState.fixedDuels.push({ us: ourChosen2, them: newState.them.defender, type: 'attack', table: null });
    const ourRefused = newState.us.attackers.find(idx => idx !== ourChosen2);
    const theirRefused = newState.them.attackers.find(idx => idx !== theirChosen2);
    // Stocker les refusés
    newState.pairingDetails.refused = { us: ourRefused, them: theirRefused };
    newState.fixedDuels.push({ us: ourRefused, them: theirRefused, type: 'refused', table: null });
    newState.phase = 'finished';
  }
  
  return newState;
};

const calculateTeamScore = (duels, matrix) => {
  if (!duels || !matrix) return 0;
  return duels.reduce((total, duel) => {
    const symbol = getMatrixValue(matrix, duel.us, duel.them);
    return total + symbolToScore(symbol);
  }, 0);
};

// Calcule les meilleures combinaisons de pairing restantes
const calculateBestRemainingCombinations = (state, matrix, maxResults = 25) => {
  if (!state || !matrix) return [];
  
  // Joueurs déjà fixés
  const fixedUs = state.fixedDuels.map(d => d.us);
  const fixedThem = state.fixedDuels.map(d => d.them);
  
  // Score des duels déjà fixés
  const fixedScore = calculateTeamScore(state.fixedDuels, matrix);
  
  // Joueurs restants disponibles
  const remainingUs = [0, 1, 2, 3, 4, 5].filter(i => !fixedUs.includes(i));
  const remainingThem = [0, 1, 2, 3, 4, 5].filter(i => !fixedThem.includes(i));
  
  // Si pairing terminé ou pas de joueurs restants
  if (remainingUs.length === 0 || remainingThem.length === 0) {
    return [{
      duels: state.fixedDuels.map(d => ({ us: d.us, them: d.them })),
      score: fixedScore,
      isComplete: true
    }];
  }
  
  // Générer toutes les permutations des joueurs adverses restants
  const theirPermutations = permutations(remainingThem);
  
  // Calculer le score pour chaque combinaison
  const combinations = theirPermutations.map(theirOrder => {
    const newDuels = remainingUs.map((ourIdx, i) => ({
      us: ourIdx,
      them: theirOrder[i]
    }));
    
    const additionalScore = newDuels.reduce((sum, d) => {
      return sum + symbolToScore(getMatrixValue(matrix, d.us, d.them));
    }, 0);
    
    return {
      duels: [...state.fixedDuels.map(d => ({ us: d.us, them: d.them, fixed: true })), ...newDuels],
      score: fixedScore + additionalScore,
      fixedScore,
      additionalScore,
      newDuels
    };
  });
  
  // Trier par score décroissant et limiter aux maxResults premiers
  combinations.sort((a, b) => b.score - a.score);
  return combinations.slice(0, maxResults);
};

let analysisCache = new Map();

const computeGuaranteedScore = (state, matrix) => {
  if (state.phase === 'finished') {
    return calculateTeamScore(state.fixedDuels, matrix);
  }
  
  const cacheKey = JSON.stringify({
    phase: state.phase,
    usAvail: state.us.available.slice().sort(),
    themAvail: state.them.available.slice().sort(),
    usDef: state.us.defender,
    themDef: state.them.defender,
    usAtt: state.us.attackers.slice().sort(),
    themAtt: state.them.attackers.slice().sort(),
    duels: state.fixedDuels.length,
  });
  
  if (analysisCache.has(cacheKey)) {
    return analysisCache.get(cacheKey);
  }
  
  const ourMoves = generateLegalMoves(state, 'us');
  const theirMoves = generateLegalMoves(state, 'them');
  
  if (ourMoves.length === 0 || theirMoves.length === 0) {
    return calculateTeamScore(state.fixedDuels, matrix);
  }
  
  let bestGuaranteed = -Infinity;
  for (const ourMove of ourMoves) {
    let worstCase = Infinity;
    for (const theirMove of theirMoves) {
      const newState = applyMove(state, ourMove, theirMove);
      const score = computeGuaranteedScore(newState, matrix);
      worstCase = Math.min(worstCase, score);
    }
    bestGuaranteed = Math.max(bestGuaranteed, worstCase);
  }
  
  analysisCache.set(cacheKey, bestGuaranteed);
  return bestGuaranteed;
};

const analyzeCurrentPhase = (state, matrix) => {
  if (state.phase === 'finished') {
    return { ourRanking: [], theirRanking: [], bestGuaranteed: calculateTeamScore(state.fixedDuels, matrix) };
  }
  
  const ourMoves = generateLegalMoves(state, 'us');
  const theirMoves = generateLegalMoves(state, 'them');
  
  if (ourMoves.length === 0 || theirMoves.length === 0) {
    return { ourRanking: [], theirRanking: [], bestGuaranteed: calculateTeamScore(state.fixedDuels, matrix) };
  }
  
  const scenarioMatrix = ourMoves.map(ourMove =>
    theirMoves.map(theirMove => {
      const newState = applyMove(state, ourMove, theirMove);
      return computeGuaranteedScore(newState, matrix);
    })
  );
  
  // Calculer garanti, moyenne et écart-type pour nos choix
  const ourRanking = ourMoves
    .map((move, index) => {
      const scores = scenarioMatrix[index];
      const guaranteed = Math.min(...scores);
      const mean = scores.reduce((sum, s) => sum + s, 0) / scores.length;
      const variance = scores.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / scores.length;
      const stdDev = Math.sqrt(variance);
      return { move, guaranteed, mean, stdDev };
    })
    .sort((a, b) => {
      // Tri par garanti décroissant, puis moyenne décroissante, puis écart-type croissant
      if (b.guaranteed !== a.guaranteed) return b.guaranteed - a.guaranteed;
      if (b.mean !== a.mean) return b.mean - a.mean;
      return a.stdDev - b.stdDev;
    });
  
  // Calculer garanti, moyenne et écart-type pour les choix adverses
  const theirRanking = theirMoves
    .map((move, colIndex) => {
      const scores = scenarioMatrix.map(row => row[colIndex]);
      const guaranteedForUs = Math.min(...scores);
      const guaranteed = 120 - guaranteedForUs; // Score garanti pour l'adversaire
      const mean = 120 - (scores.reduce((sum, s) => sum + s, 0) / scores.length);
      const variance = scores.reduce((sum, s) => sum + Math.pow(s - (120 - mean), 2), 0) / scores.length;
      const stdDev = Math.sqrt(variance);
      return { move, guaranteed, mean, stdDev };
    })
    .sort((a, b) => {
      if (b.guaranteed !== a.guaranteed) return b.guaranteed - a.guaranteed;
      if (b.mean !== a.mean) return b.mean - a.mean;
      return a.stdDev - b.stdDev;
    });
  
  return { ourRanking, theirRanking, bestGuaranteed: Math.max(...ourRanking.map(r => r.guaranteed)) };
};

const computeGuaranteedScoreForMove = (state, matrix, ourMove) => {
  const theirMoves = generateLegalMoves(state, 'them');
  if (theirMoves.length === 0) return calculateTeamScore(state.fixedDuels, matrix);
  
  let worstCase = Infinity;
  for (const theirMove of theirMoves) {
    const newState = applyMove(state, ourMove, theirMove);
    const score = computeGuaranteedScore(newState, matrix);
    worstCase = Math.min(worstCase, score);
  }
  return worstCase;
};

// Génère l'arbre de décision à 3 niveaux
const generateDecisionTree = (state, matrix, preselectedUs = null, myTeamPlayers = [], opponentPlayers = []) => {
  if (state.phase === 'finished') {
    return { nodes: [], finalScore: calculateTeamScore(state.fixedDuels, matrix) };
  }
  
  // Obtenir les coups possibles
  let ourMoves = generateLegalMoves(state, 'us');
  const theirMoves = generateLegalMoves(state, 'them');
  
  if (ourMoves.length === 0 || theirMoves.length === 0) {
    return { nodes: [], finalScore: calculateTeamScore(state.fixedDuels, matrix) };
  }
  
  // Si présélection, filtrer nos coups
  if (preselectedUs !== null && preselectedUs.length > 0) {
    // Vérifier si la présélection correspond à un coup valide
    const preselectedKey = JSON.stringify([...preselectedUs].sort());
    const matchingMove = ourMoves.find(m => JSON.stringify([...m].sort()) === preselectedKey);
    if (matchingMove) {
      ourMoves = [matchingMove];
    }
  }
  
  // Déterminer si c'est une phase d'assignation (où les indices sont inversés)
  const isAssignPhase = (phase) => phase === 3 || phase === 6;
  
  // Pour les phases d'assignation:
  // - "us" moves sont des indices de joueurs ADVERSES (on choisit quel attaquant adverse)
  // - "them" moves sont des indices de NOS joueurs (ils choisissent quel de nos attaquants)
  const getPlayerTeamForMove = (side, phase) => {
    if (isAssignPhase(phase)) {
      return side === 'us' ? 'them' : 'us';
    }
    return side;
  };
  
  // Calculer les scores pour chaque réponse adverse (pour les probabilités)
  const calculateTheirProbabilities = (theirMovesLocal, stateLocal) => {
    if (theirMovesLocal.length === 0) return [];
    
    const theirScores = theirMovesLocal.map(theirMove => {
      // Score garanti pour l'adversaire s'il fait ce coup
      const ourMovesForThis = generateLegalMoves(stateLocal, 'us');
      if (ourMovesForThis.length === 0) return { move: theirMove, score: 60 };
      
      let bestForThem = -Infinity;
      for (const ourMove of ourMovesForThis) {
        const newState = applyMove(stateLocal, ourMove, theirMove);
        const scoreForUs = computeGuaranteedScore(newState, matrix);
        const scoreForThem = 120 - scoreForUs;
        bestForThem = Math.max(bestForThem, scoreForThem);
      }
      return { move: theirMove, score: bestForThem };
    });
    
    // Convertir en probabilités (softmax simplifié basé sur les scores)
    const maxScore = Math.max(...theirScores.map(s => s.score));
    const weights = theirScores.map(s => Math.exp((s.score - maxScore) / 5)); // Temperature = 5
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    
    return theirScores.map((s, i) => ({
      move: s.move,
      score: s.score,
      probability: Math.round((weights[i] / totalWeight) * 100)
    }));
  };
  
  // Extraire les oubliés/refusés d'un état final
  const extractForgottenRefused = (finalState) => {
    if (finalState.phase !== 'finished' || !finalState.pairingDetails) return null;
    
    const details = finalState.pairingDetails;
    const forgotten = details.forgotten;
    const refused = details.refused;
    
    if (!forgotten && !refused) return null;
    
    return {
      forgotten: forgotten ? {
        us: forgotten.us,
        them: forgotten.them,
        symbol: getMatrixValue(matrix, forgotten.us, forgotten.them)
      } : null,
      refused: refused ? {
        us: refused.us,
        them: refused.them,
        symbol: getMatrixValue(matrix, refused.us, refused.them)
      } : null
    };
  };
  
  // Construire l'arbre
  const tree = [];
  const probsByLevel = { 2: [], 4: [] }; // Pour tracker les probas par niveau
  
  for (const ourMove1 of ourMoves) {
    const node1 = {
      type: 'us',
      move: ourMove1,
      level: 1,
      playerTeam: getPlayerTeamForMove('us', state.phase), // Équipe réelle des joueurs
      children: []
    };
    
    // Niveau 2: Réponses adverses
    const theirProbs = calculateTheirProbabilities(theirMoves, state);
    
    for (const theirData of theirProbs) {
      const theirMove1 = theirData.move;
      const state2 = applyMove(state, ourMove1, theirMove1);
      
      probsByLevel[2].push(theirData.probability);
      
      const node2 = {
        type: 'them',
        move: theirMove1,
        probability: theirData.probability,
        level: 2,
        playerTeam: getPlayerTeamForMove('them', state.phase), // Équipe réelle des joueurs
        children: []
      };
      
      // Si le pairing est terminé après ce coup
      if (state2.phase === 'finished') {
        node2.finalScore = calculateTeamScore(state2.fixedDuels, matrix);
        node2.forgottenRefused = extractForgottenRefused(state2);
        node1.children.push(node2);
        continue;
      }
      
      // Niveau 3: Nos réponses
      const ourMoves2 = generateLegalMoves(state2, 'us');
      const theirMoves2 = generateLegalMoves(state2, 'them');
      
      for (const ourMove2 of ourMoves2) {
        const node3 = {
          type: 'us',
          move: ourMove2,
          level: 3,
          playerTeam: getPlayerTeamForMove('us', state2.phase), // Équipe réelle des joueurs
          children: []
        };
        
        // Niveau 4: Réponses adverses finales (on calcule juste le score garanti)
        if (theirMoves2.length > 0) {
          const theirProbs2 = calculateTheirProbabilities(theirMoves2, state2);
          
          for (const theirData2 of theirProbs2) {
            const theirMove2 = theirData2.move;
            const state3 = applyMove(state2, ourMove2, theirMove2);
            
            probsByLevel[4].push(theirData2.probability);
            
            const node4 = {
              type: 'them',
              move: theirMove2,
              probability: theirData2.probability,
              level: 4,
              playerTeam: getPlayerTeamForMove('them', state2.phase), // Équipe réelle des joueurs
              finalScore: computeGuaranteedScore(state3, matrix),
              forgottenRefused: extractForgottenRefused(state3)
            };
            
            node3.children.push(node4);
          }
        } else {
          // Pas de coup adverse possible, calculer le score final
          const state3 = applyMove(state2, ourMove2, []);
          node3.finalScore = computeGuaranteedScore(state3, matrix);
          node3.forgottenRefused = extractForgottenRefused(state3);
        }
        
        node2.children.push(node3);
      }
      
      node1.children.push(node2);
    }
    
    tree.push(node1);
  }
  
  // Calculer les probas max par niveau
  const maxProbByLevel = {
    2: probsByLevel[2].length > 0 ? Math.max(...probsByLevel[2]) : 0,
    4: probsByLevel[4].length > 0 ? Math.max(...probsByLevel[4]) : 0
  };
  
  return { nodes: tree, phase: state.phase, maxProbByLevel };
};

// Trouve le meilleur score dans un sous-arbre
const findBestScoreInTree = (node) => {
  if (node.finalScore !== undefined) return node.finalScore;
  if (!node.children || node.children.length === 0) return 0;
  
  const childScores = node.children.map(child => findBestScoreInTree(child));
  return Math.max(...childScores);
};

// Trouve le pire score dans un sous-arbre
const findWorstScoreInTree = (node) => {
  if (node.finalScore !== undefined) return node.finalScore;
  if (!node.children || node.children.length === 0) return 120;
  
  const childScores = node.children.map(child => findWorstScoreInTree(child));
  return Math.min(...childScores);
};

// ============================================
// COMPOSANTS UI RÉUTILISABLES
// ============================================

const PlayerBadge = ({ player, selected, onClick, team }) => {
  const stateClass = selected
    ? (team === 'us' ? "bg-blue-600 text-white ring-2 ring-blue-400" : "bg-red-600 text-white ring-2 ring-red-400")
    : "bg-gray-700 text-white hover:bg-gray-600";
  
  const displayName = player?.factionShort || player?.faction || player?.pseudo || '?';
  
  return (
    <div 
      className={`w-full py-2 px-3 rounded-lg transition-all cursor-pointer flex items-center justify-between ${stateClass}`}
      onClick={onClick}
    >
      <div className="font-semibold">{displayName}</div>
      <div className="text-sm opacity-75">{player?.pseudo}</div>
    </div>
  );
};

const PlayerBadgeAssign = ({ player, selected, onClick, originalTeam, displayedInColumn }) => {
  const backgroundClass = originalTeam === 'us' ? "bg-blue-900/50" : "bg-red-900/50";
  const stateClass = selected
    ? (displayedInColumn === 'us' ? "ring-2 ring-blue-400 bg-blue-600 text-white" : "ring-2 ring-red-400 bg-red-600 text-white")
    : `${backgroundClass} text-white hover:opacity-80`;
  
  const displayName = player?.factionShort || player?.faction || player?.pseudo || '?';
  
  return (
    <div 
      className={`w-full py-2 px-3 rounded-lg transition-all cursor-pointer flex items-center justify-between ${stateClass}`}
      onClick={onClick}
    >
      <div className="font-semibold">{displayName}</div>
      <div className="text-sm opacity-75">{player?.pseudo}</div>
    </div>
  );
};

const DefenderDisplay = ({ player, side }) => {
  const bgColor = side === 'us' ? 'bg-blue-800' : 'bg-red-800';
  const borderColor = side === 'us' ? 'border-blue-500' : 'border-red-500';
  const displayName = player?.factionShort || player?.faction || player?.pseudo || '?';
  
  return (
    <div className={`${bgColor} ${borderColor} border-2 rounded-lg p-3 text-center`}>
      <div className="text-xs text-gray-300 mb-1">🛡️ Défenseur en attente</div>
      <div className="font-bold">{displayName}</div>
      <div className="text-xs text-gray-400">{player?.pseudo}</div>
    </div>
  );
};

const ArmyListModal = ({ player, onClose }) => {
  if (!player) return null;
  
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-gray-800 rounded-lg p-4 max-w-2xl w-full max-h-[80vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold">{player.faction || 'Faction inconnue'}</h3>
            <p className="text-sm text-gray-400">{player.pseudo} - {player.detachment}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl">&times;</button>
        </div>
        
        {player.armyList ? (
          <pre className="bg-gray-900 p-4 rounded text-sm whitespace-pre-wrap font-mono">{player.armyList}</pre>
        ) : (
          <p className="text-gray-500 italic">Aucune liste d'armée enregistrée</p>
        )}
      </div>
    </div>
  );
};

// ============================================
// COMPOSANT PRINCIPAL
// ============================================

function PairingEngine() {
  const [currentPage, setCurrentPage] = useState('settings');
  const [data, setData] = useState(createDefaultData);
  const [pairingState, setPairingState] = useState(null);
  const [history, setHistory] = useState([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [lastSaved, setLastSaved] = useState(null);
  
  // Settings page state
  const [settingsTab, setSettingsTab] = useState('myTeam');
  const [armyListOpponentIndex, setArmyListOpponentIndex] = useState(0);
  const [armyListPlayerIndex, setArmyListPlayerIndex] = useState(0);
  
  // Matrix editor state
  const [matrixEditorIndex, setMatrixEditorIndex] = useState(0);
  const [importError, setImportError] = useState('');
  const [importSuccess, setImportSuccess] = useState('');
  
  // Pairing page state
  const [selectedUs, setSelectedUs] = useState([]);
  const [selectedThem, setSelectedThem] = useState([]);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [hideFixedPlayers, setHideFixedPlayers] = useState(false);
  const [showArmyListPlayer, setShowArmyListPlayer] = useState(null);
  const [showStartPairingConfirm, setShowStartPairingConfirm] = useState(false);
  const [showBestCombinations, setShowBestCombinations] = useState(false);
  const [showResetTournamentConfirm, setShowResetTournamentConfirm] = useState(false);
  const [showDecisionTree, setShowDecisionTree] = useState(false);
  const [showTreeProbabilities, setShowTreeProbabilities] = useState(false);
  
  // Current round being played
  const [currentRoundIndex, setCurrentRoundIndex] = useState(null);
  
  // Charger les données au démarrage
  useEffect(() => {
    const loadData = async () => {
      try {
        const savedData = await loadFromIndexedDB('tournamentData');
        if (savedData) {
          // S'assurer que rounds et selectedRoundIndex existent
          const loadedData = {
            ...createDefaultData(),
            ...savedData,
            rounds: savedData.rounds || createDefaultData().rounds,
            selectedRoundIndex: savedData.selectedRoundIndex ?? null,
          };
          setData(loadedData);
          console.log('Données chargées depuis IndexedDB');
        }
        
        const savedPairingState = await loadFromIndexedDB('pairingState');
        if (savedPairingState) {
          setPairingState(savedPairingState);
        }
        
        const savedHistory = await loadFromIndexedDB('pairingHistory');
        if (savedHistory) {
          setHistory(savedHistory);
        }
        
        const savedRoundIndex = await loadFromIndexedDB('currentRoundIndex');
        if (savedRoundIndex !== null) {
          setCurrentRoundIndex(savedRoundIndex);
        }
      } catch (error) {
        console.error('Erreur lors du chargement:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, []);
  
  // Sauvegarder les données à chaque modification
  useEffect(() => {
    if (isLoading) return; // Ne pas sauvegarder pendant le chargement initial
    
    const saveData = async () => {
      await saveToIndexedDB('tournamentData', data);
      setLastSaved(new Date());
    };
    
    // Debounce la sauvegarde (300ms)
    const timeoutId = setTimeout(saveData, 300);
    return () => clearTimeout(timeoutId);
  }, [data, isLoading]);
  
  // Sauvegarder le pairingState
  useEffect(() => {
    if (isLoading) return;
    saveToIndexedDB('pairingState', pairingState);
  }, [pairingState, isLoading]);
  
  // Sauvegarder l'historique
  useEffect(() => {
    if (isLoading) return;
    saveToIndexedDB('pairingHistory', history);
  }, [history, isLoading]);
  
  // Sauvegarder currentRoundIndex
  useEffect(() => {
    if (isLoading) return;
    saveToIndexedDB('currentRoundIndex', currentRoundIndex);
  }, [currentRoundIndex, isLoading]);
  
  // Vérifie si la ronde sélectionnée a déjà un résultat
  const selectedRoundHasResult = () => {
    if (data.selectedRoundIndex === null || data.selectedRoundIndex === undefined) return false;
    const round = data.rounds?.[data.selectedRoundIndex];
    return round?.pairingResult !== null;
  };
  
  // Fonction appelée par le bouton (avec ou sans confirmation)
  const handleStartPairingClick = () => {
    if (selectedRoundHasResult()) {
      setShowStartPairingConfirm(true);
    } else {
      startPairing();
    }
  };
  
  // Reprendre un pairing existant (sans le réinitialiser)
  const resumePairing = () => {
    const round = data.rounds?.[data.selectedRoundIndex];
    if (!round?.pairingResult) return;
    
    const opponent = data.opponents[round.pairingResult.opponentIndex];
    if (!opponent) return;
    
    // Reconstruire le pairingState à partir du pairingResult sauvegardé
    const pairingResult = round.pairingResult;
    
    // Calculer les stats initiales pour la notation finale
    const initialStats = pairingResult.initialStats || calculatePairingStats(opponent.matrix);
    const initialGuaranteed = pairingResult.initialGuaranteed || 60;
    
    // Reconstruire l'état du pairing
    // Si le pairing est terminé (6 duels fixés), on restaure l'état final
    const isFinished = pairingResult.fixedDuels?.length === 6;
    
    // Calculer les joueurs encore disponibles
    const usedUs = new Set(pairingResult.fixedDuels?.map(d => d.us) || []);
    const usedThem = new Set(pairingResult.fixedDuels?.map(d => d.them) || []);
    const availableUs = [0, 1, 2, 3, 4, 5].filter(i => !usedUs.has(i));
    const availableThem = [0, 1, 2, 3, 4, 5].filter(i => !usedThem.has(i));
    
    setPairingState({
      phase: isFinished ? 'finished' : (pairingResult.phase || 'finished'),
      us: { 
        available: availableUs,
        defender: pairingResult.pairingDetails?.cycle2?.usDefender ?? null, 
        attackers: pairingResult.pairingDetails?.cycle2?.usAttackers || []
      },
      them: { 
        available: availableThem,
        defender: pairingResult.pairingDetails?.cycle2?.themDefender ?? null, 
        attackers: pairingResult.pairingDetails?.cycle2?.themAttackers || []
      },
      fixedDuels: pairingResult.fixedDuels || [],
      opponentIndex: pairingResult.opponentIndex,
      roundIndex: data.selectedRoundIndex,
      pairingDetails: pairingResult.pairingDetails || {},
      initialStats,
      initialGuaranteed,
      score: pairingResult.score,
    });
    
    setCurrentRoundIndex(data.selectedRoundIndex);
    setHistory([]);
    setSelectedUs([]);
    setSelectedThem([]);
    setShowStartPairingConfirm(false);
    setCurrentPage('pairing');
  };
  
  // ============================================
  // PAIRING FUNCTIONS - USE INDICES NOT IDS
  // ============================================
  
  const startPairing = () => {
    const opponent = data.opponents[data.selectedOpponentIndex];
    if (!opponent || !opponent.isConfigured) return;
    
    // Si une ronde est sélectionnée et a déjà un résultat, la réinitialiser
    if (data.selectedRoundIndex !== null && data.selectedRoundIndex !== undefined) {
      const round = data.rounds?.[data.selectedRoundIndex];
      if (round?.pairingResult !== null) {
        const newRounds = [...data.rounds];
        newRounds[data.selectedRoundIndex] = {
          ...round,
          pairingResult: null,
          duelScores: null,
        };
        setData(prev => ({ ...prev, rounds: newRounds }));
      }
    }
    
    setShowStartPairingConfirm(false);
    
    // Calculer les stats initiales pour la notation finale
    const initialStats = calculatePairingStats(opponent.matrix);
    
    // Calculer le score garanti initial
    const initialState = {
      phase: 1,
      us: { available: [0, 1, 2, 3, 4, 5], defender: null, attackers: [] },
      them: { available: [0, 1, 2, 3, 4, 5], defender: null, attackers: [] },
      fixedDuels: [],
    };
    analysisCache.clear();
    const initialGuaranteed = computeGuaranteedScore(initialState, opponent.matrix);
    
    // Utiliser des INDICES (0-5) au lieu des IDs
    setPairingState({
      phase: 1,
      us: { 
        available: [0, 1, 2, 3, 4, 5], // Indices des joueurs
        defender: null, 
        attackers: [] 
      },
      them: { 
        available: [0, 1, 2, 3, 4, 5], // Indices des joueurs
        defender: null, 
        attackers: [] 
      },
      fixedDuels: [],
      opponentIndex: data.selectedOpponentIndex,
      roundIndex: data.selectedRoundIndex, // Index de la ronde associée (peut être null)
      // Stats pour la notation finale
      initialStats,
      initialGuaranteed,
    });
    setCurrentRoundIndex(data.selectedRoundIndex);
    setHistory([]);
    setSelectedUs([]);
    setSelectedThem([]);
    setCurrentPage('pairing');
  };
  
  // Enregistrer le résultat du pairing dans la ronde
  const savePairingToRound = (roundIndex, pairingResult) => {
    if (roundIndex === null || roundIndex === undefined) return;
    
    const newRounds = [...data.rounds];
    newRounds[roundIndex] = {
      ...newRounds[roundIndex],
      pairingResult: pairingResult,
      duelScores: pairingResult.fixedDuels.map(duel => ({
        ...duel,
        ourScore: null,
        theirScore: null,
      })),
    };
    setData({ ...data, rounds: newRounds });
  };
  
  const resetPairing = () => {
    // Récupérer l'opponent actuel du pairing en cours
    const opponentIndex = pairingState?.opponentIndex ?? data.selectedOpponentIndex;
    const opponent = data.opponents[opponentIndex];
    
    if (!opponent) return;
    
    // Recalculer les stats initiales
    const initialStats = calculatePairingStats(opponent.matrix);
    
    const initialState = {
      phase: 1,
      us: { available: [0, 1, 2, 3, 4, 5], defender: null, attackers: [] },
      them: { available: [0, 1, 2, 3, 4, 5], defender: null, attackers: [] },
      fixedDuels: [],
    };
    analysisCache.clear();
    const initialGuaranteed = computeGuaranteedScore(initialState, opponent.matrix);
    
    setPairingState({
      phase: 1,
      us: { available: [0, 1, 2, 3, 4, 5], defender: null, attackers: [] },
      them: { available: [0, 1, 2, 3, 4, 5], defender: null, attackers: [] },
      fixedDuels: [],
      opponentIndex: opponentIndex,
      roundIndex: pairingState?.roundIndex ?? currentRoundIndex,
      initialStats,
      initialGuaranteed,
    });
    setHistory([]);
    setSelectedUs([]);
    setSelectedThem([]);
    setShowResetConfirm(false);
  };
  
  const hasPairingInProgress = pairingState !== null && pairingState.phase !== 'finished';
  
  // ============================================
  // RENDER SETTINGS PAGE
  // ============================================
  const renderSettings = () => {
    const selectedOpponent = data.opponents[data.selectedOpponentIndex];
    const canStartPairing = selectedOpponent?.isConfigured;
    const armyListOpponent = data.opponents[armyListOpponentIndex];
    const armyListPlayer = armyListOpponent?.players[armyListPlayerIndex];
    
    return (
      <div className="p-4">
        <h2 className="text-xl font-bold mb-4">⚙️ Paramétrage</h2>
        
        {hasPairingInProgress && (
          <div className="bg-yellow-900/50 border border-yellow-600 rounded-lg p-3 mb-4">
            <span className="text-yellow-300">⚠️ Un pairing est en cours.</span>
          </div>
        )}
        
        <div className="flex gap-2 mb-4 flex-wrap">
          <button
            onClick={() => setSettingsTab('myTeam')}
            className={`px-4 py-2 rounded ${settingsTab === 'myTeam' ? 'bg-blue-600' : 'bg-gray-700'}`}
          >
            Mon Équipe
          </button>
          <button
            onClick={() => setSettingsTab('rounds')}
            className={`px-4 py-2 rounded ${settingsTab === 'rounds' ? 'bg-blue-600' : 'bg-gray-700'}`}
          >
            Rondes
          </button>
          <button
            onClick={() => setSettingsTab('selectOpponent')}
            className={`px-4 py-2 rounded ${settingsTab === 'selectOpponent' ? 'bg-blue-600' : 'bg-gray-700'}`}
          >
            Lancer Pairing
          </button>
          <button
            onClick={() => setSettingsTab('armyLists')}
            className={`px-4 py-2 rounded ${settingsTab === 'armyLists' ? 'bg-blue-600' : 'bg-gray-700'}`}
          >
            Listes d'Armée
          </button>
        </div>
        
        {settingsTab === 'myTeam' && (
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="mb-4">
              <label className="block text-sm text-gray-400 mb-1">Nom de l'équipe</label>
              <input
                type="text"
                value={data.myTeam.name}
                onChange={(e) => setData({ ...data, myTeam: { ...data.myTeam, name: e.target.value } })}
                className="w-full bg-gray-700 rounded px-3 py-2"
              />
            </div>
            
            <div className="space-y-2">
              {data.myTeam.players.map((player, index) => (
                <div key={index} className="grid grid-cols-4 gap-2">
                  <input
                    type="text"
                    placeholder="Pseudo"
                    value={player.pseudo}
                    onChange={(e) => {
                      const newPlayers = [...data.myTeam.players];
                      newPlayers[index] = { ...player, pseudo: e.target.value };
                      setData({ ...data, myTeam: { ...data.myTeam, players: newPlayers } });
                    }}
                    className="bg-gray-700 rounded px-3 py-2 text-sm"
                  />
                  <input
                    type="text"
                    placeholder="Faction"
                    value={player.faction}
                    onChange={(e) => {
                      const newPlayers = [...data.myTeam.players];
                      newPlayers[index] = { ...player, faction: e.target.value };
                      setData({ ...data, myTeam: { ...data.myTeam, players: newPlayers } });
                    }}
                    className="bg-gray-700 rounded px-3 py-2 text-sm"
                  />
                  <input
                    type="text"
                    placeholder="Abréviation"
                    value={player.factionShort}
                    onChange={(e) => {
                      const newPlayers = [...data.myTeam.players];
                      newPlayers[index] = { ...player, factionShort: e.target.value };
                      setData({ ...data, myTeam: { ...data.myTeam, players: newPlayers } });
                    }}
                    className="bg-gray-700 rounded px-3 py-2 text-sm"
                  />
                  <input
                    type="text"
                    placeholder="Détachement"
                    value={player.detachment}
                    onChange={(e) => {
                      const newPlayers = [...data.myTeam.players];
                      newPlayers[index] = { ...player, detachment: e.target.value };
                      setData({ ...data, myTeam: { ...data.myTeam, players: newPlayers } });
                    }}
                    className="bg-gray-700 rounded px-3 py-2 text-sm"
                  />
                </div>
              ))}
            </div>
          </div>
        )}
        
        {settingsTab === 'selectOpponent' && (
          <div className="bg-gray-800 rounded-lg p-4">
            <p className="text-gray-400 mb-4">Sélectionnez l'adversaire :</p>
            
            <div className="space-y-2 mb-4">
              {data.opponents.map((opp, index) => (
                <div
                  key={index}
                  onClick={() => setData({ ...data, selectedOpponentIndex: index })}
                  className={`p-3 rounded-lg cursor-pointer flex items-center justify-between ${
                    data.selectedOpponentIndex === index
                      ? 'bg-blue-600 ring-2 ring-blue-400'
                      : opp.isConfigured ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-700/50 text-gray-500'
                  }`}
                >
                  <span>{opp.name}</span>
                  <span className={`text-xs px-2 py-1 rounded ${opp.isConfigured ? 'bg-green-600' : 'bg-gray-600'}`}>
                    {opp.isConfigured ? 'Configuré' : 'Non configuré'}
                  </span>
                </div>
              ))}
            </div>
            
            {/* Sélection de la ronde */}
            <div className="mb-4">
              <label className="block text-sm text-gray-400 mb-2">Associer à une ronde (optionnel)</label>
              <select
                value={data.selectedRoundIndex ?? ''}
                onChange={(e) => setData({ ...data, selectedRoundIndex: e.target.value === '' ? null : Number(e.target.value) })}
                className="w-full bg-gray-700 rounded px-3 py-2"
              >
                <option value="">-- Pairing libre (sans ronde) --</option>
                {(data.rounds || []).map((round, i) => (
                  <option key={i} value={i}>
                    {round?.name || `Ronde ${i + 1}`} {round?.pairingResult ? '⚠️ (déjà joué)' : ''}
                  </option>
                ))}
              </select>
              
              {/* Avertissement si ronde déjà jouée */}
              {selectedRoundHasResult() && (
                <p className="text-yellow-400 text-sm mt-2">
                  ⚠️ Cette ronde a déjà un pairing. Lancer un nouveau pairing réinitialisera les données existantes.
                </p>
              )}
            </div>
            
            <button
              onClick={handleStartPairingClick}
              disabled={!canStartPairing}
              className="w-full py-3 bg-green-600 rounded-lg font-semibold hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Lancer le Pairing contre {selectedOpponent?.name || '...'}
            </button>
            
            {/* Modal de confirmation */}
            {showStartPairingConfirm && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                <div className="bg-gray-800 rounded-lg p-6 max-w-md mx-4">
                  <h3 className="text-lg font-bold mb-2 text-yellow-400">⚠️ Pairing existant</h3>
                  <p className="text-gray-300 mb-4">
                    Un pairing a déjà été réalisé pour cette ronde. Que souhaitez-vous faire ?
                  </p>
                  <div className="space-y-3 mb-4">
                    <button 
                      onClick={resumePairing} 
                      className="w-full px-4 py-3 bg-blue-600 rounded hover:bg-blue-500 text-left"
                    >
                      <div className="font-semibold">📂 Reprendre le pairing</div>
                      <div className="text-sm text-blue-200">Continuer avec le pairing existant (scores conservés)</div>
                    </button>
                    <button 
                      onClick={startPairing} 
                      className="w-full px-4 py-3 bg-yellow-600 rounded hover:bg-yellow-500 text-left"
                    >
                      <div className="font-semibold">🔄 Réinitialiser le pairing</div>
                      <div className="text-sm text-yellow-200">Supprimer et recommencer à zéro</div>
                    </button>
                  </div>
                  <button 
                    onClick={() => setShowStartPairingConfirm(false)} 
                    className="w-full px-4 py-2 bg-gray-700 rounded hover:bg-gray-600"
                  >
                    Annuler
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        
        {settingsTab === 'armyLists' && (
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">Équipe adverse</label>
                <select
                  value={armyListOpponentIndex}
                  onChange={(e) => {
                    setArmyListOpponentIndex(Number(e.target.value));
                    setArmyListPlayerIndex(0);
                  }}
                  className="w-full bg-gray-700 rounded px-3 py-2"
                >
                  {data.opponents.map((opp, i) => (
                    <option key={i} value={i}>{opp.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">Joueur</label>
                <select
                  value={armyListPlayerIndex}
                  onChange={(e) => setArmyListPlayerIndex(Number(e.target.value))}
                  className="w-full bg-gray-700 rounded px-3 py-2"
                >
                  {armyListOpponent?.players.map((p, i) => (
                    <option key={i} value={i}>
                      {p.factionShort || p.faction || p.pseudo || `Joueur ${i + 1}`}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            
            <div>
              <label className="block text-sm text-gray-400 mb-2">
                Liste d'armée de {armyListPlayer?.factionShort || armyListPlayer?.faction || 'ce joueur'}
              </label>
              <textarea
                value={armyListPlayer?.armyList || ''}
                onChange={(e) => {
                  const newOpponents = [...data.opponents];
                  const newPlayers = [...armyListOpponent.players];
                  newPlayers[armyListPlayerIndex] = { ...armyListPlayer, armyList: e.target.value };
                  newOpponents[armyListOpponentIndex] = { ...armyListOpponent, players: newPlayers };
                  setData({ ...data, opponents: newOpponents });
                }}
                placeholder="Collez ici la liste d'armée..."
                className="w-full bg-gray-700 rounded px-3 py-2 h-64 font-mono text-sm"
              />
            </div>
          </div>
        )}
        
        {settingsTab === 'rounds' && (
          <div className="bg-gray-800 rounded-lg p-4">
            <h3 className="font-semibold mb-4">Configuration des Rondes</h3>
            
            <div className="space-y-4">
              {(data.rounds || []).map((round, index) => {
                if (!round) return null;
                const opponent = round.opponentIndex !== null && round.opponentIndex !== undefined 
                  ? data.opponents[round.opponentIndex] 
                  : null;
                const hasResult = round.pairingResult !== null;
                
                return (
                  <div key={index} className={`p-4 rounded-lg ${hasResult ? 'bg-green-900/30 border border-green-700' : 'bg-gray-700'}`}>
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-semibold">{round.name || `Ronde ${index + 1}`}</h4>
                      {hasResult && (
                        <span className="text-xs bg-green-600 px-2 py-1 rounded">Pairing effectué</span>
                      )}
                    </div>
                    
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Équipe adverse</label>
                        <select
                          value={round.opponentIndex ?? ''}
                          onChange={(e) => {
                            const newRounds = [...data.rounds];
                            newRounds[index] = { 
                              ...round, 
                              opponentIndex: e.target.value === '' ? null : Number(e.target.value) 
                            };
                            setData({ ...data, rounds: newRounds });
                          }}
                          className="w-full bg-gray-600 rounded px-2 py-1.5 text-sm"
                        >
                          <option value="">-- Sélectionner --</option>
                          {data.opponents.map((opp, i) => (
                            <option key={i} value={i} disabled={!opp.isConfigured}>
                              {opp.name} {!opp.isConfigured && '(non configuré)'}
                            </option>
                          ))}
                        </select>
                      </div>
                      
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Scénario</label>
                        <input
                          type="text"
                          value={round.scenario || ''}
                          onChange={(e) => {
                            const newRounds = [...data.rounds];
                            newRounds[index] = { ...round, scenario: e.target.value };
                            setData({ ...data, rounds: newRounds });
                          }}
                          placeholder="Ex: Cibles prioritaires"
                          className="w-full bg-gray-600 rounded px-2 py-1.5 text-sm"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Déploiement</label>
                        <input
                          type="text"
                          value={round.deployment || ''}
                          onChange={(e) => {
                            const newRounds = [...data.rounds];
                            newRounds[index] = { ...round, deployment: e.target.value };
                            setData({ ...data, rounds: newRounds });
                          }}
                          placeholder="Ex: Marteau et Enclume"
                          className="w-full bg-gray-600 rounded px-2 py-1.5 text-sm"
                        />
                      </div>
                    </div>
                    
                    {hasResult && (
                      <div className="mt-3 pt-3 border-t border-gray-600">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-400">
                            Score pairing: <span className="text-white font-bold">{round.pairingResult?.score || 0}/120</span>
                          </span>
                          <button
                            onClick={() => {
                              setCurrentRoundIndex(index);
                              setCurrentPage('scores');
                            }}
                            className="px-3 py-1 bg-blue-600 rounded text-sm hover:bg-blue-500"
                          >
                            📝 Saisir scores
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
        
        {/* Bouton Reset Tournoi */}
        <div className="mt-6 pt-6 border-t border-gray-700">
          <h3 className="text-lg font-semibold mb-3 text-red-400">⚠️ Zone de danger</h3>
          <button
            onClick={() => setShowResetTournamentConfirm(true)}
            className="px-4 py-2 bg-red-700 rounded hover:bg-red-600"
          >
            🗑️ Réinitialiser le tournoi
          </button>
          <p className="text-xs text-gray-500 mt-2">
            Remet à zéro toutes les rondes, pairings et scores. Les équipes et matrices sont conservées.
          </p>
        </div>
        
        {/* Modal confirmation reset tournoi */}
        {showResetTournamentConfirm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-lg p-6 max-w-md mx-4">
              <h3 className="text-lg font-bold mb-2 text-red-400">⚠️ Réinitialiser le tournoi ?</h3>
              <p className="text-gray-300 mb-4">
                Cette action va supprimer :
              </p>
              <ul className="text-gray-400 text-sm mb-4 list-disc list-inside space-y-1">
                <li>Tous les résultats de pairing</li>
                <li>Tous les scores saisis</li>
                <li>Les associations rondes/adversaires</li>
                <li>Les scénarios et déploiements</li>
              </ul>
              <p className="text-gray-300 mb-4">
                <span className="text-green-400">✓</span> Les équipes, joueurs, factions, matrices et listes d'armée seront conservés.
              </p>
              <div className="flex gap-3 justify-end">
                <button 
                  onClick={() => setShowResetTournamentConfirm(false)} 
                  className="px-4 py-2 bg-gray-700 rounded hover:bg-gray-600"
                >
                  Annuler
                </button>
                <button 
                  onClick={() => {
                    // Reset des rondes
                    const resetRounds = data.rounds.map((round, i) => ({
                      id: i,
                      name: `Ronde ${i + 1}`,
                      opponentIndex: null,
                      scenario: '',
                      deployment: '',
                      pairingResult: null,
                      duelScores: null,
                    }));
                    
                    setData({
                      ...data,
                      rounds: resetRounds,
                      selectedRoundIndex: null,
                    });
                    
                    // Reset du pairing en cours
                    setPairingState(null);
                    setHistory([]);
                    setCurrentRoundIndex(null);
                    
                    setShowResetTournamentConfirm(false);
                  }} 
                  className="px-4 py-2 bg-red-600 rounded hover:bg-red-500"
                >
                  Confirmer la réinitialisation
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };
  
  // ============================================
  // RENDER MATRIX EDITOR
  // ============================================
  const renderMatrixEditor = () => {
    const opponent = data.opponents[matrixEditorIndex];
    
    const handleImport = (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = importFromJSON(e.target?.result);
        if (result.success) {
          setData(result.data);
          setImportSuccess('Import réussi !');
          setImportError('');
          setTimeout(() => setImportSuccess(''), 3000);
        } else {
          setImportError(result.error);
          setImportSuccess('');
        }
      };
      reader.readAsText(file);
      event.target.value = '';
    };
    
    return (
      <div className="p-4">
        <h2 className="text-xl font-bold mb-4">✏️ Édition des Matrices</h2>
        
        <div className="flex gap-3 mb-4">
          <button onClick={() => exportToJSON(data)} className="px-4 py-2 bg-blue-600 rounded hover:bg-blue-500">
            📤 Exporter JSON
          </button>
          <label className="px-4 py-2 bg-green-600 rounded hover:bg-green-500 cursor-pointer">
            📥 Importer JSON
            <input type="file" accept=".json" onChange={handleImport} className="hidden" />
          </label>
        </div>
        
        {importError && <div className="bg-red-900 text-red-200 p-3 rounded mb-4">{importError}</div>}
        {importSuccess && <div className="bg-green-900 text-green-200 p-3 rounded mb-4">{importSuccess}</div>}
        
        <div className="flex gap-2 mb-4 overflow-x-auto">
          {data.opponents.map((opp, index) => (
            <button
              key={index}
              onClick={() => setMatrixEditorIndex(index)}
              className={`px-4 py-2 rounded whitespace-nowrap ${matrixEditorIndex === index ? 'bg-red-600' : 'bg-gray-700'}`}
            >
              {opp.name}
            </button>
          ))}
        </div>
        
        <div className="bg-gray-800 rounded-lg p-4 mb-4">
          <label className="block text-sm text-gray-400 mb-1">Nom de l'équipe adverse</label>
          <input
            type="text"
            value={opponent.name}
            onChange={(e) => {
              const newOpponents = [...data.opponents];
              newOpponents[matrixEditorIndex] = { ...opponent, name: e.target.value };
              setData({ ...data, opponents: newOpponents });
            }}
            className="w-full bg-gray-700 rounded px-3 py-2"
          />
        </div>
        
        <div className="bg-gray-800 rounded-lg p-4 mb-4">
          <h3 className="font-semibold mb-3">Joueurs adverses</h3>
          <div className="space-y-2">
            {opponent.players.map((player, index) => (
              <div key={index} className="grid grid-cols-4 gap-2">
                <input
                  type="text"
                  placeholder="Pseudo"
                  value={player.pseudo}
                  onChange={(e) => {
                    const newPlayers = [...opponent.players];
                    newPlayers[index] = { ...player, pseudo: e.target.value };
                    const newOpponents = [...data.opponents];
                    newOpponents[matrixEditorIndex] = { ...opponent, players: newPlayers, isConfigured: true };
                    setData({ ...data, opponents: newOpponents });
                  }}
                  className="bg-gray-700 rounded px-3 py-2 text-sm"
                />
                <input
                  type="text"
                  placeholder="Faction"
                  value={player.faction}
                  onChange={(e) => {
                    const newPlayers = [...opponent.players];
                    newPlayers[index] = { ...player, faction: e.target.value };
                    const newOpponents = [...data.opponents];
                    newOpponents[matrixEditorIndex] = { ...opponent, players: newPlayers, isConfigured: true };
                    setData({ ...data, opponents: newOpponents });
                  }}
                  className="bg-gray-700 rounded px-3 py-2 text-sm"
                />
                <input
                  type="text"
                  placeholder="Abréviation"
                  value={player.factionShort}
                  onChange={(e) => {
                    const newPlayers = [...opponent.players];
                    newPlayers[index] = { ...player, factionShort: e.target.value };
                    const newOpponents = [...data.opponents];
                    newOpponents[matrixEditorIndex] = { ...opponent, players: newPlayers, isConfigured: true };
                    setData({ ...data, opponents: newOpponents });
                  }}
                  className="bg-gray-700 rounded px-3 py-2 text-sm"
                />
                <input
                  type="text"
                  placeholder="Détachement"
                  value={player.detachment}
                  onChange={(e) => {
                    const newPlayers = [...opponent.players];
                    newPlayers[index] = { ...player, detachment: e.target.value };
                    const newOpponents = [...data.opponents];
                    newOpponents[matrixEditorIndex] = { ...opponent, players: newPlayers, isConfigured: true };
                    setData({ ...data, opponents: newOpponents });
                  }}
                  className="bg-gray-700 rounded px-3 py-2 text-sm"
                />
              </div>
            ))}
          </div>
        </div>
        
        <div className="bg-gray-800 rounded-lg p-4">
          <h3 className="font-semibold mb-3">Matrice de Pairing</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="p-2 text-left">Nous / Eux →</th>
                  {opponent.players.map((p, i) => (
                    <th 
                      key={i} 
                      className="p-2 text-center text-xs cursor-pointer hover:text-blue-400"
                      title={`Cliquer pour voir la liste de ${p.faction || `Adversaire ${i + 1}`}`}
                      onClick={() => setShowArmyListPlayer(p)}
                    >
                      {p.factionShort || p.faction || `Adv ${i + 1}`}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.myTeam.players.map((ourPlayer, rowIndex) => (
                  <tr key={rowIndex}>
                    <td className="p-2 text-xs">{ourPlayer.factionShort || ourPlayer.faction || ourPlayer.pseudo}</td>
                    {opponent.players.map((_, colIndex) => (
                      <td key={colIndex} className="p-1">
                        <select
                          value={opponent.matrix[rowIndex]?.[colIndex] || '='}
                          onChange={(e) => {
                            const newMatrix = opponent.matrix.map(r => [...r]);
                            newMatrix[rowIndex][colIndex] = e.target.value;
                            const newOpponents = [...data.opponents];
                            newOpponents[matrixEditorIndex] = { ...opponent, matrix: newMatrix, isConfigured: true };
                            setData({ ...data, opponents: newOpponents });
                          }}
                          className={`w-full rounded px-2 py-1 text-center font-bold ${getSymbolColor(opponent.matrix[rowIndex]?.[colIndex] || '=')}`}
                        >
                          {SYMBOLS.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        
        {/* Modal liste d'armée */}
        {showArmyListPlayer && (
          <ArmyListModal player={showArmyListPlayer} onClose={() => setShowArmyListPlayer(null)} />
        )}
      </div>
    );
  };
  
  // ============================================
  // RENDER PAIRING PAGE
  // ============================================
  const renderPairing = () => {
    if (!pairingState) return null;
    
    const state = pairingState;
    const opponent = data.opponents[data.selectedOpponentIndex];
    const matrix = opponent.matrix;
    
    // Récupérer un joueur par son INDEX (0-5)
    const getOurPlayer = (idx) => data.myTeam.players[idx];
    const getTheirPlayer = (idx) => opponent.players[idx];
    
    // Joueurs filtrés pour la matrice
    const getFilteredIndices = (side) => {
      const allIndices = [0, 1, 2, 3, 4, 5];
      if (!hideFixedPlayers) return allIndices;
      const fixedSet = new Set(state.fixedDuels.map(d => side === 'us' ? d.us : d.them));
      return allIndices.filter(idx => !fixedSet.has(idx));
    };
    
    const getRequiredSelections = () => {
      if (state.phase === 1 || state.phase === 4) return 1;
      if (state.phase === 2 || state.phase === 5) return 2;
      if (state.phase === 3 || state.phase === 6) return 1;
      return 0;
    };
    
    const getSelectableIndices = (side) => {
      const sideState = side === 'us' ? state.us : state.them;
      if (!sideState || !sideState.available) return [];
      
      if (state.phase === 1 || state.phase === 4) return sideState.available;
      if (state.phase === 2 || state.phase === 5) return sideState.available.filter(idx => idx !== sideState.defender);
      if (state.phase === 3 || state.phase === 6) {
        const opposing = side === 'us' ? state.them : state.us;
        return opposing?.attackers || [];
      }
      return [];
    };
    
    analysisCache.clear();
    const analysis = analyzeCurrentPhase(state, matrix);
    
    const required = getRequiredSelections();
    const isSingleSelection = state.phase === 1 || state.phase === 4 || state.phase === 3 || state.phase === 6;
    const isAssignPhase = state.phase === 3 || state.phase === 6;
    const canValidate = selectedUs.length === required && selectedThem.length === required;
    const isFinished = state.phase === 'finished';
    const showDefenders = [2, 3, 5, 6].includes(state.phase);
    const highlightedRow = (state.phase === 1 || state.phase === 4) && selectedUs.length > 0 ? selectedUs[0] : null;
    
    const currentScore = calculateTeamScore(state.fixedDuels, matrix);
    
    const filteredUsIndices = getFilteredIndices('us');
    const filteredThemIndices = getFilteredIndices('them');
    const selectableUs = getSelectableIndices('us');
    const selectableThem = getSelectableIndices('them');
    
    const handleSelect = (side, playerIdx) => {
      const setSelected = side === 'us' ? setSelectedUs : setSelectedThem;
      const selected = side === 'us' ? selectedUs : selectedThem;
      
      if (isSingleSelection) {
        setSelected(selected.includes(playerIdx) ? [] : [playerIdx]);
      } else {
        if (selected.includes(playerIdx)) {
          setSelected(selected.filter(idx => idx !== playerIdx));
        } else if (selected.length < required) {
          setSelected([...selected, playerIdx]);
        }
      }
    };
    
    const handleValidate = () => {
      if (!canValidate) return;
      setHistory([...history, { state }]);
      const newState = applyMove(state, selectedUs, selectedThem);
      
      // Si le pairing est terminé, sauvegarder dans la ronde
      if (newState.phase === 'finished' && state.roundIndex !== null && state.roundIndex !== undefined) {
        const finalScore = calculateTeamScore(newState.fixedDuels, matrix);
        savePairingToRound(state.roundIndex, {
          score: finalScore,
          fixedDuels: newState.fixedDuels,
          opponentIndex: state.opponentIndex,
          initialStats: state.initialStats,
          initialGuaranteed: state.initialGuaranteed,
          pairingDetails: newState.pairingDetails,
        });
      }
      
      setPairingState(newState);
      setSelectedUs([]);
      setSelectedThem([]);
    };
    
    const handleUndo = () => {
      if (history.length === 0) return;
      setPairingState(history[history.length - 1].state);
      setHistory(history.slice(0, -1));
      setSelectedUs([]);
      setSelectedThem([]);
    };
    
    const formatMove = (move) => {
      if (!move) return '';
      return move.map(idx => {
        // Déterminer si c'est un joueur de notre équipe ou adverse selon le contexte
        const p = getOurPlayer(idx) || getTheirPlayer(idx);
        return p?.factionShort || p?.faction || `J${idx + 1}`;
      }).join(' + ');
    };
    
    // Score pour sélection non optimale
    let currentSelectionScore = null;
    if (!isFinished && selectedUs.length === required) {
      const bestMove = analysis.ourRanking[0]?.move;
      if (bestMove) {
        const isBestMove = bestMove.length === selectedUs.length && bestMove.every(idx => selectedUs.includes(idx));
        if (!isBestMove) {
          currentSelectionScore = computeGuaranteedScoreForMove(state, matrix, selectedUs);
        }
      }
    }
    
    return (
      <div className="p-3">
        {/* Army list modal */}
        {showArmyListPlayer && (
          <ArmyListModal player={showArmyListPlayer} onClose={() => setShowArmyListPlayer(null)} />
        )}
        
        {/* Reset confirm dialog */}
        {showResetConfirm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-lg p-6 max-w-md">
              <h3 className="text-lg font-bold mb-2">Réinitialiser ?</h3>
              <p className="text-gray-300 mb-4">Tout le pairing sera perdu.</p>
              <div className="flex gap-3 justify-end">
                <button onClick={() => setShowResetConfirm(false)} className="px-4 py-2 bg-gray-700 rounded">Annuler</button>
                <button onClick={resetPairing} className="px-4 py-2 bg-red-600 rounded">Confirmer</button>
              </div>
            </div>
          </div>
        )}
        
        {/* Best combinations modal */}
        {showBestCombinations && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800 rounded-lg w-full max-w-4xl max-h-[90vh] flex flex-col">
              <div className="p-4 border-b border-gray-700 flex items-center justify-between">
                <h3 className="text-lg font-bold">🎯 Meilleures combinaisons restantes</h3>
                <button 
                  onClick={() => setShowBestCombinations(false)} 
                  className="px-4 py-2 bg-blue-600 rounded-lg font-semibold hover:bg-blue-500"
                >
                  ← Retour au pairing
                </button>
              </div>
              
              <div className="p-4 overflow-auto flex-1">
                {(() => {
                  const combinations = calculateBestRemainingCombinations(state, matrix, 25);
                  const fixedCount = state.fixedDuels.length;
                  
                  if (combinations.length === 0) {
                    return <p className="text-gray-400 text-center">Aucune combinaison disponible</p>;
                  }
                  
                  return (
                    <div>
                      <div className="text-sm text-gray-400 mb-3">
                        {fixedCount > 0 && (
                          <span className="bg-gray-700 px-2 py-1 rounded mr-2">
                            {fixedCount} duel{fixedCount > 1 ? 's' : ''} fixé{fixedCount > 1 ? 's' : ''} = {calculateTeamScore(state.fixedDuels, matrix)} pts
                          </span>
                        )}
                        <span>{combinations.length} combinaison{combinations.length > 1 ? 's' : ''}</span>
                      </div>
                      
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-600">
                            <th className="py-2 px-1 text-left text-gray-400 font-medium">#</th>
                            <th className="py-2 px-1 text-center text-gray-400 font-medium">Score</th>
                            <th className="py-2 px-1 text-center text-gray-400 font-medium">Résultat</th>
                            {[0, 1, 2, 3, 4, 5].map(i => (
                              <th key={i} className="py-2 px-1 text-center text-gray-400 font-medium">
                                <span className="text-blue-400">{data.myTeam.players[i]?.factionShort || data.myTeam.players[i]?.faction?.slice(0, 3) || `J${i+1}`}</span>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {combinations.map((combo, idx) => {
                            const isWin = combo.score > 65;
                            const isDraw = combo.score >= 55 && combo.score <= 65;
                            const resultColor = isWin ? 'text-green-400' : isDraw ? 'text-yellow-400' : 'text-red-400';
                            const rowBg = idx % 2 === 0 ? 'bg-gray-900/30' : 'bg-gray-800/30';
                            
                            // Créer un mapping ourIdx -> duel pour afficher dans l'ordre de nos joueurs
                            const duelsByOurPlayer = {};
                            combo.duels.forEach(duel => {
                              duelsByOurPlayer[duel.us] = duel;
                            });
                            
                            return (
                              <tr key={idx} className={`${rowBg} border-b border-gray-700/50`}>
                                <td className="py-2 px-1 text-gray-500 font-mono">{idx + 1}</td>
                                <td className={`py-2 px-1 text-center font-bold ${resultColor}`}>{combo.score}</td>
                                <td className={`py-2 px-1 text-center ${resultColor}`}>
                                  {isWin ? '🏆' : isDraw ? '🤝' : '❌'}
                                </td>
                                {[0, 1, 2, 3, 4, 5].map(ourIdx => {
                                  const duel = duelsByOurPlayer[ourIdx];
                                  if (!duel) return <td key={ourIdx} className="py-2 px-1 text-center text-gray-600">-</td>;
                                  
                                  const theirPlayer = opponent.players[duel.them];
                                  const symbol = getMatrixValue(matrix, duel.us, duel.them);
                                  const isFixed = duel.fixed;
                                  
                                  return (
                                    <td key={ourIdx} className="py-2 px-1 text-center">
                                      <div className={`inline-flex items-center gap-1 px-1 py-0.5 rounded ${isFixed ? 'bg-gray-600/50' : ''}`}>
                                        {isFixed && <span className="text-yellow-400 text-xs">🔒</span>}
                                        <span className={`px-1 rounded text-xs font-bold ${getSymbolColor(symbol)}`}>
                                          {symbol}
                                        </span>
                                        <span className="text-red-400 text-xs">
                                          {theirPlayer?.factionShort || theirPlayer?.faction?.slice(0, 3) || '?'}
                                        </span>
                                      </div>
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}
              </div>
              
              <div className="p-4 border-t border-gray-700">
                <button 
                  onClick={() => setShowBestCombinations(false)} 
                  className="w-full py-3 bg-blue-600 rounded-lg font-semibold hover:bg-blue-500"
                >
                  ← Retour au pairing
                </button>
              </div>
            </div>
          </div>
        )}
        
        {/* Decision Tree Modal */}
        {showDecisionTree && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800 rounded-lg w-full max-w-5xl max-h-[90vh] flex flex-col">
              <div className="p-4 border-b border-gray-700 flex items-center justify-between">
                <h3 className="text-lg font-bold">🌳 Arbre de décision - Phase {state.phase} : {PHASES[state.phase]?.name}</h3>
                <button 
                  onClick={() => setShowDecisionTree(false)} 
                  className="px-4 py-2 bg-purple-600 rounded-lg font-semibold hover:bg-purple-500"
                >
                  ✕ Fermer
                </button>
              </div>
              
              <div className="p-4 border-b border-gray-700 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showTreeProbabilities}
                      onChange={(e) => setShowTreeProbabilities(e.target.checked)}
                      className="rounded"
                    />
                    <span className="text-sm">Afficher les probabilités</span>
                  </label>
                </div>
                {selectedUs.length > 0 && (
                  <div className="text-sm text-yellow-400">
                    📌 Présélection active : {selectedUs.map(i => getOurPlayer(i)?.factionShort || `J${i+1}`).join(' + ')}
                  </div>
                )}
              </div>
              
              <div className="p-4 overflow-auto flex-1 font-mono text-sm">
                {(() => {
                  const tree = generateDecisionTree(state, matrix, selectedUs.length > 0 ? selectedUs : null, data.myTeam.players, opponent.players);
                  
                  if (tree.nodes.length === 0) {
                    return <p className="text-gray-400 text-center">Aucune donnée disponible</p>;
                  }
                  
                  // Trouver le meilleur score global pour marquer ✅
                  const allFinalScores = [];
                  const collectScores = (node) => {
                    if (node.finalScore !== undefined) allFinalScores.push(node.finalScore);
                    if (node.children) node.children.forEach(collectScores);
                  };
                  tree.nodes.forEach(collectScores);
                  const bestScore = Math.max(...allFinalScores);
                  const worstScore = Math.min(...allFinalScores);
                  
                  // Probas max par niveau
                  const maxProbByLevel = tree.maxProbByLevel || { 2: 0, 4: 0 };
                  
                  // Fonction récursive pour rendre l'arbre
                  const renderNode = (node, depth = 0, prefix = '', isLast = true) => {
                    const indent = prefix + (depth > 0 ? (isLast ? '└── ' : '├── ') : '');
                    const childPrefix = prefix + (depth > 0 ? (isLast ? '    ' : '│   ') : '');
                    
                    const isUs = node.type === 'us';
                    const colorClass = isUs ? 'text-blue-400' : 'text-red-400';
                    const icon = isUs ? '🔵' : '🔴';
                    
                    // Utiliser playerTeam pour déterminer de quelle équipe sont les joueurs
                    const playerTeam = node.playerTeam || (isUs ? 'us' : 'them');
                    
                    // Formater le coup avec la bonne équipe
                    const moveText = node.move.map(i => {
                      const player = playerTeam === 'us' ? getOurPlayer(i) : getTheirPlayer(i);
                      return player?.factionShort || player?.faction?.slice(0, 4) || `J${i+1}`;
                    }).join(' + ');
                    
                    // Probabilité (pour les coups adverses) avec coloration verte si max du niveau
                    let probElement = null;
                    if (!isUs && showTreeProbabilities && node.probability !== undefined) {
                      const isMaxProb = node.probability === maxProbByLevel[node.level];
                      const probClass = isMaxProb ? 'text-green-400 font-bold' : 'text-gray-500';
                      probElement = <span className={probClass}> ({node.probability}%)</span>;
                    }
                    
                    // Score final
                    let scoreText = '';
                    let scoreClass = '';
                    if (node.finalScore !== undefined) {
                      scoreText = ` → ${node.finalScore}`;
                      if (node.finalScore === bestScore) {
                        scoreText += ' ✅';
                        scoreClass = 'text-green-400';
                      } else if (node.finalScore < 55) {
                        scoreText += ' ⚠️';
                        scoreClass = 'text-red-400';
                      }
                    }
                    
                    // Oubliés/Refusés
                    let forgottenRefusedElement = null;
                    if (node.forgottenRefused) {
                      const fr = node.forgottenRefused;
                      const parts = [];
                      if (fr.forgotten) {
                        const forgottenUs = getOurPlayer(fr.forgotten.us)?.factionShort || `J${fr.forgotten.us+1}`;
                        const forgottenThem = getTheirPlayer(fr.forgotten.them)?.factionShort || `J${fr.forgotten.them+1}`;
                        parts.push(`👻 ${forgottenUs} vs ${forgottenThem} (${fr.forgotten.symbol})`);
                      }
                      if (fr.refused) {
                        const refusedUs = getOurPlayer(fr.refused.us)?.factionShort || `J${fr.refused.us+1}`;
                        const refusedThem = getTheirPlayer(fr.refused.them)?.factionShort || `J${fr.refused.them+1}`;
                        parts.push(`🚫 ${refusedUs} vs ${refusedThem} (${fr.refused.symbol})`);
                      }
                      if (parts.length > 0) {
                        forgottenRefusedElement = (
                          <span className="text-gray-500 text-xs ml-2">| {parts.join(' | ')}</span>
                        );
                      }
                    }
                    
                    // Description du niveau
                    const levelDesc = {
                      1: state.phase === 1 ? 'Notre Def1' : state.phase === 2 ? 'Nos Att1' : state.phase === 3 ? 'Notre Assign' : state.phase === 4 ? 'Notre Def2' : state.phase === 5 ? 'Nos Att2' : 'Notre Assign',
                      2: state.phase === 1 ? 'Leur Def1' : state.phase === 2 ? 'Leurs Att1' : state.phase === 3 ? 'Leur Assign' : state.phase === 4 ? 'Leur Def2' : state.phase === 5 ? 'Leurs Att2' : 'Leur Assign',
                      3: state.phase === 1 ? 'Nos Att1' : state.phase === 2 ? 'Notre Def2' : state.phase === 3 ? 'Notre Def2' : state.phase === 4 ? 'Nos Att2' : '',
                      4: state.phase === 1 ? 'Leurs Att1' : state.phase === 2 ? 'Leur Def2' : state.phase === 3 ? 'Leur Def2' : state.phase === 4 ? 'Leurs Att2' : '',
                    };
                    
                    const levelLabel = depth === 0 && node.level ? (
                      <span className="text-gray-500 text-xs mr-2">[{levelDesc[node.level] || ''}]</span>
                    ) : null;
                    
                    return (
                      <div key={`${depth}-${JSON.stringify(node.move)}`}>
                        <div className="whitespace-pre">
                          <span className="text-gray-600">{indent}</span>
                          {levelLabel}
                          <span>{icon}</span>
                          <span className={colorClass}> {moveText}</span>
                          {probElement}
                          <span className={scoreClass}>{scoreText}</span>
                          {forgottenRefusedElement}
                        </div>
                        {node.children && node.children.map((child, idx) => 
                          renderNode(child, depth + 1, childPrefix, idx === node.children.length - 1)
                        )}
                      </div>
                    );
                  };
                  
                  return (
                    <div className="space-y-4">
                      {tree.nodes.map((node, idx) => (
                        <div key={idx} className="border-b border-gray-700 pb-4 last:border-0">
                          {renderNode(node, 0, '', true)}
                        </div>
                      ))}
                      
                      <div className="mt-4 pt-4 border-t border-gray-600 text-xs text-gray-400">
                        <div className="flex flex-wrap gap-4">
                          <span>🔵 Notre choix</span>
                          <span>🔴 Réponse adverse</span>
                          <span className="text-green-400">✅ Meilleur ({bestScore})</span>
                          <span className="text-red-400">⚠️ Défaite (&lt;55)</span>
                          <span>👻 Oublié</span>
                          <span>🚫 Refusé</span>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
              
              <div className="p-4 border-t border-gray-700">
                <button 
                  onClick={() => setShowDecisionTree(false)} 
                  className="w-full py-3 bg-purple-600 rounded-lg font-semibold hover:bg-purple-500"
                >
                  ← Retour au pairing
                </button>
              </div>
            </div>
          </div>
        )}
        
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div>
            <span className="text-lg font-bold">{data.myTeam.name}</span>
            <span className="text-gray-400 mx-2">vs</span>
            <span className="text-lg font-bold text-red-400">{opponent.name}</span>
          </div>
          <div className="flex items-center gap-4">
            {state.fixedDuels.length > 0 && (
              <div className="bg-gray-800 px-3 py-1 rounded">
                <span className="text-gray-400 text-sm">Score: </span>
                <span className="font-bold">{currentScore}/120</span>
              </div>
            )}
            <button onClick={handleUndo} disabled={history.length === 0} className="px-3 py-1 bg-gray-700 rounded text-sm disabled:opacity-50">↩ Annuler</button>
            <button onClick={() => setShowBestCombinations(true)} disabled={isFinished} className="px-3 py-1 bg-blue-700 rounded text-sm disabled:opacity-50">🎯 Top 25</button>
            <button onClick={() => setShowResetConfirm(true)} className="px-3 py-1 bg-red-700 rounded text-sm">🔄 Reset</button>
          </div>
        </div>
        
        {/* Main layout */}
        <div className="flex gap-3 mb-3">
          {/* Left column */}
          <div className="w-1/3">
            <div className="bg-gray-800 rounded-lg p-3 mb-3">
              {isFinished ? (
                <div className="text-center">
                  <h2 className="text-xl font-bold mb-1">Terminé !</h2>
                  <div className="text-3xl font-bold">{currentScore}/120</div>
                  <div className={`text-xl ${getResultColor(currentScore)}`}>{getResultLabel(currentScore)}</div>
                </div>
              ) : (
                <>
                  <h2 className="text-lg font-semibold">Phase {state.phase}: {PHASES[state.phase]?.name}</h2>
                  <p className="text-gray-400 text-sm">{PHASES[state.phase]?.description}</p>
                </>
              )}
            </div>
            
            {/* Performance summary when finished */}
            {isFinished && state.initialStats && (
              <div className="bg-gray-800 rounded-lg p-3 mb-3">
                <h3 className="text-sm font-semibold mb-3">📊 Performance du Pairing</h3>
                
                {/* Note de performance */}
                {(() => {
                  const rating = calculatePerformanceRating(currentScore, state.initialStats.min, state.initialStats.max);
                  const { grade, color, label } = getPerformanceGrade(rating);
                  return (
                    <div className="text-center mb-4">
                      <div className={`text-5xl font-bold ${color}`}>{grade}</div>
                      <div className={`text-sm ${color}`}>{label}</div>
                      <div className="text-xs text-gray-400 mt-1">{Math.round(rating)}% du potentiel</div>
                    </div>
                  );
                })()}
                
                {/* Barre de position */}
                <div className="mb-4">
                  <div className="flex justify-between text-xs text-gray-400 mb-1">
                    <span>Pire: {state.initialStats.min}</span>
                    <span>Moy: {state.initialStats.avg.toFixed(1)}</span>
                    <span>Max: {state.initialStats.max}</span>
                  </div>
                  <div className="relative h-4 bg-gradient-to-r from-red-600 via-gray-400 to-green-600 rounded">
                    {/* Marqueur du score */}
                    <div 
                      className="absolute top-0 w-1 h-4 bg-white border border-gray-900"
                      style={{ 
                        left: `${((currentScore - state.initialStats.min) / (state.initialStats.max - state.initialStats.min)) * 100}%`,
                        transform: 'translateX(-50%)'
                      }}
                    />
                  </div>
                </div>
                
                {/* Stats détaillées */}
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Score obtenu</span>
                    <span className="font-bold">{currentScore}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Score garanti initial</span>
                    <span>{state.initialGuaranteed?.toFixed(1) || '?'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Bonus/Malus vs garanti</span>
                    <span className={currentScore >= state.initialGuaranteed ? 'text-green-400' : 'text-red-400'}>
                      {currentScore >= state.initialGuaranteed ? '+' : ''}{(currentScore - (state.initialGuaranteed || 0)).toFixed(1)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Pire pairing possible</span>
                    <span className="text-red-400">{state.initialStats.min}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Meilleur pairing possible</span>
                    <span className="text-green-400">{state.initialStats.max}</span>
                  </div>
                </div>
                
                {/* Bouton saisie scores si associé à une ronde */}
                {state.roundIndex !== null && state.roundIndex !== undefined && (
                  <button
                    onClick={() => {
                      setCurrentRoundIndex(state.roundIndex);
                      setCurrentPage('scores');
                    }}
                    className="w-full mt-4 py-2 bg-blue-600 rounded-lg font-semibold hover:bg-blue-500"
                  >
                    📝 Saisir les scores des matchs
                  </button>
                )}
                
                {/* Bouton export image */}
                <button
                  onClick={() => exportPairingImage(state.roundIndex, state)}
                  className="w-full mt-2 py-2 bg-purple-600 rounded-lg font-semibold hover:bg-purple-500"
                >
                  📷 Exporter en image
                </button>
              </div>
            )}
            
            {/* Bouton export image si pairing terminé mais pas d'initialStats */}
            {isFinished && !state.initialStats && (
              <div className="bg-gray-800 rounded-lg p-3 mb-3">
                <div className="text-center mb-3">
                  <h2 className="text-xl font-bold mb-1">Pairing terminé !</h2>
                  <div className="text-2xl font-bold">{currentScore} / 120</div>
                  <div className={`text-xl ${getResultColor(currentScore)}`}>{getResultLabel(currentScore)}</div>
                </div>
                
                {/* Bouton saisie scores si associé à une ronde */}
                {state.roundIndex !== null && state.roundIndex !== undefined && (
                  <button
                    onClick={() => {
                      setCurrentRoundIndex(state.roundIndex);
                      setCurrentPage('scores');
                    }}
                    className="w-full py-2 bg-blue-600 rounded-lg font-semibold hover:bg-blue-500"
                  >
                    📝 Saisir les scores des matchs
                  </button>
                )}
                
                {/* Bouton export image */}
                <button
                  onClick={() => exportPairingImage(state.roundIndex, state)}
                  className="w-full mt-2 py-2 bg-purple-600 rounded-lg font-semibold hover:bg-purple-500"
                >
                  📷 Exporter en image
                </button>
              </div>
            )}
            
            {/* Defenders display */}
            {showDefenders && state.us.defender !== null && state.them.defender !== null && (
              <div className="grid grid-cols-2 gap-3 mb-3">
                <DefenderDisplay player={getOurPlayer(state.us.defender)} side="us" />
                <DefenderDisplay player={getTheirPlayer(state.them.defender)} side="them" />
              </div>
            )}
            
            {!isFinished && (
              <>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  {/* Our selection */}
                  <div className="bg-blue-900/50 rounded-lg p-3">
                    <h3 className="text-sm font-semibold mb-2 flex items-center justify-between">
                      <span>🛡️ {data.myTeam.name}</span>
                      <span className="bg-blue-800 px-2 py-0.5 rounded text-xs">{selectedUs.length}/{required}</span>
                    </h3>
                    <div className="flex flex-col gap-2">
                      {isAssignPhase ? (
                        selectableUs.map(playerIdx => (
                          <PlayerBadgeAssign
                            key={playerIdx}
                            player={getTheirPlayer(playerIdx)}
                            selected={selectedUs.includes(playerIdx)}
                            onClick={() => handleSelect('us', playerIdx)}
                            originalTeam="them"
                            displayedInColumn="us"
                          />
                        ))
                      ) : (
                        selectableUs.map(playerIdx => (
                          <PlayerBadge
                            key={playerIdx}
                            player={getOurPlayer(playerIdx)}
                            selected={selectedUs.includes(playerIdx)}
                            onClick={() => handleSelect('us', playerIdx)}
                            team="us"
                          />
                        ))
                      )}
                    </div>
                  </div>
                  
                  {/* Their selection */}
                  <div className="bg-red-900/50 rounded-lg p-3">
                    <h3 className="text-sm font-semibold mb-2 flex items-center justify-between">
                      <span>⚔️ {opponent.name}</span>
                      <span className="bg-red-800 px-2 py-0.5 rounded text-xs">{selectedThem.length}/{required}</span>
                    </h3>
                    <div className="flex flex-col gap-2">
                      {isAssignPhase ? (
                        selectableThem.map(playerIdx => (
                          <PlayerBadgeAssign
                            key={playerIdx}
                            player={getOurPlayer(playerIdx)}
                            selected={selectedThem.includes(playerIdx)}
                            onClick={() => handleSelect('them', playerIdx)}
                            originalTeam="us"
                            displayedInColumn="them"
                          />
                        ))
                      ) : (
                        selectableThem.map(playerIdx => (
                          <PlayerBadge
                            key={playerIdx}
                            player={getTheirPlayer(playerIdx)}
                            selected={selectedThem.includes(playerIdx)}
                            onClick={() => handleSelect('them', playerIdx)}
                            team="them"
                          />
                        ))
                      )}
                    </div>
                  </div>
                </div>
                
                <button
                  onClick={handleValidate}
                  disabled={!canValidate}
                  className="w-full py-2 bg-green-600 rounded-lg font-semibold disabled:opacity-50"
                >
                  Valider Phase {state.phase} →
                </button>
              </>
            )}
          </div>
          
          {/* Middle column - Analysis */}
          <div className="w-1/3">
            <div className="bg-gray-800 rounded-lg p-3 h-full">
              <h2 className="text-sm font-semibold mb-3">🧠 Analyse</h2>
              
              {!isFinished && (
                <>
                  <div className="bg-gray-700 rounded p-2 mb-3">
                    <div className="text-xs text-gray-400">Score garanti</div>
                    <div className="text-2xl font-bold text-center">{analysis.bestGuaranteed.toFixed(1)}</div>
                    <div className={`text-xs text-center ${getResultColor(analysis.bestGuaranteed)}`}>
                      {getResultLabel(analysis.bestGuaranteed)}
                    </div>
                  </div>
                  
                  {currentSelectionScore !== null && (
                    <div className="bg-yellow-900/50 border border-yellow-600 rounded p-2 mb-3">
                      <div className="text-xs text-yellow-400">⚠️ Choix non optimal</div>
                      <div className="text-xl font-bold text-center text-yellow-300">{currentSelectionScore.toFixed(1)}</div>
                      <div className="text-xs text-center text-yellow-400">
                        ({(currentSelectionScore - analysis.bestGuaranteed).toFixed(1)} pts)
                      </div>
                    </div>
                  )}
                  
                  <div className="mb-3">
                    <div className="flex justify-between text-xs text-gray-400 mb-1 px-1">
                      <span>📊 Nos meilleurs choix</span>
                      <span className="text-right">Gar. / Moy / σ</span>
                    </div>
                    {analysis.ourRanking.map((item, idx) => {
                      // En phase d'assignation (3/6), nos choix sont des joueurs ADVERSES
                      const getPlayerForOurMove = isAssignPhase ? getTheirPlayer : getOurPlayer;
                      return (
                        <div key={idx} className={`flex justify-between items-center text-sm p-2 rounded mb-1 ${idx === 0 ? 'bg-green-900/50 border border-green-600' : 'bg-gray-700'}`}>
                          <span className="truncate flex-1">#{idx + 1} {item.move.map(i => getPlayerForOurMove(i)?.factionShort || `J${i+1}`).join(' + ')}</span>
                          <span className="text-xs font-mono text-right ml-2 whitespace-nowrap">
                            <span className="text-green-400">{item.guaranteed.toFixed(0)}</span>
                            <span className="text-gray-500"> / </span>
                            <span className="text-blue-400">{item.mean.toFixed(1)}</span>
                            <span className="text-gray-500"> / </span>
                            <span className="text-yellow-400">{item.stdDev.toFixed(1)}</span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  
                  <div>
                    <div className="flex justify-between text-xs text-gray-400 mb-1 px-1">
                      <span>🎯 Prédiction adverse</span>
                      <span className="text-right">Gar. / Moy / σ</span>
                    </div>
                    {analysis.theirRanking.map((item, idx) => {
                      // En phase d'assignation (3/6), leurs choix sont des joueurs de NOTRE équipe
                      const getPlayerForTheirMove = isAssignPhase ? getOurPlayer : getTheirPlayer;
                      return (
                        <div key={idx} className={`flex justify-between items-center text-sm p-2 rounded mb-1 ${idx === 0 ? 'bg-red-900/50 border border-red-600' : 'bg-gray-700'}`}>
                          <span className="truncate flex-1">#{idx + 1} {item.move.map(i => getPlayerForTheirMove(i)?.factionShort || `J${i+1}`).join(' + ')}</span>
                          <span className="text-xs font-mono text-right ml-2 whitespace-nowrap">
                            <span className="text-green-400">{item.guaranteed.toFixed(0)}</span>
                            <span className="text-gray-500"> / </span>
                            <span className="text-blue-400">{item.mean.toFixed(1)}</span>
                            <span className="text-gray-500"> / </span>
                            <span className="text-yellow-400">{item.stdDev.toFixed(1)}</span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
              
              {isFinished && <div className="text-center text-gray-400 py-8">Pairing terminé</div>}
            </div>
          </div>
          
          {/* Right column - Matrix */}
          <div className="w-1/3">
            <div className="bg-gray-800 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-semibold">Matrice</h2>
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hideFixedPlayers}
                    onChange={(e) => setHideFixedPlayers(e.target.checked)}
                    className="rounded"
                  />
                  Masquer fixés
                </label>
              </div>
              
              <table className="w-full text-xs table-fixed">
                <thead>
                  <tr>
                    <th className="p-1 text-left w-16"></th>
                    {filteredThemIndices.map(idx => {
                      const p = getTheirPlayer(idx);
                      return (
                        <th key={idx} className="p-1 text-center">
                          <div 
                            className="truncate text-xs cursor-pointer hover:text-blue-400" 
                            title={`Cliquer pour voir la liste de ${p?.faction}`}
                            onClick={() => setShowArmyListPlayer(p)}
                          >
                            {p?.factionShort || p?.faction?.slice(0, 6) || '?'}
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {filteredUsIndices.map(ourIdx => {
                    const ourPlayer = getOurPlayer(ourIdx);
                    const isHighlighted = highlightedRow === ourIdx;
                    return (
                      <tr 
                        key={ourIdx} 
                        style={isHighlighted ? { outline: '2px solid rgb(96, 165, 250)', outlineOffset: '-1px' } : {}}
                      >
                        <td className={`p-1 text-left ${isHighlighted ? 'font-bold text-blue-300' : ''}`}>
                          <div className="truncate text-xs" title={ourPlayer?.faction}>
                            {ourPlayer?.factionShort || ourPlayer?.faction?.slice(0, 6) || ourPlayer?.pseudo}
                          </div>
                        </td>
                        {filteredThemIndices.map(theirIdx => {
                          const symbol = getMatrixValue(matrix, ourIdx, theirIdx);
                          return (
                            <td key={theirIdx} className="p-0.5 text-center">
                              <div className={`rounded px-1 py-0.5 ${getSymbolColor(symbol)}`}>{symbol}</div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              
              <div className="mt-3 pt-2 border-t border-gray-700">
                <div className="flex flex-wrap gap-1 justify-center">
                  {Object.entries(SYMBOL_CONFIG).map(([symbol, cfg]) => (
                    <div key={symbol} className={`rounded px-1.5 py-0.5 text-xs ${getSymbolColor(symbol)}`}>
                      {symbol}={cfg.median}
                    </div>
                  ))}
                </div>
              </div>
              
              {/* Barre de distribution des pairings */}
              {(() => {
                const dist = calculatePairingDistribution(state, matrix, selectedUs, selectedThem);
                if (dist.total === 0) return null;
                const defeatPct = (dist.defeat / dist.total) * 100;
                const drawPct = (dist.draw / dist.total) * 100;
                const victoryPct = (dist.victory / dist.total) * 100;
                return (
                  <div className="mt-3 pt-2 border-t border-gray-700">
                    <div className="text-xs text-gray-400 mb-2 text-center">
                      {dist.total} pairings possibles
                    </div>
                    <div className="flex h-5 rounded overflow-hidden">
                      {defeatPct > 0 && (
                        <div 
                          className="bg-red-600 flex items-center justify-center text-xs text-white font-medium"
                          style={{ width: `${defeatPct}%` }}
                          title={`Défaite (<55): ${dist.defeat} pairings`}
                        >
                          {defeatPct >= 15 && `${Math.round(defeatPct)}%`}
                        </div>
                      )}
                      {drawPct > 0 && (
                        <div 
                          className="bg-gray-400 flex items-center justify-center text-xs text-white font-medium"
                          style={{ width: `${drawPct}%` }}
                          title={`Égalité (55-65): ${dist.draw} pairings`}
                        >
                          {drawPct >= 15 && `${Math.round(drawPct)}%`}
                        </div>
                      )}
                      {victoryPct > 0 && (
                        <div 
                          className="bg-green-600 flex items-center justify-center text-xs text-white font-medium"
                          style={{ width: `${victoryPct}%` }}
                          title={`Victoire (>65): ${dist.victory} pairings`}
                        >
                          {victoryPct >= 15 && `${Math.round(victoryPct)}%`}
                        </div>
                      )}
                    </div>
                    <div className="flex justify-between text-xs mt-1">
                      <span className="text-red-400">{Math.round(defeatPct)}%</span>
                      <span className="text-gray-400">{Math.round(drawPct)}%</span>
                      <span className="text-green-400">{Math.round(victoryPct)}%</span>
                    </div>
                  </div>
                );
              })()}
              
              {/* Bouton Arbre de décision */}
              {!isFinished && (
                <button
                  onClick={() => setShowDecisionTree(true)}
                  className="w-full mt-3 py-2 bg-purple-600 rounded-lg text-sm font-semibold hover:bg-purple-500"
                >
                  🌳 Arbre de décision
                </button>
              )}
            </div>
          </div>
        </div>
        
        {/* Fixed duels */}
        {state.fixedDuels.length > 0 && (
          <div className="bg-gray-800 rounded-lg p-3">
            <h2 className="text-sm font-semibold mb-2 flex items-center justify-between">
              <span>Duels Fixés</span>
              <span className="bg-gray-700 px-2 py-0.5 rounded text-xs">{state.fixedDuels.length}/6</span>
            </h2>
            <div className="space-y-2">
              {state.fixedDuels.map((duel, index) => {
                const ourPlayer = getOurPlayer(duel.us);
                const theirPlayer = getTheirPlayer(duel.them);
                const symbol = getMatrixValue(matrix, duel.us, duel.them);
                const icons = { defense: '🛡️', attack: '⚔️', forgotten: '👻', refused: '🚫' };
                
                // Tables déjà assignées (exclure celle du duel actuel)
                const usedTables = state.fixedDuels
                  .filter((d, i) => i !== index && d.table !== null)
                  .map(d => d.table);
                
                return (
                  <div key={index} className="bg-gray-700 rounded p-2 text-sm">
                    <div className="flex items-center gap-2">
                      <span>{icons[duel.type]}</span>
                      <span className="text-blue-300">{ourPlayer?.factionShort || ourPlayer?.faction?.slice(0, 6)}</span>
                      <span className={`rounded px-1 ${getSymbolColor(symbol)}`}>{symbol}</span>
                      <span className="text-red-300">{theirPlayer?.factionShort || theirPlayer?.faction?.slice(0, 6)}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-gray-400">Table:</span>
                      <select
                        value={duel.table ?? ''}
                        onChange={(e) => {
                          const newTable = e.target.value === '' ? null : Number(e.target.value);
                          const newDuels = [...state.fixedDuels];
                          newDuels[index] = { ...duel, table: newTable };
                          setPairingState({ ...state, fixedDuels: newDuels });
                          
                          // Synchroniser avec duelScores si la ronde existe
                          if (state.roundIndex !== null && state.roundIndex !== undefined) {
                            const round = data.rounds?.[state.roundIndex];
                            if (round?.duelScores) {
                              const newRounds = [...data.rounds];
                              const newDuelScores = [...round.duelScores];
                              if (newDuelScores[index]) {
                                newDuelScores[index] = { ...newDuelScores[index], table: newTable };
                              }
                              newRounds[state.roundIndex] = { 
                                ...round, 
                                duelScores: newDuelScores,
                                pairingResult: { ...round.pairingResult, fixedDuels: newDuels }
                              };
                              setData({ ...data, rounds: newRounds });
                            }
                          }
                        }}
                        className="bg-gray-600 rounded px-2 py-0.5 text-xs"
                      >
                        <option value="">-</option>
                        {[1, 2, 3, 4, 5, 6].map(t => (
                          <option 
                            key={t} 
                            value={t} 
                            disabled={usedTables.includes(t)}
                          >
                            {t} {usedTables.includes(t) ? '(prise)' : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };
  
  // ============================================
  // RENDER SCORES PAGE
  // ============================================
  const renderScores = () => {
    if (currentRoundIndex === null) {
      return (
        <div className="p-4">
          <h2 className="text-xl font-bold mb-4">📝 Saisie des Scores</h2>
          <p className="text-gray-400">Aucune ronde sélectionnée.</p>
        </div>
      );
    }
    
    const round = data.rounds ? data.rounds[currentRoundIndex] : null;
    if (!round || !round.pairingResult) {
      return (
        <div className="p-4">
          <h2 className="text-xl font-bold mb-4">📝 Saisie des Scores</h2>
          <p className="text-gray-400">Le pairing de cette ronde n'a pas encore été effectué.</p>
          <button
            onClick={() => setCurrentPage('settings')}
            className="mt-4 px-4 py-2 bg-gray-700 rounded hover:bg-gray-600"
          >
            ← Retour aux paramètres
          </button>
        </div>
      );
    }
    
    const opponentIndex = round.pairingResult?.opponentIndex;
    const opponent = opponentIndex !== null && opponentIndex !== undefined ? data.opponents[opponentIndex] : null;
    const getOurPlayer = (idx) => data.myTeam.players[idx] || {};
    const getTheirPlayer = (idx) => opponent?.players?.[idx] || {};
    
    const duelScores = round.duelScores || [];
    
    const updateDuelScore = (duelIndex, ourScore) => {
      const newRounds = [...data.rounds];
      const newDuelScores = [...duelScores];
      const score = ourScore === '' ? null : Number(ourScore);
      newDuelScores[duelIndex] = {
        ...newDuelScores[duelIndex],
        ourScore: score,
        theirScore: score !== null ? 20 - score : null, // Calcul automatique
      };
      newRounds[currentRoundIndex] = { ...round, duelScores: newDuelScores };
      setData({ ...data, rounds: newRounds });
    };
    
    // Calcul des totaux
    const totals = duelScores.reduce(
      (acc, duel) => ({
        us: acc.us + (duel?.ourScore || 0),
        them: acc.them + (duel?.theirScore || 0),
      }),
      { us: 0, them: 0 }
    );
    
    const completedDuels = duelScores.filter(d => d && d.ourScore !== null).length;
    
    return (
      <div className="p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold">📝 Scores - {round.name}</h2>
            <p className="text-gray-400 text-sm">
              {data.myTeam.name} vs {opponent?.name}
              {round.scenario && ` • ${round.scenario}`}
              {round.deployment && ` • ${round.deployment}`}
            </p>
          </div>
          <button
            onClick={() => setCurrentPage('settings')}
            className="px-4 py-2 bg-gray-700 rounded hover:bg-gray-600"
          >
            ← Retour
          </button>
        </div>
        
        {/* Score total */}
        <div className="bg-gray-800 rounded-lg p-4 mb-4">
          <div className="flex items-center justify-center gap-8">
            <div className="text-center">
              <div className="text-sm text-gray-400">{data.myTeam.name}</div>
              <div className="text-4xl font-bold text-blue-400">{totals.us}</div>
            </div>
            <div className="text-2xl text-gray-500">-</div>
            <div className="text-center">
              <div className="text-sm text-gray-400">{opponent?.name}</div>
              <div className="text-4xl font-bold text-red-400">{totals.them}</div>
            </div>
          </div>
          <div className="text-center mt-2 text-sm text-gray-400">
            {completedDuels}/6 duels terminés
          </div>
        </div>
        
        {/* Liste des duels */}
        <div className="space-y-3">
          {duelScores.map((duel, index) => {
            if (!duel) return null;
            const ourPlayer = getOurPlayer(duel.us);
            const theirPlayer = getTheirPlayer(duel.them);
            const typeIcons = { defense: '🛡️', attack: '⚔️', forgotten: '👻', refused: '🚫' };
            const isComplete = duel.ourScore !== null;
            
            return (
              <div 
                key={index} 
                className={`bg-gray-800 rounded-lg p-4 ${isComplete ? 'border border-green-700' : ''}`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    {duel.table && (
                      <span className="bg-purple-600 text-white text-xs font-bold px-2 py-0.5 rounded">
                        T{duel.table}
                      </span>
                    )}
                    <span className="text-xl">{typeIcons[duel.type] || '⚔️'}</span>
                    <span className="text-blue-300 font-semibold">
                      {ourPlayer?.pseudo || '?'} ({ourPlayer?.factionShort || ourPlayer?.faction || '?'})
                    </span>
                    <span className="text-gray-500">vs</span>
                    <span className="text-red-300 font-semibold">
                      {theirPlayer?.pseudo || '?'} ({theirPlayer?.factionShort || theirPlayer?.faction || '?'})
                    </span>
                  </div>
                  {isComplete && <span className="text-green-400 text-sm">✓ Terminé</span>}
                </div>
                
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <label className="block text-xs text-gray-400 mb-1">
                      Score {ourPlayer?.pseudo || 'Nous'} (sur 20)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="20"
                      value={duel.ourScore ?? ''}
                      onChange={(e) => updateDuelScore(index, e.target.value)}
                      className="w-full bg-gray-700 rounded px-3 py-2 text-lg font-bold text-blue-400"
                      placeholder="0-20"
                    />
                  </div>
                  <div className="text-2xl text-gray-500 pt-5">-</div>
                  <div className="flex-1">
                    <label className="block text-xs text-gray-400 mb-1">
                      Score {theirPlayer?.pseudo || 'Adversaire'}
                    </label>
                    <div className="w-full bg-gray-600 rounded px-3 py-2 text-lg font-bold text-red-400">
                      {duel.ourScore !== null ? 20 - duel.ourScore : '-'}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        
        {/* Résumé si tous les duels sont terminés */}
        {completedDuels === 6 && (
          <div className="mt-4 bg-gray-800 rounded-lg p-4">
            <h3 className="font-semibold mb-2">Résultat Final</h3>
            {(() => {
              // Règles W40K : < 55 = défaite, 55-65 = égalité, > 65 = victoire
              const isVictory = totals.us > 65;
              const isDefeat = totals.us < 55;
              const resultText = isVictory ? '🏆 Victoire !' : isDefeat ? '😢 Défaite' : '🤝 Égalité';
              const resultColor = isVictory ? 'text-green-400' : isDefeat ? 'text-red-400' : 'text-yellow-400';
              
              return (
                <div className={`text-2xl font-bold ${resultColor}`}>
                  {resultText}
                </div>
              );
            })()}
            <div className="text-sm text-gray-400 mt-1">
              Score pairing prédit : {round.pairingResult?.score || 0}/120 • 
              Résultat réel : {totals.us} - {totals.them}
            </div>
          </div>
        )}
        
        {/* Bouton Export Image */}
        <button
          onClick={() => exportPairingImage(currentRoundIndex)}
          className="w-full mt-4 py-3 bg-purple-600 rounded-lg font-semibold hover:bg-purple-500"
        >
          📷 Exporter en image
        </button>
        
        {/* Bouton Export PDF Feuille de Pairing */}
        <button
          onClick={() => exportPairingPDF(currentRoundIndex)}
          className="w-full mt-2 py-3 bg-orange-600 rounded-lg font-semibold hover:bg-orange-500"
        >
          📄 Exporter feuille de pairing (PDF)
        </button>
      </div>
    );
  };
  
  // ============================================
  // EXPORT IMAGE FUNCTION
  // ============================================
  const exportPairingImage = (roundIndex, pairingStateParam = null) => {
    console.log('exportPairingImage called with roundIndex:', roundIndex);
    console.log('pairingStateParam:', pairingStateParam);
    console.log('pairingState (from hook):', pairingState);
    
    const round = roundIndex !== null && roundIndex !== undefined ? data.rounds?.[roundIndex] : null;
    // Utiliser pairingStateParam s'il est fourni, sinon pairingState du hook
    const currentPairingState = pairingStateParam || pairingState;
    const pairingResult = round?.pairingResult || currentPairingState;
    
    console.log('round:', round);
    console.log('pairingResult:', pairingResult);
    
    if (!pairingResult) {
      console.log('No pairingResult, returning');
      alert('Erreur: Aucun résultat de pairing trouvé');
      return;
    }
    
    const opponentIndex = pairingResult.opponentIndex ?? currentPairingState?.opponentIndex ?? data.selectedOpponentIndex;
    const opponent = data.opponents[opponentIndex];
    const matrix = opponent?.matrix;
    
    console.log('opponentIndex:', opponentIndex);
    console.log('opponent:', opponent);
    
    if (!opponent || !matrix) {
      console.log('No opponent or matrix, returning');
      alert('Erreur: Adversaire ou matrice non trouvé');
      return;
    }
    
    // Pour un pairing libre, fixedDuels est directement sur pairingState
    const fixedDuels = pairingResult.fixedDuels || [];
    console.log('fixedDuels:', fixedDuels);
    
    if (fixedDuels.length === 0) {
      console.log('No fixedDuels, returning');
      alert('Erreur: Aucun duel fixé');
      return;
    }
    
    // Calculer le score si pas déjà présent
    const pairingScore = pairingResult.score ?? calculateTeamScore(fixedDuels, matrix);
    
    const duelScores = round?.duelScores || [];
    const hasAllScores = duelScores.length === 6 && duelScores.every(d => d?.ourScore !== null);
    
    // Facteur de résolution (2x pour meilleure qualité)
    const scale = 2;
    
    // Dimensions du canvas (logiques, utilisées pour le dessin)
    const width = 500;
    const padding = 20;
    const lineHeight = 24;
    const sectionGap = 20;
    
    // Calcul de la hauteur dynamique
    let heightCalc = padding; // Top padding
    heightCalc += 60; // Header
    heightCalc += sectionGap + 80; // Scores section
    heightCalc += sectionGap + 140; // Performance section
    heightCalc += sectionGap + (6 * 50) + 40; // Duels section
    heightCalc += sectionGap + 180; // Matrix section
    heightCalc += 40; // Footer
    heightCalc += padding; // Bottom padding
    const height = heightCalc;
    
    const canvas = document.createElement('canvas');
    // Dimensions physiques du canvas (haute résolution)
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext('2d');
    
    // Appliquer le scale pour que toutes les coordonnées soient automatiquement multipliées
    ctx.scale(scale, scale);
    
    // Couleurs
    const colors = {
      bg: '#1a1a2e',
      cardBg: '#16213e',
      text: '#ffffff',
      textMuted: '#a0a0a0',
      blue: '#4a9eff',
      red: '#ff6b6b',
      green: '#4ade80',
      yellow: '#fbbf24',
      purple: '#a855f7',
      border: '#374151',
    };
    
    // Fond
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, width, height);
    
    let y = padding;
    
    // Helper functions
    const drawRoundedRect = (x, y, w, h, radius, fill) => {
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, radius);
      ctx.fillStyle = fill;
      ctx.fill();
    };
    
    const drawText = (text, x, y, options = {}) => {
      const { color = colors.text, size = 14, align = 'left', bold = false } = options;
      ctx.fillStyle = color;
      ctx.font = `${bold ? 'bold ' : ''}${size}px Arial, sans-serif`;
      ctx.textAlign = align;
      ctx.fillText(text, x, y);
    };
    
    // === HEADER ===
    drawRoundedRect(padding, y, width - 2 * padding, 55, 8, colors.cardBg);
    drawText(`${data.myTeam.name} vs ${opponent.name}`, width / 2, y + 22, { size: 16, bold: true, align: 'center' });
    
    let subHeader = round?.name || 'Pairing';
    if (round?.scenario) subHeader += ` • ${round.scenario}`;
    if (round?.deployment) subHeader += ` • ${round.deployment}`;
    drawText(subHeader, width / 2, y + 42, { size: 11, color: colors.textMuted, align: 'center' });
    
    y += 55 + sectionGap;
    
    // === SCORES ===
    drawRoundedRect(padding, y, width - 2 * padding, 75, 8, colors.cardBg);
    drawText('SCORES', padding + 15, y + 20, { size: 12, bold: true, color: colors.textMuted });
    
    drawText('Score Pairing Cible', padding + 15, y + 42, { size: 12, color: colors.textMuted });
    drawText(`${pairingScore} / 120`, width - padding - 15, y + 42, { size: 16, bold: true, color: colors.blue, align: 'right' });
    
    if (hasAllScores) {
      const totals = duelScores.reduce((acc, d) => ({
        us: acc.us + (d?.ourScore || 0),
        them: acc.them + (d?.theirScore || 0),
      }), { us: 0, them: 0 });
      
      // Règles W40K : < 55 = défaite, 55-65 = égalité, > 65 = victoire
      const isVictory = totals.us > 65;
      const isDefeat = totals.us < 55;
      const resultText = isVictory ? 'VICTOIRE' : isDefeat ? 'DÉFAITE' : 'ÉGALITÉ';
      const resultColor = isVictory ? colors.green : isDefeat ? colors.red : colors.yellow;
      
      drawText('Score Réel', padding + 15, y + 62, { size: 12, color: colors.textMuted });
      drawText(`${totals.us} - ${totals.them}  ${resultText}`, width - padding - 15, y + 62, { size: 14, bold: true, color: resultColor, align: 'right' });
    }
    
    y += 75 + sectionGap;
    
    // === PERFORMANCE ===
    drawRoundedRect(padding, y, width - 2 * padding, 130, 8, colors.cardBg);
    drawText('PERFORMANCE', padding + 15, y + 20, { size: 12, bold: true, color: colors.textMuted });
    
    const stats = pairingResult.initialStats || { min: 40, max: 100, avg: 70 };
    const rating = ((pairingScore - stats.min) / (stats.max - stats.min)) * 100;
    
    const getGrade = (r) => {
      if (r >= 90) return { grade: 'S', color: colors.purple };
      if (r >= 75) return { grade: 'A', color: colors.green };
      if (r >= 60) return { grade: 'B', color: colors.blue };
      if (r >= 45) return { grade: 'C', color: colors.yellow };
      if (r >= 30) return { grade: 'D', color: '#f97316' };
      return { grade: 'E', color: colors.red };
    };
    
    const { grade, color: gradeColor } = getGrade(rating);
    
    // Grade box
    drawRoundedRect(padding + 15, y + 35, 50, 50, 8, gradeColor);
    drawText(grade, padding + 40, y + 70, { size: 28, bold: true, align: 'center' });
    drawText(`${Math.round(rating)}% du potentiel`, padding + 80, y + 65, { size: 12, color: colors.textMuted });
    
    // Progress bar
    const barY = y + 95;
    const barWidth = width - 2 * padding - 30;
    const barX = padding + 15;
    
    // Background bar gradient
    const gradient = ctx.createLinearGradient(barX, 0, barX + barWidth, 0);
    gradient.addColorStop(0, colors.red);
    gradient.addColorStop(0.5, colors.yellow);
    gradient.addColorStop(1, colors.green);
    
    drawRoundedRect(barX, barY, barWidth, 10, 5, '#374151');
    ctx.beginPath();
    ctx.roundRect(barX, barY, barWidth, 10, 5);
    ctx.fillStyle = gradient;
    ctx.fill();
    
    // Marker
    const markerX = barX + (rating / 100) * barWidth;
    ctx.fillStyle = colors.text;
    ctx.beginPath();
    ctx.arc(markerX, barY + 5, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = colors.bg;
    ctx.beginPath();
    ctx.arc(markerX, barY + 5, 3, 0, Math.PI * 2);
    ctx.fill();
    
    // Labels
    drawText(`${stats.min}`, barX, barY + 25, { size: 10, color: colors.textMuted });
    drawText(`${pairingScore}`, markerX, barY + 25, { size: 10, color: colors.text, align: 'center' });
    drawText(`${stats.max}`, barX + barWidth, barY + 25, { size: 10, color: colors.textMuted, align: 'right' });
    
    y += 130 + sectionGap;
    
    // === DUELS ===
    const duelsHeight = 6 * 48 + 35;
    drawRoundedRect(padding, y, width - 2 * padding, duelsHeight, 8, colors.cardBg);
    drawText('DUELS', padding + 15, y + 20, { size: 12, bold: true, color: colors.textMuted });
    
    const typeEmojis = { defense: '🛡️', attack: '⚔️', forgotten: '👻', refused: '🚫' };
    
    fixedDuels.forEach((duel, i) => {
      const duelY = y + 35 + i * 48;
      const ourPlayer = data.myTeam.players[duel.us];
      const theirPlayer = opponent.players[duel.them];
      const symbol = getMatrixValue(matrix, duel.us, duel.them);
      const duelScore = duelScores[i];
      
      // Table number if assigned
      if (duel.table) {
        drawRoundedRect(padding + 15, duelY + 2, 22, 16, 3, colors.purple);
        drawText(`T${duel.table}`, padding + 26, duelY + 14, { size: 9, bold: true, align: 'center' });
      }
      
      // Type icon
      const iconX = duel.table ? padding + 45 : padding + 20;
      drawText(typeEmojis[duel.type] || '⚔️', iconX, duelY + 15, { size: 14 });
      
      // Our player
      const textStartX = duel.table ? padding + 70 : padding + 45;
      const ourName = `${ourPlayer?.pseudo || '?'} (${ourPlayer?.factionShort || ourPlayer?.faction?.slice(0, 4) || '?'})`;
      drawText(ourName, textStartX, duelY + 15, { size: 12, color: colors.blue });
      
      // Symbol
      const symbolColors = { '++': colors.green, '+': '#86efac', '=': colors.textMuted, '-': '#fca5a5', '--': colors.red };
      drawText(symbol, width / 2 + 20, duelY + 15, { size: 14, bold: true, color: symbolColors[symbol] || colors.textMuted, align: 'center' });
      
      // Their player
      const theirName = `${theirPlayer?.pseudo || '?'} (${theirPlayer?.factionShort || theirPlayer?.faction?.slice(0, 4) || '?'})`;
      drawText(theirName, textStartX, duelY + 35, { size: 12, color: colors.red });
      
      // Score if available
      if (duelScore?.ourScore !== null) {
        drawText(`${duelScore.ourScore} - ${duelScore.theirScore}`, width - padding - 20, duelY + 25, { size: 14, bold: true, align: 'right' });
      }
      
      // Separator
      if (i < 5) {
        ctx.strokeStyle = colors.border;
        ctx.beginPath();
        ctx.moveTo(padding + 15, duelY + 45);
        ctx.lineTo(width - padding - 15, duelY + 45);
        ctx.stroke();
      }
    });
    
    y += duelsHeight + sectionGap;
    
    // === MATRIX ===
    const matrixHeight = 170;
    drawRoundedRect(padding, y, width - 2 * padding, matrixHeight, 8, colors.cardBg);
    drawText('MATRICE', padding + 15, y + 20, { size: 12, bold: true, color: colors.textMuted });
    
    const cellSize = 38;
    const matrixX = padding + 70;
    const matrixY = y + 35;
    
    // Header row (their players)
    opponent.players.forEach((p, i) => {
      const label = p.factionShort || p.faction?.slice(0, 3) || `J${i + 1}`;
      drawText(label, matrixX + i * cellSize + cellSize / 2, matrixY + 10, { size: 9, color: colors.red, align: 'center' });
    });
    
    // Rows (our players)
    data.myTeam.players.forEach((ourP, ourIdx) => {
      const rowY = matrixY + 20 + ourIdx * 22;
      const label = ourP.factionShort || ourP.faction?.slice(0, 4) || ourP.pseudo?.slice(0, 4) || `J${ourIdx + 1}`;
      drawText(label, padding + 20, rowY + 6, { size: 9, color: colors.blue });
      
      opponent.players.forEach((theirP, theirIdx) => {
        const cellX = matrixX + theirIdx * cellSize;
        const symbol = getMatrixValue(matrix, ourIdx, theirIdx);
        const symbolColors = { '++': colors.green, '+': '#86efac', '=': colors.textMuted, '-': '#fca5a5', '--': colors.red };
        
        // Check if this is a realized duel
        const isDuel = fixedDuels.some(d => d.us === ourIdx && d.them === theirIdx);
        
        if (isDuel) {
          drawRoundedRect(cellX + 2, rowY - 6, cellSize - 4, 18, 3, '#374151');
        }
        
        drawText(symbol, cellX + cellSize / 2, rowY + 6, { size: 11, bold: isDuel, color: symbolColors[symbol] || colors.textMuted, align: 'center' });
      });
    });
    
    // Legend
    drawText('[ ] = Duel réalisé', width - padding - 15, y + matrixHeight - 10, { size: 9, color: colors.textMuted, align: 'right' });
    
    y += matrixHeight + sectionGap;
    
    // === FOOTER ===
    const now = new Date();
    const dateStr = now.toLocaleDateString('fr-FR');
    drawText(`Généré le ${dateStr}`, width / 2, y + 10, { size: 10, color: colors.textMuted, align: 'center' });
    
    // Export
    const link = document.createElement('a');
    const fileName = `pairing_${data.myTeam.name}_vs_${opponent.name}_${dateStr.replace(/\//g, '-')}.jpg`;
    link.download = fileName;
    link.href = canvas.toDataURL('image/jpeg', 0.9);
    link.click();
  };
  
  // ============================================
  // EXPORT PAIRING SHEET PDF
  // ============================================
  const exportPairingPDF = (roundIndex) => {
    const round = roundIndex !== null ? data.rounds?.[roundIndex] : null;
    const pairingResult = round?.pairingResult;
    
    if (!pairingResult || !pairingResult.pairingDetails) {
      alert('Données de pairing incomplètes. Veuillez refaire le pairing.');
      return;
    }
    
    const opponentIndex = pairingResult.opponentIndex;
    const opponent = data.opponents[opponentIndex];
    if (!opponent) return;
    
    const details = pairingResult.pairingDetails;
    const fixedDuels = pairingResult.fixedDuels || [];
    const duelScores = round?.duelScores || [];
    const matrix = opponent?.matrix;
    
    // Fonction helper pour obtenir un joueur
    const getPlayer = (team, idx) => {
      if (idx === null || idx === undefined) return null;
      if (team === 'us') return data.myTeam.players[idx];
      return opponent.players[idx];
    };
    
    // Format joueur pour affichage
    const formatPlayer = (player) => {
      if (!player) return '?';
      const faction = player.factionShort || player.faction?.slice(0, 4) || '';
      const pseudo = player.pseudo || '';
      return faction ? `${faction} (${pseudo})` : pseudo;
    };
    
    // Générer le PDF avec canvas (format portrait A4, haute résolution)
    const scale = 3;
    const canvas = document.createElement('canvas');
    const baseWidth = 595; // A4 portrait en pixels à 72 DPI
    const baseHeight = 842;
    canvas.width = baseWidth * scale;
    canvas.height = baseHeight * scale;
    const ctx = canvas.getContext('2d');
    
    ctx.scale(scale, scale);
    
    // Fond blanc
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, baseWidth, baseHeight);
    
    // Couleurs
    const colors = {
      blue: '#2563eb',
      red: '#dc2626',
      green: '#16a34a',
      gray: '#6b7280',
      lightGray: '#f3f4f6',
      border: '#d1d5db',
      black: '#000000',
    };
    
    // Helpers
    const drawText = (text, x, y, options = {}) => {
      const { size = 10, bold = false, align = 'left', color = colors.black } = options;
      ctx.fillStyle = color;
      ctx.font = `${bold ? 'bold ' : ''}${size}px Arial, sans-serif`;
      ctx.textAlign = align;
      ctx.textBaseline = 'middle';
      ctx.fillText(text || '', x, y);
    };
    
    const drawBox = (x, y, w, h, fill = null, stroke = colors.border) => {
      if (fill) {
        ctx.fillStyle = fill;
        ctx.fillRect(x, y, w, h);
      }
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, w, h);
    };
    
    const drawLine = (x1, y1, x2, y2) => {
      ctx.strokeStyle = colors.border;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    };
    
    const margin = 30;
    let y = margin;
    
    // === TITRE ===
    drawBox(margin, y, baseWidth - 2 * margin, 60, colors.lightGray);
    drawText('FEUILLE DE PAIRING', baseWidth / 2, y + 18, { size: 16, bold: true, align: 'center' });
    drawText(`${data.myTeam.name}  vs  ${opponent.name}`, baseWidth / 2, y + 38, { size: 12, align: 'center' });
    const roundInfo = round?.name || 'Pairing';
    const scenarioInfo = [round?.scenario, round?.deployment].filter(Boolean).join(' - ');
    if (scenarioInfo) {
      drawText(`${roundInfo} - ${scenarioInfo}`, baseWidth / 2, y + 52, { size: 9, align: 'center', color: colors.gray });
    }
    y += 70;
    
    // === FONCTION POUR DESSINER UN CYCLE ===
    const drawCycle = (cycleNum, cycleData, startY) => {
      let cy = startY;
      const boxWidth = baseWidth - 2 * margin;
      const halfWidth = (boxWidth - 20) / 2;
      
      // Titre du cycle
      drawBox(margin, cy, boxWidth, 22, '#e5e7eb');
      drawText(`CYCLE ${cycleNum}`, margin + 10, cy + 11, { size: 11, bold: true });
      cy += 22;
      
      // Défenseurs
      drawText('DÉFENSEURS', margin + 10, cy + 15, { size: 9, bold: true, color: colors.gray });
      cy += 25;
      
      const ourDef = getPlayer('us', cycleData.usDefender);
      const theirDef = getPlayer('them', cycleData.themDefender);
      
      // Box Notre défenseur
      drawBox(margin + 10, cy, halfWidth, 28, '#dbeafe');
      drawText('🔵 Notre Def:', margin + 15, cy + 14, { size: 9, color: colors.blue });
      drawText(formatPlayer(ourDef), margin + 85, cy + 14, { size: 9, bold: true });
      
      // Box Leur défenseur
      drawBox(margin + halfWidth + 20, cy, halfWidth, 28, '#fee2e2');
      drawText('🔴 Leur Def:', margin + halfWidth + 25, cy + 14, { size: 9, color: colors.red });
      drawText(formatPlayer(theirDef), margin + halfWidth + 95, cy + 14, { size: 9, bold: true });
      cy += 35;
      
      // Attaquants
      drawText('ATTAQUANTS PROPOSÉS', margin + 10, cy + 8, { size: 9, bold: true, color: colors.gray });
      cy += 18;
      
      const ourAtt1 = getPlayer('us', cycleData.usAttackers?.[0]);
      const ourAtt2 = getPlayer('us', cycleData.usAttackers?.[1]);
      const theirAtt1 = getPlayer('them', cycleData.themAttackers?.[0]);
      const theirAtt2 = getPlayer('them', cycleData.themAttackers?.[1]);
      
      const ourChosen = cycleData.usChosenAttacker;
      const theirChosen = cycleData.themChosenAttacker;
      
      // Nos attaquants
      drawBox(margin + 10, cy, halfWidth, 45);
      drawText(`🔵 Att1: ${formatPlayer(ourAtt1)}`, margin + 15, cy + 12, { size: 9 });
      if (ourChosen === cycleData.usAttackers?.[0]) drawText('✓', margin + halfWidth - 10, cy + 12, { size: 10, color: colors.green, bold: true });
      drawText(`🔵 Att2: ${formatPlayer(ourAtt2)}`, margin + 15, cy + 32, { size: 9 });
      if (ourChosen === cycleData.usAttackers?.[1]) drawText('✓', margin + halfWidth - 10, cy + 32, { size: 10, color: colors.green, bold: true });
      
      // Leurs attaquants
      drawBox(margin + halfWidth + 20, cy, halfWidth, 45);
      drawText(`🔴 Att1: ${formatPlayer(theirAtt1)}`, margin + halfWidth + 25, cy + 12, { size: 9 });
      if (theirChosen === cycleData.themAttackers?.[0]) drawText('✓', margin + boxWidth - 15, cy + 12, { size: 10, color: colors.green, bold: true });
      drawText(`🔴 Att2: ${formatPlayer(theirAtt2)}`, margin + halfWidth + 25, cy + 32, { size: 9 });
      if (theirChosen === cycleData.themAttackers?.[1]) drawText('✓', margin + boxWidth - 15, cy + 32, { size: 10, color: colors.green, bold: true });
      
      cy += 50;
      drawText('(✓ = choisi par l\'adversaire)', margin + boxWidth - 120, cy, { size: 7, color: colors.gray });
      cy += 12;
      
      // Duels résultants
      drawText('DUELS RÉSULTANTS', margin + 10, cy + 8, { size: 9, bold: true, color: colors.gray });
      cy += 18;
      
      // Table header
      const colWidths = [45, 250, 50, 80];
      let cx = margin + 10;
      drawBox(cx, cy, colWidths[0], 20, colors.lightGray); drawText('Table', cx + colWidths[0]/2, cy + 10, { size: 8, bold: true, align: 'center' });
      cx += colWidths[0];
      drawBox(cx, cy, colWidths[1], 20, colors.lightGray); drawText('Duel', cx + colWidths[1]/2, cy + 10, { size: 8, bold: true, align: 'center' });
      cx += colWidths[1];
      drawBox(cx, cy, colWidths[2], 20, colors.lightGray); drawText('Match', cx + colWidths[2]/2, cy + 10, { size: 8, bold: true, align: 'center' });
      cx += colWidths[2];
      drawBox(cx, cy, colWidths[3], 20, colors.lightGray); drawText('Score', cx + colWidths[3]/2, cy + 10, { size: 8, bold: true, align: 'center' });
      cy += 20;
      
      // Duel 1: Notre défenseur vs leur attaquant choisi
      const duel1Us = cycleData.usDefender;
      const duel1Them = theirChosen;
      const duel1 = fixedDuels.find(d => d.us === duel1Us && d.them === duel1Them);
      const duel1Score = duelScores.find((s, i) => fixedDuels[i]?.us === duel1Us && fixedDuels[i]?.them === duel1Them);
      const symbol1 = getMatrixValue(matrix, duel1Us, duel1Them);
      
      cx = margin + 10;
      drawBox(cx, cy, colWidths[0], 24); drawText(duel1?.table || '', cx + colWidths[0]/2, cy + 12, { size: 9, bold: true, align: 'center' });
      cx += colWidths[0];
      drawBox(cx, cy, colWidths[1], 24); 
      drawText(`🔵 ${formatPlayer(ourDef)}  vs  🔴 ${formatPlayer(getPlayer('them', duel1Them))}`, cx + 5, cy + 12, { size: 8 });
      cx += colWidths[1];
      drawBox(cx, cy, colWidths[2], 24); drawText(symbol1, cx + colWidths[2]/2, cy + 12, { size: 10, bold: true, align: 'center' });
      cx += colWidths[2];
      drawBox(cx, cy, colWidths[3], 24);
      const score1Text = duel1Score?.ourScore !== null && duel1Score?.ourScore !== undefined ? `${duel1Score.ourScore} - ${duel1Score.theirScore}` : '__ - __';
      drawText(score1Text, cx + colWidths[3]/2, cy + 12, { size: 9, align: 'center' });
      cy += 24;
      
      // Duel 2: Notre attaquant choisi vs leur défenseur
      const duel2Us = ourChosen;
      const duel2Them = cycleData.themDefender;
      const duel2 = fixedDuels.find(d => d.us === duel2Us && d.them === duel2Them);
      const duel2Score = duelScores.find((s, i) => fixedDuels[i]?.us === duel2Us && fixedDuels[i]?.them === duel2Them);
      const symbol2 = getMatrixValue(matrix, duel2Us, duel2Them);
      
      cx = margin + 10;
      drawBox(cx, cy, colWidths[0], 24); drawText(duel2?.table || '', cx + colWidths[0]/2, cy + 12, { size: 9, bold: true, align: 'center' });
      cx += colWidths[0];
      drawBox(cx, cy, colWidths[1], 24);
      drawText(`🔵 ${formatPlayer(getPlayer('us', duel2Us))}  vs  🔴 ${formatPlayer(theirDef)}`, cx + 5, cy + 12, { size: 8 });
      cx += colWidths[1];
      drawBox(cx, cy, colWidths[2], 24); drawText(symbol2, cx + colWidths[2]/2, cy + 12, { size: 10, bold: true, align: 'center' });
      cx += colWidths[2];
      drawBox(cx, cy, colWidths[3], 24);
      const score2Text = duel2Score?.ourScore !== null && duel2Score?.ourScore !== undefined ? `${duel2Score.ourScore} - ${duel2Score.theirScore}` : '__ - __';
      drawText(score2Text, cx + colWidths[3]/2, cy + 12, { size: 9, align: 'center' });
      cy += 24;
      
      return cy + 10;
    };
    
    // === CYCLE 1 ===
    y = drawCycle(1, details.cycle1, y);
    
    // === CYCLE 2 ===
    y = drawCycle(2, details.cycle2, y);
    
    // === DUELS SPÉCIAUX ===
    const boxWidth = baseWidth - 2 * margin;
    drawBox(margin, y, boxWidth, 22, '#e5e7eb');
    drawText('DUELS SPÉCIAUX', margin + 10, y + 11, { size: 11, bold: true });
    y += 22;
    
    // Table header
    const colWidths = [45, 250, 50, 80];
    let cx = margin + 10;
    drawBox(cx, y, colWidths[0], 20, colors.lightGray); drawText('Table', cx + colWidths[0]/2, y + 10, { size: 8, bold: true, align: 'center' });
    cx += colWidths[0];
    drawBox(cx, y, colWidths[1], 20, colors.lightGray); drawText('Duel', cx + colWidths[1]/2, y + 10, { size: 8, bold: true, align: 'center' });
    cx += colWidths[1];
    drawBox(cx, y, colWidths[2], 20, colors.lightGray); drawText('Match', cx + colWidths[2]/2, y + 10, { size: 8, bold: true, align: 'center' });
    cx += colWidths[2];
    drawBox(cx, y, colWidths[3], 20, colors.lightGray); drawText('Score', cx + colWidths[3]/2, y + 10, { size: 8, bold: true, align: 'center' });
    y += 20;
    
    // Oublié
    const forgottenDuel = fixedDuels.find(d => d.type === 'forgotten');
    const forgottenScore = forgottenDuel ? duelScores[fixedDuels.indexOf(forgottenDuel)] : null;
    const forgottenSymbol = forgottenDuel ? getMatrixValue(matrix, forgottenDuel.us, forgottenDuel.them) : '=';
    
    cx = margin + 10;
    drawBox(cx, y, colWidths[0], 24); drawText(forgottenDuel?.table || '', cx + colWidths[0]/2, y + 12, { size: 9, bold: true, align: 'center' });
    cx += colWidths[0];
    drawBox(cx, y, colWidths[1], 24);
    drawText(`👻 OUBLIÉ: 🔵 ${formatPlayer(getPlayer('us', details.forgotten?.us))}  vs  🔴 ${formatPlayer(getPlayer('them', details.forgotten?.them))}`, cx + 5, y + 12, { size: 8 });
    cx += colWidths[1];
    drawBox(cx, y, colWidths[2], 24); drawText(forgottenSymbol, cx + colWidths[2]/2, y + 12, { size: 10, bold: true, align: 'center' });
    cx += colWidths[2];
    drawBox(cx, y, colWidths[3], 24);
    const forgottenScoreText = forgottenScore?.ourScore !== null && forgottenScore?.ourScore !== undefined ? `${forgottenScore.ourScore} - ${forgottenScore.theirScore}` : '__ - __';
    drawText(forgottenScoreText, cx + colWidths[3]/2, y + 12, { size: 9, align: 'center' });
    y += 24;
    
    // Refusé
    const refusedDuel = fixedDuels.find(d => d.type === 'refused');
    const refusedScore = refusedDuel ? duelScores[fixedDuels.indexOf(refusedDuel)] : null;
    const refusedSymbol = refusedDuel ? getMatrixValue(matrix, refusedDuel.us, refusedDuel.them) : '=';
    
    cx = margin + 10;
    drawBox(cx, y, colWidths[0], 24); drawText(refusedDuel?.table || '', cx + colWidths[0]/2, y + 12, { size: 9, bold: true, align: 'center' });
    cx += colWidths[0];
    drawBox(cx, y, colWidths[1], 24);
    drawText(`🚫 REFUSÉ: 🔵 ${formatPlayer(getPlayer('us', details.refused?.us))}  vs  🔴 ${formatPlayer(getPlayer('them', details.refused?.them))}`, cx + 5, y + 12, { size: 8 });
    cx += colWidths[1];
    drawBox(cx, y, colWidths[2], 24); drawText(refusedSymbol, cx + colWidths[2]/2, y + 12, { size: 10, bold: true, align: 'center' });
    cx += colWidths[2];
    drawBox(cx, y, colWidths[3], 24);
    const refusedScoreText = refusedScore?.ourScore !== null && refusedScore?.ourScore !== undefined ? `${refusedScore.ourScore} - ${refusedScore.theirScore}` : '__ - __';
    drawText(refusedScoreText, cx + colWidths[3]/2, y + 12, { size: 9, align: 'center' });
    y += 34;
    
    // === RÉCAPITULATIF ===
    drawBox(margin, y, boxWidth, 70, '#f9fafb');
    drawText('RÉCAPITULATIF', margin + 10, y + 15, { size: 11, bold: true });
    
    // Calculer le score réel si disponible
    const hasAllScores = duelScores.length === 6 && duelScores.every(s => s?.ourScore !== null && s?.ourScore !== undefined);
    let totalUs = 0, totalThem = 0;
    if (hasAllScores) {
      duelScores.forEach(s => {
        totalUs += s.ourScore || 0;
        totalThem += s.theirScore || 0;
      });
    }
    
    drawText('Score Réel:', margin + 20, y + 38, { size: 10 });
    const scoreText = hasAllScores ? `${totalUs} / 120  vs  ${totalThem} / 120` : '__ / 120  vs  __ / 120';
    drawText(scoreText, margin + 100, y + 38, { size: 12, bold: true });
    
    // Cases à cocher
    drawText('Résultat:', margin + 280, y + 38, { size: 10 });
    
    const isVictory = hasAllScores && totalUs > 65;
    const isDraw = hasAllScores && totalUs >= 55 && totalUs <= 65;
    const isDefeat = hasAllScores && totalUs < 55;
    
    // Victoire
    drawBox(margin + 340, y + 30, 14, 14);
    if (isVictory) drawText('✓', margin + 347, y + 37, { size: 10, bold: true });
    drawText('Victoire (>65)', margin + 360, y + 38, { size: 9 });
    
    // Égalité
    drawBox(margin + 430, y + 30, 14, 14);
    if (isDraw) drawText('✓', margin + 437, y + 37, { size: 10, bold: true });
    drawText('Égalité (55-65)', margin + 450, y + 38, { size: 9 });
    
    // Défaite
    drawBox(margin + 340, y + 50, 14, 14);
    if (isDefeat) drawText('✓', margin + 347, y + 57, { size: 10, bold: true });
    drawText('Défaite (<55)', margin + 360, y + 58, { size: 9 });
    
    // Export
    const imgData = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `feuille_pairing_${data.myTeam.name}_vs_${opponent.name}.png`;
    link.href = imgData;
    link.click();
  };
  
  
  // ============================================
  // MAIN RENDER
  // ============================================
  
  // Écran de chargement
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-400">Chargement des données...</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <div className="bg-gray-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold">Moteur de Pairing W40K</h1>
          {lastSaved && (
            <span className="text-xs text-green-400" title={`Dernière sauvegarde: ${lastSaved.toLocaleTimeString()}`}>
              ✓
            </span>
          )}
        </div>
        
        <div className="relative">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="px-4 py-2 bg-gray-700 rounded hover:bg-gray-600"
          >
            Menu ▼
          </button>
          
          {menuOpen && (
            <div className="absolute right-0 mt-2 w-48 bg-gray-700 rounded-lg shadow-lg z-50">
              <button
                onClick={() => { setCurrentPage('pairing'); setMenuOpen(false); }}
                disabled={!pairingState}
                className={`w-full text-left px-4 py-3 hover:bg-gray-600 rounded-t-lg flex items-center justify-between ${!pairingState ? 'opacity-50' : ''}`}
              >
                <span>📋 Pairing</span>
                {hasPairingInProgress && <span className="w-2 h-2 bg-yellow-400 rounded-full"></span>}
              </button>
              <button
                onClick={() => { setCurrentPage('scores'); setMenuOpen(false); }}
                disabled={currentRoundIndex === null}
                className={`w-full text-left px-4 py-3 hover:bg-gray-600 ${currentRoundIndex === null ? 'opacity-50' : ''}`}
              >
                📝 Scores
              </button>
              <button
                onClick={() => { setCurrentPage('matrix'); setMenuOpen(false); }}
                className="w-full text-left px-4 py-3 hover:bg-gray-600"
              >
                ✏️ Édition Matrices
              </button>
              <button
                onClick={() => { setCurrentPage('settings'); setMenuOpen(false); }}
                className="w-full text-left px-4 py-3 hover:bg-gray-600 rounded-b-lg"
              >
                ⚙️ Paramétrage
              </button>
            </div>
          )}
        </div>
      </div>
      
      {/* Page content */}
      {currentPage === 'settings' && renderSettings()}
      {currentPage === 'matrix' && renderMatrixEditor()}
      {currentPage === 'pairing' && renderPairing()}
      {currentPage === 'scores' && renderScores()}
    </div>
  );
}

// Rendu de l'application
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<PairingEngine />);
