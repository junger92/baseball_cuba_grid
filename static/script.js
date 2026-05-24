// Estado del juego
let currentGrid = null;      // { rows: [], cols: [], achievement: string }
let cells = Array(9).fill(null);
let score = 0;
let selectedRow = null, selectedCol = null;
let gameActive = true;   // Indica si el juego está activo (no rendido)
let isDevelopment = false;
let usedPlayers = [];    // Almacena los nombres de los jugadores ya usados
let cellsEmojis = Array(9).fill('');

// Elementos DOM
const gridContainer = document.getElementById('gridContainer');
const scoreSpan = document.getElementById('scoreValue');
const resetBtn = document.getElementById('resetButton');
const playerInput = document.getElementById('playerInput');
const suggestionsList = document.getElementById('suggestionsList');
const messageDiv = document.getElementById('message');
const controlPanel = document.getElementById('controlPanel');
const selectionInfo = document.getElementById('selectionInfo');

// Modal
const modal = document.getElementById('welcomeModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const dontShowAgainCheckbox = document.getElementById('dontShowAgain');
const closeSpan = document.querySelector('.close-modal');

const surrenderButton = document.getElementById('surrenderButton');
const solutionsModal = document.getElementById('solutionsModal');
const closeSolutionsBtn = document.getElementById('closeSolutionsBtn');
const closeSolutionsSpan = document.querySelector('.close-solutions-modal');
const solutionsListDiv = document.getElementById('solutionsList');

// Transfermóvil modal
const transferBtn = document.getElementById('transferBtn');
const transferModal = document.getElementById('transferModal');
const closeTransfer = document.querySelector('.close-transfer');

// Eliminar celda al hacer clic en el ícono de basura
gridContainer.addEventListener('click', (e) => {
    const trashIcon = e.target.closest('.trash-icon');
    if (!trashIcon) return;

    e.stopPropagation(); // Evita que el clic se propague a la celda (y la seleccione)

    const row = parseInt(trashIcon.dataset.row);
    const col = parseInt(trashIcon.dataset.col);
    if (!isNaN(row) && !isNaN(col)) {
        removeCell(row, col);
    }
});

if (transferBtn) {
    transferBtn.addEventListener('click', () => {
        transferModal.style.display = 'flex';
    });
}

function closeTransferModal() {
    transferModal.style.display = 'none';
}

if (closeTransfer) closeTransfer.addEventListener('click', closeTransferModal);
window.addEventListener('click', (event) => {
    if (event.target === transferModal) closeTransferModal();
});

if (resetBtn) {
    resetBtn.addEventListener('click', () => {
        clearGameState();
        loadGrid();   // Esto generará un nuevo grid aleatorio (porque isDevelopment true)
        hideControlPanel();
        gameActive = true;
        playerInput.disabled = false;
        const surrenderBtn = document.getElementById('surrenderButton');
        if (surrenderBtn) {
            surrenderBtn.textContent = '🏳️ Rendirse';
            surrenderBtn.disabled = false;
        }
    });
}

// Al cargar la página
fetch('/api/config')
    .then(res => res.json())
    .then(config => {
        isDevelopment = config.isDevelopment;
        if (!isDevelopment) {
            const resetBtn = document.getElementById('resetButton');
            if (resetBtn) resetBtn.style.display = 'none';
        }
        loadGrid();
    })
    .catch(err => {
        console.error('Error al cargar configuración:', err);
        loadGrid(); // fallback a modo normal
    });

async function showSolutions() {
    if (!currentGrid) return;

    if (!gameActive) {
        showMessage('Ya te has rendido. Inicia un nuevo juego.', 'error');
        return;
    }

    // Desactivar el juego
    gameActive = false;
    saveGameState();   // <-- Guardar que nos rendimos

    // Deshabilitar el botón de rendirse
    const surrenderBtn = document.getElementById('surrenderButton');
    if (surrenderBtn) {
        surrenderBtn.textContent = '🏳️ Rendido';
        surrenderBtn.disabled = true;
    }

    // Deshabilitar el campo de entrada (opcional)
    playerInput.disabled = true;

    // Construir objeto con celdas ya llenas (para no sugerir repetidos)
    const filled = {};
    for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
            const idx = i * 3 + j;
            if (cells[idx]) {
                filled[`${i}_${j}`] = cells[idx];
            }
        }
    }

    const payload = {
        rows: currentGrid.rows,
        cols: currentGrid.cols,
        achievement: currentGrid.achievement,
        filledCells: filled
    };

    try {
        const response = await fetch('/api/solutions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const solutions = await response.json();

        // Construir HTML
        solutionsListDiv.innerHTML = '';
        for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 3; j++) {
                const cellKey = `${i}_${j}`;
                if (filled[cellKey]) continue; // no mostrar celdas ya resueltas
                const players = solutions[cellKey] || [];
                const rowTeam = currentGrid.rows[i];
                let colDesc = '';
                if (j < 2) {
                    colDesc = `Equipo: ${currentGrid.cols[j]}`;
                } else {
                    colDesc = `Logro: ${currentGrid.achievement}`;
                }
                const div = document.createElement('div');
                div.className = 'solution-item';
                div.innerHTML = `
                    <strong>Fila ${i+1} (${rowTeam}) - ${colDesc}</strong><br>
                    <div class="solution-players">
                        ${players.length > 0 ? players.join(', ') : 'No se encontraron jugadores'}
                    </div>
                `;
                solutionsListDiv.appendChild(div);
            }
        }
        solutionsModal.style.display = 'flex';
    } catch (err) {
        console.error(err);
        showMessage('Error al obtener soluciones. Intenta de nuevo.', 'error');
        // Si hay error, reactivar el juego
        gameActive = true;
        if (surrenderBtn) {
            surrenderBtn.textContent = '🏳️ Rendirse';
            surrenderBtn.disabled = false;
        }
        playerInput.disabled = false;
    }
}

