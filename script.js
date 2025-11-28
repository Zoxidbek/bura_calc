let teams = [];
let currentTeamCount = 0;
let currentEditingTeamId = null;

// O'yinni boshlash
function startGame(teamCount) {
    currentTeamCount = teamCount;
    teams = [];
    
    for (let i = 0; i < teamCount; i++) {
        teams.push({
            id: i,
            name: `${i + 1}-komanda`,
            score: 0,
            eliminated: false
        });
    }
    
    showScreen('scoreScreen');
    renderTeams();
}

// Komandalarni ekranga chiqarish
function renderTeams() {
    const container = document.getElementById('teamsContainer');
    container.innerHTML = '';
    
    teams.forEach(team => {
        const teamCard = document.createElement('div');
        teamCard.className = `team-card ${team.eliminated ? 'eliminated' : ''}`;
        
        teamCard.innerHTML = `
            <button class="score-btn minus-btn" onclick="updateScore(${team.id}, -2)" 
                    ${team.eliminated ? 'disabled' : ''}>-</button>
            
            <div class="team-info">
                <div class="team-name" onclick="showEditModal(${team.id})">${team.name}</div>
                <div class="team-score">${team.score}</div>
            </div>
            
            <button class="score-btn plus-btn" onclick="updateScore(${team.id}, 2)" 
                    ${team.eliminated ? 'disabled' : ''}>+</button>
        `;
        
        container.appendChild(teamCard);
    });
}

function updateScore(teamId, points) {
    const team = teams.find(t => t.id === teamId);
    
    if (team.eliminated) return;
    
    const newScore = team.score + points;
    if (newScore < 0) return;
    
    team.score = newScore;
    
    // 12 ga yetganda yo'q qilish
    if (team.score >= 12 && !team.eliminated) {
        team.eliminated = true;
        eliminateTeam(teamId);
    }
    
    renderTeams();
    checkWinner();
}

// Komandani yo'q qilish animatsiyasi
function eliminateTeam(teamId) {
    const teamCards = document.querySelectorAll('.team-card');
    const teamCard = teamCards[teamId];
    
    if (teamCard) {
        teamCard.classList.add('shake');
        setTimeout(() => {
            teamCard.classList.add('eliminated');
            teamCard.classList.remove('shake');
        }, 500);
    }
}

function checkWinner() {
    const activeTeams = teams.filter(team => !team.eliminated);
    
    // Faqat bitta komanda qolganda g'olib
    if (activeTeams.length === 1) {
        const winner = activeTeams[0];
        showWinner(winner);
        createConfetti();
    }
}

// Konfetti animatsiyasi
function createConfetti() {
    const colors = ['#ffd700', '#ff6b6b', '#51cf66', '#667eea', '#ffa502'];
    
    for (let i = 0; i < 100; i++) {
        const confetti = document.createElement('div');
        confetti.className = 'confetti';
        confetti.style.left = Math.random() * 100 + 'vw';
        confetti.style.background = colors[Math.floor(Math.random() * colors.length)];
        confetti.style.width = Math.random() * 10 + 5 + 'px';
        confetti.style.height = Math.random() * 10 + 5 + 'px';
        confetti.style.animationDelay = Math.random() * 2 + 's';
        
        document.body.appendChild(confetti);
        
        // Konfettini tozalash
        setTimeout(() => {
            if (confetti.parentNode) {
                confetti.parentNode.removeChild(confetti);
            }
        }, 3000);
    }
}

function showWinner(winner) {
    document.getElementById('winnerText').textContent = winner.name;
    showScreen('winnerScreen');
}

function newGame() {
    // Konfettilarni tozalash
    document.querySelectorAll('.confetti').forEach(confetti => confetti.remove());
    showScreen('teamSelection');
}

function showEditModal(teamId) {
    currentEditingTeamId = teamId;
    const team = teams.find(t => t.id === teamId);
    
    const existingModal = document.getElementById('editModal');
    if (existingModal) {
        existingModal.remove();
    }
    
    let modal = document.createElement('div');
    modal.id = 'editModal';
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content">
            <h3>Komanda nomini o'zgartirish</h3>
            <input type="text" id="teamNameInput" placeholder="Komanda nomi" value="${team.name}">
            <div class="modal-buttons">
                <button class="modal-btn cancel-btn" onclick="hideEditModal()">Bekor qilish</button>
                <button class="modal-btn save-btn" onclick="saveTeamName(${teamId})">Saqlash</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    
    document.getElementById('teamNameInput').value = team.name;
    modal.classList.add('active');
    document.getElementById('teamNameInput').focus();
}

function hideEditModal() {
    const modal = document.getElementById('editModal');
    if (modal) {
        modal.classList.remove('active');
        setTimeout(() => {
            if (modal.parentNode) {
                modal.parentNode.removeChild(modal);
            }
        }, 300);
    }
    currentEditingTeamId = null;
}

function saveTeamName(teamId) {
    const input = document.getElementById('teamNameInput');
    const newName = input.value.trim();
    
    if (newName) {
        const team = teams.find(t => t.id === teamId);
        team.name = newName;
        renderTeams();
    }
    
    hideEditModal();
}

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    
    document.getElementById(screenId).classList.add('active');
}

document.addEventListener('keypress', function(event) {
    if (event.key === 'Enter') {
        const modal = document.getElementById('editModal');
        if (modal && modal.classList.contains('active') && currentEditingTeamId !== null) {
            saveTeamName(currentEditingTeamId);
        }
    }
});

function exitToMain() {
    // Konfettilarni tozalash
    document.querySelectorAll('.confetti').forEach(confetti => confetti.remove());
    showScreen('teamSelection');
}