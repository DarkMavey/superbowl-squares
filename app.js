// =================== STATE ===================
const SQUARE_COST = 5;
const QUARTER_PCTS = { 1: 0.15, 2: 0.25, 3: 0.15, 4: 0.45 };
const QUARTER_LABELS = {
  0: 'Pre-Game', 1: 'Q1', 2: 'Q2', 3: 'Q3', 4: 'Q4', 5: 'Final'
};

const HOME_TEAM = 'Patriots';
const AWAY_TEAM = 'Seahawks';
const ADMIN_PASSWORD = 'Jags2027';

let state = defaultState();
let isAdmin = sessionStorage.getItem('sbAdmin') === 'true';

function defaultState() {
  return {
    participants: [],
    grid: null,
    colNumbers: null,
    rowNumbers: null,
    isLocked: false,
    quarterWinners: {},
    homeTeam: HOME_TEAM,
    awayTeam: AWAY_TEAM,
    manualScore: { home: 0, away: 0, quarter: 0 },
    useLive: false
  };
}

// =================== FIREBASE REAL-TIME LISTENER ===================
let hasMigrated = false;
gameRef.on('value', (snapshot) => {
  const val = snapshot.val();
  state = { ...defaultState(), ...val };
  // Ensure quarterWinners is always an object
  if (!state.quarterWinners) state.quarterWinners = {};

  // One-time migration: double squares for $10→$5 price change
  if (!hasMigrated && !state.migratedTo5 && state.participants && state.participants.length > 0) {
    hasMigrated = true;
    const migrated = state.participants.map(p => {
      if (p.name === 'Mark Davey') return { ...p, squares: 10 };
      return { ...p, squares: p.squares * 2 };
    });
    gameRef.update({ participants: migrated, migratedTo5: true });
    return; // The update will trigger another on('value') callback
  }

  renderParticipants();
  renderBoard();
  updateAdminUI();

  // If admin and live mode is on, make sure we're polling
  if (isAdmin && state.useLive) {
    startPolling();
  } else if (!isAdmin || !state.useLive) {
    stopPolling();
  }
});

// =================== ADMIN PASSWORD SYSTEM ===================
const adminModal = document.getElementById('adminModal');
const adminPasswordInput = document.getElementById('adminPasswordInput');
const adminError = document.getElementById('adminError');
let adminResolve = null;

function requireAdmin() {
  return new Promise((resolve) => {
    if (isAdmin) {
      resolve(true);
      return;
    }
    adminResolve = resolve;
    adminError.textContent = '';
    adminPasswordInput.value = '';
    adminModal.classList.add('active');
    adminPasswordInput.focus();
  });
}

document.getElementById('adminConfirmBtn').addEventListener('click', () => {
  const pw = adminPasswordInput.value;
  if (pw === ADMIN_PASSWORD) {
    isAdmin = true;
    sessionStorage.setItem('sbAdmin', 'true');
    adminModal.classList.remove('active');
    updateAdminUI();
    if (adminResolve) adminResolve(true);
    adminResolve = null;
  } else {
    adminError.textContent = 'Incorrect password.';
    adminPasswordInput.value = '';
    adminPasswordInput.focus();
  }
});

document.getElementById('adminCancelBtn').addEventListener('click', () => {
  adminModal.classList.remove('active');
  if (adminResolve) adminResolve(false);
  adminResolve = null;
});

adminPasswordInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    document.getElementById('adminConfirmBtn').click();
  }
});

// Admin login link in header
document.getElementById('adminLoginLink').addEventListener('click', async (e) => {
  e.preventDefault();
  const granted = await requireAdmin();
  if (granted) updateAdminUI();
});

function updateAdminUI() {
  document.querySelectorAll('.admin-only').forEach(el => {
    if (isAdmin) {
      el.style.display = el.tagName === 'TD' ? 'table-cell' : 'block';
    } else {
      el.style.display = 'none';
    }
  });
  // Sign-up form: hidden when locked OR when all 100 squares are taken
  const signupCard = document.getElementById('signupCard');
  if (signupCard) {
    const totalUsed = (state.participants || []).reduce((s, p) => s + p.squares, 0);
    signupCard.style.display = (state.isLocked || totalUsed >= 100) ? 'none' : '';
  }
  // Live toggle state
  const liveToggle = document.getElementById('liveToggle');
  if (liveToggle) liveToggle.checked = state.useLive;
}

