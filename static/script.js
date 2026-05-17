// Estado del juego
let currentGrid = null;      // { rows: [], cols: [], achievement: string }
let cells = Array(9).fill(null);
let score = 0;
let selectedRow = null, selectedCol = null;

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
        score = 0;
        updateScore();
        renderGrid();
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
                cell.innerHTML = `<div class="player-name">${filledName}</div><div class="check-mark">✓</div>`;
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
            suggestionsList.innerHTML = names.map(name => `<li data-name="${name}">${name}</li>`).join('');
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
                isAchievementCol: isAchievementCol
            })
        });
        const result = await response.json();

        if (result.valid) {
            cells[idx] = result.name;
            score++;
            updateScore();
            renderGrid();
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
    loadNewGrid();
    hideControlPanel();
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