if (surrenderButton) {
    surrenderButton.addEventListener('click', () => {
        if (confirm('⚠️ ¿Estás seguro de que quieres rendirte? Después de esto no podrás seguir completando el grid de hoy. Solo podrás ver las soluciones.')) {
            showSolutions();
        }
    });
}

function closeSolutionsModal() {
    solutionsModal.style.display = 'none';
}

if (closeSolutionsBtn) closeSolutionsBtn.addEventListener('click', closeSolutionsModal);
if (closeSolutionsSpan) closeSolutionsSpan.addEventListener('click', closeSolutionsModal);
window.addEventListener('click', (event) => {
    if (event.target === solutionsModal) {
        closeSolutionsModal();
    }
});

async function loadGrid() {
    const url = isDevelopment ? '/api/grid' : '/api/daily-grid';
    try {
        const response = await fetch(url);
        const data = await response.json();
        const newGrid = {
            rows: data.rows,
            cols: data.cols,
            achievement: data.achievement
        };
        
        // Verificar si hay un estado guardado para hoy y que coincida con el grid recibido
        const savedState = loadGameState();
        if (savedState && 
            JSON.stringify(savedState.grid) === JSON.stringify(newGrid)) {
            // Restaurar estado
            currentGrid = savedState.grid;
            cells = savedState.cells;
            cellsEmojis = savedState.cellsEmojis;
            usedPlayers = cells.filter(cell => cell !== null);  // Reconstruir
            
            score = savedState.score;
            gameActive = !savedState.surrendered;
            updateScore();
            renderGrid();
            if (savedState.surrendered) {
                // Deshabilitar controles
                playerInput.disabled = true;
                const surrenderBtn = document.getElementById('surrenderButton');
                if (surrenderBtn) {
                    surrenderBtn.textContent = '🏳️ Rendido';
                    surrenderBtn.disabled = true;
                }
                showMessage('⚠️ Ya te rendiste en este grid. Inicia un nuevo juego (solo en desarrollo).', 'error');
            } else {
                // Reactivar controles normalmente
                playerInput.disabled = false;
                const surrenderBtn = document.getElementById('surrenderButton');
                if (surrenderBtn) {
                    surrenderBtn.textContent = '🏳️ Rendirse';
                    surrenderBtn.disabled = false;
                }
            }
        } else {
            // No hay estado guardado, empezar nuevo juego
            currentGrid = newGrid;
            cells = Array(9).fill(null);
            cellsEmojis = Array(9).fill('');
            usedPlayers = [];
            score = 0;
            gameActive = true;
            updateScore();
            renderGrid();
            playerInput.disabled = false;
            const surrenderBtn = document.getElementById('surrenderButton');
            if (surrenderBtn) {
                surrenderBtn.textContent = '🏳️ Rendirse';
                surrenderBtn.disabled = false;
            }
            clearGameState(); // Por si había un estado de otro grid
        }
        hideControlPanel();
        clearMessages();
        playerInput.value = '';
        selectedRow = null;
        selectedCol = null;
    } catch (error) {
        console.error(error);
        showMessage('Error al iniciar el juego. Recarga la página.', 'error');
    }
}