// =================== VENMO POPUP ===================
const venmoModal = document.getElementById('venmoModal');

function showVenmoPopup(name, squares) {
  document.getElementById('venmoPlayerName').textContent = name;
  document.getElementById('venmoSquareCount').textContent = squares;
  document.getElementById('venmoTotal').textContent = '$' + (squares * SQUARE_COST);
  venmoModal.classList.add('active');
}

document.getElementById('venmoDismissBtn').addEventListener('click', () => {
  venmoModal.classList.remove('active');
});

// =================== TABS ===================
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(tab.dataset.tab).classList.add('active');
    if (tab.dataset.tab === 'board') renderBoard();
  });
});

// =================== SIGN UP TAB ===================

// Cost preview
const numSquaresInput = document.getElementById('numSquares');
const costDisplay = document.getElementById('costDisplay');
numSquaresInput.addEventListener('input', () => {
  const n = parseInt(numSquaresInput.value) || 0;
  costDisplay.textContent = '$' + (n * SQUARE_COST);
});

// Add participant
document.getElementById('addForm').addEventListener('submit', (e) => {
  e.preventDefault();
  if (state.isLocked) return alert('Board is locked!');

  const name = document.getElementById('playerName').value.trim();
  const num = parseInt(numSquaresInput.value) || 0;

  if (!name) return alert('Please enter a name.');
  if (num < 1) return alert('Must have at least 1 square.');

  const totalUsed = (state.participants || []).reduce((s, p) => s + p.squares, 0);
  if (totalUsed + num > 100) {
    return alert(`Only ${100 - totalUsed} squares remaining!`);
  }

  const updated = [...(state.participants || []), { name, squares: num }];
  gameRef.child('participants').set(updated);

  // Show Venmo popup
  showVenmoPopup(name, num);

  document.getElementById('playerName').value = '';
  numSquaresInput.value = 1;
  costDisplay.textContent = '$5';
  document.getElementById('playerName').focus();
});

function removeParticipant(index) {
  if (state.isLocked) return;
  const updated = [...(state.participants || [])];
  updated.splice(index, 1);
  gameRef.child('participants').set(updated.length > 0 ? updated : null);
}
// Expose globally for inline onclick
window.removeParticipant = removeParticipant;

function renderParticipants() {
  const tbody = document.getElementById('participantBody');
  const noMsg = document.getElementById('noParticipants');
  const table = document.getElementById('participantTable');
  const participants = state.participants || [];

  if (participants.length === 0) {
    table.style.display = 'none';
    noMsg.style.display = 'block';
  } else {
    table.style.display = 'table';
    noMsg.style.display = 'none';
  }

  tbody.innerHTML = participants.map((p, i) => `
    <tr>
      <td>${escapeHtml(p.name)}</td>
      <td>${p.squares}</td>
      <td>$${p.squares * SQUARE_COST}</td>
      <td class="admin-only" ${isAdmin ? '' : 'style="display:none"'}>${state.isLocked ? '' : `<button class="remove-btn" onclick="removeParticipant(${i})">&times;</button>`}</td>
    </tr>
  `).join('');

  const totalSquares = participants.reduce((s, p) => s + p.squares, 0);
  const totalPot = totalSquares * SQUARE_COST;
  const remaining = 100 - totalSquares;

  // Cap the numSquares input to remaining availability
  const numInput = document.getElementById('numSquares');
  if (remaining > 0) {
    numInput.max = remaining;
    if (parseInt(numInput.value) > remaining) numInput.value = remaining;
  }

  document.getElementById('squaresSummary').textContent = `${totalSquares} / 100 squares sold`;
  document.getElementById('potSummary').textContent = `Total Pot: $${totalPot}`;

  document.getElementById('potQ1').textContent = '$' + Math.round(totalPot * 0.15);
  document.getElementById('potQ2').textContent = '$' + Math.round(totalPot * 0.25);
  document.getElementById('potQ3').textContent = '$' + Math.round(totalPot * 0.15);
  document.getElementById('potQ4').textContent = '$' + Math.round(totalPot * 0.45);

  const lockBtn = document.getElementById('lockBoard');
  const resetBtn = document.getElementById('resetBoard');

  if (state.isLocked) {
    lockBtn.style.display = 'none';
    resetBtn.style.display = 'inline-block';
  } else {
    lockBtn.style.display = 'inline-block';
    resetBtn.style.display = 'none';
    lockBtn.disabled = totalSquares === 0 || totalSquares > 100;
  }
}

