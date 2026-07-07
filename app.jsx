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

const FORCES_DISPOSITIONS = [
  { value: 'ELIM', label: 'Elim', full: "Éliminez l'adversaire" },
  { value: 'PT',   label: 'PT',   full: 'Prendre et tenir' },
  { value: 'AP',   label: 'AP',   full: 'Atouts prioritaires' },
  { value: 'REC',  label: 'Rec',  full: 'Reconnaissance' },
  { value: 'PERT', label: 'Pert', full: 'Perturbation' },
];

const getDispositionLabel = (value) => {
  const d = FORCES_DISPOSITIONS.find(x => x.value === value);
  return d ? d.label : '';
};

const getDispositionFull = (value) => {
  const d = FORCES_DISPOSITIONS.find(x => x.value === value);
  return d ? d.full : '';
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
      forcesDisposition: '',
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
      forcesDisposition: '',
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
    version: '1.1',
    exportDate: new Date().toISOString(),
    myTeam: {
      name: data.myTeam.name,
      players: data.myTeam.players.map(p => ({
        pseudo: p.pseudo,
        faction: p.faction,
        factionShort: p.factionShort,
        detachment: p.detachment || undefined,
        forcesDisposition: p.forcesDisposition || undefined,
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
          forcesDisposition: p.forcesDisposition || undefined,
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
          forcesDisposition: p.forcesDisposition || '',
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
              forcesDisposition: p.forcesDisposition || '',
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
            forcesDisposition: '',
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
  
  // Bilan page state
  const [bilanRoundIndex, setBilanRoundIndex] = useState(null);
  
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
            <span class