// Cargar nuevo grid desde el backend
async function loadNewGrid() {
    try {
        const response = await fetch('/api/grid');
        if (!response.ok) throw new Error('Error al cargar el grid');
        const data = await response.json();
        currentGrid = {
            rows: data.rows,
            cols: data.cols,
            achievement: data.achievement
        };
        cells = Array(9).fill(null);
        cellsEmojis = Array(9).fill('');
        usedPlayers = [];
        score = 0;
        updateScore();
        renderGrid();
        hideControlPanel();
        clearMessages();
        playerInput.value = '';
        selectedRow = null;
        selectedCol = null;
        // Reactivar juego
        gameActive = true;
        playerInput.disabled = false;
        const surrenderBtn = document.getElementById('surrenderButton');
        if (surrenderBtn) {
            surrenderBtn.textContent = '🏳️ Rendirse';
            surrenderBtn.disabled = false;
        }
    } catch (error) {
        console.error(error);
        showMessage('Error al iniciar el juego. Recarga la página.', 'error');
    }

    
}

function removeCell(row, col) {
    const idx = row * 3 + col;

    // Verificar si el juego sigue activo (no rendido)
    if (!gameActive) {
        showMessage('⚠️ No puedes modificar celdas después de rendirte. Inicia un nuevo juego.', 'error');
        return;
    }

    // Verificar que la celda tenga contenido
    if (cells[idx] === null) {
        showMessage('Esta celda ya está vacía.', 'info');
        return;
    }

    const playerName = cells[idx];

    // Eliminar de la lista de jugadores usados
    const playerIndex = usedPlayers.indexOf(playerName);
    if (playerIndex !== -1) usedPlayers.splice(playerIndex, 1);

    // Vaciar la celda y su emoji (si existe)
    cells[idx] = null;
    if (typeof cellsEmojis !== 'undefined') cellsEmojis[idx] = '';

    // Restar un punto
    score--;
    updateScore();

    // Re-renderizar el grid
    renderGrid();

    // Guardar estado (para que persista tras recarga)
    saveGameState();

    showMessage(`🧹 Celda eliminada. Has perdido un punto.`, 'info');
}

// Renderiza la cuadrícula 3x3 con encabezados
function renderGrid() {
    if (!currentGrid) return;
    gridContainer.innerHTML = '';

    // Primera fila: esquina + columnas (2 equipos + logro)
    gridContainer.appendChild(createHeaderCell(''));
    gridContainer.appendChild(createHeaderCell(currentGrid.cols[0]));
    gridContainer.appendChild(createHeaderCell(currentGrid.cols[1]));
    gridContainer.appendChild(createAchievementHeaderCell(currentGrid.achievement));

    // Filas de datos
    for (let i = 0; i < 3; i++) {
        // Encabezado de fila
        gridContainer.appendChild(createHeaderCell(currentGrid.rows[i]));
        // Celdas de la fila
        for (let j = 0; j < 3; j++) {
            const idx = i * 3 + j;
            const filledName = cells[idx];
            const cell = createDataCell(i, j);
            if (filledName) {
                cell.classList.add('filled');
                // Buscar emojis asociados al jugador (podemos guardarlos en cellsEmojis array)
                const emojis = cellsEmojis[idx] || '';
                cell.innerHTML = `<div class="player-name">${filledName} ${emojis}</div><div class="check-mark">✓</div><div class="cell-actions">
            <i class="fas fa-trash-alt trash-icon" data-row="${i}" data-col="${j}"></i>
        </div>`;
            } else {
                cell.innerHTML = `<div class="player-name">???</div>`;
            }
            gridContainer.appendChild(cell);
        }
    }
}

// Convierte nombre del equipo a ruta de imagen (minúsculas, espacios reemplazados por _)
function getTeamLogoUrl(teamName) {
    // Normalizar: minúsculas, reemplazar espacios por _, eliminar acentos
    let slug = teamName.toLowerCase().replace(/ /g, '_');
    slug = slug.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return `/team_logos/${slug}.png`;
}

// Crea celda de cabecera (fila o columna) con logo + nombre
function createHeaderCell(text) {
    const div = document.createElement('div');
    div.className = 'cell header';
    if (text) {
        const logoUrl = getTeamLogoUrl(text);
        const img = document.createElement('img');
        img.src = logoUrl;
        img.alt = text;
        img.classList.add('team-logo');
        // Si la imagen no existe, ocultarla y mostrar solo texto
        img.onerror = () => {
            img.style.display = 'none';
        };
        div.appendChild(img);
        const span = document.createElement('span');
        span.textContent = text;
        span.classList.add('team-name');
        div.appendChild(span);
    }
    return div;
}