// Lock board (admin only)
document.getElementById('lockBoard').addEventListener('click', async () => {
  const granted = await requireAdmin();
  if (!granted) return;

  const participants = state.participants || [];
  const totalSquares = participants.reduce((s, p) => s + p.squares, 0);
  if (totalSquares > 100) return alert('Too many squares!');

  if (!confirm(`Lock the board with ${totalSquares} squares? Empty squares will be labeled "OPEN".`)) return;

  const pool = [];
  participants.forEach(p => {
    for (let i = 0; i < p.squares; i++) pool.push(p.name);
  });
  while (pool.length < 100) pool.push('OPEN');

  const shuffledPool = shuffle(pool);

  const grid = [];
  for (let r = 0; r < 10; r++) {
    grid[r] = [];
    for (let c = 0; c < 10; c++) {
      grid[r][c] = shuffledPool[r * 10 + c];
    }
  }

  const colNumbers = shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const rowNumbers = shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);

  gameRef.update({
    grid: grid,
    colNumbers: colNumbers,
    rowNumbers: rowNumbers,
    isLocked: true
  });

  alert('Board is locked! Switch to the Game Board tab to see the grid.');
});

// Reset board (admin only)
document.getElementById('resetBoard').addEventListener('click', async () => {
  const granted = await requireAdmin();
  if (!granted) return;

  if (!confirm('Are you sure you want to reset the entire board? This cannot be undone.')) return;
  gameRef.set(defaultState());
});

// =================== BOARD TAB ===================

function getScore() {
  const ms = state.manualScore || { home: 0, away: 0, quarter: 0 };
  return {
    home: ms.home || 0,
    away: ms.away || 0,
    quarter: ms.quarter || 0
  };
}

function renderBoard() {
  const notReady = document.getElementById('boardNotReady');
  const gridWrapper = document.getElementById('gridWrapper');
  const winnersCard = document.getElementById('winnersCard');

  if (!state.isLocked || !state.grid) {
    notReady.style.display = 'block';
    gridWrapper.style.display = 'none';
    winnersCard.style.display = 'none';
    return;
  }

  notReady.style.display = 'none';
  gridWrapper.style.display = 'block';

  const score = getScore();

  // Update scoreboard display
  document.getElementById('homeScore').textContent = score.home;
  document.getElementById('awayScore').textContent = score.away;
  document.getElementById('quarterLabel').textContent = QUARTER_LABELS[score.quarter] || 'Pre-Game';
  document.getElementById('manualHomeScore').textContent = score.home;
  document.getElementById('manualAwayScore').textContent = score.away;
  document.getElementById('manualQuarter').value = score.quarter;

  // Determine active column and row from score last digits
  const homeLastDigit = score.home % 10;
  const awayLastDigit = score.away % 10;

  const activeCol = state.colNumbers.indexOf(homeLastDigit);
  const activeRow = state.rowNumbers.indexOf(awayLastDigit);

  // Build grid
  const gridArea = document.getElementById('gridArea');
  gridArea.innerHTML = '';

  // Corner cell
  const corner = document.createElement('div');
  corner.className = 'grid-cell corner';
  gridArea.appendChild(corner);

  // Column headers (Patriots numbers)
  for (let c = 0; c < 10; c++) {
    const cell = document.createElement('div');
    cell.className = 'grid-cell header header-col';
    if (c === activeCol) cell.classList.add('highlight-header-col');
    cell.textContent = state.colNumbers[c];
    gridArea.appendChild(cell);
  }

  // Rows
  for (let r = 0; r < 10; r++) {
    // Row header (Seahawks number)
    const rowHeader = document.createElement('div');
    rowHeader.className = 'grid-cell header header-row';
    if (r === activeRow) rowHeader.classList.add('highlight-header-row');
    rowHeader.textContent = state.rowNumbers[r];
    gridArea.appendChild(rowHeader);

    // Data cells
    for (let c = 0; c < 10; c++) {
      const cell = document.createElement('div');
      cell.className = 'grid-cell';

      const isActiveCol = c === activeCol;
      const isActiveRow = r === activeRow;

      if (isActiveCol && isActiveRow) {
        cell.classList.add('highlight-active');
      } else if (isActiveCol) {
        cell.classList.add('highlight-col');
      } else if (isActiveRow) {
        cell.classList.add('highlight-row');
      }

      // Check if this cell won any quarter
      const wonQuarters = [];
      for (const [q, w] of Object.entries(state.quarterWinners || {})) {
        if (w && w.row === r && w.col === c) {
          wonQuarters.push(q);
          cell.classList.add('won');
        }
      }

      const nameSpan = document.createElement('span');
      nameSpan.className = 'cell-name';
      nameSpan.textContent = state.grid[r][c];
      cell.appendChild(nameSpan);

      if (wonQuarters.length > 0) {
        const trophy = document.createElement('span');
        trophy.className = 'cell-trophy';
        trophy.textContent = wonQuarters.map(q => '\u{1F3C6}' + q).join(' ');
        cell.appendChild(trophy);
      }

      gridArea.appendChild(cell);
    }
  }

  renderWinners();
}