function createAchievementHeaderCell(text) {
    const div = document.createElement('div');
    div.className = 'cell header achievement-header';
    div.textContent = text;
    return div;
}

function createDataCell(row, col) {
    const div = document.createElement('div');
    div.className = 'cell';
    div.addEventListener('click', () => onCellClick(row, col));
    return div;
}

function onCellClick(row, col) {
    if (!gameActive) {
        showMessage('⚠️ Ya te has rendido. Inicia un nuevo juego para seguir jugando.', 'error');
        return;
    }
    const idx = row * 3 + col;
    if (cells[idx] !== null) {
        showMessage(`Ya has completado esta celda con ${cells[idx]}`, 'error');
        return;
    }

    selectedRow = row;
    selectedCol = col;
    const isAchievementCol = (col === 2);
    const rowTeam = currentGrid.rows[row];
    let conditionText = '';
    if (isAchievementCol) {
        conditionText = `el logro <strong>${currentGrid.achievement}</strong>`;
    } else {
        conditionText = `el equipo <strong>${currentGrid.cols[col]}</strong>`;
    }
    selectionInfo.innerHTML = `Selecciona un jugador que haya jugado en <strong>${rowTeam}</strong> y además cumpla con ${conditionText}`;
    controlPanel.style.display = 'block';
    playerInput.value = '';
    playerInput.focus();
    suggestionsList.innerHTML = '';
}

function hideControlPanel() {
    controlPanel.style.display = 'none';
    selectedRow = null;
    selectedCol = null;
}

function clearMessages() {
    messageDiv.innerHTML = '';
    messageDiv.className = 'message';
}

function showMessage(msg, type = 'info') {
    messageDiv.textContent = msg;
    messageDiv.className = `message ${type}`;
    setTimeout(() => {
        if (messageDiv.textContent === msg) {
            messageDiv.className = 'message';
        }
    }, 3000);
}

// Autocompletado
let debounceTimeout;
playerInput.addEventListener('input', async () => {
    const query = playerInput.value.trim();
    if (query.length < 2) {
        suggestionsList.innerHTML = '';
        return;
    }
    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(async () => {
        try {
            const res = await fetch(`/api/suggest?q=${encodeURIComponent(query)}`);
            const names = await res.json();
            suggestionsList.innerHTML = names.map(item => `<li data-name="${item.name}" data-emojis="${item.emojis}">${item.name} ${item.emojis}</li>`).join('');
            document.querySelectorAll('#suggestionsList li').forEach(li => {
                li.addEventListener('click', () => {
                    playerInput.value = li.dataset.name;
                    suggestionsList.innerHTML = '';
                    if (selectedRow !== null && selectedCol !== null) {
                        checkAndFill(playerInput.value);
                    }
                });
            });
        } catch (err) {
            console.error(err);
        }
    }, 200);
});

// Cerrar sugerencias al hacer clic fuera
document.addEventListener('click', (e) => {
    if (!playerInput.contains(e.target) && !suggestionsList.contains(e.target)) {
        suggestionsList.innerHTML = '';
    }
});

async function checkAndFill(playerName) {
    if (selectedRow === null || selectedCol === null) return;

    // Validar que el jugador no haya sido usado antes
    if (usedPlayers.includes(playerName)) {
        showMessage(`❌ El jugador ${playerName} ya ha sido utilizado en este grid. Elige otro.`, 'error');
        playerInput.value = '';
        playerInput.focus();
        return;
    }

    const rowTeam = currentGrid.rows[selectedRow];
    const colTeam = selectedCol === 2 ? null : currentGrid.cols[selectedCol];
    const achievement = selectedCol === 2 ? currentGrid.achievement : null;
    const isAchievementCol = (selectedCol === 2);

    const idx = selectedRow * 3 + selectedCol;

    try {
        const response = await fetch('/api/check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                player: playerName,
                rowTeam: rowTeam,
                colTeam: colTeam,
                achievement: achievement,
                isAchievementCol: isAchievementCol,
                usedPlayers: usedPlayers   // <-- enviar lista
            })
        });
        const result = await response.json();

        if (result.valid) {
            cells[idx] = result.name;
            cellsEmojis[idx] = result.emojis || '';
            usedPlayers.push(result.name);   // <-- Agregar
            score++;
            updateScore();
            renderGrid();
            saveGameState();   // <-- Guardar progreso
            showMessage(`✅ Correcto: ${result.name} cumple la condición`, 'success');
            hideControlPanel();
            if (score === 9) {
                showMessage('🎉 ¡INMACULADO! Completaste toda la cuadrícula. 🎉', 'success');
            }
        } else {
            showMessage(`❌ ${result.error || 'Jugador no válido para esta celda'}`, 'error');
            playerInput.value = '';
            playerInput.focus();
        }
    } catch (err) {
        console.error(err);
        showMessage('Error de conexión con el servidor', 'error');
    }
}