function renderWinners() {
  const winnersCard = document.getElementById('winnersCard');
  const winnersList = document.getElementById('winnersList');
  const entries = Object.entries(state.quarterWinners || {}).filter(([, w]) => w);

  if (entries.length === 0) {
    winnersCard.style.display = 'none';
    return;
  }

  winnersCard.style.display = 'block';
  const totalPot = (state.participants || []).reduce((s, p) => s + p.squares, 0) * SQUARE_COST;

  winnersList.innerHTML = entries.map(([q, w]) => {
    const pct = QUARTER_PCTS[q];
    const amount = Math.round(totalPot * pct);
    return `
      <div class="winner-item">
        <span class="winner-quarter">\u{1F3C6} Q${q}</span>
        <span class="winner-name">${escapeHtml(w.name)}</span>
        <span class="winner-amount">$${amount}</span>
        <span style="color: #64748B; font-size:0.8rem;">(${escapeHtml(w.score)})</span>
      </div>
    `;
  }).join('');
}

// Manual score controls (admin only)
document.querySelectorAll('[data-team]').forEach(btn => {
  btn.addEventListener('click', async () => {
    const granted = await requireAdmin();
    if (!granted) return;

    const team = btn.dataset.team;
    const delta = parseInt(btn.dataset.delta);
    const current = (state.manualScore && state.manualScore[team]) || 0;
    const updated = Math.max(0, current + delta);
    gameRef.child('manualScore/' + team).set(updated);
  });
});

document.getElementById('manualQuarter').addEventListener('change', async (e) => {
  const granted = await requireAdmin();
  if (!granted) {
    // Reset the select to current state
    e.target.value = (state.manualScore && state.manualScore.quarter) || 0;
    return;
  }
  gameRef.child('manualScore/quarter').set(parseInt(e.target.value));
});

// Award quarter (admin only)
document.getElementById('awardQuarterBtn').addEventListener('click', async () => {
  const granted = await requireAdmin();
  if (!granted) return;

  const q = (state.manualScore && state.manualScore.quarter) || 0;
  if (q < 1 || q > 4) return alert('Select a valid quarter (Q1-Q4) to award.');
  if (state.quarterWinners && state.quarterWinners[q]) return alert(`Q${q} has already been awarded!`);
  if (!state.isLocked) return alert('Board must be locked first.');

  const score = getScore();
  const homeLastDigit = score.home % 10;
  const awayLastDigit = score.away % 10;
  const activeCol = state.colNumbers.indexOf(homeLastDigit);
  const activeRow = state.rowNumbers.indexOf(awayLastDigit);
  const winnerName = state.grid[activeRow][activeCol];

  const totalPot = (state.participants || []).reduce((s, p) => s + p.squares, 0) * SQUARE_COST;
  const amount = Math.round(totalPot * QUARTER_PCTS[q]);

  if (!confirm(`Award Q${q} to "${winnerName}" for $${amount}?\nScore: ${AWAY_TEAM} ${score.away} - ${HOME_TEAM} ${score.home}`)) return;

  gameRef.child('quarterWinners/' + q).set({
    name: winnerName,
    row: activeRow,
    col: activeCol,
    score: `${AWAY_TEAM} ${score.away} - ${HOME_TEAM} ${score.home}`
  });
});

// Live score toggle (admin only)
const liveToggle = document.getElementById('liveToggle');
liveToggle.addEventListener('change', async () => {
  const granted = await requireAdmin();
  if (!granted) {
    liveToggle.checked = state.useLive || false;
    return;
  }
  gameRef.child('useLive').set(liveToggle.checked);
});

// =================== ESPN API POLLING (admin only) ===================
let pollInterval = null;

function startPolling() {
  if (!isAdmin) return;
  stopPolling();
  pollInterval = setInterval(fetchLiveScore, 30000);
}

function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

async function fetchLiveScore() {
  if (!isAdmin || !state.useLive) return;
  try {
    const resp = await fetch('https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard');
    const data = await resp.json();

    if (!data.events || data.events.length === 0) return;

    // Try to find the Seahawks vs Patriots game, or any in-progress game
    let game = data.events.find(e => {
      const comp = e.competitions[0];
      const teams = comp.competitors.map(c => c.team.abbreviation);
      return teams.includes('SEA') && teams.includes('NE');
    });

    // Fallback: any in-progress game
    if (!game) {
      game = data.events.find(e => {
        const status = e.competitions[0].status;
        return status.type.state === 'in';
      });
    }

    if (!game) game = data.events[data.events.length - 1];

    const comp = game.competitions[0];
    const homeTeamData = comp.competitors.find(c => c.homeAway === 'home');
    const awayTeamData = comp.competitors.find(c => c.homeAway === 'away');

    const homeTotal = parseInt(homeTeamData.score) || 0;
    const awayTotal = parseInt(awayTeamData.score) || 0;

    const period = comp.status.period || 0;
    const statusState = comp.status.type.state;
    let quarter;
    if (statusState === 'post') {
      quarter = 5;
    } else if (statusState === 'pre') {
      quarter = 0;
    } else {
      quarter = Math.min(period, 4);
    }

    // Update score in Firebase
    gameRef.child('manualScore').update({
      home: homeTotal,
      away: awayTotal,
      quarter: quarter
    });

    // Auto-award quarters using linescores
    if (state.isLocked && state.grid) {
      autoAwardQuarters(homeTeamData, awayTeamData, statusState);
    }
  } catch (err) {
    console.warn('Failed to fetch live score:', err);
  }
}

function autoAwardQuarters(homeTeamData, awayTeamData, statusState) {
  const homeLinescores = (homeTeamData.linescores || []).map(ls => ls.value || 0);
  const awayLinescores = (awayTeamData.linescores || []).map(ls => ls.value || 0);

  // Determine how many quarters are completed
  // A quarter is "completed" if we have linescore data for it AND the game has moved past it
  const completedQuarters = Math.min(homeLinescores.length, awayLinescores.length);

  for (let q = 1; q <= 4; q++) {
    // Skip if already awarded
    if (state.quarterWinners && state.quarterWinners[q]) continue;

    let homeScore, awayScore;

    if (q <= completedQuarters) {
      // Use cumulative linescores
      if (q < 4) {
        // Q1-Q3: sum linescores up to this quarter
        homeScore = homeLinescores.slice(0, q).reduce((a, b) => a + b, 0);
        awayScore = awayLinescores.slice(0, q).reduce((a, b) => a + b, 0);
        // Only award if the game has progressed past this quarter
        if (completedQuarters <= q && statusState !== 'post') continue;
      } else {
        // Q4/Final: use total score, only award at game end
        if (statusState !== 'post') continue;
        homeScore = parseInt(homeTeamData.score) || 0;
        awayScore = parseInt(awayTeamData.score) || 0;
      }
    } else {
      continue;
    }

    // Find the winner cell
    const homeLastDigit = homeScore % 10;
    const awayLastDigit = awayScore % 10;
    const activeCol = state.colNumbers.indexOf(homeLastDigit);
    const activeRow = state.rowNumbers.indexOf(awayLastDigit);
    const winnerName = state.grid[activeRow][activeCol];

    gameRef.child('quarterWinners/' + q).set({
      name: winnerName,
      row: activeRow,
      col: activeCol,
      score: `${AWAY_TEAM} ${awayScore} - ${HOME_TEAM} ${homeScore}`
    });
  }
}

// =================== UTILS ===================

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// =================== INIT ===================
updateAdminUI();