function updateScore() {
    scoreSpan.textContent = score;
}

resetBtn.addEventListener('click', () => {
    usedPlayers = [];
    loadNewGrid();
    hideControlPanel();
    // Restaurar estado activo
    gameActive = true;
    playerInput.disabled = false;
    const surrenderBtn = document.getElementById('surrenderButton');
    if (surrenderBtn) {
        surrenderBtn.textContent = '🏳️ Rendirse';
        surrenderBtn.disabled = false;
    }
});

// Modal de bienvenida
function showModal() {
    const alreadyShown = sessionStorage.getItem('immaculateModalShown');
    if (!alreadyShown) {
        modal.style.display = 'flex';
    }
}

function closeModal() {
    modal.style.display = 'none';
    if (dontShowAgainCheckbox && dontShowAgainCheckbox.checked) {
        sessionStorage.setItem('immaculateModalShown', 'true');
    }
}

if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);
if (closeSpan) closeSpan.addEventListener('click', closeModal);
window.addEventListener('click', (event) => {
    if (event.target === modal) {
        closeModal();
    }
});

// Compartir imagen del grid
const shareButton = document.getElementById('shareButton');

async function shareGrid() {
    const gridElement = document.getElementById('gridContainer');
    if (!gridElement) return;

    // Mostrar un mensaje de "generando..."
    const originalBtnText = shareButton.innerHTML;
    shareButton.innerHTML = '⏳ Generando...';
    shareButton.disabled = true;

    try {
        // Capturar el grid con html2canvas
        const canvas = await html2canvas(gridElement, {
            scale: 2,               // Mayor resolución
            backgroundColor: '#ffffff',
            logging: false,
            useCORS: true           // Si hay imágenes externas
        });

        // Convertir canvas a blob
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));

        // Usar Web Share API si está disponible (móvil/escritorio)
        if (navigator.share && blob) {
            const file = new File([blob], 'grid.png', { type: 'image/png' });
            await navigator.share({
                title: 'Mi resultado en Immaculate Grid Cuba',
                text: 'Completa la cuadrícula con jugadores del béisbol cubano',
                files: [file]
            });
        } else {
            // Fallback: descargar imagen
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'immaculate_grid_cuba.png';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            alert('Imagen descargada. ¡Compártela en tus redes!');
        }
    } catch (err) {
        console.error('Error al generar imagen:', err);
        alert('No se pudo generar la imagen. Intenta de nuevo.');
    } finally {
        shareButton.innerHTML = originalBtnText;
        shareButton.disabled = false;
    }
}

if (shareButton) {
    shareButton.addEventListener('click', shareGrid);
}

document.addEventListener('DOMContentLoaded', () => {
    loadNewGrid();
    showModal();
});

// Obtener la fecha actual en formato YYYY-MM-DD
function getTodayKey() {
    const today = new Date();
    return today.toISOString().slice(0, 10);
}

// Guardar estado actual en localStorage
function saveGameState() {
    if (!currentGrid) return;
    const state = {
        date: getTodayKey(),
        grid: {
            rows: currentGrid.rows,
            cols: currentGrid.cols,
            achievement: currentGrid.achievement
        },
        cells: cells,          // array de 9 strings (null o nombre del jugador)
        cellsEmojis: cellsEmojis,
        score: score,
        surrendered: !gameActive,   // si gameActive es false, significa rendido
        isDevelopment: isDevelopment  // para saber si estamos en modo dev
    };
    localStorage.setItem('baseball_grid_state', JSON.stringify(state));
}

// Cargar estado desde localStorage (solo si coincide con la fecha actual)
function loadGameState() {
    const saved = localStorage.getItem('baseball_grid_state');
    if (!saved) return null;
    const state = JSON.parse(saved);
    // Validar que sea del día de hoy y que el modo (dev/prod) coincida
    if (state.date !== getTodayKey()) return null;
    if (state.isDevelopment !== isDevelopment) return null;
    return state;
}

// Limpiar estado (cuando se inicia un nuevo juego en modo dev)
function clearGameState() {
    localStorage.removeItem('baseball_grid_state');
}